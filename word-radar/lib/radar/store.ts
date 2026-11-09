import { env } from 'cloudflare:workers';
import { keywordKey } from './scoring';
import { caseKeywords, defaultSources } from './seed';
import type { Keyword, Source, ScanRun } from './types';
export function db() { if(!env.DB) throw new Error('数据库未连接');return env.DB; }
export async function initialize() {
  const d=db();
  await d.batch([...caseKeywords().map(k=>d.prepare('INSERT OR IGNORE INTO radar_records (id,dedupe,payload,updated_at) VALUES (?,?,?,?)').bind(k.id,keywordKey(k.keyword,k.market),JSON.stringify(k),k.updatedAt)),...defaultSources.map(s=>d.prepare('INSERT OR IGNORE INTO radar_sources (id,payload) VALUES (?,?)').bind(s.id,JSON.stringify(s)))]);
}
export async function state() {
  await initialize();const d=db();
  const [records,sources,runs]=await Promise.all([d.prepare('SELECT payload FROM radar_records ORDER BY updated_at DESC LIMIT 3000').all<{payload:string}>(),d.prepare('SELECT payload FROM radar_sources').all<{payload:string}>(),d.prepare('SELECT payload FROM radar_runs ORDER BY created_at DESC LIMIT 50').all<{payload:string}>()]);
  return {keywords:records.results.map(x=>JSON.parse(x.payload) as Keyword),sources:sources.results.map(x=>JSON.parse(x.payload) as Source).filter(Boolean),runs:runs.results.map(x=>JSON.parse(x.payload) as ScanRun)};
}
export async function getKeyword(id:string):Promise<Keyword|null> {const r=await db().prepare('SELECT payload FROM radar_records WHERE id=?').bind(id).first<{payload:string}>();return r?JSON.parse(r.payload):null;}
// 全量状态用于备份导出：不受界面加载上限约束，包含 Sitemap 基线快照。
export async function fullState() {
  await initialize();const d=db();
  const [records,sourceRows,runs]=await Promise.all([d.prepare('SELECT payload FROM radar_records ORDER BY updated_at DESC').all<{payload:string}>(),d.prepare('SELECT payload,snapshot FROM radar_sources').all<{payload:string;snapshot:string|null}>(),d.prepare('SELECT payload FROM radar_runs ORDER BY created_at DESC').all<{payload:string}>()]);
  const snapshots:Record<string,string[]>={};for(const row of sourceRows.results){if(row.snapshot){try{snapshots[(JSON.parse(row.payload) as Source).id]=JSON.parse(row.snapshot) as string[];}catch{}}}
  return {keywords:records.results.map(x=>JSON.parse(x.payload) as Keyword),sources:sourceRows.results.map(x=>JSON.parse(x.payload) as Source).filter(Boolean),runs:runs.results.map(x=>JSON.parse(x.payload) as ScanRun),snapshots};
}
// 恢复数据源：只新增，不覆盖已有配置；新 Sitemap 源可一并恢复基线快照。
export async function addSource(s:Source,snapshot:string[]|null) {const r=await db().prepare('INSERT INTO radar_sources (id,payload,snapshot) VALUES (?,?,?) ON CONFLICT(id) DO NOTHING').bind(s.id,JSON.stringify(s),snapshot?JSON.stringify(snapshot):null).run();return r.meta.changes>0;}
export async function saveKeyword(k:Keyword) {k.updatedAt=new Date().toISOString();await db().prepare('UPDATE radar_records SET payload=?,updated_at=? WHERE id=?').bind(JSON.stringify(k),k.updatedAt,k.id).run();}
export async function addKeywords(keywords:Keyword[]) {
  let added=0;
  for(const k of keywords) {
    const r=await db().prepare('INSERT OR IGNORE INTO radar_records (id,dedupe,payload,updated_at) VALUES (?,?,?,?)').bind(k.id,keywordKey(k.keyword,k.market),JSON.stringify(k),k.updatedAt).run();
    if(r.meta.changes)added++;else {const row=await db().prepare('SELECT payload FROM radar_records WHERE dedupe=?').bind(keywordKey(k.keyword,k.market)).first<{payload:string}>();if(row){const existing=JSON.parse(row.payload) as Keyword;const urls=new Set(existing.evidence.map(e=>e.url));const additions=k.evidence.filter(e=>!urls.has(e.url));if(additions.length){existing.evidence=[...existing.evidence,...additions].slice(-30);await saveKeyword(existing);}}}
  }return added;
}
export async function saveSource(s:Source) {await db().prepare('INSERT INTO radar_sources (id,payload) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').bind(s.id,JSON.stringify(s)).run();}
export async function getSource(id:string) {const r=await db().prepare('SELECT payload,snapshot,locked_until FROM radar_sources WHERE id=?').bind(id).first<{payload:string;snapshot:string|null;locked_until:number}>();return r?{source:JSON.parse(r.payload) as Source,snapshot:r.snapshot?JSON.parse(r.snapshot) as string[]:null,lockedUntil:r.locked_until}:null;}
export async function acquireSource(id:string) {const now=Date.now();const r=await db().prepare('UPDATE radar_sources SET locked_until=? WHERE id=? AND locked_until<?').bind(now+120000,id,now).run();return r.meta.changes>0;}
export async function saveRun(run:ScanRun) {await db().prepare('INSERT INTO radar_runs (id,payload,created_at) VALUES (?,?,?)').bind(run.id,JSON.stringify(run),run.startedAt).run();}

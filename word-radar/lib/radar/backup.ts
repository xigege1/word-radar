import { z } from 'zod';
import { safeHttpUrl } from './scoring.ts';
import type { Keyword, ScanRun, Source } from './types.ts';

// 备份与恢复：全量研究数据的结构、校验与净化。
// 恢复合并原则与 CSV 导入一致：已有词条保留当前研究结论，只补充缺失证据；
// 数据源只新增不覆盖，避免覆盖正在运行或已修改的配置。
const markets = ['US', 'GLOBAL', 'GB', 'CA', 'AU', 'IN', 'CN', 'JP'] as const;
const trendPoint = z.object({ date: z.string().max(40), value: z.number().min(0), anchor: z.number().min(0).optional() });
const evidenceIn = z.object({ label: z.string().max(200), url: z.string().max(2000), excerpt: z.string().max(200), date: z.string().max(40), kind: z.enum(['observed', 'reported', 'manual']) });
const serpIn = z.object({ position: z.number().int().min(1).max(50), title: z.string().max(300), url: z.string().max(2000), snippet: z.string().max(400) });
const reviewIn = z.object({ intent: z.boolean().nullable(), gap: z.boolean().nullable(), monetization: z.boolean().nullable(), feasible: z.boolean().nullable(), rights: z.boolean().nullable() });
const keywordIn = z.object({
  id: z.string().min(1).max(100), keyword: z.string().trim().min(2).max(120), description: z.string().max(1000).default(''),
  category: z.enum(['tool', 'ai', 'game', 'seasonal', 'content']), status: z.enum(['new', 'validating', 'watching', 'approved', 'rejected', 'launched']),
  market: z.enum(markets), origin: z.enum(['live', 'case', 'import', 'manual']), source: z.string().max(200).default('备份恢复'),
  firstSeen: z.string().max(40), updatedAt: z.string().max(40),
  volume: z.number().min(0).max(1e12).nullable().default(null), kd: z.number().min(0).max(100).nullable().default(null), cpc: z.number().min(0).max(1e6).nullable().default(null),
  volumeDate: z.string().max(40).optional(), volumeSource: z.string().max(200).optional(),
  trend: z.array(trendPoint).max(400).default([]), trend90: z.array(trendPoint).max(400).default([]), trend5y: z.array(trendPoint).max(600).default([]),
  trendLabel: z.string().max(60).default('待验证'), related: z.array(z.string().max(120)).max(20).default([]), risks: z.array(z.string().max(300)).max(20).default([]),
  monetization: z.string().max(1000).default('待验证'), notes: z.string().max(10000).default(''),
  evidence: z.array(evidenceIn).max(30).default([]), review: reviewIn.default({ intent: null, gap: null, monetization: null, feasible: null, rights: null }), serp: z.array(serpIn).max(10).default([]),
  verificationDate: z.string().max(40).optional(),
});
const sourceIn = z.object({
  id: z.string().min(1).max(80), type: z.enum(['hackernews', 'huggingface', 'sitemap', 'trends', 'x', 'semrush']),
  name: z.string().trim().min(1).max(80), target: z.string().max(2000), enabled: z.boolean(), market: z.enum(markets),
  lastRun: z.string().max(40).optional(), lastStatus: z.enum(['success', 'error', 'partial']).optional(), lastMessage: z.string().max(500).optional(),
});
const backupIn = z.object({
  app: z.literal('word-radar'), version: z.number().int().min(1),
  keywords: z.array(keywordIn).max(3000), sources: z.array(sourceIn).max(20),
  runs: z.array(z.unknown()).max(1000).optional(), snapshots: z.record(z.string().max(80), z.array(z.string().max(2000)).max(3000)).optional(),
}).passthrough();

export type Backup = { app: 'word-radar'; version: 1; exportedAt: string; keywords: Keyword[]; sources: Source[]; runs: ScanRun[]; snapshots: Record<string, string[]> };
export function buildBackup(keywords: Keyword[], sources: Source[], runs: ScanRun[], snapshots: Record<string, string[]> = {}): Backup {
  return { app: 'word-radar', version: 1, exportedAt: new Date().toISOString(), keywords, sources, runs, snapshots };
}
export function parseBackup(data: unknown): { keywords: Keyword[]; sources: Source[]; snapshots: Record<string, string[]> } {
  const raw = backupIn.parse(data);
  const keywords: Keyword[] = raw.keywords.map(k => ({
    ...k,
    evidence: k.evidence.map(e => ({ ...e, url: safeHttpUrl(e.url) })).filter(e => e.url).slice(-30),
    serp: k.serp.map(r => ({ ...r, url: safeHttpUrl(r.url) })).filter(r => r.url),
  }));
  return { keywords, sources: raw.sources, snapshots: raw.snapshots ?? {} };
}

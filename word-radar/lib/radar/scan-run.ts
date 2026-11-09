import { getSource, acquireSource, saveSource, saveRun, addKeywords, db } from './store';
import { scanSource } from './providers';
import type { Keys, ScanRun } from './types';

// 可复用的单源扫描执行：供 /api/scan 路由与定时/自动扫描共用。
// 自动化路径（worker scheduled / 页面打开时）只允许免费公开源，
// 绝不带密钥调用付费接口。
export const autoTypes: ReadonlyArray<'hackernews' | 'huggingface' | 'sitemap'> = ['hackernews', 'huggingface', 'sitemap'];
export function isAutoType(type: string): boolean { return (autoTypes as readonly string[]).includes(type); }
export async function runScan(sourceId: string, keys: Keys, skipCooldown = false): Promise<ScanRun> {
  const entry = await getSource(sourceId);
  if (!entry) throw new Error('找不到数据源');
  if (!entry.source.enabled) throw new Error('请先启用此数据源');
  if (!skipCooldown && entry.source.lastRun && Date.now() - Date.parse(entry.source.lastRun) < 60000) throw new Error('每个源一分钟内只能扫描一次');
  if (!await acquireSource(sourceId)) throw new Error('该源已有扫描任务在运行');
  const { source, snapshot } = entry;
  const run: ScanRun = { id: crypto.randomUUID(), sourceId: source.id, source: source.name, startedAt: new Date().toISOString(), finishedAt: '', status: 'success', found: 0, added: 0, message: '' };
  try {
    const result = await scanSource(source, keys, snapshot);
    run.found = result.keywords.length;
    run.added = await addKeywords(result.keywords);
    run.message = result.message;
    run.status = result.partial ? 'partial' : 'success';
    if (result.snapshot) await db().prepare('UPDATE radar_sources SET snapshot=? WHERE id=?').bind(JSON.stringify(result.snapshot), source.id).run();
  } catch (e) { run.status = 'error'; run.message = e instanceof Error ? e.message : '扫描失败'; }
  finally {
    run.finishedAt = new Date().toISOString();
    source.lastRun = run.finishedAt; source.lastStatus = run.status; source.lastMessage = run.message;
    try { await saveSource(source); await saveRun(run); }
    finally { await db().prepare('UPDATE radar_sources SET locked_until=0 WHERE id=?').bind(source.id).run(); }
  }
  return run;
}

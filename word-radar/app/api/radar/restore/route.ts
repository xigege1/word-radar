import { z } from 'zod';
import { authorize, readBody, json, failure } from '@/lib/radar/http';
import { addKeywords, addSource, db } from '@/lib/radar/store';
import { parseBackup } from '@/lib/radar/backup';
export const dynamic='force-dynamic';
// 恢复备份：合并而非覆盖。已有词条保留当前研究结论，仅补充缺失证据；
// 数据源只新增不覆盖（含 20 个源上限）；扫描日志属于执行记录，不随备份恢复。
export async function POST(request:Request) {
  try {
    await authorize(request);
    const b=await readBody(request,6000000);
    const parsed=parseBackup(b.backup??b);
    const count=await db().prepare('SELECT COUNT(*) as n FROM radar_sources').first<{n:number}>();
    let capacity=20-(count?.n||0),sourcesAdded=0,sourcesSkipped=0;
    for(const source of parsed.sources) {
      if(capacity<=0){sourcesSkipped++;continue;}
      if(await addSource(source,parsed.snapshots[source.id]??null)){sourcesAdded++;capacity--;}else sourcesSkipped++;
    }
    const added=await addKeywords(parsed.keywords);
    return json({added,duplicates:parsed.keywords.length-added,sourcesAdded,sourcesSkipped,runsIgnored:true});
  }catch(e){if(e instanceof z.ZodError)return json({error:'备份文件格式不正确：'+e.issues.map(x=>x.path.join('.')+' '+x.message).join('；')},400);return failure(e);}
}

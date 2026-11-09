import { z } from 'zod';
import { authorize,readBody,keysFrom,json,failure } from '@/lib/radar/http';
import { getKeyword,saveKeyword,db } from '@/lib/radar/store';
import { verifyKeyword,compareTrends } from '@/lib/radar/providers';
import type { Keyword } from '@/lib/radar/types';
export const dynamic='force-dynamic';
export async function POST(request:Request) {
  try {
    await authorize(request);
    const b=await readBody(request);
    const key=keysFrom(b).serpapi;
    if(!key)throw new Error(b.action==='compare'?'趋势对比需要 SerpApi 密钥。':'请在数据源页面填写 SerpApi 密钥。一次验证最多使用 4 次查询。');
    // 多关键词同图对比：单词条各自验证过的趋势来自不同查询，0–100 不可跨查询比较；
    // 只有把词放进同一查询，才是可比的同图数据。对比结果不落库，按需重新获取。
    if(b.action==='compare') {
      const input=z.object({ids:z.array(z.string().max(100)).min(2).max(5),date:z.enum(['7','90','5y']).default('7')}).parse({ids:b.ids,date:b.date});
      const list:Keyword[]=[];
      for(const id of input.ids){const k=await getKeyword(id);if(k)list.push(k);}
      if(list.length<2)throw new Error('至少需要两个有效词条');
      const market=list[0].market;
      if(list.some(k=>k.market!==market))throw new Error('请选择同一市场的词条进行对比');
      const now=Date.now();
      const lock=await db().prepare("INSERT INTO radar_locks (id,expires) VALUES ('verify',?) ON CONFLICT(id) DO UPDATE SET expires=excluded.expires WHERE radar_locks.expires<?").bind(now+120000,now).run();
      if(!lock.meta.changes)throw new Error('已有关键词正在验证，请等待完成');
      try {
        const series=await compareTrends(list.map(k=>k.keyword),market,input.date==='90'?'today 3-m':input.date==='5y'?'today 5-y':'now 7-d',key);
        return json({series,market,date:input.date,queries:1});
      }finally{await db().prepare("DELETE FROM radar_locks WHERE id='verify'").run();}
    }
    if(typeof b.id!=='string')throw new Error('缺少关键词');
    const k=await getKeyword(b.id);
    if(!k)throw new Error('词条不存在');
    if(k.verificationDate&&Date.now()-Date.parse(k.verificationDate)<60000)throw new Error('该词刚刚验证，请一分钟后再试');
    const now=Date.now();
    const lock=await db().prepare("INSERT INTO radar_locks (id,expires) VALUES ('verify',?) ON CONFLICT(id) DO UPDATE SET expires=excluded.expires WHERE radar_locks.expires<?").bind(now+120000,now).run();
    if(!lock.meta.changes)throw new Error('已有关键词正在验证，请等待完成');
    try {
      const result=await verifyKeyword(k,key);
      if(result.errors.length===4)return json({error:result.errors.join('；')},502);
      // Preserve any human edits made while the external APIs were running.
      const latest=await getKeyword(k.id);
      if(latest&&latest.updatedAt!==k.updatedAt){
        const v=result.keyword;
        result.keyword={...latest,trend:v.trend,trend90:v.trend90,trend5y:v.trend5y,serp:v.serp,trendLabel:v.trendLabel,verificationDate:v.verificationDate,evidence:[...latest.evidence,...v.evidence.filter(e=>!latest.evidence.some(x=>x.url===e.url))].slice(-30)};
      }
      await saveKeyword(result.keyword);
      return json(result);
    }finally{await db().prepare("DELETE FROM radar_locks WHERE id='verify'").run();}
  }catch(e){if(e instanceof z.ZodError)return json({error:'输入格式不正确：'+e.issues.map(x=>x.path.join('.')+' '+x.message).join('；')},400);return failure(e);}
}

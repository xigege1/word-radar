import { getChatGPTUser } from '@/app/chatgpt-auth';
import { env } from 'cloudflare:workers';
import type { Keys } from './types';
export async function authorize(request:Request) {
  const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)throw new Error('不允许跨站请求');
  const user=await getChatGPTUser();const host=new URL(request.url).hostname;
  if(!user&&!(import.meta.env.DEV&&['localhost','127.0.0.1','::1','[::1]'].includes(host)))throw new Error('请先登录后使用雷达');
}
export async function readBody(request:Request,maxBytes=1500000) {
  if(Number(request.headers.get('content-length')||0)>maxBytes)throw new Error('提交内容过大');
  const reader=request.body?.getReader();if(!reader)throw new Error('请求内容为空');let size=0;let text='';const decoder=new TextDecoder();
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>maxBytes)throw new Error('提交内容过大');text+=decoder.decode(value,{stream:true});}}finally{await reader.cancel().catch(()=>{});}text+=decoder.decode();return JSON.parse(text);
}
export function keysFrom(body:Record<string,any>):Keys {
  const values=env as unknown as Record<string,string|undefined>;
  const key=(v:unknown,fallback:string|undefined)=>typeof v==='string'&&v.trim()?v.trim().slice(0,4096):fallback;
  return {serpapi:key(body.keys?.serpapi,values.SERPAPI_API_KEY),x:key(body.keys?.x,values.X_BEARER_TOKEN),semrush:key(body.keys?.semrush,values.SEMRUSH_API_KEY)};
}
export function keyStatus(){const e=env as unknown as Record<string,string|undefined>;return {serpapi:!!e.SERPAPI_API_KEY,x:!!e.X_BEARER_TOKEN,semrush:!!e.SEMRUSH_API_KEY};}
export function json(data:unknown,status=200) {return Response.json(data,{status,headers:{'Cache-Control':'no-store'}});}
export function failure(e:unknown) {const msg=e instanceof Error?e.message:'请求失败';if(/D1_|SQLITE|no such table/i.test(msg))return json({error:'数据库尚未就绪，请运行本地数据库迁移或检查部署状态。'},503);return json({error:msg},msg.includes('登录')?401:400);}

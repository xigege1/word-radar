import { newKeyword, type Keyword, type Keys, type Source, type TrendPoint } from './types.ts';
import { parseCSV, safeHttpUrl, trendStats } from './scoring.ts';

export function publicUrl(input:string) {
  const u=new URL(input);const h=u.hostname.toLowerCase();
  if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443')||!h.includes('.')||/^[\d.]+$/.test(h)||h.includes(':')||/(^|\.)(localhost|local|internal|test|invalid)$/.test(h)||h.endsWith('.localhost')||h.endsWith('.local')||h.endsWith('.internal'))throw new Error('请填写公开网站的 HTTPS 地址');
  return u;
}
async function fetchText(url:string,headers:Record<string,string>={},maxBytes=2000000) {
  publicUrl(url);
  let response:Response;
  try{response=await fetch(url,{headers:{'User-Agent':'WordRadar/1.0 (keyword research)',...headers},redirect:'manual',signal:AbortSignal.timeout(18000)});}catch{throw new Error('数据源连接失败或超时，请稍后重试。');}
  if(response.status>=300&&response.status<400)throw new Error('数据源发生重定向，请改用最终的公开 HTTPS 地址');
  if(!response.ok)throw new Error(response.status===429?'数据源限流（429），请稍后重试。':response.status===401||response.status===403?'数据源拒绝访问，请检查 API 密钥及套餐权限。':`数据源返回 HTTP ${response.status}`);
  const reader=response.body?.getReader();if(!reader)throw new Error('数据源没有返回内容');let size=0;const parts:Uint8Array[]=[];
  try {for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>maxBytes)throw new Error('响应超过安全读取上限，请缩小数据范围');parts.push(value);}}finally{await reader.cancel().catch(()=>{});}
  const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}return new TextDecoder().decode(bytes);
}
async function fetchJSON(url:string,headers:Record<string,string>={}) {try{return JSON.parse(await fetchText(url,headers));}catch(e){if(e instanceof SyntaxError)throw new Error('数据源未返回有效 JSON');throw e;}}
function evidence(k:Keyword,label:string,url:string,excerpt:string,date=new Date().toISOString()) {if(safeHttpUrl(url))k.evidence.push({label,url,excerpt:excerpt.slice(0,200),date,kind:'observed'});return k;}
function candidate(word:string,s:Source) {const k=newKeyword(word,s.market);k.source=s.name;k.origin='live';return k;}
function inferredCategory(word:string):Keyword['category'] {return /codes|tier list|roblox|game|simulator/i.test(word)?'game':/christmas|santa|halloween|valentine/i.test(word)?'seasonal':/model|ai\b|llm/i.test(word)?'ai':'tool';}
function locateRisk(k:Keyword) {if(k.category==='ai')k.risks.push('可能为模型或品牌名称；先验证通用任务词');return k;}
export async function scanSource(s:Source,keys:Keys,previous:string[]|null):Promise<{keywords:Keyword[];snapshot?:string[];message:string;partial?:boolean}> {
  if(s.type==='hackernews') {
    const url=new URL('https://hn.algolia.com/api/v1/search_by_date');url.search=new URLSearchParams({tags:'story',query:s.target||'Show HN',hitsPerPage:'25',numericFilters:`created_at_i>${Math.floor(Date.now()/1000)-30*86400}`}).toString();
    const result=await fetchJSON(url.href);if(!Array.isArray(result.hits))throw new Error('Hacker News 返回结构不符');
    const keywords:Keyword[]=result.hits.filter((h:any)=>h.title).map((h:any)=>{const k=candidate(h.title.replace(/^Show HN:\s*/i,'').slice(0,120),s);k.description='来自最近 30 天的产品发布标题。标题仅为候选线索，需要归一为真实搜索词。';k.category=inferredCategory(k.keyword);k.risks=['产品标题待提炼为用户搜索词'];return evidence(k,'Hacker News · 产品发布',`https://news.ycombinator.com/item?id=${h.objectID}`,String(h.title),h.created_at);});
    return {keywords,message:`读取 ${keywords.length} 条近期发布；尚未验证 Google 搜索需求。`};
  }
  if(s.type==='huggingface') {
    const params=new URLSearchParams({sort:'createdAt',direction:'-1',limit:'25',full:'true'});if(s.target.trim())params.set('filter',s.target.trim());
    const data=await fetchJSON('https://huggingface.co/api/models?'+params);
    if(!Array.isArray(data))throw new Error('Hugging Face 返回结构不符');
    const keywords=data.filter((x:any)=>typeof x.id==='string').map((m:any)=>{const k=candidate(m.id.split('/').pop(),s);k.category='ai';k.description=`新模型线索 · ${m.pipeline_tag||'任务待识别'}。模型发布不等于搜索需求增长。`;return locateRisk(evidence(k,'Hugging Face · 模型页面','https://huggingface.co/'+m.id,`${m.id}；任务：${m.pipeline_tag||'未知'}；下载量：${m.downloads??'未知'}`,m.createdAt||new Date().toISOString()));});
    return {keywords,message:`读取 ${keywords.length} 个最新模型；下载量不会计入搜索量。`};
  }
  if(s.type==='sitemap') {
    const root=publicUrl(s.target);const seen=new Set<string>();const all:string[]=[];let requests=0;
    async function read(url:string,depth:number) {
      if(depth>2||seen.has(url))return;if(++requests>6)throw new Error('Sitemap 索引超过 6 个文件，请改用具体子 Sitemap');seen.add(url);
      const xml=await fetchText(url);if(!/<(?:[\w-]+:)?(?:urlset|sitemapindex)\b/i.test(xml))throw new Error('该地址不是有效 Sitemap XML');
      const locations=[...xml.matchAll(/<(?:[\w-]+:)?loc(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w-]+:)?loc>/gi)].map(m=>m[1].trim().replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/,'$1').replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>'));
      if(/<(?:[\w-]+:)?sitemapindex\b/i.test(xml)) {for(const location of locations){const u=publicUrl(location);if(u.origin!==root.origin)throw new Error('跨域 Sitemap 请作为独立数据源添加');await read(u.href,depth+1);}}
      else {for(const location of locations){const u=publicUrl(location);if(u.origin===root.origin)all.push(u.href);}if(all.length>3000)throw new Error('超过 3000 个 URL，请选择更小的子 Sitemap');}
    }
    await read(root.href,0);const unique=[...new Set(all)];
    if(previous===null)return {keywords:[],snapshot:unique,message:`已建立 ${unique.length} 个 URL 的基线；下次扫描只发现新增页面。`};
    const baseline=new Set(previous);const changed=unique.filter(u=>!baseline.has(u));const batch=changed.slice(0,100);
    const keywords=batch.map(url=>{const u=new URL(url);let word=u.pathname.split('/').filter(Boolean).pop()||u.hostname;try{word=decodeURIComponent(word);}catch{}word=word.replace(/\.(html?|php)$/i,'').replace(/[-_]/g,' ');const k=candidate(word.slice(0,120),s);k.category=inferredCategory(word);k.description='竞品 Sitemap 新出现的页面；首次观测时间不代表页面创建日期。';return evidence(k,'Sitemap · 新页面',url,word);});
    return {keywords,snapshot:changed.length>100?[...new Set([...previous,...batch])]:unique,partial:changed.length>100,message:`发现 ${changed.length} 个新增 URL，本次处理 ${batch.length} 个${changed.length>100?'，其余保留至下次扫描':''}。`};
  }
  if(s.type==='trends') {
    if(!keys.serpapi)throw new Error('Google Trends 需要 SerpApi 密钥；也可导入关键词 CSV。');
    const roots=s.target.split(/[,，\n]/).map(x=>x.trim()).filter(Boolean);if(!roots.length||roots.length>5)throw new Error('每个 Trends 数据源请配置 1–5 个词根');
    const keywords:Keyword[]=[];
    for(const root of roots){const data=await serp({engine:'google_trends',q:root,data_type:'RELATED_QUERIES',date:'now 7-d',geo:s.market==='GLOBAL'?'':s.market},keys.serpapi);const list=data.related_queries?.rising;if(!Array.isArray(list))continue;
      for(const item of list.slice(0,20)){if(!item.query)continue;const k=candidate(item.query,s);k.category=inferredCategory(k.keyword);k.trendLabel='上升查询 · 待复核';k.description=`词根「${root}」的上升查询，供应商标注 ${item.value??'上升'}。尚未确认新颖度或持续性。`;keywords.push(evidence(k,'Google Trends · 上升查询',trendsLink(k.keyword,k.market,'now 7-d'),k.description));}}
    return {keywords,message:`扫描 ${roots.length} 个词根，发现 ${keywords.length} 个上升查询。`};
  }
  if(s.type==='x') {
    if(!keys.x)throw new Error('X 监控需要具有 recent search 权限的 Bearer Token。');
    const params=new URLSearchParams({query:s.target,max_results:'20','tweet.fields':'created_at,public_metrics,entities'});
    const data=await fetchJSON('https://api.x.com/2/tweets/search/recent?'+params,{Authorization:'Bearer '+keys.x});if(data.errors?.length&&!data.data)throw new Error('X 查询未成功，请检查查询语法和套餐权限');
    const keywords:Keyword[]=(data.data||[]).map((p:any)=>{const first=String(p.text).split('\n').find((v:string)=>v.trim())||'X 帖子';const k=candidate(first.replace(/https?:\/\/\S+/g,'').trim().slice(0,120)||'X 产品线索 '+p.id,s);k.description=String(p.text).slice(0,200);k.risks=['社交讨论需提炼搜索词，互动不等于搜索量'];return evidence(k,'X · 原帖',`https://x.com/i/status/${p.id}`,k.description,p.created_at);});return {keywords,message:`读取 ${keywords.length} 条帖子，需人工提炼搜索意图。`};
  }
  if(s.type==='semrush') {
    if(!keys.semrush)throw new Error('Semrush 需要 API 密钥与 API units；网页订阅可能不含 API。');
    if(s.market==='GLOBAL')throw new Error('Semrush 域名 API 使用国家数据库，请选择 US、GB 等具体市场，不能标记为全球搜索量。');
    const domain=s.target.trim().replace(/^https?:\/\//,'').split('/')[0];if(!/^[a-z\d.-]+\.[a-z]{2,}$/i.test(domain))throw new Error('请输入竞品域名');
    const params=new URLSearchParams({type:'domain_organic',key:keys.semrush,domain,database:s.market==='GLOBAL'?'us':s.market.toLowerCase(),display_limit:'30',export_columns:'Ph,Po,Nq,Cp,Ur',display_sort:'tr_desc'});
    const raw=await fetchText('https://api.semrush.com/?'+params);if(raw.startsWith('ERROR'))throw new Error('Semrush 未返回数据，请核查 API units、市场与域名');const rows=parseCSV(raw).slice(1);
    const keywords=rows.filter(r=>r[0]&&!r[0].toLowerCase().includes(domain.split('.')[0])).map(r=>{const k=candidate(r[0],s);k.volume=number(r[2]);k.cpc=number(r[3]);k.volumeDate=new Date().toISOString();k.volumeSource='Semrush / '+s.market;k.description=`来自 ${domain} 的非品牌自然排名词（品牌过滤为初筛）。`;return evidence(k,'Semrush · 竞品排名',safeHttpUrl(r[4])||'https://'+domain,`关键词 ${k.keyword}，排名 ${r[1]}；月搜索量 ${r[2]}（估计）。`);});return {keywords,message:`取得 ${keywords.length} 个竞品词，品牌变体仍需人工复核。`};
  }
  throw new Error('不支持的数据源');
}
export function number(value:unknown) {if(value===null||value===undefined||String(value).trim()==='')return null;let s=String(value).trim().replace(/[,$\s]/g,'');let m=1;if(/k$/i.test(s)){m=1000;s=s.slice(0,-1);}else if(/m$/i.test(s)){m=1000000;s=s.slice(0,-1);}const n=Number(s)*m;return Number.isFinite(n)&&n>=0?n:null;}
export function trendsLink(keyword:string,market:string,date='today 3-m') {return 'https://trends.google.com/trends/explore?'+new URLSearchParams({q:keyword+',GPTs',geo:market==='GLOBAL'?'':market,date});}
async function serp(params:Record<string,string>,key:string) {const data=await fetchJSON('https://serpapi.com/search.json?'+new URLSearchParams({...params,api_key:key}));if(data.error)throw new Error('SerpApi 未返回数据，请检查配额与查询参数');return data;}
// 多关键词同图对比：一次 Google Trends 查询放入最多 5 个词，
// 返回值序列在同一查询内可比；不与单词条的历史查询结果混用。
export async function compareTrends(keywords:string[],market:string,date:string,key:string) {
  if(keywords.length<2||keywords.length>5)throw new Error('一次对比 2–5 个关键词');
  const geo=market==='GLOBAL'?'':market;
  const data=await serp({engine:'google_trends',q:keywords.join(','),data_type:'TIMESERIES',geo,date},key);
  const timeline=data.interest_over_time?.timeline_data;
  if(!Array.isArray(timeline)||!timeline.length)throw new Error('没有可用时间序列');
  const rows=timeline as unknown as {partial?:boolean;date?:unknown;values?:{extracted_value?:unknown}[]}[];
  const series=keywords.map((keyword,i)=>({keyword,points:rows.filter(p=>!p.partial&&typeof p.values?.[i]?.extracted_value==='number').map(p=>({date:String(p.date),value:p.values![i]!.extracted_value as number})).filter((p:{value:number})=>Number.isFinite(p.value))}));
  if(series.some(s=>s.points.length<2))throw new Error('部分词条没有足够数据，请更换词条或时间范围');
  return series;
}
export async function verifyKeyword(k:Keyword,key:string) {
  const geo=k.market==='GLOBAL'?'':k.market;
  const calls=[{name:'7 天趋势',date:'now 7-d',field:'trend'},{name:'90 天趋势',date:'today 3-m',field:'trend90'},{name:'5 年趋势',date:'today 5-y',field:'trend5y'}];const errors:string[]=[];
  for(const call of calls){
    try{
      const d=await serp({engine:'google_trends',q:k.keyword+',GPTs',data_type:'TIMESERIES',geo,date:call.date},key);
      const timeline=d.interest_over_time?.timeline_data;
      if(!Array.isArray(timeline)||!timeline.length)throw new Error('没有可用时间序列');
      const points:TrendPoint[]=timeline.filter((p:any)=>!p.partial&&typeof p.values?.[0]?.extracted_value==='number').map((p:any)=>({date:String(p.date),value:p.values[0].extracted_value,...(typeof p.values?.[1]?.extracted_value==='number'?{anchor:p.values[1].extracted_value}:{})})).filter(p=>Number.isFinite(p.value));
      if(points.length<2)throw new Error('没有足够的完整时间点');
      if(call.field==='trend')k.trend=points;else if(call.field==='trend90')k.trend90=points;else k.trend5y=points;
      const url=trendsLink(k.keyword,k.market,call.date);k.evidence=k.evidence.filter(e=>e.url!==url);
      evidence(k,'Google Trends · '+call.name,url,'同一图表对比 GPTs；指数为相对热度，不是绝对搜索量。');
    }catch(e){errors.push(call.name+'：'+(e as Error).message);}
  }
  try {const data=await serp({engine:'google',q:k.keyword,gl:geo?geo.toLowerCase():'us',hl:'en',num:'10'},key);if(!Array.isArray(data.organic_results))throw new Error('没有返回自然搜索结果');k.serp=data.organic_results.slice(0,10).map((r:any)=>({position:r.position,title:String(r.title||''),url:safeHttpUrl(r.link)||'',snippet:String(r.snippet||'')}));evidence(k,'Google · 前十名快照','https://www.google.com/search?'+new URLSearchParams({q:k.keyword,gl:geo||'us'}),'目标市场 '+(geo||'US（全球词的 SERP 使用美国）')+'；请人工检查需求承接与竞品强度。');}catch(e){errors.push('SERP：'+(e as Error).message);}
  const t=trendStats(k.trend);if(t)k.trendLabel=t.rising?'近期上升':t.cooling?'峰值后回落':'近期平稳';if(errors.length<4){k.verificationDate=new Date().toISOString();if(k.status==='new')k.status='validating';}k.evidence=k.evidence.slice(-30);return {keyword:k,errors};
}

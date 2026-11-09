import type { Keyword, TrendPoint } from './types.ts';

const average = (values:number[]) => values.length ? values.reduce((a,b)=>a+b,0)/values.length : 0;
export function trendStats(points:TrendPoint[]) {
  if(points.length<4) return null;
  const size=Math.max(1,Math.floor(points.length/3));
  const before=average(points.slice(0,size).map(x=>x.value));
  const after=average(points.slice(-size).map(x=>x.value));
  const peak=Math.max(...points.map(x=>x.value));
  return {growth:before>1?Math.round((after-before)/before*100):null, rising:after>before*1.15&&after>2, cooling:peak>0&&after<peak*.4, before,after,peak};
}
export function scoreKeyword(k:Keyword) {
  const t=trendStats(k.trend);
  const dimensions:[string,number,number|null,string][]=[
    ['搜索需求',25,k.volume===null?null:Math.min(100,Math.max(0,Math.log10(k.volume+1)*24)),k.volume===null?'尚无月搜索量数据':'月搜索量为供应商估计值'],
    ['趋势表现',20,t?(t.rising?90:t.cooling?20:60):null,t?'按同一次查询的时间序列计算':'尚无可比较的时间序列'],
    ['竞争空位',20,k.review.gap!==null?(k.review.gap?85:15):k.kd===null?null:100-k.kd,k.review.gap!==null?'来自人工 SERP 复核':k.kd!==null?'仅依据 KD，仍需检查前十名':'等待 Google 前十名复核'],
    ['需求与付费',25,k.review.intent!==null&&k.review.monetization!==null?((k.review.intent?40:0)+(k.review.monetization?60:0)):null,'是否明确用户任务与变现路径'],
    ['交付可行性',10,k.review.feasible===null?null:k.review.feasible?90:10,'能否在可接受的成本内交付'],
  ];
  const coverage=dimensions.reduce((n,[,w,s])=>n+(s===null?0:w),0);
  const score=coverage?Math.round(dimensions.reduce((n,[,w,s])=>n+w*(s??0)/100,0)):null;
  const blocked=k.review.rights===false;
  const stale=k.origin==='case'||(k.verificationDate?Date.now()-Date.parse(k.verificationDate)>7*86400000:false);
  const recommendation=blocked?'暂停研究':stale?'需更新证据':coverage<70?'待补证据':(score??0)>=75&&k.review.rights===true?'优先验证':(score??0)>=50?'持续观察':'谨慎评估';
  return {score,coverage,blocked,stale,recommendation,dimensions:dimensions.map(([name,weight,value,reason])=>({name,weight,value,reason}))};
}
export function keywordKey(keyword:string,market:string) {return keyword.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase()+'::'+market.toUpperCase();}
export function safeHttpUrl(value:string) {try {const u=new URL(value);return /^https?:$/.test(u.protocol)?u.href:'';}catch{return '';}}
export function csvEscape(value:unknown) {let s=String(value??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
export function exportKeywords(rows:Keyword[]) {
  const headers=['keyword','market','category','status','volume','kd','cpc','source','origin','first_seen','notes'];
  return '\uFEFF'+[headers.map(csvEscape).join(','),...rows.map(k=>[k.keyword,k.market,k.category,k.status,k.volume,k.kd,k.cpc,k.source,k.origin,k.firstSeen,k.notes].map(csvEscape).join(','))].join('\r\n');
}
export function parseCSV(text:string) {
  const rows:string[][]=[];let row:string[]=[];let cell='';let quoted=false;
  text=text.replace(/^\uFEFF/,'');
  const counts=[',',';','\t'].map(c=>({c,n:(text.split(/\r?\n/)[0].match(new RegExp(c,'g'))||[]).length}));
  const delimiter=counts.sort((a,b)=>b.n-a.n)[0].c;
  for(let i=0;i<text.length;i++) {const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===delimiter&&!quoted){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell='';}else cell+=c;}
  if(quoted)throw new Error('CSV 的引号未闭合');row.push(cell);if(row.some(x=>x.trim()))rows.push(row);return rows;
}

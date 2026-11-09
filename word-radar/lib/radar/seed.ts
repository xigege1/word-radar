import { newKeyword, type Keyword, type Source } from './types';
export function caseKeywords():Keyword[] {
  const data=[
    {keyword:'secret santa generator',category:'seasonal',description:'圣诞节礼物交换抽签工具。可从多人协作和礼物推荐切入。',trendLabel:'季节性 · 作者观察',monetization:'礼物推荐联盟佣金；需核实合作条款与转化。',date:'2026-10-22',url:'https://x.com/aiRobertDaily/status/2113211389221417334',author:'AI Robert',notes:'原帖提到每年圣诞节前上涨。8.2K 是作者报告的竞品淡季流量，不是这个词的月搜索量。',risks:['季节性需求，需提前布局']},
    {keyword:'brat generator',category:'tool',description:'风格文字图片生成器，从 Kapwing 的非品牌词中发现。',trendLabel:'平稳 · 作者观察',volume:644300,kd:49,monetization:'作者未验证收入，需调研广告或付费增值。',date:'2026-10-31',url:'https://x.com/fuyiwei2015/status/2116513963672584664',author:'吉吉',notes:'644.3K / KD49 为作者在全球口径下查到的 Semrush 历史估计。不能用竞品总访问量 × 假定转化率推算真实收入。',risks:['商标与视觉素材授权需复核','域名被注册不等于没有切入机会']},
    {keyword:'meme sounds',category:'content',description:'Meme 音效素材站，一次关于授权和变现的失败复盘。',trendLabel:'回落 · 作者观察',monetization:'原计划 AdSense，但未申请，收入为零（作者自述）。',date:'2026-10-19',url:'https://x.com/fuyiwei2015/status/2112175337316687958',author:'吉吉',notes:'过去 12 个月 GSC 为 379 次点击、8561 次展示。版权和再分发授权未逐一确认。',risks:['素材商用及再分发授权未确认']},
    {keyword:'remove background',category:'tool',description:'从成熟的图片去背景需求出发，学习竞品拆词与流量渠道分析。',trendLabel:'成熟需求',monetization:'订阅、按次收费；获客成本仍待验证。',date:'2026-10-19',url:'https://x.com/iamjianyuwu/status/2112187680012587512',author:'Jianyu Wu',notes:'作者发现 Adobe、Canva 等强站占据前排。大站的内页并不意味着竞争弱；全站流量不能等同于目标词流量。',risks:['前排强势品牌较多']},
    {keyword:'stabilize shaky video',category:'tool',description:'视频防抖任务词，适合按使用场景与输出要求继续拆分。',trendLabel:'待采集',monetization:'视频处理订阅或单次收费，需计算处理成本。',date:'2026-10-31',url:'https://x.com/fuyiwei2015/status/2116513963672584664',author:'吉吉',notes:'从直播中记录的词。作者在 Google 搜索看到 Kapwing，继而研究其非品牌关键词。',risks:[]},
    {keyword:'pokemon survivor',category:'game',description:'新游戏名称引发的搜索信号，作者因品牌风险放弃。',trendLabel:'新近起量 · 作者观察',monetization:'未验证',date:'2026-10-21',url:'https://x.com/iamjianyuwu/status/2112812159252205773',author:'Jianyu Wu',notes:'GPTs 的 4–5 倍是作者当时的相对趋势观察，不是当前搜索量。本例作为风险复盘，不作为建站推荐。',risks:['包含品牌名，避免冒充官方']},
  ];
  return data.map((d,i)=>({...newKeyword(d.keyword,'GLOBAL'),...d,id:'case-'+i,category:d.category as Keyword['category'],origin:'case',source:d.author,status:i===2||i===5?'rejected':'watching',firstSeen:d.date+'T00:00:00Z',updatedAt:d.date+'T00:00:00Z',volume:d.volume??null,kd:d.kd??null,volumeDate:d.date,volumeSource:d.volume?'原帖报告 / Semrush 全球':undefined,evidence:[{label:d.author+' · 原始复盘',url:d.url,excerpt:d.description,date:d.date,kind:'reported'}],review:{intent:true,gap:i===3?false:null,monetization:null,feasible:null,rights:null}}));
}
export const defaultSources:Source[]=[
 {id:'hn',type:'hackernews',name:'Hacker News',target:'Show HN',market:'US',enabled:true},
 {id:'hf',type:'huggingface',name:'Hugging Face',target:'text-to-image',market:'US',enabled:true},
 {id:'trends',type:'trends',name:'Google Trends',target:'generator, maker, simulator, tracker, codes',market:'US',enabled:false},
 {id:'x',type:'x',name:'X 创作者动态',target:'(from:aiRobertDaily OR from:iamjianyuwu OR from:fuyiwei2015) -is:retweet',market:'US',enabled:false},
 {id:'semrush',type:'semrush',name:'Semrush 竞品拆词',target:'kapwing.com',market:'US',enabled:false},
];

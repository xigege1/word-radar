export type Category = 'tool' | 'ai' | 'game' | 'seasonal' | 'content';
export type Status = 'new' | 'validating' | 'watching' | 'approved' | 'rejected' | 'launched';
export type SourceType = 'hackernews' | 'huggingface' | 'sitemap' | 'trends' | 'x' | 'semrush';
export type Evidence = { label: string; url: string; excerpt: string; date: string; kind: 'observed' | 'reported' | 'manual' };
export type TrendPoint = { date: string; value: number; anchor?: number };
export type Review = { intent: boolean | null; gap: boolean | null; monetization: boolean | null; feasible: boolean | null; rights: boolean | null };
export type Keyword = {
  id: string; keyword: string; description: string; category: Category; status: Status;
  market: string; origin: 'live' | 'case' | 'import' | 'manual'; source: string;
  firstSeen: string; updatedAt: string; volume: number | null; kd: number | null; cpc: number | null;
  volumeDate?: string; volumeSource?: string; trend: TrendPoint[]; trend90: TrendPoint[]; trend5y: TrendPoint[];
  trendLabel: string; related: string[]; risks: string[]; monetization: string; notes: string;
  evidence: Evidence[]; review: Review; serp: { position: number; title: string; url: string; snippet: string }[];
  verificationDate?: string;
};
export type Source = {
  id: string; type: SourceType; name: string; target: string; enabled: boolean;
  market: string; lastRun?: string; lastStatus?: 'success' | 'error' | 'partial'; lastMessage?: string;
};
export type ScanRun = { id: string; sourceId: string; source: string; startedAt: string; finishedAt: string; status: 'success' | 'partial' | 'error'; found: number; added: number; message: string };
export type Keys = { serpapi?: string; x?: string; semrush?: string };
export const categoryLabels: Record<Category, string> = { tool:'实用工具', ai:'AI 应用', game:'游戏需求', seasonal:'季节机会', content:'内容需求' };
export const statusLabels: Record<Status,string> = { new:'新发现', validating:'待验证', watching:'观察中', approved:'值得做', rejected:'已淘汰', launched:'已上线' };
export const blankReview = (): Review => ({intent:null,gap:null,monetization:null,feasible:null,rights:null});
export function newKeyword(keyword: string, market='US'): Keyword {
  const now = new Date().toISOString();
  return {id:crypto.randomUUID(),keyword:keyword.trim().replace(/\s+/g,' '),description:'等待补充搜索意图与需求证据。',category:'tool',status:'new',market,origin:'manual',source:'手动添加',firstSeen:now,updatedAt:now,volume:null,kd:null,cpc:null,trend:[],trend90:[],trend5y:[],trendLabel:'待验证',related:[],risks:[],monetization:'待验证',notes:'',evidence:[],review:blankReview(),serp:[]};
}

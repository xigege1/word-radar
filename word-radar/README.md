# 搜词雷达 · Word Radar

面向个人工具站研究的关键词工作台：发现信号 → 提炼任务词 → 验证需求 → 人工决策。采用 React / Vinext、Cloudflare Workers、D1，默认私有发布。

## 已实现

- 机会池、市场 / 分类 / 来源筛选、搜索、排序、卡片与列表视图。
- 观察清单、决策记录、研究笔记、人工验证清单与可解释评分。
- 手动添加关键词、从产品 / 帖子线索提炼独立词条，保留来源。
- CSV / TSV 导入（UTF-8，每批 ≤300 行、≤1 MB）、去重及当前筛选结果导出。
- Hacker News 新产品、Hugging Face 新模型公开采集。
- 竞品 Sitemap 基线与增量扫描（HTTPS、同源子索引、最多 6 个 XML / 3000 URL）。
- SerpApi 上升查询、7 天 / 90 天 / 5 年趋势及 Google 前十名快照。
- X recent search、Semrush 域名自然搜索词适配器。
- 每次实际扫描日志、失败提示、单源一分钟冷却与并发锁。
- 多关键词趋势对比：把 2–5 个词放进同一次 Google Trends 查询，得到同图可比数据。
- 列表 / 卡片多选与批量操作：批量加入 / 移出观察、淘汰、改分类（「值得做」仍需逐条权利复核）。
- 全量备份与恢复：导出词条（含笔记、决策、证据）、数据源、Sitemap 基线与扫描日志为 JSON；恢复是合并而非覆盖。
- 打开页面时自动扫描超过 12 小时未运行的免费公开源；worker 已实现 `scheduled` 入口，实际触发取决于托管平台是否启用 Cron。
- 6 个原帖历史案例与 8 篇原帖方法索引，历史数据明确标记。

HN 标题、新模型名和 X 帖子是“线索”，不冒充已验证关键词。缺失搜索量保持 `null`，不以点赞、下载或竞品访问量代替。导入重复词保留既有笔记和决策，仅补充不同的来源链接。

## 使用

1. 打开工作台，点击“开始扫描”；默认只启用两个免费公开源。
2. 在“数据源”配置竞品 Sitemap，首次扫描只建立基线。
3. 在词条详情中提炼用户会搜索的任务词，并记录来源证据。
4. 如有 SerpApi 密钥，在“数据源”填入，再到详情点击“验证关键词”。最多消耗 4 次查询；只有明确请求时才调用付费接口。
5. 人工看趋势、SERP、TikTok、变现与权利风险，再标记观察 / 值得做 / 淘汰。

页面密钥只在 React 内存中，刷新后清除；不进入 localStorage、数据库或日志。也可在私有托管环境中配置下列服务端变量。

| 变量 | 用途 | 注意 |
| --- | --- | --- |
| `SERPAPI_API_KEY` | Google Trends + Google SERP | 需要可用额度，不使用非官方 Trends 爬虫 |
| `X_BEARER_TOKEN` | X 最近搜索 | 需要 recent search 权限与配额 |
| `SEMRUSH_API_KEY` | 竞品自然排名词 | 网页订阅不一定包含 API units |

未配置密钥时仍可使用历史案例、公开源、Sitemap、手动研究与 CSV 导入；付费能力会明确提示未配置。GLOBAL 的 Trends 为全球，SERP 因无全球搜索引擎结果使用 US 并标注。

## 本地开发

要求 Node ≥22.13。当前机器的系统 Node 较旧，可使用工作区自带运行时：

```sh
export PATH=/Users/chenmuxi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH
npm install
npm run build
node --import ./scripts/sites-env.mjs node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_yummy_zaran.sql
npm run dev -- --host 127.0.0.1
```

本地默认端口 5173，以终端实际输出为准。Sites 的开发身份只用于本地预览；线上由平台私有访问控制及服务端身份检查保护。本应用为一个单人私有空间，不能直接改为多人共享后声称数据按用户隔离。

迁移命令仅在空本地数据库执行一次，不要重复运行已应用的 SQL。当前工作区已完成初始化，可直接运行开发服务。

如本地 `.dev.vars` / `.env` 中填写真实密钥，务必保持不跟踪提交。示例文件只列变量名，不含值。线上数据库与本地数据库独立，本地测试内容不随源码部署。

## 验证

```sh
node --experimental-strip-types --test tests/radar.test.mts
npx tsc --noEmit
npm run build
# 预览启动后：仅允许 loopback，会写入少量带 QA 标记的本地记录
node scripts/api-smoke.mjs
```

测试覆盖未知值、评分边界、版权阻断、趋势基线、CSV 多行 / 注入防护、去重键、Sitemap 增量和批量续扫、源错误、Cloudflare 重定向兼容、API 数据映射及部分失败。外部付费适配器的测试使用结构化模拟响应；没有密钥不代表通过真实供应商验收。

## 数据与维护

- 结构：`db/schema.ts`；版本化迁移：`drizzle/`。修改后运行 `npm run db:generate`，已应用迁移不可重写。
- 采集：`lib/radar/providers.ts`；评分 / CSV：`lib/radar/scoring.ts`；历史种子：`lib/radar/seed.ts`；备份：`lib/radar/backup.ts`；可复用扫描执行：`lib/radar/scan-run.ts`。
- API：`/api/radar`（研究管理、批量、导入）、`/api/scan`（单源扫描）、`/api/verify`（趋势、SERP、多词对比）、`/api/radar/backup`、`/api/radar/restore`。
- 数据记录上限：界面加载最近 3000 条词条、50 条运行日志，最多配置 20 个源。不是无限历史检索系统。
- 发布沿用 `.openai/hosting.json` 的 Site ID，使用 Sites 构建、源码同步及私有部署流程。

## 第一版边界

- 手动扫描仍是主要触发方式；页面打开时的自动扫描只处理免费公开源、每次最多一个。服务端定时任务依赖托管平台为 Worker 配置 Cron Triggers，未启用时不会自行触发；已实现的 `scheduled` 入口从不调用付费 API。
- 评分是可解释的启发式排序，未用实际收益校准；不是成功概率或收入预测。
- 趋势使用同一查询中的 GPTs 参照；不同时间范围的 0–100 不能直接拼接。没有真实趋势就不画曲线。
- 多关键词对比只在同一次查询内可比；各词条已存的历史趋势来自不同查询，不能跨查询比较。
- 历史案例即使更新了部分趋势，也仍保留历史来源标记；不会自动覆盖作者自述数据为“当前实测”。
- 尚无自动 TikTok 采集、收入分析、自动建站、自动付费或绕过网站限制。
- 供应商 API、Sitemap 大小、网络、限流和权限可能导致扫描失败；失败会记录，不将旧快照标为新数据。

## 原帖

[AI Robert：季节词](https://x.com/aiRobertDaily/status/2113211389221417334) · [Jianyu：老词拆解](https://x.com/iamjianyuwu/status/2112187680012587512) · [Jianyu：新词词根](https://x.com/iamjianyuwu/status/2112570645032886451) · [Jianyu：新词验证](https://x.com/iamjianyuwu/status/2112812159252205773) · [吉吉：音效站复盘](https://x.com/fuyiwei2015/status/2112175337316687958) · [吉吉：Sitemap](https://x.com/fuyiwei2015/status/2114358800136405307) · [吉吉：竞品拆词](https://x.com/fuyiwei2015/status/2116513963672584664) · [姚宏安：雷达与二次验证](https://x.com/yaohongan2025/status/2115268326783906189)

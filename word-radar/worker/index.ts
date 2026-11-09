import handler from "vinext/server/fetch-handler";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";
import { state } from "../lib/radar/store";
import { runScan, isAutoType } from "../lib/radar/scan-run";

const worker = {
  fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (import.meta.env.DEV && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt) return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return { status: "request_context_expired", message: "This request has expired. Please try again." };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }
    return runWithConnectorBinding(binding, () => handler.fetch(request, env, ctx));
  },
  // 定时扫描：只处理免费公开源（Hacker News / Hugging Face / Sitemap），
  // 从不带密钥调用付费接口；失败写入扫描日志，不静默重试。
  // 该 handler 是否被触发取决于托管平台是否为 Worker 配置 Cron Triggers；
  // 页面打开时的自动扫描是始终可用的补充路径。
  async scheduled(_controller: ScheduledController, env: Cloudflare.Env, ctx: ExecutionContext) {
    void env;
    ctx.waitUntil((async () => {
      try {
        const s = await state();
        const stale = s.sources
          .filter(x => x.enabled && isAutoType(x.type) && (!x.lastRun || Date.now() - Date.parse(x.lastRun) > 12 * 3600_000))
          .slice(0, 10);
        for (const source of stale) {
          try { await runScan(source.id, {}, true); } catch { /* 单源失败已记录在扫描日志 */ }
        }
      } catch { /* 数据库不可用时跳过本次调度 */ }
    })());
  },
};

export default worker;

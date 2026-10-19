import type { AppUsageSnapshot } from "@zcode/shared";
import type { SessionUsageState } from "@zcode/shared/zcode-protocol-v4";

/**
 * composer 用量状态条的纯计算层。
 *
 * 状态条要回答四个问题，数据来源各不相同：
 * - 今日合计：`getAppUsageSnapshot` 的按日热力图（本地库 model_usage 聚合）
 * - 本轮 tok/s：会话快照的 cumulative 增量 ÷ 轮次耗时（无额外查询）
 * - 上下文占用：`usage.contextWindow`（已有实时推送）
 * - 会话累计：`usage.cumulative`（协议已下发，此前 UI 未使用）
 *
 * 这里只放不依赖 React 的部分，便于单测覆盖边界。
 */

/** 本地时区下的 `YYYY-MM-DD`；热力图的 date 字段就是这个格式。 */
export function resolveLocalDateKey(nowMs: number, timeZone?: string): string {
  try {
    // en-CA 的短日期格式固定为 YYYY-MM-DD，避免手工拼 padStart。
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(nowMs));
  } catch {
    return new Date(nowMs).toISOString().slice(0, 10);
  }
}

export interface TodayUsageSummary {
  totalTokens: number;
  turnCount: number;
  toolCallCount: number;
}

const EMPTY_TODAY: TodayUsageSummary = { totalTokens: 0, turnCount: 0, toolCallCount: 0 };

/**
 * 从 7 日快照里取出「今天」那一格。
 *
 * 用量查询只支持 all/7d/30d 三个范围，没有 today；但按日热力图本身已经带
 * 每日 tokens / 轮次 / 工具调用数，取当日格子即可，不必新增协议参数。
 */
export function resolveTodayUsage(
  snapshot: AppUsageSnapshot | null,
  nowMs: number,
  timeZone?: string,
): TodayUsageSummary {
  if (!snapshot) {
    return EMPTY_TODAY;
  }
  const todayKey = resolveLocalDateKey(nowMs, timeZone ?? snapshot.timeZone);
  for (const week of snapshot.heatmap.weeks) {
    for (const cell of week.days) {
      if (cell && cell.date === todayKey) {
        return {
          totalTokens: cell.totalTokens,
          turnCount: cell.turnCount,
          toolCallCount: cell.toolCallCount,
        };
      }
    }
  }
  return EMPTY_TODAY;
}

/** 轮次结束的判定：phase 从运行态进入任一终态。 */
export function isTurnEndPhase(phase: string | null | undefined): boolean {
  return (
    phase === "completedSuccess" || phase === "completedInterrupted" || phase === "error"
  );
}

export function isTurnRunningPhase(phase: string | null | undefined): boolean {
  return phase === "running" || phase === "prewarming";
}

export interface TurnRateBaseline {
  outputTokens: number;
  startedAtMs: number;
}

export interface TurnRateSample {
  tokensPerSecond: number;
  outputTokens: number;
  durationMs: number;
}

/**
 * 轮次结束时算本轮平均生成速度。
 *
 * 口径与设置页 debug 面板一致：输出 tokens（含思考）÷ 生成耗时。
 * 用会话 cumulative.outputTokens 的增量而不是单次请求用量，是为了让子智能体、
 * 重试等旁路输出也计入——否则用户会看到「明明输出了很多，速率却很低」。
 *
 * 返回 null 的三种情况：没有起点、没有新增输出、耗时过短（避免除以接近 0 得到荒谬值）。
 */
export function computeTurnRate(
  baseline: TurnRateBaseline | null,
  current: { outputTokens: number; endedAtMs: number } | null,
  minimumDurationMs = 200,
): TurnRateSample | null {
  if (!baseline || !current) {
    return null;
  }
  const outputTokens = current.outputTokens - baseline.outputTokens;
  const durationMs = current.endedAtMs - baseline.startedAtMs;
  if (outputTokens <= 0 || durationMs < minimumDurationMs) {
    return null;
  }
  return {
    tokensPerSecond: (outputTokens * 1000) / durationMs,
    outputTokens,
    durationMs,
  };
}

/** 上下文占用比例；上限缺失或非法时返回 null。 */
export function resolveContextUsageRatio(
  usage: SessionUsageState | null | undefined,
): number | null {
  const contextWindow = usage?.contextWindow;
  if (!contextWindow || !Number.isFinite(contextWindow.maxTokens) || contextWindow.maxTokens <= 0) {
    return null;
  }
  const ratio = contextWindow.usedTokens / contextWindow.maxTokens;
  return Number.isFinite(ratio) ? Math.min(Math.max(ratio, 0), 1) : null;
}

import type { AppUsageSnapshot, SessionDebugSnapshot, ZCodeTaskTokenUsageResult } from "@zcode/shared";
import type { SessionUsageState } from "@zcode/shared/zcode-protocol-v4";
import { formatCompactTokenNumber } from "@/lib/tokenNumberFormat.js";

/**
 * composer 用量状态条的纯计算层。
 *
 * 状态条要回答的问题，数据来源各不相同：
 * - 今日合计：`getAppUsageSnapshot` 的按日热力图（本地库 model_usage 聚合）
 * - 本轮 / 生成速度：会话快照的 cumulative 增量，或 `readSessionDebug` 的逐轮事实
 * - 上下文占用：`usage.contextWindow`（已有实时推送）
 * - 会话累计：`usage.cumulative` / `getTaskTokenUsage`
 * - 工具调用：`readSessionDebug` 的逐轮汇总
 *
 * 这里只放不依赖 React 的部分，便于单测覆盖边界。
 */

// ── 显示项 ────────────────────────────────────────────────────────────

export const USAGE_BAR_ITEMS = ["ctx", "speed", "turn", "session", "tools", "today", "sub"] as const;
export type UsageBarItem = (typeof USAGE_BAR_ITEMS)[number];

export const DEFAULT_USAGE_BAR_ITEMS: Record<UsageBarItem, boolean> = {
  ctx: true,
  speed: true,
  turn: true,
  session: true,
  tools: false,
  today: true,
  sub: false,
};

export interface UsageBarSettings {
  items: Record<UsageBarItem, boolean>;
  /** 上下文窗口容量覆盖；null = 自动（用模型配置/快照值）。 */
  contextWindowOverride: number | null;
  /** token 数量是否用中文万/亿单位（仅中文界面生效）。 */
  useChineseUnits: boolean;
}

export const DEFAULT_USAGE_BAR_SETTINGS: UsageBarSettings = {
  items: { ...DEFAULT_USAGE_BAR_ITEMS },
  contextWindowOverride: null,
  useChineseUnits: true,
};

const USAGE_BAR_SETTINGS_KEY = "zcode.composerUsageBar.settings.v1";

/** 从存储里读设置；任何损坏都回退默认值，不能让状态条因为坏配置而消失。 */
export function parseUsageBarSettings(raw: string | null | undefined): UsageBarSettings {
  if (!raw) {
    return { ...DEFAULT_USAGE_BAR_SETTINGS, items: { ...DEFAULT_USAGE_BAR_ITEMS } };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<UsageBarSettings>;
    const items = { ...DEFAULT_USAGE_BAR_ITEMS };
    if (parsed.items && typeof parsed.items === "object") {
      for (const key of USAGE_BAR_ITEMS) {
        const value = (parsed.items as Record<string, unknown>)[key];
        if (typeof value === "boolean") {
          items[key] = value;
        }
      }
    }
    const override = parsed.contextWindowOverride;
    return {
      items,
      contextWindowOverride:
        typeof override === "number" && Number.isFinite(override) && override > 0
          ? Math.floor(override)
          : null,
      useChineseUnits: parsed.useChineseUnits !== false,
    };
  } catch {
    return { ...DEFAULT_USAGE_BAR_SETTINGS, items: { ...DEFAULT_USAGE_BAR_ITEMS } };
  }
}

export function readUsageBarSettings(): UsageBarSettings {
  if (typeof window === "undefined") {
    return { ...DEFAULT_USAGE_BAR_SETTINGS, items: { ...DEFAULT_USAGE_BAR_ITEMS } };
  }
  try {
    return parseUsageBarSettings(window.localStorage.getItem(USAGE_BAR_SETTINGS_KEY));
  } catch {
    return { ...DEFAULT_USAGE_BAR_SETTINGS, items: { ...DEFAULT_USAGE_BAR_ITEMS } };
  }
}

export function writeUsageBarSettings(settings: UsageBarSettings): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(USAGE_BAR_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // 存储不可用（隐私模式/配额满）时只丢偏好，不影响功能。
  }
}

// ── 数值格式化 ────────────────────────────────────────────────────────

/**
 * token 数量的展示格式。
 *
 * 中文界面默认用万/亿（Intl compact 的自然结果），也可切到 K/M/B；
 * 英文界面始终 K/M/B。插件把这条做成了显式开关，这里保持一致。
 */
export function formatTokens(locale: string, value: number, useChineseUnits: boolean): string {
  const effectiveLocale = useChineseUnits && locale.startsWith("zh") ? "zh-CN" : "en-US";
  return formatCompactTokenNumber(effectiveLocale, value);
}

export function formatRate(locale: string, value: number): string {
  return new Intl.NumberFormat(locale || undefined, {
    maximumFractionDigits: value >= 100 ? 0 : 1,
  }).format(value);
}

export function formatPercent(locale: string, ratio: number): string {
  return new Intl.NumberFormat(locale || undefined, {
    style: "percent",
    maximumFractionDigits: ratio >= 0.1 ? 0 : 1,
  }).format(ratio);
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "—";
  }
  return seconds < 10 ? `${seconds.toFixed(1)}s` : `${Math.round(seconds)}s`;
}

// ── 分级（颜色）────────────────────────────────────────────────────────

export type UsageTier = "ok" | "warm" | "hot";

/** 上下文占比分档：>75% 红、>50% 黄、其余正常。 */
export function resolveContextTier(ratio: number | null): UsageTier {
  if (ratio === null) return "ok";
  if (ratio > 0.75) return "hot";
  if (ratio > 0.5) return "warm";
  return "ok";
}

/**
 * 生成速度分档，用于快速比较模型快慢。
 *
 * 阈值按当前主流模型的量级取：<20 tok/s 偏慢、20–60 正常、>60 快。
 * 只影响颜色，不改变数值本身。
 */
export function resolveSpeedTier(tokensPerSecond: number | null): UsageTier {
  if (tokensPerSecond === null) return "ok";
  if (tokensPerSecond < 20) return "hot";
  if (tokensPerSecond < 60) return "warm";
  return "ok";
}

// ── 日期与今日用量 ────────────────────────────────────────────────────

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

// ── 轮次状态 ──────────────────────────────────────────────────────────

/** 轮次结束的判定：phase 从运行态进入任一终态。 */
export function isTurnEndPhase(phase: string | null | undefined): boolean {
  return phase === "completedSuccess" || phase === "completedInterrupted" || phase === "error";
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

// ── 逐轮明细（来自 readSessionDebug）──────────────────────────────────

export interface TurnUsageDetail {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  reasoningTokens: number;
  /** 缓存命中率 0..1；无数据时为 null。 */
  cacheHitRate: number | null;
  /** 生成耗时（ms）；未知为 null。 */
  generationDurationMs: number | null;
  tokensPerSecond: number | null;
  /** 本轮请求段数（模型请求次数）。 */
  requestCount: number;
}

/**
 * 取最近一轮的用量明细。
 *
 * `readSessionDebug` 的 rounds 按请求记录；同一轮可能有多段（重试、工具后继续）。
 * 这里把「最近一条 round 的 recordedAt 之后」视为同一轮的近似——实际实现按
 * requestIndex 递增序列取尾部连续段，避免把上一轮的尾部算进来。
 */
export function resolveLatestTurnDetail(
  debug: SessionDebugSnapshot | null,
): TurnUsageDetail | null {
  if (!debug || debug.rounds.length === 0) {
    return null;
  }
  const rounds = debug.rounds;
  const last = rounds[rounds.length - 1];
  if (!last) {
    return null;
  }
  // 从尾部往前收集，直到遇到明显的时间断档（>10 分钟视为上一轮）。
  const GAP_MS = 10 * 60 * 1000;
  const turnRounds = [last];
  for (let i = rounds.length - 2; i >= 0; i -= 1) {
    const current = rounds[i];
    const next = turnRounds[0];
    if (!current || !next) {
      break;
    }
    if (Math.abs(next.recordedAt - current.recordedAt) > GAP_MS) {
      break;
    }
    turnRounds.unshift(current);
  }

  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let reasoningTokens = 0;
  let generationDurationMs: number | null = null;
  let tokensPerSecond: number | null = null;

  for (const round of turnRounds) {
    inputTokens += round.usage.inputTokens ?? 0;
    outputTokens += round.usage.outputTokens ?? 0;
    cacheReadTokens += round.usage.cachedInputTokens ?? 0;
    reasoningTokens += round.usage.reasoningTokens ?? 0;
    if (round.generationDurationMs !== null) {
      generationDurationMs = (generationDurationMs ?? 0) + round.generationDurationMs;
    }
    if (round.tokensPerSecond !== null) {
      // 多段时取最后一段的有效值——与状态条「最近一次完成请求」口径一致。
      tokensPerSecond = round.tokensPerSecond;
    }
  }

  const cacheHitRate = inputTokens > 0 ? cacheReadTokens / inputTokens : null;
  return {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    reasoningTokens,
    cacheHitRate: cacheHitRate === null ? null : Math.min(Math.max(cacheHitRate, 0), 1),
    generationDurationMs,
    tokensPerSecond,
    requestCount: turnRounds.length,
  };
}

// ── 上下文 ────────────────────────────────────────────────────────────

/** 上下文占用比例；上限缺失或非法时返回 null。 */
export function resolveContextUsageRatio(
  usage: SessionUsageState | null | undefined,
  overrideMaxTokens: number | null = null,
): number | null {
  const contextWindow = usage?.contextWindow;
  const maxTokens = overrideMaxTokens ?? contextWindow?.maxTokens;
  if (!contextWindow || !Number.isFinite(maxTokens) || !maxTokens || maxTokens <= 0) {
    return null;
  }
  const ratio = contextWindow.usedTokens / maxTokens;
  return Number.isFinite(ratio) ? Math.min(Math.max(ratio, 0), 1) : null;
}

/** 生效的上下文上限：用户覆盖优先，其次是快照给出的模型容量。 */
export function resolveContextMaxTokens(
  usage: SessionUsageState | null | undefined,
  overrideMaxTokens: number | null,
): number | null {
  const contextWindow = usage?.contextWindow;
  if (overrideMaxTokens && overrideMaxTokens > 0) {
    return overrideMaxTokens;
  }
  const max = contextWindow?.maxTokens;
  return typeof max === "number" && Number.isFinite(max) && max > 0 ? max : null;
}

// ── 会话累计 ──────────────────────────────────────────────────────────

export interface SessionTotals {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  requestCount: number | null;
}

/**
 * 会话累计优先用 `getTaskTokenUsage`（含请求次数），退回快照的 cumulative。
 *
 * 快照的 cumulative 只在模型请求完成时推进，会话刚恢复或刚开始时可能是 0，
 * 而任务用量查询能拿到完整历史——两者都失败才显示占位。
 */
export function resolveSessionTotals(
  taskUsage: ZCodeTaskTokenUsageResult | null,
  usage: SessionUsageState | null | undefined,
): SessionTotals | null {
  if (taskUsage) {
    return {
      inputTokens: taskUsage.inputTokens,
      outputTokens: taskUsage.outputTokens,
      cacheReadTokens: taskUsage.cacheReadTokens,
      cacheWriteTokens: taskUsage.cacheCreationTokens,
      requestCount: taskUsage.modelRequestCount,
    };
  }
  const cumulative = usage?.cumulative;
  if (!cumulative) {
    return null;
  }
  return {
    inputTokens: cumulative.inputTokens,
    outputTokens: cumulative.outputTokens,
    cacheReadTokens: cumulative.cacheReadTokens,
    cacheWriteTokens: cumulative.cacheWriteTokens,
    requestCount: null,
  };
}

/** 会话累计缓存命中率。 */
export function resolveSessionCacheHitRate(totals: SessionTotals | null): number | null {
  if (!totals || totals.inputTokens <= 0) {
    return null;
  }
  return Math.min(Math.max(totals.cacheReadTokens / totals.inputTokens, 0), 1);
}

// ── 子智能体 ──────────────────────────────────────────────────────────

export interface SubagentUsageSummary {
  runningCount: number;
  /** 有阻塞或等待状态的子代理数量，用于状态点变色。 */
  attentionCount: number;
  endedTotal: number;
  /** 最近若干条已结束任务，用于面板列表。 */
  recent: Array<{
    childSessionId: string;
    title: string;
    subagentType: string;
    status: string;
    durationMs: number | null;
  }>;
}

/**
 * 汇总子智能体状态。
 *
 * 用量（token）需要逐个 child session 查询，成本随数量线性增长；
 * 面板只在用户点开时才需要这些数字，因此这里只做轻量汇总，
 * 计数与状态点走快照/列表，具体 tokens 留给面板按需拉取。
 */
export function resolveSubagentSummary(
  subagents:
    | {
        running?: Array<{ status?: string }>;
        ended?: { total?: number; items?: Array<Record<string, unknown>> };
      }
    | null
    | undefined,
  limit = 8,
): SubagentUsageSummary {
  const running = subagents?.running ?? [];
  const endedItems = subagents?.ended?.items ?? [];
  return {
    runningCount: running.length,
    attentionCount: running.filter(
      (item) => item.status === "blocked" || item.status === "waiting",
    ).length,
    endedTotal: subagents?.ended?.total ?? 0,
    recent: endedItems.slice(0, limit).map((item) => {
      const startedAt = typeof item.startedAt === "number" ? item.startedAt : null;
      const endedAt = typeof item.endedAt === "number" ? item.endedAt : null;
      return {
        childSessionId: String(item.childSessionId ?? ""),
        title: String(item.title ?? ""),
        subagentType: String(item.subagentType ?? ""),
        status: String(item.status ?? ""),
        durationMs:
          startedAt !== null && endedAt !== null ? Math.max(0, endedAt - startedAt) : null,
      };
    }),
  };
}

// ── 上下文超限 ────────────────────────────────────────────────────────

/**
 * 判断是否处于「上下文超限被拒」状态。
 *
 * 依据是会话最近一次错误是否是上下文超限。CLI 把这类失败归一成固定标记集
 * （见 core/runtime/helpers/model-errors.ts 的 MODEL_CONTEXT_EXCEEDED_MARKERS），
 * 这里用同一组标记匹配 `lastError.code`，避免依赖某个供应商的原文措辞。
 */
const CONTEXT_EXCEEDED_MARKERS = new Set([
  "ModelContextExceeded",
  "context_exceeded",
  "context_length_exceeded",
  "context_window_exceeded",
  "model_context_window_exceeded",
  "prompt_too_long",
]);

export function isContextExceededErrorCode(code: string | null | undefined): boolean {
  if (!code) {
    return false;
  }
  const normalized = code.trim();
  if (CONTEXT_EXCEEDED_MARKERS.has(normalized)) {
    return true;
  }
  // 供应商常把具体模型名塞进 code（如 xxx_context_length_exceeded），用包含匹配兜住。
  return /context_(?:length|window)_exceeded|prompt_too_long|context_exceeded/i.test(normalized);
}

export function isContextExceededActive(input: {
  lastErrorCode: string | null | undefined;
  phase: string | null | undefined;
}): boolean {
  // 只在该轮确实失败时提示；已恢复运行/成功的轮次不残留告警。
  if (input.phase !== "error") {
    return false;
  }
  return isContextExceededErrorCode(input.lastErrorCode);
}

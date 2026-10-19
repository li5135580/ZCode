import { useCallback, useEffect, useRef, useState } from "react";
import type { AppUsageSnapshot, ZCodeTaskTokenUsageResult } from "@zcode/shared";
import type { SessionUsageState } from "@zcode/shared/zcode-protocol-v4";
import { useOptionalServices } from "@/hooks/useServices.js";
import { logger } from "@/logger.js";
import {
  computeTurnRate,
  isTurnEndPhase,
  isTurnRunningPhase,
  readUsageBarSettings,
  resolveLatestTurnDetail,
  type TurnRateBaseline,
  type TurnRateSample,
  type UsageBarSettings,
  type TurnUsageDetail,
} from "@/v4/composer/composerUsageMetrics.js";

const EMPTY_STATE = {
  snapshot: null as AppUsageSnapshot | null,
  loading: false,
  error: null as string | null,
};

/**
 * 状态条的取数 hook。
 *
 * 刷新策略是「轮次结束刷新」：会话 phase 从运行态进入终态时重查一次，
 * 而不是定时轮询——用量是已完成请求的聚合，运行中反复查询拿不到新数据，
 * 只会白白增加 IPC 与 SQLite 读取。
 *
 * 三份数据来源：
 * - 今日合计：`getAppUsageSnapshot("7d")`，取当日格子
 * - 逐轮明细：`readSessionDebug`，取最近一轮的 tokens/缓存/耗时
 * - 会话累计：`getTaskTokenUsage`，含请求次数
 */
export function useComposerUsageStatusBar({
  usage,
  phase,
  enabled = true,
  workspacePath,
  workspaceIdentity,
  sessionId,
}: {
  usage: SessionUsageState | null;
  phase: string | null;
  enabled?: boolean;
  workspacePath?: string;
  workspaceIdentity?: string;
  sessionId?: string | null;
}) {
  // 用可选服务：composer 在部分宿主（如纯展示/单测渲染）里没有 ServiceProvider，
  // 状态条只是增强信息，不能因为缺少服务就把整个 composer 拖崩。
  const services = useOptionalServices();
  const usageStatsService = services?.usageStatsService;
  const zcodeAgentService = services?.zcodeAgentService;

  const [settings, setSettings] = useState<UsageBarSettings>(() => readUsageBarSettings());
  const [todayState, setTodayState] = useState(EMPTY_STATE);
  const [turnRate, setTurnRate] = useState<TurnRateSample | null>(null);
  const [turnDetail, setTurnDetail] = useState<TurnUsageDetail | null>(null);
  const [taskUsage, setTaskUsage] = useState<ZCodeTaskTokenUsageResult | null>(null);
  const requestVersionRef = useRef(0);
  const baselineRef = useRef<TurnRateBaseline | null>(null);
  const previousPhaseRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) {
      return;
    }
    const requestVersion = requestVersionRef.current + 1;
    requestVersionRef.current = requestVersion;
    setTodayState((current) => ({ ...current, loading: true, error: null }));

    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    // 今日用量是主指标，失败时保留旧值；会话级数据失败不影响它。
    if (usageStatsService) {
      try {
        // 7 日范围足以覆盖「今天」，且是接口支持的最小窗口。
        const snapshot = await usageStatsService.getAppUsageSnapshot({ range: "7d", timeZone });
        if (requestVersionRef.current === requestVersion) {
          setTodayState({ snapshot, loading: false, error: null });
        }
      } catch (error) {
        if (requestVersionRef.current === requestVersion) {
          const message = error instanceof Error ? error.message : String(error);
          logger.warn("[composer-usage-status-bar] 读取今日用量失败", { error: message });
          setTodayState((current) => ({ ...current, loading: false, error: message }));
        }
      }
    }

    if (!zcodeAgentService || !sessionId) {
      return;
    }

    const target = {
      workspacePath: workspacePath ?? "",
      workspaceIdentity,
      sessionId,
    };

    try {
      const debug = await zcodeAgentService.readSessionDebug(target);
      if (requestVersionRef.current === requestVersion) {
        setTurnDetail(resolveLatestTurnDetail(debug));
      }
    } catch (error) {
      logger.warn("[composer-usage-status-bar] 读取逐轮用量失败", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      const totals = await zcodeAgentService.getTaskTokenUsage(target);
      if (requestVersionRef.current === requestVersion) {
        setTaskUsage(totals);
      }
    } catch (error) {
      logger.warn("[composer-usage-status-bar] 读取会话累计失败", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, [enabled, sessionId, usageStatsService, workspaceIdentity, workspacePath, zcodeAgentService]);

  // 首次进入会话时取一次，之后只在轮次结束时重查。
  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const previousPhase = previousPhaseRef.current;
    previousPhaseRef.current = phase;

    if (!enabled) {
      return;
    }

    const cumulativeOutput = usage?.cumulative.outputTokens;
    if (typeof cumulativeOutput !== "number") {
      return;
    }

    if (isTurnRunningPhase(phase)) {
      // 只在一轮开始时记基线；running 期间快照会多次推送，不能反复覆盖起点。
      if (!isTurnRunningPhase(previousPhase)) {
        baselineRef.current = { outputTokens: cumulativeOutput, startedAtMs: Date.now() };
      }
      return;
    }

    if (isTurnEndPhase(phase) && baselineRef.current) {
      const sample = computeTurnRate(baselineRef.current, {
        outputTokens: cumulativeOutput,
        endedAtMs: Date.now(),
      });
      baselineRef.current = null;
      if (sample) {
        setTurnRate(sample);
      }
      // 本轮结束：今日合计、逐轮明细、会话累计都需要把这一轮算进去。
      void refresh();
    }
  }, [enabled, phase, refresh, usage?.cumulative.outputTokens]);

  const updateSettings = useCallback((next: UsageBarSettings) => {
    setSettings(next);
  }, []);

  return {
    settings,
    updateSettings,
    todaySnapshot: todayState.snapshot,
    todayLoading: todayState.loading,
    todayError: todayState.error,
    turnRate,
    turnDetail,
    taskUsage,
    refresh,
    /** 没有用量服务时不渲染状态条，保持 composer 的原有渲染契约。 */
    available: Boolean(usageStatsService),
  };
}

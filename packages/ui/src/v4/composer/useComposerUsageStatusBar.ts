import { useCallback, useEffect, useRef, useState } from "react";
import type { AppUsageSnapshot } from "@zcode/shared";
import type { SessionUsageState } from "@zcode/shared/zcode-protocol-v4";
import { useOptionalServices } from "@/hooks/useServices.js";
import { logger } from "@/logger.js";
import {
  computeTurnRate,
  isTurnEndPhase,
  isTurnRunningPhase,
  type TurnRateBaseline,
  type TurnRateSample,
} from "@/v4/composer/composerUsageMetrics.js";

const EMPTY_STATE = {
  snapshot: null as AppUsageSnapshot | null,
  loading: false,
  error: null as string | null,
};

/**
 * 今日用量 + 本轮速率的取数 hook。
 *
 * 刷新策略是「轮次结束刷新」：会话 phase 从运行态进入终态时重查一次本地库，
 * 而不是定时轮询——用量是已完成请求的聚合，运行中反复查询拿不到新数据，
 * 只会白白增加 IPC 与 SQLite 读取。
 *
 * 本轮速率完全来自已推送的会话快照（cumulative.outputTokens 增量 ÷ 轮次耗时），
 * 不触发任何额外查询。
 */
export function useComposerUsageStatusBar({
  usage,
  phase,
  enabled = true,
}: {
  usage: SessionUsageState | null;
  phase: string | null;
  enabled?: boolean;
}) {
  // 用可选服务：composer 在部分宿主（如纯展示/单测渲染）里没有 ServiceProvider，
  // 状态条只是增强信息，不能因为缺少服务就把整个 composer 拖崩。
  const services = useOptionalServices();
  const usageStatsService = services?.usageStatsService;
  const [todayState, setTodayState] = useState(EMPTY_STATE);
  const [turnRate, setTurnRate] = useState<TurnRateSample | null>(null);
  const requestVersionRef = useRef(0);
  const baselineRef = useRef<TurnRateBaseline | null>(null);
  const previousPhaseRef = useRef<string | null>(null);

  const refreshToday = useCallback(async () => {
    if (!enabled || !usageStatsService) {
      return;
    }
    const requestVersion = requestVersionRef.current + 1;
    requestVersionRef.current = requestVersion;
    setTodayState((current) => ({ ...current, loading: true, error: null }));
    try {
      // 7 日范围足以覆盖「今天」，且是接口支持的最小窗口。
      const snapshot = await usageStatsService.getAppUsageSnapshot({
        range: "7d",
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      if (requestVersionRef.current !== requestVersion) {
        return;
      }
      setTodayState({ snapshot, loading: false, error: null });
    } catch (error) {
      if (requestVersionRef.current !== requestVersion) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      logger.warn("[composer-usage-status-bar] 读取今日用量失败", { error: message });
      setTodayState((current) => ({ ...current, loading: false, error: message }));
    }
  }, [enabled, usageStatsService]);

  // 首次进入会话时取一次，之后只在轮次结束时重查。
  useEffect(() => {
    void refreshToday();
  }, [refreshToday]);

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
      // 本轮结束：今日合计需要把这一轮算进去。
      void refreshToday();
    }
  }, [enabled, phase, refreshToday, usage?.cumulative.outputTokens]);

  return {
    todaySnapshot: todayState.snapshot,
    todayLoading: todayState.loading,
    todayError: todayState.error,
    turnRate,
    refreshToday,
    /** 没有用量服务时不渲染状态条，保持 composer 的原有渲染契约。 */
    available: Boolean(usageStatsService),
  };
}

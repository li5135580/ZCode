// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppUsageSnapshot } from "@zcode/shared";
import type { SessionUsageState } from "@zcode/shared/zcode-protocol-v4";
import type { IServiceAccessor } from "@zcode/services";
import { ServiceProvider } from "@/hooks/useServices.js";
import { useComposerUsageStatusBar } from "@/v4/composer/useComposerUsageStatusBar.js";

function createSnapshot(): AppUsageSnapshot {
  return {
    range: "7d",
    generatedAt: 0,
    timeZone: "UTC",
    source: "agent-db",
    summary: {
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      cacheHitRate: 0,
      totalSessions: 0,
      totalTurns: 0,
      toolCallCount: 0,
      toolErrorRate: 0,
      modelErrorRate: 0,
      avgTimeToFirstTokenMs: null,
      avgTurnDurationMs: null,
      activeDays: 0,
      currentStreakDays: 0,
      longestSessionMs: 0,
      longestStreakDays: 0,
      peakDayTokens: 0,
      favoriteModel: null,
    },
    heatmap: { startDate: null, endDate: null, maxTokens: 0, weeks: [] },
    dailyModelUsage: [],
    models: [],
    tools: [],
  };
}

function usageWithOutput(outputTokens: number): SessionUsageState {
  return {
    contextWindow: { usedTokens: 0, maxTokens: 1000, autoCompactThresholdTokens: null },
    cumulative: {
      inputTokens: 0,
      outputTokens,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
  };
}

type ProbeState = ReturnType<typeof useComposerUsageStatusBar>;

let root: Root | undefined;
let latest: ProbeState;

function Probe({
  usage,
  phase,
  enabled,
}: {
  usage: SessionUsageState | null;
  phase: string | null;
  enabled?: boolean;
}) {
  latest = useComposerUsageStatusBar({ usage, phase, enabled });
  return null;
}

function mount(services: IServiceAccessor, props: { usage: SessionUsageState | null; phase: string | null; enabled?: boolean }) {
  // 直接 createRoot 时 React 需要显式告知这是测试环境，否则 act() 不会冲刷 effect。
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root!.render(
      createElement(
        ServiceProvider,
        { services },
        createElement(Probe, { ...props }),
      ),
    ),
  );
}

function rerender(props: { usage: SessionUsageState | null; phase: string | null; enabled?: boolean }) {
  act(() =>
    root!.render(
      createElement(
        ServiceProvider,
        { services: servicesRef },
        createElement(Probe, { ...props }),
      ),
    ),
  );
}

let servicesRef: IServiceAccessor;

function createServices() {
  const getAppUsageSnapshot = vi.fn(async () => createSnapshot());
  servicesRef = { usageStatsService: { getAppUsageSnapshot } } as unknown as IServiceAccessor;
  return { services: servicesRef, getAppUsageSnapshot };
}

beforeEach(() => {
  // 不用 fake timers：React 调度器会读取 performance.now/queueMicrotask，
  // 伪造计时器会让 effect 不执行。这里只拦截 Date.now 控制轮次耗时。
  vi.useRealTimers();
});

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("useComposerUsageStatusBar", () => {
  it("挂载时查一次今日用量", async () => {
    const { services, getAppUsageSnapshot } = createServices();
    mount(services, { usage: usageWithOutput(0), phase: "draft" });

    await act(async () => {});
    expect(getAppUsageSnapshot).toHaveBeenCalledTimes(1);
    expect(getAppUsageSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ range: "7d" }),
    );
  });

  it("轮次结束时算出本轮速率并重查今日用量", async () => {
    const { services, getAppUsageSnapshot } = createServices();
    const nowSpy = vi.spyOn(Date, "now");

    nowSpy.mockReturnValue(1_000_000);
    mount(services, { usage: usageWithOutput(1000), phase: "draft" });
    await act(async () => {});
    expect(getAppUsageSnapshot).toHaveBeenCalledTimes(1);

    // 进入运行态：记录基线（outputTokens=1000, t=1000000）。
    rerender({ usage: usageWithOutput(1000), phase: "running" });

    // 运行中快照推进：不应重复查询，也不应覆盖基线。
    nowSpy.mockReturnValue(1_002_000);
    rerender({ usage: usageWithOutput(2000), phase: "running" });
    expect(getAppUsageSnapshot).toHaveBeenCalledTimes(1);

    // 轮次结束：输出 3000-1000=2000 tokens，耗时 4000ms → 500 tok/s。
    nowSpy.mockReturnValue(1_004_000);
    rerender({ usage: usageWithOutput(3000), phase: "completedSuccess" });

    await act(async () => {});
    expect(latest.turnRate).toEqual({
      tokensPerSecond: 500,
      outputTokens: 2000,
      durationMs: 4000,
    });
    expect(getAppUsageSnapshot).toHaveBeenCalledTimes(2);
    nowSpy.mockRestore();
  });

  it("enabled=false 时不查询，也不计算速率", async () => {
    const { services, getAppUsageSnapshot } = createServices();
    mount(services, { usage: usageWithOutput(0), phase: "draft", enabled: false });
    await act(async () => {});

    expect(getAppUsageSnapshot).not.toHaveBeenCalled();
    expect(latest.turnRate).toBeNull();
  });

  it("查询失败时保留错误信息而不抛错", async () => {
    const getAppUsageSnapshot = vi.fn(async () => {
      throw new Error("no_active_workspace");
    });
    servicesRef = { usageStatsService: { getAppUsageSnapshot } } as unknown as IServiceAccessor;
    mount(servicesRef, { usage: usageWithOutput(0), phase: "draft" });

    await act(async () => {});
    expect(latest.todayError).toBe("no_active_workspace");
    expect(latest.todaySnapshot).toBeNull();
  });
});

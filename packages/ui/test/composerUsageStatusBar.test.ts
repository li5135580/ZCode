// @vitest-environment jsdom
import { createElement, type ReactNode } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppUsageSnapshot, SessionDebugSnapshot } from "@zcode/shared";
import type { SessionUsageState } from "@zcode/shared/zcode-protocol-v4";
import type { IServiceAccessor } from "@zcode/services";
import { ZCodeIntlProvider } from "@/i18n/IntlProvider.js";
import { ServiceProvider } from "@/hooks/useServices.js";
import { TID_V4_COMPOSER_USAGE_STATUS_BAR } from "@zcode/shared/test-ids";
import { ComposerUsageStatusBar } from "@/v4/composer/ComposerUsageStatusBar.js";

vi.mock("@/components/ui/popover.js", () => ({
  Popover: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
  PopoverTrigger: ({ children }: { children?: ReactNode }) => children,
  PopoverContent: ({ children }: { children?: ReactNode }) =>
    createElement("div", { "data-testid": "usage-settings-panel" }, children),
}));

vi.mock("@/components/ui/checkbox.js", () => ({
  Checkbox: ({
    checked,
    onCheckedChange,
  }: {
    checked?: boolean;
    onCheckedChange?: (value: boolean) => void;
  }) =>
    createElement("input", {
      type: "checkbox",
      checked: Boolean(checked),
      onChange: (event: { target: { checked: boolean } }) =>
        onCheckedChange?.(event.target.checked),
    }),
}));

function todayKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function createSnapshot(todayTokens: number, toolCallCount = 5): AppUsageSnapshot {
  return {
    range: "7d",
    generatedAt: 0,
    timeZone: "UTC",
    source: "agent-db",
    summary: {
      totalTokens: todayTokens,
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      cacheHitRate: 0,
      totalSessions: 1,
      totalTurns: 1,
      toolCallCount: 0,
      toolErrorRate: 0,
      modelErrorRate: 0,
      avgTimeToFirstTokenMs: null,
      avgTurnDurationMs: null,
      activeDays: 1,
      currentStreakDays: 1,
      longestSessionMs: 0,
      longestStreakDays: 1,
      peakDayTokens: todayTokens,
      favoriteModel: null,
    },
    heatmap: {
      startDate: null,
      endDate: null,
      maxTokens: todayTokens,
      weeks: [
        {
          weekIndex: 0,
          days: [
            {
              date: todayKey(),
              level: 1,
              totalTokens: todayTokens,
              turnCount: 3,
              toolCallCount,
            },
          ],
        },
      ],
    },
    dailyModelUsage: [],
    models: [],
    tools: [],
  };
}

function createDebug(): SessionDebugSnapshot {
  return {
    sessionId: "s1",
    rounds: [
      {
        eventKey: "e1",
        requestId: "r1",
        requestIndex: 0,
        recordedAt: 1000,
        usage: { inputTokens: 10_000, outputTokens: 2_000, cachedInputTokens: 5_000 },
        hitRate: 0.5,
        generationDurationMs: 4000,
        tokensPerSecond: 500,
      },
    ],
    networkEntries: [],
    cache: null,
  };
}

function createUsage(overrides: Partial<SessionUsageState> = {}): SessionUsageState {
  return {
    contextWindow: {
      usedTokens: 50_000,
      maxTokens: 200_000,
      autoCompactThresholdTokens: null,
    },
    cumulative: {
      inputTokens: 120_000,
      outputTokens: 8_000,
      cacheReadTokens: 30_000,
      cacheWriteTokens: 2_000,
    },
    ...overrides,
  };
}

function createServices(options?: { failAll?: boolean }) {
  const getAppUsageSnapshot = vi.fn(async () => {
    if (options?.failAll) throw new Error("no_active_workspace");
    return createSnapshot(1_234_567);
  });
  const readSessionDebug = vi.fn(async () => {
    if (options?.failAll) throw new Error("debug failed");
    return createDebug();
  });
  const getTaskTokenUsage = vi.fn(async () => {
    if (options?.failAll) throw new Error("totals failed");
    return {
      sessionId: "s1",
      totalTokens: 130_000,
      inputTokens: 120_000,
      outputTokens: 8_000,
      reasoningTokens: 0,
      cacheCreationTokens: 2_000,
      cacheReadTokens: 30_000,
      modelRequestCount: 12,
      modelErrorCount: 0,
      inputBaselineBySource: {},
    };
  });
  const services = {
    usageStatsService: { getAppUsageSnapshot },
    zcodeAgentService: { readSessionDebug, getTaskTokenUsage },
  } as unknown as IServiceAccessor;
  return { services, getAppUsageSnapshot, readSessionDebug, getTaskTokenUsage };
}

function renderBar(props: {
  usage: SessionUsageState | null;
  phase?: string | null;
  enabled?: boolean;
  services?: IServiceAccessor;
}) {
  return render(
    createElement(
      ServiceProvider,
      { services: props.services ?? createServices().services },
      createElement(
        ZCodeIntlProvider,
        { initialLocale: "zh-CN" },
        createElement(ComposerUsageStatusBar, {
          usage: props.usage,
          phase: props.phase ?? null,
          enabled: props.enabled,
          workspacePath: "/workspace",
          sessionId: "s1",
        }),
      ),
    ),
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.clearAllMocks();
});

describe("ComposerUsageStatusBar", () => {
  it("展示上下文、速度、本轮、会话、今日五项默认指标", async () => {
    renderBar({ usage: createUsage() });

    const bar = await screen.findByTestId(TID_V4_COMPOSER_USAGE_STATUS_BAR);
    // 指标用图标 + 数值呈现，断言走各指标的 test-id。
    await waitFor(() => expect(bar.querySelector('[data-testid="usage-item-today"]')).not.toBeNull());

    // 上下文 50000/200000 = 25%
    expect(bar.querySelector('[data-testid="usage-item-ctx"]')?.textContent).toContain("25%");
    // 速度来自逐轮事实 500 tok/s
    expect(bar.querySelector('[data-testid="usage-item-speed"]')?.textContent).toContain("500");
    // 本轮输出 2000
    expect(bar.querySelector('[data-testid="usage-item-turn"]')?.textContent).toContain("2000");
    // 今日 123.5万
    expect(bar.querySelector('[data-testid="usage-item-today"]')?.textContent).toContain("123.5万");
    // 工具调用默认关闭
    expect(bar.querySelector('[data-testid="usage-item-tools"]')).toBeNull();
  });

  it("enabled=false 时不渲染，也不发起任何查询", async () => {
    const { services, getAppUsageSnapshot, readSessionDebug, getTaskTokenUsage } =
      createServices();
    const { container } = renderBar({
      usage: createUsage(),
      enabled: false,
      services,
    });

    expect(
      container.querySelector(`[data-testid="${TID_V4_COMPOSER_USAGE_STATUS_BAR}"]`),
    ).toBeNull();
    expect(getAppUsageSnapshot).not.toHaveBeenCalled();
    expect(readSessionDebug).not.toHaveBeenCalled();
    expect(getTaskTokenUsage).not.toHaveBeenCalled();
  });

  it("会话累计优先用任务用量的请求次数", async () => {
    renderBar({ usage: createUsage() });

    const bar = await screen.findByTestId(TID_V4_COMPOSER_USAGE_STATUS_BAR);
    await waitFor(() => expect(bar.textContent).toContain("今日"));
    // 会话项展示 outputTokens
    expect(bar.textContent).toContain("8000");
  });

  it("所有查询都失败时仍渲染状态条，不崩", async () => {
    const { services } = createServices({ failAll: true });
    renderBar({ usage: createUsage(), services });

    const bar = await screen.findByTestId(TID_V4_COMPOSER_USAGE_STATUS_BAR);
    expect(bar.textContent).toContain("上下文");
    expect(bar.textContent).toContain("25%");
  });

  it("没有会话数据时回退为占位符", async () => {
    const { services } = createServices({ failAll: true });
    renderBar({ usage: null, services });

    const bar = await screen.findByTestId(TID_V4_COMPOSER_USAGE_STATUS_BAR);
    await waitFor(() => expect(bar.textContent).toContain("上下文"));
    expect(bar.textContent?.match(/—/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("设置面板包含全部七项开关与上下文窗口覆盖", async () => {
    renderBar({ usage: createUsage() });

    const panel = await screen.findByTestId("usage-settings-panel");
    expect(panel.textContent).toContain("上下文");
    expect(panel.textContent).toContain("生成速度");
    expect(panel.textContent).toContain("本轮用量");
    expect(panel.textContent).toContain("会话累计");
    expect(panel.textContent).toContain("工具调用");
    expect(panel.textContent).toContain("今日合计");
    expect(panel.textContent).toContain("子智能体");
    expect(panel.textContent).toContain("中文单位");
    // 七个显示项 + 中文单位 = 8 个 checkbox
    expect(panel.querySelectorAll('input[type="checkbox"]').length).toBe(8);
  });

  it("从本地设置读回已关闭的显示项", async () => {
    window.localStorage.setItem(
      "zcode.composerUsageBar.settings.v1",
      JSON.stringify({ items: { today: false, speed: false } }),
    );
    renderBar({ usage: createUsage() });

    const bar = await screen.findByTestId(TID_V4_COMPOSER_USAGE_STATUS_BAR);
    await waitFor(() =>
      expect(bar.querySelector('[data-testid="usage-item-ctx"]')).not.toBeNull(),
    );
    expect(bar.querySelector('[data-testid="usage-item-today"]')).toBeNull();
    expect(bar.querySelector('[data-testid="usage-item-speed"]')).toBeNull();
  });
});

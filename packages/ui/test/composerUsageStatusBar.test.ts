// @vitest-environment jsdom
import { createElement, type ReactNode } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppUsageSnapshot } from "@zcode/shared";
import type { SessionUsageState } from "@zcode/shared/zcode-protocol-v4";
import type { IServiceAccessor } from "@zcode/services";
import { ZCodeIntlProvider } from "@/i18n/IntlProvider.js";
import { ServiceProvider } from "@/hooks/useServices.js";
import { TID_V4_COMPOSER_USAGE_STATUS_BAR } from "@zcode/shared/test-ids";
import { ComposerUsageStatusBar } from "@/v4/composer/ComposerUsageStatusBar.js";

vi.mock("@/ControlHintTooltip.js", () => ({
  ControlHintTooltip: ({ children, title }: { children: ReactNode; title: string }) =>
    createElement("span", { "data-tooltip-title": title }, children),
}));

function todayKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function createSnapshot(todayTokens: number): AppUsageSnapshot {
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
              toolCallCount: 5,
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

function createServices(getAppUsageSnapshot = vi.fn(async () => createSnapshot(1_234_567))) {
  return {
    usageStatsService: { getAppUsageSnapshot },
  } as unknown as IServiceAccessor;
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
      { services: props.services ?? createServices() },
      createElement(
        ZCodeIntlProvider,
        { initialLocale: "zh-CN" },
        createElement(ComposerUsageStatusBar, {
          usage: props.usage,
          phase: props.phase ?? null,
          enabled: props.enabled,
        }),
      ),
    ),
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ComposerUsageStatusBar", () => {
  it("展示今日、上下文与本会话四项指标", async () => {
    renderBar({ usage: createUsage() });

    const bar = await screen.findByTestId(TID_V4_COMPOSER_USAGE_STATUS_BAR);
    // 今日 token 数来自 7 日快照里的当日格子；zh-CN 的 compact 用「万」而非 M。
    await waitFor(() => expect(bar.textContent).toContain("今日"));
    expect(bar.textContent).toContain("123.5万");
    // 上下文占用 50000/200000 = 25%。
    expect(bar.textContent).toContain("25%");
    // 本会话累计取 outputTokens（8000 不足 1 万，按普通数字展示）。
    expect(bar.textContent).toContain("8000");
    // 没有跑过轮次时速率位显示占位符而不是 0。
    expect(bar.textContent).toContain("—");
  });

  it("enabled=false 时不渲染，也不发起用量查询", async () => {
    const getAppUsageSnapshot = vi.fn(async () => createSnapshot(1));
    const { container } = renderBar({
      usage: createUsage(),
      enabled: false,
      services: createServices(getAppUsageSnapshot),
    });

    expect(container.querySelector(`[data-testid="${TID_V4_COMPOSER_USAGE_STATUS_BAR}"]`)).toBeNull();
    expect(getAppUsageSnapshot).not.toHaveBeenCalled();
  });

  it("没有会话数据时四项指标全部回退为占位符，不显示 0", async () => {
    const services = createServices(vi.fn(async () => createSnapshot(0)));
    renderBar({ usage: null, services });

    const bar = await screen.findByTestId(TID_V4_COMPOSER_USAGE_STATUS_BAR);
    await waitFor(() => expect(bar.textContent).toContain("今日"));
    expect(bar.textContent).toContain("0");
    // 上下文与本会话无数据 → 占位符。
    expect(bar.textContent?.match(/—/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("用量查询失败时不崩，仍渲染状态条", async () => {
    const services = createServices(
      vi.fn(async () => {
        throw new Error("no_active_workspace");
      }),
    );
    renderBar({ usage: createUsage(), services });

    const bar = await screen.findByTestId(TID_V4_COMPOSER_USAGE_STATUS_BAR);
    expect(bar.textContent).toContain("上下文");
    expect(bar.textContent).toContain("25%");
  });

  it("详情入口带可访问名称", async () => {
    renderBar({ usage: createUsage() });

    const bar = await screen.findByTestId(TID_V4_COMPOSER_USAGE_STATUS_BAR);
    const button = bar.querySelector("button");
    expect(button?.getAttribute("aria-label")).toBe("用量明细");
  });
});

import { describe, expect, it } from "vitest";
import type { AppUsageSnapshot } from "@zcode/shared";
import {
  computeTurnRate,
  isTurnEndPhase,
  isTurnRunningPhase,
  resolveContextUsageRatio,
  resolveLocalDateKey,
  resolveTodayUsage,
} from "../src/v4/composer/composerUsageMetrics.js";

function buildSnapshot(cells: Array<{ date: string; totalTokens: number; turnCount: number; toolCallCount: number }>): AppUsageSnapshot {
  return {
    range: "7d",
    generatedAt: 0,
    timeZone: "Asia/Shanghai",
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
    heatmap: {
      startDate: null,
      endDate: null,
      maxTokens: 0,
      weeks: [
        {
          weekIndex: 0,
          days: cells.map((cell) => ({ ...cell, level: 1 as const })),
        },
      ],
    },
    dailyModelUsage: [],
    models: [],
    tools: [],
  };
}

describe("composer 用量状态条计算", () => {
  describe("resolveLocalDateKey", () => {
    it("按指定时区输出 YYYY-MM-DD", () => {
      // 2026-10-19T00:30:00Z 在 UTC+8 已是 10-19 08:30。
      const at = Date.UTC(2026, 9, 19, 0, 30, 0);
      expect(resolveLocalDateKey(at, "Asia/Shanghai")).toBe("2026-10-19");
      expect(resolveLocalDateKey(at, "UTC")).toBe("2026-10-19");
      // 同一天在 UTC-5 仍是 10-18。
      expect(resolveLocalDateKey(at, "America/New_York")).toBe("2026-10-18");
    });

    it("时区非法时回退到 UTC 日期而不是抛错", () => {
      const at = Date.UTC(2026, 9, 19, 12, 0, 0);
      expect(resolveLocalDateKey(at, "Not/AZone")).toBe("2026-10-19");
    });
  });

  describe("resolveTodayUsage", () => {
    const at = Date.UTC(2026, 9, 19, 4, 0, 0); // 上海 12:00

    it("取出当日格子的 tokens、轮次与工具调用数", () => {
      const snapshot = buildSnapshot([
        { date: "2026-10-18", totalTokens: 100, turnCount: 1, toolCallCount: 2 },
        { date: "2026-10-19", totalTokens: 500, turnCount: 3, toolCallCount: 7 },
      ]);

      expect(resolveTodayUsage(snapshot, at)).toEqual({
        totalTokens: 500,
        turnCount: 3,
        toolCallCount: 7,
      });
    });

    it("没有快照或没有当日格子时返回零值而不是抛错", () => {
      expect(resolveTodayUsage(null, at)).toEqual({
        totalTokens: 0,
        turnCount: 0,
        toolCallCount: 0,
      });
      const snapshot = buildSnapshot([
        { date: "2026-10-18", totalTokens: 100, turnCount: 1, toolCallCount: 2 },
      ]);
      expect(resolveTodayUsage(snapshot, at)).toEqual({
        totalTokens: 0,
        turnCount: 0,
        toolCallCount: 0,
      });
    });

    it("跳过空单元格", () => {
      const snapshot = buildSnapshot([
        { date: "2026-10-17", totalTokens: 1, turnCount: 1, toolCallCount: 1 },
        { date: "2026-10-19", totalTokens: 42, turnCount: 2, toolCallCount: 3 },
      ]);
      snapshot.heatmap.weeks[0].days.splice(1, 0, null);

      expect(resolveTodayUsage(snapshot, at).totalTokens).toBe(42);
    });
  });

  describe("phase 判定", () => {
    it("区分运行态与终态", () => {
      expect(isTurnRunningPhase("running")).toBe(true);
      expect(isTurnRunningPhase("prewarming")).toBe(true);
      expect(isTurnRunningPhase("completedSuccess")).toBe(false);

      expect(isTurnEndPhase("completedSuccess")).toBe(true);
      expect(isTurnEndPhase("completedInterrupted")).toBe(true);
      expect(isTurnEndPhase("error")).toBe(true);
      expect(isTurnEndPhase("running")).toBe(false);
      expect(isTurnEndPhase(null)).toBe(false);
    });
  });

  describe("computeTurnRate", () => {
    it("用输出增量除以轮次耗时", () => {
      const sample = computeTurnRate(
        { outputTokens: 1000, startedAtMs: 0 },
        { outputTokens: 3000, endedAtMs: 4000 },
      );

      expect(sample).toEqual({ tokensPerSecond: 500, outputTokens: 2000, durationMs: 4000 });
    });

    it("没有基线、没有新增输出或耗时过短时返回 null", () => {
      expect(computeTurnRate(null, { outputTokens: 3000, endedAtMs: 4000 })).toBeNull();
      expect(
        computeTurnRate(
          { outputTokens: 1000, startedAtMs: 0 },
          { outputTokens: 1000, endedAtMs: 4000 },
        ),
      ).toBeNull();
      // 输出减少（会话被压缩）也不该算出负速率。
      expect(
        computeTurnRate(
          { outputTokens: 1000, startedAtMs: 0 },
          { outputTokens: 500, endedAtMs: 4000 },
        ),
      ).toBeNull();
      // 耗时低于下限：避免除以接近 0 得到荒谬值。
      expect(
        computeTurnRate(
          { outputTokens: 0, startedAtMs: 0 },
          { outputTokens: 50, endedAtMs: 100 },
        ),
      ).toBeNull();
    });

    it("耗时刚好等于下限时正常计算", () => {
      const sample = computeTurnRate(
        { outputTokens: 0, startedAtMs: 0 },
        { outputTokens: 100, endedAtMs: 200 },
      );
      expect(sample?.tokensPerSecond).toBe(500);
    });
  });

  describe("resolveContextUsageRatio", () => {
    const baseUsage = {
      contextWindow: {
        usedTokens: 50_000,
        maxTokens: 200_000,
        autoCompactThresholdTokens: null,
      },
      cumulative: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
    };

    it("返回占用比例", () => {
      expect(resolveContextUsageRatio(baseUsage)).toBeCloseTo(0.25);
    });

    it("上下文缺失或上限非法时返回 null", () => {
      expect(resolveContextUsageRatio(null)).toBeNull();
      expect(
        resolveContextUsageRatio({ ...baseUsage, contextWindow: null }),
      ).toBeNull();
      expect(
        resolveContextUsageRatio({
          ...baseUsage,
          contextWindow: { usedTokens: 1, maxTokens: 0, autoCompactThresholdTokens: null },
        }),
      ).toBeNull();
    });

    it("比例夹紧到 0..1，避免超出上限时进度环溢出", () => {
      expect(
        resolveContextUsageRatio({
          ...baseUsage,
          contextWindow: { usedTokens: 300_000, maxTokens: 200_000, autoCompactThresholdTokens: null },
        }),
      ).toBe(1);
    });
  });
});

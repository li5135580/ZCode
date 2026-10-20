import { describe, expect, it } from "vitest";
import type { AppUsageSnapshot, SessionDebugSnapshot, ZCodeTaskTokenUsageResult } from "@zcode/shared";
import {
  computeTurnRate,
  DEFAULT_USAGE_BAR_ITEMS,
  formatTokens,
  isContextExceededActive,
  isContextExceededErrorCode,
  isTurnEndPhase,
  isTurnRunningPhase,
  parseUsageBarSettings,
  resolveCacheTier,
  resolveContextMaxTokens,
  resolveContextTier,
  resolveContextUsageRatio,
  resolveLatestTurnDetail,
  resolveLocalDateKey,
  resolveSessionCacheHitRate,
  resolveSessionTotals,
  resolveSpeedTier,
  resolveSubagentSummary,
  resolveTodayUsage,
  USAGE_BAR_ITEMS,
} from "../src/v4/composer/composerUsageMetrics.js";

function buildSnapshot(
  cells: Array<{ date: string; totalTokens: number; turnCount: number; toolCallCount: number }>,
): AppUsageSnapshot {
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

function buildDebug(
  rounds: Array<{
    recordedAt: number;
    input?: number;
    output?: number;
    cacheRead?: number;
    reasoning?: number;
    duration?: number | null;
    tps?: number | null;
  }>,
): SessionDebugSnapshot {
  return {
    sessionId: "s1",
    rounds: rounds.map((round, index) => ({
      eventKey: `e${index}`,
      requestId: `r${index}`,
      requestIndex: index,
      recordedAt: round.recordedAt,
      usage: {
        inputTokens: round.input,
        outputTokens: round.output,
        reasoningTokens: round.reasoning,
        cachedInputTokens: round.cacheRead,
      },
      hitRate: null,
      generationDurationMs: round.duration ?? null,
      tokensPerSecond: round.tps ?? null,
    })),
    networkEntries: [],
    cache: null,
  };
}

describe("composer 用量状态条计算", () => {
  describe("设置解析", () => {
    it("空值或损坏的 JSON 回退默认设置", () => {
      expect(parseUsageBarSettings(null).items).toEqual(DEFAULT_USAGE_BAR_ITEMS);
      expect(parseUsageBarSettings("{not json").items).toEqual(DEFAULT_USAGE_BAR_ITEMS);
    });

    it("只接受已知显示项的布尔值", () => {
      const parsed = parseUsageBarSettings(
        JSON.stringify({ items: { ctx: false, tools: true, bogus: true } }),
      );
      expect(parsed.items.ctx).toBe(false);
      expect(parsed.items.tools).toBe(true);
      expect(parsed.items.speed).toBe(DEFAULT_USAGE_BAR_ITEMS.speed);
    });

    it("上下文覆盖只接受正数", () => {
      expect(parseUsageBarSettings(JSON.stringify({ contextWindowOverride: 200000 }))
        .contextWindowOverride).toBe(200000);
      expect(parseUsageBarSettings(JSON.stringify({ contextWindowOverride: -1 }))
        .contextWindowOverride).toBeNull();
      expect(parseUsageBarSettings(JSON.stringify({ contextWindowOverride: "x" }))
        .contextWindowOverride).toBeNull();
    });

    it("字号默认 12px，并夹在合理范围内", () => {
      expect(parseUsageBarSettings(null).fontSize).toBe(12);
      expect(parseUsageBarSettings(JSON.stringify({ fontSize: 14 })).fontSize).toBe(14);
      expect(parseUsageBarSettings(JSON.stringify({ fontSize: 2 })).fontSize).toBe(9);
      expect(parseUsageBarSettings(JSON.stringify({ fontSize: 99 })).fontSize).toBe(18);
      expect(parseUsageBarSettings(JSON.stringify({ fontSize: "big" })).fontSize).toBe(12);
    });

    it("显示项清单覆盖插件里的七项", () => {
      expect([...USAGE_BAR_ITEMS]).toEqual([
        "ctx",
        "speed",
        "turn",
        "session",
        "tools",
        "today",
        "sub",
      ]);
    });
  });

  describe("格式化", () => {
    it("中文单位与英文缩写可切换", () => {
      expect(formatTokens("zh-CN", 1_234_567, true)).toContain("万");
      expect(formatTokens("zh-CN", 1_234_567, false)).toMatch(/M/);
      // 英文界面忽略该开关。
      expect(formatTokens("en-US", 1_234_567, true)).toMatch(/M/);
    });
  });

  describe("分级", () => {
    it("上下文按 50%/75% 分档", () => {
      expect(resolveContextTier(0.3)).toBe("ok");
      expect(resolveContextTier(0.6)).toBe("warm");
      expect(resolveContextTier(0.9)).toBe("hot");
      expect(resolveContextTier(null)).toBe("ok");
    });

    it("速度按 20/60 tok/s 分档", () => {
      expect(resolveSpeedTier(10)).toBe("hot");
      expect(resolveSpeedTier(40)).toBe("warm");
      expect(resolveSpeedTier(100)).toBe("ok");
      expect(resolveSpeedTier(null)).toBe("ok");
    });

    it("缓存命中按 20%/50% 分档，未知不上色", () => {
      expect(resolveCacheTier(0.1)).toBe("hot");
      expect(resolveCacheTier(0.3)).toBe("warm");
      expect(resolveCacheTier(0.8)).toBe("ok");
      expect(resolveCacheTier(null)).toBe("ok");
    });
  });

  describe("resolveLocalDateKey", () => {
    it("按指定时区输出 YYYY-MM-DD", () => {
      const at = Date.UTC(2026, 9, 19, 0, 30, 0);
      expect(resolveLocalDateKey(at, "Asia/Shanghai")).toBe("2026-10-19");
      expect(resolveLocalDateKey(at, "America/New_York")).toBe("2026-10-18");
    });

    it("时区非法时回退到 UTC 日期而不是抛错", () => {
      const at = Date.UTC(2026, 9, 19, 12, 0, 0);
      expect(resolveLocalDateKey(at, "Not/AZone")).toBe("2026-10-19");
    });
  });

  describe("resolveTodayUsage", () => {
    const at = Date.UTC(2026, 9, 19, 4, 0, 0);

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
      expect(resolveTodayUsage(snapshot, at).totalTokens).toBe(0);
    });
  });

  describe("phase 判定", () => {
    it("区分运行态与终态", () => {
      expect(isTurnRunningPhase("running")).toBe(true);
      expect(isTurnRunningPhase("prewarming")).toBe(true);
      expect(isTurnRunningPhase("completedSuccess")).toBe(false);
      expect(isTurnEndPhase("completedSuccess")).toBe(true);
      expect(isTurnEndPhase("error")).toBe(true);
      expect(isTurnEndPhase("running")).toBe(false);
      expect(isTurnEndPhase(null)).toBe(false);
    });
  });

  describe("computeTurnRate", () => {
    it("用输出增量除以轮次耗时", () => {
      expect(
        computeTurnRate(
          { outputTokens: 1000, startedAtMs: 0 },
          { outputTokens: 3000, endedAtMs: 4000 },
        ),
      ).toEqual({ tokensPerSecond: 500, outputTokens: 2000, durationMs: 4000 });
    });

    it("没有基线、没有新增输出或耗时过短时返回 null", () => {
      expect(computeTurnRate(null, { outputTokens: 3000, endedAtMs: 4000 })).toBeNull();
      expect(
        computeTurnRate(
          { outputTokens: 1000, startedAtMs: 0 },
          { outputTokens: 1000, endedAtMs: 4000 },
        ),
      ).toBeNull();
      expect(
        computeTurnRate(
          { outputTokens: 0, startedAtMs: 0 },
          { outputTokens: 50, endedAtMs: 100 },
        ),
      ).toBeNull();
    });

    it("拒绝超出物理上限的墙钟估算", () => {
      // 起点在轮次中途才建立时，增量会被压缩到极短耗时里：5000 tokens / 300ms
      // 会算出 16667 t/s。这是口径错位，不是真的快。
      expect(
        computeTurnRate(
          { outputTokens: 0, startedAtMs: 0 },
          { outputTokens: 5000, endedAtMs: 300 },
        ),
      ).toBeNull();
    });
  });

  describe("resolveLatestTurnDetail", () => {
    it("汇总最近一轮的多段请求", () => {
      const debug = buildDebug([
        { recordedAt: 1000, input: 100, output: 50, cacheRead: 40, duration: 500, tps: 100 },
        { recordedAt: 3000, input: 200, output: 150, cacheRead: 100, duration: 1500, tps: 100 },
      ]);

      const detail = resolveLatestTurnDetail(debug);
      expect(detail).toEqual({
        inputTokens: 300,
        outputTokens: 200,
        cacheReadTokens: 140,
        reasoningTokens: 0,
        cacheHitRate: 140 / 300,
        generationDurationMs: 2000,
        tokensPerSecond: 100,
        requestCount: 2,
      });
    });

    it("时间断档超过 10 分钟视为上一轮，不计入", () => {
      const debug = buildDebug([
        { recordedAt: 1000, input: 999, output: 999 },
        { recordedAt: 20 * 60 * 1000, input: 10, output: 20 },
      ]);

      const detail = resolveLatestTurnDetail(debug);
      expect(detail?.outputTokens).toBe(20);
      expect(detail?.requestCount).toBe(1);
    });

    it("没有轮次时返回 null", () => {
      expect(resolveLatestTurnDetail(null)).toBeNull();
      expect(resolveLatestTurnDetail(buildDebug([]))).toBeNull();
    });

    it("输入为 0 时缓存命中率为 null 而不是 Infinity", () => {
      const detail = resolveLatestTurnDetail(buildDebug([{ recordedAt: 1, input: 0, output: 5 }]));
      expect(detail?.cacheHitRate).toBeNull();
    });

    it("最新一段缺速率时保留前一段的有效值", () => {
      const debug = buildDebug([
        { recordedAt: 1000, input: 100, output: 50, duration: 500, tps: 100 },
        // 这一段缺首字延迟，tokensPerSecond 为 null
        { recordedAt: 2000, input: 100, output: 80, duration: 500, tps: null },
      ]);

      expect(resolveLatestTurnDetail(debug)?.tokensPerSecond).toBe(100);
    });

    it("所有段都没有速率时用累计输出 ÷ 累计生成耗时兜底", () => {
      const debug = buildDebug([
        { recordedAt: 1000, input: 100, output: 100, duration: 500, tps: null },
        { recordedAt: 2000, input: 100, output: 100, duration: 500, tps: null },
      ]);

      // 200 tokens / 1000ms = 200 tok/s
      expect(resolveLatestTurnDetail(debug)?.tokensPerSecond).toBeCloseTo(200);
    });

    it("丢弃超出物理上限的速率，避免分母失真时显示上万 t/s", () => {
      const debug = buildDebug([
        // 中转缓冲导致 generationDurationMs 塌成 74ms，算出 8000 t/s
        { recordedAt: 1000, input: 100, output: 592, duration: 74, tps: 8000 },
      ]);

      const detail = resolveLatestTurnDetail(debug);
      expect(detail?.tokensPerSecond).toBeNull();
      // 失真的耗时同样不能展示（否则会显示「生成耗时 0.1s」）
      expect(detail?.generationDurationMs).toBeNull();
    });

    it("前一段可信时，后面超限的段不会覆盖它", () => {
      const debug = buildDebug([
        { recordedAt: 1000, input: 100, output: 200, duration: 2000, tps: 100 },
        { recordedAt: 2000, input: 100, output: 592, duration: 74, tps: 8000 },
      ]);

      expect(resolveLatestTurnDetail(debug)?.tokensPerSecond).toBe(100);
    });

    it("兜底时分子只算有耗时的那几段，避免分母缺失导致速率虚高", () => {
      // 第 1 段没有生成耗时（缺首字延迟），输出 5000；第 2 段有耗时 1000ms，输出 100。
      // 若用全部输出 5100 ÷ 1000ms 会得到 5100 t/s；正确口径是 100 ÷ 1000ms = 100。
      const debug = buildDebug([
        { recordedAt: 1000, input: 100, output: 5000, duration: null, tps: null },
        { recordedAt: 2000, input: 100, output: 100, duration: 1000, tps: null },
      ]);

      expect(resolveLatestTurnDetail(debug)?.tokensPerSecond).toBeCloseTo(100);
    });
  });

  describe("上下文", () => {
    const usage = {
      contextWindow: { usedTokens: 50_000, maxTokens: 200_000, autoCompactThresholdTokens: null },
      cumulative: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    };

    it("返回占用比例", () => {
      expect(resolveContextUsageRatio(usage)).toBeCloseTo(0.25);
    });

    it("用户覆盖的窗口容量优先", () => {
      expect(resolveContextMaxTokens(usage, 100_000)).toBe(100_000);
      expect(resolveContextUsageRatio(usage, 100_000)).toBeCloseTo(0.5);
    });

    it("上下文缺失或上限非法时返回 null", () => {
      expect(resolveContextUsageRatio(null)).toBeNull();
      expect(resolveContextUsageRatio({ ...usage, contextWindow: null })).toBeNull();
      expect(
        resolveContextUsageRatio({
          ...usage,
          contextWindow: { usedTokens: 1, maxTokens: 0, autoCompactThresholdTokens: null },
        }),
      ).toBeNull();
    });

    it("比例夹紧到 0..1", () => {
      expect(
        resolveContextUsageRatio({
          ...usage,
          contextWindow: { usedTokens: 300_000, maxTokens: 200_000, autoCompactThresholdTokens: null },
        }),
      ).toBe(1);
    });
  });

  describe("会话累计", () => {    const taskUsage = {
      sessionId: "s1",
      totalTokens: 1000,
      inputTokens: 800,
      outputTokens: 200,
      reasoningTokens: 0,
      cacheCreationTokens: 50,
      cacheReadTokens: 400,
      modelRequestCount: 7,
      modelErrorCount: 0,
      inputBaselineBySource: {},
    } satisfies ZCodeTaskTokenUsageResult;

    it("优先用任务用量（含请求次数）", () => {
      const totals = resolveSessionTotals(taskUsage, null);
      expect(totals).toEqual({
        inputTokens: 800,
        outputTokens: 200,
        cacheReadTokens: 400,
        cacheWriteTokens: 50,
        requestCount: 7,
      });
      expect(resolveSessionCacheHitRate(totals)).toBeCloseTo(0.5);
    });

    it("任务用量不可用时退回快照 cumulative", () => {
      const totals = resolveSessionTotals(null, {
        contextWindow: null,
        cumulative: {
          inputTokens: 100,
          outputTokens: 30,
          cacheReadTokens: 20,
          cacheWriteTokens: 5,
        },
      });
      expect(totals?.outputTokens).toBe(30);
      expect(totals?.requestCount).toBeNull();
    });

    it("两者都缺时返回 null", () => {
      expect(resolveSessionTotals(null, null)).toBeNull();
      expect(resolveSessionCacheHitRate(null)).toBeNull();
    });
  });

  describe("子智能体汇总", () => {
    it("统计运行中、需关注与已结束数量", () => {
      const summary = resolveSubagentSummary({
        running: [{ status: "running" }, { status: "blocked" }, { status: "waiting" }],
        ended: {
          total: 12,
          items: [
            {
              childSessionId: "c1",
              title: "分析依赖",
              subagentType: "explore",
              status: "success",
              startedAt: 1000,
              endedAt: 4000,
            },
          ],
        },
      });

      expect(summary.runningCount).toBe(3);
      expect(summary.attentionCount).toBe(2);
      expect(summary.endedTotal).toBe(12);
      expect(summary.recent[0]).toEqual({
        childSessionId: "c1",
        title: "分析依赖",
        subagentType: "explore",
        status: "success",
        durationMs: 3000,
      });
    });

    it("缺数据时返回零值而不是抛错", () => {
      expect(resolveSubagentSummary(null)).toEqual({
        runningCount: 0,
        attentionCount: 0,
        endedTotal: 0,
        recent: [],
      });
    });

    it("已结束列表按 limit 截断", () => {
      const items = Array.from({ length: 20 }, (_, index) => ({
        childSessionId: `c${index}`,
        title: `t${index}`,
        subagentType: "x",
        status: "success",
      }));
      const summary = resolveSubagentSummary({ ended: { total: 20, items } }, 5);
      expect(summary.recent).toHaveLength(5);
    });
  });

  describe("上下文超限判定", () => {
    it("识别 CLI 归一化的超限错误码", () => {
      expect(isContextExceededErrorCode("context_length_exceeded")).toBe(true);
      expect(isContextExceededErrorCode("prompt_too_long")).toBe(true);
      expect(isContextExceededErrorCode("ModelContextExceeded")).toBe(true);
      // 供应商把模型名塞进 code 时也能命中
      expect(isContextExceededErrorCode("glm_5_context_window_exceeded")).toBe(true);
      expect(isContextExceededErrorCode("rate_limited")).toBe(false);
      expect(isContextExceededErrorCode(null)).toBe(false);
    });

    it("只在 error 阶段提示，恢复后不残留", () => {
      expect(
        isContextExceededActive({ lastErrorCode: "context_length_exceeded", phase: "error" }),
      ).toBe(true);
      expect(
        isContextExceededActive({
          lastErrorCode: "context_length_exceeded",
          phase: "completedSuccess",
        }),
      ).toBe(false);
      expect(isContextExceededActive({ lastErrorCode: "rate_limited", phase: "error" })).toBe(
        false,
      );
    });
  });
});

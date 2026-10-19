import { memo, useMemo } from "react";
import { TID_V4_COMPOSER_USAGE_STATUS_BAR } from "@zcode/shared/test-ids";
import type { SessionUsageState } from "@zcode/shared/zcode-protocol-v4";
import { cn } from "@/components/lib/utils.js";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { formatCompactTokenNumber } from "@/lib/tokenNumberFormat.js";
import {
  resolveContextUsageRatio,
  resolveTodayUsage,
  type TodayUsageSummary,
} from "@/v4/composer/composerUsageMetrics.js";
import { useComposerUsageStatusBar } from "@/v4/composer/useComposerUsageStatusBar.js";

export interface ComposerUsageStatusBarProps {
  usage: SessionUsageState | null;
  phase: string | null;
  enabled?: boolean;
  className?: string;
}

function formatRate(locale: string, value: number): string {
  return new Intl.NumberFormat(locale || undefined, {
    maximumFractionDigits: value >= 100 ? 0 : 1,
  }).format(value);
}

function formatPercent(locale: string, ratio: number): string {
  return new Intl.NumberFormat(locale || undefined, {
    style: "percent",
    maximumFractionDigits: ratio >= 0.1 ? 0 : 1,
  }).format(ratio);
}

function StatItem({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <span className="flex shrink-0 items-baseline gap-1" title={title}>
      <span className="text-foreground-subtle/80">{label}</span>
      <span className="font-mono text-foreground-subtle tabular-nums">{value}</span>
    </span>
  );
}

/**
 * composer 下方的 token 用量状态条。
 *
 * 设计取舍：
 * - 常驻但极轻量（一行、无边框、无背景），不抢输入框的视觉重心；
 * - 四项指标平铺，悬停看明细，避免为低频信息打开弹窗；
 * - 数据全部本地可得，不上传、不联网。
 */
export const ComposerUsageStatusBar = memo(function ComposerUsageStatusBar({
  usage,
  phase,
  enabled = true,
  className,
}: ComposerUsageStatusBarProps) {
  const { intl, locale } = useZCodeIntl();
  const { todaySnapshot, turnRate, available } = useComposerUsageStatusBar({
    usage,
    phase,
    enabled,
  });

  const today: TodayUsageSummary = useMemo(() => {
    // 只用于挑选「今天」那一格；快照变化时重算即可。
    return resolveTodayUsage(todaySnapshot, Date.now());
  }, [todaySnapshot]);
  const contextRatio = useMemo(() => resolveContextUsageRatio(usage), [usage]);

  if (!enabled || !available) {
    return null;
  }

  const contextWindow = usage?.contextWindow;
  const cumulative = usage?.cumulative;
  const hasAnyData = Boolean(todaySnapshot) || Boolean(contextWindow) || Boolean(cumulative);
  const placeholder = intl.formatMessage({ id: "chat.composerUsage.placeholder" });

  const detailLines: string[] = [];
  detailLines.push(
    intl.formatMessage(
      { id: "chat.composerUsage.detailToday" },
      {
        tokens: formatCompactTokenNumber(locale, today.totalTokens),
        turns: today.turnCount,
        tools: today.toolCallCount,
      },
    ),
  );
  if (cumulative) {
    detailLines.push(
      intl.formatMessage(
        { id: "chat.composerUsage.detailSession" },
        {
          input: formatCompactTokenNumber(locale, cumulative.inputTokens),
          output: formatCompactTokenNumber(locale, cumulative.outputTokens),
          cacheRead: formatCompactTokenNumber(locale, cumulative.cacheReadTokens),
          cacheWrite: formatCompactTokenNumber(locale, cumulative.cacheWriteTokens),
        },
      ),
    );
  }
  if (contextWindow && contextRatio !== null) {
    detailLines.push(
      intl.formatMessage(
        { id: "chat.composerUsage.detailContext" },
        {
          used: formatCompactTokenNumber(locale, contextWindow.usedTokens),
          max: formatCompactTokenNumber(locale, contextWindow.maxTokens),
          percent: formatPercent(locale, contextRatio),
        },
      ),
    );
  }

  return (
    <div
      data-testid={TID_V4_COMPOSER_USAGE_STATUS_BAR}
      className={cn(
        "flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-1 pt-1 text-ui-xs text-foreground-subtle",
        className,
      )}
    >
      <StatItem
        label={intl.formatMessage({ id: "chat.composerUsage.today" })}
        value={hasAnyData ? formatCompactTokenNumber(locale, today.totalTokens) : placeholder}
      />
      <StatItem
        label={intl.formatMessage({ id: "chat.composerUsage.rate" })}
        value={
          turnRate
            ? `${formatRate(locale, turnRate.tokensPerSecond)} ${intl.formatMessage({ id: "chat.composerUsage.rateUnit" })}`
            : "—"
        }
        title={
          turnRate
            ? intl.formatMessage(
                { id: "chat.composerUsage.rateTitle" },
                {
                  tokens: formatCompactTokenNumber(locale, turnRate.outputTokens),
                  seconds: formatRate(locale, turnRate.durationMs / 1000),
                },
              )
            : undefined
        }
      />
      <StatItem
        label={intl.formatMessage({ id: "chat.composerUsage.context" })}
        value={contextRatio !== null ? formatPercent(locale, contextRatio) : placeholder}
        title={
          contextWindow
            ? intl.formatMessage(
                { id: "chat.composerUsage.contextTitle" },
                {
                  used: formatCompactTokenNumber(locale, contextWindow.usedTokens),
                  max: formatCompactTokenNumber(locale, contextWindow.maxTokens),
                },
              )
            : undefined
        }
      />
      <StatItem
        label={intl.formatMessage({ id: "chat.composerUsage.session" })}
        value={cumulative ? formatCompactTokenNumber(locale, cumulative.outputTokens) : placeholder}
        title={
          cumulative
            ? intl.formatMessage(
                { id: "chat.composerUsage.sessionTitle" },
                {
                  input: formatCompactTokenNumber(locale, cumulative.inputTokens),
                  output: formatCompactTokenNumber(locale, cumulative.outputTokens),
                },
              )
            : undefined
        }
      />
      <ControlHintTooltip
        title={intl.formatMessage({ id: "chat.composerUsage.detailTitle" })}
        description={detailLines.join("\n")}
        side="top"
        align="end"
      >
        <button
          type="button"
          aria-label={intl.formatMessage({ id: "chat.composerUsage.detailTitle" })}
          className="ml-auto shrink-0 rounded px-1 text-foreground-subtle/70 hover:text-foreground-subtle focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {intl.formatMessage({ id: "chat.composerUsage.detailAction" })}
        </button>
      </ControlHintTooltip>
    </div>
  );
});

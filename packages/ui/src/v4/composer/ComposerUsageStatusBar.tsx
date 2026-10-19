import { memo, useCallback, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, Settings2 } from "lucide-react";
import { TID_V4_COMPOSER_USAGE_STATUS_BAR } from "@zcode/shared/test-ids";
import type { SessionUsageState } from "@zcode/shared/zcode-protocol-v4";
import { cn } from "@/components/lib/utils.js";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.js";
import { Checkbox } from "@/components/ui/checkbox.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import {
  formatDuration,
  formatPercent,
  formatRate,
  formatTokens,
  resolveContextMaxTokens,
  resolveContextTier,
  resolveContextUsageRatio,
  resolveSessionCacheHitRate,
  resolveSessionTotals,
  resolveSpeedTier,
  resolveTodayUsage,
  isContextExceededActive,
  USAGE_BAR_ITEMS,
  writeUsageBarSettings,
  type UsageBarItem,
  type UsageBarSettings,
  type UsageTier,
} from "@/v4/composer/composerUsageMetrics.js";
import { useComposerUsageStatusBar } from "@/v4/composer/useComposerUsageStatusBar.js";

export interface ComposerUsageStatusBarProps {
  usage: SessionUsageState | null;
  phase: string | null;
  /** 会话最近一次错误的 code；用于判定上下文超限。 */
  lastErrorCode?: string | null;
  enabled?: boolean;
  className?: string;
  workspacePath?: string;
  workspaceIdentity?: string;
  sessionId?: string | null;
}

const TIER_CLASS: Record<UsageTier, string> = {
  ok: "text-foreground-subtle",
  warm: "text-[var(--color-warning)]",
  hot: "text-[var(--color-danger)]",
};

const BAR_TRACK_CLASS = "h-1 w-10 overflow-hidden rounded-full bg-foreground/10";
const TIER_BG: Record<UsageTier, string> = {
  ok: "bg-foreground/40",
  warm: "bg-[var(--color-warning)]",
  hot: "bg-[var(--color-danger)]",
};

function Item({
  label,
  children,
  title,
  testId,
}: {
  label: string;
  children: React.ReactNode;
  title?: string;
  testId?: string;
}) {
  return (
    <span className="flex shrink-0 items-baseline gap-1" title={title} data-testid={testId}>
      <span className="text-foreground-subtle/70">{label}</span>
      {children}
    </span>
  );
}

/** 上下文进度条 + 百分比，颜色随占比变化。 */
function ContextMeter({
  ratio,
  tier,
  label,
}: {
  ratio: number | null;
  tier: UsageTier;
  label: string;
}) {
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <span className="text-foreground-subtle/70">{label}</span>
      <span className={BAR_TRACK_CLASS} aria-hidden="true">
        <span
          className={cn("block h-full transition-[width] duration-300", TIER_BG[tier])}
          style={{ width: `${Math.round((ratio ?? 0) * 100)}%` }}
        />
      </span>
      <span className={cn("font-mono tabular-nums", TIER_CLASS[tier])}>
        {ratio === null ? "—" : formatPercent("en-US", ratio)}
      </span>
    </span>
  );
}

/**
 * composer 下方的 token 用量状态条。
 *
 * 设计取舍：
 * - 常驻但极轻量（一行、无边框、无背景），不抢输入框的视觉重心；
 * - 指标可逐项开关，设置存 localStorage（与插件一致，属设备级偏好）；
 * - 数据全部本地可得，不上传、不联网；
 * - 每轮结束刷新一次，运行中不轮询。
 */
export const ComposerUsageStatusBar = memo(function ComposerUsageStatusBar({
  usage,
  phase,
  lastErrorCode = null,
  enabled = true,
  className,
  workspacePath,
  workspaceIdentity,
  sessionId,
}: ComposerUsageStatusBarProps) {
  const { intl, locale } = useZCodeIntl();
  const {
    settings,
    updateSettings,
    todaySnapshot,
    turnRate,
    turnDetail,
    taskUsage,
    subagents,
    available,
  } = useComposerUsageStatusBar({
    usage,
    phase,
    enabled,
    workspacePath,
    workspaceIdentity,
    sessionId,
  });

  const [settingsOpen, setSettingsOpen] = useState(false);

  const today = useMemo(() => resolveTodayUsage(todaySnapshot, Date.now()), [todaySnapshot]);
  const contextMax = useMemo(
    () => resolveContextMaxTokens(usage, settings.contextWindowOverride),
    [settings.contextWindowOverride, usage],
  );
  const contextRatio = useMemo(
    () => resolveContextUsageRatio(usage, settings.contextWindowOverride),
    [settings.contextWindowOverride, usage],
  );
  const contextTier = resolveContextTier(contextRatio);
  const sessionTotals = useMemo(() => resolveSessionTotals(taskUsage, usage), [taskUsage, usage]);
  const sessionHitRate = resolveSessionCacheHitRate(sessionTotals);

  // 超限状态由会话最近一次错误判定：CLI 已把这类失败归一成固定标记集，
  // 拿不到错误时自然为 false，不会误报。
  const contextExceeded = useMemo(
    () => isContextExceededActive({ lastErrorCode: lastErrorCode, phase }),
    [lastErrorCode, phase],
  );

  // 速率优先用逐轮事实（数据库口径），退回本地推算值。
  const effectiveRate = turnDetail?.tokensPerSecond ?? turnRate?.tokensPerSecond ?? null;
  const speedTier = resolveSpeedTier(effectiveRate);

  const toggleItem = useCallback(
    (item: UsageBarItem, checked: boolean) => {
      const next: UsageBarSettings = {
        ...settings,
        items: { ...settings.items, [item]: checked },
      };
      updateSettings(next);
      writeUsageBarSettings(next);
    },
    [settings, updateSettings],
  );

  const setContextOverride = useCallback(
    (raw: string) => {
      const parsed = Number.parseInt(raw, 10);
      const next: UsageBarSettings = {
        ...settings,
        contextWindowOverride: Number.isFinite(parsed) && parsed > 0 ? parsed : null,
      };
      updateSettings(next);
      writeUsageBarSettings(next);
    },
    [settings, updateSettings],
  );

  const setChineseUnits = useCallback(
    (checked: boolean) => {
      const next: UsageBarSettings = { ...settings, useChineseUnits: checked };
      updateSettings(next);
      writeUsageBarSettings(next);
    },
    [settings, updateSettings],
  );

  if (!enabled || !available) {
    return null;
  }

  const tokens = (value: number) => formatTokens(locale, value, settings.useChineseUnits);
  const placeholder = "—";
  const anyItemVisible = USAGE_BAR_ITEMS.some((item) => settings.items[item]);

  const items: Array<{ key: UsageBarItem; node: React.ReactNode }> = [];

  if (settings.items.ctx) {
    items.push({
      key: "ctx",
      node: (
        <ContextMeter
          key="ctx"
          ratio={contextRatio}
          tier={contextTier}
          label={intl.formatMessage({ id: "chat.composerUsage.context" })}
        />
      ),
    });
  }

  if (settings.items.speed) {
    items.push({
      key: "speed",
      node: (
        <Item
          key="speed"
          label={intl.formatMessage({ id: "chat.composerUsage.speed" })}
          title={
            effectiveRate !== null
              ? intl.formatMessage({ id: "chat.composerUsage.speedTitle" })
              : undefined
          }
        >
          <span className={cn("font-mono tabular-nums", TIER_CLASS[speedTier])}>
            {effectiveRate === null ? placeholder : `${formatRate(locale, effectiveRate)}`}
          </span>
        </Item>
      ),
    });
  }

  if (settings.items.turn) {
    const detail = turnDetail;
    items.push({
      key: "turn",
      node: (
        <Item
          key="turn"
          label={intl.formatMessage({ id: "chat.composerUsage.turn" })}
          title={
            detail
              ? intl.formatMessage(
                  { id: "chat.composerUsage.turnTitle" },
                  {
                    input: tokens(detail.inputTokens),
                    output: tokens(detail.outputTokens),
                    cache: detail.cacheHitRate === null
                      ? placeholder
                      : formatPercent(locale, detail.cacheHitRate),
                    duration:
                      detail.generationDurationMs === null
                        ? placeholder
                        : formatDuration(detail.generationDurationMs / 1000),
                    segments: detail.requestCount,
                  },
                )
              : undefined
          }
        >
          <span className="font-mono tabular-nums text-foreground-subtle">
            {detail ? tokens(detail.outputTokens) : placeholder}
          </span>
        </Item>
      ),
    });
  }

  if (settings.items.session) {
    items.push({
      key: "session",
      node: (
        <Item
          key="session"
          label={intl.formatMessage({ id: "chat.composerUsage.session" })}
          title={
            sessionTotals
              ? intl.formatMessage(
                  { id: "chat.composerUsage.sessionTitle" },
                  {
                    input: tokens(sessionTotals.inputTokens),
                    output: tokens(sessionTotals.outputTokens),
                    cache: sessionHitRate === null ? placeholder : formatPercent(locale, sessionHitRate),
                    requests: sessionTotals.requestCount ?? placeholder,
                  },
                )
              : undefined
          }
        >
          <span className="font-mono tabular-nums text-foreground-subtle">
            {sessionTotals ? tokens(sessionTotals.outputTokens) : placeholder}
          </span>
        </Item>
      ),
    });
  }

  if (settings.items.tools) {
    items.push({
      key: "tools",
      node: (
        <Item
          key="tools"
          label={intl.formatMessage({ id: "chat.composerUsage.tools" })}
          title={intl.formatMessage({ id: "chat.composerUsage.toolsTitle" })}
        >
          <span className="font-mono tabular-nums text-foreground-subtle">
            {today.toolCallCount > 0 ? today.toolCallCount : placeholder}
          </span>
        </Item>
      ),
    });
  }

  if (settings.items.today) {
    items.push({
      key: "today",
      node: (
        <Item
          key="today"
          label={intl.formatMessage({ id: "chat.composerUsage.today" })}
          title={
            todaySnapshot
              ? intl.formatMessage(
                  { id: "chat.composerUsage.todayTitle" },
                  { turns: today.turnCount, tools: today.toolCallCount },
                )
              : undefined
          }
        >
          <span className="font-mono tabular-nums text-foreground-subtle">
            {todaySnapshot ? tokens(today.totalTokens) : placeholder}
          </span>
        </Item>
      ),
    });
  }

  if (settings.items.sub) {
    const runningCount = subagents?.runningCount ?? 0;
    const attention = (subagents?.attentionCount ?? 0) > 0;
    items.push({
      key: "sub",
      node: (
        <span
          key="sub"
          className="flex shrink-0 items-center gap-1"
          title={
            subagents
              ? intl.formatMessage(
                  { id: "chat.composerUsage.subTitle" },
                  { running: runningCount, ended: subagents.endedTotal },
                )
              : undefined
          }
        >
          <span className="text-foreground-subtle/70">
            {intl.formatMessage({ id: "chat.composerUsage.sub" })}
          </span>
          <span
            className={cn(
              "inline-block size-1.5 rounded-full",
              attention
                ? "animate-pulse bg-[var(--color-warning)]"
                : runningCount > 0
                  ? "animate-pulse bg-[var(--color-success)]"
                  : "bg-foreground/30",
            )}
            aria-hidden="true"
          />
          <span className="font-mono tabular-nums text-foreground-subtle">
            {runningCount > 0 ? runningCount : placeholder}
          </span>
        </span>
      ),
    });
  }

  return (
    <div
      data-testid={TID_V4_COMPOSER_USAGE_STATUS_BAR}
      className={cn(
        "flex w-full items-center gap-x-3 overflow-hidden px-1 pt-1 text-ui-xs text-foreground-subtle",
        className,
      )}
    >
      {items.map((item) => item.node)}
      {!anyItemVisible ? (
        <span className="truncate text-foreground-subtle/60">
          {intl.formatMessage({ id: "chat.composerUsage.allHidden" })}
        </span>
      ) : null}
      {contextExceeded ? (
        // 上下文超限：最近一次请求被拒且此后没有成功请求。
        // 只给结论和出路，不堆错误原文——具体报错在会话的错误横幅里已有。
        <span
          className="flex shrink-0 items-center gap-1 text-[var(--color-danger)]"
          title={intl.formatMessage({ id: "chat.composerUsage.contextExceededHint" })}
        >
          <AlertTriangle className="size-3" aria-hidden="true" />
          {intl.formatMessage({ id: "chat.composerUsage.contextExceeded" })}
        </span>
      ) : null}

      <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={intl.formatMessage({ id: "chat.composerUsage.settings" })}
            className="ml-auto flex shrink-0 items-center gap-0.5 rounded px-1 text-foreground-subtle/70 hover:text-foreground-subtle focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <Settings2 className="size-3" aria-hidden="true" />
            <ChevronDown className="size-2.5" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" side="top" className="w-64 gap-2 p-3">
          <div className="text-ui-sm font-medium text-foreground">
            {intl.formatMessage({ id: "chat.composerUsage.settings" })}
          </div>
          <div className="flex flex-col gap-1.5">
            {USAGE_BAR_ITEMS.map((item) => (
              <label key={item} className="flex cursor-pointer items-center gap-2 text-ui-xs">
                <Checkbox
                  checked={settings.items[item]}
                  onCheckedChange={(checked) => toggleItem(item, checked === true)}
                />
                <span className="min-w-0 flex-1">
                  {intl.formatMessage({ id: `chat.composerUsage.item.${item}` })}
                </span>
              </label>
            ))}
          </div>

          <div className="my-1 h-px bg-border" />

          <label className="flex flex-col gap-1 text-ui-xs">
            <span className="text-foreground">
              {intl.formatMessage({ id: "chat.composerUsage.contextOverride" })}
            </span>
            <input
              type="text"
              inputMode="numeric"
              defaultValue={settings.contextWindowOverride ?? ""}
              placeholder={contextMax ? String(contextMax) : "auto"}
              onChange={(event) => setContextOverride(event.currentTarget.value)}
              className="w-full rounded border border-border bg-background px-2 py-1 font-mono text-ui-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <span className="text-foreground-subtle/70">
              {intl.formatMessage({ id: "chat.composerUsage.contextOverrideHint" })}
            </span>
          </label>

          <label className="flex cursor-pointer items-center gap-2 text-ui-xs">
            <Checkbox
              checked={settings.useChineseUnits}
              onCheckedChange={(checked) => setChineseUnits(checked === true)}
            />
            <span className="min-w-0 flex-1">
              {intl.formatMessage({ id: "chat.composerUsage.chineseUnits" })}
            </span>
          </label>
        </PopoverContent>
      </Popover>
    </div>
  );
});

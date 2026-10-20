import { memo, useCallback, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bot,
  CalendarDays,
  ChevronDown,
  MessageSquare,
  Settings2,
  Wrench,
  Zap,
} from "lucide-react";
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
  isContextExceededActive,
  MAX_PLAUSIBLE_TPS,
  resolveCacheTier,
  resolveContextMaxTokens,
  resolveContextTier,
  resolveContextUsageRatio,
  resolveSessionCacheHitRate,
  resolveSessionTotals,
  resolveSpeedTier,
  resolveTodayUsage,
  USAGE_BAR_FONT_SIZES,
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

/** 三档状态色。与插件一致：绿/黄/红都用高对比自调值，不用语法高亮色板。 */
const TIER_TEXT: Record<UsageTier, string> = {
  ok: "text-[#3ecf8e]",
  warm: "text-[#f5b944]",
  hot: "text-[#ff6b57]",
};
const TIER_BG: Record<UsageTier, string> = {
  ok: "bg-[#3ecf8e]",
  warm: "bg-[#f5b944]",
  hot: "bg-[#ff6b57]",
};

/**
 * 单个指标。
 *
 * 图标 + 文字标签 + 加粗数值，条目本身是 hover 胶囊；分隔线在换行时会落到行首，
 * 因此改用间距 + 胶囊底色区分，保证任意宽度下换行后依然整齐。
 */
function Item({
  icon,
  children,
  title,
  testId,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  title?: string;
  testId?: string;
}) {
  return (
    <span
      className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors hover:bg-hover"
      title={title}
      data-testid={testId}
    >
      <span className="text-foreground-subtle/55" aria-hidden="true">
        {icon}
      </span>
      {children}
    </span>
  );
}

/** 指标名：弱化但保持可读，让「速度/本轮/会话」这类作用域一眼可辨。 */
function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-foreground-subtle/75">{children}</span>;
}

/** 主值：加粗、跟随前景色，是条面上唯一的高对比文字。 */
function Value({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("font-semibold text-foreground tabular-nums", className)}>{children}</span>
  );
}

/** 次要值：单位、次数这类补充信息，弱化但不至于看不见。 */
function Sub({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("text-foreground-subtle/80 tabular-nums", className)}>{children}</span>
  );
}

/**
 * composer 下方的 token 用量状态条。
 *
 * 设计取舍：
 * - 全部指标在输入框下方居中、可换行，宽度不足时自动折成多行而不是被裁掉；
 * - 默认 12px，可在设置里逐档调整；
 * - 缓存命中、输入/输出、请求段数、耗时这些原本只在 hover 里出现的数据，
 *   直接铺到主条面，减少「要悬停才知道」的隐藏信息；
 * - 数据全部本地可得，不上传、不联网；每轮结束刷新一次，运行中不轮询。
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

  // 速度只认逐轮实测值（数据库口径）。墙钟估算（turnRate.tokensPerSecond）不参与：
  // 它的基线可能晚于实际生成开始，曾算出 10619 t/s。测不准就显示占位符。
  const rawRate = turnDetail?.tokensPerSecond ?? null;
  const effectiveRate = rawRate !== null && rawRate <= MAX_PLAUSIBLE_TPS ? rawRate : null;
  const speedTier = resolveSpeedTier(effectiveRate);

  // 超限状态由会话最近一次错误判定：CLI 已把这类失败归一成固定标记集，
  // 拿不到错误时自然为 false，不会误报。
  const contextExceeded = useMemo(
    () => isContextExceededActive({ lastErrorCode: lastErrorCode, phase }),
    [lastErrorCode, phase],
  );

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

  const setFontSize = useCallback(
    (fontSize: number) => {
      const next: UsageBarSettings = { ...settings, fontSize };
      updateSettings(next);
      writeUsageBarSettings(next);
    },
    [settings, updateSettings],
  );

  if (!enabled || !available) {
    return null;
  }

  const tokens = (value: number) => formatTokens(locale, value, settings.useChineseUnits);
  // 0% 可能只是该模型/供应商不上报缓存，不等于命中很差；这时保持中性色，
  // 只有确实命中过、但比例偏低才用告警色，避免把「不支持」误报成「很差」。
  const cacheToneClass = (rate: number | null) =>
    rate !== null && rate > 0 ? TIER_TEXT[resolveCacheTier(rate)] : "text-foreground";
  const placeholder = "—";
  const anyItemVisible = USAGE_BAR_ITEMS.some((item) => settings.items[item]);

  const groups: React.ReactNode[] = [];

  if (settings.items.speed) {
    groups.push(
      <Item
        key="speed"
        icon={<Zap className="size-[1.15em]" />}
        title={intl.formatMessage({ id: "chat.composerUsage.speedTitle" })}
        testId="usage-item-speed"
      >
        <Label>{intl.formatMessage({ id: "chat.composerUsage.speed" })}</Label>
        {/* 没有实测值时用中性色占位：绿色会让「不知道」看起来像「很快」。 */}
        <Value className={effectiveRate === null ? undefined : TIER_TEXT[speedTier]}>
          {effectiveRate === null ? placeholder : formatRate(locale, effectiveRate)}
        </Value>
        <Sub>{intl.formatMessage({ id: "chat.composerUsage.rateUnit" })}</Sub>
      </Item>,
    );
  }

  if (settings.items.ctx) {
    groups.push(
      <Item
        key="ctx"
        icon={<Activity className="size-[1.15em]" />}
        title={
          contextMax === null
            ? intl.formatMessage({ id: "chat.composerUsage.contextTitle" })
            : intl.formatMessage(
                { id: "chat.composerUsage.contextTitleValues" },
                {
                  used: tokens(usage?.contextWindow?.usedTokens ?? 0),
                  max: tokens(contextMax),
                },
              )
        }
        testId="usage-item-ctx"
      >
        <Label>{intl.formatMessage({ id: "chat.composerUsage.context" })}</Label>
        <span className="h-1 w-7 overflow-hidden rounded-full bg-foreground/15" aria-hidden="true">
          <span
            className={cn("block h-full transition-[width] duration-300", TIER_BG[contextTier])}
            style={{ width: `${Math.round((contextRatio ?? 0) * 100)}%` }}
          />
        </span>
        <Value className={TIER_TEXT[contextTier]}>
          {contextRatio === null ? placeholder : formatPercent("en-US", contextRatio)}
        </Value>
        {contextMax === null || !usage?.contextWindow ? null : (
          // 用量与上限同时铺出来，不用悬停才知道「66% 到底是多少 token」。
          <Sub>
            {tokens(usage.contextWindow.usedTokens)}/{tokens(contextMax)}
          </Sub>
        )}
      </Item>,
    );
  }

  if (settings.items.turn) {
    const detail = turnDetail;
    groups.push(
      <Item
        key="turn"
        icon={<MessageSquare className="size-[1.15em]" />}
        title={
          detail
            ? intl.formatMessage(
                { id: "chat.composerUsage.turnTitle" },
                {
                  input: tokens(detail.inputTokens),
                  output: tokens(detail.outputTokens),
                  cache:
                    detail.cacheHitRate === null
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
        testId="usage-item-turn"
      >
        <Label>{intl.formatMessage({ id: "chat.composerUsage.turn" })}</Label>
        {detail ? (
          <>
            <Sub>↑</Sub>
            <Value>{tokens(detail.inputTokens)}</Value>
            <Sub>↓</Sub>
            <Value>{tokens(detail.outputTokens)}</Value>
            <Label>{intl.formatMessage({ id: "chat.composerUsage.cacheHit" })}</Label>
            <Value className={cacheToneClass(detail.cacheHitRate)}>
              {detail.cacheHitRate === null ? placeholder : formatPercent(locale, detail.cacheHitRate)}
            </Value>
            {detail.generationDurationMs === null ? null : (
              <Sub>{formatDuration(detail.generationDurationMs / 1000)}</Sub>
            )}
            {detail.requestCount > 1 ? (
              <Sub>
                {intl.formatMessage(
                  { id: "chat.composerUsage.segmentUnit" },
                  { count: detail.requestCount },
                )}
              </Sub>
            ) : null}
          </>
        ) : turnRate ? (
          // 逐轮明细只存在于 agent 进程内，重启后为空；此时用本轮墙钟增量兜底。
          // 这里只展示「输出量」和「耗时」两个可信数字，不展示速率——
          // 墙钟速率可能因基线建立时机错位而虚高几十倍。
          <>
            <Sub>↓</Sub>
            <Value>{tokens(turnRate.outputTokens)}</Value>
            <Sub>{formatDuration(turnRate.durationMs / 1000)}</Sub>
          </>
        ) : (
          <Value>{placeholder}</Value>
        )}
      </Item>,
    );
  }

  if (settings.items.session) {
    groups.push(
      <Item
        key="session"
        icon={<Activity className="size-[1.15em]" />}
        title={
          sessionTotals
            ? intl.formatMessage(
                { id: "chat.composerUsage.sessionTitle" },
                {
                  input: tokens(sessionTotals.inputTokens),
                  output: tokens(sessionTotals.outputTokens),
                  cache:
                    sessionHitRate === null ? placeholder : formatPercent(locale, sessionHitRate),
                  requests: sessionTotals.requestCount ?? placeholder,
                },
              )
            : undefined
        }
        testId="usage-item-session"
      >
        <Label>{intl.formatMessage({ id: "chat.composerUsage.session" })}</Label>
        {sessionTotals ? (
          <>
            <Sub>↑</Sub>
            <Value>{tokens(sessionTotals.inputTokens)}</Value>
            <Sub>↓</Sub>
            <Value>{tokens(sessionTotals.outputTokens)}</Value>
            <Label>{intl.formatMessage({ id: "chat.composerUsage.cacheHit" })}</Label>
            <Value className={cacheToneClass(sessionHitRate)}>
              {sessionHitRate === null ? placeholder : formatPercent(locale, sessionHitRate)}
            </Value>
            {sessionTotals.requestCount != null ? (
              <Sub>
                {intl.formatMessage(
                  { id: "chat.composerUsage.requestCount" },
                  { count: sessionTotals.requestCount },
                )}
              </Sub>
            ) : null}
          </>
        ) : (
          <Value>{placeholder}</Value>
        )}
      </Item>,
    );
  }

  if (settings.items.tools) {
    groups.push(
      <Item
        key="tools"
        icon={<Wrench className="size-[1.15em]" />}
        title={intl.formatMessage({ id: "chat.composerUsage.toolsTitle" })}
        testId="usage-item-tools"
      >
        <Label>{intl.formatMessage({ id: "chat.composerUsage.tools" })}</Label>
        <Value>{today.toolCallCount > 0 ? today.toolCallCount : placeholder}</Value>
        <Sub>{intl.formatMessage({ id: "chat.composerUsage.callUnit" })}</Sub>
      </Item>,
    );
  }

  if (settings.items.today) {
    groups.push(
      <Item
        key="today"
        icon={<CalendarDays className="size-[1.15em]" />}
        title={
          todaySnapshot
            ? intl.formatMessage(
                { id: "chat.composerUsage.todayTitle" },
                { turns: today.turnCount, tools: today.toolCallCount },
              )
            : undefined
        }
        testId="usage-item-today"
      >
        <Label>{intl.formatMessage({ id: "chat.composerUsage.today" })}</Label>
        <Value>{todaySnapshot ? tokens(today.totalTokens) : placeholder}</Value>
        {todaySnapshot && today.turnCount > 0 ? (
          <Sub>
            {intl.formatMessage({ id: "chat.composerUsage.turnUnit" }, { count: today.turnCount })}
          </Sub>
        ) : null}
      </Item>,
    );
  }

  if (settings.items.sub) {
    const runningCount = subagents?.runningCount ?? 0;
    const attention = (subagents?.attentionCount ?? 0) > 0;
    groups.push(
      <Item
        key="sub"
        icon={<Bot className="size-[1.15em]" />}
        title={
          subagents
            ? intl.formatMessage(
                { id: "chat.composerUsage.subTitle" },
                { running: runningCount, ended: subagents.endedTotal },
              )
            : undefined
        }
        testId="usage-item-sub"
      >
        <span
          className={cn(
            "inline-block size-1.5 rounded-full",
            attention
              ? "animate-pulse bg-[#f5b944]"
              : runningCount > 0
                ? "animate-pulse bg-[#3ecf8e]"
                : "bg-foreground/30",
          )}
          aria-hidden="true"
        />
        <Label>{intl.formatMessage({ id: "chat.composerUsage.sub" })}</Label>
        <Value>{runningCount > 0 ? runningCount : placeholder}</Value>
        {subagents && subagents.endedTotal > 0 ? (
          <Sub>
            {intl.formatMessage(
              { id: "chat.composerUsage.subCount" },
              { running: runningCount, ended: subagents.endedTotal },
            )}
          </Sub>
        ) : null}
      </Item>,
    );
  }

  return (
    <div
      data-testid={TID_V4_COMPOSER_USAGE_STATUS_BAR}
      style={{ fontSize: settings.fontSize }}
      className={cn(
        // 居中 + 可换行：内容宽度随指标增减动态变化，窗口窄时折行而不是裁切。
        "flex w-full flex-wrap items-center justify-center gap-x-0.5 gap-y-0.5 px-1 pt-1 leading-[1.35] text-foreground-subtle",
        className,
      )}
    >
      {groups}

      {!anyItemVisible ? (
        <span className="px-1 text-foreground-subtle/60">
          {intl.formatMessage({ id: "chat.composerUsage.allHidden" })}
        </span>
      ) : null}

      {contextExceeded ? (
        // 上下文超限：最近一次请求被拒。只给结论和出路，不堆错误原文——
        // 具体报错在会话的错误横幅里已有。
        <span
          className="flex shrink-0 animate-pulse items-center gap-1 rounded-md px-1.5 py-0.5 text-[var(--color-destructive)]"
          title={intl.formatMessage({ id: "chat.composerUsage.contextExceededHint" })}
        >
          <AlertTriangle className="size-[1.15em]" aria-hidden="true" />
          <span className="font-semibold">
            {intl.formatMessage({ id: "chat.composerUsage.contextExceeded" })}
          </span>
        </span>
      ) : null}

      <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={intl.formatMessage({ id: "chat.composerUsage.settings" })}
            className="flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 text-foreground-subtle/70 transition-colors hover:bg-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <Settings2 className="size-[1.15em]" aria-hidden="true" />
            <ChevronDown className="size-[1em]" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="center" side="top" className="w-72 gap-2.5 p-3">
          <div className="text-ui-sm font-semibold text-foreground">
            {intl.formatMessage({ id: "chat.composerUsage.settings" })}
          </div>
          <div className="flex flex-col gap-2">
            {USAGE_BAR_ITEMS.map((item) => (
              <label key={item} className="flex cursor-pointer items-center gap-2 text-ui-sm">
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

          <div className="my-0.5 h-px bg-border" />

          <div className="flex items-center justify-between gap-2 text-ui-sm">
            <span className="font-medium text-foreground">
              {intl.formatMessage({ id: "chat.composerUsage.fontSize" })}
            </span>
            <div className="flex items-center gap-1">
              {USAGE_BAR_FONT_SIZES.map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setFontSize(size)}
                  className={cn(
                    "rounded border px-1.5 py-0.5 tabular-nums transition-colors",
                    settings.fontSize === size
                      ? "border-ring bg-hover font-semibold text-foreground"
                      : "border-border text-foreground-subtle hover:bg-hover",
                  )}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          <div className="my-0.5 h-px bg-border" />

          <label className="flex flex-col gap-1.5 text-ui-sm">
            <span className="font-medium text-foreground">
              {intl.formatMessage({ id: "chat.composerUsage.contextOverride" })}
            </span>
            <input
              type="text"
              inputMode="numeric"
              defaultValue={settings.contextWindowOverride ?? ""}
              placeholder={contextMax ? String(contextMax) : "auto"}
              onChange={(event) => setContextOverride(event.currentTarget.value)}
              className="w-full rounded border border-border bg-background px-2 py-1 font-mono text-ui-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <span className="text-ui-sm text-foreground-subtle/70">
              {intl.formatMessage({ id: "chat.composerUsage.contextOverrideHint" })}
            </span>
          </label>

          <label className="flex cursor-pointer items-center gap-2 text-ui-sm">
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

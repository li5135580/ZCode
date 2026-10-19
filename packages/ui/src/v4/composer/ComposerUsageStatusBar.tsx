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
  resolveContextMaxTokens,
  resolveContextTier,
  resolveContextUsageRatio,
  resolveSessionCacheHitRate,
  resolveSessionTotals,
  resolveSpeedTier,
  resolveTodayUsage,
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
/** 上下文胶囊底色：按档位淡淡铺一层，让占比一眼可辨。 */
const TIER_PILL: Record<UsageTier, string> = {
  ok: "bg-[#3ecf8e]/12",
  warm: "bg-[#f5b944]/12",
  hot: "bg-[#ff6b57]/14",
};

/**
 * 单个指标。
 *
 * 视觉层级参考 zcode-token-usage-statusbar：图标 + 加粗主值 + 弱化次要值，
 * 字号跟随客户端 ui-base（14px），条目有 hover 底色提示可交互。
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
      className="flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors hover:bg-hover"
      title={title}
      data-testid={testId}
    >
      <span className="text-foreground-subtle/60" aria-hidden="true">
        {icon}
      </span>
      {children}
    </span>
  );
}

function Sep() {
  return <span className="h-3.5 w-px shrink-0 bg-border" aria-hidden="true" />;
}

/** 主值：加粗、跟随前景色，是条面上唯一的高对比文字。 */
function Value({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("font-semibold text-foreground tabular-nums", className)}>
      {children}
    </span>
  );
}

/** 次要值：单位、次数这类补充信息，弱化但不至于看不见。 */
function Sub({ children }: { children: React.ReactNode }) {
  return <span className="text-foreground-subtle/80 tabular-nums">{children}</span>;
}

/**
 * composer 下方的 token 用量状态条。
 *
 * 设计取舍：
 * - 视觉对齐插件的「图标 + 加粗值 + 分隔线」结构，字号用 ui-base 保证可读；
 * - 指标可逐项开关，设置存 localStorage（设备级偏好）；
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

  // 速率优先用逐轮事实（数据库口径），退回本地推算值。
  const effectiveRate = turnDetail?.tokensPerSecond ?? turnRate?.tokensPerSecond ?? null;
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

  if (!enabled || !available) {
    return null;
  }

  const tokens = (value: number) => formatTokens(locale, value, settings.useChineseUnits);
  const placeholder = "—";
  const anyItemVisible = USAGE_BAR_ITEMS.some((item) => settings.items[item]);

  const groups: React.ReactNode[] = [];

  if (settings.items.speed) {
    groups.push(
      <Item
        key="speed"
        icon={<Zap className="size-3.5" />}
        title={intl.formatMessage({ id: "chat.composerUsage.speedTitle" })}
        testId="usage-item-speed"
      >
        <Value className={TIER_TEXT[speedTier]}>
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
        icon={<Activity className="size-3.5" />}
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
        <span
          className={cn(
            "flex items-center gap-1.5 rounded px-1.5 py-0.5",
            TIER_PILL[contextTier],
          )}
        >
          <span className="h-1 w-8 overflow-hidden rounded-full bg-foreground/15" aria-hidden="true">
            <span
              className={cn("block h-full transition-[width] duration-300", TIER_BG[contextTier])}
              style={{ width: `${Math.round((contextRatio ?? 0) * 100)}%` }}
            />
          </span>
          <Value className={TIER_TEXT[contextTier]}>
            {contextRatio === null ? placeholder : formatPercent("en-US", contextRatio)}
          </Value>
        </span>
      </Item>,
    );
  }

  if (settings.items.turn) {
    const detail = turnDetail;
    groups.push(
      <Item
        key="turn"
        icon={<MessageSquare className="size-3.5" />}
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
        <Value>{detail ? tokens(detail.outputTokens) : placeholder}</Value>
        {detail && detail.cacheHitRate !== null ? (
          <Sub>{formatPercent(locale, detail.cacheHitRate)}</Sub>
        ) : null}
      </Item>,
    );
  }

  if (settings.items.session) {
    groups.push(
      <Item
        key="session"
        icon={<Activity className="size-3.5" />}
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
        <Value>{sessionTotals ? tokens(sessionTotals.outputTokens) : placeholder}</Value>
        {sessionTotals?.requestCount != null ? (
          <Sub>
            {intl.formatMessage(
              { id: "chat.composerUsage.requestCount" },
              { count: sessionTotals.requestCount },
            )}
          </Sub>
        ) : null}
      </Item>,
    );
  }

  if (settings.items.tools) {
    groups.push(
      <Item
        key="tools"
        icon={<Wrench className="size-3.5" />}
        title={intl.formatMessage({ id: "chat.composerUsage.toolsTitle" })}
        testId="usage-item-tools"
      >
        <Value>{today.toolCallCount > 0 ? today.toolCallCount : placeholder}</Value>
        <Sub>{intl.formatMessage({ id: "chat.composerUsage.callUnit" })}</Sub>
      </Item>,
    );
  }

  if (settings.items.today) {
    groups.push(
      <Item
        key="today"
        icon={<CalendarDays className="size-3.5" />}
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
        <Value>{todaySnapshot ? tokens(today.totalTokens) : placeholder}</Value>
      </Item>,
    );
  }

  if (settings.items.sub) {
    const runningCount = subagents?.runningCount ?? 0;
    const attention = (subagents?.attentionCount ?? 0) > 0;
    groups.push(
      <Item
        key="sub"
        icon={<Bot className="size-3.5" />}
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
            "inline-block size-2 rounded-full",
            attention
              ? "animate-pulse bg-[#f5b944]"
              : runningCount > 0
                ? "animate-pulse bg-[#3ecf8e]"
                : "bg-foreground/30",
          )}
          aria-hidden="true"
        />
        <Value>{runningCount > 0 ? runningCount : placeholder}</Value>
      </Item>,
    );
  }

  return (
    <div
      data-testid={TID_V4_COMPOSER_USAGE_STATUS_BAR}
      className={cn(
        // 字号跟随客户端 ui-base（14px）。此前误用 ui-xs（约 10px），
        // 比输入框正文小两级，读起来非常吃力。
        "flex w-full items-center gap-0.5 overflow-hidden px-1 pt-1 text-ui-base leading-none text-foreground-subtle",
        className,
      )}
    >
      {groups.map((group, index) => (
        <span key={index} className="flex min-w-0 items-center gap-0.5">
          {index > 0 ? <Sep /> : null}
          {group}
        </span>
      ))}

      {!anyItemVisible ? (
        <span className="truncate text-foreground-subtle/60">
          {intl.formatMessage({ id: "chat.composerUsage.allHidden" })}
        </span>
      ) : null}

      {contextExceeded ? (
        // 上下文超限：最近一次请求被拒。只给结论和出路，不堆错误原文——
        // 具体报错在会话的错误横幅里已有。
        <>
          <Sep />
          <span
            className="flex shrink-0 animate-pulse items-center gap-1 rounded-md px-1.5 py-0.5 text-[var(--color-destructive)]"
            title={intl.formatMessage({ id: "chat.composerUsage.contextExceededHint" })}
          >
            <AlertTriangle className="size-3.5" aria-hidden="true" />
            <span className="font-semibold">
              {intl.formatMessage({ id: "chat.composerUsage.contextExceeded" })}
            </span>
          </span>
        </>
      ) : null}

      <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={intl.formatMessage({ id: "chat.composerUsage.settings" })}
            className="ml-auto flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 text-foreground-subtle/70 transition-colors hover:bg-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <Settings2 className="size-3.5" aria-hidden="true" />
            <ChevronDown className="size-3" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" side="top" className="w-72 gap-2.5 p-3">
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

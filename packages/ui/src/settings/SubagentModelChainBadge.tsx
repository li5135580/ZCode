/**
 * 子智能体模型链信息徽标。
 *
 * 在子智能体列表中展示模型链的模型数量（主模型 + 备用模型），
 * 例如「3 个模型」，让用户一眼识别该子智能体是否配置了多模型回退。
 */
import type { SubagentModelChain } from "@zcode/shared";
import { Badge } from "@/components/ui/badge.js";
import { cn } from "@/components/lib/utils.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

export interface SubagentModelChainBadgeProps {
  /** 模型链（完整配置，primary 必须有值） */
  chain: SubagentModelChain;
  /** 附加到 Badge 的 className */
  className?: string;
}

export function SubagentModelChainBadge({ chain, className }: SubagentModelChainBadgeProps) {
  const { intl } = useZCodeIntl();
  const totalModels = 1 + chain.fallbacks.length;

  return (
    <Badge variant="secondary" className={cn("text-ui-sm", className)}>
      {intl.formatMessage(
        { id: "settings.subagents.modelChain.modelCount" },
        { count: String(totalModels) },
      )}
    </Badge>
  );
}
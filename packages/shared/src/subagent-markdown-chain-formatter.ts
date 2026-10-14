import type { ModelSelection } from "./model-selection.js";
import type { SubagentModelChain } from "./subagent-model-chain.js";

/**
 * 将模型链格式化为 YAML frontmatter 值
 */
export function formatSubagentMarkdownChain(chain: SubagentModelChain): Record<string, unknown> {
  return {
    primary: formatModelSelection(chain.primary),
    fallbacks: chain.fallbacks.map(formatModelSelection),
    retryCount: chain.retryCount,
  };
}

/**
 * 格式化单个模型选择
 */
function formatModelSelection(selection: ModelSelection): Record<string, unknown> {
  const result: Record<string, unknown> = {
    providerId: selection.providerId,
    modelId: selection.modelId,
  };

  if (selection.options?.reasoningLevel) {
    result.reasoningLevel = selection.options.reasoningLevel;
  }

  return result;
}

/**
 * 将模型链转换为 YAML 字符串（用于 Markdown frontmatter）
 */
export function modelChainToYaml(chain: SubagentModelChain): string {
  const data = formatSubagentMarkdownChain(chain);
  return toYamlString(data, 0);
}

/**
 * 简单的 YAML 序列化（仅支持本场景需要的格式）
 */
function toYamlString(data: unknown, indent: number): string {
  const spaces = "  ".repeat(indent);
  
  if (Array.isArray(data)) {
    return data
      .map((item) => `${spaces}- ${toYamlString(item, indent + 1).trimStart()}`)
      .join("\n");
  }
  
  if (typeof data === "object" && data !== null) {
    return Object.entries(data)
      .map(([key, value]) => {
        if (typeof value === "object" && value !== null) {
          return `${spaces}${key}:\n${toYamlString(value, indent + 1)}`;
        }
        return `${spaces}${key}: ${value}`;
      })
      .join("\n");
  }
  
  return String(data);
}
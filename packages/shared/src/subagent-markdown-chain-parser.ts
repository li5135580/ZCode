import type { ModelSelection } from "./model-selection.js";
import type { SubagentModelChain } from "./subagent-model-chain.js";

/**
 * 从 frontmatter 解析模型链
 */
export function parseSubagentMarkdownChain(
  frontmatter: Record<string, unknown>,
): SubagentModelChain | undefined {
  const chainData = frontmatter.modelChain;
  if (!chainData || typeof chainData !== "object") {
    return undefined;
  }

  const chain = chainData as Record<string, unknown>;
  
  // 解析主模型
  const primary = parseModelSelection(chain.primary);
  if (!primary) {
    return undefined;
  }

  // 解析备用模型列表
  const fallbacks: ModelSelection[] = [];
  if (Array.isArray(chain.fallbacks)) {
    for (const fallback of chain.fallbacks) {
      const selection = parseModelSelection(fallback);
      if (selection) {
        fallbacks.push(selection);
      }
    }
  }

  // 解析重试次数：与 subagentModelChainSchema 保持同一约束（正整数），
  // 非整数（如 2.5）或非正值一律回退默认值 5，避免解析结果无法通过 Schema 校验。
  const retryCount =
    typeof chain.retryCount === "number" &&
    Number.isInteger(chain.retryCount) &&
    chain.retryCount > 0
      ? chain.retryCount
      : 5;

  return {
    primary,
    fallbacks: fallbacks.slice(0, 2), // 最多 2 个备用模型
    retryCount,
  };
}

/**
 * 解析单个模型选择
 */
function parseModelSelection(data: unknown): ModelSelection | undefined {
  if (!data || typeof data !== "object") {
    return undefined;
  }

  const selection = data as Record<string, unknown>;
  
  if (typeof selection.providerId !== "string" || !selection.providerId.trim()) {
    return undefined;
  }
  if (typeof selection.modelId !== "string" || !selection.modelId.trim()) {
    return undefined;
  }

  const result: ModelSelection = {
    providerId: selection.providerId.trim(),
    modelId: selection.modelId.trim(),
  };

  if (typeof selection.reasoningLevel === "string" && selection.reasoningLevel.trim()) {
    result.options = { reasoningLevel: selection.reasoningLevel.trim() };
  }

  return result;
}
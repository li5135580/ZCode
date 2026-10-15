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
 * 从原始 frontmatter 文本解析模型链。
 *
 * shared 的 loose 解析器不支持嵌套 mapping（modelChain 会被读成空数组），
 * 而 shared 包不能新增 yaml 依赖。这里只对 modelChain 这一种固定结构做
 * 行级扫描解析，不改动通用解析器，不影响其他任何键的行为。
 *
 * 支持的结构：
 *   modelChain:
 *     primary:
 *       providerId: zai
 *       modelId: glm-4.6
 *       reasoningLevel: high
 *     fallbacks:
 *       - providerId: openai
 *         modelId: gpt-5
 *     retryCount: 5
 */
export function parseSubagentMarkdownChainFromRaw(
  rawFrontmatter: string,
): SubagentModelChain | undefined {
  const lines = rawFrontmatter.split(/\r?\n/u);

  // 1. 定位顶级 `modelChain:` 行（无缩进）
  let chainStart = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (/^modelChain\s*:\s*$/u.test(line.trimEnd()) && !/^\s/u.test(line)) {
      chainStart = index;
      break;
    }
  }
  if (chainStart < 0) return undefined;

  // 2. 收集 modelChain 块（所有缩进行，直到下一个顶级键或结束）
  const blockLines: string[] = [];
  for (let index = chainStart + 1; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (!line.trim()) continue; // 空行跳过
    if (!/^\s/u.test(line)) break; // 顶级键，块结束
    blockLines.push(line);
  }
  if (blockLines.length === 0) return undefined;

  // 3. 在块内解析 primary / fallbacks / retryCount
  let primary: ModelSelection | undefined;
  const fallbacks: ModelSelection[] = [];
  let retryCount = 5;

  let section: "none" | "primary" | "fallbacks" = "none";
  let currentFallback: Record<string, string> | null = null;
  const primaryProps: Record<string, string> = {};

  const flushFallback = () => {
    if (currentFallback) {
      const selection = parseModelSelection(currentFallback);
      if (selection) fallbacks.push(selection);
      currentFallback = null;
    }
  };

  for (const rawLine of blockLines) {
    const trimmed = rawLine.trim();

    // 计算缩进层级（相对块）
    const indent = rawLine.length - rawLine.trimStart().length;

    // 一级键（缩进最小）：primary: / fallbacks: / retryCount:
    const keyMatch = trimmed.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/u);
    const isListItem = trimmed.startsWith("- ");

    if (isListItem && section === "fallbacks") {
      // 新的备用模型项
      flushFallback();
      currentFallback = {};
      const inline = trimmed.slice(2).trim();
      const inlineMatch = inline.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/u);
      if (inlineMatch) currentFallback[inlineMatch[1]!] = inlineMatch[2]!.trim();
      continue;
    }

    if (!keyMatch) continue;
    const [, key, rawValue] = keyMatch;
    const value = rawValue!.trim();

    // 判断是 section 键还是属性键：section 键的值通常为空
    if (value === "" && indent <= 2) {
      if (key === "primary") {
        flushFallback();
        section = "primary";
        continue;
      }
      if (key === "fallbacks") {
        section = "fallbacks";
        continue;
      }
    }

    // 属性键
    if (key === "retryCount" && indent <= 2) {
      const num = Number(value);
      if (Number.isInteger(num) && num > 0) retryCount = num;
      continue;
    }

    if (section === "primary" && value !== "") {
      primaryProps[key!] = value;
      continue;
    }

    if (section === "fallbacks" && currentFallback && value !== "") {
      currentFallback[key!] = value;
      continue;
    }
  }

  flushFallback();

  primary = parseModelSelection(primaryProps);
  if (!primary) return undefined;

  return {
    primary,
    fallbacks: fallbacks.slice(0, 2),
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
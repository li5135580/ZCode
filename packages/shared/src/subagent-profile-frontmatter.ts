export function splitMarkdownFrontmatter(content: string): {
  body: string;
  frontmatter?: string;
} {
  const normalized = content.replace(/^\uFEFF/u, "");
  if (!normalized.startsWith("---")) {
    return { body: normalized };
  }

  const lines = normalized.split(/\r?\n/u);
  if (lines[0]?.trim() !== "---") return { body: normalized };
  const endIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (endIndex < 0) return { body: normalized };

  return {
    frontmatter: lines.slice(1, endIndex).join("\n"),
    body: lines.slice(endIndex + 1).join("\n"),
  };
}

export interface ParsedAgentFrontmatter {
  mcpServers: string[] | null | undefined;
  values: Record<string, unknown>;
}

export function parseAgentFrontmatter(frontmatter: string): ParsedAgentFrontmatter {
  const { bareValueKeys, invalidNestedListKeys, values } = parseLooseFrontmatter(frontmatter);
  if (bareValueKeys.has("tools")) {
    delete values.tools;
  }
  return {
    mcpServers: parseMcpServerNames(
      values.mcpServers,
      Object.prototype.hasOwnProperty.call(values, "mcpServers"),
      bareValueKeys.has("mcpServers"),
      invalidNestedListKeys.has("mcpServers"),
    ),
    values,
  };
}

function parseLooseFrontmatter(frontmatter: string): {
  bareValueKeys: Set<string>;
  invalidNestedListKeys: Set<string>;
  values: Record<string, unknown>;
} {
  const bareValueKeys = new Set<string>();
  const invalidNestedListKeys = new Set<string>();
  const values: Record<string, unknown> = {};
  const lines = frontmatter.split(/\r?\n/u);
  let pendingListKey: string | undefined;

  for (let index = 0; index < lines.length; index++) {
    const rawLine = lines[index]!;
    const line = rawLine.trimEnd();
    if (!line.trim() || line.trimStart().startsWith("#")) continue;

    const listMatch = line.match(/^\s*-\s+(.*)$/u);
    if (listMatch && pendingListKey) {
      bareValueKeys.delete(pendingListKey);
      const rawListItem = listMatch[1] ?? "";
      if (pendingListKey === "mcpServers" && isUnquotedMappingValue(rawListItem)) {
        invalidNestedListKeys.add(pendingListKey);
      }
      const existing = Array.isArray(values[pendingListKey])
        ? (values[pendingListKey] as unknown[])
        : [];
      values[pendingListKey] = [
        ...existing,
        pendingListKey === "mcpServers"
          ? parseMcpServerListItem(rawListItem)
          : parseScalarValue(rawListItem),
      ];
      continue;
    }

    if (pendingListKey && /^\s+/u.test(rawLine)) {
      // 块状 mapping 不是 server-name 列表，不能被空数组吞掉后扩大 child MCP scope。
      invalidNestedListKeys.add(pendingListKey);
      pendingListKey = undefined;
      continue;
    }

    pendingListKey = undefined;
    const keyValue = line.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/u);
    if (!keyValue) continue;
    const key = keyValue[1]!;
    const rawValue = keyValue[2] ?? "";

    // 检测嵌套对象（如 modelChain:）
    if (rawValue.trim() === "") {
      // 检查下一行是否是缩进的块
      const nextLine = lines[index + 1];
      if (nextLine && /^\s+\S/u.test(nextLine)) {
        // 解析嵌套块
        const nestedResult = parseNestedBlock(lines, index + 1);
        if (nestedResult) {
          values[key] = nestedResult.value;
          index = nestedResult.endIndex; // 跳过已处理的行
          continue;
        }
      }
      values[key] = [];
      bareValueKeys.add(key);
      pendingListKey = key;
      continue;
    }

    if (key === "mcpServers" && hasUnquotedInlineMappingItem(rawValue)) {
      invalidNestedListKeys.add(key);
    }
    values[key] = parseScalarValue(rawValue, key === "mcpServers");
  }

  return { bareValueKeys, invalidNestedListKeys, values };
}

/**
 * 解析嵌套块（如 modelChain: 下的内容）
 * 返回解析后的值和结束行索引
 */
function parseNestedBlock(
  lines: string[],
  startIndex: number,
): { value: unknown; endIndex: number } | null {
  const result: Record<string, unknown> = {};
  let currentIndex = startIndex;
  let currentIndent: number | null = null;

  while (currentIndex < lines.length) {
    const rawLine = lines[currentIndex]!;
    const line = rawLine.trimEnd();

    // 空行或注释行跳过
    if (!line.trim() || line.trimStart().startsWith("#")) {
      currentIndex++;
      continue;
    }

    // 计算缩进
    const indent = rawLine.length - rawLine.trimStart().length;

    // 如果缩进小于初始缩进，说明块结束
    if (currentIndent !== null && indent < currentIndent) {
      break;
    }

    // 设置初始缩进
    if (currentIndent === null) {
      currentIndent = indent;
    }

    // 如果缩进大于初始缩进，说明是更深层的嵌套（暂不支持，跳过）
    if (indent > currentIndent) {
      currentIndex++;
      continue;
    }

    // 解析键值对
    const keyValue = line.trim().match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/u);
    if (keyValue) {
      const key = keyValue[1]!;
      const rawValue = keyValue[2] ?? "";

      // 检查是否有更深层的嵌套
      if (rawValue.trim() === "") {
        const nextLine = lines[currentIndex + 1];
        if (nextLine && /^\s+\S/u.test(nextLine)) {
          const nestedResult = parseNestedBlock(lines, currentIndex + 1);
          if (nestedResult) {
            result[key] = nestedResult.value;
            currentIndex = nestedResult.endIndex + 1;
            continue;
          }
        }
        result[key] = [];
      } else {
        result[key] = parseScalarValue(rawValue);
      }
      currentIndex++;
      continue;
    }

    // 解析列表项
    const listMatch = line.trim().match(/^-\s+(.*)$/u);
    if (listMatch) {
      // 列表项暂不支持在嵌套块中，跳过
      currentIndex++;
      continue;
    }

    currentIndex++;
  }

  return Object.keys(result).length > 0 ? { value: result, endIndex: currentIndex - 1 } : null;
}

function parseMcpServerNames(
  value: unknown,
  isConfigured: boolean,
  hasBareValue: boolean,
  hasInvalidNestedValue: boolean,
): string[] | null | undefined {
  if (!isConfigured) return undefined;
  if (!Array.isArray(value) || hasBareValue || hasInvalidNestedValue) return null;

  const names: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") return null;
    const name = item.trim();
    if (name.length === 0) return null;
    names.push(name);
  }
  return names;
}

function hasUnquotedInlineMappingItem(rawValue: string): boolean {
  const value = stripInlineComment(rawValue.trim());
  if (!value.startsWith("[") || !value.endsWith("]")) return false;
  return splitTopLevelList(value.slice(1, -1), true).some(isUnquotedMappingValue);
}

function isUnquotedMappingValue(rawValue: string): boolean {
  const value = stripInlineComment(rawValue.trim());
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return false;
  }
  return (value.startsWith("{") && value.endsWith("}")) || /^[^:]+:(?:\s|$)/u.test(value);
}

function parseMcpServerListItem(rawValue: string): unknown {
  const value = stripInlineComment(rawValue.trim());
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return unquoteScalar(value);
  }
  if (value.startsWith("[") && value.endsWith("]")) return null;
  if (/^(?:null|~)$/iu.test(value)) return null;
  if (/^(?:true|false)$/iu.test(value)) return value.toLowerCase() === "true";
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/iu.test(value)) {
    return Number(value);
  }
  return value;
}

function parseScalarValue(rawValue: string, parseInlineItemScalars = false): unknown {
  const value = stripInlineComment(rawValue.trim());
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^\d+$/u.test(value)) return Number(value);
  if (value.startsWith("[") && value.endsWith("]")) {
    return splitTopLevelList(
      value.slice(1, -1),
      parseInlineItemScalars,
      parseInlineItemScalars,
    ).map((item) =>
      parseInlineItemScalars
        ? parseMcpServerListItem(item)
        : unquoteScalar(stripInlineComment(item.trim())),
    );
  }
  if (value.startsWith("{") && value.endsWith("}")) {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  }
  return unquoteScalar(value);
}

function stripInlineComment(value: string): string {
  let quote: string | undefined;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if ((char === '"' || char === "'") && value[index - 1] !== "\\") {
      quote = quote === char ? undefined : (quote ?? char);
    }
    if (!quote && char === "#" && /\s/u.test(value[index - 1] ?? "")) {
      return value.slice(0, index).trimEnd();
    }
  }
  return value;
}

function unquoteScalar(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function splitTopLevelList(
  value: string,
  trackContainerDepth = false,
  preserveEmptyItems = false,
): string[] {
  const items: string[] = [];
  let current = "";
  let quote: string | undefined;
  let braceDepth = 0;
  let bracketDepth = 0;
  let parenDepth = 0;
  for (const char of value) {
    if ((char === '"' || char === "'") && !quote) {
      quote = char;
      current += char;
      continue;
    }
    if (quote === char) {
      quote = undefined;
      current += char;
      continue;
    }
    if (!quote && char === "(") parenDepth += 1;
    if (!quote && char === ")") parenDepth = Math.max(0, parenDepth - 1);
    if (!quote && trackContainerDepth && char === "{") braceDepth += 1;
    if (!quote && trackContainerDepth && char === "}") braceDepth = Math.max(0, braceDepth - 1);
    if (!quote && trackContainerDepth && char === "[") bracketDepth += 1;
    if (!quote && trackContainerDepth && char === "]") bracketDepth = Math.max(0, bracketDepth - 1);
    if (!quote && parenDepth === 0 && braceDepth === 0 && bracketDepth === 0 && char === ",") {
      if (current.trim() || preserveEmptyItems) items.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) items.push(current.trim());
  return items;
}

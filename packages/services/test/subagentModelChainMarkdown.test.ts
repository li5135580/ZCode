import { describe, expect, it } from "vitest";
import type { SubagentModelChain } from "@zcode/shared";

import {
  parseSubagentMarkdown,
  serializeSubagentMarkdown,
} from "../src/subagents/subagentMarkdown.js";

const sampleChain: SubagentModelChain = {
  primary: { providerId: "zai", modelId: "glm-4.6", options: { reasoningLevel: "high" } },
  fallbacks: [
    { providerId: "openai", modelId: "gpt-5" },
    { providerId: "anthropic", modelId: "claude-4" },
  ],
  retryCount: 3,
};

describe("Subagent modelChain Markdown 持久化", () => {
  it("序列化写入嵌套 modelChain 块，并能被解析器还原", () => {
    const content = serializeSubagentMarkdown({
      name: "probe",
      description: "probe",
      systemPrompt: "body",
      modelChain: sampleChain,
    });

    // 必须是 `modelChain:` 下的嵌套 mapping，而不是被平铺成列表。
    expect(content).toContain("modelChain:");
    expect(content).toContain("  primary:");

    const parsed = parseSubagentMarkdown({ content, path: "x.md", scope: "user" });
    expect(parsed.diagnostic).toBeUndefined();
    expect(parsed.agent?.modelChain).toEqual(sampleChain);
  });

  it("再次序列化产生相同文本（往返稳定）", () => {
    const content = serializeSubagentMarkdown({
      name: "probe",
      description: "probe",
      systemPrompt: "body",
      modelChain: sampleChain,
    });
    const parsed = parseSubagentMarkdown({ content, path: "x.md", scope: "user" });

    expect(
      serializeSubagentMarkdown({
        name: "probe",
        description: "probe",
        systemPrompt: "body",
        modelChain: parsed.agent?.modelChain,
      }),
    ).toBe(content);
  });

  it("未配置 modelChain 时不写入该字段，保持原有单模型 Markdown 不变", () => {
    const content = serializeSubagentMarkdown({
      name: "probe",
      description: "probe",
      systemPrompt: "body",
      modelSelection: { providerId: "zai", modelId: "glm-4.6" },
    });

    expect(content).not.toContain("modelChain");
    const parsed = parseSubagentMarkdown({ content, path: "x.md", scope: "user" });
    expect(parsed.agent?.modelChain).toBeUndefined();
    expect(parsed.agent?.modelSelection).toEqual({ providerId: "zai", modelId: "glm-4.6" });
  });

  it("非法 modelChain 不影响单模型字段的读取", () => {
    const content = [
      "---",
      'name: "probe"',
      'description: "probe"',
      "model: zai/glm-4.6",
      "modelChain:",
      "  fallbacks: []",
      "  retryCount: 5",
      "---",
      "body",
    ].join("\n");

    const parsed = parseSubagentMarkdown({ content, path: "x.md", scope: "user" });
    // primary 缺失时整条链视为未配置，但单模型选择必须照常读出来。
    expect(parsed.agent?.modelChain).toBeUndefined();
    expect(parsed.agent?.modelSelection).toEqual({ providerId: "zai", modelId: "glm-4.6" });
  });
});

import { describe, expect, it } from "vitest";
import { parseSubagentMarkdownChain } from "../src/subagent-markdown-chain-parser.js";
import {
  formatSubagentMarkdownChain,
  modelChainToYaml,
} from "../src/subagent-markdown-chain-formatter.js";
import type { SubagentModelChain } from "../src/subagent-model-chain.js";
import { subagentModelChainSchema } from "../src/subagent-model-chain.js";

const sampleChain: SubagentModelChain = {
  primary: { providerId: "zai", modelId: "glm-4.6", options: { reasoningLevel: "high" } },
  fallbacks: [
    { providerId: "openai", modelId: "gpt-5", options: { reasoningLevel: "medium" } },
    { providerId: "anthropic", modelId: "claude-4", options: { reasoningLevel: "low" } },
  ],
  retryCount: 5,
};

describe("Subagent modelChain Markdown frontmatter 解析", () => {
  it("解析完整的 modelChain（主模型 + 备用们 + 重试次数）", () => {
    expect(
      parseSubagentMarkdownChain({
        modelChain: {
          primary: { providerId: "zai", modelId: "glm-4.6", reasoningLevel: "high" },
          fallbacks: [
            { providerId: "openai", modelId: "gpt-5", reasoningLevel: "medium" },
            { providerId: "anthropic", modelId: "claude-4", reasoningLevel: "low" },
          ],
          retryCount: 5,
        },
      }),
    ).toEqual(sampleChain);
  });
  it("modelChain 缺失、null、非对象时不返回模型链", () => {
    for (const frontmatter of [
      {},
      { modelChain: null },
      { modelChain: "zai/glm-4.6" },
      { modelChain: ["zai/glm-4.6"] },
    ]) {
      expect(parseSubagentMarkdownChain(frontmatter)).toBeUndefined();
    }
  });
  it("主模型缺失或非法时整体返回 undefined", () => {
    for (const primary of [undefined, null, {}, { providerId: "zai" }, { modelId: "glm-4.6" }]) {
      expect(parseSubagentMarkdownChain({ modelChain: { primary } })).toBeUndefined();
    }
  });
  it("重试次数缺失或非法时回退默认 5", () => {
    // 非整数（2.5 / NaN）与小数同样非法：schema 是 .int().positive()，
    // 解析结果必须能通过 subagentModelChainSchema 校验。
    for (const retryCount of [undefined, 0, -3, "5", 2.5, Number.NaN]) {
      expect(
        parseSubagentMarkdownChain({
          modelChain: {
            primary: { providerId: "zai", modelId: "glm-4.6" },
            retryCount,
          },
        }),
      ).toEqual({ primary: { providerId: "zai", modelId: "glm-4.6" }, fallbacks: [], retryCount: 5 });
    }
  });
  it("解析结果始终满足 subagentModelChainSchema 的整数约束", () => {
    for (const retryCount of [2.5, 0.5, Number.NaN, 3, undefined]) {
      const parsed = parseSubagentMarkdownChain({
        modelChain: {
          primary: { providerId: "zai", modelId: "glm-4.6" },
          retryCount,
        },
      });
      expect(subagentModelChainSchema.safeParse(parsed).success).toBe(true);
    }
  });
  it("备用模型最多保留 2 个，且跳过格式非法的项", () => {
    expect(
      parseSubagentMarkdownChain({
        modelChain: {
          primary: { providerId: "zai", modelId: "glm-4.6" },
          fallbacks: [
            { providerId: "openai", modelId: "gpt-5" },
            { providerId: "bad", modelId: "" },
            { providerId: "anthropic", modelId: "claude-4" },
            { providerId: "deepseek", modelId: "r1" },
          ],
        },
      }),
    ).toEqual({
      primary: { providerId: "zai", modelId: "glm-4.6" },
      fallbacks: [
        { providerId: "openai", modelId: "gpt-5" },
        { providerId: "anthropic", modelId: "claude-4" },
      ],
      retryCount: 5,
    });
  });
  it("providerId / modelId / reasoningLevel 的首尾空白被清理", () => {
    expect(
      parseSubagentMarkdownChain({
        modelChain: {
          primary: { providerId: "  zai  ", modelId: " glm-4.6 ", reasoningLevel: " high " },
          fallbacks: [],
        },
      }),
    ).toEqual({
      primary: { providerId: "zai", modelId: "glm-4.6", options: { reasoningLevel: "high" } },
      fallbacks: [],
      retryCount: 5,
    });
  });
  it("未提供 reasoningLevel 时不生成 options", () => {
    expect(
      parseSubagentMarkdownChain({
        modelChain: { primary: { providerId: "zai", modelId: "glm-4.6" } },
      }),
    ).toEqual({ primary: { providerId: "zai", modelId: "glm-4.6" }, fallbacks: [], retryCount: 5 });
  });
});

describe("Subagent modelChain Markdown frontmatter 序列化", () => {
  it("格式化 principal / fallbacks / retryCount 为 frontmatter 值", () => {
    expect(formatSubagentMarkdownChain(sampleChain)).toEqual({
      primary: { providerId: "zai", modelId: "glm-4.6", reasoningLevel: "high" },
      fallbacks: [
        { providerId: "openai", modelId: "gpt-5", reasoningLevel: "medium" },
        { providerId: "anthropic", modelId: "claude-4", reasoningLevel: "low" },
      ],
      retryCount: 5,
    });
  });
  it("模型选择没有 reasoningLevel 时不输出该字段", () => {
    expect(
      formatSubagentMarkdownChain({
        primary: { providerId: "zai", modelId: "glm-4.6" },
        fallbacks: [],
        retryCount: 3,
      }),
    ).toEqual({ primary: { providerId: "zai", modelId: "glm-4.6" }, fallbacks: [], retryCount: 3 });
  });
  it("输出与 frontmatter 示例一致的 YAML 文本", () => {
    expect(modelChainToYaml(sampleChain)).toBe(
      [
        "primary:",
        "  providerId: zai",
        "  modelId: glm-4.6",
        "  reasoningLevel: high",
        "fallbacks:",
        "  - providerId: openai",
        "    modelId: gpt-5",
        "    reasoningLevel: medium",
        "  - providerId: anthropic",
        "    modelId: claude-4",
        "    reasoningLevel: low",
        "retryCount: 5",
      ].join("\n"),
    );
  });
  it("序列化结果能被解析器还原", () => {
    for (const chain of [
      sampleChain,
      { primary: { providerId: "zai", modelId: "glm-4.6" }, fallbacks: [], retryCount: 3 },
    ]) {
      expect(parseSubagentMarkdownChain({ modelChain: formatSubagentMarkdownChain(chain) })).toEqual(
        chain,
      );
    }
  });
});
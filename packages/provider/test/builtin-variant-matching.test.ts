import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseZCodeBuiltinModelConfigRules } from "../src/index.js";

/**
 * 变体模型命名 → 能力基线。
 *
 * 这些断言锁定的是「官方宣称的参数」，不是某个具体规则的下标：只要最终解析结果正确，
 * 中间把规则拆开、合并、调序都不影响测试。它们覆盖的是历史上真实漏匹配或错覆盖的命名形态。
 */
async function loadBuiltinRules() {
  const release = JSON.parse(
    await readFile(
      new URL("../../../config/provider/zcode-builtin.json", import.meta.url),
      "utf8",
    ),
  );
  return parseZCodeBuiltinModelConfigRules(release.config.modelConfigRules);
}

function resolveModel(
  rules: Awaited<ReturnType<typeof loadBuiltinRules>>,
  modelId: string,
) {
  return rules.resolve({
    providerId: "custom:variant-test",
    modelId,
    apiType: "openai-chat-completions",
    baseUrl: "https://example.test/v1",
  });
}

describe("内置模型规则的变体命名覆盖", () => {
  it("glm-5.3 及其变体给出 1M 上下文与多模态能力", async () => {
    const rules = await loadBuiltinRules();

    const base = resolveModel(rules, "glm-5.3");
    expect(base.properties?.contextWindow).toBe(1_000_000);
    expect(base.optionSpecs?.maxOutputTokens?.max).toBe(128_000);

    // flash / flashx 是视觉变体：输入能力必须包含图像，不能退化成纯文本。
    for (const modelId of ["glm-5.3-flash", "glm-5.3-flashx"]) {
      const resolved = resolveModel(rules, modelId);
      expect(resolved.properties?.contextWindow).toBe(1_000_000);
      expect(resolved.properties?.inputFormat?.supportsImage).toBe(true);
    }
  });

  it("[1m] 后缀的显式声明不会被更泛的模型规则覆盖", async () => {
    const rules = await loadBuiltinRules();

    // 历史上 [1m] 规则排在数组第 2 位，随后被 glm-4.5 / glm-4.6 / MiniMax-M2 规则覆盖，
    // 导致显式要求 1M 的模型反而只拿到 131k / 200k / 204k。
    for (const modelId of ["glm-4.5[1m]", "glm-4.6[1m]", "MiniMax-M2[1m]"]) {
      expect(resolveModel(rules, modelId).properties?.contextWindow).toBe(1_000_000);
    }
  });

  it("gpt-5.6 同时支持点号与连字符命名", async () => {
    const rules = await loadBuiltinRules();

    for (const modelId of ["gpt-5.6-sol", "gpt-5-6-sol", "gpt-5-6-terra", "gpt-5-6-luna"]) {
      const resolved = resolveModel(rules, modelId);
      expect(resolved.properties?.contextWindow).toBe(1_050_000);
      expect(resolved.optionSpecs?.maxOutputTokens?.max).toBe(128_000);
      expect(resolved.properties?.inputFormat?.supportsImage).toBe(true);
    }
  });

  it("带 -preview 后缀的模型不被兜底规则吞掉", async () => {
    const rules = await loadBuiltinRules();

    const gpt = resolveModel(rules, "gpt-5.4-preview");
    expect(gpt.properties?.contextWindow).toBe(1_050_000);
    expect(gpt.properties?.inputFormat?.supportsImage).toBe(true);

    const qwen = resolveModel(rules, "qwen3.7-max-preview");
    expect(qwen.properties?.contextWindow).toBe(1_000_000);
  });

  it("claude-4 / claude-3.5 不再退化成纯文本兜底", async () => {
    const rules = await loadBuiltinRules();

    // 这些 ID 正是 fetchAnthropicModels 的内置兜底列表；若规则漏匹配，
    // 用户手动获取到的 Claude 模型会全部显示 32k 输出上限且不支持图像。
    for (const modelId of ["claude-4-opus", "claude-4-sonnet", "claude-3.5-sonnet"]) {
      const resolved = resolveModel(rules, modelId);
      expect(resolved.properties?.contextWindow).toBe(200_000);
      expect(resolved.optionSpecs?.maxOutputTokens?.max).toBe(64_000);
      expect(resolved.properties?.inputFormat?.supportsImage).toBe(true);
      expect(resolved.properties?.inputFormat?.supportsPdf).toBe(true);
    }
  });

  it("qwen3-vl 的 flash 变体保留视觉能力", async () => {
    const rules = await loadBuiltinRules();

    const resolved = resolveModel(rules, "qwen3-vl-flash");
    expect(resolved.properties?.inputFormat?.supportsImage).toBe(true);
    expect(resolved.properties?.contextWindow).toBe(262_144);
  });

  it("grok-4.7 的点号与连字符写法都命中专用规则", async () => {
    const rules = await loadBuiltinRules();

    // 此前规则表只有 grok-4.3 / 4.6 / build-0.1，grok-4.7 会落到兜底 `.*`
    // → 200k / 32k / 纯文本 / disabled+enabled，与官方规格完全不符。
    for (const modelId of ["grok-4.7", "grok-4-7"]) {
      const resolved = resolveModel(rules, modelId);
      expect(resolved.properties?.contextWindow).toBe(500_000);
      expect(resolved.optionSpecs?.maxOutputTokens?.max).toBe(128_000);
      expect(resolved.properties?.inputFormat?.supportsImage).toBe(true);
      expect(resolved.optionSpecs?.reasoningLevel?.values).toEqual([
        "low",
        "medium",
        "high",
        "xhigh",
      ]);
    }
  });
});

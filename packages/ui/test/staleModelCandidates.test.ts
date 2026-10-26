import { describe, expect, it } from "vitest";
import type { FetchedModelInfo } from "@zcode/services";
import {
  isAuthoritativeModelList,
  resolveStaleModels,
  STALE_INCOMPLETE_RATIO,
} from "../src/settings/model-provider-section/staleModelCandidates.js";

function apiModel(modelId: string): FetchedModelInfo {
  return { modelId, source: "api" };
}

function builtinModel(modelId: string): FetchedModelInfo {
  return { modelId, source: "builtin" };
}

describe("已下架模型候选", () => {
  it("找出个人模型里本次未返回的项", () => {
    const result = resolveStaleModels({
      fetchedModels: [apiModel("a"), apiModel("b")],
      personalModelIds: ["a", "b", "gone-1", "gone-2"],
    });

    expect(result.available).toBe(true);
    expect(result.modelIds).toEqual(["gone-1", "gone-2"]);
    expect(result.missingRatio).toBe(0.5);
  });

  it("全部都在时没有候选", () => {
    const result = resolveStaleModels({
      fetchedModels: [apiModel("a"), apiModel("b")],
      personalModelIds: ["a", "b"],
    });

    expect(result.available).toBe(false);
    expect(result.modelIds).toEqual([]);
  });

  it("没有个人模型时不展示清理入口", () => {
    const result = resolveStaleModels({
      fetchedModels: [apiModel("a")],
      personalModelIds: [],
    });

    expect(result.available).toBe(false);
  });

  it("来源不是真实 API 时一律不提供清理", () => {
    // Anthropic 分支拿不到内置配置时会返回 4 条硬编码 Claude 模型；
    // 拿它当完整清单会把用户添加的其它模型全判成「已下架」。
    const anthropicFallback = [
      builtinModel("claude-4-opus"),
      builtinModel("claude-4-sonnet"),
      builtinModel("claude-4-haiku"),
      builtinModel("claude-3.5-sonnet"),
    ];
    const result = resolveStaleModels({
      fetchedModels: anthropicFallback,
      personalModelIds: ["claude-4-opus", "my-custom-model"],
    });

    expect(result.available).toBe(false);
    expect(result.modelIds).toEqual([]);
  });

  it("混合来源同样不可信", () => {
    const result = resolveStaleModels({
      fetchedModels: [apiModel("a"), builtinModel("b")],
      personalModelIds: ["a", "gone"],
    });

    expect(result.available).toBe(false);
  });

  it("空列表不算权威清单", () => {
    expect(isAuthoritativeModelList([])).toBe(false);
    expect(
      resolveStaleModels({ fetchedModels: [], personalModelIds: ["a"] }).available,
    ).toBe(false);
  });

  it("缺失过半时标记为可能不完整", () => {
    const result = resolveStaleModels({
      fetchedModels: [apiModel("a")],
      personalModelIds: ["a", "b", "c", "d"],
    });

    expect(result.missingRatio).toBe(0.75);
    expect(result.missingRatio).toBeGreaterThanOrEqual(STALE_INCOMPLETE_RATIO);
    expect(result.looksIncomplete).toBe(true);
  });

  it("少量缺失不触发不完整警示", () => {
    const result = resolveStaleModels({
      fetchedModels: [apiModel("a"), apiModel("b"), apiModel("c"), apiModel("d")],
      personalModelIds: ["a", "b", "c", "d", "gone"],
    });

    expect(result.looksIncomplete).toBe(false);
  });
});

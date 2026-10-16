import { describe, expect, it } from "vitest";
import { resolveModelParameters } from "../src/model-provider/model-parameter-resolver.js";
import type { FetchedModelInfo } from "../src/model-provider/model-fetcher-service.js";

/** 只带 ID 的模型信息，等价于 [OI] 兼容 `/models` 接口的真实返回形状。 */
function apiModel(modelId: string): FetchedModelInfo {
  return { modelId, source: "api" };
}

describe("resolveModelParameters 不猜测模型能力", () => {
  it("API 只返回模型 ID 时，上下文窗口回落到缺省值而不是按 ID 猜", () => {
    // glm-5.3 的真实上下文窗口是 1M（Host 推荐规则表给出 1000000）。
    // 本地不得把它猜成 200000——猜出来的值会变成个人覆盖，反而屏蔽 Host 的正确基线。
    const resolved = resolveModelParameters(apiModel("glm-5.3"));

    expect(resolved.modelId).toBe("glm-5.3");
    expect(resolved.contextWindow).toBe(200000);
  });

  it("API 返回的上下文窗口优先于缺省值", () => {
    const resolved = resolveModelParameters({
      modelId: "glm-5.3",
      contextWindow: 1000000,
      source: "api",
    });

    expect(resolved.contextWindow).toBe(1000000);
  });

  it("调用方显式传入的基线只在 API 缺失该字段时生效", () => {
    const resolved = resolveModelParameters(apiModel("some-model"), {
      contextWindow: 123456,
      maxOutputTokens: 4321,
    });

    expect(resolved.contextWindow).toBe(123456);
    expect(resolved.maxOutputTokens).toBe(4321);
  });

  it("API 字段与基线同时存在时以 API 为准，且不互相污染", () => {
    const resolved = resolveModelParameters(
      { modelId: "m", contextWindow: 500, source: "api" },
      { contextWindow: 999, maxOutputTokens: 111 },
    );

    expect(resolved.contextWindow).toBe(500);
    expect(resolved.maxOutputTokens).toBe(111);
  });

  it("缺省输入格式只开启文本，避免把未知模型当成多模态", () => {
    const resolved = resolveModelParameters(apiModel("unknown-model"));

    expect(resolved.inputFormat).toEqual({
      supportsText: true,
      supportsImage: false,
      supportsVideo: false,
      supportsAudio: false,
      supportsPdf: false,
    });
  });

  it("模型 ID 含 glm-5 / claude-4 / gpt-5 子串时同样不做本地推断", () => {
    for (const modelId of ["glm-5", "glm-5.2", "claude-4-opus", "gpt-5.6-sol"]) {
      const resolved = resolveModelParameters(apiModel(modelId));
      expect(resolved.contextWindow).toBe(200000);
      expect(resolved.maxOutputTokens).toBe(32000);
      expect(resolved.inputFormat.supportsImage).toBe(false);
    }
  });
});

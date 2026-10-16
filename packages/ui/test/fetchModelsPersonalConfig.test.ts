import { describe, expect, it } from "vitest";
import {
  resolveFetchedModelPersonalConfig,
  toProviderSettingsFormModel,
} from "@/settings/model-provider-section/FetchModelsButton.js";
import type { FetchedModelInfo } from "@zcode/services";

/** [OI] 兼容 `/models` 接口的真实返回形状：只有模型 ID，没有能力元数据。 */
function apiModel(modelId: string): FetchedModelInfo {
  return { modelId, source: "api" };
}

describe("获取模型列表：只落地确有来源的参数", () => {
  it("API 未返回上下文大小时不写个人覆盖，交给 Host 推荐基线解析", () => {
    // 回归：glm-5.3 的真实上下文窗口是 1M，Host 规则表（zcode-builtin.json）给出 1000000。
    // 曾经的 bug 是按模型 ID 本地推断成 200000 并写成个人覆盖，把 Host 的正确基线盖掉，
    // 用户看到的就是「上游 1M、获取出来 200k」。
    const config = resolveFetchedModelPersonalConfig(apiModel("glm-5.3"));

    expect(config.properties).toBeUndefined();
    expect(config.optionSpecs).toBeUndefined();
  });

  it("glm-5.3-flash 等含 glm-5 子串的模型同样不写覆盖", () => {
    for (const modelId of ["glm-5.3-flash", "glm-5", "glm-5.2", "claude-4-opus", "gpt-5.6-sol"]) {
      const config = resolveFetchedModelPersonalConfig(apiModel(modelId));
      expect(config.properties).toBeUndefined();
      expect(config.optionSpecs).toBeUndefined();
    }
  });

  it("API 确实返回上下文大小时才写入，且原样保留该值", () => {
    const config = resolveFetchedModelPersonalConfig({
      modelId: "glm-5.3",
      contextWindow: 1000000,
      source: "api",
    });

    expect(config.properties).toEqual({ contextWindow: 1000000 });
    expect(config.optionSpecs).toBeUndefined();
  });

  it("API 返回输入格式与输出上限时逐字段落地，不补齐未返回的字段", () => {
    const withInputFormat = resolveFetchedModelPersonalConfig({
      modelId: "some-model",
      inputFormat: {
        supportsText: true,
        supportsImage: true,
        supportsVideo: false,
        supportsAudio: false,
        supportsPdf: false,
      },
      source: "api",
    });

    expect(withInputFormat.properties).toEqual({
      inputFormat: {
        supportsText: true,
        supportsImage: true,
        supportsVideo: false,
        supportsAudio: false,
        supportsPdf: false,
      },
    });
    // 未返回 contextWindow / maxOutputTokens，就不得凭空写入。
    expect(withInputFormat.properties?.contextWindow).toBeUndefined();
    expect(withInputFormat.optionSpecs).toBeUndefined();

    const withMaxOutput = resolveFetchedModelPersonalConfig({
      modelId: "some-model",
      maxOutputTokens: 128000,
      source: "api",
    });

    expect(withMaxOutput.optionSpecs).toEqual({ maxOutputTokens: { max: 128000 } });
    expect(withMaxOutput.properties).toBeUndefined();
  });

  it("折算出的表单模型保留推荐基线标记，使 Host 仍可解析缺省参数", () => {
    const formModel = toProviderSettingsFormModel(apiModel("glm-5.3"));

    expect(formModel.kind).toBe("candidate");
    expect(formModel.modelId).toBe("glm-5.3");
    expect(formModel.useRecommendedConfig).toBe(true);
    expect(formModel.hasPersonalConfig).toBe(false);
    expect(formModel.personalConfig).toEqual({});
  });

  it("有 API 元数据时表单模型标记为带个人配置", () => {
    const formModel = toProviderSettingsFormModel({
      modelId: "glm-5.3",
      contextWindow: 1000000,
      source: "api",
    });

    expect(formModel.hasPersonalConfig).toBe(true);
    expect(formModel.personalConfig).toEqual({ properties: { contextWindow: 1000000 } });
  });
});

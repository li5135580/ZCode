import { describe, expect, it } from "vitest";
import type { SubagentModelChain } from "@zcode/shared";
import {
  createSubagentFormInitialState,
  toPersistedSubagentModelChain,
  toSubagentModelChainEditorValue,
} from "@/settings/SubagentsSection.js";

const chain: SubagentModelChain = {
  primary: { providerId: "zai", modelId: "glm-4.6", options: { reasoningLevel: "high" } },
  fallbacks: [{ providerId: "openai", modelId: "gpt-5" }],
  retryCount: 3,
};

describe("Subagent modelChain 表单接线", () => {
  it("把已持久化模型链投影为编辑器受控值（浅拷贝 fallbacks）", () => {
    const value = toSubagentModelChainEditorValue(chain);
    expect(value).toEqual(chain);
    // 编辑器会原地修改 fallbacks 数组，必须与 agents 列表里的对象脱钩。
    expect(value?.fallbacks).not.toBe(chain.fallbacks);
  });

  it("没有模型链时返回 undefined，保持单模型语义", () => {
    expect(toSubagentModelChainEditorValue(undefined)).toBeUndefined();
    expect(createSubagentFormInitialState({ name: "a" }).modelChain).toBeUndefined();
  });

  it("createSubagentFormInitialState 带上模型链草稿", () => {
    expect(createSubagentFormInitialState({ name: "a", modelChain: chain }).modelChain).toEqual(
      chain,
    );
  });

  it("主模型未选完整时整条链视为未配置", () => {
    expect(
      toPersistedSubagentModelChain({
        primary: { providerId: "", modelId: "" },
        fallbacks: [{ providerId: "openai", modelId: "gpt-5" }],
        retryCount: 3,
      }),
    ).toBeUndefined();
    expect(toPersistedSubagentModelChain(undefined)).toBeUndefined();
  });

  it("丢弃空占位备用槽位并清理首尾空白", () => {
    expect(
      toPersistedSubagentModelChain({
        primary: { providerId: " zai ", modelId: " glm-4.6 " },
        fallbacks: [
          { providerId: "openai", modelId: "gpt-5" },
          { providerId: "", modelId: "" },
        ],
        retryCount: 5,
      }),
    ).toEqual({
      primary: { providerId: "zai", modelId: "glm-4.6" },
      fallbacks: [{ providerId: "openai", modelId: "gpt-5" }],
      retryCount: 5,
    });
  });

  it("重试次数非法时回退到默认 5", () => {
    expect(
      toPersistedSubagentModelChain({
        primary: { providerId: "zai", modelId: "glm-4.6" },
        fallbacks: [],
        retryCount: 0,
      })?.retryCount,
    ).toBe(5);
  });

  it("保留 reasoningLevel 并剥离空白", () => {
    expect(
      toPersistedSubagentModelChain({
        primary: { providerId: "zai", modelId: "glm-4.6", options: { reasoningLevel: " high " } },
        fallbacks: [],
        retryCount: 2,
      }),
    ).toEqual({
      primary: { providerId: "zai", modelId: "glm-4.6", options: { reasoningLevel: "high" } },
      fallbacks: [],
      retryCount: 2,
    });
  });

  it("往返稳定：编辑器值 → 持久化 → 编辑器值", () => {
    const editorValue = toSubagentModelChainEditorValue(chain);
    expect(toSubagentModelChainEditorValue(toPersistedSubagentModelChain(editorValue))).toEqual(
      editorValue,
    );
  });
});

import { describe, expect, it } from "vitest";
import { MAX_SUBAGENT_MODEL_CHAIN_FALLBACKS } from "@zcode/shared";
import {
  MAX_SUBAGENT_MODEL_CHAIN_FALLBACKS as EDITOR_MAX_SUBAGENT_MODEL_CHAIN_FALLBACKS,
  reorderSubagentModelChainFallbacks,
  resolveSubagentModelChainFallbackIds,
} from "@/settings/SubagentModelChainEditor.js";
import { readSourceTextAsync } from "./readSourceText.js";

async function readSubagentsSection(): Promise<string> {
  return readSourceTextAsync(new URL("../src/settings/SubagentsSection.tsx", import.meta.url));
}

async function readModelChainEditor(): Promise<string> {
  return readSourceTextAsync(
    new URL("../src/settings/SubagentModelChainEditor.tsx", import.meta.url),
  );
}

describe("Subagent model chain 挂载", () => {
  it("设置页导入并渲染模型链编辑器与徽标", async () => {
    const source = await readSubagentsSection();
    expect(source).toContain('from "@/settings/SubagentModelChainEditor.js"');
    expect(source).toContain('from "@/settings/SubagentModelChainBadge.js"');
    // 编辑器必须真的渲染出来，只导入不挂载等于功能不可达。
    expect(source).toContain("<SubagentModelChainEditor");
    expect(source).toContain("<SubagentModelChainBadge");
  });

  it("编辑器接线沿用单模型表单的模型目录数据", async () => {
    const source = await readSubagentsSection();
    const editorIndex = source.indexOf("\n          <SubagentModelChainEditor");
    expect(editorIndex).toBeGreaterThan(-1);
    const editorBlock = source.slice(editorIndex, editorIndex + 900);
    expect(editorBlock).toContain("modelGroups={modelSelectGroups}");
    expect(editorBlock).toContain("modelSelectionView={modelSelectionView}");
    expect(editorBlock).toContain("modelSelectionLoading={modelSelectionLoading}");
    expect(editorBlock).toContain("onManageModels={onManageModels}");
  });

  it("列表徽标只在存在模型链时展示，且单模型徽标保留", async () => {
    const source = await readSubagentsSection();
    expect(source).toContain(
      "{agent.modelChain ? <SubagentModelChainBadge chain={agent.modelChain} /> : null}",
    );
    // 向后兼容：没有模型链的 agent 仍显示单模型徽标。
    expect(source).toContain("showModelBadge ? <AgentBadge>{modelLabel}</AgentBadge> : null");
  });

  it("保存时把模型链写进 config，并在关闭时省略该字段", async () => {
    const source = await readSubagentsSection();
    expect(source).toContain("...(persistedModelChain ? { modelChain: persistedModelChain } : {})");
  });

  it("未配置模型链的 agent 默认关闭编辑器，保持单模型编辑路径不变", async () => {
    const source = await readSubagentsSection();
    expect(source).toContain(
      "useState(Boolean(initialFormState.modelChain))",
    );
  });

  it("编辑器与徽标不再硬编码中文，文案全部走 i18n", async () => {
    for (const file of [
      "../src/settings/SubagentModelChainEditor.tsx",
      "../src/settings/SubagentModelChainBadge.tsx",
    ]) {
      const source = await readSourceTextAsync(new URL(file, import.meta.url));
      // 注释允许中文；去掉块注释与行注释后，代码里不应再有中文字面量。
      const code = source
        .replace(/\/\*[\s\S]*?\*\//gu, "")
        .replace(/^[ \t]*\/\/.*$/gmu, "");
      expect(code, `${file} 仍包含硬编码中文文案`).not.toMatch(/[\u4e00-\u9fff]/u);
    }
  });
});

describe("模型链编辑器：主模型统一来自上方「模型」字段", () => {
  it("编辑器不再渲染主模型槽位，只保留备用模型与重试次数", async () => {
    const source = await readModelChainEditor();
    expect(source).not.toContain('id: "settings.subagents.modelChain.primary"');
    expect(source).not.toContain("selection={value.primary}");
    // 类型与持久化格式保留 primary，只是不渲染。
    expect(source).toContain("primary?: ModelSelection;");
    expect(source).toContain('id: "settings.subagents.modelChain.primaryFromAbove"');
  });

  it("设置页用上方 model + thoughtLevel 覆盖模型链的 primary", async () => {
    const source = await readSubagentsSection();
    expect(source).toContain(
      "const primary = toSubagentModelSelection(persistedModel, thoughtLevel);",
    );
    expect(source).toContain("return { ...modelChain, primary };");
    expect(source).toContain("toPersistedSubagentModelChain(modelChainDraft)");
  });
});

describe("备用模型重排", () => {
  const fallbacks = [
    { providerId: "zai", modelId: "glm-4.6" },
    { providerId: "openai", modelId: "gpt-5" },
    { providerId: "anthropic", modelId: "claude" },
  ];

  it("按 arrayMove 语义把模型移动到目标位置", () => {
    expect(reorderSubagentModelChainFallbacks(fallbacks, 0, 2)).toEqual([
      fallbacks[1],
      fallbacks[2],
      fallbacks[0],
    ]);
    expect(reorderSubagentModelChainFallbacks(fallbacks, 2, 0)).toEqual([
      fallbacks[2],
      fallbacks[0],
      fallbacks[1],
    ]);
  });

  it("原地移动或越界时返回等值副本且不改写入参", () => {
    expect(reorderSubagentModelChainFallbacks(fallbacks, 1, 1)).toEqual(fallbacks);
    expect(reorderSubagentModelChainFallbacks(fallbacks, 0, 5)).toEqual(fallbacks);
    const result = reorderSubagentModelChainFallbacks(fallbacks, 0, 1);
    expect(result).not.toBe(fallbacks);
    expect(fallbacks[0]).toEqual({ providerId: "zai", modelId: "glm-4.6" });
  });

  it("行 id 跟随模型内容，允许空占位行重复", () => {
    const ids = resolveSubagentModelChainFallbackIds([
      { providerId: "", modelId: "" },
      { providerId: "", modelId: "" },
      { providerId: "zai", modelId: "glm-4.6" },
    ]);
    expect(new Set(ids).size).toBe(3);
  });
});

describe("备用模型数量上限", () => {
  it("编辑器沿用 shared 的 20 个上限", () => {
    expect(MAX_SUBAGENT_MODEL_CHAIN_FALLBACKS).toBe(20);
    expect(EDITOR_MAX_SUBAGENT_MODEL_CHAIN_FALLBACKS).toBe(MAX_SUBAGENT_MODEL_CHAIN_FALLBACKS);
  });

  it("编辑器不再本地硬编码上限", async () => {
    const source = await readModelChainEditor();
    expect(source).not.toMatch(/export const MAX_SUBAGENT_MODEL_CHAIN_FALLBACKS = \d+;/u);
    expect(source).toContain(
      'import { MAX_SUBAGENT_MODEL_CHAIN_FALLBACKS, type ModelSelection } from "@zcode/shared";',
    );
    expect(source).toContain("export { MAX_SUBAGENT_MODEL_CHAIN_FALLBACKS };");
  });
});

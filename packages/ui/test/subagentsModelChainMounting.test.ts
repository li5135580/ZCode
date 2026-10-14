import { describe, expect, it } from "vitest";
import { readSourceTextAsync } from "./readSourceText.js";

async function readSubagentsSection(): Promise<string> {
  return readSourceTextAsync(new URL("../src/settings/SubagentsSection.tsx", import.meta.url));
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

// @vitest-environment jsdom
import { createElement, type ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FetchedModelInfo } from "@zcode/services";
import {
  TID_MODEL_PROVIDER_FETCH_MODELS_BUTTON,
  TID_MODEL_PROVIDER_FETCH_MODELS_STALE_CONFIRM,
  TID_MODEL_PROVIDER_FETCH_MODELS_STALE_INCOMPLETE,
  TID_MODEL_PROVIDER_FETCH_MODELS_STALE_SECTION,
  testId,
  TID_MODEL_PROVIDER_FETCH_MODELS_STALE_ITEM,
} from "@zcode/shared/test-ids";

const fetchProviderModelsMock = vi.hoisted(() => vi.fn());
const fetchedModels = vi.hoisted(() => ({ current: [] as FetchedModelInfo[] }));

vi.mock("@zcode/services", async () => {
  const actual = await vi.importActual<typeof import("@zcode/services")>("@zcode/services");
  return {
    ...actual,
    fetchProviderModels: (...args: unknown[]) => {
      fetchProviderModelsMock(...args);
      return Promise.resolve({ success: true, models: fetchedModels.current });
    },
    resolveModelParameters: (model: FetchedModelInfo) => ({
      contextWindow: model.contextWindow ?? 128000,
      inputFormat: {
        supportsText: true,
        supportsImage: false,
        supportsVideo: false,
        supportsAudio: false,
        supportsPdf: false,
      },
      maxOutputTokens: model.maxOutputTokens ?? 8192,
    }),
  };
});

vi.mock("@/i18n/IntlProvider.js", () => ({
  useZCodeIntl: () => ({
    intl: {
      // 保留 id 与插值，便于断言「文案键 + 参数」而不是真实译文。
      formatMessage: (
        { id }: { id: string },
        values?: Record<string, string | number>,
      ) => (values ? `${id}${JSON.stringify(values)}` : id),
    },
    locale: "zh-CN",
  }),
}));

vi.mock("@/components/ui/dialog.js", () => ({
  Dialog: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
  DialogContent: ({ children }: { children?: ReactNode }) =>
    createElement("div", { "data-testid": "dialog-content" }, children),
  DialogHeader: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
  DialogFooter: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
  DialogTitle: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
  DialogDescription: ({ children }: { children?: ReactNode }) =>
    createElement("div", null, children),
}));

vi.mock("@/components/ui/checkbox.js", () => ({
  Checkbox: ({
    checked,
    onCheckedChange,
    disabled,
    "aria-label": ariaLabel,
  }: {
    checked?: boolean;
    onCheckedChange?: (value: boolean) => void;
    disabled?: boolean;
    "aria-label"?: string;
  }) =>
    createElement("input", {
      type: "checkbox",
      checked: Boolean(checked),
      disabled,
      "aria-label": ariaLabel,
      onChange: () => onCheckedChange?.(!checked),
    }),
}));

function apiModel(modelId: string): FetchedModelInfo {
  return { modelId, source: "api" };
}

function renderButton(props: {
  fetched: FetchedModelInfo[];
  personalModelIds?: readonly string[];
  onRemoveModels?: (modelIds: readonly string[]) => void | Promise<void>;
}) {
  fetchedModels.current = props.fetched;
  return import("@/settings/model-provider-section/FetchModelsButton.js").then(
    ({ FetchModelsButton }) =>
      render(
        createElement(FetchModelsButton, {
          apiKind: "openai-chat-completions",
          baseUrl: "https://example.test/v1",
          apiKey: "sk-test",
          existingModelIds: props.personalModelIds ?? [],
          personalModelIds: props.personalModelIds,
          onAddModel: () => {},
          onRemoveModels: props.onRemoveModels,
        }),
      ),
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("获取模型列表：已下架清理", () => {
  it("列出本次未返回的个人模型，默认不勾选", async () => {
    await renderButton({
      fetched: [apiModel("a"), apiModel("b")],
      personalModelIds: ["a", "b", "retired-model"],
      onRemoveModels: async () => {},
    });

    fireEvent.click(screen.getByTestId(TID_MODEL_PROVIDER_FETCH_MODELS_BUTTON));

    const section = await screen.findByTestId(
      TID_MODEL_PROVIDER_FETCH_MODELS_STALE_SECTION,
    );
    expect(section.textContent).toContain("retired-model");

    const checkbox = section.querySelector(
      `[data-testid="${testId(TID_MODEL_PROVIDER_FETCH_MODELS_STALE_ITEM, "retired-model")}"] input`,
    ) as HTMLInputElement;
    // 默认不勾选：删除不可逆，必须由用户显式确认。
    expect(checkbox.checked).toBe(false);

    // 未勾选时确认按钮禁用。
    const confirm = screen.getByTestId(
      TID_MODEL_PROVIDER_FETCH_MODELS_STALE_CONFIRM,
    ) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
  });

  it("勾选后确认才会调用删除，且只传选中的模型", async () => {
    const onRemoveModels = vi.fn(async () => {});
    await renderButton({
      fetched: [apiModel("a")],
      personalModelIds: ["a", "retired-1", "retired-2"],
      onRemoveModels,
    });

    fireEvent.click(screen.getByTestId(TID_MODEL_PROVIDER_FETCH_MODELS_BUTTON));
    const section = await screen.findByTestId(
      TID_MODEL_PROVIDER_FETCH_MODELS_STALE_SECTION,
    );

    const target = section.querySelector(
      `[data-testid="${testId(TID_MODEL_PROVIDER_FETCH_MODELS_STALE_ITEM, "retired-1")}"] input`,
    ) as HTMLInputElement;
    fireEvent.click(target);

    fireEvent.click(screen.getByTestId(TID_MODEL_PROVIDER_FETCH_MODELS_STALE_CONFIRM));

    await waitFor(() => expect(onRemoveModels).toHaveBeenCalledWith(["retired-1"]));
  });

  it("删除失败时保留选中项并提示，不静默吞掉", async () => {
    const onRemoveModels = vi.fn(async () => {
      throw new Error("boom");
    });
    await renderButton({
      fetched: [apiModel("a")],
      personalModelIds: ["a", "retired-1"],
      onRemoveModels,
    });

    fireEvent.click(screen.getByTestId(TID_MODEL_PROVIDER_FETCH_MODELS_BUTTON));
    const section = await screen.findByTestId(
      TID_MODEL_PROVIDER_FETCH_MODELS_STALE_SECTION,
    );
    const checkbox = section.querySelector(
      `[data-testid="${testId(TID_MODEL_PROVIDER_FETCH_MODELS_STALE_ITEM, "retired-1")}"] input`,
    ) as HTMLInputElement;
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByTestId(TID_MODEL_PROVIDER_FETCH_MODELS_STALE_CONFIRM));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "settings.modelProvider.fetchModelsRemoveFailed",
      ),
    );
    // 错误原文要带给用户，否则无法判断是权限、网络还是模型已不存在。
    expect(screen.getByRole("alert").textContent).toContain("boom");
    // 选中项保留，用户可以直接重试。
    expect(checkbox.checked).toBe(true);
  });

  it("来源是内置兜底时不提供清理入口", async () => {
    await renderButton({
      // Anthropic 分支的硬编码兜底：拿它当完整清单会误删用户添加的模型。
      fetched: [
        { modelId: "claude-4-opus", source: "builtin" },
        { modelId: "claude-4-sonnet", source: "builtin" },
      ],
      personalModelIds: ["claude-4-opus", "my-custom-model"],
      onRemoveModels: async () => {},
    });

    fireEvent.click(screen.getByTestId(TID_MODEL_PROVIDER_FETCH_MODELS_BUTTON));
    await screen.findByTestId("dialog-content");

    expect(
      screen.queryByTestId(TID_MODEL_PROVIDER_FETCH_MODELS_STALE_SECTION),
    ).toBeNull();
  });

  it("缺失过半时给出「可能不完整」警示", async () => {
    await renderButton({
      fetched: [apiModel("a")],
      personalModelIds: ["a", "b", "c", "d"],
      onRemoveModels: async () => {},
    });

    fireEvent.click(screen.getByTestId(TID_MODEL_PROVIDER_FETCH_MODELS_BUTTON));

    expect(
      await screen.findByTestId(TID_MODEL_PROVIDER_FETCH_MODELS_STALE_INCOMPLETE),
    ).toBeTruthy();
  });

  it("没有 onRemoveModels 时不渲染清理分区", async () => {
    await renderButton({
      fetched: [apiModel("a")],
      personalModelIds: ["a", "retired"],
    });

    fireEvent.click(screen.getByTestId(TID_MODEL_PROVIDER_FETCH_MODELS_BUTTON));
    await screen.findByTestId("dialog-content");

    expect(
      screen.queryByTestId(TID_MODEL_PROVIDER_FETCH_MODELS_STALE_SECTION),
    ).toBeNull();
  });
});

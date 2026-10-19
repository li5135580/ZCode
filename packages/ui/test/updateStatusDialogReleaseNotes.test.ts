// @vitest-environment jsdom
import { createElement, type ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IntlInstance } from "@/i18n/IntlProvider.js";
import { UpdateStatusDialog } from "@/UpdateStatusDialog.js";
import type { UpdateStatusDialogPhase } from "@/updateStatusModel.js";

vi.mock("@/components/ai-elements/message.js", () => ({
  MessageResponse: ({ children }: { children?: ReactNode }) =>
    createElement("div", { "data-testid": "message-response" }, children),
}));

const intl = {
  locale: "zh-CN",
  formatMessage: ({ id }: { id: string }, values?: Record<string, unknown>) =>
    values ? `${id}:${JSON.stringify(values)}` : id,
} as unknown as IntlInstance;

function renderDialog(props: {
  phase?: UpdateStatusDialogPhase;
  releaseNotes?: { title: string; markdown: string } | null;
}) {
  return render(
    createElement(UpdateStatusDialog, {
      displayVersion: "3.16.2-fork.10",
      intl,
      isUpdateActionPending: false,
      autoDownloadAndInstallUpdates: false,
      localizedUpdateReleaseNotes: props.releaseNotes ?? null,
      onAutoDownloadAndInstallUpdatesChange: async () => {},
      onCancelDownload: async () => {},
      onDownloadUpdate: async () => {},
      onOpenChange: () => {},
      onOpenReleaseNotesExternalUrl: () => {},
      onRestartUpdate: async () => {},
      onSkipUpdate: async () => {},
      open: true,
      phase: props.phase ?? "downloaded",
      progressLabel: null,
      progressValue: 0,
      releaseDateLabel: "2026年10月19日",
      skippableVersion: null,
    }),
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("UpdateStatusDialog 更新说明", () => {
  it("已准备好时展示更新说明正文", () => {
    renderDialog({
      phase: "downloaded",
      releaseNotes: { title: "更新", markdown: "# 二开增强版\n\n- 新增用量状态条" },
    });

    const notes = screen.getByTestId("update-release-notes");
    expect(notes.textContent).toContain("# 二开增强版");
    expect(notes.textContent).toContain("- 新增用量状态条");
    // 日期仍然展示。
    expect(screen.getByText("2026年10月19日")).toBeTruthy();
  });

  it("没有说明时不渲染空容器", () => {
    renderDialog({ phase: "downloaded", releaseNotes: null });

    expect(screen.queryByTestId("update-release-notes")).toBeNull();
    expect(screen.getByText("2026年10月19日")).toBeTruthy();
  });

  it("说明只有空白时同样不渲染", () => {
    renderDialog({ phase: "downloaded", releaseNotes: { title: "更新", markdown: "  \n " } });

    expect(screen.queryByTestId("update-release-notes")).toBeNull();
  });

  it("下载中隐藏说明，让进度条成为主信息", () => {
    renderDialog({
      phase: "downloading",
      releaseNotes: { title: "更新", markdown: "# 二开增强版" },
    });

    expect(screen.queryByTestId("update-release-notes")).toBeNull();
  });

  it("发现新版本阶段也展示说明", () => {
    renderDialog({
      phase: "before-download",
      releaseNotes: { title: "更新", markdown: "# 二开增强版" },
    });

    expect(screen.getByTestId("update-release-notes").textContent).toContain("# 二开增强版");
  });
});

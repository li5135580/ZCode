import { describe, expect, it } from "vitest";
import type { UpdateStatePayload } from "@zcode/shared";
import {
  hasVisibleUpdateReleaseNotes,
  resolveUpdateStatusWindowHeight,
  UPDATE_STATUS_WINDOW_COMPACT_HEIGHT,
  UPDATE_STATUS_WINDOW_NOTES_HEIGHT,
  UPDATE_STATUS_WINDOW_PROGRESS_HEIGHT,
  UPDATE_STATUS_WINDOW_READY_HEIGHT,
} from "../src/main/updateStatusWindowLayout.js";

function notes(markdown: string) {
  return { version: "3.16.3", title: "更新", markdown };
}

describe("更新窗口高度", () => {
  it("没有更新说明时按状态收紧窗口", () => {
    expect(resolveUpdateStatusWindowHeight({ kind: "idle", enabled: true })).toBe(
      UPDATE_STATUS_WINDOW_COMPACT_HEIGHT,
    );
    expect(
      resolveUpdateStatusWindowHeight({
        kind: "update-available",
        enabled: true,
        version: "3.16.3",
      }),
    ).toBe(UPDATE_STATUS_WINDOW_COMPACT_HEIGHT);
    expect(
      resolveUpdateStatusWindowHeight({
        kind: "update-downloaded",
        enabled: true,
        version: "3.16.3",
      }),
    ).toBe(UPDATE_STATUS_WINDOW_READY_HEIGHT);
  });

  it("有更新说明时必须加高窗口，否则说明区会被压成不可见", () => {
    // 回归：窗口原本固定 205/170px，说明区是 minmax(0,1fr) 弹性行，
    // 头部与按钮占满后弹性行高度趋近 0——说明虽已渲染进 DOM 却完全看不到，
    // 用户只能从按钮悬停提示里读更新内容。
    for (const kind of ["update-available", "update-downloaded"] as const) {
      expect(
        resolveUpdateStatusWindowHeight({
          kind,
          enabled: true,
          version: "3.16.3",
          releaseNotes: notes("# 二开增强版"),
        }),
      ).toBe(UPDATE_STATUS_WINDOW_NOTES_HEIGHT);
    }
    expect(UPDATE_STATUS_WINDOW_NOTES_HEIGHT).toBeGreaterThan(UPDATE_STATUS_WINDOW_PROGRESS_HEIGHT);
  });

  it("下载中即使带说明也保持进度高度", () => {
    // 下载中弹窗主动隐藏说明，进度条才是主信息，加高窗口只会留下空白。
    expect(
      resolveUpdateStatusWindowHeight({
        kind: "download-progress",
        enabled: false,
        progress: "0.5",
        version: "3.16.3",
        releaseNotes: notes("# 二开增强版"),
      }),
    ).toBe(UPDATE_STATUS_WINDOW_PROGRESS_HEIGHT);
  });

  it("只有空白说明时不算有内容", () => {
    expect(
      hasVisibleUpdateReleaseNotes({
        kind: "update-available",
        enabled: true,
        version: "3.16.3",
        releaseNotes: notes("  \n "),
      }),
    ).toBe(false);
  });

  it("默认说明为空但分语言说明有内容时，仍算有说明", () => {
    // 渲染层按 locale 取 releaseNotesByLocale，只看默认 markdown 会漏判。
    expect(
      hasVisibleUpdateReleaseNotes({
        kind: "update-available",
        enabled: true,
        version: "3.16.3",
        releaseNotes: {
          version: "3.16.3",
          title: "Update",
          markdown: "",
          releaseNotesByLocale: { "zh-CN": { title: "更新", markdown: "# 中文说明" } },
        },
      }),
    ).toBe(true);
  });
});

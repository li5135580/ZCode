import type { PostUpdateReleaseNotesPayload, UpdateStatePayload } from "@zcode/shared";

/** 独立更新窗口的固定宽度（三端一致，内容按 512 设计）。 */
export const UPDATE_STATUS_WINDOW_WIDTH = 512;

/** 只有版本号 + 日期 + 按钮时的紧凑高度。 */
export const UPDATE_STATUS_WINDOW_COMPACT_HEIGHT = 205;

/** 下载进度态：多一行进度条。 */
export const UPDATE_STATUS_WINDOW_PROGRESS_HEIGHT = 224;

/** 已下载待重启：没有进度条，按钮也只有「重启」一个。 */
export const UPDATE_STATUS_WINDOW_READY_HEIGHT = UPDATE_STATUS_WINDOW_PROGRESS_HEIGHT - 54;

/**
 * 带更新说明时的高度。
 *
 * 说明区在弹窗里是 `minmax(0,1fr)` 弹性行，必须给足窗口高度才有可见空间：
 * 在 205px 的紧凑窗口里，头部（图标 48px + 标题）+ 上下间距 + 底部按钮
 * 已经占满全部高度，弹性行会被压到接近 0——更新说明虽然渲染进了 DOM，
 * 但视觉上完全看不到，用户只能从按钮悬停提示里读。
 *
 * 460px 在扣掉头部与按钮后，给说明区留下约 200px（且内部还有
 * `max-h-[min(46vh,22rem)]` 与滚动兜底）。
 */
export const UPDATE_STATUS_WINDOW_NOTES_HEIGHT = 460;

/** 该状态下弹窗是否会渲染更新说明正文（与 UpdateStatusDialog 的判定保持一致）。 */
export function hasVisibleUpdateReleaseNotes(state: UpdateStatePayload): boolean {
  if (
    state.kind !== "update-available" &&
    state.kind !== "update-downloaded" &&
    state.kind !== "download-progress"
  ) {
    return false;
  }
  // 下载中进度条才是主信息，弹窗会主动隐藏说明。
  if (state.kind === "download-progress") {
    return false;
  }
  return hasRenderableMarkdown(state.releaseNotes);
}

function hasRenderableMarkdown(releaseNotes: PostUpdateReleaseNotesPayload | undefined): boolean {
  if (!releaseNotes) {
    return false;
  }
  // 默认 markdown 与按语言覆盖的 markdown 任一非空都算有内容：
  // 渲染层会按 locale 取用，只看默认值会在「默认空、分语言有」时误判成没有说明。
  const candidates = [
    releaseNotes.markdown,
    ...Object.values(releaseNotes.releaseNotesByLocale ?? {}).map((entry) => entry?.markdown),
  ];
  return candidates.some((markdown) => typeof markdown === "string" && markdown.trim().length > 0);
}

/**
 * 按当前更新状态推导窗口高度。
 *
 * 不能只看 `kind`：同样处于 update-available，有更新说明时需要更高的窗口，
 * 否则说明区会被挤成不可见。
 */
export function resolveUpdateStatusWindowHeight(state: UpdateStatePayload): number {
  if (state.kind === "download-progress") {
    return UPDATE_STATUS_WINDOW_PROGRESS_HEIGHT;
  }
  if (hasVisibleUpdateReleaseNotes(state)) {
    return UPDATE_STATUS_WINDOW_NOTES_HEIGHT;
  }
  if (state.kind === "update-downloaded") {
    return UPDATE_STATUS_WINDOW_READY_HEIGHT;
  }
  return UPDATE_STATUS_WINDOW_COMPACT_HEIGHT;
}

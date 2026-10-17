import { ZCODE_AUTO_UPDATE_ENABLED, type UpdateStatePayload } from "@zcode/shared";

// 更新入口跟随构建期能力而不是产品身份：只要构建开启了自动更新（含 Preview 身份的二开包），
// 就允许用户手动检查更新；关闭自动更新的构建仍隐藏入口。
export function shouldShowDesktopUpdateEntry(
  autoUpdateEnabled: boolean = ZCODE_AUTO_UPDATE_ENABLED,
): boolean {
  return autoUpdateEnabled === true;
}

export function getUpdateMenuLabelId(state: UpdateStatePayload | null) {
  switch (state?.kind) {
    case "checking":
      return "desktopMenu.help.checkingForUpdates";
    case "update-available":
      return "desktopMenu.help.updateAvailableVersion";
    case "download-progress":
      return "desktopMenu.help.downloadingUpdateProgress";
    case "update-downloaded":
      return "desktopMenu.help.restartToUpdate";
    case "idle":
    default:
      return "titleBar.menu.help.checkForUpdates";
  }
}

export function getUpdateMenuLabelValues(
  state: UpdateStatePayload | null,
): Record<string, string> | undefined {
  switch (state?.kind) {
    case "update-available":
    case "update-downloaded":
      return { version: state.version };
    case "download-progress":
      return { progress: state.progress };
    default:
      return undefined;
  }
}

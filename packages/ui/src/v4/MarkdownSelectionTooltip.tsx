import { SelectionActionMenu } from "@/v4/SelectionActionMenu.js";
import {
  buildSelectionSideChatKey,
  getSelectionSideChatOpenState,
  requestSelectionSideChatOpen,
  subscribeSelectionSideChatRuntime,
} from "@/lib/selectionSideChatRuntime.js";
import { useCallback, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { useTextSelection } from "@/hooks/useTextSelection.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { hasExcludedConversationSelectionEndpoint } from "@/lib/conversationSelectionGuard.js";
import {
  CONVERSATION_SELECTION_MAX_TEXT_LENGTH,
  dispatchConversationSelectionAdd,
  createConversationSelectionReference,
  type MarkdownSelectionTarget,
} from "@/lib/conversationSelectionReference.js";

export function MarkdownSelectionTooltip({
  rootRef,
  sourceKey,
  sourceTitle,
  sourcePath,
  target,
  scopeKey,
}: {
  scopeKey: object;
  rootRef: RefObject<HTMLDivElement | null>;
  sourceKey: string;
  sourceTitle: string;
  sourcePath?: string;
  target: MarkdownSelectionTarget;
}) {
  const { intl } = useZCodeIntl();
  const inspect = useCallback(() => {
    const root = rootRef.current;
    const selection = window.getSelection();
    if (!root || !selection || selection.isCollapsed || selection.rangeCount !== 1) return null;
    const range = selection.getRangeAt(0);
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
    const element = (node: Node) => (node instanceof Element ? node : node.parentElement);
    if (
      hasExcludedConversationSelectionEndpoint(
        element(range.startContainer),
        element(range.endContainer),
      )
    )
      return null;
    const text = selection.toString().trim();
    if (!text) return null;
    const rect = range.getBoundingClientRect();
    if (!rect.width && !rect.height) return null;
    return { text, top: rect.top, bottom: rect.bottom, center: rect.left + rect.width / 2 };
  }, [rootRef]);
  const { state, close } = useTextSelection({
    rootRef,
    enabled: true,
    inspect,
    scopeKey,
    observeSelectionChange: true,
  });
  const sideKey = target.sessionId
    ? buildSelectionSideChatKey(target.workspaceKey, target.sessionId)
    : null;
  const sideState = useSyncExternalStore(
    subscribeSelectionSideChatRuntime,
    () => (sideKey ? getSelectionSideChatOpenState(sideKey) : "unavailable"),
    () => "unavailable",
  );
  // 批注输入框聚焦会让文档选区折叠，选区监听随即关闭菜单；展开期间冻结当前快照。
  const [frozen, setFrozen] = useState(false);
  const frozenStateRef = useRef<typeof state>(null);
  if (state) frozenStateRef.current = state;
  const handleAnnotationOpenChange = useCallback((open: boolean) => {
    if (open) {
      setFrozen(true);
      return;
    }
    setFrozen(false);
    frozenStateRef.current = null;
  }, []);
  const visibleState = frozen ? frozenStateRef.current : state;
  const finish = useCallback(() => {
    setFrozen(false);
    frozenStateRef.current = null;
    close();
  }, [close]);
  if (!visibleState) return null;
  const createReference = (comment?: string) =>
    createConversationSelectionReference({
      contentType: "markdown",
      sourceKey,
      sourceTitle,
      path: sourcePath,
      text: visibleState.text,
      ...(comment ? { comment } : {}),
    });
  return (
    <SelectionActionMenu
      center={visibleState.center}
      top={visibleState.top}
      bottom={visibleState.bottom}
      singleLimit={visibleState.text.length > CONVERSATION_SELECTION_MAX_TEXT_LENGTH}
      sideActionDisabled={sideState !== "ready"}
      sideDisabledTitle={
        sideState === "ready"
          ? undefined
          : intl.formatMessage({
              id:
                sideState === "blocked"
                  ? "chat.selections.previewSideBlocked"
                  : "chat.selections.previewSideUnavailable",
            })
      }
      onAddToCurrentTask={(comment) => {
        dispatchConversationSelectionAdd({
          targetSessionId: target.sessionId,
          workspaceKey: target.workspaceKey,
          reference: createReference(comment),
        });
        finish();
      }}
      onAskInSideChat={() => {
        if (sideKey && requestSelectionSideChatOpen(sideKey, createReference())) finish();
      }}
      onAnnotationOpenChange={handleAnnotationOpenChange}
    />
  );
}

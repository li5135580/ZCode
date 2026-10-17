import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/components/lib/utils.js";
import { Button } from "@/components/ui/button.js";
import { Textarea } from "@/components/ui/textarea.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { isImeComposingKeyEvent } from "@/lib/imeComposition.js";
import { CONVERSATION_SELECTION_MAX_COMMENT_LENGTH } from "@/lib/conversationSelectionReference.js";

const ANNOTATION_WIDTH = 320;

// 问题原因：Markdown 曾复制一份固定宽度的竖排菜单，与对话流逐渐分叉。
// 两处只传选区位置与动作，共用展示和尺寸测量，避免再次出现样式差异。
export function SelectionActionMenu({
  center,
  top,
  bottom,
  singleLimit,
  sideActionDisabled,
  sideDisabledTitle,
  onAddToCurrentTask,
  onAskInSideChat,
  onAnnotationOpenChange,
}: {
  center: number;
  top: number;
  bottom: number;
  singleLimit?: boolean;
  sideActionDisabled?: boolean;
  sideDisabledTitle?: string;
  onAddToCurrentTask: (comment?: string) => void;
  onAskInSideChat: () => void;
  /**
   * 批注编辑框展开/收起通知。点击 Textarea 会让文档选区折叠，宿主据此冻结当前
   * 选区快照，否则菜单会在开始输入前就被选区监听关闭。
   */
  onAnnotationOpenChange?: (open: boolean) => void;
}) {
  const { intl, locale } = useZCodeIntl();
  const ref = useRef<HTMLDivElement>(null);
  const compositionActiveRef = useRef(false);
  const [annotating, setAnnotating] = useState(false);
  const [comment, setComment] = useState("");
  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const position = () => {
      const rect = menu.getBoundingClientRect();
      menu.style.left = `${Math.max(12, Math.min(window.innerWidth - rect.width - 12, center - rect.width / 2))}px`;
      const preferredTop = top - rect.height - 8 >= 12 ? top - rect.height - 8 : bottom + 8;
      menu.style.top = `${Math.max(12, Math.min(window.innerHeight - rect.height - 12, preferredTop))}px`;
    };
    position();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(position);
    observer?.observe(menu);
    return () => observer?.disconnect();
  }, [center, top, bottom, singleLimit, locale, annotating]);

  useEffect(() => {
    if (!annotating) return;
    return () => {
      // 只在卸载时兜底释放冻结；展开/收起由显式回调处理，避免时序抢跑。
      onAnnotationOpenChange?.(false);
    };
  }, [annotating, onAnnotationOpenChange]);

  const closeAnnotation = useCallback(() => {
    setAnnotating(false);
    setComment("");
    compositionActiveRef.current = false;
    onAnnotationOpenChange?.(false);
  }, [onAnnotationOpenChange]);

  // 批注展开期间宿主冻结了选区快照，普通「点空白处折叠选区」不再能关闭菜单，
  // 因此这里补上外部点击关闭，避免浮层一直停留在页面上。
  useEffect(() => {
    if (!annotating) return;
    const handlePointerDown = (event: PointerEvent) => {
      const menu = ref.current;
      if (menu && event.target instanceof Node && menu.contains(event.target)) return;
      closeAnnotation();
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [annotating, closeAnnotation]);

  const submit = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      onAddToCurrentTask(trimmed || undefined);
      closeAnnotation();
    },
    [closeAnnotation, onAddToCurrentTask],
  );

  // 按钮需要 preventDefault 才能保住选区；Textarea 必须拿到焦点，因此单独放行。
  const keepSelection = (event: ReactPointerEvent | ReactMouseEvent) => {
    const target = event.target;
    if (target instanceof Element && target.closest("textarea, input")) return;
    event.preventDefault();
  };

  const overCommentLimit = comment.length > CONVERSATION_SELECTION_MAX_COMMENT_LENGTH;
  return createPortal(
    <div
      ref={ref}
      data-conversation-selection-tooltip="true"
      style={{
        width: annotating ? Math.min(ANNOTATION_WIDTH, window.innerWidth - 24) : "max-content",
        maxWidth: Math.min(576, window.innerWidth - 24),
        left: 12,
        top: 12,
      }}
      className={cn(
        "fixed z-50 flex overflow-hidden rounded-lg border border-popover-border bg-menu text-ui-sm text-foreground shadow-md",
        annotating ? "flex-col" : "items-stretch",
      )}
      onPointerDown={keepSelection}
      onMouseDown={keepSelection}
    >
      {singleLimit ? (
        <div className="px-2.5 py-1.5 text-[var(--color-warning)]">
          {intl.formatMessage({ id: "chat.selections.limit.single" })}
        </div>
      ) : annotating ? (
        <div className="flex max-h-[calc(100vh-24px)] flex-col gap-2 overflow-y-auto p-2">
          <Textarea
            autoFocus
            aria-label={intl.formatMessage({ id: "chat.selections.annotationPlaceholder" })}
            placeholder={intl.formatMessage({ id: "chat.selections.annotationPlaceholder" })}
            value={comment}
            rows={3}
            className="max-h-40 min-h-16 resize-none border-input-border bg-input text-mobile-input-safe placeholder:text-foreground-subtlest hover:border-input-border-hover focus-visible:border-input-border-focused focus-visible:bg-input-focused focus-visible:ring-0 md:text-ui-base"
            onChange={(event) => setComment(event.target.value)}
            onCompositionStart={() => {
              compositionActiveRef.current = true;
            }}
            onCompositionEnd={() => {
              compositionActiveRef.current = false;
            }}
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              if (
                isImeComposingKeyEvent({
                  compositionActive: compositionActiveRef.current,
                  isComposing: event.nativeEvent.isComposing,
                })
              ) {
                // 中文/日文输入法下 Esc 是取消候选词，不是放弃批注。
                return;
              }
              event.preventDefault();
              closeAnnotation();
            }}
          />
          <div className="flex items-center justify-between gap-2">
            <span
              className={cn(
                "min-w-0 truncate text-ui-sm",
                overCommentLimit ? "text-[var(--color-warning)]" : "text-foreground-subtlest",
              )}
            >
              {overCommentLimit
                ? intl.formatMessage({ id: "chat.selections.limit.comment" })
                : null}
            </span>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                data-conversation-selection-action="annotation-skip"
                onClick={() => submit("")}
              >
                {intl.formatMessage({ id: "chat.selections.annotationSkip" })}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={overCommentLimit}
                data-conversation-selection-action="annotation-confirm"
                onClick={() => submit(comment)}
              >
                {intl.formatMessage({ id: "chat.selections.annotationConfirm" })}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <button
            type="button"
            data-conversation-selection-action="add-to-task"
            className="min-w-0 px-2.5 py-1.5 hover:bg-menu-hover"
            onClick={() => {
              // 点主按钮先展开批注框，而不是直接提交：批注是「添加到当前任务」的可选补充，
              // 展开后既能写批注再提交，也能直接点「跳过」保持原来的一键添加语义。
              // 必须先冻结宿主选区快照，Textarea 聚焦会让文档选区立即折叠。
              onAnnotationOpenChange?.(true);
              setAnnotating(true);
            }}
          >
            {intl.formatMessage({ id: "chat.selections.addToTask" })}
          </button>
          <div className="w-px shrink-0 bg-border" />
          <button
            type="button"
            data-conversation-selection-action="ask-in-side-chat"
            disabled={sideActionDisabled}
            title={sideActionDisabled ? sideDisabledTitle : undefined}
            className={cn(
              "min-w-0 px-2.5 py-1.5 hover:bg-menu-hover",
              sideActionDisabled && "cursor-not-allowed opacity-50 hover:bg-transparent",
            )}
            onClick={() => {
              if (!sideActionDisabled) onAskInSideChat();
            }}
          >
            {intl.formatMessage({ id: "chat.selections.askInSideChat" })}
          </button>
        </>
      )}
    </div>,
    document.body,
  );
}

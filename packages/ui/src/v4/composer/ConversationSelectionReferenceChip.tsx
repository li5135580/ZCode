import { QuoteIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import type { AttachmentHoverCardContentProps } from "@/components/ai-elements/attachments.js";
import { Button } from "@/components/ui/button.js";
import { Textarea } from "@/components/ui/textarea.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import {
  isConversationSelectionReference,
  CONVERSATION_SELECTION_MAX_COMMENT_LENGTH,
  type ConversationSelectionDisplayReference,
} from "@/lib/conversationSelectionReference.js";
import { ContextAttachmentPill } from "@/v4/composer/ContextAttachmentPill.js";

export function ConversationSelectionReferenceChip({
  references,
  contentAlign = "start",
  onRemove,
  onRemoveAll,
  onEditComment,
}: {
  references: readonly ConversationSelectionDisplayReference[];
  contentAlign?: AttachmentHoverCardContentProps["align"];
  onRemove?: (id: string) => void;
  onRemoveAll?: () => void;
  /**
   * 草稿态可编辑批注；已发送消息不传，保持只读回显。
   * 只有携带 id 的草稿引用能写回 scope，历史纯文本引用没有定位信息。
   */
  onEditComment?: (id: string, comment: string | undefined) => void;
}) {
  const { intl, locale } = useZCodeIntl();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftComment, setDraftComment] = useState("");
  if (references.length === 0) return null;
  const filePath = references.length === 1 ? references[0]?.path : undefined;
  // 文件引用沿用共用 pill，但不能再被「对话引用」计数隐藏来源。
  const label = filePath
    ? intl.formatMessage(
        { id: "chat.selections.file" },
        { name: filePath.split(/[\\/]/).pop() ?? filePath },
      )
    : intl.formatMessage(
        {
          id: references.some((reference) => reference.path)
            ? "chat.selections.mixedCount"
            : "chat.selections.count",
        },
        { count: String(references.length) },
      );
  const removeLabel = intl.formatMessage({ id: "chat.selections.remove" });
  const commentLabel = intl.formatMessage({ id: "chat.selections.annotationLabel" });
  const editLabel = intl.formatMessage({ id: "chat.selections.annotationEdit" });

  const commitComment = (id: string) => {
    onEditComment?.(id, draftComment.trim() || undefined);
    setEditingId(null);
    setDraftComment("");
  };

  return (
    <ContextAttachmentPill
      contentAlign={contentAlign}
      icon={<QuoteIcon className="size-4 shrink-0 text-foreground-subtle" />}
      label={label}
      onRemoveAll={onRemoveAll}
      removeLabel={removeLabel}
      triggerProps={{
        "data-conversation-selection-reference-count": references.length,
      }}
    >
      {references.map((reference, index) => {
        const editable =
          Boolean(onEditComment) && isConversationSelectionReference(reference);
        const referenceId = isConversationSelectionReference(reference)
          ? reference.id
          : undefined;
        const comment = reference.comment?.trim();
        const editing = editable && referenceId !== undefined && editingId === referenceId;
        return (
          <div
            key={
              isConversationSelectionReference(reference)
                ? reference.id
                : `${index}:${reference.text}`
            }
            className="group/reference flex gap-2 rounded-lg px-2 py-1.5 text-ui-base hover:bg-menu-hover"
          >
            <QuoteIcon className="mt-0.5 size-4 shrink-0 text-foreground-subtle" />
            <div className="min-w-0 flex-1">
              {reference.senderName || reference.senderId || reference.sentAt ? (
                <div className="mb-1 text-ui-sm text-foreground-subtle">
                  {reference.senderName ||
                    (reference.senderId
                      ? `${reference.senderId.slice(0, 8)}…${reference.senderId.slice(-4)}`
                      : "")}
                  {reference.sentAt ? (
                    <>
                      {" "}
                      ·{" "}
                      {new Date(reference.sentAt).toLocaleTimeString(locale, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </>
                  ) : null}
                </div>
              ) : null}
              <div className="line-clamp-3 whitespace-pre-wrap break-words">{reference.text}</div>
              {reference.path || isConversationSelectionReference(reference) ? (
                <div className="mt-0.5 break-words text-ui-sm text-foreground-subtlest">
                  {reference.path ? (
                    reference.path
                  ) : isConversationSelectionReference(reference) &&
                    reference.contentType === "markdown" ? (
                    reference.sourceTitle
                  ) : isConversationSelectionReference(reference) &&
                    reference.contentType !== "markdown" ? (
                    <>
                      {intl.formatMessage({ id: `chat.selections.type.${reference.contentType}` })}
                      · #{reference.sourceRowId}
                    </>
                  ) : null}
                </div>
              ) : null}
              {editing ? (
                <div className="mt-1.5 flex flex-col gap-1.5">
                  <Textarea
                    autoFocus
                    aria-label={editLabel}
                    placeholder={intl.formatMessage({
                      id: "chat.selections.annotationPlaceholder",
                    })}
                    value={draftComment}
                    rows={2}
                    className="min-h-14 resize-none text-ui-base"
                    onChange={(event) => setDraftComment(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setEditingId(null);
                        setDraftComment("");
                        return;
                      }
                      // Enter 保存、Shift+Enter 换行；中文输入法组合态交给 IME 处理。
                      if (
                        event.key === "Enter" &&
                        !event.shiftKey &&
                        !event.nativeEvent.isComposing
                      ) {
                        event.preventDefault();
                        if (draftComment.length <= CONVERSATION_SELECTION_MAX_COMMENT_LENGTH) {
                          commitComment(referenceId!);
                        }
                      }
                    }}
                  />
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingId(null);
                        setDraftComment("");
                      }}
                    >
                      {intl.formatMessage({ id: "common.cancel" })}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={draftComment.length > CONVERSATION_SELECTION_MAX_COMMENT_LENGTH}
                      onClick={() => commitComment(referenceId!)}
                    >
                      {intl.formatMessage({ id: "common.save" })}
                    </Button>
                  </div>
                </div>
              ) : comment ? (
                <div className="mt-1.5 flex items-start gap-1.5 rounded-md bg-surface px-1.5 py-1 text-ui-sm">
                  <span className="shrink-0 text-foreground-subtlest">{commentLabel}</span>
                  <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-foreground-subtle">
                    {comment}
                  </span>
                  {editable ? (
                    <button
                      type="button"
                      className="shrink-0 text-foreground-subtlest underline-offset-2 hover:text-foreground hover:underline"
                      onClick={() => {
                        setEditingId(referenceId!);
                        setDraftComment(comment);
                      }}
                    >
                      {editLabel}
                    </button>
                  ) : null}
                </div>
              ) : editable ? (
                <button
                  type="button"
                  className="mt-1 text-ui-sm text-foreground-subtlest underline-offset-2 hover:text-foreground hover:underline"
                  onClick={() => {
                    setEditingId(referenceId!);
                    setDraftComment("");
                  }}
                >
                  {editLabel}
                </button>
              ) : null}
            </div>
            {onRemove && isConversationSelectionReference(reference) ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="size-5 shrink-0 text-foreground-subtle opacity-0 group-hover/reference:opacity-100"
                aria-label={removeLabel}
                onClick={() => onRemove(reference.id)}
              >
                <Trash2Icon className="size-3.5" />
              </Button>
            ) : null}
          </div>
        );
      })}
    </ContextAttachmentPill>
  );
}

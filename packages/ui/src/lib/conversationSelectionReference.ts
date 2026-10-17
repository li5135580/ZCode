import {
  createUuid,
  CONVERSATION_SELECTION_MAX_TEXT_LENGTH,
  CONVERSATION_SELECTION_MAX_COUNT,
  CONVERSATION_SELECTION_MAX_TOTAL_LENGTH,
  CONVERSATION_SELECTION_MAX_COMMENT_LENGTH,
  type ConversationSelectionText,
} from "@zcode/shared";

export {
  buildPromptWithConversationSelections,
  CONVERSATION_SELECTION_MAX_TEXT_LENGTH,
  CONVERSATION_SELECTION_MAX_COUNT,
  CONVERSATION_SELECTION_MAX_TOTAL_LENGTH,
  CONVERSATION_SELECTION_MAX_COMMENT_LENGTH,
  type ConversationSelectionText,
} from "@zcode/shared";

export type ConversationSelectionContentType = "user" | "assistant" | "reasoning" | "tool";

export interface MessageSelectionReference extends ConversationSelectionText {
  id: string;
  sourceSessionId: string;
  sourceRowId: number;
  contentType: ConversationSelectionContentType;
  /** 用户针对这处选区写的纠偏说明；缺省表示未写批注。 */
  comment?: string;
}

export interface MarkdownSelectionReference extends ConversationSelectionText {
  id: string;
  contentType: "markdown";
  sourceKey: string;
  sourceTitle: string;
  /** 用户针对这处选区写的纠偏说明；缺省表示未写批注。 */
  comment?: string;
}

export type ConversationSelectionReference = MessageSelectionReference | MarkdownSelectionReference;

export interface MarkdownSelectionTarget {
  sessionId: string | null;
  workspaceKey: string;
}

export type ConversationSelectionDisplayReference =
  | ConversationSelectionText
  | ConversationSelectionReference;

interface ConversationSelectionAddEventDetail {
  targetSessionId: string | null;
  workspaceKey: string;
  reference: ConversationSelectionReference;
  result?: ConversationSelectionAppendResult;
}

export type ConversationSelectionLimitReason = "count" | "single" | "total" | "comment";
export type ConversationSelectionAppendResult =
  | {
      ok: true;
      references: readonly ConversationSelectionReference[];
      duplicate: boolean;
    }
  | { ok: false; reason: ConversationSelectionLimitReason };

const ADD_EVENT = "zcode:conversation-selection-add";
const USER_SELECT_BLOCK_PATTERN = /(?:\n\n)?# userselect:\n```userselect\n([\s\S]*?)\n```\s*$/;
const LEGACY_BLOCK_PATTERN =
  /(?:\n\n)?# Conversation selections:\n```zcode-conversation-selections\n([\s\S]*?)\n```\s*$/;
const referencesByScope = new Map<string, readonly ConversationSelectionReference[]>();
const limitReasonByScope = new Map<string, ConversationSelectionLimitReason>();

function referenceScopeKey(sessionId: string | null, workspaceKey: string): string {
  return `${workspaceKey}\0${sessionId ?? "__draft__"}`;
}

export function getConversationSelectionReferenceScope(
  sessionId: string | null,
  workspaceKey: string,
): readonly ConversationSelectionReference[] {
  return referencesByScope.get(referenceScopeKey(sessionId, workspaceKey)) ?? [];
}

export function setConversationSelectionReferenceScope(
  sessionId: string | null,
  workspaceKey: string,
  references: readonly ConversationSelectionReference[],
): void {
  const key = referenceScopeKey(sessionId, workspaceKey);
  if (references.length > 0) referencesByScope.set(key, references);
  else referencesByScope.delete(key);
  limitReasonByScope.delete(key);
}

export function getConversationSelectionReferenceLimitReason(
  sessionId: string | null,
  workspaceKey: string,
): ConversationSelectionLimitReason | null {
  return limitReasonByScope.get(referenceScopeKey(sessionId, workspaceKey)) ?? null;
}

export function clearConversationSelectionReferenceScope(
  sessionId: string,
  workspaceKey: string,
): void {
  referencesByScope.delete(referenceScopeKey(sessionId, workspaceKey));
  limitReasonByScope.delete(referenceScopeKey(sessionId, workspaceKey));
}

export function clearConversationSelectionReferenceLimitReason(
  sessionId: string | null,
  workspaceKey: string,
): void {
  limitReasonByScope.delete(referenceScopeKey(sessionId, workspaceKey));
}

export function createConversationSelectionReference(
  input: Omit<MessageSelectionReference, "id"> | Omit<MarkdownSelectionReference, "id">,
): ConversationSelectionReference {
  return { ...input, id: createUuid() };
}

export function getConversationSelectionDedupeKey(
  reference: ConversationSelectionReference,
): string {
  // 批注不参与去重：同源同文的再次添加应更新已有条目的批注。
  if (reference.contentType === "markdown") {
    return ["markdown", reference.sourceKey, reference.text].join("\0");
  }
  return [
    reference.sourceSessionId,
    reference.sourceRowId,
    reference.contentType,
    reference.text,
  ].join("\0");
}

/**
 * 发送/编辑白名单：只保留模型需要的正文、路径、批注与署名。
 * id/sourceSessionId/sourceRowId/anchor 等内部字段不得离开 renderer。
 */
export function toConversationQuote(
  reference: ConversationSelectionDisplayReference,
): ConversationSelectionText {
  const quote: ConversationSelectionText = { text: reference.text };
  if (reference.path) quote.path = reference.path;
  if (reference.comment?.trim()) quote.comment = reference.comment.trim();
  if (reference.senderName) quote.senderName = reference.senderName;
  if (reference.senderId) quote.senderId = reference.senderId;
  if (reference.messageId) quote.messageId = reference.messageId;
  if (reference.sentAt) quote.sentAt = reference.sentAt;
  return quote;
}

function normalizeComment(comment: string | undefined): string | undefined {
  const trimmed = comment?.trim();
  return trimmed ? trimmed : undefined;
}

function conversationSelectionTotalLength(
  references: readonly ConversationSelectionReference[],
): number {
  // 与 shared 的 conversationQuotesSchema 保持一致：批注计入总量，但不挤占正文配额。
  return references.reduce(
    (sum, item) => sum + item.text.length + (item.comment?.length ?? 0),
    0,
  );
}

export function appendConversationSelectionReference(
  current: readonly ConversationSelectionReference[],
  reference: ConversationSelectionReference,
): ConversationSelectionAppendResult {
  if (reference.text.length > CONVERSATION_SELECTION_MAX_TEXT_LENGTH) {
    return { ok: false, reason: "single" };
  }
  const comment = normalizeComment(reference.comment);
  if ((comment?.length ?? 0) > CONVERSATION_SELECTION_MAX_COMMENT_LENGTH) {
    return { ok: false, reason: "comment" };
  }
  const key = getConversationSelectionDedupeKey(reference);
  const existingIndex = current.findIndex(
    (item) => getConversationSelectionDedupeKey(item) === key,
  );
  if (existingIndex >= 0) {
    // 同源同文再次添加视为补充批注，而不是追加重复引用。
    // 未带批注时保留已有批注，避免「先加选区、后补批注」被后一次空批注清掉。
    if (!comment) return { ok: true, references: current, duplicate: true };
    const updated = current.map((item, index) =>
      index === existingIndex ? { ...item, comment } : item,
    );
    if (conversationSelectionTotalLength(updated) > CONVERSATION_SELECTION_MAX_TOTAL_LENGTH) {
      return { ok: false, reason: "total" };
    }
    return { ok: true, references: updated, duplicate: true };
  }
  if (current.length >= CONVERSATION_SELECTION_MAX_COUNT) {
    return { ok: false, reason: "count" };
  }
  const nextReference = comment ? { ...reference, comment } : reference;
  if (
    conversationSelectionTotalLength([...current, nextReference]) >
    CONVERSATION_SELECTION_MAX_TOTAL_LENGTH
  ) {
    return { ok: false, reason: "total" };
  }
  return { ok: true, references: [...current, nextReference], duplicate: false };
}

/**
 * 就地更新一条已有引用的批注（chip 内编辑用）。
 *
 * 草稿 Map 是模块级存储，订阅者只监听 add 事件；这里复用同一事件通知所有已挂载的
 * composer 重新读取 scope，避免为一次批注编辑新增事件通道。
 */
export function updateConversationSelectionReferenceComment(
  sessionId: string | null,
  workspaceKey: string,
  id: string,
  comment: string | undefined,
): ConversationSelectionAppendResult {
  const scopeKey = referenceScopeKey(sessionId, workspaceKey);
  const current = referencesByScope.get(scopeKey) ?? [];
  const index = current.findIndex((item) => item.id === id);
  if (index < 0) return { ok: true, references: current, duplicate: false };
  const normalized = normalizeComment(comment);
  const updated = current.map((item, itemIndex) =>
    itemIndex === index ? { ...item, comment: normalized } : item,
  );
  if (conversationSelectionTotalLength(updated) > CONVERSATION_SELECTION_MAX_TOTAL_LENGTH) {
    return { ok: false, reason: "total" };
  }
  const next = updated;
  if (next.length > 0) referencesByScope.set(scopeKey, next);
  else referencesByScope.delete(scopeKey);
  limitReasonByScope.delete(scopeKey);
  window.dispatchEvent(
    new CustomEvent(ADD_EVENT, {
      detail: {
        targetSessionId: sessionId,
        workspaceKey,
        reference: next[index]!,
        result: { ok: true, references: next, duplicate: true },
      },
    }),
  );
  return { ok: true, references: next, duplicate: true };
}

export function parsePromptConversationSelections(text: string): {
  visibleContent: string;
  references: readonly ConversationSelectionDisplayReference[];
} {
  const userSelectMatch = text.match(USER_SELECT_BLOCK_PATTERN);
  if (userSelectMatch) {
    return parseConversationSelectionBlock(text, userSelectMatch, (value) => {
      if (!isConversationSelectionText(value)) return null;
      // 与发送合同一致，历史保留文件路径，普通对话继续只恢复正文；批注随引用一起恢复。
      const entry: ConversationSelectionDisplayReference = { text: value.text };
      if (value.path) entry.path = value.path;
      if (value.comment?.trim()) entry.comment = value.comment.trim();
      return entry;
    });
  }
  const legacyMatch = text.match(LEGACY_BLOCK_PATTERN);
  if (!legacyMatch) return { visibleContent: text, references: [] };
  return parseConversationSelectionBlock(text, legacyMatch, (value) =>
    isConversationSelectionReference(value) ? value : null,
  );
}

function parseConversationSelectionBlock<T extends ConversationSelectionDisplayReference>(
  text: string,
  match: RegExpMatchArray,
  parseItem: (value: unknown) => T | null,
): { visibleContent: string; references: readonly T[] } {
  try {
    const parsed = JSON.parse(match[1] ?? "[]");
    if (!Array.isArray(parsed)) throw new Error("selection block is not an array");
    const references: T[] = [];
    for (const value of parsed) {
      const reference = parseItem(value);
      if (!reference) throw new Error("invalid selection reference");
      references.push(reference);
    }
    return {
      visibleContent: text.slice(0, match.index).trimEnd(),
      references,
    };
  } catch {
    return { visibleContent: text, references: [] };
  }
}

export function dispatchConversationSelectionAdd(
  detail: Omit<ConversationSelectionAddEventDetail, "result">,
): ConversationSelectionAppendResult {
  const current = getConversationSelectionReferenceScope(
    detail.targetSessionId,
    detail.workspaceKey,
  );
  const result = appendConversationSelectionReference(current, detail.reference);
  if (result.ok) {
    setConversationSelectionReferenceScope(
      detail.targetSessionId,
      detail.workspaceKey,
      result.references,
    );
  } else {
    limitReasonByScope.set(
      referenceScopeKey(detail.targetSessionId, detail.workspaceKey),
      result.reason,
    );
  }
  window.dispatchEvent(new CustomEvent(ADD_EVENT, { detail: { ...detail, result } }));
  return result;
}

export function isConversationSelectionAddEvent(
  event: Event,
): event is CustomEvent<ConversationSelectionAddEventDetail> {
  return event.type === ADD_EVENT && event instanceof CustomEvent;
}

export function getConversationSelectionAddEventName(): string {
  return ADD_EVENT;
}

function isConversationSelectionText(value: unknown): value is ConversationSelectionText {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<ConversationSelectionText>;
  return (
    typeof candidate.text === "string" &&
    (!("path" in value) ||
      (typeof candidate.path === "string" && candidate.path.trim().length > 0)) &&
    (!("comment" in value) || typeof candidate.comment === "string") &&
    Object.keys(value).every(
      (key) => key === "text" || key === "path" || key === "comment",
    )
  );
}

export function isConversationSelectionReference(
  value: unknown,
): value is ConversationSelectionReference {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ConversationSelectionReference>;
  if (candidate.contentType === "markdown") {
    return (
      typeof candidate.id === "string" &&
      typeof candidate.text === "string" &&
      typeof candidate.sourceKey === "string" &&
      typeof candidate.sourceTitle === "string"
    );
  }
  return (
    typeof candidate.id === "string" &&
    "sourceSessionId" in candidate &&
    typeof candidate.sourceSessionId === "string" &&
    "sourceRowId" in candidate &&
    typeof candidate.sourceRowId === "number" &&
    typeof candidate.text === "string" &&
    ["user", "assistant", "reasoning", "tool"].includes(candidate.contentType ?? "")
  );
}

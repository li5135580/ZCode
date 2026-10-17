import { z } from "zod";
export const CONVERSATION_SELECTION_MAX_TEXT_LENGTH = 8_000;
export const CONVERSATION_SELECTION_MAX_COUNT = 20;
export const CONVERSATION_SELECTION_MAX_TOTAL_LENGTH = 32_000;
/** 单条引用的用户批注上限。批注与正文分开计量，避免批注挤占正文配额。 */
export const CONVERSATION_SELECTION_MAX_COMMENT_LENGTH = 2_000;

export const conversationQuoteSchema = z.object({
  text: z.string().max(CONVERSATION_SELECTION_MAX_TEXT_LENGTH),
  path: z.string().optional(),
  /**
   * 用户对这段引用的针对性批注（纠偏说明）。
   *
   * 可选：缺省时行为与旧版本完全一致。它随 conversationQuotes 一起进入模型上下文，
   * 因此每条引用可以各自说明「这处需要怎么改」，而不是只能给整轮输出写一句总评。
   */
  comment: z.string().max(CONVERSATION_SELECTION_MAX_COMMENT_LENGTH).optional(),
  senderName: z.string().optional(),
  senderId: z.string().optional(),
  messageId: z.string().optional(),
  sentAt: z.string().datetime({ offset: true }).optional(),
});
export const conversationQuotesSchema = z
  .array(conversationQuoteSchema)
  .max(CONVERSATION_SELECTION_MAX_COUNT)
  .refine(
    (quotes) =>
      quotes.reduce(
        (sum, quote) => sum + quote.text.length + (quote.comment?.length ?? 0),
        0,
      ) <= CONVERSATION_SELECTION_MAX_TOTAL_LENGTH,
  );
export type ConversationSelectionText = z.infer<typeof conversationQuoteSchema>;

export function buildPromptWithConversationSelections(
  visibleContent: string,
  references: readonly ConversationSelectionText[],
): string {
  if (references.length === 0) return visibleContent;
  // 文件选段曾只发正文，导致模型与历史丢失文件来源；只保留路径，不发送内部身份字段。
  // 批注同样属于用户显式输入，需要一并带上，否则模型无法知道「这处要改成什么」。
  const block = [
    "# userselect:",
    "```userselect",
    JSON.stringify(
      references.map(({ text, path, comment }) => {
        const entry: { path?: string; text: string; comment?: string } = { text };
        if (path?.trim()) entry.path = path;
        if (comment?.trim()) entry.comment = comment.trim();
        return entry;
      }),
    ),
    "```",
  ].join("\n");
  return visibleContent ? `${visibleContent}\n\n${block}` : block;
}

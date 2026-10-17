// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ZCodeIntlProvider } from "@/i18n/IntlProvider.js";
import { ConversationSelectionReferenceChip } from "@/v4/composer/ConversationSelectionReferenceChip.js";
import {
  parsePromptConversationSelections,
  buildPromptWithConversationSelections,
} from "@/lib/conversationSelectionReference.js";

afterEach(cleanup);
it.each(["/workspace/docs/a.md", "C:\\docs\\a.md"])(
  "历史引用显示文件名和完整路径：%s",
  async (path) => {
    const { references } = parsePromptConversationSelections(
      buildPromptWithConversationSelections("Explain", [{ path, text: "excerpt" }]),
    );
    render(
      createElement(
        ZCodeIntlProvider,
        { initialLocale: "zh-CN" },
        createElement(ConversationSelectionReferenceChip, { references }),
      ),
    );
    const chip = screen.getByRole("button", { name: "a.md · 引用" });
    fireEvent.pointerEnter(chip);
    expect(await screen.findByText(path)).toBeTruthy();
    expect(await screen.findByText("excerpt")).toBeTruthy();
  },
);
it("chip 展示每条引用的批注文案", async () => {
  render(
    createElement(
      ZCodeIntlProvider,
      { initialLocale: "zh-CN" },
      createElement(ConversationSelectionReferenceChip, {
        references: [{ text: "原文摘录", comment: "这里应该是三条" }],
      }),
    ),
  );
  const chip = screen.getByRole("button", { name: "1 条对话引用" });
  fireEvent.pointerEnter(chip);
  expect(await screen.findByText("这里应该是三条")).toBeTruthy();
  expect(await screen.findByText("批注")).toBeTruthy();
});
it("混合引用使用通用计数", () => {
  render(
    createElement(
      ZCodeIntlProvider,
      { initialLocale: "en-US" },
      createElement(ConversationSelectionReferenceChip, {
        references: [{ path: "a.md", text: "file" }, { text: "message" }],
      }),
    ),
  );
  expect(screen.getByRole("button", { name: "2 selections" })).toBeTruthy();
});

import { describe, expect, it } from "vitest";
import enUS from "@/i18n/locales/en-US.js";
import zhCN from "@/i18n/locales/zh-CN.js";

const MODEL_CHAIN_KEYS = [
  "settings.subagents.modelChain.title",
  "settings.subagents.modelChain.description",
  "settings.subagents.modelChain.primary",
  "settings.subagents.modelChain.primaryPlaceholder",
  "settings.subagents.modelChain.primaryDescription",
  "settings.subagents.modelChain.fallbacks",
  "settings.subagents.modelChain.fallbacksLimit",
  "settings.subagents.modelChain.fallbackPlaceholder",
  "settings.subagents.modelChain.fallbacksEmpty",
  "settings.subagents.modelChain.addFallback",
  "settings.subagents.modelChain.removeFallback",
  "settings.subagents.modelChain.retryCount",
  "settings.subagents.modelChain.retryCountDescription",
  "settings.subagents.modelChain.clearModel",
  "settings.subagents.modelChain.modelCount",
  "settings.subagents.form.validation.modelChainPrimaryRequired",
] as const;

describe("Subagent model chain i18n", () => {
  it("两种语言都定义了全部模型链文案", () => {
    for (const key of MODEL_CHAIN_KEYS) {
      expect(zhCN[key], `zh-CN 缺少 ${key}`).toBeTruthy();
      expect(enUS[key], `en-US 缺少 ${key}`).toBeTruthy();
    }
  });

  it("使用任务约定的中文与英文文案", () => {
    expect(zhCN["settings.subagents.modelChain.title"]).toBe("模型链");
    expect(zhCN["settings.subagents.modelChain.primary"]).toBe("主模型");
    expect(zhCN["settings.subagents.modelChain.fallbacks"]).toBe("备用模型");
    expect(zhCN["settings.subagents.modelChain.retryCount"]).toBe("失败重试次数");
    expect(zhCN["settings.subagents.modelChain.addFallback"]).toBe("添加备用模型");
    expect(zhCN["settings.subagents.modelChain.modelCount"]).toBe("{count} 个模型");

    expect(enUS["settings.subagents.modelChain.title"]).toBe("Model chain");
    expect(enUS["settings.subagents.modelChain.primary"]).toBe("Primary model");
    expect(enUS["settings.subagents.modelChain.fallbacks"]).toBe("Fallback models");
    expect(enUS["settings.subagents.modelChain.retryCount"]).toBe("Retry attempts");
    expect(enUS["settings.subagents.modelChain.addFallback"]).toBe("Add fallback model");
    expect(enUS["settings.subagents.modelChain.modelCount"]).toBe("{count} models");
  });

  it("占位符在两种语言中一致，保证替换后不会残留花括号", () => {
    const placeholders = (message: string) => (message.match(/\{[a-z]+\}/gu) ?? []).sort();
    for (const key of MODEL_CHAIN_KEYS) {
      expect(placeholders(zhCN[key] ?? ""), `占位符不一致：${key}`).toEqual(
        placeholders(enUS[key] ?? ""),
      );
    }
  });

  it("modelCount 使用 {count} 占位符（IntlProvider 的单花括号替换约定）", () => {
    expect(zhCN["settings.subagents.modelChain.modelCount"]).toContain("{count}");
    expect(enUS["settings.subagents.modelChain.modelCount"]).toContain("{count}");
  });
});

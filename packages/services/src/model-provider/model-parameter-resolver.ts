import type { FetchedModelInfo } from "./model-fetcher-service.js";

/**
 * 模型参数解析。
 *
 * 只合并「确有来源」的参数：API 返回的元数据优先，其次调用方显式传入的基线。
 * 这里刻意不做按模型 ID 的本地推断——模型能力（上下文窗口、输出上限、推理档位）
 * 的权威来源是 Host 的推荐规则表（`config/provider/zcode-builtin.json`，
 * 由 `ModelConfigRules.resolve` 按 `modelMatch` 匹配），本地维护一份同义表只会在
 * 上游新增或调整模型时静默漂移：写入的个人覆盖会盖住 Host 更准确的基线
 * （例如 glm-5.3 被本地误判成 200000，而 Host 规则给出 1000000）。
 */

/** 解析完成后模型参数的完整形态。 */
export interface ResolvedModelConfig {
  modelId: string;
  contextWindow: number;
  maxOutputTokens: number;
  inputFormat: {
    supportsText: boolean;
    supportsImage: boolean;
    supportsVideo: boolean;
    supportsAudio: boolean;
    supportsPdf: boolean;
  };
  reasoningLevels: string[];
  defaultReasoningLevel?: string;
}

/** 缺省参数。在没有任何 API 元数据或内置匹配时使用。 */
const DEFAULT_MODEL_CONFIG: ResolvedModelConfig = {
  modelId: "",
  contextWindow: 200000,
  maxOutputTokens: 32000,
  inputFormat: {
    supportsText: true,
    supportsImage: false,
    supportsVideo: false,
    supportsAudio: false,
    supportsPdf: false,
  },
  reasoningLevels: ["disabled", "enabled"],
};

/**
 * 解析模型参数。
 *
 * 优先级：API 返回 > 调用方传入的基线 > 默认配置。
 * 各字段独立合并，输入缺失的字段按优先级回退，避免可选字段被 `undefined` 覆盖默认值。
 *
 * 注意：调用方不应把「按模型 ID 猜出来的值」当作基线传入。猜错的值会变成个人覆盖，
 * 反而屏蔽 Host 推荐规则表里更准确的基线；模型未知时保持缺省、交由 Host 解析才是正确做法。
 *
 * @param modelInfo API 或内置来源返回的模型信息。
 * @param builtinConfig 调用方显式提供的模型参数基线。
 */
export function resolveModelParameters(
  modelInfo: FetchedModelInfo,
  builtinConfig?: Partial<ResolvedModelConfig>,
): ResolvedModelConfig {
  return {
    modelId: modelInfo.modelId,
    contextWindow:
      modelInfo.contextWindow ?? builtinConfig?.contextWindow ?? DEFAULT_MODEL_CONFIG.contextWindow,
    maxOutputTokens:
      modelInfo.maxOutputTokens ??
      builtinConfig?.maxOutputTokens ??
      DEFAULT_MODEL_CONFIG.maxOutputTokens,
    inputFormat: {
      supportsText:
        modelInfo.inputFormat?.supportsText ??
        builtinConfig?.inputFormat?.supportsText ??
        DEFAULT_MODEL_CONFIG.inputFormat.supportsText,
      supportsImage:
        modelInfo.inputFormat?.supportsImage ??
        builtinConfig?.inputFormat?.supportsImage ??
        DEFAULT_MODEL_CONFIG.inputFormat.supportsImage,
      supportsVideo:
        modelInfo.inputFormat?.supportsVideo ??
        builtinConfig?.inputFormat?.supportsVideo ??
        DEFAULT_MODEL_CONFIG.inputFormat.supportsVideo,
      supportsAudio:
        modelInfo.inputFormat?.supportsAudio ??
        builtinConfig?.inputFormat?.supportsAudio ??
        DEFAULT_MODEL_CONFIG.inputFormat.supportsAudio,
      supportsPdf:
        modelInfo.inputFormat?.supportsPdf ??
        builtinConfig?.inputFormat?.supportsPdf ??
        DEFAULT_MODEL_CONFIG.inputFormat.supportsPdf,
    },
    reasoningLevels:
      modelInfo.reasoningLevels ?? builtinConfig?.reasoningLevels ?? DEFAULT_MODEL_CONFIG.reasoningLevels,
    defaultReasoningLevel: builtinConfig?.defaultReasoningLevel,
  };
}

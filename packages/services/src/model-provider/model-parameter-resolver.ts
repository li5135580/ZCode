import type { FetchedModelInfo } from "./model-fetcher-service.js";

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
 * 优先级：API 返回 > 内置匹配 > 默认配置。
 * 各字段独立合并，输入缺失的字段按优先级回退，避免可选字段被 `undefined` 覆盖默认值。
 *
 * @param modelInfo API 或内置来源返回的模型信息。
 * @param builtinConfig 内置匹配得到的模型参数。
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

/**
 * 根据模型 ID 推断参数（内置规则）。
 * 命中则返回覆盖参数，未命中返回空对象，交由默认配置兜底。
 */
export function inferModelParameters(modelId: string): Partial<ResolvedModelConfig> {
  const lowerModelId = modelId.toLowerCase();

  // GLM 系列
  if (lowerModelId.includes("glm-5.2")) {
    return {
      contextWindow: 1000000,
      maxOutputTokens: 128000,
      reasoningLevels: ["disabled", "high", "max"],
    };
  }
  if (lowerModelId.includes("glm-5")) {
    return {
      contextWindow: 200000,
      maxOutputTokens: 64000,
      reasoningLevels: ["disabled", "enabled"],
    };
  }

  // Claude 系列
  if (lowerModelId.includes("claude-4")) {
    return {
      contextWindow: 200000,
      maxOutputTokens: 64000,
      inputFormat: {
        supportsText: true,
        supportsImage: true,
        supportsVideo: false,
        supportsAudio: false,
        supportsPdf: true,
      },
    };
  }

  // GPT 系列
  if (lowerModelId.includes("gpt-5")) {
    return {
      contextWindow: 400000,
      maxOutputTokens: 128000,
    };
  }

  return {};
}
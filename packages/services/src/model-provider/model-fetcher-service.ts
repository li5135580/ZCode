import type { ProviderApiType } from "@zcode/provider";

/** 通过 API 或内置配置获取到的单个模型信息。未补齐的参数由 model-parameter-resolver 按优先级填充。 */
export interface FetchedModelInfo {
  /** 模型 ID，例如 "glm-5"、"claude-4-sonnet"。 */
  modelId: string;
  /** 上下文窗口大小（token 数）。 */
  contextWindow?: number;
  /** 最大输出 token 数。 */
  maxOutputTokens?: number;
  /** 输入格式能力。 */
  inputFormat?: {
    supportsText: boolean;
    supportsImage: boolean;
    supportsVideo: boolean;
    supportsAudio: boolean;
    supportsPdf: boolean;
  };
  /** 该模型支持的推理档位（reasoning level）。 */
  reasoningLevels?: string[];
  /** 信息来源：API 返回 / 内置配置匹配 / 默认配置。 */
  source: "api" | "builtin" | "default";
}

export interface FetchModelsResult {
  success: boolean;
  models: FetchedModelInfo[];
  error?: string;
}

/**
 * 模型自动获取所需的 Provider 形状。
 *
 * 当前 @zcode/shared 的 ZCodeProvider 只是 "glm" 字符串字面量，不携带 API 形态与端点，
 * 因此这里定义结构化输入：apiKind 对应 @zcode/provider 的 ProviderApiType，
 * baseUrl 对应 ProviderApiConfig.baseUrl。可传入 ProviderApiConfig 派生对象或直接构造字面量。
 */
export interface ProviderModelFetcherInput {
  /** Provider 的 API 类型；缺失或不在已知集合内时走内置配置匹配。 */
  apiKind?: ProviderApiType | null;
  /** API Base URL，例如 "https://api.z.ai/api/paas/v4"。 */
  baseUrl?: string | null;
}

/**
 * 从 Provider 获取模型列表。
 *
 * 规则：
 * - OpenAI 兼容（chat-completions / responses）：调用 `GET {baseUrl}/models`。
 * - Anthropic（messages）：Anthropic 未提供公共模型列表 API，返回内置模型列表。
 * - 其他 / 未知类型：使用内置配置匹配。
 *
 * @param provider Provider 的 API 形状描述（apiKind + baseUrl）。
 * @param apiKey 访问 Provider API 所需的密钥。
 */
export async function fetchProviderModels(
  provider: ProviderModelFetcherInput,
  apiKey: string,
): Promise<FetchModelsResult> {
  switch (provider.apiKind) {
    case "openai-chat-completions":
    case "openai-responses":
      return fetchOpenAICompatibleModels(provider.baseUrl, apiKey);
    case "anthropic-messages":
      return fetchAnthropicModels(provider.baseUrl, apiKey);
    default:
      // 其他类型（含未配置 apiKind 的 Provider）使用内置配置匹配。
      return fetchBuiltinModels(provider);
  }
}

/**
 * 获取 OpenAI 兼容 API 的模型列表。
 * Z.AI / BigModel / OpenAI 等均兼容 `/models` 端点。
 */
async function fetchOpenAICompatibleModels(
  baseUrl: string | null | undefined,
  apiKey: string,
): Promise<FetchModelsResult> {
  if (!baseUrl) {
    return {
      success: false,
      models: [],
      error: "缺少 Base URL，无法从 OpenAI 兼容 API 获取模型列表",
    };
  }

  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/models`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      return {
        success: false,
        models: [],
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const payload = await response.json();
    const list: unknown = isRecord(payload) ? payload.data : undefined;
    if (!Array.isArray(list)) {
      return {
        success: false,
        models: [],
        error: "响应格式不符合预期：缺少 data 数组",
      };
    }

    const models: FetchedModelInfo[] = list
      .filter((item): item is { id: string } => isRecord(item) && typeof item.id === "string")
      .map((item) => ({ modelId: item.id, source: "api" as const }));

    return { success: true, models };
  } catch (error) {
    return {
      success: false,
      models: [],
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * 获取 Anthropic 模型列表。
 * Anthropic 目前没有公开的模型列表 API，返回内置列表兜底。
 */
async function fetchAnthropicModels(
  _baseUrl: string | null | undefined,
  _apiKey: string,
): Promise<FetchModelsResult> {
  const builtinModels: FetchedModelInfo[] = [
    { modelId: "claude-4-opus", source: "builtin" },
    { modelId: "claude-4-sonnet", source: "builtin" },
    { modelId: "claude-4-haiku", source: "builtin" },
    { modelId: "claude-3.5-sonnet", source: "builtin" },
  ];
  return { success: true, models: builtinModels };
}

/**
 * 使用内置配置匹配模型。
 * TODO: 从 zcode-builtin.json 读取该 Provider 的模板模型列表。
 */
async function fetchBuiltinModels(
  _provider: ProviderModelFetcherInput,
): Promise<FetchModelsResult> {
  return {
    success: true,
    models: [],
    error: "Builtin model list not implemented yet",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
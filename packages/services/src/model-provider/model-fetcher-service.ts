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
  /** 内置配置文件路径覆盖；省略时按环境变量解析。 */
  builtinConfigFilePath?: string | null;
}

/** 内置配置文件中一条可匹配的模型列表规则。 */
interface BuiltinModelRule {
  /** 该规则声明的模型 ID 列表。 */
  readonly modelIds: readonly string[];
  /** 规则声明的 API 类型，用于同 Base URL 多形态时消歧。 */
  readonly apiKind?: string;
  /** 规则声明的 Base URL。 */
  readonly baseUrl: string;
}

/** 内置配置文件路径的候选环境变量，按优先级排列。 */
const BUILTIN_CONFIG_PATH_ENV_KEYS = [
  "ZCODE_BUILTIN_PROVIDER_CONFIG_FILE",
  "ZCODE_BUILTIN_PROVIDER_BUNDLED_CONFIG_FILE",
] as const;

/**
 * 从 Provider 获取模型列表。
 *
 * 规则：
 * - [OI] 兼容（chat-completions / responses）：调用 `GET {baseUrl}/models`。
 * - Anthropic（messages）：Anthropic 未提供公共模型列表 API，先按 Base URL 匹配内置配置，
 *   匹配不到时回退到内置的 Claude 列表。
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
      return fetchAnthropicModels(provider);
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
      .map((item) => ({
        modelId: item.id,
        ...parseModelMetadata(item),
        source: "api" as const,
      }));

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
 * 从 `/models` 单条记录里提取能力元数据。
 *
 * 不同 provider 的字段名不统一（[OI] 兼容端点多数只返回 `id`），因此这里只按
 * 「字段存在且类型合法」取值，取不到就保持缺省，交由 Host 推荐规则表解析。
 * 这样既能在 OpenRouter 这类返回完整元数据的端点上得到官方参数，又不会因为
 * 字段名猜错而写入错误覆盖。
 */
function parseModelMetadata(item: Record<string, unknown>): Partial<FetchedModelInfo> {
  const topProvider = isRecord(item.top_provider) ? item.top_provider : undefined;

  const contextWindow = firstPositiveInteger(
    item.context_length,
    item.context_window,
    item.max_context_length,
    topProvider?.context_length,
  );
  const maxOutputTokens = firstPositiveInteger(
    item.max_completion_tokens,
    item.max_output_tokens,
    topProvider?.max_completion_tokens,
  );
  const inputFormat = parseInputModalities(item.architecture);

  return {
    ...(contextWindow !== undefined ? { contextWindow } : {}),
    ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
    ...(inputFormat !== undefined ? { inputFormat } : {}),
  };
}

/** 取第一个「有限正整数」候选值；其余（字符串、负数、NaN）一律忽略。 */
function firstPositiveInteger(...candidates: readonly unknown[]): number | undefined {
  for (const candidate of candidates) {
    if (typeof candidate !== "number" || !Number.isFinite(candidate) || candidate <= 0) {
      continue;
    }
    return Math.trunc(candidate);
  }
  return undefined;
}

/** `architecture.input_modalities` → 输入能力；数组缺失或为空时返回 undefined。 */
function parseInputModalities(architecture: unknown): FetchedModelInfo["inputFormat"] {
  if (!isRecord(architecture)) return undefined;
  const modalities = architecture.input_modalities;
  if (!Array.isArray(modalities)) return undefined;
  const normalized = modalities
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim().toLowerCase());
  if (normalized.length === 0) return undefined;
  // "file" 在 OpenRouter 语义里就是文档/PDF 附件。
  const has = (...names: readonly string[]) => names.some((name) => normalized.includes(name));
  return {
    supportsText: has("text"),
    supportsImage: has("image"),
    supportsVideo: has("video"),
    supportsAudio: has("audio"),
    supportsPdf: has("file", "pdf"),
  };
}

/**
 * 获取 Anthropic Messages 形态 Provider 的模型列表。
 *
 * Anthropic 目前没有公开的模型列表 API，因此先按 Base URL 匹配内置配置
 * （Z.ai / BigModel / Moonshot / DeepSeek 等的 anthropic 端点都只在内置配置里声明），
 * 内置配置不可用或未命中时回退到内置的 Claude 列表兜底。
 */
async function fetchAnthropicModels(
  provider: ProviderModelFetcherInput,
): Promise<FetchModelsResult> {
  const builtin = await fetchBuiltinModels(provider);
  if (builtin.success && builtin.models.length > 0) return builtin;
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
 *
 * 从内置 Provider 配置文件（`config/provider/zcode-builtin.json`）里找出 Base URL 与
 * API 形态都匹配的规则，返回其 `builtinModelIds`。该文件只存在于宿主 / Node 侧，
 * 因此路径按「显式入参 > 环境变量」解析；Browser 环境下取不到文件时返回失败结果，
 * 由调用方提示用户手动添加模型。
 */
async function fetchBuiltinModels(
  provider: ProviderModelFetcherInput,
): Promise<FetchModelsResult> {
  const baseUrl = normalizeBaseUrl(provider.baseUrl);
  if (!baseUrl) {
    return {
      success: false,
      models: [],
      error: "缺少 Base URL，无法匹配内置模型列表",
    };
  }
  const filePath = resolveBuiltinConfigFilePath(provider.builtinConfigFilePath);
  if (!filePath) {
    return {
      success: false,
      models: [],
      error: "未找到内置 Provider 配置文件路径，无法匹配内置模型列表",
    };
  }
  const config = readBuiltinConfig(filePath);
  if (!config) {
    return {
      success: false,
      models: [],
      error: `无法读取内置 Provider 配置文件: ${filePath}`,
    };
  }
  const modelIds = matchBuiltinModelIds(config, { baseUrl, apiKind: provider.apiKind ?? undefined });
  if (modelIds.length === 0) {
    return {
      success: false,
      models: [],
      error: "内置配置中没有匹配该 Base URL 的模型列表",
    };
  }
  return {
    success: true,
    models: modelIds.map((modelId) => ({ modelId, source: "builtin" as const })),
  };
}

/** 去掉末尾斜杠，避免 `.../v4` 与 `.../v4/` 被当作不同 Provider。 */
function normalizeBaseUrl(baseUrl: string | null | undefined): string | null {
  const trimmed = baseUrl?.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/+$/, "");
}

/** 解析内置配置文件路径：显式入参优先，其次宿主注入的环境变量。 */
function resolveBuiltinConfigFilePath(override: string | null | undefined): string | null {
  const explicit = override?.trim();
  if (explicit) return explicit;
  // Renderer / Web 没有 process.env，缺少配置时按「无内置配置」处理。
  const env = getNodeProcess()?.env;
  if (!env) return null;
  for (const key of BUILTIN_CONFIG_PATH_ENV_KEYS) {
    const value = env[key]?.trim();
    if (value) return value;
  }
  return null;
}

/**
 * 读取并解析内置配置文件。
 *
 * 通过 `process.getBuiltinModule` 按需取 `node:fs`，避免在 Browser 打包里静态引入 Node 内置模块。
 */
function readBuiltinConfig(filePath: string): BuiltinProviderConfig | null {
  const fs = getNodeModule<{ readFileSync: (path: string, encoding: string) => string }>("node:fs");
  if (!fs) return null;
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** 在 `templateRules` 与 `providerRules` 中按 Base URL（必要时叠加 API 形态）收集模型 ID。 */
function matchBuiltinModelIds(
  config: BuiltinProviderConfig,
  target: { baseUrl: string; apiKind?: string },
): string[] {
  const modelIds: string[] = [];
  const seen = new Set<string>();
  for (const rule of collectBuiltinModelRules(config)) {
    if (rule.baseUrl !== target.baseUrl) continue;
    if (target.apiKind !== undefined && rule.apiKind !== undefined && rule.apiKind !== target.apiKind) {
      continue;
    }
    for (const modelId of rule.modelIds) {
      if (seen.has(modelId)) continue;
      seen.add(modelId);
      modelIds.push(modelId);
    }
  }
  return modelIds;
}

/** 把内置配置里的两类规则统一成可匹配的形状，跳过结构不完整的项。 */
function collectBuiltinModelRules(config: BuiltinProviderConfig): BuiltinModelRule[] {
  const root = config.config;
  if (!isRecord(root)) return [];
  const providerConfigRules = root.providerConfigRules;
  if (!isRecord(providerConfigRules)) return [];
  const rules: BuiltinModelRule[] = [];
  for (const group of ["templateRules", "providerRules"] as const) {
    const list = providerConfigRules[group];
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      if (!isRecord(entry)) continue;
      const ruleConfig = entry.config;
      if (!isRecord(ruleConfig)) continue;
      const api = ruleConfig.api;
      if (!isRecord(api)) continue;
      const baseUrl = normalizeBaseUrl(typeof api.baseUrl === "string" ? api.baseUrl : null);
      if (!baseUrl) continue;
      const builtinModelIds = ruleConfig.builtinModelIds;
      if (!Array.isArray(builtinModelIds)) continue;
      rules.push({
        baseUrl,
        apiKind: typeof api.type === "string" ? api.type : undefined,
        modelIds: builtinModelIds.filter((id): id is string => typeof id === "string"),
      });
    }
  }
  return rules;
}

/** 内置配置文件中 `config.providerConfigRules` 的宽松结构。 */
interface BuiltinProviderConfig extends Record<string, unknown> {
  config?: Record<string, unknown>;
}

function getNodeProcess(): { env: Record<string, string | undefined> } | null {
  const processLike = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process;
  return processLike?.env ? { env: processLike.env } : null;
}

/** 按需取 Node 内置模块；Browser 环境返回 undefined。 */
function getNodeModule<T>(id: string): T | null {
  const processLike = (globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } })
    .process;
  const getBuiltinModule = processLike?.getBuiltinModule;
  if (typeof getBuiltinModule !== "function") return null;
  try {
    return (getBuiltinModule(id) as T | undefined) ?? null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
import type { FetchedModelInfo } from "@zcode/services";

/**
 * 「本次获取结果里缺失的个人模型」判定。
 *
 * 上游/供应商下架模型后，个人模型不会自动消失——它们存在个人配置里，
 * 只有内置（`builtin: true`）模型才会随应用版本更新自动消失。
 * 这里负责找出「用户添加过、但本次获取没返回」的候选，交给用户显式清理。
 *
 * 刻意不做自动删除，原因见 `isAuthoritativeModelList`：
 * 获取结果并不总是完整清单，误删会连带丢掉用户手调的个人参数。
 */
export interface StaleModelsResult {
  /** 是否允许展示清理入口。 */
  available: boolean;
  /** 本次未返回的个人模型 ID（保持原有顺序）。 */
  modelIds: readonly string[];
  /** 缺失占比 0..1；没有个人模型时为 0。 */
  missingRatio: number;
  /**
   * 缺失过半，结果很可能不完整（分页、权限过滤、临时故障），
   * UI 需要额外警示，但仍允许用户逐个确认后删除。
   */
  looksIncomplete: boolean;
}

const EMPTY_RESULT: StaleModelsResult = {
  available: false,
  modelIds: [],
  missingRatio: 0,
  looksIncomplete: false,
};

/** 缺失过半即视为「可能不完整」，与清理入口的警示阈值保持一致。 */
export const STALE_INCOMPLETE_RATIO = 0.5;

/**
 * 本次结果是否可以作为「下架」的判据。
 *
 * 只有**全部**条目都来自真实 API（`source === "api"`）才可信：
 * - `builtin`：内置配置匹配，或 Anthropic 分支的硬编码兜底列表
 *   （`fetchAnthropicModels` 拿不到内置配置时会返回 4 条固定的 Claude 模型）。
 *   拿它当完整清单会把用户添加的其它模型全部判成「已下架」。
 * - `default`：本地默认值，同样不是权威清单。
 */
export function isAuthoritativeModelList(fetchedModels: readonly FetchedModelInfo[]): boolean {
  return fetchedModels.length > 0 && fetchedModels.every((model) => model.source === "api");
}

/**
 * 计算可清理的个人模型。
 *
 * @param fetchedModels 本次获取到的模型（含 source）
 * @param personalModelIds 当前 Provider 下**个人添加**的模型 ID（不含 builtin）
 */
export function resolveStaleModels({
  fetchedModels,
  personalModelIds,
}: {
  fetchedModels: readonly FetchedModelInfo[];
  personalModelIds: readonly string[];
}): StaleModelsResult {
  if (personalModelIds.length === 0) {
    return EMPTY_RESULT;
  }
  if (!isAuthoritativeModelList(fetchedModels)) {
    return EMPTY_RESULT;
  }

  const fetchedIds = new Set(fetchedModels.map((model) => model.modelId));
  const modelIds = personalModelIds.filter((modelId) => !fetchedIds.has(modelId));
  if (modelIds.length === 0) {
    return EMPTY_RESULT;
  }

  const missingRatio = modelIds.length / personalModelIds.length;
  return {
    available: true,
    modelIds,
    missingRatio,
    looksIncomplete: missingRatio >= STALE_INCOMPLETE_RATIO,
  };
}

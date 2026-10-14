// ============================================================
// Subagent Model Chain Executor
// ============================================================

import { CoreErrorType, isCoreError, type ModelSelection } from "@zcode/contracts";
import { getModelChainSelections, type SubagentModelChain } from "@zcode/shared";
import {
  detectFailure,
  shouldRetry,
  type FailureDetectionResult,
} from "./model-chain-failure-detector.js";

/**
 * 模型链执行结果。
 *
 * 语义边界：`success` 描述“是否拿到了子智能体结果”，不代表使用了 primary 模型；
 * `fallbackUsed` 才是“是否走了 primary 之外的路径（备用模型或主 Agent 兜底）”的判断依据。
 */
export interface ModelChainExecutionResult {
  /** 链上模型或主 Agent 兜底是否成功产出结果 */
  success: boolean;
  /**
   * 链上最后一次尝试的模型选择。
   *
   * 仅用于日志与归因：回退到主 Agent 时兜底执行走的是父模型（调用方剥离链上选型），
   * 因此成功回退时该字段不再代表实际执行选型。
   */
  usedModel: ModelSelection;
  /** 是否使用了 primary 之外的路径（任一备用模型或主 Agent 兜底） */
  fallbackUsed: boolean;
  /** 链上与兜底路径全部失败时的最后一次错误 */
  error?: Error;
}

/** 单个模型的尝试次数下限：即使 retryCount 非正，也至少尝试一次。 */
const MIN_RETRY_BUDGET = 0;

/**
 * 按模型链顺序执行子智能体。
 *
 * 执行顺序与失败处理：
 * 1. 依次尝试 `primary` 与 `fallbacks`（顺序由 {@link getModelChainSelections} 给出）；
 * 2. 单个模型失败后按 `retryCount` 重试：`retryCount` 是“首次尝试之外的重试预算”，
 *    因此单个模型最多执行 `retryCount + 1` 次；预算用尽或失败不可重试时切换到下一个备用模型；
 * 3. 选型/配置类失败（模型或 provider 不可用）重试同一个模型不会改变结果，直接切换；
 * 4. 用户取消（abort/cancel）属于终态，不重试也不回退，直接返回失败；
 * 5. 链上全部模型失败后调用 `fallbackToMain` 回退到主 Agent 兜底执行。
 *
 * @param chain 子智能体 profile 声明的模型链（primary + fallbacks + retryCount）
 * @param executor 单次执行：使用给定选型跑一次子智能体；抛错即视为该次尝试失败
 * @param fallbackToMain 主 Agent 兜底执行：链上模型全部失败后调用，抛错即视为兜底也失败
 * @returns 执行结果；失败时 `error` 携带最后一次错误，由调用方决定如何上报
 */
export async function executeWithModelChain(
  chain: SubagentModelChain,
  executor: (model: ModelSelection) => Promise<unknown>,
  fallbackToMain: () => Promise<unknown>,
): Promise<ModelChainExecutionResult> {
  const selections = getModelChainSelections(chain);
  const retryBudgetPerModel = normalizeRetryBudget(chain.retryCount);
  let lastModel: ModelSelection = chain.primary;
  let lastError: Error | undefined;

  for (let index = 0; index < selections.length; index += 1) {
    const model = selections[index];
    if (!model) continue;
    lastModel = model;
    let remainingRetries = retryBudgetPerModel;
    for (;;) {
      try {
        await executor(model);
        return { fallbackUsed: index > 0, success: true, usedModel: model };
      } catch (error) {
        lastError = toError(error);
        if (isCancellationError(error)) {
          // 取消是终态：继续重试或换模型都会让父 Agent 的取消语义失真。
          return { error: lastError, fallbackUsed: index > 0, success: false, usedModel: model };
        }
        if (!shouldRetryModel(error, detectFailure(error), remainingRetries)) break;
        remainingRetries -= 1;
      }
    }
  }

  try {
    await fallbackToMain();
    return { fallbackUsed: true, success: true, usedModel: lastModel };
  } catch (error) {
    return { error: toError(error), fallbackUsed: true, success: false, usedModel: lastModel };
  }
}

/** retryCount 是每个模型的重试预算（首次尝试之外），非法值退化为不重试。 */
function normalizeRetryBudget(retryCount: number): number {
  if (!Number.isFinite(retryCount) || retryCount < MIN_RETRY_BUDGET) {
    return MIN_RETRY_BUDGET;
  }
  return Math.trunc(retryCount);
}

/** 是否还应重试当前模型；不可重试的失败与选型/配置错误一律交给下一个备用模型。 */
function shouldRetryModel(
  error: unknown,
  failure: FailureDetectionResult,
  remainingRetries: number,
): boolean {
  if (isModelSelectionError(error)) return false;
  return shouldRetry(failure, remainingRetries);
}

/** 选型/配置错误：同一个模型重试不会改变“provider 或 model 不可用”的事实。 */
function isModelSelectionError(error: unknown): boolean {
  return isCoreError(error) && error.type === CoreErrorType.ConfigurationError;
}

/** 取消判定只看结构化错误码，避免把普通错误消息里的 "cancel" 误判成用户取消。 */
function isCancellationError(error: unknown): boolean {
  if (isCoreError(error)) return /CANCEL|ABORT/u.test(error.code);
  return error instanceof Error && error.name === "AbortError";
}

/** 失败原因必须能以 Error 形式向上传递，保持错误链与日志可读。 */
function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

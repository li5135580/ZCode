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

/**
 * 一次链上尝试的上下文。
 *
 * `attemptIndex` 为 0 表示本轮链的首次执行；大于 0 说明之前已有尝试失败，
 * 调用方可以复用上一次落库的子会话历史续跑，而不是从零重来。
 */
export interface ModelChainAttemptInfo {
  /** 本轮链内的尝试序号，从 0 开始（跨模型累加，重试同模型也算新的一次）。 */
  attemptIndex: number;
  /** 本次尝试使用的模型选型。 */
  model: ModelSelection;
  /** 链上模型序号：0 为 primary，大于 0 为备用模型。 */
  chainIndex: number;
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
 * @param executor 单次执行：使用给定选型跑一次子智能体；抛错即视为该次尝试失败。
 *   第二个参数 `attempt` 告诉调用方这是第几次尝试（0 表示首次），调用方据此决定
 *   是否复用上一次已落库的子会话历史（续跑），从而不重跑已完成的工具调用。
 * @param settleFailedAttempt 失败收口：每次尝试失败、且即将重试或切换模型前调用。
 *   调用方应在此把已接受的工具调用收口成真实结果 / interrupted 结果，使下一次尝试
 *   的续跑历史里不会出现「有 tool_use 无 tool_result」的残缺回合。
 * @param fallbackToMain 主 Agent 兜底执行：链上模型全部失败后调用，抛错即视为兜底也失败
 * @returns 执行结果；失败时 `error` 携带最后一次错误，由调用方决定如何上报
 */
export async function executeWithModelChain(
  chain: SubagentModelChain,
  executor: (model: ModelSelection, attempt: ModelChainAttemptInfo) => Promise<unknown>,
  fallbackToMain: (attempt: ModelChainAttemptInfo) => Promise<unknown>,
  settleFailedAttempt?: () => Promise<void> | void,
): Promise<ModelChainExecutionResult> {
  const selections = getModelChainSelections(chain);
  const retryBudgetPerModel = normalizeRetryBudget(chain.retryCount);
  let lastModel: ModelSelection = chain.primary;
  let lastError: Error | undefined;
  // 跨模型累加的尝试序号：>0 时调用方可以复用上一次落库的子会话历史续跑。
  let attemptIndex = 0;

  for (let index = 0; index < selections.length; index += 1) {
    const model = selections[index];
    if (!model) continue;
    lastModel = model;
    let remainingRetries = retryBudgetPerModel;
    for (;;) {
      const attempt: ModelChainAttemptInfo = { attemptIndex, chainIndex: index, model };
      try {
        await executor(model, attempt);
        return { fallbackUsed: index > 0, success: true, usedModel: model };
      } catch (error) {
        lastError = toError(error);
        if (isCancellationError(error)) {
          // 取消是终态：继续重试或换模型都会让父 Agent 的取消语义失真。
          return { error: lastError, fallbackUsed: index > 0, success: false, usedModel: model };
        }
        // 失败收口必须发生在重试/切换之前：它把已接受的工具调用写成真实或 interrupted
        // 结果，下一次尝试的续跑历史才不会出现「有 tool_use 无 tool_result」的残缺回合。
        // 收口自身失败不能掩盖原始错误，只记录后继续走原有重试/切换决策。
        await settleSafely(settleFailedAttempt);
        attemptIndex += 1;
        if (!shouldRetryModel(error, detectFailure(error), remainingRetries)) break;
        remainingRetries -= 1;
      }
    }
  }

  try {
    await fallbackToMain({ attemptIndex, chainIndex: selections.length, model: lastModel });
    return { fallbackUsed: true, success: true, usedModel: lastModel };
  } catch (error) {
    return { error: toError(error), fallbackUsed: true, success: false, usedModel: lastModel };
  }
}

/**
 * 执行失败收口；收口本身抛错时只吞掉该错误。
 *
 * 原始失败原因（lastError）是调用方最终要上报的事实，收口只是为了让下一次尝试
 * 的历史完整，不能因为收口出问题就改变「哪个错误导致失败」的归因。
 */
async function settleSafely(settle?: () => Promise<void> | void): Promise<void> {
  if (!settle) return;
  try {
    await settle();
  } catch {
    // 故意忽略：见函数注释。
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

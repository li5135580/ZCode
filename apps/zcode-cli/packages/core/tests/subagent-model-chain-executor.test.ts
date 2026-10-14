import { describe, expect, it, vi } from "vitest";
import { createCoreError, CoreErrorType, type ModelSelection } from "@zcode/contracts";
import { executeWithModelChain } from "../src/subagent/model-chain-executor.js";
import {
  detectFailure,
  ModelChainFailureType,
} from "../src/subagent/model-chain-failure-detector.js";
import type { SubagentModelChain } from "@zcode/shared";

const primary: ModelSelection = { providerId: "zai", modelId: "glm-4.6" };
const firstFallback: ModelSelection = { providerId: "openai", modelId: "gpt-5" };
const secondFallback: ModelSelection = { providerId: "anthropic", modelId: "claude-4" };

function chain(overrides: Partial<SubagentModelChain> = {}): SubagentModelChain {
  return { primary, fallbacks: [firstFallback, secondFallback], retryCount: 2, ...overrides };
}

/** 服务器错误（5xx）：可重试，用于验证重试预算。 */
function retryableError(): Error {
  return Object.assign(new Error("upstream unavailable"), { statusCode: 503 });
}

/** 内容审核（400）：不可重试，用于验证立即切换下一个备用模型。 */
function nonRetryableError(): Error {
  return Object.assign(new Error("content filtered"), { statusCode: 400 });
}

describe("executeWithModelChain 执行顺序", () => {
  it("primary 成功时只执行一次且不标记回退", async () => {
    const executor = vi.fn(async () => undefined);
    const fallbackToMain = vi.fn(async () => undefined);

    await expect(executeWithModelChain(chain(), executor, fallbackToMain)).resolves.toEqual({
      fallbackUsed: false,
      success: true,
      usedModel: primary,
    });
    expect(executor).toHaveBeenCalledTimes(1);
    expect(executor).toHaveBeenCalledWith(primary);
    expect(fallbackToMain).not.toHaveBeenCalled();
  });

  it("primary 失败达到重试预算后切到第一个备用模型", async () => {
    const attempted: ModelSelection[] = [];
    const executor = vi.fn(async (model: ModelSelection) => {
      attempted.push(model);
      if (model === primary) throw retryableError();
    });

    const result = await executeWithModelChain(
      chain({ retryCount: 2 }),
      executor,
      async () => undefined,
    );

    expect(result).toEqual({ fallbackUsed: true, success: true, usedModel: firstFallback });
    // retryCount=2 是重试预算：primary 首次 + 2 次重试，然后切到第一个备用模型。
    expect(attempted).toEqual([primary, primary, primary, firstFallback]);
  });

  it("按 primary → fallbacks 顺序逐个回退", async () => {
    const attempted: ModelSelection[] = [];
    const executor = vi.fn(async (model: ModelSelection) => {
      attempted.push(model);
      if (model !== secondFallback) throw retryableError();
    });

    const result = await executeWithModelChain(
      chain({ retryCount: 0 }),
      executor,
      async () => undefined,
    );

    expect(result).toEqual({ fallbackUsed: true, success: true, usedModel: secondFallback });
    expect(attempted).toEqual([primary, firstFallback, secondFallback]);
  });

  it("不可重试失败不消耗重试预算，立即切换下一个模型", async () => {
    const attempted: ModelSelection[] = [];
    const executor = vi.fn(async (model: ModelSelection) => {
      attempted.push(model);
      if (model === primary) throw nonRetryableError();
    });

    await executeWithModelChain(chain({ retryCount: 5 }), executor, async () => undefined);

    expect(attempted).toEqual([primary, firstFallback]);
  });

  it("没有备用模型时 primary 成功即结束", async () => {
    const executor = vi.fn(async () => undefined);
    await executeWithModelChain(chain({ fallbacks: [] }), executor, async () => undefined);
    expect(executor).toHaveBeenCalledWith(primary);
  });
});

describe("executeWithModelChain 主 Agent 兜底", () => {
  it("链上全部模型失败后回退到主 Agent", async () => {
    const executor = vi.fn(async () => {
      throw retryableError();
    });
    const fallbackToMain = vi.fn(async () => undefined);

    const result = await executeWithModelChain(
      chain({ retryCount: 0 }),
      executor,
      fallbackToMain,
    );

    expect(result).toEqual({
      fallbackUsed: true,
      success: true,
      usedModel: secondFallback,
    });
    expect(executor.mock.calls.map(([model]) => model)).toEqual([
      primary,
      firstFallback,
      secondFallback,
    ]);
    expect(fallbackToMain).toHaveBeenCalledTimes(1);
  });

  it("主 Agent 兜底也失败时返回失败与最后一次错误", async () => {
    const fallbackError = new Error("main agent failed");
    const result = await executeWithModelChain(
      chain({ fallbacks: [], retryCount: 0 }),
      async () => {
        throw retryableError();
      },
      async () => {
        throw fallbackError;
      },
    );

    expect(result.success).toBe(false);
    expect(result.fallbackUsed).toBe(true);
    expect(result.usedModel).toEqual(primary);
    expect(result.error).toBe(fallbackError);
  });

  it("非 Error 抛错被归一化为 Error，保持错误链可读", async () => {
    const result = await executeWithModelChain(
      chain({ fallbacks: [], retryCount: 0 }),
      async () => {
        throw retryableError();
      },
      async () => {
        throw "main failed";
      },
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error?.message).toBe("main failed");
  });
});

describe("executeWithModelChain 取消与选型错误", () => {
  it("取消是终态：不重试、不回退、不调用主 Agent", async () => {
    const cancelError = createCoreError(CoreErrorType.ToolCancelled, "cancelled by user", {
      recoverable: true,
    });
    const executor = vi.fn(async () => {
      throw cancelError;
    });
    const fallbackToMain = vi.fn(async () => undefined);

    const result = await executeWithModelChain(
      chain({ retryCount: 3 }),
      executor,
      fallbackToMain,
    );

    expect(result).toEqual({
      error: cancelError,
      fallbackUsed: false,
      success: false,
      usedModel: primary,
    });
    expect(executor).toHaveBeenCalledTimes(1);
    expect(fallbackToMain).not.toHaveBeenCalled();
  });

  it("配置类错误不重试同一个模型，直接切换下一个", async () => {
    const attempted: ModelSelection[] = [];
    const configurationError = createCoreError(
      CoreErrorType.ConfigurationError,
      "provider unavailable",
      { recoverable: true },
    );

    await executeWithModelChain(
      chain({ retryCount: 5 }),
      async (model) => {
        attempted.push(model);
        if (model === primary) throw configurationError;
      },
      async () => undefined,
    );

    expect(attempted).toEqual([primary, firstFallback]);
  });

  it("普通错误消息里出现 cancel 字样不会被误判为用户取消", async () => {
    const attempted: ModelSelection[] = [];
    const executor = vi.fn(async (model: ModelSelection) => {
      attempted.push(model);
      if (model === primary) throw new Error("request cancelled by upstream gateway");
    });

    const result = await executeWithModelChain(
      chain({ retryCount: 0 }),
      executor,
      async () => undefined,
    );

    expect(result.success).toBe(true);
    expect(attempted).toEqual([primary, firstFallback]);
  });
});

describe("model-chain-failure-detector 分类驱动链式回退", () => {
  it("5xx 视为可重试的 API 错误，因此会先重试同一模型", async () => {
    expect(detectFailure(retryableError())).toMatchObject({
      isFailure: true,
      retryable: true,
      type: ModelChainFailureType.ApiError,
    });
    const executor = vi.fn(async () => {
      throw retryableError();
    });
    await executeWithModelChain(chain({ fallbacks: [], retryCount: 1 }), executor, async () => {});
    // 首次 + 1 次重试 = 2 次；预算用尽后不再重试。
    expect(executor).toHaveBeenCalledTimes(2);
  });

  it("400 视为不可重试的内容审核失败，因此不重试", async () => {
    expect(detectFailure(nonRetryableError())).toMatchObject({
      isFailure: true,
      retryable: false,
      type: ModelChainFailureType.ContentFilter,
    });
    const executor = vi.fn(async () => {
      throw nonRetryableError();
    });
    await executeWithModelChain(chain({ fallbacks: [], retryCount: 3 }), executor, async () => {});
    expect(executor).toHaveBeenCalledTimes(1);
  });
});

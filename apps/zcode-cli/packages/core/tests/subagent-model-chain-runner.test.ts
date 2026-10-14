import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createSessionId,
  createToolCallId,
  createTraceId,
  createTurnId,
  type SubagentRunOptions,
} from "@zcode/contracts";
import type { ModelSelection, SubagentModelChain } from "@zcode/shared";
import { createExploreSubagentPort } from "../src/subagent/runner.js";
import type { ExploreSubagentRuntimeRequest } from "../src/subagent/runner.js";
import type { AgentProfile } from "../src/subagent/profile.js";

const primary: ModelSelection = { providerId: "zai", modelId: "glm-4.6" };
const fallback: ModelSelection = { providerId: "openai", modelId: "gpt-5" };

const chain: SubagentModelChain = { primary, fallbacks: [fallback], retryCount: 0 };

function profileWithChain(modelChain: SubagentModelChain | undefined): AgentProfile {
  return {
    name: "reviewer",
    source: "user",
    description: "Review",
    tools: ["Read"],
    systemPrompt: "PROFILE",
    ...(modelChain ? { modelChain } : {}),
    modelSelection: { providerId: "custom", modelId: "single" },
  };
}

/** 运行一次前台子智能体，记录每次执行看到的 profile 与 modelOverride。 */
async function runWithChain(
  modelChain: SubagentModelChain | undefined,
  runExploreAgent: (
    request: ExploreSubagentRuntimeRequest,
    options?: SubagentRunOptions,
  ) => Promise<{ events: never[]; response: string; traceId: string }>,
) {
  const outputRootDir = await mkdtemp(join(tmpdir(), "zcode-model-chain-"));
  const sessionId = createSessionId("model-chain-parent");
  const turnId = createTurnId("model-chain-turn");
  const port = createExploreSubagentPort({
    outputRootDir,
    createAgentId: () => "model-chain-agent",
    profiles: [profileWithChain(modelChain)],
    emitParentEvent: async () => undefined,
    runExploreAgent: runExploreAgent as never,
  });
  try {
    const result = await port.run({
      agentType: "reviewer",
      description: "chain",
      prompt: "PROMPT",
      parentToolCallId: createToolCallId("model-chain-call"),
      sessionId,
      turnId,
      trace: { traceId: createTraceId(), sessionId, turnId },
      workingDirectory: outputRootDir,
      workspaceRoot: outputRootDir,
    });
    return result;
  } finally {
    await rm(outputRootDir, { recursive: true, force: true });
  }
}

describe("runner 接入模型链", () => {
  it("按 primary → fallback 顺序执行，并把选型作为 modelOverride 下发", async () => {
    const observed: { model?: ModelSelection; hasChain: boolean }[] = [];
    await runWithChain(chain, async (request, options) => {
      observed.push({
        model: options?.modelOverride?.selection,
        hasChain: request.profile.modelChain !== undefined,
      });
      if (options?.modelOverride?.selection === primary) {
        throw Object.assign(new Error("primary down"), { statusCode: 503 });
      }
      return { events: [], response: "ok", traceId: "t" };
    });

    expect(observed.map((entry) => entry.model)).toEqual([primary, fallback]);
  });

  it("链上模型全部失败时回退到主 Agent：剥离 profile 模型意图以继承父模型", async () => {
    const observed: { hasChain: boolean; hasSelection: boolean; model?: ModelSelection }[] = [];
    await runWithChain(chain, async (request, options) => {
      observed.push({
        hasChain: request.profile.modelChain !== undefined,
        hasSelection: request.profile.modelSelection !== undefined,
        model: options?.modelOverride?.selection,
      });
      if (options?.modelOverride) {
        throw Object.assign(new Error("chain down"), { statusCode: 503 });
      }
      return { events: [], response: "main", traceId: "t" };
    });

    expect(observed).toHaveLength(3);
    // 主 Agent 兜底不再带 modelOverride，且 profile 的模型链/单模型都被剥离。
    expect(observed[2]).toEqual({ hasChain: false, hasSelection: false, model: undefined });
  });

  it("没有模型链时保持原单模型执行路径（只调用一次，不带 modelOverride）", async () => {
    const observed: { hasChain: boolean; model?: ModelSelection }[] = [];
    await runWithChain(undefined, async (request, options) => {
      observed.push({ hasChain: request.profile.modelChain !== undefined, model: options?.modelOverride?.selection });
      return { events: [], response: "ok", traceId: "t" };
    });

    expect(observed).toEqual([{ hasChain: false, model: undefined }]);
  });

  it("链上模型全部失败且兜底也失败时向父 Agent 抛错", async () => {
    await expect(
      runWithChain(chain, async () => {
        throw Object.assign(new Error("everything down"), { statusCode: 503 });
      }),
    ).rejects.toThrow(/everything down/u);
  });
});

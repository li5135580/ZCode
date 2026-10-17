import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchProviderModels } from "../src/model-provider/model-fetcher-service.js";

const bundledBuiltinConfigFilePath = fileURLToPath(
  new URL("../../../config/provider/zcode-builtin.json", import.meta.url),
);

const tempDirs: string[] = [];

/** 建一个临时目录存放测试用的内置配置，避免依赖宿主环境变量。 */
function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

/** 写一份结构合法但内容最小的内置配置，用于覆盖解析分支。 */
function writeBuiltinConfig(providerConfigRules: unknown): string {
  const dir = makeTempDir("zcode-model-fetcher-");
  const filePath = join(dir, "zcode-builtin.json");
  writeFileSync(
    filePath,
    JSON.stringify({
      schemaVersion: 1,
      revision: 1,
      config: { providerConfigRules, modelConfigRules: {} },
    }),
  );
  return filePath;
}

afterEach(() => {
  vi.restoreAllMocks();
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("fetchProviderModels 内置配置匹配", () => {
  it("按 Base URL 读取内置 templateRules 的模型列表", async () => {
    const result = await fetchProviderModels(
      {
        apiKind: "anthropic-messages",
        baseUrl: "https://api.z.ai/api/anthropic",
        builtinConfigFilePath: bundledBuiltinConfigFilePath,
      },
      "k",
    );

    expect(result.success).toBe(true);
    expect(result.models.map((model) => model.modelId)).toEqual(["GLM-5.3", "GLM-5.3-Flash"]);
    expect(result.models.every((model) => model.source === "builtin")).toBe(true);
  });

  it("Base URL 末尾斜杠不影响匹配", async () => {
    const result = await fetchProviderModels(
      { baseUrl: "https://api.moonshot.cn/anthropic/", builtinConfigFilePath: bundledBuiltinConfigFilePath },
      "k",
    );

    expect(result.success).toBe(true);
    expect(result.models.map((model) => model.modelId)).toEqual([
      "kimi-k3",
      "kimi-k2.7-code",
      "kimi-k2.6",
      "kimi-k2.7-code-highspeed",
      "k3",
      "k3-256k",
    ]);
  });

  it("apiKind 缺失时同样按 Base URL 匹配", async () => {
    const result = await fetchProviderModels(
      { baseUrl: "https://api.deepseek.com/anthropic", builtinConfigFilePath: bundledBuiltinConfigFilePath },
      "k",
    );

    expect(result.success).toBe(true);
    expect(result.models.length).toBeGreaterThan(0);
  });

  it("同一 Base URL 下的不同 API 形态不会互相串味", async () => {
    const result = await fetchProviderModels(
      {
        apiKind: "anthropic-messages",
        baseUrl: "https://opencode.ai/zen/v1",
        builtinConfigFilePath: bundledBuiltinConfigFilePath,
      },
      "k",
    );

    // zen/v1 同时声明了 anthropic-messages 与 openai-* 形态，只应返回 anthropic 那一份。
    expect(result.success).toBe(true);
    expect(result.models.map((model) => model.modelId)).not.toContain("gpt-5");
  });

  it("内置配置也覆盖 providerRules 里的 Account Provider 模型", async () => {
    const result = await fetchProviderModels(
      {
        apiKind: "anthropic-messages",
        baseUrl: "https://zcode.z.ai/api/v1/zcode-plan/anthropic",
        builtinConfigFilePath: bundledBuiltinConfigFilePath,
      },
      "k",
    );

    expect(result.success).toBe(true);
    expect(result.models.map((model) => model.modelId)).toEqual([
      "GLM-5.3-Flash",
      "GLM-5.2",
      "GLM-5-Turbo",
    ]);
  });

  it("同一模型 ID 在多条规则中重复出现时只返回一次", async () => {
    const filePath = writeBuiltinConfig({
      templateRules: [
        { templateId: "a", config: { api: { type: "anthropic-messages", baseUrl: "https://dup.example.com" }, builtinModelIds: ["m1", "m2"] } },
        { templateId: "b", config: { api: { type: "anthropic-messages", baseUrl: "https://dup.example.com" }, builtinModelIds: ["m2", "m3"] } },
      ],
      providerRules: [],
    });

    const result = await fetchProviderModels(
      { baseUrl: "https://dup.example.com", builtinConfigFilePath: filePath },
      "k",
    );

    expect(result.models.map((model) => model.modelId)).toEqual(["m1", "m2", "m3"]);
  });
});

describe("fetchProviderModels 内置配置不可用时的失败语义", () => {
  it("未提供 Base URL 时返回失败并说明原因", async () => {
    const result = await fetchProviderModels({ builtinConfigFilePath: bundledBuiltinConfigFilePath }, "k");

    expect(result.success).toBe(false);
    expect(result.models).toEqual([]);
    expect(result.error).toContain("Base URL");
  });

  it("Base URL 未命中任何内置规则时返回失败，而不是空列表伪成功", async () => {
    const result = await fetchProviderModels(
      { baseUrl: "https://unknown.example.com", builtinConfigFilePath: bundledBuiltinConfigFilePath },
      "k",
    );

    expect(result.success).toBe(false);
    expect(result.models).toEqual([]);
    expect(result.error).toBeTruthy();
  });

  it("配置文件路径不存在时返回失败并带上路径", async () => {
    const missing = join(makeTempDir("zcode-model-fetcher-missing-"), "absent.json");

    const result = await fetchProviderModels(
      { baseUrl: "https://api.z.ai/api/anthropic", builtinConfigFilePath: missing },
      "k",
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain(missing);
  });

  it("配置文件内容不是合法 JSON 时返回失败", async () => {
    const dir = makeTempDir("zcode-model-fetcher-badjson-");
    const filePath = join(dir, "zcode-builtin.json");
    writeFileSync(filePath, "{ not json");

    const result = await fetchProviderModels(
      { baseUrl: "https://api.z.ai/api/anthropic", builtinConfigFilePath: filePath },
      "k",
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain(filePath);
  });
});

describe("fetchProviderModels 内置 Claude 列表兜底", () => {
  it("内置配置不可用时 anthropic 形态回退到内置 Claude 列表", async () => {
    const result = await fetchProviderModels(
      { apiKind: "anthropic-messages", baseUrl: "https://unknown.example.com" },
      "k",
    );

    expect(result.success).toBe(true);
    expect(result.models.map((model) => model.modelId)).toContain("claude-4-opus");
    expect(result.models.every((model) => model.source === "builtin")).toBe(true);
  });
});

describe("fetchProviderModels [OI] 兼容接口", () => {
  it("从 /models 端点读取模型列表并标记为 api 来源", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ data: [{ id: "glm-5" }, { id: "glm-4.6" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const result = await fetchProviderModels(
      { apiKind: "openai-chat-completions", baseUrl: "https://api.z.ai/api/paas/v4" },
      "secret",
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.z.ai/api/paas/v4/models",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer secret" }) }),
    );
    expect(result.success).toBe(true);
    expect(result.models.map((model) => model.modelId)).toEqual(["glm-5", "glm-4.6"]);
    expect(result.models.every((model) => model.source === "api")).toBe(true);
  });

  it("HTTP 非 2xx 时返回失败并带上状态码", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("nope", { status: 401, statusText: "Unauthorized" }),
    );

    const result = await fetchProviderModels(
      { apiKind: "openai-responses", baseUrl: "https://api.openai.com/v1" },
      "bad",
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("401");
  });

  it("响应缺少 data 数组时返回失败", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ models: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await fetchProviderModels(
      { apiKind: "openai-chat-completions", baseUrl: "https://api.z.ai/api/paas/v4" },
      "k",
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("data");
  });
});

describe("fetchProviderModels 解析 /models 能力元数据", () => {
  function mockModelsResponse(data: unknown) {
    return vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }

  it("解析 OpenRouter 风格元数据：上下文、输出上限与输入模态", async () => {
    mockModelsResponse([
      {
        id: "vendor/some-model",
        context_length: 1_000_000,
        top_provider: { context_length: 999, max_completion_tokens: 64_000 },
        architecture: { input_modalities: ["text", "image", "file"] },
      },
    ]);

    const result = await fetchProviderModels(
      { apiKind: "openai-chat-completions", baseUrl: "https://openrouter.ai/api/v1" },
      "k",
    );

    expect(result.success).toBe(true);
    expect(result.models[0]).toMatchObject({
      modelId: "vendor/some-model",
      contextWindow: 1_000_000,
      maxOutputTokens: 64_000,
      inputFormat: {
        supportsText: true,
        supportsImage: true,
        supportsVideo: false,
        supportsAudio: false,
        supportsPdf: true,
      },
    });
  });

  it("顶层字段优先于 top_provider 回退值", async () => {
    mockModelsResponse([
      {
        id: "m",
        context_length: 200_000,
        top_provider: { context_length: 8_000 },
      },
    ]);

    const result = await fetchProviderModels(
      { apiKind: "openai-responses", baseUrl: "https://example.test/v1" },
      "k",
    );

    expect(result.models[0].contextWindow).toBe(200_000);
  });

  it("元数据类型非法时忽略该字段，不写入错误覆盖", async () => {
    mockModelsResponse([
      {
        id: "m",
        context_length: "1000000",
        max_completion_tokens: -5,
        architecture: { input_modalities: "text" },
      },
    ]);

    const result = await fetchProviderModels(
      { apiKind: "openai-chat-completions", baseUrl: "https://example.test/v1" },
      "k",
    );

    expect(result.success).toBe(true);
    expect(result.models[0].contextWindow).toBeUndefined();
    expect(result.models[0].maxOutputTokens).toBeUndefined();
    expect(result.models[0].inputFormat).toBeUndefined();
  });

  it("只有 id 的端点（如 Z.AI）行为保持不变", async () => {
    mockModelsResponse([{ id: "glm-5" }]);

    const result = await fetchProviderModels(
      { apiKind: "openai-chat-completions", baseUrl: "https://api.z.ai/api/paas/v4" },
      "k",
    );

    expect(result.models[0]).toEqual({ modelId: "glm-5", source: "api" });
  });
});

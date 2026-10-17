import { describe, expect, it } from "vitest";
import { collectBuildMetadata, resolveAppVersion } from "../scripts/build-metadata.mjs";

describe("build-metadata appVersion", () => {
  it("沿用根 package.json 的版本（与上游对齐）", () => {
    expect(resolveAppVersion("3.15.1", {})).toBe("3.15.1");
  });

  it("ZCODE_APP_VERSION 覆盖 package.json 版本", () => {
    expect(resolveAppVersion("3.15.1", { ZCODE_APP_VERSION: "3.15.2-fork.2" })).toBe(
      "3.15.2-fork.2",
    );
  });

  it("覆盖值为空白时回退到 package.json 版本", () => {
    expect(resolveAppVersion("3.15.1", { ZCODE_APP_VERSION: "" })).toBe("3.15.1");
    expect(resolveAppVersion("3.15.1", { ZCODE_APP_VERSION: "   " })).toBe("3.15.1");
  });

  it("覆盖值不是合法 semver 时直接抛错，不静默回退", () => {
    expect(() => resolveAppVersion("3.15.1", { ZCODE_APP_VERSION: "3.15" })).toThrow(
      /ZCODE_APP_VERSION/,
    );
    expect(() => resolveAppVersion("3.15.1", { ZCODE_APP_VERSION: "v3.15.2-fork.2" })).toThrow(
      /ZCODE_APP_VERSION/,
    );
    expect(() => resolveAppVersion("3.15.1", { ZCODE_APP_VERSION: "latest" })).toThrow(
      /ZCODE_APP_VERSION/,
    );
  });

  it("保留 normalizeVersion 对 package.json 版本的前缀清理行为", () => {
    expect(resolveAppVersion("v3.15.1", {})).toBe("3.15.1");
  });

  it("collectBuildMetadata 读取环境变量覆盖", () => {
    const previous = process.env.ZCODE_APP_VERSION;
    process.env.ZCODE_APP_VERSION = "3.15.2-fork.9";
    try {
      expect(collectBuildMetadata().appVersion).toBe("3.15.2-fork.9");
    } finally {
      if (previous === undefined) {
        delete process.env.ZCODE_APP_VERSION;
      } else {
        process.env.ZCODE_APP_VERSION = previous;
      }
    }
  });
});

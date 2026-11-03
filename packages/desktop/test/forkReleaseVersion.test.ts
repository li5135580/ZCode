import semver from "semver";
import { describe, expect, it } from "vitest";
import { resolveForkAppVersion } from "../../../scripts/ci/fork-release-version.mjs";

describe("CI fork 版本推导", () => {
  it("tag 的 base 版本 patch + 1，fork 序号原样保留", () => {
    expect(resolveForkAppVersion({ tag: "v3.17.2-fork.1" })).toBe("3.17.3-fork.1");
    expect(resolveForkAppVersion({ tag: "v3.15.1-fork.2" })).toBe("3.15.2-fork.2");
  });

  it("不带 fork 序号的 tag 仍然 patch + 1，保证大于上游", () => {
    expect(resolveForkAppVersion({ tag: "v3.15.1" })).toBe("3.15.2");
  });

  it("非 tag 触发返回空字符串（沿用 package.json 版本）", () => {
    expect(resolveForkAppVersion({ tag: "" })).toBe("");
    expect(resolveForkAppVersion({ tag: null })).toBe("");
    expect(resolveForkAppVersion({})).toBe("");
  });

  it("非法 tag 直接抛错", () => {
    expect(() => resolveForkAppVersion({ tag: "3.15.1" })).toThrow(/invalid release tag/);
    expect(() => resolveForkAppVersion({ tag: "v3.15.1-fork.0" })).toThrow(/fork sequence/);
    expect(() => resolveForkAppVersion({ tag: "v3.15-fork.2" })).toThrow(/invalid release tag/);
  });

  it("推导结果严格大于上游版本，且同基底递增 fork 序号构成升级链", () => {
    // electron-updater 用 semver.gt 判断更新；这是整个方案的核心不变量。
    expect(semver.gt(resolveForkAppVersion({ tag: "v3.17.2-fork.1" }), "3.17.2")).toBe(true);

    // 已安装 3.17.3-fork.1 的用户：递增 fork 序号、或上游推进一版，都应判为更新。
    const installed = resolveForkAppVersion({ tag: "v3.17.2-fork.1" });
    expect(semver.gt(resolveForkAppVersion({ tag: "v3.17.2-fork.2" }), installed)).toBe(true);
    expect(semver.gt(resolveForkAppVersion({ tag: "v3.17.3-fork.1" }), installed)).toBe(true);
    // 反例：同一 base 的低序号不会被误判为新版本。
    expect(semver.gt("3.17.3-fork.0", installed)).toBe(false);

    // 迁移兼容：上一版产物是旧规则（上游版本 + fork 序号）时代的 3.17.2-fork.21，
    // patch + 1 后的 3.17.3-fork.1 必须大于它，已装旧版的用户才能收到这次更新。
    expect(semver.gt(installed, "3.17.2-fork.21")).toBe(true);
  });
});

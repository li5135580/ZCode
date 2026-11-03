import semver from "semver";
import { describe, expect, it } from "vitest";
import { resolveForkAppVersion } from "../../../scripts/ci/fork-release-version.mjs";

describe("CI fork 版本推导", () => {
  it("tag 的版本号就是上游对齐版本，fork 序号原样保留", () => {
    expect(resolveForkAppVersion({ tag: "v3.17.2-fork.22" })).toBe("3.17.2-fork.22");
    expect(resolveForkAppVersion({ tag: "v3.15.1-fork.2" })).toBe("3.15.1-fork.2");
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

  it("升级链单调递增，且能覆盖上一轮 patch+1 时代的版本", () => {
    // 同基底递增 fork 序号：3.17.2-fork.22 > 3.17.2-fork.21。
    const installed = resolveForkAppVersion({ tag: "v3.17.2-fork.21" });
    expect(semver.gt(resolveForkAppVersion({ tag: "v3.17.2-fork.22" }), installed)).toBe(true);
    // 反例：同一 base 的低序号不会被误判为新版本。
    expect(semver.gt(resolveForkAppVersion({ tag: "v3.17.2-fork.1" }), installed)).toBe(false);

    // 迁移兼容：上一版产物是 patch+1 时代的 3.17.2-fork.21（由 tag v3.17.1-fork.21 推出的历史版本），
    // 新方案的同基底 3.17.2-fork.22 仍然大于它，老用户能正常收到这次更新。
    expect(semver.gt("3.17.2-fork.22", "3.17.2-fork.21")).toBe(true);

    // 上游推进后，新基底天然大于旧版。
    expect(semver.gt(resolveForkAppVersion({ tag: "v3.17.3-fork.1" }), installed)).toBe(true);
  });
});

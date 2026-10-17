import semver from "semver";
import { describe, expect, it } from "vitest";
import { resolveForkAppVersion } from "../../../scripts/ci/fork-release-version.mjs";

describe("CI fork 版本推导", () => {
  it("tag v3.15.1-fork.2 → 3.15.2-fork.2", () => {
    expect(resolveForkAppVersion({ tag: "v3.15.1-fork.2" })).toBe("3.15.2-fork.2");
  });

  it("不带 fork 序号的 tag 同样 patch + 1", () => {
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

  it("推导结果严格大于上游版本，且后续 tag 单调递增", () => {
    // electron-updater 用 semver.gt 判断更新；这是整个方案的核心不变量。
    expect(semver.gt(resolveForkAppVersion({ tag: "v3.15.1-fork.2" }), "3.15.1")).toBe(true);
    // 已安装 3.15.2-fork.2 的用户：下一个 patch 或下一个 fork 序号都能被判为更新。
    const installed = resolveForkAppVersion({ tag: "v3.15.1-fork.2" });
    expect(semver.gt(resolveForkAppVersion({ tag: "v3.15.2-fork.1" }), installed)).toBe(true);
    expect(semver.gt(resolveForkAppVersion({ tag: "v3.15.1-fork.3" }), installed)).toBe(true);
    // 反例：同一 base 的低序号不会被误判为新版本。
    expect(semver.gt(resolveForkAppVersion({ tag: "v3.15.1-fork.1" }), installed)).toBe(false);
  });
});

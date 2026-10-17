import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
  rewriteLatestYml,
  toGitHubAssetName,
  verifyLatestYmlArtifacts,
} from "../../../scripts/ci/normalize-latest-yml.mjs";

const SAMPLE = `version: 3.15.2-fork.2
files:
  - url: ZCode Preview-3.15.2-fork.2-win-x64.exe
    sha512: abc123
    size: 100
path: ZCode Preview-3.15.2-fork.2-win-x64.exe
sha512: abc123
releaseDate: '2026-10-17T00:00:00.000Z'
`;

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("latest.yml 资产名归一化", () => {
  it("空格替换为点号，与 GitHub Release 资产名一致", () => {
    expect(toGitHubAssetName("ZCode Preview-3.15.2-fork.2-win-x64.exe")).toBe(
      "ZCode.Preview-3.15.2-fork.2-win-x64.exe",
    );
  });

  it("改写 files[].url 与 path，保留版本号与校验和", () => {
    const { content, renamed } = rewriteLatestYml(SAMPLE);
    const parsed = parse(content);

    expect(parsed.version).toBe("3.15.2-fork.2");
    expect(parsed.files[0].url).toBe("ZCode.Preview-3.15.2-fork.2-win-x64.exe");
    expect(parsed.files[0].sha512).toBe("abc123");
    expect(parsed.path).toBe("ZCode.Preview-3.15.2-fork.2-win-x64.exe");
    expect(renamed).toEqual([
      {
        from: "ZCode Preview-3.15.2-fork.2-win-x64.exe",
        to: "ZCode.Preview-3.15.2-fork.2-win-x64.exe",
      },
    ]);
  });

  it("缺少 version 或 files 时直接抛错", () => {
    expect(() => rewriteLatestYml("files:\n  - url: a.exe\n")).toThrow(/version/);
    expect(() => rewriteLatestYml("version: 1.0.0\n")).toThrow(/files/);
  });

  it("缺少 sha512 时直接抛错（electron-updater 会拒绝无校验的包）", () => {
    expect(() => rewriteLatestYml("version: 1.0.0\nfiles:\n  - url: a.exe\n")).toThrow(/sha512/);
  });

  it("校验产物存在性时按 GitHub 资产名比对", () => {
    const dir = mkdtempSync(join(tmpdir(), "zcode-latest-yml-"));
    tempDirs.push(dir);
    // 磁盘文件名仍带空格，latest.yml 里已是点号形式。
    writeFileSync(join(dir, "ZCode Preview-3.15.2-fork.2-win-x64.exe"), "x");
    const { content } = rewriteLatestYml(SAMPLE);

    expect(verifyLatestYmlArtifacts(dir, content)).toEqual([]);
    rmSync(join(dir, "ZCode Preview-3.15.2-fork.2-win-x64.exe"));
    expect(verifyLatestYmlArtifacts(dir, content)).toEqual([
      "ZCode.Preview-3.15.2-fork.2-win-x64.exe",
    ]);
  });
});

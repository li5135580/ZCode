import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";
import { build } from "esbuild";
import { REMOTE_SERVER_NATIVE_EXTERNALS } from "../../server/buildRemoteValidation.js";
import {
  keyringPlatformPackage,
  stageCredentialKeyring,
} from "../../../scripts/stage-credential-keyring.mjs";

test("remote CJS build preserves the native keyring dependency without bundling platform binaries", async () => {
  const result = await build({
    stdin: {
      contents: 'export const open = () => import("@napi-rs/keyring");',
      resolveDir: join(import.meta.dirname, ".."),
    },
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    metafile: true,
    external: REMOTE_SERVER_NATIVE_EXTERNALS,
  });
  assert.match(result.outputFiles[0]!.text, /@napi-rs\/keyring/);
  assert.equal(
    Object.keys(result.metafile!.inputs).some((name) => name.endsWith(".node")),
    false,
  );
});

test("keyring platform selection covers supported desktop architectures", () => {
  for (const arch of ["x64", "arm64"]) {
    assert.equal(keyringPlatformPackage(`darwin-${arch}`), `@napi-rs/keyring-darwin-${arch}`);
    assert.equal(keyringPlatformPackage(`win32-${arch}`), `@napi-rs/keyring-win32-${arch}-msvc`);
    assert.equal(keyringPlatformPackage(`linux-${arch}`), `@napi-rs/keyring-linux-${arch}-gnu`);
  }
  assert.throws(() => keyringPlatformPackage("unknown-x64"));
});
test("stages wrapper and target binary with licenses, omitting other platform binaries", async () => {
  const dir = await mkdtemp(join(tmpdir(), "keyring-assets-"));
  try {
    const packageName = keyringPlatformPackage("linux-arm64");
    for (const name of ["@napi-rs/keyring", packageName, "@napi-rs/keyring-win32-x64-msvc"]) {
      const root = join(dir, "source", "node_modules", name);
      await mkdir(root, { recursive: true });
      await writeFile(
        join(root, "package.json"),
        JSON.stringify({
          name,
          main: name === packageName ? "keyring.linux-arm64-gnu.node" : "index.js",
        }),
      );
      await writeFile(join(root, "index.js"), "module.exports = {}");
      await writeFile(join(root, "LICENSE"), "fixture-license");
    }
    await writeFile(
      join(dir, "source/node_modules", packageName, "keyring.linux-arm64-gnu.node"),
      "fixture-native",
    );
    await stageCredentialKeyring({
      sourceRoot: join(dir, "source"),
      targetRoot: join(dir, "output"),
      platformKey: "linux-arm64",
    });
    assert.equal(
      await readFile(join(dir, "output/node_modules", packageName, "LICENSE"), "utf8"),
      "fixture-license",
    );
    await assert.rejects(
      readFile(join(dir, "output/node_modules/@napi-rs/keyring-win32-x64-msvc/package.json")),
      { code: "ENOENT" },
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// 事故回归（2026-11，3.18.3-fork.1）：安装包缺 keyring 原生二进制，用户升级后登录态丢失
// 且无法重新登录（System credential storage is unavailable）。这里锁住两条不变量：
// 1) 目标平台 .node 的文件名必须与 @napi-rs/keyring/index.js 的 require 路径一致；
// 2) asarUnpack 必须覆盖 keyring 本体目录下的 .node，否则文件留在 asar 内无法加载。
test("keyring 原生文件名与 index.js 的加载路径一致，且 asarUnpack 覆盖本体目录", async () => {
  const { resolveKeyringNativeFileName } = await import(
    "../../../scripts/prepare-credential-keyring.mjs"
  );
  const { minimatch } = await import("minimatch");

  const indexSource = await readFile(
    join(import.meta.dirname, "..", "..", "..", "node_modules", "@napi-rs", "keyring", "index.js"),
    "utf8",
  );

  for (const platformKey of ["win32-x64", "darwin-arm64", "linux-x64"]) {
    const nativeFileName = resolveKeyringNativeFileName(platformKey);
    assert.ok(
      indexSource.includes(nativeFileName),
      `${platformKey}: index.js 没有引用 ${nativeFileName}，加载路径会落空`,
    );
  }

  // 与 electron-builder.config.js 的 asarUnpack 保持一致；新增规则时这里必须同步。
  const asarUnpackPatterns = [
    "node_modules/@napi-rs/keyring-*/**/*.node",
    "node_modules/@napi-rs/keyring/keyring.*.node",
  ];
  const bodyNativePath = "node_modules/@napi-rs/keyring/keyring.win32-x64-msvc.node";
  assert.ok(
    asarUnpackPatterns.some((pattern) => minimatch(bodyNativePath, pattern)),
    "asarUnpack 未覆盖 keyring 本体目录下的 .node，二进制会留在 asar 内导致加载失败",
  );
});

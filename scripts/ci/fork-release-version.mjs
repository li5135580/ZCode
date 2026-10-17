#!/usr/bin/env node
// 二开发布版本推导：把上游对齐的 tag 改写成严格大于上游版本的 fork 版本。
//
// 背景：根 package.json 的 version 必须与上游对齐（如 3.15.1），而 electron-updater
// 用 semver.gt 判断更新；`3.15.1-fork.2` 在 semver 里小于 `3.15.1`，永远收不到更新。
// 因此构建期把 patch + 1 再带上 fork 序号：`v3.15.1-fork.2` → `3.15.2-fork.2`。
//
// 用法（CI）：
//   node scripts/ci/fork-release-version.mjs --tag v3.15.1-fork.2
// 输出：3.15.2-fork.2
//
// 非 tag 触发时输出空字符串（调用方沿用 package.json 版本），理由见 resolveForkAppVersion。

import { fileURLToPath } from "node:url";
import { isValidSemver } from "../../packages/desktop/scripts/build-metadata.mjs";

/** `v3.15.1` 或 `v3.15.1-fork.2`；fork 序号必须是正整数。 */
const FORK_TAG_PATTERN = /^v(\d+)\.(\d+)\.(\d+)(?:-fork\.(\d+))?$/;

/**
 * 从 tag 推导 fork 版本号。
 *
 * 规则：
 * - `v3.15.1-fork.2` → `3.15.2-fork.2`（base 的 patch + 1，保留 fork 序号）
 * - `v3.15.1`        → `3.15.2`（无 fork 序号时同样 patch + 1，保证大于上游）
 * - 无 tag            → 返回空字符串
 *
 * 无 tag 时选择「不注入」而不是按 commit/run number 生成版本：本仓库的 release job
 * 只在 tag 触发时发布（`if: startsWith(github.ref, 'refs/tags/v')`），main 分支构建
 * 不会进入 Release；若按 run number 生成 `3.15.2-fork.<run>`，会随时间跑到真实 fork
 * tag 的序号前面，反而让后续正式 tag 看起来「版本更低」。保持 package.json 版本更安全。
 *
 * @param {{ tag?: string | null }} options
 * @returns {string} 合法 semver，或空字符串（无 tag）
 */
export function resolveForkAppVersion({ tag } = {}) {
  const normalizedTag = typeof tag === "string" ? tag.trim() : "";
  if (normalizedTag === "") {
    return "";
  }

  const match = FORK_TAG_PATTERN.exec(normalizedTag);
  if (!match) {
    throw new Error(
      `invalid release tag ${JSON.stringify(normalizedTag)}; expected v<major>.<minor>.<patch>[-fork.<n>]`,
    );
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  const forkSequence = match[4];

  if (forkSequence !== undefined && Number(forkSequence) <= 0) {
    throw new Error(`invalid fork sequence in tag ${JSON.stringify(normalizedTag)}; expected > 0`);
  }

  // patch + 1：保证 semver.gt(derived, 上游 base) 恒成立。
  const derived = `${major}.${minor}.${patch + 1}${
    forkSequence === undefined ? "" : `-fork.${Number(forkSequence)}`
  }`;

  if (!isValidSemver(derived)) {
    throw new Error(`derived version is not valid semver: ${derived}`);
  }
  return derived;
}

function readArg(argv, name) {
  const prefix = `${name}=`;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === name) {
      return argv[index + 1] ?? "";
    }
    if (arg.startsWith(prefix)) {
      return arg.slice(prefix.length);
    }
  }
  return undefined;
}

const entryFilePath = process.argv[1] ? resolvePathForCompare(process.argv[1]) : "";
const currentFilePath = resolvePathForCompare(fileURLToPath(import.meta.url));

function resolvePathForCompare(filePath) {
  return filePath.replace(/\\/g, "/");
}

if (entryFilePath === currentFilePath) {
  try {
    const version = resolveForkAppVersion({ tag: readArg(process.argv.slice(2), "--tag") });
    process.stdout.write(version);
  } catch (error) {
    process.stderr.write(`[fork-version] ${error instanceof Error ? error.message : error}\n`);
    process.exit(1);
  }
}

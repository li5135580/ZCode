#!/usr/bin/env node
// 二开发布版本推导：tag 里的版本号就是上游对齐版本，fork 序号原样保留。
//
// 背景：根 package.json 的 version 与上游对齐（如 3.17.2），二开发布时需要让人一眼看出
// 「这一版基于哪个上游版本」。早期做法是把 patch + 1（`v3.15.1-fork.2` → `3.15.2-fork.2`），
// 代价是版本号与上游对不上，排查问题时还得心算一次。现在改为直接用上游版本号作基底：
// `v3.17.2-fork.22` → `3.17.2-fork.22`。
//
// 升级链依然连续：semver 里 `3.17.2-fork.22 > 3.17.2-fork.21`，同基底递增 fork 序号即可；
// 上游下一版 `3.17.3-fork.N` 天然大于本版。
//
// 不带 fork 序号的 tag（如 `v3.17.2`）仍沿用 patch + 1，保证结果严格大于上游版本。
//
// 用法（CI）：
//   node scripts/ci/fork-release-version.mjs --tag v3.17.2-fork.22
// 输出：3.17.2-fork.22
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
 * - `v3.17.2-fork.22` → `3.17.2-fork.22`（tag 的版本号就是上游对齐版本，fork 序号原样保留）
 * - `v3.17.2`          → `3.17.3`（无 fork 序号时 patch + 1，保证大于上游）
 * - 无 tag             → 返回空字符串
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

  // 带 fork 序号：版本号就是上游对齐版本，只补 fork 序号，便于一眼看出基于哪个上游版本；
  // 同基底递增序号即可构成升级链（3.17.2-fork.22 > 3.17.2-fork.21）。
  // 不带 fork 序号：patch + 1，保证 semver.gt(derived, 上游 base) 成立。
  const baseVersion =
    forkSequence === undefined ? `${major}.${minor}.${patch + 1}` : `${major}.${minor}.${patch}`;
  const derived = `${baseVersion}${
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

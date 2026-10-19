#!/usr/bin/env node
// 修正 electron-builder 生成的更新清单中的下载文件名。
//
// 背景：artifactName 早期带 ${productName}（`ZCode Preview`，含空格），electron-builder 把
// 磁盘文件名原样写进清单的 files[].url；而 GitHub Release 上传资产时会把空格替换成点号，
// 客户端按清单的 url 拼 `releases/latest/download/<url>` 就对不上。
//
// 现在 artifactName 已改用不含空格的 `ZCode-Preview-*`，正常情况下这里不再需要改名。
// 保留该步骤作为兜底：任何重新引入空格（或其它 GitHub 会改写的字符）的命名变化，
// 都会在上传前被修正，而不是等到用户下载 404 才发现。
//
// 同时它负责校验清单指向的产物确实存在，这是清单本身无法自证的部分。

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, stringify } from "yaml";

/** GitHub Release 资产名规则：空格 → 点号（其余字符保持）。 */
export function toGitHubAssetName(fileName) {
  return fileName.replace(/ /g, ".");
}

/**
 * 改写 latest.yml 文本里的下载地址，并可选注入本次更新说明。
 *
 * @param {string} content latest.yml 原始内容
 * @param {{ releaseNotes?: string | null }} [options]
 *   releaseNotes：更新说明 markdown。electron-builder 生成的清单不带该字段，
 *   客户端「发现新版本」弹窗因此没有内容可展示；在这里统一注入。
 * @returns {{ content: string, renamed: Array<{ from: string, to: string }> }}
 */
export function rewriteLatestYml(content, options = {}) {
  const parsed = parse(content);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("latest.yml 不是合法的 YAML 对象");
  }
  if (typeof parsed.version !== "string" || parsed.version.trim() === "") {
    throw new Error("latest.yml 缺少 version 字段");
  }

  const renamed = [];
  const seen = new Set();
  const renameUrl = (value) => {
    if (typeof value !== "string" || value === "") {
      return value;
    }
    const next = toGitHubAssetName(value);
    if (next !== value && !seen.has(value)) {
      seen.add(value);
      renamed.push({ from: value, to: next });
    }
    return next;
  };

  const files = Array.isArray(parsed.files) ? parsed.files : [];
  if (files.length === 0) {
    throw new Error("latest.yml 缺少 files 列表");
  }
  for (const file of files) {
    if (!file || typeof file !== "object") {
      continue;
    }
    if (typeof file.url !== "string" || file.url === "") {
      throw new Error("latest.yml 的 files[].url 为空");
    }
    if (typeof file.sha512 !== "string" || file.sha512 === "") {
      throw new Error(`latest.yml 的 files[].sha512 为空: ${file.url}`);
    }
    file.url = renameUrl(file.url);
  }
  // electron-updater 1.x 兼容字段，与 files[0].url 保持一致。
  if (typeof parsed.path === "string" && parsed.path !== "") {
    parsed.path = renameUrl(parsed.path);
  }

  // electron-builder 不会把更新说明写进清单，导致客户端「发现新版本」弹窗只有
  // 版本号、没有内容。这里注入仓库维护的 RELEASE-NOTES.md，与 Release 正文同源。
  // 换行统一成 LF：Windows runner checkout 得到 CRLF、mac/Linux 得到 LF，
  // 不归一会让同一版本的三份清单逐字节不一致。
  const releaseNotes = options.releaseNotes?.replace(/\r\n?/g, "\n").trim();
  if (releaseNotes) {
    parsed.releaseNotes = releaseNotes;
  }

  return { content: stringify(parsed), renamed };
}

/**
 * 校验 dist 目录里 latest.yml 指向的安装包确实存在。
 * 磁盘文件名仍是 electron-builder 的原始名（可能含空格），因此按 GitHub 资产命名规则比对。
 */
export function verifyLatestYmlArtifacts(distDir, content) {
  const parsed = parse(content);
  const assetNames = new Set(
    readdirSync(distDir).map((name) => toGitHubAssetName(name)),
  );
  const missing = [];
  for (const file of parsed.files ?? []) {
    if (!file?.url) continue;
    if (!assetNames.has(toGitHubAssetName(file.url))) {
      missing.push(file.url);
    }
  }
  return missing;
}

function readArg(argv, name) {
  const prefix = `${name}=`;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === name) {
      return argv[index + 1] ?? "";
    }
    if (argv[index].startsWith(prefix)) {
      return argv[index].slice(prefix.length);
    }
  }
  return undefined;
}

const entryFilePath = process.argv[1] ? resolve(process.argv[1]) : "";
const currentFilePath = fileURLToPath(import.meta.url);

if (entryFilePath === currentFilePath) {
  try {
    const distDir = resolve(readArg(process.argv.slice(2), "--dir") || "packages/desktop/dist");
    // 清单文件名随平台变化：Windows latest.yml、macOS latest-mac.yml、
    // Linux latest-linux.yml（arm64 带 -arm64 后缀）。默认仍取 latest.yml 以兼容既有调用。
    const manifestName = readArg(process.argv.slice(2), "--file") || "latest.yml";
    const ymlPath = join(distDir, manifestName);
    if (!existsSync(ymlPath)) {
      throw new Error(`${manifestName} 未生成: ${ymlPath}`);
    }

    const original = readFileSync(ymlPath, "utf8");
    // 更新说明与 Release 正文同源：都用仓库维护的 RELEASE-NOTES.md。
    // 未传该参数时保持清单原样（不注入空字段），兼容既有调用方。
    const releaseNotesPath = readArg(process.argv.slice(2), "--release-notes");
    let releaseNotes = null;
    if (releaseNotesPath) {
      const absoluteNotesPath = resolve(releaseNotesPath);
      if (!existsSync(absoluteNotesPath)) {
        throw new Error(`更新说明文件不存在: ${absoluteNotesPath}`);
      }
      releaseNotes = readFileSync(absoluteNotesPath, "utf8");
      if (!releaseNotes.trim()) {
        throw new Error(`更新说明文件为空: ${absoluteNotesPath}`);
      }
    }

    const { content, renamed } = rewriteLatestYml(original, { releaseNotes });
    writeFileSync(ymlPath, content, "utf8");

    const missing = verifyLatestYmlArtifacts(distDir, content);
    if (missing.length > 0) {
      throw new Error(`${manifestName} 指向的产物不存在: ${missing.join(", ")}`);
    }

    for (const item of renamed) {
      process.stdout.write(`[latest-yml] ${item.from} -> ${item.to}\n`);
    }
    process.stdout.write(`[latest-yml] normalized ${ymlPath}\n`);
    process.stdout.write(
      `[latest-yml] dist assets: ${readdirSync(distDir)
        .filter(
          (name) =>
            name.endsWith(".exe") ||
            name.endsWith(".dmg") ||
            name.endsWith(".zip") ||
            name.endsWith(".AppImage") ||
            name.endsWith(".deb") ||
            name.endsWith(".blockmap") ||
            name.endsWith(".yml"),
        )
        .join(", ")}\n`,
    );
  } catch (error) {
    process.stderr.write(`[latest-yml] ${error instanceof Error ? error.message : error}\n`);
    process.exit(1);
  }
}

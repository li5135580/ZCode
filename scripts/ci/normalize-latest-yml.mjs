#!/usr/bin/env node
// 修正 electron-builder 生成的 latest.yml 中的下载文件名。
//
// 背景：artifactName 里带 ${productName}（`ZCode Preview`，含空格），electron-builder 把
// 磁盘文件名原样写进 latest.yml 的 files[].url；而 GitHub Release 上传资产时会把空格替换成
// 点号（实测资产名 `ZCode.Preview-3.15.1-win-x64.exe`，label 仍是 `ZCode Preview-...`）。
// 客户端按 latest.yml 的 url 拼 `releases/latest/download/<url>`，文件名对不上就是 404。
//
// 这里在打包后、上传前把 url/path 统一改写成 GitHub 的资产命名规则。

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, stringify } from "yaml";

/** GitHub Release 资产名规则：空格 → 点号（其余字符保持）。 */
export function toGitHubAssetName(fileName) {
  return fileName.replace(/ /g, ".");
}

/**
 * 改写 latest.yml 文本里的下载地址。
 *
 * @param {string} content latest.yml 原始内容
 * @returns {{ content: string, renamed: Array<{ from: string, to: string }> }}
 */
export function rewriteLatestYml(content) {
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
    const { content, renamed } = rewriteLatestYml(original);
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

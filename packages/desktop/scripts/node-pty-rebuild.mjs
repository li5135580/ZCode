import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { access } from "node:fs/promises";
import { dirname, join, normalize, posix as posixPath, resolve, sep } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function normalizePathForComparison(filePath) {
  return normalize(filePath).split(sep).join("/");
}

export function getNodePtyPrebuildPath({ platform, arch, nodePtyRoot }) {
  const normalizedRoot = normalizePathForComparison(nodePtyRoot);
  return posixPath.join(normalizedRoot, "prebuilds", `${platform}-${arch}`, "pty.node");
}

export function decideNodePtyRebuild({ platform, arch, nodePtyRoot, existingPaths }) {
  const prebuildPath = getNodePtyPrebuildPath({ platform, arch, nodePtyRoot });

  if (platform !== "win32") {
    return {
      shouldRebuild: true,
      prebuildPath,
      reason: "non-windows-platform",
    };
  }

  if (existingPaths.has(prebuildPath)) {
    return {
      shouldRebuild: false,
      prebuildPath,
      reason: "windows-prebuild-available",
    };
  }

  return {
    shouldRebuild: true,
    prebuildPath,
    reason: "windows-prebuild-missing",
  };
}

export function resolveNodePtyRoot(cwd = process.cwd()) {
  const nodePtyPackageJsonPath = require.resolve("node-pty/package.json", { paths: [cwd] });
  return dirname(nodePtyPackageJsonPath);
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function resolveNodePtyRebuildDecision({
  platform = process.platform,
  arch = process.arch,
  cwd = process.cwd(),
} = {}) {
  const nodePtyRoot = resolveNodePtyRoot(cwd);
  const prebuildPath = getNodePtyPrebuildPath({ platform, arch, nodePtyRoot });
  const existingPaths = new Set((await pathExists(prebuildPath)) ? [prebuildPath] : []);

  return decideNodePtyRebuild({
    platform,
    arch,
    nodePtyRoot,
    existingPaths,
  });
}

function runElectronRebuild() {
  return new Promise((resolve, reject) => {
    const command = process.platform === "win32" ? "electron-rebuild.cmd" : "electron-rebuild";
    const child = spawn(command, ["-o", "node-pty"], {
      cwd: process.cwd(),
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `electron-rebuild failed with code ${code ?? "null"} and signal ${signal ?? "null"}`,
        ),
      );
    });
  });
}

/**
 * 判断 rebuild 失败后是否还有可用的预编译产物兜底。
 *
 * node-pty 1.1 用的是 N-API，预编译产物跨 Electron 版本通用：
 * - macOS 自带 `prebuilds/darwin-*`；
 * - Linux 的预编译来自 `@lydell/node-pty-linux-*`，由 beforePack 复制进 node-pty 目录。
 * CI 的 Linux runner 不保证有完整编译链（node-gyp 需要 python/make/g++），
 * rebuild 失败不该让整个 `pnpm install` 挂掉——打包最终用的是这些预编译产物。
 */
function hasPrebuildFallback({ platform, arch, nodePtyRoot }) {
  const ownPrebuild = getNodePtyPrebuildPath({ platform, arch, nodePtyRoot });
  if (existsSync(ownPrebuild)) {
    return ownPrebuild;
  }
  if (platform === "linux") {
    const platformKey = `${platform}-${arch}`;
    // node_modules 布局有两种：hoisted 时 @lydell 与 node-pty 同级，
    // pnpm 默认布局时 @lydell 在 node_modules 根、node-pty 在 .pnpm 下。逐个试。
    for (const candidateRoot of [
      resolve(nodePtyRoot, "..", "@lydell"),
      resolve(nodePtyRoot, "..", "..", "..", "..", "@lydell"),
    ]) {
      const candidate = resolve(
        candidateRoot,
        `node-pty-${platformKey}`,
        "prebuilds",
        platformKey,
        "pty.node",
      );
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

export async function main() {
  const decision = await resolveNodePtyRebuildDecision();

  if (!decision.shouldRebuild) {
    // electron-rebuild 会在 Windows 强制 node-gyp build-from-source。
    // node-pty 1.1 已自带 Electron 可复用的 N-API 预编译产物，继续本地编译只会把 CI 绑到 VS 的 Spectre 库上，
    // 导致安装阶段直接失败，所以这里命中预编译时跳过 rebuild。
    console.log(`[node-pty] skip electron-rebuild (${decision.reason}): ${decision.prebuildPath}`);
    return;
  }

  console.log(`[node-pty] run electron-rebuild (${decision.reason}): ${decision.prebuildPath}`);
  try {
    await runElectronRebuild();
  } catch (error) {
    const fallback = hasPrebuildFallback({
      platform: process.platform,
      arch: process.arch,
      nodePtyRoot: resolveNodePtyRoot(),
    });
    if (!fallback) {
      throw error;
    }
    // 没有编译链的 CI runner 上 rebuild 会失败，但打包用的是预编译产物，继续安装即可。
    console.warn(
      `[node-pty] electron-rebuild 失败，改用预编译产物继续: ${fallback}\n` +
        `[node-pty] ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

const currentFilePath = fileURLToPath(import.meta.url);

if (process.argv[1] && currentFilePath === process.argv[1]) {
  await main();
}

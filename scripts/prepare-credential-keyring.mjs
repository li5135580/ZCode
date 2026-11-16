import {
  cpSync,
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { getTargetPlatform } from "../packages/desktop/scripts/target-platform.mjs";
import { keyringPlatformPackage } from "./stage-credential-keyring.mjs";

const KEYRING_PACKAGE_NAME = "@napi-rs/keyring";
const KEYRING_PLATFORM_PACKAGE_PREFIX = "@napi-rs/keyring-";

/**
 * 目标平台的 keyring 原生二进制文件名。
 *
 * `@napi-rs/keyring/index.js` 的加载顺序是「同目录 `./keyring.<triple>.node`」优先，
 * 平台包（`@napi-rs/keyring-<triple>`）兜底；triple 与平台包后缀完全一致
 * （win32-x64 → `keyring.win32-x64-msvc.node`）。
 */
export function resolveKeyringNativeFileName(platformKey) {
  const platformPackageName = keyringPlatformPackage(platformKey);
  return `keyring.${platformPackageName.slice(KEYRING_PLATFORM_PACKAGE_PREFIX.length)}.node`;
}

/**
 * pnpm hoisted 布局下，平台包可能落在 workspace 根、桌面包或 .pnpm 虚拟 store 中，
 * 与 electron-builder.config.js 的 runtimeModuleLookupRoots 保持同样的搜索顺序。
 */
export function createDefaultKeyringLookupRoots(workspaceRoot) {
  return [
    workspaceRoot,
    resolve(workspaceRoot, "packages", "desktop"),
    resolve(workspaceRoot, "node_modules", ".pnpm", "node_modules"),
    resolve(
      workspaceRoot,
      "packages",
      "desktop",
      "node_modules",
      ".pnpm",
      "node_modules",
    ),
  ];
}

function resolvePackageDirectory({ lookupRoots, workspaceRoot, packageName }) {
  for (const lookupRoot of lookupRoots) {
    const manifestPath = resolve(
      lookupRoot,
      "node_modules",
      packageName,
      "package.json",
    );
    if (existsSync(manifestPath)) return dirname(manifestPath);
  }
  // 平台包未声明 exports（只声明 main），require.resolve 可以作为 .pnpm 深层布局的兜底。
  try {
    const require = createRequire(resolve(workspaceRoot, "package.json"));
    return dirname(require.resolve(`${packageName}/package.json`));
  } catch {
    return null;
  }
}

function resolveSourceKeyringBinaryPath({
  sourcePackageDirectory,
  nativeFileName,
}) {
  const preferredPath = resolve(sourcePackageDirectory, nativeFileName);
  if (existsSync(preferredPath)) return preferredPath;

  // 平台包约定 main 即 .node 文件；个别版本可能改用别名，做两层兜底避免硬编码文件名过脆。
  const manifest = JSON.parse(
    readFileSync(resolve(sourcePackageDirectory, "package.json"), "utf8"),
  );
  if (typeof manifest.main === "string" && manifest.main.endsWith(".node")) {
    const mainPath = resolve(sourcePackageDirectory, manifest.main);
    if (existsSync(mainPath)) return mainPath;
  }
  const nodeFiles = readdirSync(sourcePackageDirectory).filter((name) =>
    name.endsWith(".node"),
  );
  if (nodeFiles.length === 1)
    return resolve(sourcePackageDirectory, nodeFiles[0]);

  throw new Error(
    `keyring 平台包中找不到 ${nativeFileName}: ${sourcePackageDirectory}（候选 .node: ${nodeFiles.join(", ") || "无"}）`,
  );
}

function resolveKeyringMainPackageDirectory({ lookupRoots, workspaceRoot }) {
  const directory = resolvePackageDirectory({
    lookupRoots,
    workspaceRoot,
    packageName: KEYRING_PACKAGE_NAME,
  });
  if (!directory) {
    throw new Error(
      `未找到 ${KEYRING_PACKAGE_NAME}，无法放置 keyring 原生二进制；请先在 ${workspaceRoot} 执行 pnpm install`,
    );
  }
  return directory;
}

/**
 * 事故背景：Windows 安装包缺失 keyring 原生二进制，导致升级后登录态丢失且无法重新登录。
 *
 * 根因有两层：
 * 1. `@napi-rs/keyring-win32-*` 是 optionalDependencies，CI 上 install 可能静默装不上，
 *    electron-builder 收集不到时 `index.js` 的两条加载路径（同目录 .node / 平台包）全部落空；
 * 2. asarUnpack 旧规则只匹配平台包目录，即使把 .node 复制进 keyring 本体目录也不会 unpack。
 *
 * 这里参照 node-pty 的 restoreTargetNodePtyPrebuild：打包前把目标平台二进制复制进
 * keyring 本体目录，使加载顺序的第一条路径（同目录文件）天然命中，不再依赖 optional 平台包
 * 的安装结果；darwin/linux 源包缺失时只告警不失败（避免其它平台构建被硬中断）。
 */
export function prepareCredentialKeyring({
  workspaceRoot,
  targetPlatform,
  lookupRoots,
} = {}) {
  const resolvedWorkspaceRoot =
    workspaceRoot ?? resolve(import.meta.dirname, "..");
  const resolvedTargetPlatform = targetPlatform ?? getTargetPlatform();
  const resolvedLookupRoots =
    lookupRoots ?? createDefaultKeyringLookupRoots(resolvedWorkspaceRoot);
  const platformKey = resolvedTargetPlatform.key;
  const platformPackageName = keyringPlatformPackage(platformKey);
  const nativeFileName = resolveKeyringNativeFileName(platformKey);

  const keyringMainPackageDirectory = resolveKeyringMainPackageDirectory({
    lookupRoots: resolvedLookupRoots,
    workspaceRoot: resolvedWorkspaceRoot,
  });
  const targetBinaryPath = resolve(keyringMainPackageDirectory, nativeFileName);

  const sourcePackageDirectory = resolvePackageDirectory({
    lookupRoots: resolvedLookupRoots,
    workspaceRoot: resolvedWorkspaceRoot,
    packageName: platformPackageName,
  });
  if (!sourcePackageDirectory) {
    // win32 缺该文件会直接复现登录态丢失事故，必须 fail-closed；其他平台保持 warn，
    // 由 afterPack 的校验单独决定是否硬失败，避免本钩子一刀切影响非 Windows 出包。
    const message =
      `缺少 keyring 平台包 ${platformPackageName}，无法为 ${platformKey} 准备 ${nativeFileName}。` +
      `请在构建机执行 pnpm install 恢复依赖树后重试；` +
      `缺失该二进制的安装包会导致登录态丢失且无法重新登录。`;
    if (resolvedTargetPlatform.os === "win32") {
      throw new Error(message);
    }
    console.warn(`[prepareCredentialKeyring] ${message}`);
    return null;
  }

  const sourceBinaryPath = resolveSourceKeyringBinaryPath({
    sourcePackageDirectory,
    nativeFileName,
  });
  // keyring 本体目录按 npm files 清单本不该有 .node；同一 checkout 连续构建不同平台时，
  // 上一次复制进去的异平台二进制没有 files 规则裁剪（keyring-* 平台包规则不覆盖本体目录），
  // 会被原样打进下一个安装包。复制前清掉所有非目标 triple 的 keyring.*.node。
  for (const entry of readdirSync(keyringMainPackageDirectory)) {
    if (
      entry.startsWith("keyring.") &&
      entry.endsWith(".node") &&
      entry !== nativeFileName
    ) {
      rmSync(resolve(keyringMainPackageDirectory, entry), { force: true });
      console.log(
        `[prepareCredentialKeyring] removed stale platform binary: ${resolve(keyringMainPackageDirectory, entry)}`,
      );
    }
  }
  cpSync(sourceBinaryPath, targetBinaryPath);
  if (!existsSync(targetBinaryPath)) {
    throw new Error(
      `keyring 原生二进制复制失败: ${sourceBinaryPath} -> ${targetBinaryPath}`,
    );
  }

  const sizeBytes = statSync(targetBinaryPath).size;
  console.log(
    `[prepareCredentialKeyring] keyring native restored: ${sourceBinaryPath} -> ${targetBinaryPath} (${sizeBytes} bytes)`,
  );
  return { sourceBinaryPath, targetBinaryPath, sizeBytes };
}

/**
 * 校验目标二进制已在 keyring 本体目录中。require 校验只在宿主平台与目标平台一致时执行：
 * 跨平台构建（如在 linux 上打 win32 包）时目标二进制本来就无法在安装机加载，硬校验会误报。
 */
export function verifyCredentialKeyring({
  workspaceRoot,
  targetPlatform,
  lookupRoots,
} = {}) {
  const resolvedWorkspaceRoot =
    workspaceRoot ?? resolve(import.meta.dirname, "..");
  const resolvedTargetPlatform = targetPlatform ?? getTargetPlatform();
  const resolvedLookupRoots =
    lookupRoots ?? createDefaultKeyringLookupRoots(resolvedWorkspaceRoot);
  const platformKey = resolvedTargetPlatform.key;
  const nativeFileName = resolveKeyringNativeFileName(platformKey);
  const keyringMainPackageDirectory = resolveKeyringMainPackageDirectory({
    lookupRoots: resolvedLookupRoots,
    workspaceRoot: resolvedWorkspaceRoot,
  });
  const targetBinaryPath = resolve(keyringMainPackageDirectory, nativeFileName);

  if (!existsSync(targetBinaryPath)) {
    const message =
      `keyring 原生二进制缺失: ${targetBinaryPath}。请先运行 ` +
      `node scripts/prepare-credential-keyring.mjs（或检查 ${keyringPlatformPackage(platformKey)} 是否已安装）。`;
    if (resolvedTargetPlatform.os === "win32") {
      throw new Error(message);
    }
    console.warn(`[prepareCredentialKeyring] ${message}`);
    return false;
  }

  console.log(
    `[prepareCredentialKeyring] keyring native verified: ${targetBinaryPath} (${statSync(targetBinaryPath).size} bytes)`,
  );

  const hostPlatformKey = `${process.platform}-${process.arch}`;
  if (hostPlatformKey !== platformKey) {
    console.log(
      `[prepareCredentialKeyring] skip require check: host=${hostPlatformKey} target=${platformKey}`,
    );
    return true;
  }
  const require = createRequire(
    resolve(keyringMainPackageDirectory, "package.json"),
  );
  require(targetBinaryPath);
  console.log("[prepareCredentialKeyring] keyring native require check passed");
  return true;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const verifyOnly = process.argv.includes("--verify");
  const targetPlatform = getTargetPlatform();
  if (verifyOnly) {
    verifyCredentialKeyring({ targetPlatform });
  } else {
    prepareCredentialKeyring({ targetPlatform });
  }
}

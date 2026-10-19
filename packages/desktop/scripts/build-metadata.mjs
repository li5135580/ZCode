import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const moduleDir = import.meta.dirname;

function findPackageDir(packageName, startDirs) {
  for (const startDir of startDirs) {
    let currentDir = resolve(startDir);

    while (true) {
      const packageJsonPath = resolve(currentDir, "package.json");
      if (existsSync(packageJsonPath)) {
        try {
          const packageJson = readJson(packageJsonPath);
          if (packageJson.name === packageName) {
            return currentDir;
          }
        } catch {
          // ignore invalid package.json and continue walking up
        }
      }

      const parentDir = resolve(currentDir, "..");
      if (parentDir === currentDir) {
        break;
      }
      currentDir = parentDir;
    }
  }

  throw new Error(`Unable to find package directory for ${packageName}`);
}

const desktopDir = findPackageDir("@zcode/desktop", [
  moduleDir,
  resolve(moduleDir, ".."),
  process.cwd(),
]);
const workspaceDir = resolve(desktopDir, "../..");
const metadataDir = resolve(desktopDir, "out/metadata");
const metadataPath = resolve(metadataDir, "build-meta.json");

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf-8"));
}

function normalizeVersion(version) {
  if (typeof version !== "string" || version.length === 0) {
    return "unknown";
  }

  const normalized = version.replace(/^[^\d]*/, "");
  return normalized || version;
}

/** 构建期版本覆盖变量：CI 用它把上游版本号改写成严格更大的 fork 版本。 */
export const APP_VERSION_ENV = "ZCODE_APP_VERSION";

// SemVer 2.0.0 官方正则（含预发布与构建元数据）。electron-updater 用 semver.gt 比较版本，
// 这里必须在写入 extraMetadata 之前就拒绝非法值，避免打包出无法参与更新的版本号。
const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

export function isValidSemver(version) {
  return typeof version === "string" && SEMVER_PATTERN.test(version);
}

/** 读取环境变量里的版本覆盖；未设置或空白返回 null（表示沿用 package.json）。 */
function readAppVersionOverride(env = process.env) {
  const raw = env[APP_VERSION_ENV];
  if (typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * 解析最终写入安装包的版本号。
 * 优先级：`ZCODE_APP_VERSION` > 根 package.json 的 version。
 * 覆盖值非法时直接抛错，禁止静默回退到 package.json——那会让 CI 打出与 tag 不符的包。
 */
export function resolveAppVersion(packageVersion, env = process.env) {
  const override = readAppVersionOverride(env);
  if (override === null) {
    return normalizeVersion(packageVersion);
  }
  if (!isValidSemver(override)) {
    throw new Error(
      `invalid ${APP_VERSION_ENV}=${JSON.stringify(override)}; expected a valid semver (e.g. 3.15.2-fork.2)`,
    );
  }
  return normalizeVersion(override);
}

function resolveInstalledPackageVersion(packageName, fallbackVersion) {
  try {
    const packageJsonPath = require.resolve(`${packageName}/package.json`, { paths: [desktopDir] });
    return normalizeVersion(readJson(packageJsonPath).version);
  } catch {
    return normalizeVersion(fallbackVersion);
  }
}

function resolveCommitId() {
  try {
    return execSync("git rev-parse --short=8 HEAD", {
      cwd: workspaceDir,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return process.env.ZCODE_COMMIT ?? "unknown";
  }
}

export function collectBuildMetadata() {
  const rootPackageJson = readJson(resolve(workspaceDir, "package.json"));
  const desktopPackageJson = readJson(resolve(desktopDir, "package.json"));

  return {
    // 根 package.json 的 version 必须与上游对齐，fork 版本只在构建期通过环境变量注入。
    appVersion: resolveAppVersion(rootPackageJson.version),
    minCompatibleVersion: normalizeVersion(
      rootPackageJson.zcodeCompatibility?.minCompatibleVersion ?? rootPackageJson.version,
    ),
    buildCommitId: resolveCommitId(),
    buildTime: new Date().toISOString(),
    electronBuilderVersion: resolveInstalledPackageVersion(
      "electron-builder",
      desktopPackageJson.devDependencies?.["electron-builder"],
    ),
  };
}

export function readBuildMetadata() {
  if (!existsSync(metadataPath)) {
    return null;
  }

  try {
    const metadata = readJson(metadataPath);
    return {
      ...metadata,
      minCompatibleVersion:
        typeof metadata.minCompatibleVersion === "string" && metadata.minCompatibleVersion.length > 0
          ? normalizeVersion(metadata.minCompatibleVersion)
          : normalizeVersion(metadata.appVersion),
    };
  } catch {
    return null;
  }
}

export function getBuildMetadata() {
  const cached = readBuildMetadata();
  if (!cached) {
    return collectBuildMetadata();
  }

  // 复用缓存时仍要让构建期版本覆盖生效：本地/CI 可能残留上一次构建写下的
  // build-meta.json，若不重算会把旧版本号写进 extraMetadata（安装包与 latest.yml 不一致）。
  const override = readAppVersionOverride();
  if (override === null) {
    return cached;
  }
  return { ...cached, appVersion: resolveAppVersion(cached.appVersion) };
}

export function writeBuildMetadata() {
  // About 之前分别在 tsup、vite 里各算一份 commit 和时间。
  // 问题原因：两次构建是独立进程，时间点天然不一致；后面再打包时，最终安装包里展示的信息也不一定对应同一次产物。
  // 这里先统一落盘成 build-meta.json，再让构建和运行时都复用同一份数据，保证 about 可追溯。
  const metadata = collectBuildMetadata();
  mkdirSync(metadataDir, { recursive: true });
  writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf-8");
  return metadata;
}

export function getBuildMetadataPath() {
  return metadataPath;
}

const entryFilePath = process.argv[1] ? resolve(process.argv[1]) : null;
const currentFilePath = fileURLToPath(import.meta.url);

if (entryFilePath === currentFilePath) {
  const metadata = writeBuildMetadata();
  process.stdout.write(`[build-meta] wrote ${metadataPath}\n`);
  process.stdout.write(
    `[build-meta] commit=${metadata.buildCommitId} time=${metadata.buildTime}\n`,
  );
}

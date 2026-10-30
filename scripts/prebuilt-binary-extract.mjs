import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import process from "node:process";
import { runCommand } from "./spawn-command.mjs";

// Bugfix: Windows GNU tar（Git Bash）会把绝对路径里的盘符冒号（C:）当成远程主机名，
// 反斜杠路径也会被 MSYS 参数转换破坏。tar 参数统一转正斜杠，路径优先改用
// 相对 cwd 的形式避开盘符冒号；对 bsdtar 与 Linux/macOS CI 无影响。
function toTarPosixPath(pathValue) {
  return pathValue.replaceAll("\\", "/");
}

/**
 * 把路径折算成 tar 可安全接受的参数形式。
 *
 * Windows 的 GNU tar 会把 `C:/...` 里的冒号当成远程主机名，报
 * `Cannot connect to C: resolve failed`；`-C` 的目标目录同样会中招。
 * 因此只要目标与 cwd 同盘，就改用相对路径。
 */
function resolveTarPathArg(targetPath, cwd) {
  if (process.platform === "win32") {
    try {
      const relativePath = relative(cwd, targetPath);
      if (relativePath && !relativePath.startsWith("..")) {
        return toTarPosixPath(relativePath);
      }
    } catch {
      // 跨盘符时 relative 会抛错，退回正斜杠绝对路径（bsdtar 可用）。
    }
  }

  return toTarPosixPath(targetPath);
}

function resolveTarArchiveArg(archivePath, cwd) {
  return resolveTarPathArg(archivePath, cwd);
}

export function extractPrebuiltArchive({ archivePath, archiveExt, extractDir, cwd }) {
  mkdirSync(extractDir, { recursive: true });
  if (archiveExt === "zip") {
    if (process.platform === "win32") {
      runCommand("powershell.exe", [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        `Expand-Archive -LiteralPath '${archivePath.replaceAll("'", "''")}' -DestinationPath '${extractDir.replaceAll("'", "''")}' -Force`,
      ]);
      return;
    }

    runCommand("unzip", ["-q", archivePath, "-d", extractDir], { cwd });
    return;
  }

  // Windows 的 GNU tar 会把路径里的盘符冒号当成远程主机名（`D:/...` 被解释成
  // 主机 D 上的路径），报 `Cannot connect to D: resolve failed`。`--force-local`
  // 专门关闭这一解释；它是全局选项，必须出现在归档路径之前。
  // 注意 CI 上仓库在 D 盘、临时目录在 C 盘，跨盘符无法靠相对路径规避。
  if (process.platform === "win32") {
    runCommand(
      "tar",
      [
        // 全局选项，必须排在 -xzf 之前：紧跟 -f 会被当作归档文件名。
        "--force-local",
        "-xzf",
        toTarPosixPath(archivePath),
        "-C",
        toTarPosixPath(extractDir),
      ],
      { cwd: cwd ?? process.cwd() },
    );
    return;
  }

  const tarCwd = cwd ?? process.cwd();
  runCommand(
    "tar",
    ["-xzf", resolveTarArchiveArg(archivePath, tarCwd), "-C", toTarPosixPath(extractDir)],
    { cwd: tarCwd },
  );
}

export function findPrebuiltBinary(rootDir, binaryName) {
  const entries = readdirSync(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(rootDir, entry.name);
    if (entry.isDirectory()) {
      const nested = findPrebuiltBinary(fullPath, binaryName);
      if (nested) return nested;
      continue;
    }

    if (entry.isFile() && entry.name === binaryName) return fullPath;
  }

  return undefined;
}

export function assertPrebuiltArchiveSha256(expectedSha256) {
  const normalizedExpectedSha256 = String(expectedSha256 ?? "")
    .trim()
    .toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(normalizedExpectedSha256)) {
    throw new Error("missing prebuilt archive SHA-256");
  }
  return normalizedExpectedSha256;
}

export function verifyPrebuiltArchiveSha256(archivePath, expectedSha256) {
  const normalizedExpectedSha256 = assertPrebuiltArchiveSha256(expectedSha256);
  const actualSha256 = createHash("sha256").update(readFileSync(archivePath)).digest("hex");
  if (actualSha256 !== normalizedExpectedSha256) {
    throw new Error(
      `Archive SHA-256 mismatch: expected ${normalizedExpectedSha256}, received ${actualSha256}`,
    );
  }
}

export async function extractPrebuiltBinary({
  archiveExt,
  archivePath,
  archiveSha256,
  binaryName,
  binaryPath,
  cwd,
  targetPlatform,
  validateBinary,
}) {
  verifyPrebuiltArchiveSha256(archivePath, archiveSha256);
  mkdirSync(dirname(binaryPath), { recursive: true });
  mkdirSync(tmpdir(), { recursive: true });
  const tempDir = mkdtempSync(join(tmpdir(), "zcode-prebuilt-binary-"));
  const extractDir = join(tempDir, "extract");

  try {
    extractPrebuiltArchive({ archivePath, archiveExt, extractDir, cwd });
    const extractedBinaryPath = findPrebuiltBinary(extractDir, binaryName);
    if (!extractedBinaryPath) {
      throw new Error(`Failed to locate ${binaryName} in extracted archive`);
    }

    // foreign target 不能靠执行目标文件验真，必须在覆盖正式路径前校验临时产物。
    await validateBinary?.(extractedBinaryPath);
    copyFileSync(extractedBinaryPath, binaryPath);
    if (targetPlatform !== "win32") {
      chmodSync(binaryPath, 0o755);
    }
  } finally {
    // Bugfix: Windows 下解压产物可能被杀毒/索引器或尚未退出的解压子进程短暂持有句柄，
    // rmSync 立即删除会 EPERM，且 finally 里抛出的异常会掩盖真正的解压错误。
    // 带重试删除，失败时仅告警，让原始错误正常抛出。
    try {
      rmSync(tempDir, { force: true, recursive: true, maxRetries: 10, retryDelay: 500 });
    } catch (error) {
      console.warn(`[warn] 清理临时目录失败（可忽略）: ${tempDir}`);
      console.warn(`[warn] ${String(error)}`);
    }
  }
}

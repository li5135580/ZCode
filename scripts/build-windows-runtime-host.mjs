import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const source = join(root, "scripts/windows-runtime-host");

export function resolveRuntimeHostBuild(
  arch,
  hostPlatform = process.platform,
  compiler = process.env.ZCODE_WINDOWS_CXX,
) {
  if (arch !== "x64" && arch !== "arm64")
    throw new Error(`Unsupported runtime host architecture: ${arch}`);
  if (hostPlatform !== "win32") {
    return {
      configureArgs: [
        "-DCMAKE_SYSTEM_NAME=Windows",
        `-DCMAKE_CXX_COMPILER=${compiler || (arch === "arm64" ? "aarch64-w64-mingw32-clang++" : "x86_64-w64-mingw32-g++")}`,
      ],
    };
  }
  // Windows 上优先用 MinGW：GitHub 的 windows-latest 镜像已不再预装 Visual Studio，
  // 写死 `-G "Visual Studio 17 2022"` 会在 CI 与本机都直接失败（2026-11-16 实测）。
  // ZCODE_RUNTIME_HOST_GENERATOR 允许显式指定生成器，供有 VS 的机器继续用 MSVC。
  const generator = process.env.ZCODE_RUNTIME_HOST_GENERATOR?.trim();
  if (generator) {
    return {
      configureArgs:
        generator === "MinGW Makefiles"
          ? ["-G", generator, `-DCMAKE_CXX_COMPILER=${compiler || "x86_64-w64-mingw32-g++"}`]
          : ["-G", generator, "-A", arch === "arm64" ? "ARM64" : "x64"],
    };
  }
  return {
    configureArgs: [
      "-G",
      "MinGW Makefiles",
      `-DCMAKE_CXX_COMPILER=${compiler || "x86_64-w64-mingw32-g++"}`,
    ],
  };
}

export function verifyRuntimeHostPe(bytes, arch) {
  const header = bytes.length >= 64 ? bytes.readUInt32LE(60) : -1;
  if (
    bytes.toString("ascii", 0, 2) !== "MZ" ||
    header < 0 ||
    header + 6 > bytes.length ||
    bytes.toString("ascii", header, header + 4) !== "PE\0\0"
  ) {
    throw new Error("Invalid runtime host PE binary");
  }
  if (bytes.readUInt16LE(header + 4) !== (arch === "arm64" ? 0xaa64 : 0x8664))
    throw new Error("Runtime host architecture mismatch");
}

async function sourceDigest() {
  const hash = createHash("sha256");
  for (const name of ["main.cpp", "installer-process-helper.cpp", "CMakeLists.txt"])
    hash.update(await readFile(join(source, name)));
  return hash.digest("hex");
}

function run(args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.env.CMAKE || "cmake", args, { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0 ? resolveRun() : reject(new Error(`Runtime host CMake failed: ${code}`)),
    );
  });
}

export async function isRuntimeHostReady(outputDir, arch) {
  try {
    const hostBytes = await readFile(join(outputDir, "zcode-runtime-host.exe"));
    const helperBytes = await readFile(join(outputDir, "zcode-installer-process-helper.exe"));
    verifyRuntimeHostPe(hostBytes, arch);
    verifyRuntimeHostPe(helperBytes, arch);
    const manifest = JSON.parse(await readFile(join(outputDir, "build.json"), "utf8"));
    return (
      manifest.source === (await sourceDigest()) &&
      manifest.binary === createHash("sha256").update(hostBytes).digest("hex") &&
      manifest.installerProcessHelper === createHash("sha256").update(helperBytes).digest("hex")
    );
  } catch {
    return false;
  }
}

export async function buildRuntimeHost({ arch, outputDir }) {
  const plan = resolveRuntimeHostBuild(arch);
  const work = await mkdtemp(join(tmpdir(), "zcode-runtime-host-"));
  try {
    // 源码目录含非 ASCII 字符时（例如本机放在 D 盘的中文目录下），MinGW 的 cc1plus 会把
    // 路径按 GBK 解码成乱码后找不到文件。先把源码复制进 ASCII 临时目录再配置，
    // 这样构建路径与仓库路径无关。
    const buildSource = join(work, "src");
    const buildDir = join(work, "build");
    await mkdir(buildSource, { recursive: true });
    // CMakeLists 里还声明了 acceptance / fixture 两个 EXCLUDE_FROM_ALL 目标，
    // 它们的源文件也必须一起复制，否则 CMake 配置阶段就会报找不到源文件。
    for (const name of await readdir(source)) {
      if (!name.endsWith(".cpp") && name !== "CMakeLists.txt") continue;
      await copyFile(join(source, name), join(buildSource, name));
    }
    await run(["-S", buildSource, "-B", buildDir, ...plan.configureArgs, "-DCMAKE_BUILD_TYPE=Release"]);
    await run([
      "--build",
      buildDir,
      "--config",
      "Release",
      "--target",
      "zcode-runtime-host",
      "zcode-installer-process-helper",
    ]);
    // 产物目录随生成器而变：MSVC（Visual Studio 生成器）是多配置生成器，产物落在
    // Release/ 子目录；MinGW Makefiles 是单配置生成器，直接落在构建根目录。
    // 过去写死 win32 => Release/，在没有 VS 的机器上（改用 MinGW 后）必然找不到产物。
    const releaseDir = existsSync(join(buildDir, "Release")) ? join(buildDir, "Release") : buildDir;
    const hostBytes = await readFile(join(releaseDir, "zcode-runtime-host.exe"));
    const helperBytes = await readFile(join(releaseDir, "zcode-installer-process-helper.exe"));
    verifyRuntimeHostPe(hostBytes, arch);
    verifyRuntimeHostPe(helperBytes, arch);
    await mkdir(outputDir, { recursive: true });
    await copyFile(
      join(releaseDir, "zcode-runtime-host.exe"),
      join(outputDir, "zcode-runtime-host.exe"),
    );
    await copyFile(
      join(releaseDir, "zcode-installer-process-helper.exe"),
      join(outputDir, "zcode-installer-process-helper.exe"),
    );
    await writeFile(
      join(outputDir, "build.json"),
      JSON.stringify({
        source: await sourceDigest(),
        binary: createHash("sha256").update(hostBytes).digest("hex"),
        installerProcessHelper: createHash("sha256").update(helperBytes).digest("hex"),
      }),
    );
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const arch =
    args.find((arg) => arg.startsWith("--arch="))?.slice(7) ||
    process.env.ZCODE_TARGET_ARCH ||
    process.arch;
  const outputDir =
    args.find((arg) => arg.startsWith("--output-dir="))?.slice(13) ||
    join(root, "packages/desktop/bundled-tools", `win32-${arch}`, "runtime-host");
  if (!args.includes("--if-windows") || process.platform === "win32") {
    if (!args.includes("--ensure") || !(await isRuntimeHostReady(outputDir, arch))) {
      await buildRuntimeHost({ arch, outputDir });
    }
  }
}

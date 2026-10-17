# ZCode（二开增强版）

<div align="center">
  <img src="public/logo/icons/1024x1024.png" alt="ZCode" width="128" height="128" />
</div>
<p align="center">
  <a href="https://applink.feishu.cn/client/chat/chatter/add_by_link?link_token=47ag983c-8fcb-4d6d-814b-5395193a712c&amp;qr_code=true">飞书社群</a> ·
  <a href="https://discord.gg/z9aBcQXZQ3">Discord</a>
</p>
<p align="center">
  简体中文 | <a href="README.en.md">English</a>
</p>

> **本仓库是 ZCode 的二开增强版**，基于 [zai-org/ZCode](https://github.com/zai-org/ZCode) 进行二次开发，增加了以下增强功能：

## ✨ 二开增强功能

### 1. 子智能体多模型链支持

- **多模型绑定**：每个子智能体可配置任意数量的备用模型（默认不限制，安全上限 20 个）
- **主模型复用**：模型链开关打开后，主模型沿用表单上方的「模型」字段，链内只配置备用模型
- **拖动排序**：备用模型按列表顺序回退，可拖动行首手柄或使用上移/下移按钮调整优先级
- **独立思考等级**：每个模型可以单独设置思考等级（reasoningLevel）
- **智能回退**：按顺序执行，主模型失败 5 次后自动切换到下一个备用模型
- **主 Agent 兜底**：所有模型都失败时，自动回退到主 Agent 继续执行

**配置示例**（Markdown frontmatter）：

```yaml
---
name: my-agent
description: 我的自定义子智能体
modelChain:
  primary:
    providerId: zai
    modelId: glm-4.6
    reasoningLevel: high
  fallbacks:
    - providerId: openai
      modelId: gpt-5
      reasoningLevel: medium
    - providerId: anthropic
      modelId: claude-4
      reasoningLevel: low
  retryCount: 5
---
```

### 2. 模型自动获取

- **自动获取上游模型列表**：支持从 [OI]、Anthropic、Z.AI 等 Provider 自动获取模型列表
- **能力元数据优先**：`/models` 返回 `context_length`、`max_completion_tokens`、
  `architecture.input_modalities` 等字段时直接采用（严格校验类型，非法值忽略）
- **变体命名识别**：Host 推荐规则表覆盖连字符命名（`gpt-5-6-*`）、`-preview` 后缀、
  `[1m]` 显式声明、`claude-4` / `claude-3.5`、`qwen3-vl-flash` 等变体形态
- **一键添加**：在模型设置页面一键添加获取到的模型

### 3. 对话多处批注

- **在原按钮上扩展**：选中助手输出后点「添加到当前任务」，浮层展开批注输入框；
  点「跳过，直接添加」等价于原来的一键添加，不写批注
- **每条引用可带独立批注**：在输入框里写明这处需要怎么改
- **可连续标记多处**：一轮输出里的多处偏差可以分别批注，最后合并成一条消息发送
- **逐条可编辑**：发送前在输入框的引用列表里可修改或删除任意一条批注

### 4. GitHub Actions 自动同步与发版

- **自动同步上游**：每小时检测上游仓库是否有新提交，有则自动 merge（二开改动由 git 自然保留）
- **自动构建发版**：推送后自动构建安装包（Windows、macOS、Linux）并发版
- **冲突自动通知**：合并冲突时自动创建 Issue 通知

### 5. 自定义更新源与手动检查更新

- **更新源切换**：客户端更新检测源已切换为本仓库的 GitHub Releases
- **手动检查更新**：应用菜单、托盘、帮助菜单均可手动检查，Preview 身份同样可用
- **环境变量覆盖**：支持通过 `ZCODE_UPDATE_FEED_URL` 环境变量自定义更新源

---

## 📦 安装使用

### 方案 1：直接下载安装包（推荐）

**适合用户**：想快速体验二开功能，不想自己构建

从本仓库的 [Releases](https://github.com/li5135580/ZCode/releases/latest) 下载
`ZCode.Preview-<版本>-win-x64.exe` 并安装即可。

该安装包由本仓库的 CI 从二开源码完整构建（不是对官方包打补丁），二开功能已内置：

- 子智能体多模型链
- 模型自动获取
- 更新源指向本仓库 Releases

**说明**：

- 安装包以 **Preview 身份**构建（应用名 `ZCode Preview`、独立数据目录），
  与官方 ZCode 可以并排安装、互不覆盖。
- 安装包**未做代码签名**。Windows 首次运行可能出现 SmartScreen 提示，
  需选择「更多信息 → 仍要运行」；若装有第三方杀毒软件（如火绒），
  首次启动可能因实时扫描较慢，属正常现象。
- **自动更新可用**：更新源指向本仓库 Releases，可从应用菜单、托盘或帮助菜单手动检查。
  安装包的版本号由构建期注入（`<上游版本 patch+1>-fork.N`），保证在 semver 上严格递增，
  因此装过旧包的机器可以正常收到更新。
- **从 3.15.1 旧包升级需手动一次**：旧包的 updater 从未初始化，需下载新包覆盖安装；
  从该版本起自动更新链路才生效。

### 方案 2：从源码构建

**适合用户**：想自定义功能或参与开发

**步骤**：

```bash
# 1. 克隆仓库
git clone https://github.com/li5135580/ZCode.git
cd ZCode

# 2. 安装依赖
pnpm install

# 3. 构建
pnpm build:zcode

# 4. 运行
pnpm dev:desktop
```

> ⚠️ 本地构建对路径敏感：仓库位于**含中文的路径**下时，Node 的 `fs.cpSync` 在 Windows
> 会命中已知 unlink bug（报 "The operation completed successfully" 但实际失败），
> 卡在 `prepare:agent-bundle`。请使用纯 ASCII 路径，或直接依赖 CI 构建。

---

## 原版说明

ZCode 是 AI 编程工作台，提供桌面应用、浏览器界面和终端 Agent。本仓库包含客户端、后端服务、共享 UI，以及 Agent CLI 与运行时源码。

## 更新

- 2026-10-17（fork.3）：模型链布局调整（主模型取上方字段、链内只留备用、支持拖拽排序、
  取消 2 个上限）；模型能力元数据解析 + Host 变体规则修复；恢复手动检查更新并发布 `latest.yml`；
  对话支持多处批注纠偏。
- 2026-10-17：修复「获取模型列表」写错上下文窗口大小（glm-5.3 被误写成 200k，
  实际 1M），并修复上游同步工作流每小时必然失败的问题。
- 2026-10-14：二开增强版发布，添加子智能体多模型链、模型自动获取、GitHub Actions 自动同步等功能。
- 2026-10-10：更新至 ZCode v3.15.1 版本。
- 2026-9-23：更新至 ZCode v3.14.3 版本。

## 初始化

准备 Git、Node.js **24.14.0** 和 pnpm **10.33.2**，版本以 [mise.toml](mise.toml) 为准。以下开发和打包命令均在仓库根目录执行。

```bash
pnpm bootstrap
```

`pnpm bootstrap` 安装 workspace 依赖、准备桌面本地运行资源，再执行 `build:bootstrap`。

Agent CLI 与运行时源码位于 [apps/zcode-cli/](apps/zcode-cli/)，作为普通目录随本仓库一起克隆，无需单独拉取或初始化 Git submodule。

根据需要选择其他初始化或构建入口：

| 命令                           | 用途                                                              |
| ------------------------------ | ----------------------------------------------------------------- |
| `pnpm install`                 | 安装依赖                                                          |
| `pnpm prepare:desktop-runtime` | 准备桌面运行资源，默认包含远程资源准备                            |
| `pnpm prepare:remote-assets`   | 单独准备远程运行资源                                              |
| `pnpm bootstrap:with-remote`   | 初始化依赖、本地与远程资源，并串行构建相关包；跳过桌面应用 bundle |
| `pnpm build`                   | 递归执行各 workspace 包的构建脚本，包括包内的资源准备步骤         |

默认 `bootstrap` 跳过远程资源准备，适合本地桌面开发。使用远程工作区或验证远程发行资源时，再运行对应准备命令。

## 开发与运行

### 桌面版

```bash
pnpm dev:desktop

# 使用测试环境
pnpm dev:desktop:test
```

`pnpm dev:desktop` 默认等同于 `pnpm dev:desktop:prod`，使用生产服务配置。启动脚本会准备本地运行资源、构建桌面 Agent，再启动 Electron 和源码监听。

需要独立开发数据目录时，可设置 `ZCODE_DATA_BASE_DIR`。例如在 macOS / Linux 中：

```bash
ZCODE_DATA_BASE_DIR="$HOME/.zcode-dev-home" pnpm dev:desktop:test
```

### 远程功能（SSH/WSL）

先执行 `pnpm bootstrap:with-remote` 准备远程资源（mock-cdn），再 `pnpm dev:desktop`；连接远程项目时资源选择「本地下载后上传」。开发态资源取自本地 `packages/desktop/mock-cdn` 和本地构建产物，经 SFTP 上传到远程，不访问 CDN。

### Web 开发

修改 Web 或后端源码时，使用开发模式：

```bash
pnpm dev:web

# 指定后端工作区（macOS / Linux）
ZCODE_SERVER_WORKSPACE=/path/to/project pnpm dev:web
```

该命令同时启动 Web 开发服务器（默认 `http://localhost:5173`）和后端（默认 `http://localhost:3030`）；浏览器访问前者。`/ws` 和一般 `/api` 请求代理到本地后端，`/api/v1/oauth/token` 单独代理到当前配置的产品服务。

Agent 源码修改后，执行 `pnpm --filter @zcode/cli... build` 并重启服务。需要验证完整发行包时，按下方“ZCode 命令行版”打包章节解压运行。

### ZCode 命令行版

命令行发行包包含 TUI、Web 和 Agent，统一使用 `zcode` 启动：无参数进入 TUI；第一个参数为 `--web` 时启动 Web；其他参数交给现有 Agent CLI 处理。两种模式都在本机运行，无需 Electron。

```bash
# 默认进入终端交互界面
zcode

# 启动 Web 界面
zcode --web

# 指定项目和端口，不自动打开浏览器
zcode --web --workspace /path/to/project --port 3030 --no-open

# 查看 CLI 或 Web 参数
zcode --help
zcode --web --help
```

Web 模式默认工作目录为当前目录，监听 `127.0.0.1`，默认不启用访问令牌，自动选择空闲端口并打开浏览器。访问终端输出的地址，按 `Ctrl+C` 停止服务。局域网访问可使用 `--host 0.0.0.0`；监听非本机地址时默认生成访问令牌，使用终端输出的带令牌链接。可通过 `--token` 指定令牌或 `--no-token` 关闭令牌认证。

直接启动通用 Web 服务的 HTTP 入口时，通过 `ZCODE_SERVER_AUTH_TOKEN` 配置 API／WebSocket 认证；通过程序接口创建服务时，使用 `authToken` 选项。

构建方式见下方打包章节。`pnpm build:zcode` 只生成发行包，不会替换 `PATH` 中已有的 `zcode`。如果命令仍指向旧安装或其他源码目录，macOS / Linux 可用 `command -v zcode` 检查，Windows 可用 `where.exe zcode` 检查。

### CLI 源码开发

直接开发 TUI 或 Agent 时，运行源码入口：

```bash
pnpm --filter @zcode/cli dev --help
pnpm --filter @zcode/cli dev

# 构建 CLI 及其 workspace 依赖
pnpm --filter @zcode/cli... build
node apps/zcode-cli/packages/cli/dist/zcode.cjs --help
```

这个入口直接运行 Agent CLI，不经过发行包的 `--web` 分流。开发 Web 用 `pnpm dev:web`；验证统一的 `zcode` 命令，用下方解压后的 `bin/zcode.mjs`。

### UI Plugin 开发

参见 [UI Plugin：能力、API 与调试](UI_PLUGIN.md)，从 Excalidraw 的画布协作示例开始，了解插件安装更新、页面 API 和宿主联调入口。

**向 `zcode-plugins` 提交插件 PR 时，必须在 PR 模板中声明是否为 UI Plugin，并填写插件名称。** 判断标准见[提交 PR 时声明插件类型](UI_PLUGIN.md#提交-pr-时声明插件类型)。

## 配置

根目录 [.env.example](.env.example) 提供服务地址与构建配置示例，可按需复制到 `.env`，本地覆盖放入 `.env.local`。Desktop 的开发环境通过 `dev:desktop:test` / `dev:desktop:prod` 选择。

| 配置                                 | 用途                                             |
| ------------------------------------ | ------------------------------------------------ |
| `ZCODE_DATA_BASE_DIR`                | 应用数据基目录，数据写入其下的 `.zcode/`         |
| `ZCODE_SERVER_WORKSPACE`             | Web 后端的工作区路径                             |
| `ZCODE_BUILTIN_PROVIDER_CONFIG_FILE` | 本地 Provider 配置文件路径；未设置时使用内置配置 |
| `ZCODE_DIST_BASE_URL`                | 命令行安装脚本使用的下载根地址                   |

运行时变量可在启动命令的环境中显式设置。随客户端发布的默认配置见 [config/README.md](config/README.md)。

## 打包

第三方声明生成、发行校验流程及声明在发行物中的位置见 [third-party/README.md](third-party/README.md)。

### 桌面版

```bash
pnpm bundle:desktop

# 指定目标平台与 CPU 架构
pnpm bundle:desktop -- --os win --arch x64

pnpm bundle:desktop -- --help
```

默认目标为 macOS arm64，默认输出目录为 `packages/desktop/dist/`。`--os` 支持 `mac`、`win`、`linux`，`--arch` 支持 `x64`、`arm64`；实际打包与签名需要目标平台对应的工具和配置。

安装：双击打开产物 DMG，将 ZCode 拖入"应用程序"。本地构建未签名，首次打开若被 macOS 拦截，执行：

```bash
sudo xattr -rd com.apple.quarantine /Applications/ZCode.app
```

### ZCode 命令行版

构建入口为 `pnpm build:zcode`。脚本会依次构建 CLI/TUI、后端和 Web，收集 TUI 的原生库、worker 与运行时依赖，再组装发行包；运行发行包仍需要 Node.js，版本以 `mise.toml` 为准。

打包前必须设置下载根地址 `ZCODE_DIST_BASE_URL`（可放在 `.env`、`.env.local` 或环境变量中），也可以通过 `--base-url` 传入。以下地址是占位示例，发布时替换为实际托管地址：

```bash
pnpm build:zcode --base-url https://downloads.example.com/zcode/

# 已配置 ZCODE_DIST_BASE_URL 时
pnpm build:zcode

# 仅重新组包，复用已有的 Agent、后端和 Web 构建产物
pnpm build:zcode --skip-build

# 查看版本、输出目录等可选参数
pnpm build:zcode --help
```

默认版本取根目录 `package.json`，输出目录为 `dist/zcode/`：

- `releases/<version>/zcode-<version>.tar.gz`：运行包。
- `releases/<version>/sha256.txt`：校验摘要。
- `latest.json`、`install.sh`：版本索引和安装脚本。

完整目录可上传到配置的下载根地址。安装脚本从该地址下载运行包，默认安装到 `~/.zcode/runtime`，并在 `~/.local/bin` 创建 `zcode` 命令。安装目录可通过 `ZCODE_DIST_HOME` 修改，命令目录可通过 `ZCODE_DIST_BIN_DIR` 修改。

旧 Lite 用户需要改用上述构建命令、环境变量和新的安装脚本。新安装不会删除旧 Lite 目录，也不会迁移或删除已有会话数据。

本地调试打包产物时，可直接解压运行，无需上传或安装：

```bash
zcode_version=$(node -p "require('./dist/zcode/latest.json').version")
mkdir -p dist/zcode/debug
tar -xzf "dist/zcode/releases/$zcode_version/zcode-$zcode_version.tar.gz" \
  -C dist/zcode/debug
# 默认启动 TUI
node dist/zcode/debug/zcode/bin/zcode.mjs

# 启动 Web
node dist/zcode/debug/zcode/bin/zcode.mjs --web \
  --workspace "$PWD" --port 3030 --no-open
```

浏览器打开 `http://127.0.0.1:3030`，即可验证同一后端服务托管 Web 页面和 Agent 的完整链路。该端口需要空闲；如正在运行 `pnpm dev:web`，可改用其他 `--port`。

## 仓库结构

| 目录                                                 | 职责                                       |
| ---------------------------------------------------- | ------------------------------------------ |
| `packages/desktop`                                   | Electron Main、Host、Renderer 与桌面打包   |
| `packages/web`                                       | Web 客户端                                 |
| `packages/server`                                    | HTTP / WebSocket 服务与远程连接            |
| `packages/zcode-server-cli`                          | 独立 Server 启动与进程管理                 |
| `packages/ui`                                        | 共享 React 组件、hooks 与 Zustand 状态     |
| `packages/services`                                  | 业务服务与持久化                           |
| `packages/shared`、`packages/rpc`、`packages/client` | 共享协议和类型、RPC 框架、Agent 客户端 SDK |
| `packages/provider`、`packages/provider-node`        | Provider 公共能力与 Node 实现              |
| `apps/zcode-cli`                                     | Agent CLI、TUI、运行时与工具               |
| `scripts`、`config`、`third-party`                   | 构建维护脚本、内置配置与第三方声明材料     |

## 项目声明

功能与优惠范围、维护规则、执行与数据风险，以及许可和第三方版权说明，详见 [NOTICE.md](NOTICE.md)。

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
- **智能回退**：按顺序执行。单个模型失败后先按 `retryCount`（默认 5，即首次之外再试 5 次）
  重试同一模型，预算用尽才切到下一个备用模型；选型/配置类错误不重试直接切换
- **断线续跑**：切换模型时不从头重来。上一次尝试已完成的工具调用及其结果直接保留，
  未跑完的工具被标记为「未执行」或「副作用未知」；同时给接手模型一条说明，
  告知历史来自上一次尝试、不要默认其推理正确，也不要重做已成功的操作
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
- **已下架清理**：供应商下架模型后，重新「获取模型列表」时弹窗底部会出现「已下架」分区，
  列出个人添加但本次没返回的模型。默认不勾选，需主动勾选再删除。
  只对本次结果全部来自真实 API 的情况开放（内置配置匹配或 Anthropic 硬编码兜底
  一律不展示），避免把用户手调的上下文窗口、输出上限误删

### 3. 对话选区批注

> 该项已在 v4.0.0 转为**上游原生能力**（选区「注释」），本仓库不再单独维护实现。

- **选中即注**：选中助手输出或预览正文后点「注释」，评论可选，留空等价于只引用原文
- **编号对应正文**：多条引用在输入框里带编号，与正文标记一一对应，可点编号回到原文修改
- **删除可撤销**：移除注释后提供撤销入口，误删不用重新选中
- **上限**：一次最多 8 条注释、合计 16000 字符（沿用上游规格）

### 4. 输入框下方的用量状态条

对话输入框外沿常驻一行轻量指标，与上游的后台活动/目标/待办胶囊**共用同一行**（v4.0.0 起合并）：

| 指标 | 含义 | 数据来源 |
| --- | --- | --- |
| 上下文 | 上下文占用百分比 + 进度条 | 会话快照 `usage.contextWindow` |
| 速度 | 当前这一轮的实测生成速率（tok/s） | 逐轮明细 `duration_ms` − `time_to_first_token_ms` |
| 本轮 | 本轮输入 / 输出 tokens，附缓存命中率、耗时、分段数 | 逐轮明细 `turn_usage` |
| 会话 | 本会话累计输入 / 输出、缓存命中率、请求次数 | 会话快照 `usage.cumulative` |
| 子代理 | 运行中 / 已结束的子智能体数量 | 运行时任务注册表 |
| 工具 | 本轮工具调用次数 | 会话快照 |
| 今日 | 当天全应用 token 合计 + 轮次 | 本地用量库 `model_usage` 按日聚合 |

- **速度只信实测值**：测不准（缓冲式 SSE、缺少 TTFT、跨段拼接）一律显示 `—`，
  不用墙钟估算凑数，也不会出现上万的虚高速率
- **图标跟随状态色**：速度与上下文这两项有三档判定（正常/偏高/告警），图标与数值同色；
  缓存命中率没有独立图标，但它的数值同样按三档着色。没有实测值时图标保持中性灰，
  避免「不知道」被读成「很快」
- **七项可独立开关**：设置页可逐项关闭，字号可调（默认 12px），状态条整体居中、窄窗口自动折行
- **完全本地**：只读本地 SQLite，不上传、不联网
- **草稿态不显示**：还没有会话时只留上游状态胶囊，发出第一条消息后自动出现

### 5. 帮助按钮旁的一键重启

- **位置**：标题栏帮助按钮**左侧**的独立图标按钮（带悬浮说明），不在菜单里
- **行为**：完整重启（`prepareAppQuit` → `app.relaunch`），等价于手动退出再打开
- **适用场景**：改设置、换模型、装插件后需要重启才生效时，省去手动退出再启动
- **与「重启以更新」区分**：那个是安装更新包，这个是无条件重启进程

### 6. 更新弹窗直接显示更新说明

- **问题**：上游的更新弹窗是固定高度独立窗口，说明区被弹性布局压成 0，
  更新内容只能靠悬停提示看到
- **现状**：窗口高度新增「有更新说明」档（460px），点开更新按钮即可读到完整说明；
  下载中仍保持紧凑高度（进度条才是那时的主信息）
- **内容来源**：CI 在打包时把 `RELEASE-NOTES.md` 注入各平台更新清单，与 Release 正文同源

### 7. GitHub Actions 自动同步与发版

- **自动同步上游**：每天检测一次上游仓库是否有新提交，有则自动 merge（二开改动由 git 自然保留）。
  冲突涉及非 README 文件时创建 Issue 通知
- **自动构建发版**：推送 tag 后自动构建三平台安装包并发版（Windows / macOS arm64 / Linux）
- **测试门禁**：push/PR 到 main 会跑 `pnpm typecheck` 与工程测试白名单（含本仓库全部二开用例）

> 同步频率曾设为每小时，累计 278 次运行后触发了 GitHub 对 fork 仓库的 Actions 限流，
> 全部工作流被静默停跑。现降为每天一次。

### 8. 自定义更新源与手动检查更新

- **更新源切换**：客户端更新检测源已切换为本仓库的 GitHub Releases
- **手动检查更新**：应用菜单、托盘、帮助菜单均可手动检查，Preview 身份同样可用
- **环境变量覆盖**：支持通过 `ZCODE_UPDATE_FEED_URL` 环境变量自定义更新源

### 9. 其他可靠性修复

- **登录凭证不丢**：安装包内置 `@napi-rs/keyring` 原生二进制，并在打包后强制校验，
  不再出现「升级后掉登录且无法重新登录」
- **跨 provider 思维链隔离**：A 家历史发给 B 家模型时会剔除上一家的 reasoning
  （含 openai-compatible 自定义端点），同 provider 同模型的重试仍完整保留思考
- **远程控制入口版本**：入口上报上游基线版本，避免 fork 的补丁版本号被网关白名单拒绝导致手机端 404

---

## 📦 安装使用

### 方案 1：直接下载安装包（推荐）

**适合用户**：想快速体验二开功能，不想自己构建

从本仓库的 [Releases](https://github.com/li5135580/ZCode/releases/latest) 下载对应平台的安装包：

| 平台 | 产物 | 说明 |
| --- | --- | --- |
| Windows x64 | `ZCode-Preview-<版本>-win-x64.exe` | NSIS 安装包 |
| macOS arm64 | `ZCode-Preview-<版本>-mac-arm64.dmg` | Apple Silicon；未签名，首次打开需手动放行 |
| Linux x64 | `ZCode-Preview-<版本>-linux-x86_64.AppImage` | 免安装，`chmod +x` 后直接运行，也是自动更新的产物格式 |
| Linux x64 | `ZCode-Preview-<版本>-linux-amd64.deb` | Debian/Ubuntu 首次安装用，自动更新仍走 AppImage |

该安装包由本仓库的 CI 从二开源码完整构建（不是对官方包打补丁），二开功能已内置：

- 子智能体多模型链（含断线续跑）
- 模型自动获取 + 已下架清理
- 输入框下方用量状态条（七项指标，与上游状态胶囊同一行）
- 帮助按钮旁的一键重启
- 更新弹窗直接显示更新说明
- 更新源指向本仓库 Releases

**说明**：

- 安装包以 **Preview 身份**构建（应用名 `ZCode Preview`、独立数据目录），
  与官方 ZCode 可以并排安装、互不覆盖。
- 安装包**未做代码签名**。Windows 首次运行可能出现 SmartScreen 提示，
  需选择「更多信息 → 仍要运行」；若装有第三方杀毒软件（如火绒），
  首次启动可能因实时扫描较慢，属正常现象。
- **macOS 只有 arm64**：Intel Mac 已停止出货，未单独出包。产物只做了 ad-hoc 签名
  （Apple Silicon 的硬性要求），没有 Developer ID 签名与公证，首次打开会被 Gatekeeper
  拦截，需右键「打开」或执行
  `xattr -rd com.apple.quarantine "/Applications/ZCode Preview.app"`。
- **Linux 只出 AppImage 与 deb**：rpm / pacman 需要构建机预装额外打包工具，暂未纳入 CI。
- **自动更新可用**：更新源指向本仓库 Releases，可从应用菜单、托盘或帮助菜单手动检查。
  各平台读取各自的更新清单（Windows `latest.yml`、macOS `latest-mac.yml`、
  Linux `latest-linux.yml`）。安装包的版本号由构建期注入（`<上游版本 patch+1>-fork.N`，
  例如 tag `v4.0.0-fork.2` 产出 `4.0.1-fork.2`），同一上游版本内递增序号即构成升级链。
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
>
> ⚠️ **Windows 构建需要 C++ 工具链**：打包要求先编译三个原生 helper
> （`zcode-runtime-host`、`zcode-installer-process-helper`、`zcode-preinstalled-entry-shim`）。
> 有 Visual Studio（含 C++ 工作负载）则用 MSVC；没有则需 CMake + MinGW-w64
> （`x86_64-w64-mingw32-gcc` 在 PATH 上），构建脚本会自动回退到 MinGW 生成器。
> 注意 MinGW 兜底只支持 x64，出 arm64 包仍需 MSVC。
>
> ⚠️ 依赖树与 lockfile 严重不一致时，`pnpm install` 需要重建整个 `node_modules`，
> 非交互终端会直接中止（`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`）。
> 在 CI 或脚本里改用 `CI=true pnpm install --frozen-lockfile --child-concurrency=1`。

---

## 原版说明

ZCode 是 AI 编程工作台，提供桌面应用、浏览器界面和终端 Agent。本仓库包含客户端、后端服务、共享 UI，以及 Agent CLI 与运行时源码。

## 更新

- 2026-11-23：对齐上游 v4.0.0。
- 2026-11-16：对齐上游 v3.18.2。
- 2026-11-03：对齐上游 v3.17.2。
- 2026-10-30：对齐上游 v3.17.1。
- 2026-10-21：对齐上游 v3.16.2；帮助菜单新增「重启 ZCode」；用量状态条的速度只显示实测值
  （测不准显示 `—`），修复此前出现过上万 t/s 的失真。
- 2026-10-19：对齐上游 v3.16.1（含子智能体会话管理、工具检索等上游更新），二开增强功能全部保留；
  仓库版本号与上游保持一致。
- 2026-10-18（fork.6）：新增 macOS（arm64）与 Linux（AppImage + deb）客户端；更新清单按平台选择。
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

CLI 的模型配置、非交互调用、工具与扩展、批量评测和轨迹记录见 [CLI 使用指南](apps/zcode-cli/docs/usage/README.md)。

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

Linux 默认产出 AppImage、deb、rpm、pacman 四种格式。CI 只构建前两种（rpm 需要 `rpmbuild` 与 `xz`，pacman 需要额外工具），可用环境变量收窄：

```bash
# 只出 AppImage 与 deb
ZCODE_LINUX_TARGETS="AppImage,deb" pnpm bundle:desktop -- --os linux --arch x64
```

安装：双击打开产物 DMG，将 ZCode 拖入"应用程序"。本地构建未签名，首次打开若被 macOS 拦截，执行：

```bash
sudo xattr -rd com.apple.quarantine /Applications/ZCode.app
```

未启用正式签名（`ZCODE_ENABLE_MAC_SIGN` 与签名身份）时，arm64 产物会自动使用 ad-hoc 签名 ——
Apple Silicon 的 Mach-O 没有签名会被系统直接终止，所以这一层不能省。

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

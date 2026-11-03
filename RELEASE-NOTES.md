# ZCode 二开增强版（构建标签 `v3.17.2-fork.22`）

## 📦 发布内容

本 Release 包含由本仓库 CI 从二开源码**完整构建**的三平台安装包
（不是对官方包打补丁）。二开功能已内置在安装包内。

| 文件 | 说明 |
|------|------|
| `ZCode-Preview-3.17.2-fork.22-win-x64.exe` | Windows x64 安装包，连接生产后端 |
| `ZCode-Preview-3.17.2-fork.22-win-x64.exe.blockmap` | Windows 差分更新块 |
| `ZCode-Preview-3.17.2-fork.22-mac-arm64.dmg` | macOS Apple Silicon 安装镜像 |
| `ZCode-Preview-3.17.2-fork.22-mac-arm64.zip` | macOS 自动更新用的压缩包 |
| `ZCode-Preview-3.17.2-fork.22-linux-x86_64.AppImage` | Linux x64 免安装包（也是更新产物） |
| `ZCode-Preview-3.17.2-fork.22-linux-amd64.deb` | Debian/Ubuntu 首次安装包 |
| `latest.yml` / `latest-mac.yml` / `latest-linux.yml` | 各平台的 electron-updater 更新元数据 |

> 安装包以 **Preview 身份**构建（应用名 `ZCode Preview`、独立数据目录
> `%LOCALAPPDATA%\Programs\ZCode Preview\`），与官方 ZCode 可并排安装、互不覆盖。

## 🏷️ 版本号规则变更

从本版起，产物版本号**直接沿用上游对齐版本**再加 fork 序号：

| | 本版之前 | 本版起 |
| --- | --- | --- |
| tag | `v3.17.1-fork.21` | `v3.17.2-fork.22` |
| 产物版本 | `3.17.2-fork.21`（上游 patch + 1） | `3.17.2-fork.22`（上游版本 + fork 序号） |

改动的理由是**可读性**：以前看到 `3.17.2-fork.21` 还要心算一次才知道它基于上游
`3.17.1`；现在版本号里的 `3.17.2` 就是上游版本，一眼可读。

有两点必须说明，否则容易踩坑：

1. **不能写成 `3.17.2fork1`**。那不是合法 semver（缺少分隔符），
   electron-builder 在打包阶段就会拒绝，electron-updater 也无法比较大小。
   合法且直观的形式是 `3.17.2-fork.22`。
2. **fork 序号没有重置为 1**。`3.17.2-fork.1` 在 semver 里**小于**已安装的
   `3.17.2-fork.21`，老用户会收不到这次更新。序号继续递增才能保证升级链不断。

升级链验证：`3.17.2-fork.22 > 3.17.2-fork.21`（同基底、序号更高），
上游下一版 `3.17.3-fork.N` 天然大于本版。该规则有单测覆盖
（`packages/desktop/test/forkReleaseVersion.test.ts`）。

## 🔄 本版对齐上游 v3.17.2

上游从 v3.17.1 推进到 v3.17.2，涉及 **203 个文件**（+9633 / −1470），
是二开对齐历史上最小的一次，合并冲突只有 2 处（两个 README 的更新记录列表）。

上游本版主要变化：

- **插件**：新增官方 ZCode Sites 插件（一键部署网站）、插件管理支持一键全部更新、
  新增 MCP 配置界面（草稿版）、插件命令在 Windows 上的路径问题修复。
- **模型**：新增 Kimi K3.1 Pro、MiniMax M3.1 Flash 等模型配置项。
- **对话**：长对话流式回复卡顿明显减少、图片预览支持标注后作为附件发送、
  产物卡片不再偶尔不刷新、无进展的重复执行会自动结束。
- **会话与数据**：文档查看器按会话隔离、修复会话切换时的归属串号、
  配置文件损坏时不再被覆盖、父子技能一起同步。
- **远程**：远程设备改为紧凑可搜索列表、支持停止/重启远端服务、设置页统一远程数据同步。
- **安全**：计划模式不再放行高风险操作、子任务权限与主会话一致、
  收紧本地网页预览的可访问范围、MCP 设置检测权限仅限已注册工作区、
  自定义命令中的脚本需权限确认后执行。
- **桌面端**：托盘不再显示未读红点（未读仍可在任务栏查看）、
  Windows 窗口被遮挡后恢复显示、安装包体积明显减小、
  修复 Windows 64 位安装包可能混入不兼容组件的问题。

**二开能力全部保留**并经校验：输入框下方 token 用量状态条、帮助菜单「重启 ZCode」、
远程控制入口的 `ZCODE_UPSTREAM_VERSION`、「已下架」模型清理、
更新弹窗说明区高度档、`ZCODE_CODE_SIGNING_ENABLED` 签名开关、
Windows `tar --force-local` 解压修复、`react-scan>esbuild` override、两套 CI 工作流。

## 🧪 本版修复：二开单测此前整体失效

这个问题比它看起来严重：二开自带的 21 个测试文件**写了但从来没被执行过**。

三个原因叠加：

1. 上游 v3.17.1 起 App 业务单测退役，改为 `scripts/engineering-test-files.json`
   白名单制，二开的测试文件全部落在白名单之外，`pnpm test:engineering` 不会跑它们。
2. 上游同时删掉了 `@testing-library/react` 依赖，导致用量状态条与「已下架」清理
   这两个组件测试**连加载都失败**。
3. CI 里本来就没有任何单测任务——`build-release.yml` 只做构建打包。

结果就是：二开最核心的两块 UI（token 用量状态条、已下架模型清理）在渲染层完全没有
自动化保护，上游一改 composer 布局就可能悄悄失效而无人察觉。

本版处理：

- 加回 `@testing-library/react@16` 与 `@testing-library/dom`（lockfile 仅新增这两个条目）。
- 21 个二开测试文件全部纳入白名单（158 → **179** 条）。
- 新增 `.github/workflows/tests.yml`：push/PR 到 main 时跑 `pnpm typecheck`
  与 `pnpm test:engineering`，用的是与发版相同的一套 pnpm 10 + frozen lockfile。

顺带修了三处二开自己的陈旧断言（都非本次对齐引入）：

- `desktopProductIdentity`：二开脚本新增了 `artifactProductName` 字段，期望对象未同步。
- `modelFetcherService`：moonshot 模板规则已含 Kimi K3.1 Pro 两款，期望列表仍是旧的 6 项。
- `subagentsModelChainMounting`：`modelSelectionLoading` 已改为三态 `modelCatalogStatus`。

## ⚠️ 已知限制

- **无代码签名**：Windows 安装包会触发 SmartScreen 提示（可选「仍要运行」）；
  自动更新在安装前跳过 Authenticode 校验（`ZCODE_CODE_SIGNING_ENABLED` 控制），
  有证书的构建仍保持上游强校验。
- **本地 Windows 跑全量工程测试会有环境性失败**：测试用例自身用 `tar -czf C:/...`
  造包（缺 `--force-local`）、资源文件 CRLF 校验和、`--import=<Windows 路径>` 等，
  与产品代码无关；CI 在 Linux 上执行不受影响。

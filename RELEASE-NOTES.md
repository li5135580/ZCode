# ZCode 二开增强版（构建标签 `v3.16.1-fork.14`）

## 📦 发布内容

本 Release 包含由本仓库 CI 从二开源码**完整构建**的三平台安装包
（不是对官方包打补丁）。二开功能已内置在安装包内。

| 文件 | 说明 |
|------|------|
| `ZCode-Preview-3.16.2-fork.14-win-x64.exe` | Windows x64 安装包，连接生产后端 |
| `ZCode-Preview-3.16.2-fork.14-win-x64.exe.blockmap` | Windows 差分更新块 |
| `ZCode-Preview-3.16.2-fork.14-mac-arm64.dmg` | macOS Apple Silicon 安装镜像 |
| `ZCode-Preview-3.16.2-fork.14-mac-arm64.zip` | macOS 自动更新用的压缩包 |
| `ZCode-Preview-3.16.2-fork.14-linux-x86_64.AppImage` | Linux x64 免安装包（也是更新产物） |
| `ZCode-Preview-3.16.2-fork.14-linux-amd64.deb` | Debian/Ubuntu 首次安装包 |
| `latest.yml` / `latest-mac.yml` / `latest-linux.yml` | 各平台的 electron-updater 更新元数据 |

> 产物版本号 `3.16.2-fork.14` 由**构建期注入**（`scripts/ci/fork-release-version.mjs`）：
> 取 tag 的 base 版本 patch + 1，保留 fork 序号。仓库 `package.json` 与上游对齐为 `3.16.1`，
> 但按 semver `3.16.2-fork.14 > 3.16.1`，因此 electron-updater 能正确识别更新。
>
> 安装包以 **Preview 身份**构建（应用名 `ZCode Preview`、独立数据目录
> `%LOCALAPPDATA%\Programs\ZCode Preview\`），与官方 ZCode 可并排安装、互不覆盖。

## 🎨 本版优化：用量状态条信息密度

上一版状态条已能看到七项指标，但关键数字仍藏在悬停提示里，条面本身也偏挤。
本版把信息直接铺到主条面，并按反馈调整了排版：

1. **缓存命中直接显示**：本轮和会话累计都增加「缓存 XX%」，不再需要悬停。
   颜色按命中率分档（低于 20% 偏红、20–50% 偏黄、更高为绿）；0% 保持中性色，
   因为部分模型/供应商本就不上报缓存，不该被读成「命中很差」。
2. **悬停信息上条面**：本轮直接显示 `↑输入 ↓输出 缓存% 生成耗时`；会话累计直接显示
   `↑输入 ↓输出 缓存% 请求次数`；上下文直接显示 `百分比 已用/上限`；今日直接显示
   `token 轮次数`；子智能体直接显示 `运行数 结束数`。悬停提示保留，作为更完整的口径说明。
3. **整体居中**：所有指标在输入框下方水平居中，宽度不足时自动折行，不再被裁切；
   设置入口跟随居中流排布，不再固定在右侧。
4. **默认字号 12px**：比上一版的 14px 更紧凑；设置面板新增 10/11/12/13/14 五档可调，
   图标随字号等比缩放。
5. **速度占位更准确**：刚重启客户端、还没产生任何请求时仍显示 `—`（这是正常状态）。
   如果只是最新一段请求缺首字延迟，会沿用前一段的有效速率，或用本轮累计
   `输出 ÷ 生成耗时` 兜底，不再整轮显示 `—`。

## 🆕 输入框下方的用量状态条

对话输入框下方常驻一行轻量指标，无需打开设置页即可看到消耗：

| 指标 | 含义 | 默认 |
| --- | --- | --- |
| 上下文 | 进度条 + 百分比 + 已用/上限，按 50%/75% 分三档色 | 开 |
| 生成速度 | 最近一次完成请求的 tok/s，按快慢着色 | 开 |
| 本轮 | 输入/输出/缓存命中/生成耗时/段数 | 开 |
| 会话累计 | 输入/输出/缓存命中/请求次数 | 开 |
| 工具调用 | 今日工具调用次数 | 关 |
| 今日合计 | 当天全应用 token 合计 + 轮次数 | 开 |
| 子智能体 | 运行中/已结束数量 + 状态点（阻塞转黄、运行转绿） | 关 |

点 ⚙ 可逐项开关、调整字号、指定上下文窗口容量（留空跟随模型配置）、
切换中文万/亿单位。数据只读本地数据库，不上传；每轮结束时刷新一次，运行中不轮询。

会话因上下文超限被拒时，状态条会直接标红提示，并建议压缩或新开会话。

> 产物文件名从 fork.12 起改为不含空格的 `ZCode-Preview-*`。此前 `ZCode.Preview-*` 的写法会让
> GitHub 资产名被替换成点号，并触发发布动作的资产 label 恢复逻辑，导致 Release 卡在草稿态。

## 🔄 本版对齐上游 v3.16.1

上游从 v3.15.1 推进到 v3.16.1，涉及 4502 个文件。本版已完整对齐，二开增强功能全部保留：

- 子智能体多模型链（含上游新增的草稿作用域字段）
- 对话多处批注（批注能力与上游的 `draftScopeKey` 合并）
- 模型自动获取与内置规则表（以上游规则为基底，追加二开独有的 5 条变体规则）
- 手动检查更新（按构建期开关判定，不随产品身份隐藏）

## ✨ 增强功能


### 1. 子智能体多模型链

- 每个子智能体可配置任意数量的备用模型（产品上不限制，schema 保留 20 个安全上限）
- 模型链开启后，主模型沿用表单上方的「模型」字段，链内只配置备用模型
- 备用模型按列表顺序回退，可拖动行首手柄或使用上移/下移按钮调整优先级
- 每个模型可单独设置思考等级（reasoningLevel）
- 主模型失败 `retryCount` 次后切换到下一个备用模型；全部失败时回退主 Agent

### 2. 模型自动获取

- 支持从 [OI] 兼容、Anthropic、Z.AI 等 Provider 自动获取模型列表
- `/models` 返回 `context_length`、`max_completion_tokens`、`architecture.input_modalities`
  时直接采用（严格校验类型，非法值忽略）
- Host 规则表覆盖连字符命名（`gpt-5-6-*`）、`-preview` 后缀、`[1m]` 显式声明、
  `claude-4` / `claude-3.5`、`qwen3-vl-flash` 等变体
- 模型设置页一键添加获取到的模型

### 3. 对话多处批注

- 选中助手输出后可点「添加批注」，写明这处需要怎么改
- 一轮输出里的多处偏差可分别批注，最后合并成一条消息发送
- 发送前可在输入框的引用列表里逐条编辑或删除批注
- 引用条数上限 20 条、总量 32,000 字符

### 4. 手动检查更新

- 应用菜单、托盘、帮助菜单均可手动检查更新（Preview 身份同样可用）
- 更新源指向本仓库的 GitHub Releases，支持 `ZCODE_UPDATE_FEED_URL` 覆盖
- 支持自动下载与安装（设置页可开关）

### 5. GitHub Actions 自动同步与发版

- 每小时检测上游是否有新提交，有则自动 merge（二开改动由 git 自然保留）
- 打 `v*` tag 自动构建 Windows / macOS / Linux 三平台产物、生成各平台更新清单并创建 Release
- 合并冲突时自动创建 Issue 通知

## 🐛 本版修复

### 补齐 macOS 与 Linux 客户端

此前 CI 矩阵只构建 Windows。本版补回 macOS（arm64，`.dmg` + `.zip`）与
Linux（x64，`.AppImage` + `.deb`），并让更新清单按平台选择
（`latest.yml` / `latest-mac.yml` / `latest-linux.yml`）。

macOS 产物只做 ad-hoc 签名（Apple Silicon 的硬性要求），没有 Developer ID 签名与公证，
首次打开会被 Gatekeeper 拦截，需右键「打开」或清除 quarantine 属性。
Linux 上 electron-updater 只认 AppImage 作为更新产物，deb 仅用于首次安装。

### 变体模型参数识别错误

按模型 ID 的 Host 规则存在漏匹配与覆盖顺序问题：

- `[1m]` 显式后缀规则原本排在数组第 2 位，被后续更泛的模型规则覆盖
  （`glm-4.5[1m]` 只得到 131072、`glm-4.6[1m]` 只得到 200000）
- `gpt-5-6-sol`（连字符）只命中兜底，得到 200k / 32k / 纯文本
- `gpt-5.4-preview`、`qwen3.7-max-preview` 整条漏匹配
- `claude-4-*` / `claude-3.5-*` 退化为 200k / 32k / 纯文本（而 Anthropic 内置兜底列表正是这些 ID）
- `qwen3-vl-flash` 被当成纯文本模型

修复后对应得到 1M 上下文、105 万上下文、128k 输出、图像/PDF 输入等正确参数。

### 手动更新入口消失

Preview 身份被 `ZCODE_PRODUCT_FLAVOR === "production"` 挡掉了所有检查更新入口。
现在改由构建期 `ZCODE_AUTO_UPDATE` 决定，并在 CI 中产出 `latest.yml`。

顺带修正 `latest.yml` 的资产 URL：`artifactName` 含空格（`ZCode Preview`），
GitHub 上传时替换为点号，不归一化会导致客户端下载 404。

## 🚀 使用方法

1. 从 [Releases](https://github.com/li5135580/ZCode/releases/latest) 下载对应平台的安装包
2. 安装并启动 `ZCode Preview`，在设置页配置 Provider 与模型

| 平台 | 安装方式 |
|------|----------|
| Windows x64 | 运行 `ZCode-Preview-<版本>-win-x64.exe`（会覆盖同 appId 的旧版） |
| macOS arm64 | 打开 `.dmg`，将 `ZCode Preview` 拖入「应用程序」 |
| Linux x64 | AppImage：`chmod +x` 后直接运行；deb：`sudo dpkg -i` |

安装包与官方 ZCode 并存，不需要卸载官方版本。

## ⚠️ 注意事项

1. **未签名**：安装包未做代码签名。Windows 首次运行可能出现 SmartScreen 提示，
   需选择「更多信息 → 仍要运行」。
2. **macOS 首次打开需放行**：产物只做 ad-hoc 签名（Apple Silicon 的硬性要求），
   没有 Developer ID 签名与公证，Gatekeeper 会拦截。右键「打开」，或执行
   `xattr -rd com.apple.quarantine "/Applications/ZCode Preview.app"`。
3. **macOS 只有 arm64**：Intel Mac 未单独出包。
4. **Linux 更新按安装方式分流**：`latest-linux.yml` 同时列出 AppImage 与 deb。
   AppImage 安装的机器由 `AppImageUpdater` 更新（替换 AppImage 文件）；
   deb 安装的机器由 `DebUpdater` 更新（下载 deb 后走 `dpkg -i`）。
   两者都要求系统存在对应命令，且 deb 更新需要提权。
5. **首次启动可能较慢**：若装有第三方杀毒软件（如火绒），首次启动会因实时扫描
   新落盘的文件而变慢，属正常现象。
6. **旧版需手动升级一次**：装过 `3.15.1` 旧包的机器，旧包的 updater 从未初始化，
   需手动下载本版覆盖安装；从本版起自动更新链路才生效。
7. **与官方版共享数据目录**：Preview 与官方版共用 `~/.zcode/v2/`（日志、设置），
   排查日志时需按进程区分。
8. **只保留最近两个 Release**：更早的 Release 会在新版本发布后自动清理，
   需要旧版本请从对应 tag 重新构建。tag 本身保留。

## 📖 详细文档

- [二开功能与安装说明](https://github.com/li5135580/ZCode/blob/main/README.md)
- [更新日志](https://github.com/li5135580/ZCode/blob/main/CHANGELOG.md)

## 🐛 问题反馈

如遇到问题，请在 [GitHub Issues](https://github.com/li5135580/ZCode/issues) 提交反馈。

## 📄 许可证

本项目基于 MIT 许可证发布。

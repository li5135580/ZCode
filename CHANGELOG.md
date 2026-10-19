# Changelog

本文件记录 ZCode 二开增强版的所有重要变更。

## [二开 fork.8] - 2026-10-19

> 构建标签 `v3.16.1-fork.8`，安装包版本 `3.16.2-fork.8`。

### 新增：输入框下方的 token 用量状态条

把插件式悬浮层（`zcode-token-usage-statusbar` 靠改 `app.asar` 注入）的能力做成二开原生实现。
输入框下方常驻一行指标，显示今日合计、本轮 tok/s、上下文占用、本会话累计。

- **刷新策略**：今日合计只在轮次结束时重查一次，运行中不轮询——用量是已完成请求的聚合，
  运行中反复查询拿不到新数据，只会增加 IPC 与 SQLite 读取
- **速率口径**：会话累计输出增量 ÷ 轮次耗时，与设置页 debug 面板一致；
  用累计增量而非单次请求用量，是为了让子智能体、重试等旁路输出也计入
- **今日数据**：接口只支持 all/7d/30d，没有 today；直接取 7 日快照里当日那一格，
  不新增协议参数
- **可选依赖**：用 `useOptionalServices` 而非 `useServices`。composer 在无 ServiceProvider
  的宿主（单测、纯展示）里不能因为状态条而崩，缺服务时状态条自动隐藏
- **草稿态不显示**：还没有会话时视觉焦点保持在输入框上

顺带启用协议里一直未被 UI 使用的 `usage.cumulative` 字段。

### 修复：Release 卡在 draft

`softprops/action-gh-release` 在每次上传资产后都会尝试"恢复资产 label"，把文件名改回带空格的
原名（`ZCode Preview-...`）。GitHub 已不再接受 label 字段写入，接口返回 404，导致资产全部
上传成功、Release 却停在草稿态。

根因是产物名含空格。改为 `ZCode-Preview-*`（新增 `artifactProductName` 字段）后，
资产名不再被改写，label 恢复逻辑也不会被触发。`overwrite_files: false` 解决不了这个问题——
label 恢复与覆盖行为无关。

## [二开 fork.7] - 2026-10-19

> 构建标签 `v3.16.1-fork.7`，安装包版本 `3.16.2-fork.7`。
> 仓库 `package.json` 版本与上游保持一致（`3.16.1`）。

### 对齐上游 v3.16.1

上游从 `aac47556`（v3.15.1）推进到 `0a1fc56d`（v3.16.1），4502 个文件变更。
二开增强功能全部保留，并按上游的新结构做了适配：

- **子智能体多模型链**：`SubagentsSection` / `SubagentModelChainEditor` 与上游的
  `draftScopeKey` 等新字段合并，模型链行为不变。
- **对话多处批注**：`ConversationComposer` 合并上游新增的 `draftScopeKey` 参数，
  `useConversationSelectionReferences` 同时保留上游的草稿作用域与本地的
  `updateReferenceComment` 能力。
- **模型自动获取**：`test-ids` 在上游从主 barrel 移到了子路径导出
  （`@zcode/shared/test-ids`），`FetchModelsButton` 的导入同步调整。
- **手动检查更新**：`shouldShowDesktopUpdateEntry` 仍按构建期 `ZCODE_AUTO_UPDATE` 判定，
  对应测试的 mock 从产品身份改为构建期开关。

### 内置模型规则：以上游为基底

上游把规则正则统一简化成 `.*xxx.*` 并重排了兜底规则，多数变体（`-preview`、`flashx`、
`gpt-5.4-preview`）因此被上游自己修好了。本次合并改为**以上游规则表为基底**，
只在其末尾追加二开独有的 5 条覆盖规则（解析是数组顺序 overlay，后写覆盖先写）：

| 规则 | 作用 |
| --- | --- |
| `.*gpt-5[.-]6...` | 连字符写法 `gpt-5-6` / `gpt-5-6-sol` |
| `.*claude-(?:4\|3\.5)...` | `claude-4-*` / `claude-3.5-*` |
| `.*grok-4[.-]7.*` | `grok-4.7` / `grok-4-7` |
| `.*qwen3-vl-(?:plus\|flash).*` | 上游只有 `plus`，补上 `flash` |
| `.*\[1m\]` | 显式声明 1M 上下文（上游已移除该规则） |

`revision` 33 → 34。上游新增的 `mimo-v2.6`、`kimi-k3`、`deepseek-v4` 等模型事实全部继承；
兜底规则采用上游的新值（1M 上下文 / 128K 输出）。

> 已知边界：官方若下发 `revision > 34` 的内置配置，会覆盖本次补充的规则。

### 兼容性修复

- 上游新增 `architecture:check` 的 `missing-module-artifact` 规则要求
  `packages/services/src/gen-ui/contract.test.ts`，而该文件上游自身也没有提供。
  这是上游遗留问题（`architecture-policy.yaml` 在 v3.15.1 就已引入），不影响构建。

## [二开 fork.6] - 2026-10-18

> 构建标签 `v3.15.1-fork.6`，安装包版本 `3.15.2-fork.6`。

### 新增：macOS 与 Linux 客户端

此前 CI 矩阵只构建 Windows（`6553cc88` 曾显式注释掉另外两个平台）。本版补回：

| 平台 | 产物 |
| --- | --- |
| Windows x64 | `ZCode-Preview-<版本>-win-x64.exe` |
| macOS arm64 | `.dmg` + `.zip` |
| Linux x64 | `.AppImage` + `.deb` |

macOS 只出 arm64：Intel Mac 已停止出货，单独维护 x64 产物的收益低于构建成本。
Linux 只出 AppImage 与 deb：rpm 需要构建机预装 `rpmbuild` 与 `xz`，pacman 也需要额外
工具，对分发验证场景是不必要的构建面。Linux 打包目标可通过 `ZCODE_LINUX_TARGETS`
收窄，默认仍保持全量格式。

### 修复：更新清单按平台选择

更新源此前硬编码 Windows 的 `latest.yml`，macOS/Linux 客户端会读到 Windows 清单并
下载到错误的安装包。现在按运行平台推导：

- Windows → `latest.yml`
- macOS → `latest-mac.yml`
- Linux → `latest-linux.yml`（arm64 为 `latest-linux-arm64.yml`）

`scripts/ci/normalize-latest-yml.mjs` 增加 `--file` 参数，CI 按矩阵选择要归一化的清单；
Linux 任务额外校验清单指向 `.AppImage`，因为 electron-updater 在 Linux 上只认 AppImage
作为更新产物，deb 仅用于首次安装。

### 修复：macOS arm64 未签名产物无法启动

`mac.identity` 在未启用正式签名时被置为 `null`，而 electron-builder 遇到 `identity: null`
会在 ad-hoc 回退之前直接跳过签名阶段。Apple Silicon 拒绝加载无签名的 Mach-O，
产出的 `.app` 会被系统直接终止。现在 arm64 在未签名构建下显式使用 ad-hoc 身份 `-`，
x64 仍跳过签名（Intel 无此硬性约束）。

### 修复：构建健壮性

- `resources/macos-window-bounds/zcode-window-bounds` 缺失时（构建机无 `swiftc`）
  跳过 extraResources 拷贝，避免 electron-builder 因源文件不存在而失败。
- `node-pty` 在非 Windows 平台的 `electron-rebuild` 失败时，若存在可用预编译产物
  （macOS 自带 `prebuilds/darwin-*`，Linux 来自 `@lydell/node-pty-linux-*`）则降级继续，
  避免 CI runner 缺编译链时 `pnpm install` 整体中断。

### 发版策略：只保留最近两个 Release

Release 创建后自动清理更早的条目（`gh release delete`），只保留最近两个。
`releases/latest/download/*` 始终指向最新版，旧条目没有实际用途，只占仓库空间。
**tag 不删**，保留可回溯的构建点。

## [二开 fork.5] - 2026-10-17

> 构建标签 `v3.15.1-fork.5`，安装包版本 `3.15.2-fork.5`。

### 修复与改进

#### 批注并入「添加到当前任务」按钮

原先批注是独立的一个「添加批注」按钮，与官方原有的「添加到当前任务」并列。现在改为
在官方按钮上扩展：

- 点「添加到当前任务」→ 原浮层位置展开批注输入框
- 框内两个动作：「跳过，直接添加」（等价于原来的一键添加，不写批注）与
  「添加到当前任务」（带批注提交）
- 不再多出一个并列按钮，选区浮层保持官方的两个动作结构

#### 修复 grok-4.7 参数识别

规则表此前只有 `grok-4.3` / `grok-4.6` / `grok-build-0.1`，`grok-4.7` 落到兜底规则 `.*`，
被识别成 200K 上下文 / 32K 输出 / 纯文本 / 仅 disabled+enabled 两档推理。

按 grok-4.6 同代规格补齐：500K 上下文、128K 输出、支持图像、
推理档位 low/medium/high/xhigh。正则同时接受点号与连字符写法（`grok-4.7` 与 `grok-4-7`）。
随包配置 `revision` 31 → 32，避免被官方下发的同 revision 配置覆盖。

> 已知边界：官方若下发 `revision > 32` 的内置配置，会覆盖本次补充的规则。

## [二开 fork.3] - 2026-10-17

> 构建标签 `v3.15.1-fork.3`。仓库 `package.json` 仍与上游对齐（`3.15.1`），
> 构建期注入 `3.15.2-fork.3` 作为安装包版本（见 `scripts/ci/fork-release-version.mjs`）。

### 修复与改进

#### 子智能体模型链

- **不再重复显示主模型**：模型链开关打开后，主模型沿用表单上方的「模型」字段，
  链内只保留「备用模型 + 失败重试次数」。持久化格式不变。
- **备用模型支持拖拽排序**：行首手柄可拖动调整回退优先级，另提供键盘可达的上移/下移按钮。
- **备用模型数量不再固定为 2 个**：产品上不限制，schema 保留 20 个安全上限防止配置无限膨胀。

#### 模型自动获取

- **解析 `/models` 返回的能力元数据**：`context_length`、`max_completion_tokens`、
  `architecture.input_modalities` 等字段按存在性取值并严格校验类型；端点只返回 `id`
  时行为不变（仍由 Host 推荐规则表解析）。
- **修复 Host 规则漏匹配与覆盖顺序**：
  - `[1m]` 显式后缀规则移到数组末尾，不再被更泛的模型规则覆盖
    （此前 `glm-4.5[1m]` 只得到 131072、`glm-4.6[1m]` 只得到 200000）
  - `gpt-5.6` 同时接受连字符写法（`gpt-5-6-sol` 此前只命中兜底 200k/32k/纯文本）
  - 日期型尾部接受 `-preview`（`gpt-5.4-preview`、`qwen3.7-max-preview` 此前整条漏匹配）
  - `glm-5.3-flashx` 复用 flash 的多模态能力
  - 补 `claude-4` / `claude-3.5` 规则（此前退化为 200k/32k/纯文本）
  - `qwen3-vl-flash` 复用 vl-plus 的视觉能力

#### 手动检查更新

- **Preview 身份恢复「检查更新」入口**（应用菜单、托盘、帮助菜单、命令分发），
  改由构建期 `ZCODE_AUTO_UPDATE` 开关决定，不再被产品身份挡住。
- **CI 产出并上传 `latest.yml` / `*.blockmap`**，客户端可据此发现新版本。
- **构建期注入 fork 版本**：tag `v3.15.1-fork.3` 推导为 `3.15.2-fork.3`
  （patch + 1，保留 fork 序号），保证在 semver 上严格大于已安装版本；
  仓库 `package.json` 仍与上游对齐。
- 顺带修正 `latest.yml` 里的资产 URL：`artifactName` 含空格，GitHub 上传后会替换为点号，
  不归一化会导致客户端下载 404。

#### 对话多处批注

- **每条引用可带独立批注**：`conversationQuote` 新增可选 `comment`（单条上限 2,000 字）。
- **选区浮层内联写批注**：选中文本后可点「添加批注」，在浮层里填写后加入待发送列表；
  可连续标记多处，不填批注时等价于一键添加。
- **Composer 内可逐条编辑批注**，发送时合并为一条消息进入模型上下文。
- 引用条数上限 8 → 20，总量 16,000 → 32,000 字符。

## [二开 2026-10-17] - 2026-10-17

> `package.json` 的版本号始终与上游对齐（当前 `3.15.1`），不再由二开自行提升，
> 以免上游同步时产生版本号冲突。fork 自己的构建用 tag 区分（`v3.15.1-fork.N`）。

### 修复

- **模型自动获取写错上下文窗口大小**：`inferModelParameters` 按模型 ID 的本地推断表
  存在子串误判——`glm-5` 分支排在 `glm-5.2` 之后，`glm-5.3` 含 "glm-5" 即命中，
  被猜成 200000。这个猜测值会作为个人覆盖写入，反而盖住 Host 推荐规则表
  （`config/provider/zcode-builtin.json` 中 `glm-5.3` = 1000000）的正确基线，
  表现为「上游支持 1M、获取出来却是 200k」。现在只落地上游 API 确实返回过的字段，
  缺省字段交回 Host 的 `ModelConfigRules.resolve` 按 `modelMatch` 解析；
  同时移除 `inferModelParameters`，避免本地同义表随上游发版静默漂移。
- **上游同步工作流每小时必然失败**：`has_updates` 直接比较 `upstream/main` 与 `HEAD`
  的 tip，而 fork 的 `main` 永远比上游多出二开提交，于是每小时都判定「有更新」；
  判定有更新后又对 `patches/0NN-*.patch` 执行 `git apply`，而那些改动早已是 `main`
  上的普通提交，apply 必然报 `already exists` / `does not apply`。现在改用
  `git rev-list --count HEAD..upstream/main` 判断上游是否真的前进，并去掉补丁重放。

### 变更

- 移除 `patches/001-subagent-model-chain.patch`、`patches/002-update-source-fix.patch`
  两个二开内容快照（它们没有任何构建配置引用，只被上述已修复的同步步骤使用）。
  `patches/` 目录现在只存放 pnpm `patchedDependencies` 的依赖补丁，说明见 `patches/README.md`。

## [二开首个构建（构建标签 v3.15.2，已撤回）] - 2026-10-14

> 该构建的 Release 与 `v3.15.2` 标签已被撤回（其中的安装包存在「获取模型列表写错
> 上下文窗口大小」的缺陷）。此处保留记录以便追溯二开功能的引入时间。

### 新增功能

#### 子智能体多模型链支持
- 支持每个子智能体绑定最多 3 个模型（1 个主模型 + 2 个备用模型）
- 每个模型可以单独设置思考等级（reasoningLevel）
- 按顺序执行，主模型失败 5 次后自动切换到备用模型
- 所有模型都失败时，自动回退到主 Agent 继续执行
- 向后兼容单模型配置

#### 模型自动获取
- 支持从 OpenAI、Anthropic、Z.AI 等 Provider 自动获取模型列表
- 自动识别模型的 contextWindow、maxOutputTokens、reasoningLevel 等参数
- 在模型设置页面添加"获取模型列表"按钮
- 一键添加获取到的模型

#### GitHub Actions 自动同步与发版
- 每小时检测上游仓库更新
- 自动合并上游代码并应用二开补丁
- 合并冲突时自动创建 Issue 通知
- 推送后自动构建多平台安装包（Windows、macOS、Linux）
- 自动创建 GitHub Release

#### 自定义更新源
- 客户端更新检测源切换为 GitHub Releases
- 支持通过 `ZCODE_UPDATE_FEED_URL` 环境变量自定义更新源
- 修复更新源下载 URL 解析问题

### 技术改进

#### 数据模型
- 新增 `SubagentModelChain` 接口和 Zod schema
- 扩展 `AgentProfile` 支持 `modelChain` 字段
- 新增模型链 Markdown 解析器和序列化器

#### 运行时
- 新增 `model-chain-executor.ts` 模型链执行器
- 新增 `model-chain-failure-detector.ts` 失败判定器
- 修改 `runner.ts` 集成模型链执行逻辑
- 支持多种失败类型识别（API 错误、超时、内容审核等）

#### UI
- 新增 `SubagentModelChainEditor` 模型链编辑器组件
- 新增 `SubagentModelChainBadge` 模型链徽标组件
- 新增 `FetchModelsButton` 获取模型按钮组件
- 添加中英文案支持

#### 存储
- 扩展 frontmatter 解析器支持嵌套对象
- 支持 `modelChain` 字段的解析和序列化
- 修复 frontmatter 嵌套解析问题

### 修复

- 修复 `retryCount` 整数校验问题
- 修复 `fetchBuiltinModels` TODO 存根
- 修复 UI 包 TS2694 错误（React 19 兼容性）
- 修复更新源下载 URL 解析问题

### 文档

- 更新 README.md 和 README.en.md 添加二开功能说明
- 新增 CHANGELOG.md 记录变更
- 新增 patches/README.md 补丁管理说明

## [3.15.1] - 2026-10-10

- 更新至 ZCode v3.15.1 版本

## [3.14.3] - 2026-9-23

- 更新至 ZCode v3.14.3 版本

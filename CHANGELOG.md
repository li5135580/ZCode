# Changelog

本文件记录 ZCode 二开增强版的所有重要变更。

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

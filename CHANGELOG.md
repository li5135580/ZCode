# Changelog

本文件记录 ZCode 二开增强版的所有重要变更。

## [3.15.3] - 2026-10-17

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
- 版本号从 `3.15.1` 提升到 `3.15.3`，使构建产物名（`ZCode.Preview-<version>-win-x64.exe`）
  与已发布的旧包区分开。

## [3.15.2] - 2026-10-14

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

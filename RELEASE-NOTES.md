# ZCode 二开增强版 v3.15.3

## 📦 发布内容

本 Release 包含由本仓库 CI 从二开源码**完整构建**的 Windows 安装包
（不是对官方包打补丁）。二开功能已内置在安装包内。

| 文件 | 说明 | 后端 |
|------|------|------|
| `ZCode.Preview-3.15.1-win-x64.exe` | 生产后端，无后缀 | production |
| `ZCode.Preview-3.15.1-win-x64_TEST.exe` | 测试后端 | test |

> 产物文件名中的版本号取自构建时的 `package.json`。安装包以 **Preview 身份**构建
> （应用名 `ZCode Preview`、独立数据目录 `%LOCALAPPDATA%\Programs\ZCode Preview\`），
> 与官方 ZCode 可并排安装、互不覆盖。

## ✨ 增强功能

### 1. 子智能体多模型链支持

- 支持绑定最多 3 个模型（1 个主模型 + 2 个备用模型）
- 每个模型可单独设置思考等级（reasoningLevel）
- 按顺序执行，主模型失败 5 次后切换到备用模型
- 全部失败时回退主 Agent 兜底执行

### 2. 模型自动获取

- 支持从 [OI] 兼容、Anthropic、Z.AI 等 Provider 自动获取模型列表
- API 返回了能力元数据时（contextWindow、maxOutputTokens、输入格式）原样落地；
  未返回的字段保持缺省，交由 Host 推荐规则表按模型 ID 解析
- 模型设置页一键添加获取到的模型

### 3. 自定义更新源

- 客户端更新检测源指向本仓库的 GitHub Releases
- 支持通过 `ZCODE_UPDATE_FEED_URL` 环境变量覆盖

### 4. GitHub Actions 自动同步与发版

- 每小时检测上游是否有新提交，有则自动 merge（二开改动由 git 自然保留）
- 打 `v*` tag 自动构建并创建 Release
- 合并冲突时自动创建 Issue 通知

## 🐛 本版修复

### 模型自动获取写错上下文窗口大小

`inferModelParameters` 的本地推断表按模型 ID 子串匹配，`glm-5` 分支排在 `glm-5.2` 之后，
导致 `glm-5.3` 命中 `glm-5` 分支被猜成 200000。该猜测值会作为**个人覆盖**写入配置，
反而盖住 Host 推荐规则表里更准确的基线（`zcode-builtin.json` 中 `glm-5.3` = 1000000），
用户看到的就是「上游支持 1M、获取出来却是 200k」。

现在只落地上游 API 确实返回过的字段，缺省字段交回 Host 的 `ModelConfigRules.resolve`
按 `modelMatch` 解析，并移除了本地推断表。

**已受影响的用户**：请到「设置 → 模型」检查相关模型的上下文窗口设置，
把被写错的个人覆盖改回推荐配置（或直接删除该覆盖）。

### 上游同步工作流每小时必然失败

`has_updates` 直接比较 `upstream/main` 与 `HEAD` 的 tip，而 fork 的 `main` 永远比上游
多出二开提交，于是每小时都判定「有更新」；判定有更新后又对 `patches/0NN-*.patch` 执行
`git apply`，而那些改动早已是 `main` 上的普通提交，apply 必然失败。现在改用
`git rev-list --count HEAD..upstream/main` 判断上游是否真的前进，并去掉补丁重放。

## 🚀 使用方法

1. 从 [Releases](https://github.com/li5135580/ZCode/releases/latest) 下载
   `ZCode.Preview-<版本>-win-x64.exe`
2. 运行安装包完成安装
3. 启动 `ZCode Preview`，在设置页配置 Provider 与模型

安装包与官方 ZCode 并存，不需要卸载官方版本。

## ⚠️ 注意事项

1. **未签名**：安装包未做代码签名。Windows 首次运行可能出现 SmartScreen 提示，
   需选择「更多信息 → 仍要运行」。
2. **首次启动可能较慢**：若装有第三方杀毒软件（如火绒），首次启动会因实时扫描
   新落盘的文件而变慢，属正常现象。
3. **Preview 身份不自动更新**：上游设计上 Preview 渠道不接收 stable feed 更新
   （`ZCODE_PRODUCT_FLAVOR === "production"` 才启用自动更新）。要升级请重新下载
   新版本安装包覆盖安装。
4. **与官方版共享数据目录**：Preview 与官方版共用 `~/.zcode/v2/`（日志、设置），
   排查日志时需按进程区分。

## 📖 详细文档

- [二开功能与安装说明](https://github.com/li5135580/ZCode/blob/main/README.md)
- [更新日志](https://github.com/li5135580/ZCode/blob/main/CHANGELOG.md)

## 🐛 问题反馈

如遇到问题，请在 [GitHub Issues](https://github.com/li5135580/ZCode/issues) 提交反馈。

## 📄 许可证

本项目基于 MIT 许可证发布。

# ZCode 二开增强版（构建标签 `v3.15.1-fork.3`）

## 📦 发布内容

本 Release 包含由本仓库 CI 从二开源码**完整构建**的 Windows 安装包
（不是对官方包打补丁）。二开功能已内置在安装包内。

| 文件 | 说明 |
|------|------|
| `ZCode.Preview-3.15.2-fork.3-win-x64.exe` | Windows x64 安装包（约 147 MB），连接生产后端 |
| `latest.yml` | electron-updater 的更新元数据 |
| `ZCode.Preview-3.15.2-fork.3-win-x64.exe.blockmap` | 差分更新块 |

> 产物版本号 `3.15.2-fork.3` 由**构建期注入**（`scripts/ci/fork-release-version.mjs`）：
> 取 tag 的 base 版本 patch + 1，保留 fork 序号。仓库 `package.json` 仍与上游对齐为 `3.15.1`，
> 但按 semver `3.15.2-fork.3 > 3.15.1`，因此 electron-updater 能正确识别更新。
>
> 安装包以 **Preview 身份**构建（应用名 `ZCode Preview`、独立数据目录
> `%LOCALAPPDATA%\Programs\ZCode Preview\`），与官方 ZCode 可并排安装、互不覆盖。

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
- 打 `v*` tag 自动构建、生成 `latest.yml` 并创建 Release
- 合并冲突时自动创建 Issue 通知

## 🐛 本版修复

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

1. 从 [Releases](https://github.com/li5135580/ZCode/releases/latest) 下载
   `ZCode.Preview-<版本>-win-x64.exe`
2. 运行安装包完成安装（会覆盖同 appId 的旧版）
3. 启动 `ZCode Preview`，在设置页配置 Provider 与模型

安装包与官方 ZCode 并存，不需要卸载官方版本。

## ⚠️ 注意事项

1. **未签名**：安装包未做代码签名。Windows 首次运行可能出现 SmartScreen 提示，
   需选择「更多信息 → 仍要运行」。
2. **首次启动可能较慢**：若装有第三方杀毒软件（如火绒），首次启动会因实时扫描
   新落盘的文件而变慢，属正常现象。
3. **旧版需手动升级一次**：装过 `3.15.1` 旧包的机器，旧包的 updater 从未初始化，
   需手动下载本版覆盖安装；从本版起自动更新链路才生效。
4. **与官方版共享数据目录**：Preview 与官方版共用 `~/.zcode/v2/`（日志、设置），
   排查日志时需按进程区分。

## 📖 详细文档

- [二开功能与安装说明](https://github.com/li5135580/ZCode/blob/main/README.md)
- [更新日志](https://github.com/li5135580/ZCode/blob/main/CHANGELOG.md)

## 🐛 问题反馈

如遇到问题，请在 [GitHub Issues](https://github.com/li5135580/ZCode/issues) 提交反馈。

## 📄 许可证

本项目基于 MIT 许可证发布。

# ZCode 二开增强版（构建标签 `v3.18.2-fork.2`）

## 📦 发布内容

本 Release 包含由本仓库 CI 从二开源码**完整构建**的三平台安装包
（不是对官方包打补丁）。二开功能已内置在安装包内。

| 文件 | 说明 |
|------|------|
| `ZCode-Preview-3.18.3-fork.2-win-x64.exe` | Windows x64 安装包，连接生产后端 |
| `ZCode-Preview-3.18.3-fork.2-win-x64.exe.blockmap` | Windows 差分更新块 |
| `ZCode-Preview-3.18.3-fork.2-mac-arm64.dmg` | macOS Apple Silicon 安装镜像 |
| `ZCode-Preview-3.18.3-fork.2-mac-arm64.zip` | macOS 自动更新用的压缩包 |
| `ZCode-Preview-3.18.3-fork.2-linux-x86_64.AppImage` | Linux x64 免安装包（也是更新产物） |
| `ZCode-Preview-3.18.3-fork.2-linux-amd64.deb` | Debian/Ubuntu 首次安装包 |
| `latest.yml` / `latest-mac.yml` / `latest-linux.yml` | 各平台的 electron-updater 更新元数据 |

> 版本号规则：tag 的 base 版本 patch + 1，再带 fork 序号。tag `v3.18.2-fork.1`
> 产出 `3.18.3-fork.2`。patch + 1 保证产物版本大于已安装的 `3.17.3-fork.1`，
> 老用户能正常收到更新；写成 `3.18.2-fork.1` 会因小于已装版本而收不到。
>
> 安装包以 **Preview 身份**构建（应用名 `ZCode Preview`、独立数据目录
> `%LOCALAPPDATA%\Programs\ZCode Preview\`），与官方 ZCode 可并排安装、互不覆盖。

## 🔴 本版修复：升级后登录态丢失、无法重新登录

**如果你装过 3.18.3-fork.1，登录态会丢失，且点浏览器授权登录一直报「登录失败，请重试」。**
本版修复了它，**装上新包后登录会自动恢复，不需要重新登录。**

原因：3.18.3-fork.1 的安装包缺了 `@napi-rs/keyring` 的 Windows 原生二进制
（`app.asar` 里只有 5 个纯 JS 文件，没有任何 `.node`）。ZCode 用系统凭据管理器
（Windows Credential Manager）加密保存登录凭证，拿不到这个二进制就访问不了密钥，
所有凭证操作都报 `System credential storage is unavailable`。

你的数据没有损坏——密钥条目仍在系统凭据管理器里。现在打包流程会在打包前把目标平台的
`.node` 复制进 keyring 本体目录（让 `index.js` 的第一条加载路径稳定命中），
并在打包后强制校验，Windows 缺这个文件会直接让构建失败，不会再产出有问题的安装包。

## 🔄 本版对齐上游 v3.18.2

上游从 v3.17.2 连推三个版本到 v3.18.2，涉及 **5140 个文件、+43.4 万行**，
是本项目目前最大的一次对齐。合并冲突 20 个文件、41 处，全部手工处理。

**冲突处理原则：上游把二开的同类能力原生实现时取上游，否则保留二开。**

上游本版主要变化：

- **浏览器与设计模式**：新增 `@zcode/design-runtime`，浏览器内可直接选中元素改样式；
  浏览器本地预览协议收紧访问范围。
- **语音输入**：composer 内置语音输入按钮、音量点阵、麦克风权限引导浮层。
- **对话注释**：选区「注释」取代原「批注」——评论可选、支持编号对应正文、
  可点编号重新编辑、删除带撤销，并新增 agent 归属字段。
- **多语言**：完整的 locale 体系（`SUPPORTED_LOCALES`、语言标签解析、持久化偏好迁移）。
- **会话控制**：新增 `@zcode/session-control` 包，统一 app/cli 的会话控制契约。
- **凭证安全**：`@napi-rs/keyring` 系统钥匙串接入。

二开侧的处理：

| 项 | 处理 |
| --- | --- |
| 对话选区「批注」 | 上游「注释」完全覆盖该能力，6 个选区文件取上游；二开遗留的 `updateConversationSelectionReferenceComment`、`onEditComment`、`annotation` 死键一并清除 |
| 更新弹窗说明区（fork.19 的 460px 档） | 上游 `resolveUpdateStatusWindowHeight` 仍只有三档、未实现该修复，**保留二开** `updateStatusWindowLayout.ts` |
| 子代理模型链 | 保留二开 `executeChildAgent`，同时吸收上游新增的 `executionId` 与 `onEvent` |
| 其余（import / 常量 / i18n 键 / 白名单） | 双方各自新增，全部保留 |

二开功能全部存续：用量状态条、帮助菜单「重启 ZCode」、`ZCODE_UPSTREAM_VERSION`、
「已下架」模型清理、`ZCODE_CODE_SIGNING_ENABLED` 签名开关、
Windows `tar --force-local`、`react-scan>esbuild` override、两套 CI 工作流、
21 个二开测试文件在工程白名单内。

## 🆕 子代理重试/回退不再从零重跑

这是本版最有价值的行为改进。

**过去的问题**：子代理跑到一半断线，链上重试或切换备用模型时每次都新建子运行时、
消息历史为空。结果是同一批文件重新读、同一批命令重新跑，工具卡片成对重复出现，
写操作可能被执行两次，前一次的 token 全白花。

**现在的行为**：

1. 每次尝试失败后、重试或切换模型之前，先做**失败收口**——把已接受的工具调用
   写成真实结果或 interrupted 结果，历史始终是协议安全的（不会出现
   「有 tool_use 无 tool_result」被 provider 拒绝）。
2. 后续尝试用 `resumeFromStore` 复用同一个子会话历史，**已完成的工具调用及结果直接保留**，
   不再重跑。
3. 续跑时向子智能体注入接管说明：历史里的工具调用来自上一次尝试（可能是别的模型），
   应视为工作区事实、但不要默认其推理正确，也不要重做已成功的工作。

收口的三种状态是有区别的：工具跑完了给真实结果；工具没开始跑标记为「未执行，可安全重试」；
工具跑一半超时标记为「副作用未知，重试前先检查当前状态」。

取消仍是终态：不收口、不重试、不切换模型。

## 🐛 修复：跨 provider 的思维链透传

`projectRequestHistory` 过去只对 anthropic 生效。当历史来自 A 家模型、而当前请求发给
B 家模型时（例如 opus 断线后回退到 gpt-6），上一家的 reasoning 会**原样透传**，
既可能被对端拒绝，也可能让新模型把别人的思考当成自己的。

现在对所有 provider 统一投影一次。判定逻辑本来就按 `providerId + modelId` 比较，
与 provider 类型无关：**同 provider 同模型的重试仍完整保留思考**（模型能看到自己
被打断前的思路），跨模型或跨 provider 才剔除。

## ⚠️ 已知限制

- **无代码签名**：Windows 安装包会触发 SmartScreen 提示（可选「仍要运行」）；
  自动更新在安装前跳过 Authenticode 校验（`ZCODE_CODE_SIGNING_ENABLED` 控制），
  有证书的构建仍保持上游强校验。
- **续跑的边界**：如果断线瞬间恰好有工具正在执行且没等到结果，该工具会被标记为
  「副作用未知」。模型被要求先检查当前状态再重试，但这依赖模型遵守指令。
- **本地 Windows 跑全量工程测试会有环境性失败**（tar 夹具缺 `--force-local`、
  CRLF 校验和、`--import=<Windows 路径>` 等），与产品代码无关；CI 在 Linux 上执行不受影响。

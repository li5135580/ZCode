# ZCode 二开增强版 v3.15.2

## 📦 发布内容

本 Release 包含 ZCode 二开增强版的补丁包，基于官方 ZCode v3.14.3。

## ✨ 增强功能

### 1. 子智能体多模型链支持

- 支持绑定最多 3 个模型（1 个主模型 + 2 个备用模型）
- 每个模型可单独设置思考等级
- 按顺序执行，失败 5 次切换
- 全部失败回退主 Agent

### 2. 模型自动获取

- 支持从所有 Provider 自动获取模型列表
- 自动识别模型参数
- 一键添加获取到的模型

### 3. 自定义更新源

- 客户端更新检测源切换为 GitHub Releases
- 支持通过环境变量自定义更新源

## 📥 下载

| 文件 | 说明 | 大小 |
|------|------|------|
| `zcode-patch-v3.15.2.zip` | 二开增强补丁包（包含可执行文件） | 94 MB |

**补丁包内容**：
- 可执行文件（Windows、macOS、Linux）
- 配置文件
- 使用说明

## 🚀 使用方法

### 1. 安装官方 ZCode

从 [官方 Releases](https://github.com/zai-org/ZCode/releases/latest) 下载并安装 ZCode v3.14.3。

### 2. 下载并应用补丁

#### 方式 A：使用可执行文件（最简单）

```bash
# 下载补丁包
curl -L -o zcode-patch.zip https://github.com/li5135580/ZCode/releases/download/v3.15.2/zcode-patch-v3.15.2.zip

# 解压
unzip zcode-patch.zip

# Windows：双击运行
zcode-patch/dist/apply-patch-win.exe

# macOS：
chmod +x zcode-patch/dist/apply-patch-macos
./zcode-patch/dist/apply-patch-macos

# Linux：
chmod +x zcode-patch/dist/apply-patch-linux
./zcode-patch/dist/apply-patch-linux
```

#### 方式 B：使用 Node.js（需要安装 Node.js）

```bash
# 下载补丁包
curl -L -o zcode-patch.zip https://github.com/li5135580/ZCode/releases/download/v3.15.2/zcode-patch-v3.15.2.zip

# 解压
unzip zcode-patch.zip

# 运行补丁应用器
node zcode-patch/scripts/apply-patch.js
```

### 3. 重启 ZCode

补丁应用完成后，重启 ZCode 即可享受增强功能。

## 🔄 恢复官方版本

```bash
# 使用可执行文件
zcode-patch/dist/restore-backup-win.exe  # Windows
./zcode-patch/dist/restore-backup-macos  # macOS
./zcode-patch/dist/restore-backup-linux  # Linux

# 或使用 Node.js
node zcode-patch/scripts/restore-backup.js
```

## 📖 详细文档

- [补丁使用说明](https://github.com/li5135580/ZCode/blob/main/patches/README.md)
- [二开功能文档](https://github.com/li5135580/ZCode/blob/main/README.md)
- [更新日志](https://github.com/li5135580/ZCode/blob/main/CHANGELOG.md)

## ⚠️ 注意事项

1. **兼容性**：本补丁仅适用于 ZCode v3.14.3，其他版本可能不兼容。
2. **备份**：补丁应用器会自动备份原文件，可以随时恢复。
3. **更新**：当官方发布新版本时，需要等待补丁更新。
4. **可执行文件**：补丁包包含可执行文件，无需安装 Node.js 即可运行。

## 🐛 问题反馈

如遇到问题，请在 [GitHub Issues](https://github.com/li5135580/ZCode/issues) 提交反馈。

## 📄 许可证

本补丁基于 MIT 许可证发布。

# 双仓库同步配置

## 配置说明

本仓库已配置为**同时推送到两个 GitHub 账号**：

- **li5135580**（主账号）：https://github.com/li5135580/ZCode
- **xyiford**（副账号）：https://github.com/xyiford/ZCode

## 远程仓库配置

```bash
origin	https://github.com/li5135580/ZCode.git (fetch)   # 拉取：从主账号
origin	https://github.com/li5135580/ZCode.git (push)    # 推送：到主账号
origin	https://github.com/xyiford/ZCode.git (push)      # 推送：到副账号
```

## 使用方式

### 日常推送

```bash
# 一次推送，同时更新两个仓库
git push origin main

# 推送 tag
git push origin v3.15.2
```

### 拉取更新

```bash
# 只从主账号拉取
git pull origin main
```

## 首次配置步骤

如果你想在其他机器上配置同样的双仓库同步，执行以下命令：

```bash
# 1. 克隆主仓库
git clone https://github.com/li5135580/ZCode.git
cd ZCode

# 2. 配置同时推送到两个仓库
git remote set-url --add --push origin https://github.com/li5135580/ZCode.git
git remote set-url --add --push origin https://github.com/xyiford/ZCode.git

# 3. 验证配置
git remote -v
```

## 注意事项

1. **认证**：推送时会依次要求两个账号的认证
   - 第一次推送主账号时，选择 li5135580
   - 第一次推送副账号时，选择 xyiford
   - 勾选"记住选择"后，以后就不会再弹窗

2. **权限**：确保两个账号都有推送权限
   - li5135580：仓库所有者
   - xyiford：需要有仓库的写入权限

3. **GitHub Actions**：两个仓库都会触发 Actions
   - li5135580/ZCode 会触发构建
   - xyiford/ZCode 也会触发构建
   - 如果不想重复构建，可以在 xyiford 仓库禁用 Actions

4. **Release**：两个仓库都会创建 Release
   - li5135580/ZCode 的 Release 会包含构建产物
   - xyiford/ZCode 的 Release 也会包含构建产物

## 故障排查

### 推送失败

如果推送失败，检查以下几点：

1. **认证问题**：
   ```bash
   # 清除凭据缓存
   git credential-manager erase https://github.com
   
   # 重新推送（会提示登录）
   git push origin main
   ```

2. **权限问题**：
   - 确认 xyiford 账号有仓库的写入权限
   - 确认两个账号都已登录

3. **网络问题**：
   ```bash
   # 增加超时时间
   git config --global http.postBuffer 524288000
   git config --global http.lowSpeedLimit 0
   git config --global http.lowSpeedTime 999999
   ```

### 仓库不同步

如果两个仓库不同步，可以强制同步：

```bash
# 强制推送到所有远程
git push origin main --force
```

## 切换回单仓库

如果想切换回只推送到主账号：

```bash
# 删除副账号的推送地址
git remote set-url --delete --push origin https://github.com/xyiford/ZCode.git

# 验证
git remote -v
```

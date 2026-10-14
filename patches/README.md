# 二开补丁管理

本目录存放二开修改的补丁文件，用于上游同步时自动应用。

> 注意：本目录同时存放 pnpm `patchedDependencies` 引用的依赖补丁（如 `vitest@4.1.7.patch`、
> `@arms__rum-electron@0.0.3.patch` 等，见根目录 `package.json` 的 `pnpm.patchedDependencies`）。
> 这些依赖补丁作用于 `node_modules` 内的包，**不是** git 工作树补丁，不能用于 `git apply`。
>
> 为避免误用，二开补丁统一以 `0NN-` 命名（如 `001-*.patch`），`.github/workflows/sync-upstream.yml`
> 只对 `patches/0*.patch` 执行 `git apply --3way`。

## 使用方式

1. 生成补丁：
   ```bash
   git diff upstream/main > patches/001-custom-changes.patch
   ```

2. 应用补丁（只应用二开补丁，避免误用 pnpm 依赖补丁）：
   ```bash
   git apply patches/0*.patch --3way
   ```

## 补丁列表

- `001-subagent-model-chain.patch` - 子智能体多模型链支持
- `002-model-auto-fetch.patch` - 模型自动获取功能
- `003-update-source.patch` - 更新源修改
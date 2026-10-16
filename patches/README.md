# 补丁目录说明

本目录**只存放 pnpm `patchedDependencies` 引用的依赖补丁**（见根目录 `package.json` 的
`pnpm.patchedDependencies`）。这些补丁作用于 `node_modules` 内的第三方包，由 pnpm 在
`pnpm install` 时自动应用，文件名形如 `vitest@4.1.7.patch`、`@arms__rum-electron@0.0.3.patch`。

## 二开改动不放在这里

二开（子智能体模型链、模型自动获取、自定义更新源）本身就是 `main` 分支上的普通提交，
不需要补丁文件：

- **上游同步**：`.github/workflows/sync-upstream.yml` 用 `git merge upstream/main` 合并，
  二开提交会被 git 自然保留；冲突时中止并创建 Issue 通知人工处理。
- **查看二开改动**：`git log aac47556..HEAD`，或 `git diff aac47556..HEAD`。
- **需要导出补丁时**（例如往另一份 clone 移植）：`git diff aac47556..HEAD > custom.patch`。

### 为什么删掉了 `001-*.patch` / `002-*.patch`

这两个文件曾是二开内容的补丁快照，同步工作流会在 merge 之后对它们执行
`git apply --3way`。但二开改动早已作为提交存在于工作树里，apply 必然报
`already exists` / `patch does not apply`，导致同步工作流**每小时都失败**。
去掉补丁重放后，同步只做一次普通 merge。

历史上本目录曾把「依赖补丁」与「二开补丁」混在一起，靠 `0NN-` 前缀区分。现在二开补丁
已移除，不再需要该约定。

## 新增依赖补丁

```bash
pnpm patch <package>@<version>
# 编辑 node_modules 中解出的目录
pnpm patch-commit <解出目录>
```

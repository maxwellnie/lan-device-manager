# LanDevice Manager Git 工作流指南

## 项目概述

本项目使用 Git 进行版本控制，包含以下主要组件：
- `lan-windows/`: Windows 服务端桌面应用
- `lan-android/`: Android 客户端应用
- `agent_workspace/`: 设计文档和参考资料

## 常用 Git 命令

### 基础操作

```bash
# 查看状态
git status

# 添加文件到暂存区
git add <文件名>
git add -A  # 添加所有更改

# 提交更改
git commit -m "提交信息"

# 查看提交历史
git log --oneline
```

### 分支管理

```bash
# 创建新分支
git branch <分支名>

# 切换分支
git checkout <分支名>

# 创建并切换到新分支
git checkout -b <分支名>

# 合并分支
git checkout main
git merge <分支名>

# 删除分支
git branch -d <分支名>
```

### 远程操作

```bash
# 添加远程仓库
git remote add origin <仓库URL>

# 推送到远程
git push -u origin main

# 拉取更新
git pull origin main

# 获取远程分支列表
git branch -r
```

## 分支策略

### 主分支

- `main`: 主分支，包含稳定的生产代码
- `develop`: 开发分支，包含最新的开发代码

### 功能分支

命名规范：`feature/<功能描述>`

```bash
# 创建功能分支
git checkout -b feature/ip-blacklist

# 开发完成后合并
git checkout develop
git merge feature/ip-blacklist
git branch -d feature/ip-blacklist
```

### 修复分支

命名规范：`fix/<bug描述>`

```bash
# 创建修复分支
git checkout -b fix/theme-switch-bug

# 修复完成后合并
git checkout develop
git merge fix/theme-switch-bug
```

### 发布分支

命名规范：`release/<版本号>`

```bash
# 创建发布分支
git checkout -b release/v1.0.0

# 发布后合并到 main 和 develop
git checkout main
git merge release/v1.0.0
git checkout develop
git merge release/v1.0.0
```

## 提交信息规范

### 格式

```
<类型>: <简短描述>

<详细描述（可选）>

<关联问题（可选）>
```

### 类型

- `feat`: 新功能
- `fix`: 修复bug
- `docs`: 文档更新
- `style`: 代码格式（不影响功能）
- `refactor`: 代码重构
- `perf`: 性能优化
- `test`: 测试相关
- `chore`: 构建过程或辅助工具的变动

### 示例

```bash
# 新功能
git commit -m "feat: add IP blacklist mechanism

- Add ip_blacklist and enable_ip_blacklist config fields
- Implement IP blacklist check in API middleware
- Add IP blacklist management UI in Settings"

# 修复bug
git commit -m "fix: resolve theme switch reset issue

Theme switch no longer triggers config reload,
preventing unsaved settings from being reset."

# 文档更新
git commit -m "docs: update README with build instructions"
```

## 开发工作流

### 1. 开始新功能

```bash
# 确保 develop 分支是最新的
git checkout develop
git pull origin develop

# 创建功能分支
git checkout -b feature/my-feature

# 开发代码...
```

### 2. 提交更改

```bash
# 查看更改
git status

# 添加文件
git add -A

# 提交
git commit -m "feat: add new feature"
```

### 3. 推送到远程

```bash
# 首次推送
git push -u origin feature/my-feature

# 后续推送
git push
```

### 4. 创建 Pull Request

在 GitHub/GitLab 上创建 Pull Request，请求合并到 develop 分支。

### 5. 代码审查

- 至少一名审查者批准
- 解决所有评论
- 确保 CI/CD 通过

### 6. 合并

审查通过后，合并到 develop 分支。

## 版本发布

### 版本号规范

使用语义化版本控制 (Semantic Versioning)：
- `MAJOR.MINOR.PATCH`
- 例如：`v1.2.3`

### 发布流程

1. 从 develop 创建 release 分支
2. 进行最终测试和修复
3. 更新版本号和 CHANGELOG
4. 合并到 main 和 develop
5. 创建标签：`git tag -a v1.0.0 -m "Release version 1.0.0"`
6. 推送标签：`git push origin v1.0.0`

## 忽略文件说明

`.gitignore` 中已配置忽略以下文件：
- `node_modules/`: 依赖目录
- `dist/`, `build/`, `target/`: 构建输出
- `.env`: 环境变量文件
- IDE 配置文件
- 日志文件
- 缓存文件

## 常见问题

### 1. 撤销更改

```bash
# 撤销工作区的更改
git checkout -- <文件名>

# 撤销暂存区的更改
git reset HEAD <文件名>

# 撤销最后一次提交（保留更改）
git reset --soft HEAD~1

# 撤销最后一次提交（丢弃更改）
git reset --hard HEAD~1
```

### 2. 解决冲突

```bash
# 查看冲突文件
git status

# 编辑冲突文件，解决冲突
# 然后添加并提交
git add -A
git commit -m "resolve conflicts"
```

### 3. 查看历史

```bash
# 简洁历史
git log --oneline

# 图形化历史
git log --graph --oneline --all

# 查看特定文件的更改历史
git log -p <文件名>
```

## 最佳实践

1. **频繁提交**: 小步快跑，每次提交只做一件事
2. **写清楚的提交信息**: 方便日后查看和理解
3. **使用分支**: 不要在 main 分支直接开发
4. **定期拉取更新**: 避免冲突
5. **审查代码**: 合并前进行代码审查
6. **保持 .gitignore 更新**: 避免提交不必要的文件

## 相关文档

- [PROGRESS_REPORT.md](PROGRESS_REPORT.md): 项目进度报告
- [PROGRESS_REPORT_PHASE2.md](PROGRESS_REPORT_PHASE2.md): 二期维护报告
- [PROGRESS_REPORT_PHASE3.md](PROGRESS_REPORT_PHASE3.md): 三期维护报告

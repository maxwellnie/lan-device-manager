# LanDevice Manager 项目报告

**项目名称**: LanDevice Manager  
**项目类型**: 局域网设备管理工具  
**报告日期**: 2026-02-15  
**版本**: v1.0.0  

---

## 一、项目概述

LanDevice Manager 是一个跨平台的局域网设备管理解决方案，包含 Windows 服务端桌面应用和 Android 客户端应用。该系统允许用户在局域网内远程管理和控制 Windows 设备。

### 核心功能

1. **设备发现** - 通过 mDNS 自动发现局域网内的设备
2. **远程命令执行** - 在 Windows 设备上执行系统命令
3. **系统信息查看** - 实时查看 CPU、内存、操作系统等信息
4. **远程控制** - 关机、重启、睡眠、锁屏等操作
5. **安全认证** - 基于挑战-响应机制的密码认证
6. **IP 黑名单** - 阻止特定 IP 地址访问
7. **日志监控** - 实时查看系统日志

---

## 二、系统架构

### 2.1 整体架构

```
┌─────────────────┐      LAN      ┌─────────────────┐
│  Android Client │  ◄──────────►  │ Windows Server  │
│   (Tauri+React) │   mDNS/HTTP    │   (Tauri+Rust)  │
└─────────────────┘                └─────────────────┘
```

### 2.2 组件说明

#### Windows 服务端 (lan-windows/)

**技术栈**:
- **前端**: React + TypeScript + Vite
- **后端**: Rust + Tauri
- **UI 框架**: 自定义 CSS (Glass 主题)
- **通信**: Axum Web 框架 + WebSocket
- **服务发现**: mDNS (mdns-sd)

**核心模块**:
- `api.rs` - HTTP API 接口和中间件
- `auth.rs` - 认证管理（Argon2 + JWT）
- `command.rs` - 命令执行器
- `config.rs` - 配置管理
- `mdns.rs` - mDNS 服务广播
- `websocket.rs` - WebSocket 实时通信

#### Android 客户端 (lan-android/)

**技术栈**:
- **前端**: React + TypeScript + Vite
- **后端**: Rust + Tauri Mobile
- **UI 框架**: Material Design 3
- **通信**: HTTP Client + WebSocket

**核心模块**:
- `api.rs` - API 客户端
- `crypto.rs` - 加密工具（挑战-响应）
- `mdns.rs` - mDNS 服务发现
- `state.rs` - 设备状态管理

---

## 三、功能特性

### 3.1 Windows 服务端功能

| 功能模块 | 描述 |
|---------|------|
| 服务器控制 | 启动/停止 API 服务器 |
| 密码管理 | 设置/修改/清除访问密码 |
| 主题切换 | Light/Dark/System/Glass 四种主题 |
| 日志管理 | 实时日志查看、搜索、过滤 |
| 命令白名单 | 配置允许执行的命令 |
| IP 黑名单 | 阻止特定 IP 访问 |
| 开机自启 | Windows 开机自动启动 |
| 自动启动 | 应用启动时自动启动服务器 |

### 3.2 Android 客户端功能

| 功能模块 | 描述 |
|---------|------|
| 设备发现 | 自动发现局域网内的 Windows 设备 |
| 设备管理 | 保存、连接、删除设备 |
| 远程控制 | 关机、重启、睡眠、锁屏 |
| 命令执行 | 执行系统命令并查看结果 |
| 系统信息 | 查看设备硬件和系统信息 |
| 认证管理 | 密码认证和 Token 刷新 |

### 3.3 安全特性

1. **密码认证** - Argon2id 密码哈希
2. **挑战-响应** - 防止重放攻击
3. **JWT Token** - 无状态会话管理
4. **IP 黑名单** - 访问控制
5. **命令白名单** - 限制可执行命令

---

## 四、技术实现

### 4.1 通信协议

**HTTP API**:
```
POST /api/auth/challenge    - 获取挑战码
POST /api/auth/verify       - 验证密码获取 Token
GET  /api/system/info       - 获取系统信息
POST /api/command/execute   - 执行命令
GET  /api/logs              - 获取日志
```

**WebSocket**:
```
/ws                         - 实时日志推送
```

**mDNS 服务**:
```
Service Type: _lan-device._tcp.local.
Properties: version, device_name, os_type
```

### 4.2 认证流程

```
1. Client ──GET /challenge────────► Server
2. Client ◄──challenge + salt────── Server
3. Client ──POST /verify(challenge_response)──► Server
4. Client ◄──JWT Token───────────── Server
5. Client ──API calls(with Token)──► Server
```

### 4.3 国际化支持

- **英文** (en)
- **中文** (zh)
- 使用 i18next 框架
- 支持动态语言切换

---

## 五、维护记录

### 5.1 一期维护 (2026-02-10)

**内容**:
- 项目初始化
- 基础架构搭建
- 设备发现功能
- 基本命令执行

### 5.2 二期维护 (2026-02-12)

**内容**:
- 添加命令白名单机制
- 自定义命令支持
- 日志文件持久化
- 配置管理优化
- 国际化支持

**Bug 修复**:
- 修复端口占用检测问题
- 修复日志缓冲区溢出问题
- 修复 mDNS 服务广播问题

### 5.3 三期维护 (2026-02-15)

**内容**:
- **IP 黑名单机制**
  - 配置字段: `ip_blacklist`, `enable_ip_blacklist`
  - API 中间件黑名单检查
  - WebSocket 黑名单检查
  - 前端管理界面

**Bug 修复**:

| Bug 描述 | 修复文件 | 修复内容 |
|---------|---------|---------|
| 主题切换重置未保存设置 | Settings.tsx | 分离 useEffect 依赖，避免切换主题时重新加载配置 |
| 密码状态更新不及时 | App.tsx | 关闭设置窗口时重新加载配置 |
| 硬编码默认密码 | auth.rs | 移除默认密码，无密码时禁用认证 |
| 删除设备时密码未清理 | state.rs (Android) | 使用正确的键删除密码和 token |
| 国际化字符串缺失 | en.json, zh.json | 添加缺失的翻译键 |
| Clippy 警告 | 多个 Rust 文件 | 修复代码风格和最佳实践警告 |

**代码质量改进**:
- 添加 `Default` trait 实现
- 修复 `args(&[...])` 为 `args([...])`
- 移除不必要的 `.into()` 转换
- 添加 `#[allow(clippy::redundant_async_block)]`

---

## 六、Git 版本管理

### 6.1 仓库结构

```
lan-device-manager/
├── .git/                   # Git 仓库
├── .gitignore              # 忽略文件配置
├── GIT_WORKFLOW.md         # Git 工作流指南
├── lan-windows/            # Windows 服务端
├── lan-android/            # Android 客户端
├── agent_workspace/        # 设计文档
└── *.md                    # 项目文档
```

### 6.2 分支策略

- **main**: 稳定生产分支
- **develop**: 开发分支
- **feature/**: 功能分支
- **fix/**: 修复分支
- **release/**: 发布分支

### 6.3 提交规范

```
类型: 简短描述

详细描述

关联问题
```

**类型**:
- `feat`: 新功能
- `fix`: 修复bug
- `docs`: 文档
- `refactor`: 重构
- `perf`: 性能优化
- `test`: 测试
- `chore`: 构建/工具

---

## 七、项目统计

### 7.1 代码量

| 组件 | 文件数 | 代码行数 |
|-----|-------|---------|
| Windows 前端 | 15+ | ~3000 |
| Windows 后端 | 12+ | ~2500 |
| Android 前端 | 8+ | ~1500 |
| Android 后端 | 7+ | ~1500 |

### 7.2 依赖统计

**Windows 端**:
- Rust crates: 40+
- npm packages: 20+

**Android 端**:
- Rust crates: 30+
- npm packages: 15+

---

## 八、使用说明

### 8.1 Windows 服务端

```bash
cd lan-windows
npm install
npm run tauri dev      # 开发模式
npm run tauri build    # 构建 release
```

### 8.2 Android 客户端

```bash
cd lan-android
npm install
npm run tauri android dev    # 开发模式
npm run tauri android build  # 构建 APK
```

---

## 九、未来规划

### 9.1 功能增强

- [ ] 文件传输功能
- [ ] 屏幕截图/监控
- [ ] 多设备同时管理
- [ ] 命令执行历史
- [ ] 批量命令执行
- [ ] 定时任务

### 9.2 安全增强

- [ ] 双因素认证
- [ ] 证书 pinning
- [ ] 自动黑名单（暴力破解保护）
- [ ] 操作审计日志

### 9.3 平台扩展

- [ ] iOS 客户端
- [ ] Linux 服务端
- [ ] Web 管理界面

---

## 十、总结

LanDevice Manager 是一个功能完善的局域网设备管理解决方案，具有以下特点：

1. **跨平台** - 支持 Windows 服务端和 Android 客户端
2. **易用性** - 自动发现设备，无需手动配置 IP
3. **安全性** - 多重安全机制保护访问安全
4. **可扩展** - 模块化架构便于功能扩展
5. **国际化** - 支持中英文界面

项目已完成三期维护，修复了多个关键 bug，代码质量得到提升，现已具备生产环境使用条件。

---

## 附录

### 相关文档

- [PROGRESS_REPORT.md](PROGRESS_REPORT.md) - 一期维护报告
- [PROGRESS_REPORT_PHASE2.md](PROGRESS_REPORT_PHASE2.md) - 二期维护报告
- [PROGRESS_REPORT_PHASE3.md](PROGRESS_REPORT_PHASE3.md) - 三期维护报告
- [GIT_WORKFLOW.md](GIT_WORKFLOW.md) - Git 工作流指南
- [lan-windows/README.md](lan-windows/README.md) - Windows 端说明
- [lan-android/README.md](lan-android/README.md) - Android 端说明

### 技术参考

- [Tauri 文档](https://tauri.app/)
- [React 文档](https://react.dev/)
- [Rust 文档](https://www.rust-lang.org/)
- [mDNS 协议](https://datatracker.ietf.org/doc/html/rfc6762)

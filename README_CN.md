# LanDevice Manager (测试版)

一个基于 Tauri、React 和 Rust 构建的跨平台局域网设备管理应用程序。

## 概述

LanDevice Manager 是一个强大的工具，用于管理本地网络上的设备。它提供设备发现、远程命令执行和网络监控功能，并具有现代美观的用户界面。

### 支持的平台

- **Windows**: x64、x86、ARM
- **Android**: x64、x86、ARM

## 功能特性

- 📱 **网络设备发现**: 使用 mDNS 自动发现本地网络上的设备
- 🔐 **安全认证**: API 访问密码保护
- 💻 **远程命令执行**: 在远程设备上安全执行命令
- 📊 **实时监控**: 实时日志和系统性能监控
- 🎨 **多种主题**: 浅色、深色、系统和玻璃（Mica）主题
- 🔄 **自动启动**: 开机自动启动 API 服务器
- 🛡️ **IP 黑名单**: 阻止不需要的 IP 地址
- 📝 **命令白名单**: 为安全起见限制允许的命令
- 📱 **托盘集成**: 最小化到系统托盘以在后台运行

## 安装

### 前置要求

#### 开发环境要求

- **Rust**: 最新稳定版
- **Node.js**: 18.x 或更高版本
- **Tauri CLI**: 最新版本

### 开发环境设置

1. **克隆仓库**

   ```bash
   git clone <repository-url>
   cd lan-device-manager
   ```

2. **安装依赖**

   ```bash
   cd lan-windows
   npm install
   ```

3. **以开发模式运行**

   ```bash
   npm run tauri dev
   ```

### 从源码构建

#### Windows

```bash
cd lan-windows
npm run tauri build
```

#### Android

```bash
cd lan-android
npm run tauri android build
```

## 使用说明

### 快速开始

1. **启动应用程序**
2. **配置设置**:
   - 设置 API 端口（默认：8080）
   - 设置访问密码（可选但推荐）
   - 配置自动启动选项
3. **启动 API 服务器**
4. **发现网络上的设备**

### 配置选项

应用程序支持以下配置选项：

- **API 端口**: REST API 的端口号
- **访问密码**: API 认证密码
- **自动启动 API**: 应用启动时自动启动 API 服务器
- **开机自启动**: 系统启动时启动应用程序
- **主题**: 选择浅色、深色、系统或玻璃主题
- **命令白名单**: 允许的命令列表
- **IP 黑名单**: 被阻止的 IP 地址列表

### API 端点

REST API 提供以下端点：

- `GET /api/status`: 获取服务器状态
- `POST /api/start`: 启动服务器
- `POST /api/stop`: 停止服务器
- `POST /api/execute`: 执行命令
- `GET /api/logs`: 获取应用程序日志
- `GET /api/config`: 获取配置
- `POST /api/config`: 更新配置

## 项目结构

```
lan-device-manager/
├── lan-windows/          # Windows 桌面应用程序
│   ├── src/              # React 前端源码
│   ├── src-tauri/        # Rust 后端源码
│   └── package.json
└── lan-android/          # Android 移动应用程序
    ├── src/              # React 前端源码
    ├── src-tauri/        # Rust 后端源码
    └── package.json
```

## 技术栈

### 前端
- **React 19**: 现代 UI 框架
- **TypeScript**: 类型安全开发
- **Vite**: 快速构建工具
- **Tauri**: 桌面/移动应用框架

### 后端
- **Rust**: 高性能系统编程
- **Tokio**: 异步运行时
- **Tauri**: 应用框架
- **mDNS**: 网络发现协议

## 贡献指南

我们欢迎对 LanDevice Manager 的贡献！以下是您可以帮助的方式：

1. **Fork 仓库**
2. **创建功能分支** (`git checkout -b feature/amazing-feature`)
3. **提交更改** (`git commit -m 'Add some amazing feature'`)
4. **推送到分支** (`git push origin feature/amazing-feature`)
5. **打开 Pull Request**

### 开发准则

- 遵循 Rust 和 TypeScript 最佳实践
- 编写清晰简洁的提交信息
- 为新功能添加测试
- 根据需要更新文档
- 在提交前确保所有测试通过

## 许可证

本项目采用 MIT 许可证 - 有关详细信息，请参阅 [LICENSE](LICENSE) 文件。

## 致谢

- [Tauri](https://tauri.app/) - 使这一切成为可能的应用框架
- [React](https://react.dev/) - UI 库
- [Rust](https://www.rust-lang.org/) - 编程语言
- [Stitch](https://stitch.withgoogle.com/) - 前端设计
- [Trae](https://www.trae.cn/) - VibeCoding IDE

## AI 声明

本项目由 AI 100% 编码。

## 技术支持

如果您遇到任何问题或有疑问，请在 GitHub 上提交 Issue。

---

**注意**: 这是一个测试版。某些功能可能不完整或可能发生更改。

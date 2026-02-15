# LanDevice Manager 项目进度报告

**报告日期**: 2026-02-05  
**项目状态**: 开发中

---

## 一、项目概述

LanDevice Manager 是一个跨平台的局域网设备管理工具，包含：
- **Windows 服务端**: 提供 API 服务、mDNS 广播、远程命令执行
- **Android 客户端**: 设备发现、远程控制、认证管理

---

## 二、已完成功能

### 1. 核心功能

#### Windows 服务端 (lan-windows)
| 功能 | 状态 | 说明 |
|------|------|------|
| HTTP API 服务 | ✅ 完成 | 支持系统信息查询、远程命令执行 |
| mDNS 服务广播 | ✅ 完成 | 自动广播服务到局域网 |
| 设备认证 | ✅ 完成 | Argon2id 密码哈希、挑战-响应认证 |
| WebSocket 实时日志 | ✅ 完成 | 支持实时推送日志到客户端 |
| 密码持久化 | ✅ 完成 | 密码保存到配置文件，重启后保留 |
| 系统命令执行 | ✅ 完成 | 支持关机、重启、锁屏等命令 |
| 开机自启动 | ✅ 完成 | 支持 Windows 开机自启动 |
| 系统托盘 | ✅ 完成 | 最小化到托盘，右键菜单 |

#### Android 客户端 (lan-android)
| 功能 | 状态 | 说明 |
|------|------|------|
| mDNS 设备发现 | ✅ 完成 | 自动发现局域网 Windows 设备 |
| 设备列表持久化 | ✅ 完成 | 设备信息保存到本地文件 |
| 设备认证 | ✅ 完成 | 支持密码认证、Token 管理 |
| 远程命令执行 | ✅ 完成 | 发送命令到 Windows 设备 |
| 系统信息查看 | ✅ 完成 | 查看 CPU、内存、运行时间等 |
| 网络刷新功能 | ✅ 完成 | WiFi 变化后手动刷新发现 |
| 设备信息管理 | ✅ 完成 | 添加、删除、重命名设备 |

---

## 三、近期修复的问题

### 1. 密码重启丢失问题 (Windows)
**问题描述**: Windows 端设置密码后，重启应用密码重置为默认值 `12345678`

**根本原因**: 
- `AuthManager::new()` 每次都创建默认密码
- 没有从配置文件加载已保存的密码

**解决方案**:
```rust
// 启动时从配置加载密码
let config = crate::config::AppConfig::load();
let password_hash = if let Some(hash) = config.password_hash {
    Some(hash)  // 使用保存的密码
} else {
    // 使用默认密码
};

// 设置密码时保存到配置
config.password_hash = Some(password_hash);
config.save()?;
```

**状态**: ✅ 已修复

---

### 2. 设备列表持久化问题 (Android)
**问题描述**: Android 端重启 App 后，设备列表为空

**根本原因**:
- 设备列表保存在内存中，未持久化到存储
- Android 上 `dirs::config_dir()` 路径可能不可用

**解决方案**:
```rust
// 使用应用私有目录
fn app_data_dir() -> PathBuf {
    #[cfg(target_os = "android")]
    PathBuf::from("/data/data/<package>/files")
    
    #[cfg(not(target_os = "android"))]
    dirs::config_dir().unwrap_or_else(|| PathBuf::from("."))
}

// 保存设备列表
fn persist_saved_devices(&self) {
    let file_path = Self::devices_file_path();
    std::fs::write(&file_path, json)?;
}

// 加载设备列表
fn load_saved_devices() -> Vec<SavedDevice> {
    // 从文件加载并解析
}
```

**状态**: ✅ 已实现，待测试验证

---

### 3. mDNS 发现网络变化问题 (Android)
**问题描述**: 双卡手机或 WiFi 断开重连后，无法发现设备

**根本原因**:
- Android 多播组订阅在网络接口变化时失效
- 缺少必要的 WiFi 多播权限

**解决方案**:
1. **添加 Android 权限**:
```xml
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
<uses-permission android:name="android.permission.CHANGE_WIFI_MULTICAST_STATE" />
<uses-permission android:name="android.permission.CHANGE_WIFI_STATE" />
```

2. **添加手动刷新功能**:
```rust
pub async fn restart_discovery(&mut self) -> Result<String, String> {
    // 停止现有发现
    // 等待 500ms 确保资源释放
    // 重新启动发现
}
```

3. **前端添加刷新按钮**:
```typescript
<button onClick={async () => {
    await invoke('restart_discovery');
}}>
    Refresh Network
</button>
```

**状态**: ✅ 已实现

---

## 四、已知问题

### 1. 日志输出延迟 (Windows)
**问题描述**: Windows 控制台日志输出有缓冲，需要手动刷新才显示

**解决方案**: 
- 使用 `run.bat` 脚本运行，设置环境变量 `RUST_LOG_STYLE=always`
- 或输出到文件后使用 `tail -f` 查看

**状态**: ⚠️ 已知，有解决方案

---

### 2. Android 设备列表持久化待验证
**问题描述**: 已实现持久化代码，但需要在真机上验证

**验证步骤**:
1. 添加设备到列表
2. 完全关闭 App
3. 重新启动 App
4. 检查设备列表是否恢复

**状态**: ⏳ 待测试

---

## 五、技术架构

### 通信协议
```
Android Client          Windows Server
     |                         |
     |---- mDNS 发现 --------->|
     |<--- 服务广播 ------------|
     |                         |
     |---- HTTP API 请求 ----->|
     |<--- JSON 响应 -----------|
     |                         |
     |---- WebSocket 连接 ---->|
     |<--- 实时日志推送 ---------|
```

### 认证流程
```
1. Client 请求挑战 (POST /api/auth/challenge)
2. Server 返回随机挑战字符串
3. Client 计算 HMAC(challenge, password)
4. Client 发送认证请求 (POST /api/auth/login)
5. Server 验证 HMAC，颁发 Token
6. Client 使用 Token 访问受保护接口
```

---

## 六、项目结构

```
lan-device-manager/
├── lan-windows/              # Windows 服务端
│   ├── src-tauri/
│   │   ├── src/
│   │   │   ├── main.rs       # 程序入口
│   │   │   ├── lib.rs        # Tauri 命令
│   │   │   ├── api.rs        # HTTP API 服务
│   │   │   ├── auth.rs       # 认证管理
│   │   │   ├── mdns.rs       # mDNS 服务广播
│   │   │   ├── config.rs     # 配置管理
│   │   │   └── ...
│   │   └── Cargo.toml
│   └── src/                  # 前端代码
│
├── lan-android/              # Android 客户端
│   ├── src-tauri/
│   │   ├── src/
│   │   │   ├── lib.rs        # Tauri 命令
│   │   │   ├── state.rs      # 应用状态管理
│   │   │   ├── mdns.rs       # mDNS 设备发现
│   │   │   ├── api.rs        # API 客户端
│   │   │   └── ...
│   │   └── Cargo.toml
│   └── src/                  # 前端 React 代码
│       ├── pages/
│       │   ├── HostsList.tsx     # 设备列表页
│       │   ├── DiscoverHosts.tsx # 设备发现页
│       │   └── Terminal.tsx      # 终端控制页
│       └── ...
│
└── PROGRESS_REPORT.md        # 本报告
```

---

## 七、下一步计划

### 高优先级
1. **测试 Android 设备列表持久化** - 验证真机上的文件读写
2. **完善错误处理** - 添加更多用户友好的错误提示
3. **优化 mDNS 稳定性** - 处理更多网络边界情况

### 中优先级
4. **添加设备分组功能** - 支持按房间/位置分组管理
5. **命令历史记录** - 保存常用命令快速执行
6. **批量操作** - 支持同时控制多台设备

### 低优先级
7. **iOS 客户端** - 适配 iOS 平台
8. **Web 客户端** - 开发 Web 版本
9. **插件系统** - 支持自定义命令插件

---

## 八、技术栈

| 组件 | 技术 |
|------|------|
| Windows 后端 | Rust + Tauri |
| Android 客户端 | Rust + Tauri + React |
| HTTP 服务 | Axum |
| mDNS 发现/广播 | mdns-sd |
| 认证 | Argon2id + HMAC-SHA256 |
| 密码哈希 | Argon2 |
| 配置存储 | JSON 文件 |

---

## 九、总结

项目核心功能已基本完成，主要修复了密码持久化和设备列表持久化问题。Android 端 mDNS 发现增加了手动刷新功能以应对网络变化。下一步重点是在真机上验证持久化功能，并完善错误处理和用户体验。

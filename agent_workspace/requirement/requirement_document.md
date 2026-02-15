# 跨平台设备管理解决方案需求文档

## 1. 项目概述

### 1.1 项目名称
**LanDevice Manager** - 基于Tauri 2的跨平台局域网设备管理解决方案

### 1.2 项目目标
开发一套跨平台软件系统，允许用户通过移动设备发现、验证并管理局域网内的计算机设备，实现安全可靠的远程操作功能。

### 1.3 技术栈
- **框架**: Tauri 2 (支持桌面和移动端)
- **后端语言**: Rust
- **前端**: Web技术 (React/Vue/Svelte + TypeScript)
- **数据库**: SQLite (移动端存储)、Rust内存缓存
- **通信协议**: HTTP/WebSocket + mDNS

## 2. 系统架构

### 2.1 总体架构
```
┌─────────────────┐    ┌─────────────────┐
│   移动端客户端   │    │   计算机服务端   │
│  (Tauri Mobile) │    │  (Tauri Desktop)│
├─────────────────┤    ├─────────────────┤
│ • mDNS发现      │◄───│• mDNS广播       │
│ • 密码验证      │    │• 密码验证       │
│ • SQLite存储    │    │• 命令执行器     │
│ • Ping检测      │    │• 日志系统       │
│ • UI界面        │    │• 日志UI显示     │
└─────────────────┘    └─────────────────┘
```

### 2.2 组件模块设计

#### 2.2.1 计算机端（服务端）模块
1. **mDNS广播模块**
   - 广播服务信息到局域网
   - 响应发现请求
   - 服务描述：设备名、IP、端口、版本等

2. **认证模块**
   - 密码配置与管理
   - 会话令牌生成
   - 基于HMAC的挑战-响应认证

3. **命令执行模块**
   - 安全命令解析
   - 权限验证
   - 跨平台命令适配（Windows/macOS/Linux）

4. **日志系统**
   - 结构化日志记录
   - 日志分级（INFO、WARN、ERROR）
   - 日志查询与过滤

5. **HTTP/WebSocket API**
   - RESTful API设计
   - WebSocket实时通信
   - 请求验证中间件

#### 2.2.2 移动端（客户端）模块
1. **设备发现模块**
   - mDNS服务发现
   - 设备列表管理
   - 自动发现与手动添加

2. **认证管理模块**
   - 密码存储（加密）
   - 自动认证流程
   - 令牌缓存管理

3. **设备状态监控**
   - 心跳检测（Ping）
   - 在线状态管理
   - 连接质量监测

4. **数据持久化模块**
   - SQLite数据库设计
   - 设备信息存储
   - 操作历史记录

5. **用户界面模块**
   - 设备列表视图
   - 控制面板
   - 设置页面

## 3. 详细功能需求

### 3.1 计算机端功能需求

#### 3.1.1 mDNS服务广播
- 开机自动启动mDNS服务
- 广播服务信息：
  - 服务名称：`_lanmanager._tcp.local`
  - 端口：自定义端口（默认8080）
  - TXT记录：设备名、版本、认证要求
- 支持服务发现响应

#### 3.1.2 认证系统
- 首次运行强制设置管理密码
- 密码哈希存储（Argon2id）
- 支持修改密码
- 会话管理：
  - JWT令牌（短期有效）
  - 令牌吊销机制
- 认证流程：
  1. 客户端发起认证请求
  2. 服务端发送随机挑战（nonce）
  3. 客户端返回HMAC(密码, nonce)
  4. 服务端验证并颁发令牌

#### 3.1.3 命令执行系统
- **支持的命令类型**：
  1. 系统控制
     - 关机（延迟关机）
     - 重启
     - 休眠/睡眠
     - 锁定屏幕
  2. 命令执行
     - Shell命令执行（可配置白名单）
     - 脚本执行
  3. 系统信息
     - 获取系统状态
     - 获取进程列表
     - 磁盘使用情况
- **安全限制**：
  - 命令白名单配置
  - 执行超时限制
  - 权限分级（管理员/普通用户）

#### 3.1.4 日志系统
- **日志分类**：
  - 认证日志（登录成功/失败）
  - 命令执行日志
  - 系统事件日志
  - 错误日志
- **日志存储**：
  - 本地文件存储（log4rs）
  - 内存缓存（最近1000条）
  - 支持日志导出
- **日志查看**：
  - 实时日志显示
  - 日志过滤与搜索
  - 日志级别筛选

#### 3.1.5 Web API接口
```
API端点设计：
POST /api/auth/challenge     # 获取认证挑战
POST /api/auth/login         # 提交认证
POST /api/system/shutdown    # 关机
POST /api/system/restart     # 重启
POST /api/command/execute    # 执行命令
GET  /api/system/info        # 获取系统信息
GET  /api/logs               # 获取日志
WS   /ws                     # WebSocket连接
```

### 3.2 移动端功能需求

#### 3.2.1 设备发现与管理
- 自动扫描局域网设备
- 手动添加设备（IP+端口）
- 设备列表分类（在线/离线）
- 设备重命名与分组
- 最近连接设备快速访问

#### 3.2.2 认证流程
- 首次连接输入密码
- 密码本地加密存储（Keychain/iOS Keystore/Android Keystore）
- 自动认证（保存的设备）
- 支持多设备不同密码

#### 3.2.3 设备控制
- 设备状态卡片显示
- 快速操作按钮（关机、重启）
- 自定义命令输入
- 命令历史记录
- 批量操作（多个设备同时执行）

#### 3.2.4 状态监控
- 定时心跳检测（可配置间隔）
- 实时状态显示
- 连接质量指示
- 离线告警通知

#### 3.2.5 数据存储设计
```sql
-- SQLite表结构
CREATE TABLE devices (
    id INTEGER PRIMARY KEY,
    uuid TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    ip_address TEXT NOT NULL,
    port INTEGER DEFAULT 8080,
    auth_token TEXT,  -- 加密存储
    last_seen TIMESTAMP,
    is_online BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE command_history (
    id INTEGER PRIMARY KEY,
    device_id INTEGER,
    command TEXT NOT NULL,
    result TEXT,
    status TEXT,  -- success/failed/timeout
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES devices(id)
);

CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT
);
```

## 4. 技术实现细节

### 4.1 Rust后端核心实现

#### 4.1.1 mDNS实现（使用mdns-sd）
```rust
use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};
use std::net::IpAddr;

struct MdnsService {
    daemon: ServiceDaemon,
    service_info: ServiceInfo,
}

impl MdnsService {
    async fn new(device_name: &str, port: u16) -> Self {
        let daemon = ServiceDaemon::new().expect("Failed to create daemon");
        
        let hostname = format!("{}.local", device_name);
        let service_type = "_lanmanager._tcp.local";
        let instance_name = format!("{}'s Computer", device_name);
        
        let service_info = ServiceInfo::new(
            service_type,
            &instance_name,
            &hostname,
            "127.0.0.1",
            port,
            Some([
                ("version", "1.0"),
                ("auth", "required"),
                ("device", device_name),
            ].to_vec()),
        ).unwrap();
        
        Self { daemon, service_info }
    }
    
    async fn broadcast(&self) -> Result<(), Box<dyn Error>> {
        self.daemon.register(self.service_info.clone())
            .expect("Failed to register service");
        Ok(())
    }
}
```

#### 4.1.2 认证系统实现
```rust
use argon2::Argon2;
use rand::Rng;
use hmac::{Hmac, Mac};
use sha2::Sha256;

#[derive(Clone)]
struct AuthManager {
    password_hash: String,
    jwt_secret: String,
    sessions: Arc<Mutex<HashMap<String, Session>>>,
}

impl AuthManager {
    fn authenticate(&self, challenge: &str, response: &str) -> Result<String, AuthError> {
        // 验证HMAC响应
        let expected = self.calculate_hmac(challenge);
        if expected != response {
            return Err(AuthError::InvalidCredentials);
        }
        
        // 生成JWT令牌
        let token = self.generate_token();
        self.sessions.lock().unwrap().insert(token.clone(), Session {
            created_at: Utc::now(),
            last_access: Utc::now(),
        });
        
        Ok(token)
    }
    
    fn generate_token(&self) -> String {
        // 实现JWT生成逻辑
        // ...
    }
}
```

#### 4.1.3 命令执行器
```rust
#[derive(Debug, Clone)]
struct CommandExecutor {
    whitelist: Vec<String>,
    timeout: Duration,
}

impl CommandExecutor {
    async fn execute(&self, command: Command) -> Result<CommandResult, ExecutionError> {
        // 检查命令是否在白名单中
        if !self.is_allowed(&command) {
            return Err(ExecutionError::CommandNotAllowed);
        }
        
        // 根据平台执行命令
        #[cfg(target_os = "windows")]
        let output = self.execute_windows(command).await;
        
        #[cfg(target_os = "linux")]
        let output = self.execute_linux(command).await;
        
        #[cfg(target_os = "macos")]
        let output = self.execute_macos(command).await;
        
        // 记录日志
        self.log_execution(&command, &output);
        
        output
    }
}
```

### 4.2 前端实现建议

#### 4.2.1 状态管理
- 使用Zustand或Jotai进行状态管理
- 设备状态实时更新
- 命令执行队列管理

#### 4.2.2 UI组件
- 设备卡片组件
- 命令终端组件
- 日志查看器组件
- 设置面板组件

### 4.3 通信协议设计

#### 4.3.1 HTTP API规范
```rust
// 请求/响应结构示例
#[derive(Serialize, Deserialize)]
struct AuthRequest {
    challenge: String,
    response: String,
}

#[derive(Serialize, Deserialize)]
struct AuthResponse {
    token: String,
    expires_in: u64,
}

#[derive(Serialize, Deserialize)]
struct CommandRequest {
    command: String,
    args: Vec<String>,
    timeout: Option<u64>,
}

#[derive(Serialize, Deserialize)]
struct CommandResponse {
    stdout: String,
    stderr: String,
    exit_code: i32,
    execution_time: u64,
}
```

#### 4.3.2 WebSocket消息
```json
{
  "type": "status_update",
  "data": {
    "online": true,
    "cpu_usage": 45.2,
    "memory_usage": 3276
  }
}
```

## 5. 安全设计

### 5.1 认证安全
- 使用挑战-响应认证防止重放攻击
- JWT令牌短期有效（默认1小时）
- 令牌刷新机制
- 失败尝试限制（5次失败后锁定）

### 5.2 通信安全
- 所有通信使用HTTPS/WSS（Tauri内置）
- 实现CORS策略
- 请求频率限制

### 5.3 数据安全
- 密码使用Argon2id哈希
- 敏感数据内存中加密
- SQLite数据库加密（移动端）
- 日志脱敏处理

## 6. 部署与配置

### 6.1 计算机端配置
```toml
# config.toml

[auth]
password_hash = "$argon2id$v=19$..."  # 首次运行生成
require_auth = true

[commands]
whitelist = [
    "shutdown",
    "restart",
    "sleep",
    "lock"
]
timeout_seconds = 30

[logging]
level = "info"
max_files = 10
max_size_mb = 10
```

### 6.2 移动端配置
- 自动发现开关
- Ping间隔设置（默认30秒）
- 通知设置
- 主题设置

## 7. 开发计划

### 阶段1：核心功能
- [ ] Rust后端框架搭建
- [ ] mDNS服务发现实现
- [ ] 基础认证系统
- [ ] 命令执行模块

### 阶段2：API与通信
- [ ] HTTP REST API实现
- [ ] WebSocket实时通信
- [ ] 移动端网络层

### 阶段3：移动端功能
- [ ] 设备发现UI
- [ ] 认证流程
- [ ] SQLite集成
- [ ] 基础控制功能

### 阶段4：高级功能
- [ ] 日志系统
- [ ] 多设备管理
- [ ] 批量操作
- [ ] 通知系统

### 阶段5：优化与测试
- [ ] 性能优化
- [ ] 安全审计
- [ ] 跨平台测试
- [ ] 文档编写

## 8. 注意事项

### 8.1 跨平台兼容性
- Windows命令使用`cmd /c`
- Linux/macOS命令使用`bash -c`
- 权限提升处理（sudo/UAC）

### 8.2 网络环境
- 处理多网卡情况
- 防火墙配置提示
- 局域网隔离环境适配

### 8.3 资源管理
- 内存泄漏预防
- 连接池管理
- 文件描述符限制

### 8.4 用户体验
- 首次使用向导
- 错误友好提示
- 离线模式支持

## 9. 扩展可能性

### 未来功能
1. **插件系统**：支持自定义命令插件
2. **脚本市场**：预置常用管理脚本
3. **远程桌面**：VNC/RDP集成
4. **文件传输**：安全的文件传输功能
5. **集群管理**：多设备批量管理
6. **云端同步**：设备列表云端备份

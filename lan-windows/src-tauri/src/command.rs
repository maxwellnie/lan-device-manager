use crate::config::get_config;
use crate::models::{CommandResult, SystemInfo};
use encoding_rs::GBK;
use std::process::Command;
use std::time::Instant;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// 将 GBK 编码的字节转换为 UTF-8 字符串
/// 如果转换失败，则返回原始字节的 lossy 转换
fn decode_gbk_to_utf8(bytes: &[u8]) -> String {
    // 首先尝试作为 UTF-8 解码（如果已经是 UTF-8）
    if let Ok(s) = String::from_utf8(bytes.to_vec()) {
        return s;
    }

    // 尝试 GBK 解码
    let (cow, _, had_errors) = GBK.decode(bytes);
    if !had_errors {
        return cow.to_string();
    }

    // 如果 GBK 解码也有错误，使用 lossy 转换
    String::from_utf8_lossy(bytes).to_string()
}

/// 设置 Windows 命令行 UTF-8 编码
#[cfg(target_os = "windows")]
fn set_utf8_encoding() {
    // 设置控制台代码页为 UTF-8 (65001)，不显示窗口
    let _ = Command::new("cmd")
        .args(["/C", "chcp", "65001"])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
}

#[cfg(not(target_os = "windows"))]
fn set_utf8_encoding() {}

pub struct CommandExecutor {
    timeout_seconds: u64,
}

impl CommandExecutor {
    pub fn new() -> Self {
        Self {
            timeout_seconds: 30,
        }
    }

    /// 获取当前的白名单（从配置读取）
    fn get_whitelist(&self) -> Vec<String> {
        let config = get_config();
        // 白名单只包含显式启用的命令（内置命令的勾选状态）
        // 自定义命令是否可执行取决于它是否在 command_whitelist 中
        config.command_whitelist.clone()
    }

    /// 执行命令
    pub fn execute(
        &self,
        command_type: &str,
        args: Option<&[String]>,
    ) -> Result<CommandResult, String> {
        // 设置 UTF-8 编码
        set_utf8_encoding();

        let start = Instant::now();

        // 检查是否是自定义命令
        let config = get_config();
        let is_custom_command = config.custom_commands.contains(&command_type.to_string());
        
        log::info!("Executing command: {}, is_custom: {}, whitelist: {:?}, custom_commands: {:?}", 
            command_type, is_custom_command, config.command_whitelist, config.custom_commands);

        if is_custom_command {
            // 自定义命令：先检查 "custom" 总开关
            if !self.is_allowed("custom") {
                log::warn!("Custom commands are disabled. 'custom' not in whitelist: {:?}", config.command_whitelist);
                return Ok(CommandResult {
                    success: false,
                    stdout: String::new(),
                    stderr: "Custom commands are disabled. Please enable 'Custom Commands' in the whitelist.".to_string(),
                    exit_code: Some(-1),
                    execution_time_ms: start.elapsed().as_millis() as u64,
                });
            }
            // 再检查具体命令是否在白名单中
            if !self.is_allowed(command_type) {
                log::warn!("Command '{}' is not in whitelist: {:?}", command_type, config.command_whitelist);
                return Ok(CommandResult {
                    success: false,
                    stdout: String::new(),
                    stderr: format!("Command '{}' is not in whitelist. Current whitelist: {:?}", command_type, config.command_whitelist),
                    exit_code: Some(-1),
                    execution_time_ms: start.elapsed().as_millis() as u64,
                });
            }
        } else {
            // 内置命令：直接检查是否在白名单中
            if !self.is_allowed(command_type) {
                return Ok(CommandResult {
                    success: false,
                    stdout: String::new(),
                    stderr: format!("Command '{}' is not in whitelist", command_type),
                    exit_code: Some(-1),
                    execution_time_ms: start.elapsed().as_millis() as u64,
                });
            }
        }

        let result = match command_type {
            "shutdown" => self.execute_shutdown(args),
            "restart" => self.execute_restart(args),
            "sleep" => self.execute_sleep(),
            "lock" => self.execute_lock(),
            "systeminfo" => self.execute_systeminfo(),
            "tasklist" => self.execute_tasklist(),
            "wmic" => self.execute_wmic(args),
            _ => {
                if is_custom_command {
                    self.execute_custom(command_type, args)
                } else {
                    return Ok(CommandResult {
                        success: false,
                        stdout: String::new(),
                        stderr: format!("Unknown command '{}'", command_type),
                        exit_code: Some(-1),
                        execution_time_ms: start.elapsed().as_millis() as u64,
                    });
                }
            }
        };

        let execution_time_ms = start.elapsed().as_millis() as u64;

        match result {
            Ok(output) => {
                // 尝试将 GBK 编码的输出转换为 UTF-8
                let stdout = decode_gbk_to_utf8(&output.stdout);
                let stderr = decode_gbk_to_utf8(&output.stderr);

                Ok(CommandResult {
                    success: output.status.success(),
                    stdout,
                    stderr,
                    exit_code: output.status.code(),
                    execution_time_ms,
                })
            }
            Err(e) => Ok(CommandResult {
                success: false,
                stdout: String::new(),
                stderr: format!("Execution error: {}", e),
                exit_code: Some(-1),
                execution_time_ms,
            }),
        }
    }

    /// 检查命令是否允许执行
    fn is_allowed(&self, command: &str) -> bool {
        let whitelist = self.get_whitelist();
        whitelist.iter().any(|c| c == command)
    }

    /// 执行关机命令
    fn execute_shutdown(
        &self,
        args: Option<&[String]>,
    ) -> Result<std::process::Output, std::io::Error> {
        let delay = args
            .and_then(|a| a.first())
            .and_then(|s| s.parse::<u32>().ok())
            .unwrap_or(0);

        #[cfg(target_os = "windows")]
        {
            let mut cmd = Command::new("shutdown");
            cmd.arg("/s").arg("/t").arg(delay.to_string());
            cmd.creation_flags(CREATE_NO_WINDOW).output()
        }

        #[cfg(target_os = "linux")]
        {
            let mut cmd = Command::new("shutdown");
            if delay > 0 {
                cmd.arg(format!("+{}", delay / 60));
            } else {
                cmd.arg("now");
            }
            cmd.output()
        }

        #[cfg(target_os = "macos")]
        {
            let mut cmd = Command::new("shutdown");
            cmd.arg("-h");
            if delay > 0 {
                cmd.arg(format!("+{}", delay / 60));
            } else {
                cmd.arg("now");
            }
            cmd.output()
        }
    }

    /// 执行重启命令
    fn execute_restart(
        &self,
        args: Option<&[String]>,
    ) -> Result<std::process::Output, std::io::Error> {
        let delay = args
            .and_then(|a| a.first())
            .and_then(|s| s.parse::<u32>().ok())
            .unwrap_or(0);

        #[cfg(target_os = "windows")]
        {
            let mut cmd = Command::new("shutdown");
            cmd.arg("/r").arg("/t").arg(delay.to_string());
            cmd.creation_flags(CREATE_NO_WINDOW).output()
        }

        #[cfg(target_os = "linux")]
        {
            let mut cmd = Command::new("reboot");
            cmd.output()
        }

        #[cfg(target_os = "macos")]
        {
            let mut cmd = Command::new("reboot");
            cmd.output()
        }
    }

    /// 执行睡眠/休眠命令
    fn execute_sleep(&self) -> Result<std::process::Output, std::io::Error> {
        #[cfg(target_os = "windows")]
        {
            Command::new("rundll32")
                .args(["powrprof.dll,SetSuspendState", "0,1,0"])
                .creation_flags(CREATE_NO_WINDOW)
                .output()
        }

        #[cfg(target_os = "linux")]
        {
            Command::new("systemctl").arg("suspend").output()
        }

        #[cfg(target_os = "macos")]
        {
            Command::new("pmset").args(["sleepnow"]).output()
        }
    }

    /// 执行锁屏命令
    fn execute_lock(&self) -> Result<std::process::Output, std::io::Error> {
        #[cfg(target_os = "windows")]
        {
            Command::new("rundll32")
                .args(["user32.dll,LockWorkStation"])
                .creation_flags(CREATE_NO_WINDOW)
                .output()
        }

        #[cfg(target_os = "linux")]
        {
            // Try gnome-screensaver-command or loginctl
            Command::new("loginctl").arg("lock-session").output()
        }

        #[cfg(target_os = "macos")]
        {
            Command::new(
                "/System/Library/CoreServices/Menu Extras/User.menu/Contents/Resources/CGSession",
            )
            .arg("-suspend")
            .output()
        }
    }

    /// 获取系统信息
    fn execute_systeminfo(&self) -> Result<std::process::Output, std::io::Error> {
        #[cfg(target_os = "windows")]
        {
            // 使用 cmd /c 执行，先设置 UTF-8 编码，不显示窗口
            Command::new("cmd")
                .args(["/c", "chcp", "65001", ">nul", "&&", "systeminfo"])
                .creation_flags(CREATE_NO_WINDOW)
                .output()
        }

        #[cfg(target_os = "linux")]
        {
            Command::new("uname").args(["-a"]).output()
        }

        #[cfg(target_os = "macos")]
        {
            Command::new("uname").args(["-a"]).output()
        }
    }

    /// 获取进程列表
    fn execute_tasklist(&self) -> Result<std::process::Output, std::io::Error> {
        #[cfg(target_os = "windows")]
        {
            Command::new("tasklist")
                .creation_flags(CREATE_NO_WINDOW)
                .output()
        }

        #[cfg(target_os = "linux")]
        {
            Command::new("ps").args(&["aux"]).output()
        }

        #[cfg(target_os = "macos")]
        {
            Command::new("ps").args(&["aux"]).output()
        }
    }

    /// 执行 WMIC 命令
    fn execute_wmic(
        &self,
        args: Option<&[String]>,
    ) -> Result<std::process::Output, std::io::Error> {
        #[cfg(target_os = "windows")]
        {
            let mut cmd = Command::new("wmic");
            cmd.creation_flags(CREATE_NO_WINDOW);
            if let Some(arguments) = args {
                cmd.args(arguments);
            }
            cmd.output()
        }

        #[cfg(not(target_os = "windows"))]
        {
            // WMIC 是 Windows 特有的，其他平台返回错误
            Err(std::io::Error::new(
                std::io::ErrorKind::Unsupported,
                "WMIC is only available on Windows",
            ))
        }
    }

    /// 执行自定义命令
    fn execute_custom(
        &self,
        command: &str,
        args: Option<&[String]>,
    ) -> Result<std::process::Output, std::io::Error> {
        #[cfg(target_os = "windows")]
        {
            // 在 Windows 上使用 cmd /c 执行，确保 UTF-8 编码，不显示窗口
            // 构建完整的命令字符串，而不是使用 && 连接
            let mut full_cmd = format!("chcp 65001 >nul && {}", command);
            if let Some(arguments) = args {
                let args_str = arguments.join(" ");
                full_cmd.push(' ');
                full_cmd.push_str(&args_str);
            }
            Command::new("cmd")
                .args(["/c", &full_cmd])
                .creation_flags(CREATE_NO_WINDOW)
                .output()
        }

        #[cfg(not(target_os = "windows"))]
        {
            let mut cmd = Command::new(command);
            if let Some(arguments) = args {
                cmd.args(arguments);
            }
            cmd.output()
        }
    }
}

impl Default for CommandExecutor {
    fn default() -> Self {
        Self::new()
    }
}

/// 获取系统信息
pub fn get_system_info() -> Result<SystemInfo, String> {
    // 设置 UTF-8 编码
    set_utf8_encoding();

    let hostname = hostname::get()
        .map_err(|e| e.to_string())?
        .into_string()
        .unwrap_or_else(|_| "unknown".to_string());

    #[cfg(target_os = "windows")]
    let (os_type, os_version) = { ("Windows".to_string(), get_windows_version()) };

    #[cfg(target_os = "linux")]
    let (os_type, os_version) = { ("Linux".to_string(), get_linux_version()) };

    #[cfg(target_os = "macos")]
    let (os_type, os_version) = { ("macOS".to_string(), get_macos_version()) };

    let architecture = std::env::consts::ARCH.to_string();

    // 获取内存信息（简化版）
    let (memory_total, memory_used) = get_memory_info();

    // 获取CPU使用率（简化版）
    let cpu_usage = get_cpu_usage();

    // 获取系统运行时间
    let uptime_seconds = get_uptime();

    Ok(SystemInfo {
        os_type,
        os_version,
        hostname,
        architecture,
        cpu_usage,
        memory_total,
        memory_used,
        uptime_seconds,
    })
}

#[cfg(target_os = "windows")]
fn get_windows_version() -> String {
    Command::new("cmd")
        .args(["/c", "wmic", "os", "get", "caption", "/value"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()
        .and_then(|o| {
            let text = decode_gbk_to_utf8(&o.stdout);
            text.lines()
                .find(|l| l.starts_with("Caption="))
                .map(|l| l.trim_start_matches("Caption=").trim().to_string())
        })
        .unwrap_or_else(|| "Unknown".to_string())
}

#[cfg(target_os = "linux")]
fn get_linux_version() -> String {
    std::fs::read_to_string("/etc/os-release")
        .ok()
        .and_then(|content| {
            content
                .lines()
                .find(|l| l.starts_with("PRETTY_NAME="))
                .map(|l| {
                    l.trim_start_matches("PRETTY_NAME=")
                        .trim_matches('"')
                        .to_string()
                })
        })
        .unwrap_or_else(|| "Unknown".to_string())
}

#[cfg(target_os = "macos")]
fn get_macos_version() -> String {
    Command::new("sw_vers")
        .args(["-productVersion"])
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| "Unknown".to_string())
}

fn get_memory_info() -> (u64, u64) {
    #[cfg(target_os = "windows")]
    {
        Command::new("wmic")
            .args(["computersystem", "get", "totalphysicalmemory", "/value"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .ok()
            .and_then(|o| {
                let text = String::from_utf8_lossy(&o.stdout);
                text.lines()
                    .find(|l| l.starts_with("TotalPhysicalMemory="))
                    .and_then(|l| {
                        l.trim_start_matches("TotalPhysicalMemory=")
                            .trim()
                            .parse::<u64>()
                            .ok()
                    })
            })
            .map(|total| (total / 1024 / 1024, total / 1024 / 1024 / 2)) // 简化计算
            .unwrap_or((0, 0))
    }

    #[cfg(target_os = "linux")]
    {
        std::fs::read_to_string("/proc/meminfo")
            .ok()
            .and_then(|content| {
                let total = content
                    .lines()
                    .find(|l| l.starts_with("MemTotal:"))
                    .and_then(|l| l.split_whitespace().nth(1))
                    .and_then(|s| s.parse::<u64>().ok());
                let available = content
                    .lines()
                    .find(|l| l.starts_with("MemAvailable:"))
                    .and_then(|l| l.split_whitespace().nth(1))
                    .and_then(|s| s.parse::<u64>().ok());

                match (total, available) {
                    (Some(t), Some(a)) => (t / 1024, (t - a) / 1024),
                    _ => (0, 0),
                }
            })
            .unwrap_or((0, 0))
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("sysctl")
            .args(&["-n", "hw.memsize"])
            .output()
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .and_then(|s| s.trim().parse::<u64>().ok())
            .map(|total| (total / 1024 / 1024, total / 1024 / 1024 / 2))
            .unwrap_or((0, 0))
    }
}

fn get_cpu_usage() -> f32 {
    // 简化实现，实际应该使用系统API
    0.0
}

fn get_uptime() -> u64 {
    #[cfg(target_os = "windows")]
    {
        Command::new("wmic")
            .args(["os", "get", "lastbootuptime", "/value"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .ok()
            .map(|_| {
                // 解析Windows时间格式
                0 // 简化处理
            })
            .unwrap_or(0)
    }

    #[cfg(target_os = "linux")]
    {
        std::fs::read_to_string("/proc/uptime")
            .ok()
            .and_then(|content| {
                content
                    .split_whitespace()
                    .next()
                    .and_then(|s| s.parse::<f64>().ok())
                    .map(|u| u as u64)
            })
            .unwrap_or(0)
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("sysctl")
            .args(&["-n", "kern.boottime"])
            .output()
            .ok()
            .and_then(|o| {
                // 解析macOS启动时间
                Some(0) // 简化处理
            })
            .unwrap_or(0)
    }
}

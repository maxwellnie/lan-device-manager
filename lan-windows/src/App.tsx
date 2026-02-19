import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import "./App.css";
import Settings from "./components/Settings";
import TitleBar from "./components/TitleBar";
import LoadingScreen from "./components/LoadingScreen";
import { useTimerManager } from "./utils/useTimerManager";
import { performanceMonitor } from "./utils/performanceMonitor";

// 类型定义
interface ServerStatus {
  running: boolean;
  port: number | null;
  device_name: string;
  ip_address: string | null;
  version: string;
}

interface SystemInfo {
  os_type: string;
  os_version: string;
  hostname: string;
  architecture: string;
  cpu_usage: number;
  memory_total: number;
  memory_used: number;
  uptime_seconds: number;
}

interface LogEntry {
  timestamp: string;
  level: "Info" | "Warn" | "Error" | "Success" | "System";
  category: string;
  message: string;
  source: string | null;
}

type Theme = "light" | "dark" | "system" | "glass";

interface AppConfig {
  api_port: number;
  password_hash: string | null;
  log_buffer_size: number;
  log_file_path: string | null;
  enable_log_file: boolean;
  log_file_max_size: number;
  auto_start_api: boolean;
  auto_start_on_boot: boolean;
  command_whitelist: string[];
  custom_commands: string[];
  theme: Theme;
  ip_blacklist: string[];
  enable_ip_blacklist: boolean;
}

// 辅助函数：检查配置是否有密码
const hasPassword = (config: AppConfig | null): boolean => {
  return config?.password_hash !== null && config?.password_hash !== undefined && config?.password_hash !== "";
};

function App() {
  const { t } = useTranslation();

  // 状态
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [logFilter, setLogFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<Theme>("system");
  const [isWindowVisible, setIsWindowVisible] = useState(true);

  // 定时器管理器
  const { setManagedInterval, setManagedTimeout, clearManagedTimer } = useTimerManager(isWindowVisible);

  // 初始化 - 只执行一次
  useEffect(() => {
    const init = async () => {
      // 先加载配置（显示加载界面）
      const cfg = await loadConfig();

      // 应用主题
      if (cfg?.theme) {
        applyTheme(cfg.theme);
      }

      // 配置加载完成后，再加载其他数据
      await refreshStatus();
      await fetchSystemInfo();
      await fetchLogs();

      // 所有数据加载完成后，隐藏加载界面
      setIsInitializing(false);

      // 配置加载完成后再自动启动服务
      await autoStartServer(cfg);
    };
    init();

    // 禁用右键菜单
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      return false;
    };

    // 禁用文本选择（除了日志搜索栏和日志视图）
    const handleSelectStart = (e: Event) => {
      const target = e.target as HTMLElement;
      // 允许日志搜索栏和日志内容区域的选择
      if (
        target.closest('.search-box') ||
        target.closest('.logs-content') ||
        target.closest('input') ||
        target.closest('textarea')
      ) {
        return true;
      }
      e.preventDefault();
      return false;
    };

    document.addEventListener('contextmenu', handleContextMenu, true);
    document.addEventListener('selectstart', handleSelectStart, true);

    // GPU 状态切换函数
    const enterGpuSavingMode = () => {
      console.log('Entering GPU saving mode...');
      pauseAllAnimations();
      document.documentElement.classList.add('gpu-saving-mode');
      document.body.style.visibility = 'hidden';
      document.body.style.opacity = '0';
      performanceMonitor.stopMonitoring();
      
      if (config?.theme === 'glass') {
        console.log('Glass theme: releasing GPU-intensive effects');
      }
    };

    const exitGpuSavingMode = () => {
      console.log('Exiting GPU saving mode...');
      document.body.style.visibility = 'visible';
      document.body.style.opacity = '1';
      document.documentElement.classList.remove('gpu-saving-mode');
      setTimeout(() => resumeAllAnimations(), 100);
      performanceMonitor.startMonitoring(10000);
      
      if (serverStatus?.running) {
        fetchLogs();
      }
    };

    // 监听窗口可见性变化（由后端发送）- 统一处理最小化、隐藏、关闭等
    const setupVisibilityListener = async () => {
      const unlisten = await listen<boolean>('window-visible', (event) => {
        const isVisible = event.payload;
        setIsWindowVisible(isVisible);
        
        if (isVisible) {
          exitGpuSavingMode();
        } else {
          enterGpuSavingMode();
        }
      });
      
      return unlisten;
    };

    const cleanupVisibility = setupVisibilityListener();

    // 监听页面可见性变化（visibilitychange事件）- 作为备用机制
    const handleVisibilityChange = () => {
      const isVisible = !document.hidden;
      setIsWindowVisible(isVisible);
      
      if (isVisible) {
        exitGpuSavingMode();
      } else {
        enterGpuSavingMode();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // 初始状态检查
    handleVisibilityChange();

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu, true);
      document.removeEventListener('selectstart', handleSelectStart, true);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      cleanupVisibility.then(cleanup => cleanup());
    };
  }, []); // 空依赖数组，只执行一次

  // 定时刷新日志 - 使用定时器管理器
  useEffect(() => {
    if (!serverStatus?.running) return;

    // 使用定时器管理器注册日志刷新定时器
    const timerId = setManagedInterval(() => {
      fetchLogs();
    }, 5000, 'log_refresh_timer');

    return () => {
      clearManagedTimer(timerId);
    };
  }, [serverStatus?.running, setManagedInterval, clearManagedTimer]);

  // 监听托盘事件 - 使用 ref 防止重复触发
  const isProcessingRef = useRef(false);

  useEffect(() => {
    // 监听托盘启动服务事件
    const unlistenStart = listen('tray-start-server', async () => {
      if (isProcessingRef.current) return;
      isProcessingRef.current = true;
      
      try {
        const status = await invoke<ServerStatus>('get_server_status');
        if (!status.running) {
          await startServer();
        }
      } finally {
        setTimeout(() => {
          isProcessingRef.current = false;
        }, 1000); // 1秒后重置标志
      }
    });

    // 监听托盘停止服务事件
    const unlistenStop = listen('tray-stop-server', async () => {
      if (isProcessingRef.current) return;
      isProcessingRef.current = true;
      
      try {
        const status = await invoke<ServerStatus>('get_server_status');
        if (status.running) {
          await stopServer();
        }
      } finally {
        setTimeout(() => {
          isProcessingRef.current = false;
        }, 1000); // 1秒后重置标志
      }
    });

    return () => {
      unlistenStart.then(fn => fn());
      unlistenStop.then(fn => fn());
    };
  }, []); // 空依赖数组，只注册一次

  // 加载配置（带重试机制）
  const loadConfig = async (retries = 3): Promise<AppConfig | null> => {
    for (let i = 0; i < retries; i++) {
      try {
        const cfg = await invoke<AppConfig>("get_config");
        setConfig(cfg);
        return cfg;
      } catch (error) {
        console.error(`Failed to load config (attempt ${i + 1}/${retries}):`, error);
        if (i < retries - 1) {
          // 等待 500ms 后重试
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }
    // 所有重试都失败，使用默认配置
    const defaultConfig: AppConfig = {
      api_port: 8080,
      password_hash: null,
      log_buffer_size: 100,
      log_file_path: null,
      enable_log_file: true,
      log_file_max_size: 10,
      auto_start_api: false,
      auto_start_on_boot: false,
      command_whitelist: [],
      custom_commands: [],
      theme: 'system',
      ip_blacklist: [],
      enable_ip_blacklist: false
    };
    setConfig(defaultConfig);
    return defaultConfig;
  };

  // 自动启动服务
  const autoStartServer = async (cfg: AppConfig | null) => {
    try {
      if (cfg?.auto_start_api) {
        const status = await invoke<ServerStatus>("get_server_status");
        if (!status.running) {
          console.log("Auto-starting API server...");
          await startServer(cfg);
        }
      }
    } catch (error) {
      console.error("Failed to auto-start server:", error);
      // 自动启动失败不显示错误提示，避免用户刚打开应用就看到错误
      // 但如果用户手动点击启动，则会显示错误
    }
  };

  // 显示提示
  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
  };

  // 关闭 Toast
  const closeToast = () => {
    setToast(null);
  };

  // 刷新服务器状态
  const refreshStatus = async () => {
    try {
      const status = await invoke<ServerStatus>("get_server_status");
      setServerStatus(status);
    } catch (error) {
      console.error("Failed to get server status:", error);
    }
  };

  // 获取系统信息
  const fetchSystemInfo = async () => {
    try {
      const info = await invoke<SystemInfo>("get_system_info");
      setSystemInfo(info);
    } catch (error) {
      console.error("Failed to get system info:", error);
    }
  };

  // 获取日志
  const fetchLogs = async () => {
    try {
      const logs = await invoke<LogEntry[]>("get_logs", { limit: 100 });
      setLogs(logs);
    } catch (error) {
      console.error("Failed to get logs:", error);
    }
  };

  // 启动服务器
  const startServer = async (cfg?: AppConfig) => {
    const configToUse = cfg || config;
    if (!configToUse) {
      showToast(t('toast.configNotLoaded'), "error");
      return;
    }

    setIsLoading(true);
    try {
      await invoke("start_server", { port: configToUse.api_port });
      showToast(t('toast.serverStarted'));
      refreshStatus();
    } catch (error) {
      showToast(`${t('toast.serverStartFailed')}: ${error}`, "error");
    } finally {
      setIsLoading(false);
    }
  };

  // 停止服务器
  const stopServer = async () => {
    setIsLoading(true);
    try {
      await invoke("stop_server");
      showToast(t('toast.serverStopped'));
      refreshStatus();
    } catch (error) {
      showToast(`${t('toast.serverStopFailed')}: ${error}`, "error");
    } finally {
      setIsLoading(false);
    }
  };

  // 重启服务器（用于设置修改后）
  const restartServer = async () => {
    // 先停止服务器
    try {
      const status = await invoke<ServerStatus>("get_server_status");
      if (status.running) {
        await invoke("stop_server");
      }
    } catch (error) {
      console.error("Failed to stop server:", error);
    }

    // 重新加载配置
    const cfg = await loadConfig();

    // 启动服务器（使用新配置）
    if (cfg) {
      await startServer(cfg);
    }
  };

  // 切换服务器状态
  // 清空日志
  const clearLogs = async () => {
    try {
      await invoke("clear_logs");
      showToast(t('toast.logsCleared'));
      fetchLogs();
    } catch (error) {
      showToast(`${t('toast.logsClearFailed')}: ${error}`, "error");
    }
  };

  // 处理设置保存后的回调
  const handleSettingsClose = () => {
    setShowSettings(false);
    // 重新加载配置以获取最新的密码状态等
    loadConfig();
    refreshStatus();
  };

  // 处理主题变化（从Settings组件调用）
  const handleThemeChange = (newTheme: Theme) => {
    applyTheme(newTheme);

    // 注意：主题不再立即保存到配置，而是在用户点击"保存设置"时一起保存
    // 这样可以避免覆盖用户在设置界面做的其他未保存修改
  };

  // 应用主题
  const applyTheme = (theme: Theme) => {
    const root = document.documentElement;
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const effectiveTheme = theme === 'system' ? (systemPrefersDark ? 'dark' : 'light') : theme;

    setCurrentTheme(theme);
    root.setAttribute('data-theme', effectiveTheme);

    // 监听系统主题变化（当主题为 system 时）
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = (e: MediaQueryListEvent) => {
        root.setAttribute('data-theme', e.matches ? 'dark' : 'light');
      };
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  };

  // 切换主题
  const toggleTheme = () => {
    const themes: Theme[] = ['dark', 'light', 'system', 'glass'];
    const currentIndex = themes.indexOf(currentTheme);
    const nextTheme = themes[(currentIndex + 1) % themes.length];
    applyTheme(nextTheme);

    // 保存到配置
    if (config) {
      const newConfig = { ...config, theme: nextTheme };
      invoke("save_config", { newConfig }).catch(console.error);
    }
  };

  // 暂停所有CSS动画 - 优化版本
  const pauseAllAnimations = () => {
    // 方法1：使用CSS类暂停所有动画
    document.documentElement.classList.add('animations-paused');
    
    // 方法2：直接暂停已知的动画元素（更精确控制）
    const knownAnimations = [
      '.loading-spinner',      // 加载旋转动画
      '.loading-progress-bar', // 加载进度条动画
      '.pulse',               // 实时指示器脉冲动画
      '[data-theme="glass"] .device-info:hover', // 玻璃主题悬停动画
      '[data-theme="glass"] .btn:hover',        // 按钮悬停动画
    ];
    
    knownAnimations.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => {
        const style = (element as HTMLElement).style;
        // 保存原始动画状态
        const computedStyle = getComputedStyle(element);
        const animationPlayState = computedStyle.animationPlayState || computedStyle.webkitAnimationPlayState;
        
        if (animationPlayState && animationPlayState !== 'paused') {
          (element as any)._originalAnimationPlayState = animationPlayState;
          style.animationPlayState = 'paused';
          style.webkitAnimationPlayState = 'paused';
        }
      });
    });
    
    // 方法3：暂停所有正在运行的CSS动画（备用方案）
    const animatedElements = document.querySelectorAll('*');
    animatedElements.forEach(element => {
      const computedStyle = getComputedStyle(element);
      const animationName = computedStyle.animationName || computedStyle.webkitAnimationName;
      
      if (animationName && animationName !== 'none') {
        const style = (element as HTMLElement).style;
        const animationPlayState = computedStyle.animationPlayState || computedStyle.webkitAnimationPlayState;
        
        if (animationPlayState && animationPlayState !== 'paused') {
          // 保存原始状态
          if (!(element as any)._originalAnimationPlayState) {
            (element as any)._originalAnimationPlayState = animationPlayState;
          }
          // 暂停动画
          style.animationPlayState = 'paused';
          style.webkitAnimationPlayState = 'paused';
        }
      }
    });
    
    console.log('CSS animations paused (window hidden)');
  };

  // 恢复所有CSS动画 - 优化版本
  const resumeAllAnimations = () => {
    // 方法1：移除CSS类恢复动画
    document.documentElement.classList.remove('animations-paused');
    
    // 方法2：恢复已知动画元素的原始状态
    const knownAnimations = [
      '.loading-spinner',
      '.loading-progress-bar', 
      '.pulse',
      '[data-theme="glass"] .device-info:hover',
      '[data-theme="glass"] .btn:hover',
    ];
    
    knownAnimations.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => {
        const style = (element as HTMLElement).style;
        if ((element as any)._originalAnimationPlayState) {
          style.animationPlayState = (element as any)._originalAnimationPlayState;
          style.webkitAnimationPlayState = (element as any)._originalAnimationPlayState;
          delete (element as any)._originalAnimationPlayState;
        } else {
          // 如果没有保存的状态，默认恢复为运行状态
          style.animationPlayState = 'running';
          style.webkitAnimationPlayState = 'running';
        }
      });
    });
    
    // 方法3：恢复所有元素的动画状态（备用方案）
    const animatedElements = document.querySelectorAll('*');
    animatedElements.forEach(element => {
      const style = (element as HTMLElement).style;
      if ((element as any)._originalAnimationPlayState) {
        style.animationPlayState = (element as any)._originalAnimationPlayState;
        style.webkitAnimationPlayState = (element as any)._originalAnimationPlayState;
        delete (element as any)._originalAnimationPlayState;
      }
    });
    
    console.log('CSS animations resumed (window visible)');
  };

  // 过滤日志
  const filteredLogs = logs.filter((log) => {
    if (logFilter !== "all" && log.level.toLowerCase() !== logFilter) {
      return false;
    }
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        log.message.toLowerCase().includes(query) ||
        log.category.toLowerCase().includes(query)
      );
    }
    return true;
  });

  // 获取日志级别颜色
  const getLogLevelColor = (level: string) => {
    switch (level) {
      case "Info":
        return "#4ade80";
      case "Warn":
        return "#facc15";
      case "Error":
        return "#f87171";
      case "Success":
        return "#22d3ee";
      case "System":
        return "#a78bfa";
      default:
        return "#92a4c9";
    }
  };

  // 格式化时间戳
  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  // 获取当前显示的端口号（运行时优先使用实际端口，否则使用配置）
  const getCurrentPort = () => {
    if (serverStatus?.port) {
      return serverStatus.port;
    }
    return config?.api_port || 8080;
  };

  return (
    <div className="app">
      {/* Toast 通知 */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={closeToast}
          setManagedTimeout={setManagedTimeout}
          clearManagedTimer={clearManagedTimer}
        />
      )}

      {/* 设置页面 */}
      <Settings isOpen={showSettings} onClose={handleSettingsClose} onThemeChange={handleThemeChange} currentTheme={currentTheme} serverRunning={serverStatus?.running || false} onServerRestart={restartServer} />

      {/* 自定义标题栏 */}
      <TitleBar />

      <div className="container">
        {/* 左侧边栏 */}
        <aside className="sidebar">
          <div className="sidebar-content">
            <div className="device-info">
              <div className="device-header">
                <div className="device-icon">
                  <span className="material-icon">desktop_windows</span>
                </div>
                <div className="device-title">
                  <h2>{systemInfo?.hostname || "Unknown Device"}</h2>
                  <span className={`status-badge ${serverStatus?.running ? "online" : "offline"}`}>
                    {serverStatus?.running ? t('common.online') : t('common.offline')}
                  </span>
                </div>
              </div>
              <div className="device-details">
                <div className="detail-item">
                  <span className="detail-label">{t('sidebar.operatingSystem')}</span>
                  <div className="detail-value">
                    <span className="material-icon">computer</span>
                    <span>{systemInfo?.os_version || "Unknown"}</span>
                  </div>
                </div>
                <div className="detail-item">
                  <span className="detail-label">{t('sidebar.architecture')}</span>
                  <div className="detail-value">
                    <span className="material-icon">memory</span>
                    <span>{systemInfo?.architecture || "Unknown"}</span>
                  </div>
                </div>
                {serverStatus?.ip_address && (
                  <div className="detail-item">
                    <span className="detail-label">{t('sidebar.ipAddress')}</span>
                    <div className="detail-value">
                      <span className="material-icon">network_wifi</span>
                      <span>{serverStatus.ip_address}</span>
                    </div>
                  </div>
                )}
                {getCurrentPort() && (
                  <div className="detail-item">
                    <span className="detail-label">{t('sidebar.port')}</span>
                    <div className="detail-value">
                      <span className="material-icon">settings_ethernet</span>
                      <span>{getCurrentPort()}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 密码状态显示 */}
            <div className="password-section">
              <label className="section-label">{t('sidebar.accessPassword')}</label>
              <div className="password-display">
                <span className="password-mask">
                  {hasPassword(config) ? "********" : t('sidebar.passwordNotSetShort')}
                </span>
                <button
                  className="icon-btn"
                  onClick={() => setShowSettings(true)}
                  title={t('settings.password.updatePassword')}
                >
                  <span className="material-icon">edit</span>
                </button>
              </div>
              <small style={{ color: "#5c6b85", fontSize: "11px" }}>
                {hasPassword(config) ? t('sidebar.passwordSet') : t('sidebar.passwordNotSet')}
              </small>
            </div>

            {/* 服务器控制 */}
            <div className="server-control">
              <label className="section-label">{t('sidebar.serverControl')}</label>
              {serverStatus?.running ? (
                <button
                  className="btn btn-danger"
                  onClick={stopServer}
                  disabled={isLoading}
                >
                  <span className="material-icon">stop</span>
                  {isLoading ? t('sidebar.stopping') : t('sidebar.stopServer')}
                </button>
              ) : (
                <button
                  className="btn btn-success"
                  onClick={() => startServer()}
                  disabled={isLoading || !config}
                >
                  <span className="material-icon">play_arrow</span>
                  {isLoading ? t('sidebar.starting') : t('sidebar.startServer')}
                </button>
              )}
            </div>

            {/* 主题切换按钮 */}
            <div className="theme-section-btn">
              <button
                className="btn btn-outline"
                onClick={toggleTheme}
                title={`${t('sidebar.theme')}: ${currentTheme}`}
              >
                <span className="material-icon">
                  {currentTheme === 'dark' ? 'dark_mode' : currentTheme === 'light' ? 'light_mode' : currentTheme === 'glass' ? 'blur_on' : 'contrast'}
                </span>
                {currentTheme === 'dark' ? t('sidebar.darkTheme') : currentTheme === 'light' ? t('sidebar.lightTheme') : currentTheme === 'glass' ? t('sidebar.glassTheme') : t('sidebar.autoTheme')}
              </button>
            </div>

            {/* 设置按钮 */}
            <div className="settings-section-btn">
              <button
                className="btn btn-outline"
                onClick={() => setShowSettings(true)}
              >
                <span className="material-icon">settings</span>
                {t('common.settings')}
              </button>
            </div>

            <div className="version-info">
              Client Version {serverStatus?.version || "0.1.0"} (Stable)
            </div>
          </div>
        </aside>

        {/* 主内容区 */}
        <main className="main-content">
          <div className="logs-container">
            <div className="logs-header">
              <div className="logs-title">
                <span className="material-icon">terminal</span>
                <h3>{t('logs.title')}</h3>
              </div>
              <div className="logs-actions">
                <button
                  className="icon-btn"
                  onClick={fetchLogs}
                  title={t('common.refresh')}
                >
                  <span className="material-icon">refresh</span>
                </button>
                <button
                  className="icon-btn"
                  onClick={clearLogs}
                  title={t('common.clear')}
                >
                  <span className="material-icon">block</span>
                </button>
              </div>
            </div>

            <div className="logs-filter">
              <div className="search-box">
                <span className="material-icon">search</span>
                <input
                  type="text"
                  placeholder={t('logs.searchPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <select
                value={logFilter}
                onChange={(e) => setLogFilter(e.target.value)}
              >
                <option value="all">{t('logs.allLevels')}</option>
                <option value="info">{t('logs.info')}</option>
                <option value="warn">{t('logs.warning')}</option>
                <option value="error">{t('logs.error')}</option>
                <option value="success">{t('logs.success')}</option>
                <option value="system">{t('logs.system')}</option>
              </select>
            </div>

            <div className="logs-content" tabIndex={0}>
              {filteredLogs.length === 0 ? (
                <div className="logs-empty">{t('logs.noLogs')}</div>
              ) : (
                <pre className="logs-text">
                  {filteredLogs.map((log, index) => (
                    <div key={index} className="log-entry">
                      <span className="log-time">
                        {formatTimestamp(log.timestamp)}
                      </span>
                      <span
                        className="log-level"
                        style={{ color: getLogLevelColor(log.level) }}
                      >
                        {log.level.toUpperCase()}
                      </span>
                      <span className="log-message">{log.message}</span>
                    </div>
                  ))}
                </pre>
              )}
            </div>

            <div className="logs-footer">
              <div className="logs-stats">
                <span className="live-indicator">
                  <span className="pulse"></span>
                  {t('logs.liveMonitoring')}
                </span>
                <span>{filteredLogs.length} {t('logs.entries')}</span>
              </div>
              <span>{t('logs.lastUpdated')}</span>
            </div>
          </div>
        </main>
      </div>

      {/* 加载界面 */}
      <LoadingScreen isLoading={isInitializing} />
    </div>
  );
}

// Toast 组件 - 使用 Portal 渲染到 body
function Toast({ 
  message, 
  type, 
  onClose,
  setManagedTimeout,
  clearManagedTimer 
}: { 
  message: string; 
  type: "success" | "error"; 
  onClose: () => void;
  setManagedTimeout: (handler: () => void, delay: number, id?: string) => string;
  clearManagedTimer: (id: string) => void;
}) {
  useEffect(() => {
    const timerId = setManagedTimeout(onClose, 1500, `toast_${Date.now()}`);
    return () => {
      clearManagedTimer(timerId);
    };
  }, [onClose, setManagedTimeout, clearManagedTimer]);

  return createPortal(
    <div className={`toast ${type}`}>
      <span className="material-icon">
        {type === "success" ? "check_circle" : "error"}
      </span>
      <span>{message}</span>
    </div>,
    document.body
  );
}

export default App;

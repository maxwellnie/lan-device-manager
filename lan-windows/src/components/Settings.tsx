import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import "./Settings.css";

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

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
  onThemeChange?: (theme: Theme) => void;
  currentTheme?: Theme;
  serverRunning?: boolean;
  onServerRestart?: () => Promise<void>;
}

function Settings({ isOpen, onClose, onThemeChange, currentTheme, serverRunning, onServerRestart }: SettingsProps) {
  const { t, i18n } = useTranslation();
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // 表单状态
  const [apiPort, setApiPort] = useState(8080);
  const [logBufferSize, setLogBufferSize] = useState(100);
  const [enableLogFile, setEnableLogFile] = useState(true);
  const [logFileMaxSize, setLogFileMaxSize] = useState(10);
  const [autoStartApi, setAutoStartApi] = useState(false);
  const [autoStartOnBoot, setAutoStartOnBoot] = useState(false);
  const [logFilePath, setLogFilePath] = useState("");
  const [theme, setTheme] = useState<Theme>("system");
  const [language, setLanguage] = useState(i18n.language || "en");

  // 命令白名单和自定义命令
  const [commandWhitelist, setCommandWhitelist] = useState<string[]>([]);
  const [customCommands, setCustomCommands] = useState<string[]>([]);
  const [newCustomCommand, setNewCustomCommand] = useState("");

  // IP黑名单
  const [ipBlacklist, setIpBlacklist] = useState<string[]>([]);
  const [enableIpBlacklist, setEnableIpBlacklist] = useState(false);
  const [newBlockedIp, setNewBlockedIp] = useState("");

  // 内置命令列表（供用户选择）
  const builtInCommands = [
    { id: "shutdown", desc: t('commands.shutdownDesc') },
    { id: "restart", desc: t('commands.restartDesc') },
    { id: "sleep", desc: t('commands.sleepDesc') },
    { id: "lock", desc: t('commands.lockDesc') },
    { id: "systeminfo", desc: t('commands.systeminfoDesc') },
    { id: "tasklist", desc: t('commands.tasklistDesc') },
    { id: "wmic", desc: t('commands.wmicDesc') },
    { id: "custom", desc: t('commands.customDesc') },
  ];

  // 密码设置
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [hasPassword, setHasPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // 当设置页面打开时，加载配置
  useEffect(() => {
    if (isOpen) {
      loadConfig();
    }
  }, [isOpen]);

  // 当传入的 currentTheme 变化时，更新主题状态（仅在初始化时）
  useEffect(() => {
    if (currentTheme && !config) {
      setTheme(currentTheme);
    }
  }, [currentTheme]);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadConfig = async () => {
    try {
      const cfg = await invoke<AppConfig>("get_config");
      setConfig(cfg);
      setApiPort(cfg.api_port);
      setLogBufferSize(cfg.log_buffer_size);
      setEnableLogFile(cfg.enable_log_file);
      setLogFileMaxSize(cfg.log_file_max_size);
      setAutoStartApi(cfg.auto_start_api);
      // 从插件获取实际的开机自启动状态
      const autoStartEnabled = await isEnabled();
      setAutoStartOnBoot(autoStartEnabled);
      setLogFilePath(cfg.log_file_path || "");
      setCommandWhitelist(cfg.command_whitelist || []);
      setCustomCommands(cfg.custom_commands || []);
      setIpBlacklist(cfg.ip_blacklist || []);
      setEnableIpBlacklist(cfg.enable_ip_blacklist || false);
      // 只有在没有传入 currentTheme 时才从配置加载主题
      if (!currentTheme) {
        setTheme(cfg.theme || "dark");
      }

      // 检查是否有密码
      const hasPwd = await invoke<boolean>("has_config_password");
      setHasPassword(hasPwd);

      // 同步当前语言状态
      setLanguage(i18n.language || "en");
    } catch (error) {
      console.error("Failed to load config:", error);
      showToast(t('settings.saveError'), "error");
    }
  };

  const saveSettings = async () => {
    setLoading(true);
    try {
      // 检查端口号是否改变且服务器正在运行
      const portChanged = config && config.api_port !== apiPort;
      const needsRestart = portChanged && serverRunning;

      // 处理开机自启动设置
      const currentAutoStart = await isEnabled();
      if (autoStartOnBoot !== currentAutoStart) {
        if (autoStartOnBoot) {
          await enable();
        } else {
          await disable();
        }
      }

      const newConfig: AppConfig = {
        api_port: apiPort,
        password_hash: config?.password_hash || null,
        log_buffer_size: logBufferSize,
        log_file_path: logFilePath || null,
        enable_log_file: enableLogFile,
        log_file_max_size: logFileMaxSize,
        auto_start_api: autoStartApi,
        auto_start_on_boot: autoStartOnBoot,
        command_whitelist: commandWhitelist,
        custom_commands: customCommands,
        theme: theme,
        ip_blacklist: ipBlacklist,
        enable_ip_blacklist: enableIpBlacklist,
      };

      await invoke("save_config", { newConfig });
      await invoke("reload_config");

      // 更新本地配置状态，确保与保存的配置同步
      setConfig(newConfig);

      // 如果端口号改变且服务器正在运行，自动重启服务器
      if (needsRestart && onServerRestart) {
        showToast(t('settings.portChanged'));
        await onServerRestart();
      }

      showToast(t('settings.saveSuccess'));
    } catch (error) {
      showToast(`${t('settings.saveError')}: ${error}`, "error");
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async () => {
    if (newPassword.length < 8) {
      showToast(t('settings.passwordMinLength'), "error");
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast(t('settings.passwordMismatch'), "error");
      return;
    }

    setLoading(true);
    try {
      await invoke("set_config_password", { password: newPassword });
      showToast(t('settings.passwordUpdateSuccess'));
      setNewPassword("");
      setConfirmPassword("");
      setHasPassword(true);
      // 重新加载配置以获取更新后的 password_hash
      await loadConfig();
    } catch (error) {
      showToast(`${t('settings.passwordUpdateFailed')}: ${error}`, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleClearPassword = async () => {
    if (!hasPassword) return;
    
    setLoading(true);
    try {
      await invoke("clear_config_password");
      showToast(t('settings.passwordClearSuccess'));
      setHasPassword(false);
      // 重新加载配置以获取更新后的 password_hash
      await loadConfig();
    } catch (error) {
      showToast(`${t('settings.passwordClearFailed')}: ${error}`, "error");
    } finally {
      setLoading(false);
    }
  };

  const openLogFileLocation = async () => {
    try {
      const info = await invoke<[string, number | null]>("get_log_file_info");
      if (info) {
        const path = info[0];
        // 使用系统默认程序打开日志文件所在目录
        const dir = path.substring(0, path.lastIndexOf("\\") || path.lastIndexOf("/"));
        await invoke("open_path", { path: dir });
      }
    } catch (error) {
      console.error("Failed to open log location:", error);
    }
  };

  // 切换内置命令白名单
  const toggleBuiltInCommand = (commandId: string) => {
    setCommandWhitelist(prev => {
      if (prev.includes(commandId)) {
        return prev.filter(c => c !== commandId);
      } else {
        return [...prev, commandId];
      }
    });
  };

  // 添加自定义命令
  const addCustomCommand = () => {
    const cmd = newCustomCommand.trim();
    if (!cmd) {
      showToast(t('settings.commands.commandName'), "error");
      return;
    }
    if (customCommands.includes(cmd)) {
      showToast(t('settings.commands.addDescription'), "error");
      return;
    }
    // 添加到自定义命令列表，同时添加到白名单（默认启用）
    setCustomCommands(prev => [...prev, cmd]);
    setCommandWhitelist(prev => {
      // 同时添加命令和 "custom" 总开关（如果还没有）
      const newWhitelist = [...prev, cmd];
      if (!newWhitelist.includes("custom")) {
        newWhitelist.push("custom");
      }
      return newWhitelist;
    });
    setNewCustomCommand("");
    showToast(t('toast.customCommandAdded'));
  };

  // 删除自定义命令
  const removeCustomCommand = (command: string) => {
    // 从自定义命令列表和白名单中同时移除
    setCustomCommands(prev => prev.filter(c => c !== command));
    setCommandWhitelist(prev => prev.filter(c => c !== command));
    showToast(t('toast.customCommandRemoved'));
  };

  // 切换语言
  const handleLanguageChange = (lang: string) => {
    setLanguage(lang);
    i18n.changeLanguage(lang);
  };

  // 添加IP到黑名单
  const addBlockedIp = () => {
    const ip = newBlockedIp.trim();
    if (!ip) {
      showToast(t('settings.ipBlacklist.invalidIp'), "error");
      return;
    }
    // 简单的IP格式验证
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}(\.\*)?$|^\d{1,3}\.\d{1,3}\.\d{1,3}\.\*$/;
    if (!ipRegex.test(ip) && ip !== "*") {
      showToast(t('settings.ipBlacklist.invalidIp'), "error");
      return;
    }
    if (ipBlacklist.includes(ip)) {
      showToast(t('settings.ipBlacklist.alreadyExists'), "error");
      return;
    }
    setIpBlacklist(prev => [...prev, ip]);
    setNewBlockedIp("");
    showToast(t('toast.ipAdded'));
  };

  // 从黑名单移除IP
  const removeBlockedIp = (ip: string) => {
    setIpBlacklist(prev => prev.filter(i => i !== ip));
    showToast(t('toast.ipRemoved'));
  };

  if (!isOpen) return null;

  return (
    <>
      {toast && createPortal(
        <div className={`toast ${toast.type}`}>
          <span className="material-icon">
            {toast.type === "success" ? "check_circle" : "error"}
          </span>
          <span>{toast.message}</span>
        </div>,
        document.body
      )}
      <div className="settings-overlay">
        <div className="settings-modal">
        <div className="settings-header">
          <h2>
            <span className="material-icon">settings</span>
            {t('settings.title')}
          </h2>
          <button className="close-btn" onClick={onClose}>
            <span className="material-icon">close</span>
          </button>
        </div>

        <div className="settings-content">
          {/* 外观设置 */}
          <section className="settings-section">
            <h3>
              <span className="material-icon">palette</span>
              {t('settings.appearance.title')}
            </h3>

            <div className="form-group">
              <label>{t('settings.appearance.language')}</label>
              <div className="theme-options">
                <button
                  className={`theme-option ${language === 'en' ? 'active' : ''}`}
                  onClick={() => handleLanguageChange('en')}
                  type="button"
                >
                  <span className="material-icon">language</span>
                  <span>English</span>
                </button>
                <button
                  className={`theme-option ${language === 'zh' ? 'active' : ''}`}
                  onClick={() => handleLanguageChange('zh')}
                  type="button"
                >
                  <span className="material-icon">language</span>
                  <span>中文</span>
                </button>
              </div>
              <small>Choose your preferred language</small>
            </div>

            <div className="form-group">
              <label>{t('settings.appearance.theme')}</label>
              <div className="theme-options">
                <button
                  className={`theme-option ${theme === 'light' ? 'active' : ''}`}
                  onClick={() => {
                    setTheme('light');
                    onThemeChange?.('light');
                  }}
                  type="button"
                >
                  <span className="material-icon">light_mode</span>
                  <span>Light</span>
                </button>
                <button
                  className={`theme-option ${theme === 'dark' ? 'active' : ''}`}
                  onClick={() => {
                    setTheme('dark');
                    onThemeChange?.('dark');
                  }}
                  type="button"
                >
                  <span className="material-icon">dark_mode</span>
                  <span>Dark</span>
                </button>
                <button
                  className={`theme-option ${theme === 'system' ? 'active' : ''}`}
                  onClick={() => {
                    setTheme('system');
                    onThemeChange?.('system');
                  }}
                  type="button"
                >
                  <span className="material-icon">contrast</span>
                  <span>Auto</span>
                </button>
                <button
                  className={`theme-option ${theme === 'glass' ? 'active' : ''}`}
                  onClick={() => {
                    setTheme('glass');
                    onThemeChange?.('glass');
                  }}
                  type="button"
                >
                  <span className="material-icon">blur_on</span>
                  <span>Glass</span>
                </button>
              </div>
              <small>{t('settings.appearance.themeDescription')}</small>
            </div>
          </section>

          {/* 服务器设置 */}
          <section className="settings-section">
            <h3>
              <span className="material-icon">dns</span>
              {t('settings.server.title')}
            </h3>

            <div className="form-group">
              <label>{t('settings.server.apiPort')}</label>
              <input
                type="number"
                value={apiPort}
                onChange={(e) => setApiPort(parseInt(e.target.value) || 8080)}
                min={1024}
                max={65535}
              />
              <small>{t('settings.server.apiPortDescription')}</small>
            </div>

            <div className="form-group checkbox">
              <label>
                <input
                  type="checkbox"
                  checked={autoStartApi}
                  onChange={(e) => setAutoStartApi(e.target.checked)}
                />
                <span>{t('settings.server.autoStart')}</span>
              </label>
            </div>

            <div className="form-group checkbox">
              <label>
                <input
                  type="checkbox"
                  checked={autoStartOnBoot}
                  onChange={(e) => setAutoStartOnBoot(e.target.checked)}
                />
                <span>{t('settings.server.startOnBoot')}</span>
              </label>
            </div>
          </section>

          {/* 日志设置 */}
          <section className="settings-section">
            <h3>
              <span className="material-icon">article</span>
              {t('settings.logs.title')}
            </h3>

            <div className="form-group">
              <label>{t('settings.logs.bufferSize')}</label>
              <input
                type="number"
                value={logBufferSize}
                onChange={(e) => setLogBufferSize(parseInt(e.target.value) || 100)}
                min={10}
                max={1000}
              />
              <small>{t('settings.logs.bufferSizeDescription')}</small>
            </div>

            <div className="form-group checkbox">
              <label>
                <input
                  type="checkbox"
                  checked={enableLogFile}
                  onChange={(e) => setEnableLogFile(e.target.checked)}
                />
                <span>{t('settings.logs.enableLogFile')}</span>
              </label>
            </div>

            {enableLogFile && (
              <>
                <div className="form-group">
                  <label>{t('settings.logs.maxSize')}</label>
                  <input
                    type="number"
                    value={logFileMaxSize}
                    onChange={(e) => setLogFileMaxSize(parseInt(e.target.value) || 10)}
                    min={1}
                    max={100}
                  />
                  <small>{t('settings.logs.maxSizeDescription')}</small>
                </div>

                <div className="form-group">
                  <label>{t('settings.logs.logPath')}</label>
                  <button className="btn btn-small" onClick={openLogFileLocation}>
                    <span className="material-icon">folder_open</span>
                    {t('settings.logs.openLocation')}
                  </button>
                  <small>{t('settings.logs.logPath')}</small>
                </div>
              </>
            )}
          </section>

          {/* 命令白名单设置 */}
          <section className="settings-section">
            <h3>
              <span className="material-icon">terminal</span>
              {t('settings.commands.title')}
            </h3>
            <p className="section-desc">{t('settings.commands.description')}</p>

            <div className="command-list">
              <div className="command-category">
                <h4>{t('settings.commands.builtIn')}</h4>
                {builtInCommands.map(cmd => (
                  <div key={cmd.id} className="command-item">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={commandWhitelist.includes(cmd.id)}
                        onChange={() => toggleBuiltInCommand(cmd.id)}
                      />
                      <span className="command-name">{t(`commands.${cmd.id}`)}</span>
                      <span className="command-desc">{cmd.desc}</span>
                    </label>
                  </div>
                ))}
              </div>

              {customCommands.length > 0 && (
                <div className="command-category">
                  <h4>{t('settings.commands.custom')}</h4>
                  {customCommands.map(cmd => (
                    <div key={cmd} className="command-item">
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={commandWhitelist.includes(cmd)}
                          onChange={() => toggleBuiltInCommand(cmd)}
                        />
                        <span className="command-name">{cmd}</span>
                        <span className="command-desc">{t('settings.commands.custom')}</span>
                      </label>
                      <button
                        className="remove-btn"
                        onClick={() => removeCustomCommand(cmd)}
                        title={t('settings.removeCommand')}
                      >
                        <span className="material-icon">close</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* 添加自定义命令 */}
          <section className="settings-section">
            <h3>
              <span className="material-icon">add_circle</span>
              {t('settings.commands.addCustom')}
            </h3>
            <p className="section-desc">{t('settings.commands.addDescription')}</p>

            <div className="form-group">
              <label>{t('settings.commands.commandName')}</label>
              <input
                type="text"
                value={newCustomCommand}
                onChange={(e) => setNewCustomCommand(e.target.value)}
                placeholder={t('settings.commands.commandName')}
                onKeyPress={(e) => e.key === 'Enter' && addCustomCommand()}
              />
              <button className="btn btn-small btn-full" onClick={addCustomCommand}>
                <span className="material-icon">add</span>
                {t('settings.commands.addToWhitelist')}
              </button>
              <small>{t('settings.commands.customCommandNote')}</small>
            </div>
          </section>

          {/* IP黑名单设置 */}
          <section className="settings-section ip-blacklist-section">
            <h3>
              <span className="material-icon">block</span>
              {t('settings.ipBlacklist.title')}
            </h3>
            <p className="section-desc">{t('settings.ipBlacklist.description')}</p>

            <div className="form-group checkbox">
              <label>
                <input
                  type="checkbox"
                  checked={enableIpBlacklist}
                  onChange={(e) => setEnableIpBlacklist(e.target.checked)}
                />
                <span>{t('settings.ipBlacklist.enable')}</span>
              </label>
            </div>

            {enableIpBlacklist && (
              <>
                <div className="form-group">
                  <label>{t('settings.ipBlacklist.addIp')}</label>
                  <input
                    type="text"
                    value={newBlockedIp}
                    onChange={(e) => setNewBlockedIp(e.target.value)}
                    placeholder={t('settings.ipBlacklist.ipPlaceholder')}
                    onKeyPress={(e) => e.key === 'Enter' && addBlockedIp()}
                  />
                  <button className="btn btn-small btn-full" onClick={addBlockedIp}>
                    <span className="material-icon">add</span>
                    {t('common.add')}
                  </button>
                  <small>{t('settings.ipBlacklist.ipHint')}</small>
                </div>

                {ipBlacklist.length > 0 && (
                  <div className="ip-blacklist">
                    <h4>{t('settings.ipBlacklist.blockedIps')}</h4>
                    {ipBlacklist.map(ip => (
                      <div key={ip} className="ip-item">
                        <span className="ip-address">{ip}</span>
                        <button
                          className="remove-btn"
                          onClick={() => removeBlockedIp(ip)}
                          title={t('common.delete')}
                        >
                          <span className="material-icon">close</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>

          {/* 密码设置 */}
          <section className="settings-section">
            <h3>
              <span className="material-icon">lock</span>
              {t('settings.password.title')}
            </h3>

            <div className="form-group">
              <label>{t('settings.password.newPassword')}</label>
              <div className="input-with-toggle">
                <input
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t('settings.password.passwordPlaceholder')}
                />
                <button
                  className="icon-btn"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  type="button"
                >
                  <span className="material-icon">
                    {showNewPassword ? "visibility_off" : "visibility"}
                  </span>
                </button>
              </div>
            </div>

            <div className="form-group">
              <label>{t('settings.password.confirmPassword')}</label>
              <div className="input-with-toggle">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t('settings.password.confirmPlaceholder')}
                />
                <button
                  className="icon-btn"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  type="button"
                >
                  <span className="material-icon">
                    {showConfirmPassword ? "visibility_off" : "visibility"}
                  </span>
                </button>
              </div>
            </div>

            <div className="button-group">
              <button
                className="btn btn-primary"
                onClick={handlePasswordChange}
                disabled={loading || !newPassword || !confirmPassword}
              >
                {hasPassword ? t('settings.password.updatePassword') : t('settings.password.setPassword')}
              </button>

              {hasPassword && (
                <button
                  className="btn btn-danger"
                  onClick={handleClearPassword}
                  disabled={loading}
                >
                  {t('settings.password.removePassword')}
                </button>
              )}
            </div>
          </section>
        </div>

        <div className="settings-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            className="btn btn-primary"
            onClick={saveSettings}
            disabled={loading}
          >
            {loading ? t('common.loading') : t('common.save')}
          </button>
        </div>
        </div>
      </div>
    </>
  );
}

export default Settings;

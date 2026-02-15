import { useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useTranslation } from "react-i18next";
import "./TitleBar.css";

function TitleBar() {
  const { t } = useTranslation();
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const checkMaximized = async () => {
      const maximized = await getCurrentWindow().isMaximized();
      setIsMaximized(maximized);
    };
    checkMaximized();
  }, []);

  const handleMinimize = async () => {
    await getCurrentWindow().minimize();
  };

  const handleMaximize = async () => {
    const window = getCurrentWindow();
    if (isMaximized) {
      await window.unmaximize();
    } else {
      await window.maximize();
    }
    setIsMaximized(!isMaximized);
  };

  const handleClose = async () => {
    // 关闭按钮改为隐藏到托盘，而不是退出程序
    await getCurrentWindow().hide();
  };

  // 处理拖拽
  const handleMouseDown = async (e: React.MouseEvent) => {
    // 只在标题栏区域触发拖拽
    if (e.target === e.currentTarget || (e.target as HTMLElement).closest(".titlebar-content")) {
      await getCurrentWindow().startDragging();
    }
  };

  return (
    <div
      className="titlebar"
      onMouseDown={handleMouseDown}
    >
      <div className="titlebar-content">
        <div className="titlebar-icon">
          <span className="material-icon">lan</span>
        </div>
        <span className="titlebar-text">{t('app.title')}</span>
      </div>

      {/* macOS风格控制按钮 - 右侧 */}
      <div className="titlebar-controls macos">
        <button
          className="titlebar-btn close"
          onClick={handleClose}
          title={t('titlebar.close')}
        >
          <span className="macos-icon">×</span>
        </button>
        <button
          className="titlebar-btn minimize"
          onClick={handleMinimize}
          title={t('titlebar.minimize')}
        >
          <span className="macos-icon">−</span>
        </button>
        <button
          className="titlebar-btn maximize"
          onClick={handleMaximize}
          title={isMaximized ? t('titlebar.restore') : t('titlebar.maximize')}
        >
          <span className="macos-icon">+</span>
        </button>
      </div>
    </div>
  );
}

export default TitleBar;

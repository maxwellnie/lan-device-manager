/**
 * 定时器管理器类
 * 统一管理所有定时器，实现窗口隐藏时自动暂停，窗口显示时自动恢复
 */

export type TimerType = 'interval' | 'timeout';

export interface TimerInfo {
  id: string;
  type: TimerType;
  handler: () => void;
  interval?: number; // 对于interval类型，表示执行间隔
  delay?: number; // 对于timeout类型，表示延迟时间
  timerId?: number; // 实际的定时器ID
  isActive: boolean;
  lastPauseTime?: number; // 上次暂停的时间戳
  remainingTime?: number; // 剩余时间（对于timeout类型）
  createdAt: number;
}

export class TimerManager {
  private timers: Map<string, TimerInfo> = new Map();
  private isWindowVisible: boolean = true;

  /**
   * 设置窗口可见性状态
   * @param visible 窗口是否可见
   */
  setWindowVisibility(visible: boolean): void {
    if (this.isWindowVisible === visible) return;

    this.isWindowVisible = visible;
    
    if (visible) {
      this.resumeAllTimers();
    } else {
      this.pauseAllTimers();
    }
  }

  /**
   * 注册一个interval定时器
   * @param id 定时器ID
   * @param handler 定时器处理函数
   * @param interval 执行间隔（毫秒）
   * @returns 定时器ID
   */
  setInterval(id: string, handler: () => void, interval: number): string {
    // 如果已存在相同ID的定时器，先清除
    if (this.timers.has(id)) {
      this.clearTimer(id);
    }

    const timerInfo: TimerInfo = {
      id,
      type: 'interval',
      handler,
      interval,
      isActive: this.isWindowVisible,
      createdAt: Date.now(),
    };

    this.timers.set(id, timerInfo);

    // 如果窗口可见，立即启动定时器
    if (this.isWindowVisible) {
      this.startIntervalTimer(id);
    }

    return id;
  }

  /**
   * 注册一个timeout定时器
   * @param id 定时器ID
   * @param handler 定时器处理函数
   * @param delay 延迟时间（毫秒）
   * @returns 定时器ID
   */
  setTimeout(id: string, handler: () => void, delay: number): string {
    // 如果已存在相同ID的定时器，先清除
    if (this.timers.has(id)) {
      this.clearTimer(id);
    }

    const timerInfo: TimerInfo = {
      id,
      type: 'timeout',
      handler,
      delay,
      isActive: this.isWindowVisible,
      createdAt: Date.now(),
    };

    this.timers.set(id, timerInfo);

    // 如果窗口可见，立即启动定时器
    if (this.isWindowVisible) {
      this.startTimeoutTimer(id);
    }

    return id;
  }

  /**
   * 清除指定定时器
   * @param id 定时器ID
   */
  clearTimer(id: string): void {
    const timerInfo = this.timers.get(id);
    if (!timerInfo) return;

    if (timerInfo.timerId !== undefined) {
      if (timerInfo.type === 'interval') {
        clearInterval(timerInfo.timerId);
      } else {
        clearTimeout(timerInfo.timerId);
      }
    }

    this.timers.delete(id);
  }

  /**
   * 清除所有定时器
   */
  clearAllTimers(): void {
    for (const timerInfo of this.timers.values()) {
      if (timerInfo.timerId !== undefined) {
        if (timerInfo.type === 'interval') {
          clearInterval(timerInfo.timerId);
        } else {
          clearTimeout(timerInfo.timerId);
        }
      }
    }
    this.timers.clear();
  }

  /**
   * 暂停所有定时器
   */
  pauseAllTimers(): void {
    const now = Date.now();
    
    for (const timerInfo of this.timers.values()) {
      if (!timerInfo.isActive) continue;

      timerInfo.isActive = false;
      timerInfo.lastPauseTime = now;

      if (timerInfo.timerId !== undefined) {
        if (timerInfo.type === 'interval') {
          clearInterval(timerInfo.timerId);
        } else {
          // 对于timeout类型，计算剩余时间
          clearTimeout(timerInfo.timerId);
          if (timerInfo.delay && timerInfo.createdAt) {
            const elapsed = now - timerInfo.createdAt;
            timerInfo.remainingTime = Math.max(0, timerInfo.delay - elapsed);
          }
        }
        timerInfo.timerId = undefined;
      }
    }
  }

  /**
   * 恢复所有定时器
   */
  resumeAllTimers(): void {
    const now = Date.now();
    
    for (const [id, timerInfo] of this.timers) {
      if (timerInfo.isActive) continue;

      timerInfo.isActive = true;
      timerInfo.createdAt = now; // 重置创建时间

      if (timerInfo.type === 'interval') {
        this.startIntervalTimer(id);
      } else {
        // 对于timeout类型，使用剩余时间或原始延迟时间
        const delay = timerInfo.remainingTime || timerInfo.delay || 0;
        this.startTimeoutTimer(id, delay);
      }

      // 清除暂停相关的时间信息
      delete timerInfo.lastPauseTime;
      delete timerInfo.remainingTime;
    }
  }

  /**
   * 获取所有定时器信息
   */
  getAllTimers(): TimerInfo[] {
    return Array.from(this.timers.values());
  }

  /**
   * 获取指定定时器信息
   */
  getTimer(id: string): TimerInfo | undefined {
    return this.timers.get(id);
  }

  /**
   * 检查定时器是否存在
   */
  hasTimer(id: string): boolean {
    return this.timers.has(id);
  }

  /**
   * 获取活跃定时器数量
   */
  getActiveTimerCount(): number {
    return Array.from(this.timers.values()).filter(timer => timer.isActive).length;
  }

  /**
   * 获取总定时器数量
   */
  getTotalTimerCount(): number {
    return this.timers.size;
  }

  /**
   * 启动interval定时器
   */
  private startIntervalTimer(id: string): void {
    const timerInfo = this.timers.get(id);
    if (!timerInfo || timerInfo.type !== 'interval' || !timerInfo.interval) return;

    const timerId = window.setInterval(() => {
      try {
        timerInfo.handler();
      } catch (error) {
        console.error(`Error in timer ${id}:`, error);
      }
    }, timerInfo.interval);

    timerInfo.timerId = timerId;
  }

  /**
   * 启动timeout定时器
   */
  private startTimeoutTimer(id: string, delay?: number): void {
    const timerInfo = this.timers.get(id);
    if (!timerInfo || timerInfo.type !== 'timeout') return;

    const actualDelay = delay || timerInfo.delay || 0;
    
    const timerId = window.setTimeout(() => {
      try {
        timerInfo.handler();
        // timeout执行后自动清理
        this.timers.delete(id);
      } catch (error) {
        console.error(`Error in timer ${id}:`, error);
        this.timers.delete(id);
      }
    }, actualDelay);

    timerInfo.timerId = timerId;
  }
}

// 创建全局单例实例
export const timerManager = new TimerManager();
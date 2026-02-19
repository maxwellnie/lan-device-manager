/**
 * 定时器管理器React Hook
 * 提供在React组件中方便使用定时器管理器的功能
 */

import { useEffect, useRef, useCallback } from 'react';
import { timerManager } from './timerManager';

/**
 * 使用定时器管理器的Hook
 * @param isWindowVisible 窗口是否可见
 */
export function useTimerManager(isWindowVisible: boolean) {
  // 存储组件内创建的定时器ID
  const componentTimerIds = useRef<Set<string>>(new Set());

  // 更新窗口可见性状态
  useEffect(() => {
    timerManager.setWindowVisibility(isWindowVisible);
  }, [isWindowVisible]);

  // 组件卸载时清理组件创建的定时器
  useEffect(() => {
    return () => {
      componentTimerIds.current.forEach(id => {
        timerManager.clearTimer(id);
      });
      componentTimerIds.current.clear();
    };
  }, []);

  /**
   * 注册一个interval定时器
   */
  const setManagedInterval = useCallback((
    handler: () => void,
    interval: number,
    id?: string
  ): string => {
    const timerId = id || `interval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    timerManager.setInterval(timerId, handler, interval);
    componentTimerIds.current.add(timerId);
    return timerId;
  }, []);

  /**
   * 注册一个timeout定时器
   */
  const setManagedTimeout = useCallback((
    handler: () => void,
    delay: number,
    id?: string
  ): string => {
    const timerId = id || `timeout_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    timerManager.setTimeout(timerId, handler, delay);
    componentTimerIds.current.add(timerId);
    return timerId;
  }, []);

  /**
   * 清除定时器
   */
  const clearManagedTimer = useCallback((id: string): void => {
    timerManager.clearTimer(id);
    componentTimerIds.current.delete(id);
  }, []);

  /**
   * 获取定时器管理器实例
   */
  const getTimerManager = useCallback(() => {
    return timerManager;
  }, []);

  return {
    setManagedInterval,
    setManagedTimeout,
    clearManagedTimer,
    getTimerManager,
  };
}

/**
 * 简化的interval Hook
 */
export function useManagedInterval(
  handler: () => void,
  interval: number,
  isWindowVisible: boolean,
  id?: string
): void {
  const { setManagedInterval, clearManagedTimer } = useTimerManager(isWindowVisible);

  useEffect(() => {
    if (!isWindowVisible) return;

    const timerId = setManagedInterval(handler, interval, id);

    return () => {
      clearManagedTimer(timerId);
    };
  }, [handler, interval, isWindowVisible, id, setManagedInterval, clearManagedTimer]);
}

/**
 * 简化的timeout Hook
 */
export function useManagedTimeout(
  handler: () => void,
  delay: number,
  isWindowVisible: boolean,
  id?: string
): void {
  const { setManagedTimeout, clearManagedTimer } = useTimerManager(isWindowVisible);

  useEffect(() => {
    if (!isWindowVisible) return;

    const timerId = setManagedTimeout(handler, delay, id);

    return () => {
      clearManagedTimer(timerId);
    };
  }, [handler, delay, isWindowVisible, id, setManagedTimeout, clearManagedTimer]);
}
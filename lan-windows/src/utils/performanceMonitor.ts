/**
 * 性能监控工具
 * 用于检测和记录资源使用情况，帮助诊断性能问题
 */

export interface PerformanceMetrics {
  timestamp: number;
  memoryUsage?: number;
  domNodes: number;
  eventListeners: number;
  animationFrameCount: number;
  paintTime: number;
}

export interface PerformanceThresholds {
  memoryWarning: number;
  domNodesWarning: number;
  paintTimeWarning: number;
}

const DEFAULT_THRESHOLDS: PerformanceThresholds = {
  memoryWarning: 100 * 1024 * 1024, // 100MB
  domNodesWarning: 1500,
  paintTimeWarning: 100, // 100ms
};

class PerformanceMonitor {
  private metrics: PerformanceMetrics[] = [];
  private thresholds: PerformanceThresholds;
  private isMonitoring: boolean = false;
  private monitorInterval: number | null = null;
  private animationFrameCount: number = 0;
  private lastFrameTime: number = 0;
  private frameCallbackId: number | null = null;

  constructor(thresholds: Partial<PerformanceThresholds> = {}) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  }

  /**
   * 开始性能监控
   */
  startMonitoring(intervalMs: number = 5000): void {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    this.startAnimationFrameCounter();

    this.monitorInterval = window.setInterval(() => {
      this.collectMetrics();
    }, intervalMs);

    console.log('[PerformanceMonitor] Started monitoring');
  }

  /**
   * 停止性能监控
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) return;

    this.isMonitoring = false;
    this.stopAnimationFrameCounter();

    if (this.monitorInterval !== null) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }

    console.log('[PerformanceMonitor] Stopped monitoring');
  }

  /**
   * 收集性能指标
   */
  private collectMetrics(): void {
    const metrics: PerformanceMetrics = {
      timestamp: Date.now(),
      memoryUsage: this.getMemoryUsage(),
      domNodes: this.getDomNodeCount(),
      eventListeners: this.getEventListenerCount(),
      animationFrameCount: this.animationFrameCount,
      paintTime: this.getPaintTime(),
    };

    this.metrics.push(metrics);
    this.checkThresholds(metrics);

    // 只保留最近20条记录
    if (this.metrics.length > 20) {
      this.metrics.shift();
    }
  }

  /**
   * 获取内存使用量（如果可用）
   */
  private getMemoryUsage(): number | undefined {
    if ('memory' in performance && (performance as any).memory) {
      return (performance as any).memory.usedJSHeapSize;
    }
    return undefined;
  }

  /**
   * 获取DOM节点数量
   */
  private getDomNodeCount(): number {
    return document.getElementsByTagName('*').length;
  }

  /**
   * 获取事件监听器数量（估算）
   */
  private getEventListenerCount(): number {
    // 这是一个估算值，无法精确获取
    const elements = document.querySelectorAll('*');
    let count = 0;
    elements.forEach(el => {
      // 检查常见的事件类型
      const eventTypes = ['click', 'mousedown', 'mouseup', 'mousemove', 'keydown', 'keyup', 'scroll', 'resize'];
      eventTypes.forEach(type => {
        if ((el as any)[`on${type}`]) {
          count++;
        }
      });
    });
    return count;
  }

  /**
   * 获取绘制时间
   */
  private getPaintTime(): number {
    const entries = performance.getEntriesByType('paint');
    const firstContentfulPaint = entries.find(e => e.name === 'first-contentful-paint');
    return firstContentfulPaint ? firstContentfulPaint.startTime : 0;
  }

  /**
   * 启动动画帧计数器
   */
  private startAnimationFrameCounter(): void {
    const countFrame = (timestamp: number) => {
      if (!this.isMonitoring) return;

      if (this.lastFrameTime > 0) {
        const frameDuration = timestamp - this.lastFrameTime;
        // 如果帧时间超过33ms（低于30fps），记录警告
        if (frameDuration > 33) {
          console.warn(`[PerformanceMonitor] Slow frame detected: ${frameDuration.toFixed(2)}ms`);
        }
      }

      this.lastFrameTime = timestamp;
      this.animationFrameCount++;
      this.frameCallbackId = requestAnimationFrame(countFrame);
    };

    this.frameCallbackId = requestAnimationFrame(countFrame);
  }

  /**
   * 停止动画帧计数器
   */
  private stopAnimationFrameCounter(): void {
    if (this.frameCallbackId !== null) {
      cancelAnimationFrame(this.frameCallbackId);
      this.frameCallbackId = null;
    }
  }

  /**
   * 检查阈值并发出警告
   */
  private checkThresholds(metrics: PerformanceMetrics): void {
    // 检查内存使用
    if (metrics.memoryUsage && metrics.memoryUsage > this.thresholds.memoryWarning) {
      console.warn(`[PerformanceMonitor] High memory usage: ${(metrics.memoryUsage / 1024 / 1024).toFixed(2)}MB`);
    }

    // 检查DOM节点数量
    if (metrics.domNodes > this.thresholds.domNodesWarning) {
      console.warn(`[PerformanceMonitor] High DOM node count: ${metrics.domNodes}`);
    }

    // 检查绘制时间
    if (metrics.paintTime > this.thresholds.paintTimeWarning) {
      console.warn(`[PerformanceMonitor] Slow paint time: ${metrics.paintTime.toFixed(2)}ms`);
    }
  }

  /**
   * 获取最近的性能指标
   */
  getRecentMetrics(): PerformanceMetrics[] {
    return [...this.metrics];
  }

  /**
   * 获取平均性能指标
   */
  getAverageMetrics(): Partial<PerformanceMetrics> {
    if (this.metrics.length === 0) return {};

    const sum = this.metrics.reduce((acc, m) => ({
      memoryUsage: (acc.memoryUsage || 0) + (m.memoryUsage || 0),
      domNodes: acc.domNodes + m.domNodes,
      eventListeners: acc.eventListeners + m.eventListeners,
      animationFrameCount: acc.animationFrameCount + m.animationFrameCount,
      paintTime: acc.paintTime + m.paintTime,
    }), {
      memoryUsage: 0,
      domNodes: 0,
      eventListeners: 0,
      animationFrameCount: 0,
      paintTime: 0,
    });

    const count = this.metrics.length;
    return {
      memoryUsage: sum.memoryUsage ? sum.memoryUsage / count : undefined,
      domNodes: sum.domNodes / count,
      eventListeners: sum.eventListeners / count,
      animationFrameCount: sum.animationFrameCount / count,
      paintTime: sum.paintTime / count,
    };
  }

  /**
   * 生成性能报告
   */
  generateReport(): string {
    const avg = this.getAverageMetrics();
    const latest = this.metrics[this.metrics.length - 1];

    return `
Performance Report:
==================
Latest Metrics:
  - Memory Usage: ${latest?.memoryUsage ? `${(latest.memoryUsage / 1024 / 1024).toFixed(2)}MB` : 'N/A'}
  - DOM Nodes: ${latest?.domNodes || 0}
  - Event Listeners (estimated): ${latest?.eventListeners || 0}
  - Animation Frames: ${latest?.animationFrameCount || 0}
  - Paint Time: ${latest?.paintTime?.toFixed(2) || 0}ms

Average Metrics:
  - Memory Usage: ${avg.memoryUsage ? `${(avg.memoryUsage / 1024 / 1024).toFixed(2)}MB` : 'N/A'}
  - DOM Nodes: ${avg.domNodes?.toFixed(0) || 0}
  - Event Listeners: ${avg.eventListeners?.toFixed(0) || 0}
  - Paint Time: ${avg.paintTime?.toFixed(2) || 0}ms

Thresholds:
  - Memory Warning: ${(this.thresholds.memoryWarning / 1024 / 1024).toFixed(0)}MB
  - DOM Nodes Warning: ${this.thresholds.domNodesWarning}
  - Paint Time Warning: ${this.thresholds.paintTimeWarning}ms
    `.trim();
  }

  /**
   * 清除所有指标
   */
  clearMetrics(): void {
    this.metrics = [];
    this.animationFrameCount = 0;
  }
}

// 创建全局单例实例
export const performanceMonitor = new PerformanceMonitor();

// 导出便捷函数
export const startPerformanceMonitoring = () => performanceMonitor.startMonitoring();
export const stopPerformanceMonitoring = () => performanceMonitor.stopMonitoring();
export const getPerformanceReport = () => performanceMonitor.generateReport();

import { useEffect, useRef, useState, useCallback } from 'react';
import { EventsPerformanceMetrics } from '../types';

interface UsePerformanceMonitoringProps {
  enabled?: boolean;
  sampleRate?: number; // 0-1, what percentage of renders to monitor
  logInterval?: number; // ms, how often to log metrics
}

interface PerformanceEntry {
  timestamp: number;
  renderTime: number;
  memoryUsage?: number;
}

export function usePerformanceMonitoring({
  enabled = __DEV__,
  sampleRate = 0.1,
  logInterval = 10000
}: UsePerformanceMonitoringProps = {}) {
  const [metrics, setMetrics] = useState<EventsPerformanceMetrics>({
    renderTime: 0,
    scrollPerformance: {
      averageFrameTime: 0,
      droppedFrames: 0,
    },
    memoryUsage: 0,
    lastUpdated: new Date(),
  });

  const performanceEntries = useRef<PerformanceEntry[]>([]);
  const frameTimeRef = useRef<number[]>([]);
  const lastFrameTimeRef = useRef(performance.now());
  const renderStartTime = useRef(0);
  const logIntervalRef = useRef<NodeJS.Timeout>();

  // Start render timing
  const startRenderTiming = useCallback(() => {
    if (!enabled || Math.random() > sampleRate) return;
    renderStartTime.current = performance.now();
  }, [enabled, sampleRate]);

  // End render timing
  const endRenderTiming = useCallback(() => {
    if (!enabled || renderStartTime.current === 0) return;
    
    const renderTime = performance.now() - renderStartTime.current;
    renderStartTime.current = 0;

    // Get memory usage (if available)
    let memoryUsage = 0;
    if ('memory' in performance && performance.memory) {
      memoryUsage = (performance.memory as { usedJSHeapSize: number }).usedJSHeapSize / 1024 / 1024; // MB
    }

    // Add performance entry
    performanceEntries.current.push({
      timestamp: Date.now(),
      renderTime,
      memoryUsage,
    });

    // Keep only recent entries (last 100)
    if (performanceEntries.current.length > 100) {
      performanceEntries.current.shift();
    }
  }, [enabled]);

  // Record frame timing for scroll performance
  const recordFrameTime = useCallback(() => {
    if (!enabled) return;

    const now = performance.now();
    const frameTime = now - lastFrameTimeRef.current;
    lastFrameTimeRef.current = now;

    frameTimeRef.current.push(frameTime);

    // Keep only recent frames (last 60)
    if (frameTimeRef.current.length > 60) {
      frameTimeRef.current.shift();
    }
  }, [enabled]);

  // Calculate and update metrics
  const updateMetrics = useCallback(() => {
    if (!enabled || performanceEntries.current.length === 0) return;

    const recentEntries = performanceEntries.current.slice(-50); // Last 50 entries
    
    // Calculate average render time
    const avgRenderTime = recentEntries.reduce((sum, entry) => sum + entry.renderTime, 0) / recentEntries.length;
    
    // Calculate memory usage
    const memoryEntries = recentEntries.filter(entry => entry.memoryUsage !== undefined);
    const avgMemoryUsage = memoryEntries.length > 0
      ? memoryEntries.reduce((sum, entry) => sum + (entry.memoryUsage || 0), 0) / memoryEntries.length
      : 0;

    // Calculate scroll performance metrics
    const recentFrames = frameTimeRef.current.slice(-30); // Last 30 frames
    const avgFrameTime = recentFrames.length > 0
      ? recentFrames.reduce((sum, time) => sum + time, 0) / recentFrames.length
      : 0;
    
    const droppedFrames = recentFrames.filter(time => time > 16.67).length; // 60fps = 16.67ms per frame

    setMetrics({
      renderTime: avgRenderTime,
      scrollPerformance: {
        averageFrameTime: avgFrameTime,
        droppedFrames,
      },
      memoryUsage: avgMemoryUsage,
      lastUpdated: new Date(),
    });
  }, [enabled]);

  // Log metrics periodically
  useEffect(() => {
    if (!enabled) return;

    logIntervalRef.current = setInterval(() => {
      updateMetrics();
      
      if (__DEV__ && performanceEntries.current.length > 0) {
        console.log('EventsScreen Performance Metrics:', metrics);
        
        // Warn about performance issues
        if (metrics.renderTime > 50) {
          console.warn('EventsScreen: High render time detected:', metrics.renderTime, 'ms');
        }
        
        if (metrics.scrollPerformance.droppedFrames > 5) {
          console.warn('EventsScreen: Frame drops detected:', metrics.scrollPerformance.droppedFrames);
        }
        
        if (metrics.memoryUsage > 100) {
          console.warn('EventsScreen: High memory usage detected:', metrics.memoryUsage, 'MB');
        }
      }
    }, logInterval);

    return () => {
      if (logIntervalRef.current) {
        clearInterval(logIntervalRef.current);
      }
    };
  }, [enabled, logInterval, updateMetrics, metrics]);

  // Reset metrics
  const resetMetrics = useCallback(() => {
    performanceEntries.current = [];
    frameTimeRef.current = [];
    setMetrics({
      renderTime: 0,
      scrollPerformance: {
        averageFrameTime: 0,
        droppedFrames: 0,
      },
      memoryUsage: 0,
      lastUpdated: new Date(),
    });
  }, []);

  // Get performance warnings
  const getWarnings = useCallback(() => {
    const warnings: string[] = [];
    
    if (metrics.renderTime > 50) {
      warnings.push(`High render time: ${metrics.renderTime.toFixed(2)}ms`);
    }
    
    if (metrics.scrollPerformance.droppedFrames > 5) {
      warnings.push(`Frame drops detected: ${metrics.scrollPerformance.droppedFrames}`);
    }
    
    if (metrics.memoryUsage > 100) {
      warnings.push(`High memory usage: ${metrics.memoryUsage.toFixed(2)}MB`);
    }
    
    return warnings;
  }, [metrics]);

  return {
    metrics,
    startRenderTiming,
    endRenderTiming,
    recordFrameTime,
    resetMetrics,
    getWarnings,
    isPerformanceGood: metrics.renderTime < 50 && metrics.scrollPerformance.droppedFrames <= 5,
  };
}
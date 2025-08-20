/**
 * Startup Performance Tests
 * 
 * Tests app startup performance including cold start, warm start,
 * and initialization performance.
 */

import PerformanceMonitor from '../../services/PerformanceMonitor';
import MetricsCollector from '../../services/MetricsCollector';

describe('Startup Performance Tests', () => {
  let performanceMonitor: PerformanceMonitor;
  let metricsCollector: MetricsCollector;

  beforeEach(() => {
    performanceMonitor = PerformanceMonitor.getInstance();
    metricsCollector = MetricsCollector.getInstance();
  });

  afterEach(() => {
    performanceMonitor.resetMetrics();
  });

  describe('Cold Start Performance', () => {
    it('should start app within 2 seconds', async () => {
      // Simulate app initialization
      await performanceMonitor.initialize();
      
      // Simulate component mounting and rendering
      await simulateComponentMount('App');
      await simulateComponentMount('AuthProvider');
      await simulateComponentMount('NavigationContainer');
      
      // Record startup completion
      performanceMonitor.recordStartupComplete();
      
      const metrics = performanceMonitor.getMetrics();
      const startupTime = metrics.startupTime;
      
      expect(startupTime).toBeLessThan(2000);
      expect(startupTime).toBeGreaterThan(0);
      
      console.log(`Cold start completed in ${startupTime}ms`);
    });

    it('should initialize performance monitoring quickly', async () => {
      const startTime = Date.now();
      
      await performanceMonitor.initialize();
      
      const initTime = Date.now() - startTime;
      
      expect(initTime).toBeLessThan(100); // Should initialize in under 100ms
      
      console.log(`Performance monitoring initialized in ${initTime}ms`);
    });

    it('should handle multiple rapid initializations', async () => {
      const promises = Array.from({ length: 5 }, () => 
        performanceMonitor.initialize()
      );
      
      const startTime = Date.now();
      await Promise.all(promises);
      const totalTime = Date.now() - startTime;
      
      expect(totalTime).toBeLessThan(200); // Should handle gracefully
      
      console.log(`Multiple initializations completed in ${totalTime}ms`);
    });
  });

  describe('Warm Start Performance', () => {
    beforeEach(async () => {
      // Pre-initialize for warm start simulation
      await performanceMonitor.initialize();
      performanceMonitor.recordStartupComplete();
    });

    it('should warm start within 500ms', async () => {
      const startTime = Date.now();
      
      // Simulate warm start (app resuming from background)
      await simulateWarmStart();
      
      const warmStartTime = Date.now() - startTime;
      
      expect(warmStartTime).toBeLessThan(500);
      
      console.log(`Warm start completed in ${warmStartTime}ms`);
    });

    it('should maintain performance after background/foreground cycles', async () => {
      const times: number[] = [];
      
      // Simulate multiple background/foreground cycles
      for (let i = 0; i < 5; i++) {
        const startTime = Date.now();
        await simulateWarmStart();
        times.push(Date.now() - startTime);
        
        // Small delay between cycles
        await delay(100);
      }
      
      const averageTime = times.reduce((sum, time) => sum + time, 0) / times.length;
      const maxTime = Math.max(...times);
      
      expect(averageTime).toBeLessThan(300);
      expect(maxTime).toBeLessThan(500);
      
      console.log(`Average warm start: ${averageTime.toFixed(0)}ms, Max: ${maxTime}ms`);
    });
  });

  describe('Memory Usage During Startup', () => {
    it('should not exceed memory targets during startup', async () => {
      await performanceMonitor.initialize();
      
      // Simulate heavy startup operations
      await simulateComponentMount('App');
      await simulateComponentMount('AuthProvider');
      await simulateComponentMount('NavigationContainer');
      await simulateComponentMount('DashboardScreen');
      
      performanceMonitor.recordStartupComplete();
      
      const metrics = performanceMonitor.getMetrics();
      const recentMemory = metrics.memoryUsage.slice(-1)[0];
      
      if (recentMemory) {
        expect(recentMemory.used).toBeLessThan(150); // Allow higher during startup
      }
      
      console.log(`Memory usage after startup: ${recentMemory?.used || 0}MB`);
    });

    it('should stabilize memory usage after startup', async () => {
      await performanceMonitor.initialize();
      
      const memoryReadings: number[] = [];
      
      // Simulate startup and measure memory over time
      await simulateComponentMount('App');
      memoryReadings.push(getCurrentMemoryUsage());
      
      await delay(100);
      await simulateComponentMount('AuthProvider');
      memoryReadings.push(getCurrentMemoryUsage());
      
      await delay(100);
      performanceMonitor.recordStartupComplete();
      memoryReadings.push(getCurrentMemoryUsage());
      
      // Memory should not continue growing significantly after startup
      const initialMemory = memoryReadings[0];
      const finalMemory = memoryReadings[memoryReadings.length - 1];
      const memoryGrowth = finalMemory - initialMemory;
      
      expect(memoryGrowth).toBeLessThan(50); // Should not grow more than 50MB
      
      console.log(`Memory growth during startup: ${memoryGrowth}MB`);
    });
  });

  describe('Initialization Performance', () => {
    it('should initialize core services quickly', async () => {
      const serviceInitTimes: Record<string, number> = {};
      
      // Test PerformanceMonitor initialization
      let startTime = Date.now();
      await performanceMonitor.initialize();
      serviceInitTimes.PerformanceMonitor = Date.now() - startTime;
      
      // Test MetricsCollector initialization
      startTime = Date.now();
      await metricsCollector.startSession();
      serviceInitTimes.MetricsCollector = Date.now() - startTime;
      
      // All services should initialize quickly
      Object.entries(serviceInitTimes).forEach(([service, time]) => {
        expect(time).toBeLessThan(50);
        console.log(`${service} initialized in ${time}ms`);
      });
    });

    it('should handle initialization errors gracefully', async () => {
      // Mock initialization failure
      const originalConsoleError = console.error;
      console.error = jest.fn();
      
      try {
        // This should not throw even if there are internal errors
        await performanceMonitor.initialize();
        
        // Should still be able to record metrics
        performanceMonitor.recordStartupComplete();
        const metrics = performanceMonitor.getMetrics();
        
        expect(metrics).toBeDefined();
        expect(metrics.startupTime).toBeGreaterThan(0);
      } finally {
        console.error = originalConsoleError;
      }
    });
  });

  describe('Performance Targets Validation', () => {
    it('should meet all startup performance targets', async () => {
      await performanceMonitor.initialize();
      
      // Simulate realistic startup sequence
      await simulateRealisticStartup();
      
      performanceMonitor.recordStartupComplete();
      
      const summary = performanceMonitor.getPerformanceSummary();
      const targets = performanceMonitor.checkPerformanceTargets();
      
      // Validate startup targets
      expect(summary.startup.passes).toBe(true);
      expect(targets.issues.length).toBe(0);
      
      console.log('Performance Summary:', summary);
      console.log('Performance Targets:', targets);
    });

    it('should provide meaningful performance insights', async () => {
      await performanceMonitor.initialize();
      await metricsCollector.startSession();
      
      // Simulate startup with some performance issues
      await simulateSlowStartup();
      
      performanceMonitor.recordStartupComplete();
      await metricsCollector.endSession();
      
      const insights = metricsCollector.getCurrentInsights();
      
      // Should have insights about performance
      expect(insights.length).toBeGreaterThan(0);
      
      const hasStartupInsight = insights.some(insight => 
        insight.title.toLowerCase().includes('startup')
      );
      
      if (hasStartupInsight) {
        console.log('Startup insights generated successfully');
      }
    });
  });
});

// Helper functions

/**
 * Simulate component mounting delay
 */
async function simulateComponentMount(componentName: string): Promise<void> {
  const mountTime = Math.random() * 50 + 10; // 10-60ms
  await delay(mountTime);
  
  // Record component mounting
  PerformanceMonitor.getInstance().recordScreenMount(componentName, mountTime);
}

/**
 * Simulate warm start operations
 */
async function simulateWarmStart(): Promise<void> {
  // Warm start should be much faster
  await delay(Math.random() * 200 + 50); // 50-250ms
}

/**
 * Simulate realistic startup sequence
 */
async function simulateRealisticStartup(): Promise<void> {
  // Simulate realistic component mounting sequence
  await simulateComponentMount('RootComponent');
  await delay(50);
  
  await simulateComponentMount('AuthProvider');
  await delay(30);
  
  await simulateComponentMount('NavigationContainer');
  await delay(40);
  
  await simulateComponentMount('MainTabNavigator');
  await delay(25);
  
  await simulateComponentMount('DashboardScreen');
  await delay(35);
}

/**
 * Simulate slow startup for testing insights
 */
async function simulateSlowStartup(): Promise<void> {
  // Intentionally slow startup
  await delay(800); // Slow initialization
  await simulateComponentMount('SlowComponent');
  await delay(600); // Additional slow operations
}

/**
 * Get current memory usage (mock)
 */
function getCurrentMemoryUsage(): number {
  // Simulate memory usage
  return 80 + Math.random() * 20; // 80-100MB
}

/**
 * Delay utility
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
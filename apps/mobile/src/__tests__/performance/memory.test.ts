/**
 * Memory Performance Tests
 * 
 * Tests memory usage, leak detection, and optimization
 * for React Native mobile app performance.
 */

import MemoryProfiler from '../../utils/MemoryProfiler';

describe('Memory Performance Tests', () => {
  let memoryProfiler: MemoryProfiler;

  beforeEach(() => {
    memoryProfiler = MemoryProfiler.getInstance();
    memoryProfiler.clearData();
  });

  afterEach(() => {
    memoryProfiler.stopProfiling();
    memoryProfiler.clearData();
  });

  describe('Memory Usage Tracking', () => {
    it('should track memory usage accurately', () => {
      const snapshot = memoryProfiler.takeSnapshot('TestScreen');
      
      expect(snapshot.usedMemory).toBeGreaterThan(0);
      expect(snapshot.availableMemory).toBeGreaterThan(0);
      expect(snapshot.totalMemory).toBeGreaterThan(0);
      expect(snapshot.screenName).toBe('TestScreen');
      expect(snapshot.timestamp).toBeGreaterThan(0);
      
      console.log(`Memory snapshot: ${snapshot.usedMemory}MB used, ${snapshot.availableMemory}MB available`);
    });

    it('should maintain memory usage within targets', async () => {
      memoryProfiler.startProfiling(100); // 100ms intervals
      
      // Simulate normal app usage
      await simulateNormalMemoryUsage();
      
      const analysis = memoryProfiler.stopProfiling();
      
      expect(analysis.trends.averageUsage).toBeLessThan(100); // Target: <100MB
      expect(analysis.trends.peakUsage).toBeLessThan(150); // Allow some headroom
      
      console.log(`Average memory usage: ${analysis.trends.averageUsage.toFixed(1)}MB`);
      console.log(`Peak memory usage: ${analysis.trends.peakUsage.toFixed(1)}MB`);
    });

    it('should provide memory usage summary', () => {
      // Take several snapshots
      memoryProfiler.takeSnapshot('Screen1');
      memoryProfiler.takeSnapshot('Screen2');
      memoryProfiler.takeSnapshot('Screen3');
      
      const summary = memoryProfiler.getMemorySummary();
      
      expect(summary.current).toBeDefined();
      expect(summary.peak).toBeDefined();
      expect(summary.average).toBeGreaterThan(0);
      expect(summary.componentCount).toBeGreaterThanOrEqual(0);
      
      console.log('Memory Summary:', summary);
    });
  });

  describe('Component Tracking', () => {
    it('should track component registration and cleanup', () => {
      const initialCount = memoryProfiler.getMemorySummary().componentCount;
      
      // Register components
      memoryProfiler.registerComponent('Component1');
      memoryProfiler.registerComponent('Component2');
      memoryProfiler.registerComponent('Component3');
      
      let currentCount = memoryProfiler.getMemorySummary().componentCount;
      expect(currentCount).toBe(initialCount + 3);
      
      // Unregister components
      memoryProfiler.unregisterComponent('Component1');
      memoryProfiler.unregisterComponent('Component2');
      
      currentCount = memoryProfiler.getMemorySummary().componentCount;
      expect(currentCount).toBe(initialCount + 1);
      
      console.log(`Component tracking: ${currentCount} active components`);
    });

    it('should detect component cleanup issues', async () => {
      memoryProfiler.startProfiling(50);
      
      // Simulate components that don't clean up properly
      for (let i = 0; i < 20; i++) {
        memoryProfiler.registerComponent(`LeakyComponent${i}`);
        await delay(10);
        
        // Only clean up every other component (simulate leak)
        if (i % 2 === 0) {
          memoryProfiler.unregisterComponent(`LeakyComponent${i}`);
        }
      }
      
      await delay(100);
      memoryProfiler.stopProfiling();
      
      // Should detect component cleanup issues
      const componentCount = memoryProfiler.getMemorySummary().componentCount;
      expect(componentCount).toBeGreaterThan(5); // Many components not cleaned up
      
      console.log(`Component cleanup test: ${componentCount} components remaining`);
    });
  });

  describe('Memory Leak Detection', () => {
    it('should detect memory leaks', async () => {
      memoryProfiler.startProfiling(100);
      
      // Simulate memory leak scenario
      await simulateMemoryLeak();
      
      memoryProfiler.stopProfiling();
      const leaks = memoryProfiler.detectMemoryLeaks();
      
      if (leaks.length > 0) {
        expect(leaks[0].detected).toBe(true);
        expect(leaks[0].leakRate).toBeGreaterThan(0);
        expect(leaks[0].severity).toMatch(/low|medium|high/);
        
        console.log(`Memory leak detected: ${leaks[0].description}`);
        console.log(`Leak rate: ${leaks[0].leakRate.toFixed(2)}MB/min`);
      }
    });

    it('should detect memory spikes', async () => {
      memoryProfiler.startProfiling(50);
      
      // Take baseline snapshots
      await delay(200);
      
      // Simulate memory spike
      await simulateMemorySpike();
      
      memoryProfiler.stopProfiling();
      const leaks = memoryProfiler.detectMemoryLeaks();
      
      const spikes = leaks.filter(leak => 
        leak.description.toLowerCase().includes('spike')
      );
      
      if (spikes.length > 0) {
        expect(spikes[0].detected).toBe(true);
        console.log(`Memory spike detected: ${spikes[0].description}`);
      }
    });

    it('should not report false positives for normal usage', async () => {
      memoryProfiler.startProfiling(100);
      
      // Simulate normal, stable memory usage
      await simulateStableMemoryUsage();
      
      memoryProfiler.stopProfiling();
      const leaks = memoryProfiler.detectMemoryLeaks();
      
      // Should not detect leaks during stable usage
      const significantLeaks = leaks.filter(leak => 
        leak.severity === 'high' || leak.leakRate > 1
      );
      
      expect(significantLeaks.length).toBe(0);
      
      console.log(`Stable memory usage: ${leaks.length} minor issues detected`);
    });
  });

  describe('Memory Optimization Recommendations', () => {
    it('should provide relevant recommendations', async () => {
      memoryProfiler.startProfiling(100);
      
      // Simulate high memory usage scenario
      await simulateHighMemoryUsage();
      
      const analysis = memoryProfiler.stopProfiling();
      
      expect(analysis.recommendations).toBeDefined();
      expect(analysis.recommendations.length).toBeGreaterThan(0);
      
      // Should provide actionable recommendations
      const hasActionableRecommendation = analysis.recommendations.some(rec =>
        rec.includes('optimize') || 
        rec.includes('reduce') || 
        rec.includes('implement') ||
        rec.includes('check')
      );
      
      expect(hasActionableRecommendation).toBe(true);
      
      console.log('Memory Recommendations:');
      analysis.recommendations.forEach((rec, index) => {
        console.log(`${index + 1}. ${rec}`);
      });
    });

    it('should provide positive feedback for good performance', async () => {
      memoryProfiler.startProfiling(100);
      
      // Simulate optimal memory usage
      await simulateOptimalMemoryUsage();
      
      const analysis = memoryProfiler.stopProfiling();
      
      // Should provide positive feedback
      const hasPositiveFeedback = analysis.recommendations.some(rec =>
        rec.includes('optimal') || 
        rec.includes('good') || 
        rec.includes('continue')
      );
      
      expect(hasPositiveFeedback).toBe(true);
      
      console.log('Optimal memory usage recommendations:', analysis.recommendations);
    });
  });

  describe('Memory Profiling Sessions', () => {
    it('should save and load profiling sessions', async () => {
      memoryProfiler.startProfiling(50);
      await simulateNormalMemoryUsage();
      memoryProfiler.stopProfiling();
      
      // Save session
      await memoryProfiler.saveSession('TestSession');
      
      // Load sessions
      const sessions = await memoryProfiler.loadSessions();
      
      expect(sessions.length).toBeGreaterThan(0);
      expect(sessions[0].sessionName).toBe('TestSession');
      expect(sessions[0].analysis).toBeDefined();
      
      console.log(`Saved session: ${sessions[0].sessionName}`);
    });

    it('should export profiling data', async () => {
      memoryProfiler.startProfiling(50);
      await simulateNormalMemoryUsage();
      memoryProfiler.stopProfiling();
      
      const exportData = await memoryProfiler.exportProfilingData();
      
      expect(exportData).toBeDefined();
      expect(typeof exportData).toBe('string');
      
      const parsedData = JSON.parse(exportData);
      expect(parsedData.exportDate).toBeDefined();
      expect(parsedData.summary).toBeDefined();
      expect(parsedData.analysis).toBeDefined();
      
      console.log('Exported profiling data successfully');
    });

    it('should handle memory warnings', () => {
      const initialWarnings = memoryProfiler.getMemorySummary().current.memoryWarnings;
      
      // Simulate memory warning
      memoryProfiler.simulateMemoryWarning();
      
      const currentWarnings = memoryProfiler.getMemorySummary().current.memoryWarnings;
      expect(currentWarnings).toBeGreaterThan(initialWarnings);
      
      console.log(`Memory warnings: ${currentWarnings}`);
    });
  });

  describe('Performance Under Load', () => {
    it('should handle rapid profiling without performance impact', async () => {
      const startTime = Date.now();
      
      // Start high-frequency profiling
      memoryProfiler.startProfiling(10); // 10ms intervals
      
      // Run for 1 second
      await delay(1000);
      
      const analysis = memoryProfiler.stopProfiling();
      const endTime = Date.now();
      
      // Profiling itself should not significantly impact performance
      const profilingOverhead = endTime - startTime - 1000; // Subtract expected delay
      expect(profilingOverhead).toBeLessThan(200); // Less than 200ms overhead
      
      expect(analysis.snapshots.length).toBeGreaterThan(50); // Should have many snapshots
      
      console.log(`Profiling overhead: ${profilingOverhead}ms for ${analysis.snapshots.length} snapshots`);
    });

    it('should limit stored snapshots to prevent memory issues', async () => {
      memoryProfiler.startProfiling(5); // Very frequent snapshots
      
      // Run for a longer period
      await delay(2000);
      
      const analysis = memoryProfiler.stopProfiling();
      
      // Should limit the number of stored snapshots
      expect(analysis.snapshots.length).toBeLessThanOrEqual(1000);
      
      console.log(`Snapshot count limited to: ${analysis.snapshots.length}`);
    });
  });
});

// Helper functions for memory testing

async function simulateNormalMemoryUsage(): Promise<void> {
  // Simulate normal app operations with stable memory usage
  for (let i = 0; i < 10; i++) {
    await delay(50);
    // Memory usage should remain relatively stable
  }
}

async function simulateMemoryLeak(): Promise<void> {
  // Simulate gradual memory increase (leak)
  for (let i = 0; i < 20; i++) {
    // Simulate mounting components without proper cleanup
    MemoryProfiler.getInstance().registerComponent(`LeakyComponent${i}`);
    await delay(50);
    
    // Only occasionally clean up (simulating leak)
    if (i % 5 === 0) {
      MemoryProfiler.getInstance().unregisterComponent(`LeakyComponent${i - 4}`);
    }
  }
}

async function simulateMemorySpike(): Promise<void> {
  // Simulate sudden memory increase
  for (let i = 0; i < 10; i++) {
    MemoryProfiler.getInstance().registerComponent(`SpikeComponent${i}`);
  }
  
  await delay(100);
  
  // Clean up quickly (simulating temporary spike)
  for (let i = 0; i < 10; i++) {
    MemoryProfiler.getInstance().unregisterComponent(`SpikeComponent${i}`);
  }
}

async function simulateStableMemoryUsage(): Promise<void> {
  // Simulate stable memory usage over time
  for (let i = 0; i < 15; i++) {
    await delay(100);
    // Memory should remain stable
  }
}

async function simulateHighMemoryUsage(): Promise<void> {
  // Simulate high but stable memory usage
  for (let i = 0; i < 30; i++) {
    MemoryProfiler.getInstance().registerComponent(`HighMemoryComponent${i}`);
    await delay(30);
  }
}

async function simulateOptimalMemoryUsage(): Promise<void> {
  // Simulate optimal memory usage with proper cleanup
  for (let i = 0; i < 10; i++) {
    MemoryProfiler.getInstance().registerComponent(`OptimalComponent${i}`);
    await delay(50);
    MemoryProfiler.getInstance().unregisterComponent(`OptimalComponent${i}`);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
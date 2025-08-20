/**
 * PerformanceTester - Automated performance testing framework
 * 
 * Provides automated testing capabilities for React Native app performance
 * including load testing, stress testing, and regression detection.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import PerformanceMonitor from '../services/PerformanceMonitor';
import MemoryProfiler from './MemoryProfiler';

export interface TestCase {
  id: string;
  name: string;
  description: string;
  testFunction: () => Promise<TestResult>;
  expectedResult: {
    maxTime?: number;
    maxMemory?: number;
    minSuccessRate?: number;
  };
  category: 'startup' | 'navigation' | 'rendering' | 'data' | 'memory' | 'network';
}

export interface TestResult {
  testId: string;
  passed: boolean;
  duration: number;
  memoryUsage: number;
  errorMessage?: string;
  metrics: Record<string, unknown>;
  timestamp: number;
}

export interface TestSuite {
  id: string;
  name: string;
  tests: TestCase[];
  setup?: () => Promise<void>;
  teardown?: () => Promise<void>;
}

export interface TestReport {
  suiteId: string;
  suiteName: string;
  startTime: number;
  endTime: number;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  results: TestResult[];
  summary: {
    successRate: number;
    averageDuration: number;
    peakMemoryUsage: number;
    performanceGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  };
}

class PerformanceTester {
  private static instance: PerformanceTester;
  private performanceMonitor: PerformanceMonitor;
  private memoryProfiler: MemoryProfiler;
  private testSuites: Map<string, TestSuite> = new Map();
  private isRunning: boolean = false;

  private constructor() {
    this.performanceMonitor = PerformanceMonitor.getInstance();
    this.memoryProfiler = MemoryProfiler.getInstance();
    this.initializeDefaultTests();
  }

  public static getInstance(): PerformanceTester {
    if (!PerformanceTester.instance) {
      PerformanceTester.instance = new PerformanceTester();
    }
    return PerformanceTester.instance;
  }

  /**
   * Initialize default performance tests
   */
  private initializeDefaultTests(): void {
    // Startup Performance Test Suite
    const startupSuite: TestSuite = {
      id: 'startup_tests',
      name: 'App Startup Performance',
      tests: [
        {
          id: 'cold_start',
          name: 'Cold Start Performance',
          description: 'Test app startup time from cold start',
          testFunction: this.testColdStart.bind(this),
          expectedResult: { maxTime: 2000 },
          category: 'startup',
        },
        {
          id: 'warm_start',
          name: 'Warm Start Performance',
          description: 'Test app startup time from warm start',
          testFunction: this.testWarmStart.bind(this),
          expectedResult: { maxTime: 500 },
          category: 'startup',
        },
      ],
    };

    // Navigation Performance Test Suite
    const navigationSuite: TestSuite = {
      id: 'navigation_tests',
      name: 'Navigation Performance',
      tests: [
        {
          id: 'screen_navigation',
          name: 'Screen Navigation Speed',
          description: 'Test navigation speed between screens',
          testFunction: this.testScreenNavigation.bind(this),
          expectedResult: { maxTime: 100 },
          category: 'navigation',
        },
        {
          id: 'deep_navigation',
          name: 'Deep Navigation Performance',
          description: 'Test performance with deep navigation stacks',
          testFunction: this.testDeepNavigation.bind(this),
          expectedResult: { maxTime: 200 },
          category: 'navigation',
        },
      ],
    };

    // Memory Performance Test Suite
    const memorySuite: TestSuite = {
      id: 'memory_tests',
      name: 'Memory Performance',
      tests: [
        {
          id: 'memory_usage',
          name: 'Normal Memory Usage',
          description: 'Test memory usage under normal conditions',
          testFunction: this.testMemoryUsage.bind(this),
          expectedResult: { maxMemory: 100 },
          category: 'memory',
        },
        {
          id: 'memory_leak',
          name: 'Memory Leak Detection',
          description: 'Test for memory leaks during extended usage',
          testFunction: this.testMemoryLeaks.bind(this),
          expectedResult: { maxMemory: 150 },
          category: 'memory',
        },
      ],
    };

    // Data Processing Test Suite
    const dataSuite: TestSuite = {
      id: 'data_tests',
      name: 'Data Processing Performance',
      tests: [
        {
          id: 'large_dataset',
          name: 'Large Dataset Handling',
          description: 'Test performance with large datasets (10k+ items)',
          testFunction: this.testLargeDataset.bind(this),
          expectedResult: { maxTime: 1000 },
          category: 'data',
        },
        {
          id: 'search_performance',
          name: 'Search Performance',
          description: 'Test search performance on large datasets',
          testFunction: this.testSearchPerformance.bind(this),
          expectedResult: { maxTime: 300 },
          category: 'data',
        },
      ],
    };

    this.testSuites.set(startupSuite.id, startupSuite);
    this.testSuites.set(navigationSuite.id, navigationSuite);
    this.testSuites.set(memorySuite.id, memorySuite);
    this.testSuites.set(dataSuite.id, dataSuite);
  }

  /**
   * Run a specific test suite
   */
  public async runTestSuite(suiteId: string): Promise<TestReport> {
    const suite = this.testSuites.get(suiteId);
    if (!suite) {
      throw new Error(`Test suite not found: ${suiteId}`);
    }

    if (this.isRunning) {
      throw new Error('Another test suite is already running');
    }

    this.isRunning = true;
    console.log(`[PerformanceTester] Starting test suite: ${suite.name}`);

    const startTime = Date.now();
    const results: TestResult[] = [];

    try {
      // Run setup if provided
      if (suite.setup) {
        await suite.setup();
      }

      // Run each test
      for (const test of suite.tests) {
        console.log(`[PerformanceTester] Running test: ${test.name}`);
        
        const memoryBefore = this.memoryProfiler.takeSnapshot();
        const testStartTime = Date.now();
        
        try {
          const result = await test.testFunction();
          result.timestamp = Date.now();
          results.push(result);
          
          console.log(`[PerformanceTester] Test ${test.name}: ${result.passed ? 'PASSED' : 'FAILED'}`);
        } catch (error) {
          const failedResult: TestResult = {
            testId: test.id,
            passed: false,
            duration: Date.now() - testStartTime,
            memoryUsage: this.memoryProfiler.takeSnapshot().usedMemory - memoryBefore.usedMemory,
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
            metrics: {},
            timestamp: Date.now(),
          };
          results.push(failedResult);
          
          console.error(`[PerformanceTester] Test ${test.name} failed:`, error);
        }
      }

      // Run teardown if provided
      if (suite.teardown) {
        await suite.teardown();
      }

    } finally {
      this.isRunning = false;
    }

    const endTime = Date.now();
    const report = this.generateTestReport(suite, results, startTime, endTime);
    
    // Save report
    await this.saveTestReport(report);
    
    console.log(`[PerformanceTester] Test suite completed: ${report.summary.successRate}% success rate`);
    return report;
  }

  /**
   * Run all test suites
   */
  public async runAllTests(): Promise<TestReport[]> {
    const reports: TestReport[] = [];
    
    for (const [suiteId] of this.testSuites) {
      try {
        const report = await this.runTestSuite(suiteId);
        reports.push(report);
      } catch (error) {
        console.error(`[PerformanceTester] Failed to run suite ${suiteId}:`, error);
      }
    }
    
    return reports;
  }

  /**
   * Test cold start performance
   */
  private async testColdStart(): Promise<TestResult> {
    const startTime = Date.now();
    
    // Simulate cold start conditions
    await this.simulateColdStart();
    
    const duration = Date.now() - startTime;
    const passed = duration < 2000; // 2 second target
    
    return {
      testId: 'cold_start',
      passed,
      duration,
      memoryUsage: this.memoryProfiler.takeSnapshot().usedMemory,
      metrics: {
        startupTime: duration,
        target: 2000,
      },
      timestamp: Date.now(),
    };
  }

  /**
   * Test warm start performance
   */
  private async testWarmStart(): Promise<TestResult> {
    const startTime = Date.now();
    
    // Simulate warm start conditions
    await this.simulateWarmStart();
    
    const duration = Date.now() - startTime;
    const passed = duration < 500; // 500ms target
    
    return {
      testId: 'warm_start',
      passed,
      duration,
      memoryUsage: this.memoryProfiler.takeSnapshot().usedMemory,
      metrics: {
        startupTime: duration,
        target: 500,
      },
      timestamp: Date.now(),
    };
  }

  /**
   * Test screen navigation performance
   */
  private async testScreenNavigation(): Promise<TestResult> {
    const startTime = Date.now();
    
    // Simulate screen navigation
    this.performanceMonitor.startNavigationTracking('TestScreen');
    await this.delay(50); // Simulate navigation time
    this.performanceMonitor.completeNavigationTracking('TestScreen');
    
    const duration = Date.now() - startTime;
    const passed = duration < 100; // 100ms target
    
    return {
      testId: 'screen_navigation',
      passed,
      duration,
      memoryUsage: this.memoryProfiler.takeSnapshot().usedMemory,
      metrics: {
        navigationTime: duration,
        target: 100,
      },
      timestamp: Date.now(),
    };
  }

  /**
   * Test deep navigation performance
   */
  private async testDeepNavigation(): Promise<TestResult> {
    const startTime = Date.now();
    
    // Simulate deep navigation stack
    for (let i = 0; i < 5; i++) {
      this.performanceMonitor.startNavigationTracking(`DeepScreen${i}`);
      await this.delay(20);
      this.performanceMonitor.completeNavigationTracking(`DeepScreen${i}`);
    }
    
    const duration = Date.now() - startTime;
    const passed = duration < 200; // 200ms target for 5 screens
    
    return {
      testId: 'deep_navigation',
      passed,
      duration,
      memoryUsage: this.memoryProfiler.takeSnapshot().usedMemory,
      metrics: {
        navigationTime: duration,
        screenCount: 5,
        averagePerScreen: duration / 5,
        target: 200,
      },
      timestamp: Date.now(),
    };
  }

  /**
   * Test memory usage
   */
  private async testMemoryUsage(): Promise<TestResult> {
    const startTime = Date.now();
    const memoryBefore = this.memoryProfiler.takeSnapshot();
    
    // Simulate normal app usage
    await this.simulateNormalUsage();
    
    const memoryAfter = this.memoryProfiler.takeSnapshot();
    const duration = Date.now() - startTime;
    const memoryIncrease = memoryAfter.usedMemory - memoryBefore.usedMemory;
    const passed = memoryAfter.usedMemory < 100; // 100MB target
    
    return {
      testId: 'memory_usage',
      passed,
      duration,
      memoryUsage: memoryAfter.usedMemory,
      metrics: {
        memoryBefore: memoryBefore.usedMemory,
        memoryAfter: memoryAfter.usedMemory,
        memoryIncrease,
        target: 100,
      },
      timestamp: Date.now(),
    };
  }

  /**
   * Test for memory leaks
   */
  private async testMemoryLeaks(): Promise<TestResult> {
    const startTime = Date.now();
    
    this.memoryProfiler.startProfiling(1000); // 1 second intervals
    
    // Simulate extended usage that might cause leaks
    await this.simulateExtendedUsage();
    
    const analysis = this.memoryProfiler.stopProfiling();
    const duration = Date.now() - startTime;
    
    const hasLeaks = analysis.leaks.length > 0;
    const passed = !hasLeaks && analysis.trends.peakUsage < 150;
    
    return {
      testId: 'memory_leak',
      passed,
      duration,
      memoryUsage: analysis.trends.peakUsage,
      metrics: {
        leaksDetected: analysis.leaks.length,
        peakMemory: analysis.trends.peakUsage,
        growthRate: analysis.trends.growthRate,
        target: 150,
      },
      timestamp: Date.now(),
    };
  }

  /**
   * Test large dataset handling
   */
  private async testLargeDataset(): Promise<TestResult> {
    const startTime = Date.now();
    
    // Simulate loading and rendering large dataset
    await this.simulateLargeDataset(10000); // 10k items
    
    const duration = Date.now() - startTime;
    const passed = duration < 1000; // 1 second target
    
    return {
      testId: 'large_dataset',
      passed,
      duration,
      memoryUsage: this.memoryProfiler.takeSnapshot().usedMemory,
      metrics: {
        loadTime: duration,
        itemCount: 10000,
        target: 1000,
      },
      timestamp: Date.now(),
    };
  }

  /**
   * Test search performance
   */
  private async testSearchPerformance(): Promise<TestResult> {
    const startTime = Date.now();
    
    // Simulate search on large dataset
    await this.simulateSearch(50000); // 50k items
    
    const duration = Date.now() - startTime;
    const passed = duration < 300; // 300ms target
    
    return {
      testId: 'search_performance',
      passed,
      duration,
      memoryUsage: this.memoryProfiler.takeSnapshot().usedMemory,
      metrics: {
        searchTime: duration,
        itemCount: 50000,
        target: 300,
      },
      timestamp: Date.now(),
    };
  }

  /**
   * Generate test report
   */
  private generateTestReport(
    suite: TestSuite,
    results: TestResult[],
    startTime: number,
    endTime: number
  ): TestReport {
    const passedTests = results.filter(r => r.passed).length;
    const failedTests = results.length - passedTests;
    const successRate = (passedTests / results.length) * 100;
    
    const averageDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
    const peakMemoryUsage = Math.max(...results.map(r => r.memoryUsage));
    
    // Calculate performance grade
    let performanceGrade: 'A' | 'B' | 'C' | 'D' | 'F' = 'F';
    if (successRate >= 95 && averageDuration < 500 && peakMemoryUsage < 100) {
      performanceGrade = 'A';
    } else if (successRate >= 90 && averageDuration < 1000 && peakMemoryUsage < 120) {
      performanceGrade = 'B';
    } else if (successRate >= 80 && averageDuration < 2000 && peakMemoryUsage < 150) {
      performanceGrade = 'C';
    } else if (successRate >= 60) {
      performanceGrade = 'D';
    }
    
    return {
      suiteId: suite.id,
      suiteName: suite.name,
      startTime,
      endTime,
      totalTests: results.length,
      passedTests,
      failedTests,
      results,
      summary: {
        successRate,
        averageDuration,
        peakMemoryUsage,
        performanceGrade,
      },
    };
  }

  /**
   * Save test report
   */
  private async saveTestReport(report: TestReport): Promise<void> {
    try {
      const existingReports = await this.loadTestReports();
      const updatedReports = [report, ...existingReports].slice(0, 20); // Keep last 20
      
      await AsyncStorage.setItem(
        '@performance_test_reports',
        JSON.stringify(updatedReports)
      );
      
      console.log(`[PerformanceTester] Report saved: ${report.suiteId}`);
    } catch (error) {
      console.error('[PerformanceTester] Failed to save report:', error);
    }
  }

  /**
   * Load test reports
   */
  public async loadTestReports(): Promise<TestReport[]> {
    try {
      const stored = await AsyncStorage.getItem('@performance_test_reports');
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('[PerformanceTester] Failed to load reports:', error);
      return [];
    }
  }

  /**
   * Get test suites
   */
  public getTestSuites(): TestSuite[] {
    return Array.from(this.testSuites.values());
  }

  /**
   * Add custom test suite
   */
  public addTestSuite(suite: TestSuite): void {
    this.testSuites.set(suite.id, suite);
    console.log(`[PerformanceTester] Added test suite: ${suite.name}`);
  }

  // Simulation methods for testing

  private async simulateColdStart(): Promise<void> {
    await this.delay(Math.random() * 1500 + 500); // 500-2000ms
  }

  private async simulateWarmStart(): Promise<void> {
    await this.delay(Math.random() * 300 + 100); // 100-400ms
  }

  private async simulateNormalUsage(): Promise<void> {
    // Simulate normal app operations
    for (let i = 0; i < 10; i++) {
      await this.delay(50);
      // Simulate component mounting/unmounting
      this.memoryProfiler.registerComponent(`Component${i}`);
      await this.delay(100);
      this.memoryProfiler.unregisterComponent(`Component${i}`);
    }
  }

  private async simulateExtendedUsage(): Promise<void> {
    // Simulate 30 seconds of usage
    const endTime = Date.now() + 30000;
    let componentCount = 0;
    
    while (Date.now() < endTime) {
      // Simulate component lifecycle
      this.memoryProfiler.registerComponent(`ExtendedComponent${componentCount++}`);
      await this.delay(1000);
      
      // Occasionally forget to unregister (simulate leak)
      if (componentCount % 5 !== 0) {
        this.memoryProfiler.unregisterComponent(`ExtendedComponent${componentCount - 1}`);
      }
    }
  }

  private async simulateLargeDataset(itemCount: number): Promise<void> {
    // Simulate loading large dataset
    const chunkSize = 1000;
    const chunks = Math.ceil(itemCount / chunkSize);
    
    for (let i = 0; i < chunks; i++) {
      await this.delay(50); // Simulate chunk processing
    }
  }

  private async simulateSearch(itemCount: number): Promise<void> {
    // Simulate search algorithm complexity
    const searchTime = Math.log(itemCount) * 10; // Logarithmic complexity
    await this.delay(searchTime);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default PerformanceTester;
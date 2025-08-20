import { Alert } from 'react-native';
import { CallLogCollector } from '../services/android/CallLogCollector';
import { SmsLogCollector } from '../services/android/SmsLogCollector';
import { FileImportService } from '../services/ios/FileImportService';
import { PermissionsManager } from '../services/PermissionsManager';
import { PlatformDetector } from './PlatformDetector';

export interface TestResult {
  testName: string;
  passed: boolean;
  message: string;
  duration: number;
  data?: unknown;
}

export interface TestSuite {
  suiteName: string;
  results: TestResult[];
  totalTests: number;
  passedTests: number;
  failedTests: number;
  totalDuration: number;
}

class DataCollectionTesterClass {
  private static instance: DataCollectionTesterClass;

  private constructor() {}

  public static getInstance(): DataCollectionTesterClass {
    if (!DataCollectionTesterClass.instance) {
      DataCollectionTesterClass.instance = new DataCollectionTesterClass();
    }
    return DataCollectionTesterClass.instance;
  }

  /**
   * Run all data collection tests
   */
  public async runAllTests(): Promise<TestSuite[]> {
    const suites: TestSuite[] = [];

    // Platform detection tests
    suites.push(await this.runPlatformTests());

    // Permission tests
    suites.push(await this.runPermissionTests());

    if (PlatformDetector.isAndroid) {
      // Android native data collection tests
      suites.push(await this.runAndroidCallLogTests());
      suites.push(await this.runAndroidSmsTests());
    }

    if (PlatformDetector.isIOS || PlatformDetector.config.capabilities.supportsFileImport) {
      // File import tests
      suites.push(await this.runFileImportTests());
    }

    return suites;
  }

  /**
   * Run platform detection tests
   */
  public async runPlatformTests(): Promise<TestSuite> {
    const results: TestResult[] = [];
    const startTime = Date.now();

    // Test platform detection
    results.push(await this.runTest(
      'Platform Detection',
      async () => {
        await PlatformDetector.initialize();
        const config = PlatformDetector.config;
        
        if (!config) {
          throw new Error('Platform config not initialized');
        }

        return {
          platform: config.platform,
          capabilities: config.capabilities,
        };
      }
    ));

    // Test capability detection
    results.push(await this.runTest(
      'Capability Detection',
      async () => {
        const capabilities = PlatformDetector.config.capabilities;
        const expectedAndroid = PlatformDetector.isAndroid;
        const expectedIOS = PlatformDetector.isIOS;

        if (expectedAndroid && !capabilities.canAccessCallLog) {
          throw new Error('Android should support call log access');
        }

        if (expectedIOS && capabilities.canAccessCallLog) {
          throw new Error('iOS should not support call log access');
        }

        return capabilities;
      }
    ));

    const totalDuration = Date.now() - startTime;
    
    return this.createTestSuite('Platform Tests', results, totalDuration);
  }

  /**
   * Run permission tests
   */
  public async runPermissionTests(): Promise<TestSuite> {
    const results: TestResult[] = [];
    const startTime = Date.now();

    // Test permission checking
    results.push(await this.runTest(
      'Permission Status Check',
      async () => {
        const permissions = await PermissionsManager.checkAllPermissions();
        return permissions;
      }
    ));

    // Test permission summary
    results.push(await this.runTest(
      'Permission Summary',
      async () => {
        const summary = PermissionsManager.getPermissionsSummary();
        return summary;
      }
    ));

    // Test data collection capability
    results.push(await this.runTest(
      'Data Collection Capability',
      async () => {
        const canCollect = PermissionsManager.canCollectData;
        const requiredPerms = PermissionsManager.requiredPermissions;
        
        return {
          canCollectData: canCollect,
          requiredPermissions: requiredPerms,
        };
      }
    ));

    const totalDuration = Date.now() - startTime;
    
    return this.createTestSuite('Permission Tests', results, totalDuration);
  }

  /**
   * Run Android call log tests
   */
  public async runAndroidCallLogTests(): Promise<TestSuite> {
    const results: TestResult[] = [];
    const startTime = Date.now();

    if (!PlatformDetector.isAndroid) {
      return this.createTestSuite('Android Call Log Tests', [
        {
          testName: 'Platform Check',
          passed: false,
          message: 'Not running on Android',
          duration: 0,
        }
      ], 0);
    }

    // Test call log availability
    results.push(await this.runTest(
      'Call Log Availability',
      async () => {
        const canCollect = await CallLogCollector.canCollectCallLog();
        return { canCollectCallLog: canCollect };
      }
    ));

    // Test call log count (if permissions available)
    results.push(await this.runTest(
      'Call Log Count',
      async () => {
        const count = await CallLogCollector.getCallLogCount();
        return { callLogCount: count };
      }
    ));

    // Test call log collection availability
    results.push(await this.runTest(
      'Call Log Collection (Availability)',
      async () => {
        const canCollect = await CallLogCollector.canCollectCallLog();
        const guidance = CallLogCollector.getCollectionGuidance();
        return {
          canCollectNatively: canCollect,
          alternatives: guidance.alternatives.length,
          guidanceAvailable: true,
        };
      }
    ));

    // Test call log processing with sample data
    results.push(await this.runTest(
      'Call Log Processing',
      async () => {
        // Test with sample mock data
        const sampleData = [
          { number: '555-1234', timestamp: new Date().toISOString(), duration: '120', direction: 'outbound' },
          { number: '555-5678', timestamp: new Date().toISOString(), duration: '45', direction: 'inbound' },
        ];
        
        const processed = CallLogCollector.processImportedCallLog(sampleData);
        
        return {
          sampleSize: sampleData.length,
          processedCount: processed.length,
          success: processed.length > 0,
        };
      }
    ));

    const totalDuration = Date.now() - startTime;
    
    return this.createTestSuite('Android Call Log Tests', results, totalDuration);
  }

  /**
   * Run Android SMS tests
   */
  public async runAndroidSmsTests(): Promise<TestSuite> {
    const results: TestResult[] = [];
    const startTime = Date.now();

    if (!PlatformDetector.isAndroid) {
      return this.createTestSuite('Android SMS Tests', [
        {
          testName: 'Platform Check',
          passed: false,
          message: 'Not running on Android',
          duration: 0,
        }
      ], 0);
    }

    // Test SMS availability
    results.push(await this.runTest(
      'SMS Availability',
      async () => {
        const canCollect = await SmsLogCollector.canCollectSmsLog();
        return { canCollectSmsLog: canCollect };
      }
    ));

    // Test SMS count
    results.push(await this.runTest(
      'SMS Count',
      async () => {
        const count = await SmsLogCollector.getSmsLogCount();
        return { smsCount: count };
      }
    ));

    // Test SMS collection (metadata only for privacy)
    results.push(await this.runTest(
      'SMS Metadata Collection (Sample)',
      async () => {
        const canCollect = await SmsLogCollector.canCollectSmsLog();
        const guidance = SmsLogCollector.getCollectionGuidance();
        return {
          canCollectNatively: canCollect,
          alternatives: guidance.alternatives.length,
          guidanceAvailable: true,
        };
      }
    ));

    // Test SMS processing with sample data
    results.push(await this.runTest(
      'SMS Processing',
      async () => {
        // Test with sample mock data
        const sampleData = [
          { address: '555-1234', date: Date.now().toString(), body: 'Test message', type: '2' },
          { address: '555-5678', date: Date.now().toString(), body: 'Reply message', type: '1' },
        ];
        
        const processed = SmsLogCollector.processImportedSmsLog(sampleData, false); // No content for privacy
        
        return {
          sampleSize: sampleData.length,
          processedCount: processed.length,
          success: processed.length > 0,
        };
      }
    ));

    const totalDuration = Date.now() - startTime;
    
    return this.createTestSuite('Android SMS Tests', results, totalDuration);
  }

  /**
   * Run file import tests
   */
  public async runFileImportTests(): Promise<TestSuite> {
    const results: TestResult[] = [];
    const startTime = Date.now();

    // Test file import availability
    results.push(await this.runTest(
      'File Import Availability',
      async () => {
        return { 
          isAvailable: FileImportService.isAvailable,
          supportsFileImport: PlatformDetector.config.capabilities.supportsFileImport,
        };
      }
    ));

    // Test active uploads tracking
    results.push(await this.runTest(
      'Active Uploads Tracking',
      async () => {
        const activeUploads = FileImportService.getActiveUploads();
        return { activeUploads: activeUploads.length };
      }
    ));

    const totalDuration = Date.now() - startTime;
    
    return this.createTestSuite('File Import Tests', results, totalDuration);
  }

  /**
   * Run a single test with error handling and timing
   */
  private async runTest(testName: string, testFn: () => Promise<unknown>): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      const data = await testFn();
      const duration = Date.now() - startTime;
      
      return {
        testName,
        passed: true,
        message: 'Test passed',
        duration,
        data,
      };
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      
      return {
        testName,
        passed: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        duration,
      };
    }
  }

  /**
   * Create a test suite summary
   */
  private createTestSuite(suiteName: string, results: TestResult[], totalDuration: number): TestSuite {
    const passedTests = results.filter(r => r.passed).length;
    const failedTests = results.filter(r => !r.passed).length;
    
    return {
      suiteName,
      results,
      totalTests: results.length,
      passedTests,
      failedTests,
      totalDuration,
    };
  }

  /**
   * Display test results in a user-friendly alert
   */
  public displayTestResults(suites: TestSuite[]): void {
    const totalTests = suites.reduce((sum, suite) => sum + suite.totalTests, 0);
    const totalPassed = suites.reduce((sum, suite) => sum + suite.passedTests, 0);
    const totalDuration = suites.reduce((sum, suite) => sum + suite.totalDuration, 0);

    const summary = suites.map(suite => 
      `${suite.suiteName}: ${suite.passedTests}/${suite.totalTests} passed`
    ).join('\n');

    Alert.alert(
      'Data Collection Test Results',
      `Overall: ${totalPassed}/${totalTests} tests passed\n` +
      `Duration: ${totalDuration}ms\n\n` +
      summary,
      [
        { text: 'View Details', onPress: () => this.displayDetailedResults(suites) },
        { text: 'OK' },
      ]
    );
  }

  /**
   * Display detailed test results
   */
  private displayDetailedResults(suites: TestSuite[]): void {
    const details = suites.map(suite => {
      const failedTests = suite.results.filter(r => !r.passed);
      if (failedTests.length === 0) {
        return `✅ ${suite.suiteName}: All tests passed`;
      } else {
        const failures = failedTests.map(test => 
          `  • ${test.testName}: ${test.message}`
        ).join('\n');
        return `❌ ${suite.suiteName}:\n${failures}`;
      }
    }).join('\n\n');

    Alert.alert(
      'Detailed Test Results',
      details,
      [{ text: 'OK' }]
    );
  }

  /**
   * Quick test for development - runs essential tests only
   */
  public async runQuickTest(): Promise<void> {
    try {
      const platformSuite = await this.runPlatformTests();
      const permissionSuite = await this.runPermissionTests();
      
      const suites = [platformSuite, permissionSuite];
      
      if (PlatformDetector.isAndroid) {
        // Quick Android test - just availability checks
        const callLogResult = await this.runTest(
          'Call Log Quick Check',
          async () => ({ canCollect: await CallLogCollector.canCollectCallLog() })
        );
        
        const smsResult = await this.runTest(
          'SMS Quick Check',
          async () => ({ canCollect: await SmsLogCollector.canCollectSmsLog() })
        );
        
        suites.push(this.createTestSuite('Quick Android Tests', [callLogResult, smsResult], 0));
      }
      
      this.displayTestResults(suites);
    } catch (error: unknown) {
      Alert.alert(
        'Test Error',
        `Failed to run tests: ${error instanceof Error ? error.message : 'Unknown error'}`,
        [{ text: 'OK' }]
      );
    }
  }
}

export const DataCollectionTester = DataCollectionTesterClass.getInstance();
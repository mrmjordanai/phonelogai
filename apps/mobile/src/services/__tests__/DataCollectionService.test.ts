/**
 * Test suite for simplified DataCollectionService
 * Verifies that the service initializes without native module conflicts
 */

import { DataCollectionService } from '../DataCollectionService';

describe('DataCollectionService', () => {
  beforeEach(() => {
    // Reset any existing state
    jest.clearAllMocks();
  });

  it('should be able to instantiate without errors', () => {
    expect(DataCollectionService).toBeDefined();
    expect(typeof DataCollectionService.initialize).toBe('function');
    expect(typeof DataCollectionService.getCapabilities).toBe('function');
  });

  it('should provide platform capabilities', async () => {
    const capabilities = await DataCollectionService.getCapabilities();
    
    expect(capabilities).toHaveProperty('canAccessContacts');
    expect(capabilities).toHaveProperty('canImportFiles');
    expect(capabilities).toHaveProperty('canManualEntry');
    expect(capabilities).toHaveProperty('supportedFileTypes');
    expect(capabilities).toHaveProperty('platformFeatures');

    // File import should always be available
    expect(capabilities.canImportFiles).toBe(true);
    expect(capabilities.canManualEntry).toBe(true);
    expect(Array.isArray(capabilities.supportedFileTypes)).toBe(true);
    expect(capabilities.supportedFileTypes.length).toBeGreaterThan(0);
  });

  it('should provide data collection guidance', async () => {
    const guidance = await DataCollectionService.canCollectData();
    
    expect(guidance).toHaveProperty('available');
    expect(guidance).toHaveProperty('reasons');
    expect(guidance).toHaveProperty('alternatives');

    // Should always be available through alternatives
    expect(guidance.available).toBe(true);
    expect(Array.isArray(guidance.alternatives)).toBe(true);
    expect(guidance.alternatives.length).toBeGreaterThan(0);
  });

  it('should support file import method', () => {
    expect(typeof DataCollectionService.importFiles).toBe('function');
    expect(typeof DataCollectionService.getDataCollectionGuidance).toBe('function');
  });

  it('should provide user guidance', () => {
    const guidance = DataCollectionService.getDataCollectionGuidance();
    
    expect(guidance).toHaveProperty('primaryMethods');
    expect(guidance).toHaveProperty('platformSpecific');
    expect(guidance).toHaveProperty('fileFormats');

    expect(Array.isArray(guidance.primaryMethods)).toBe(true);
    expect(guidance.primaryMethods.length).toBeGreaterThan(0);
    
    expect(guidance.platformSpecific).toHaveProperty('android');
    expect(guidance.platformSpecific).toHaveProperty('ios');
    
    expect(Array.isArray(guidance.fileFormats)).toBe(true);
    expect(guidance.fileFormats.length).toBeGreaterThan(0);
  });

  it('should handle progress tracking', () => {
    const unsubscribe = DataCollectionService.onProgress((_progress) => {
      // Progress callback
    });
    
    expect(typeof unsubscribe).toBe('function');
    
    // Should be able to unsubscribe
    unsubscribe();
  });

  it('should report collection status', () => {
    expect(typeof DataCollectionService.isCollecting).toBe('boolean');
    expect(DataCollectionService.isCollecting).toBe(false); // Initially not collecting
  });
});

// Test that simplified collectors work without native modules
describe('Simplified Android Collectors', () => {
  it('should not require native module access', async () => {
    const { CallLogCollector } = await import('../android/CallLogCollector');
    const { SmsLogCollector } = await import('../android/SmsLogCollector');
    
    // These should always return false since we don't have native modules
    expect(await CallLogCollector.canCollectCallLog()).toBe(false);
    expect(await SmsLogCollector.canCollectSmsLog()).toBe(false);
    
    // But should provide guidance
    expect(typeof CallLogCollector.getCollectionGuidance).toBe('function');
    expect(typeof SmsLogCollector.getCollectionGuidance).toBe('function');
    
    const callGuidance = CallLogCollector.getCollectionGuidance();
    const smsGuidance = SmsLogCollector.getCollectionGuidance();
    
    expect(callGuidance.nativeAccessAvailable).toBe(false);
    expect(smsGuidance.nativeAccessAvailable).toBe(false);
    
    expect(Array.isArray(callGuidance.alternatives)).toBe(true);
    expect(Array.isArray(smsGuidance.alternatives)).toBe(true);
  });

  it('should support manual entry creation', () => {
    const { CallLogCollector } = require('../android/CallLogCollector');
    
    const manualEntry = CallLogCollector.createManualEntry({
      number: '+1234567890',
      timestamp: new Date(),
      duration: 120,
      direction: 'outbound',
      isAnswered: true,
      contactName: 'Test Contact',
    });
    
    expect(manualEntry).toHaveProperty('id');
    expect(manualEntry).toHaveProperty('number', '+1234567890');
    expect(manualEntry).toHaveProperty('duration', 120);
    expect(manualEntry).toHaveProperty('direction', 'outbound');
    expect(manualEntry).toHaveProperty('isAnswered', true);
    expect(manualEntry).toHaveProperty('type', 'call');
    expect(manualEntry.metadata.source).toBe('manual_entry');
  });

  it('should support data import processing', () => {
    const { CallLogCollector } = require('../android/CallLogCollector');
    const { SmsLogCollector } = require('../android/SmsLogCollector');
    
    // Test call log import
    const callData = [{
      number: '+1234567890',
      date: '2023-10-01T14:30:00Z',
      duration: 120,
      type: 'outgoing',
    }];
    
    const callEntries = CallLogCollector.processImportedCallLog(callData);
    expect(Array.isArray(callEntries)).toBe(true);
    expect(callEntries.length).toBe(1);
    expect(callEntries[0]).toHaveProperty('type', 'call');
    
    // Test SMS import
    const smsData = [{
      number: '+1234567890',
      date: '2023-10-01T14:30:00Z',
      type: 'sent',
      message: 'Test message',
    }];
    
    const smsEntries = SmsLogCollector.processImportedSmsLog(smsData);
    expect(Array.isArray(smsEntries)).toBe(true);
    expect(smsEntries.length).toBe(1);
    expect(smsEntries[0]).toHaveProperty('type', 'sms');
  });
});
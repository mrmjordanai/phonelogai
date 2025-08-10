import { ConflictResolver } from '../ConflictResolver';
import { DuplicateDetector } from '../DuplicateDetector';
import { Event, ConflictEvent } from '@phonelogai/types';
import { supabase } from '@phonelogai/database';

// Mock Supabase
jest.mock('@phonelogai/database', () => ({
  supabase: {
    rpc: jest.fn(),
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn()
        }))
      }))
    }))
  }
}));

const mockSupabase = supabase as jest.Mocked<typeof supabase>;

// Base event used throughout tests
const baseEvent: Event = {
  id: 'base-1',
  user_id: 'user-1',
  line_id: 'line-1',
  ts: '2023-01-01T10:00:00Z',
  number: '+1234567890',
  direction: 'inbound',
  type: 'call',
  duration: 120,
  created_at: '2023-01-01T10:00:00Z',
  updated_at: '2023-01-01T10:00:00Z'
};

describe('ConflictResolver', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Quality Score Calculation', () => {
    it('should calculate quality score correctly for complete event', () => {
      const event: Event = {
        id: 'test-1',
        user_id: 'user-1',
        line_id: 'line-1',
        ts: '2023-01-01T10:00:00Z',
        number: '+1234567890',
        direction: 'inbound',
        type: 'call',
        duration: 120,
        content: null,
        contact_id: 'contact-1',
        created_at: '2023-01-01T10:00:00Z',
        updated_at: '2023-01-01T10:00:00Z'
      };

      const score = ConflictResolver.calculateQualityScore(event);

      expect(score.completeness).toBeGreaterThan(0.8);
      expect(score.source_reliability).toBe(0.7); // Default device source
      expect(score.overall).toBeGreaterThan(0.7);
      expect(score.overall).toBeLessThanOrEqual(1.0);
    });

    it('should handle missing optional fields in quality calculation', () => {
      const event: Event = {
        id: 'test-1',
        user_id: 'user-1',
        line_id: 'line-1',
        ts: '2023-01-01T10:00:00Z',
        number: '+1234567890',
        direction: 'inbound',
        type: 'sms',
        created_at: '2023-01-01T10:00:00Z',
        updated_at: '2023-01-01T10:00:00Z'
      };

      const score = ConflictResolver.calculateQualityScore(event);

      expect(score.completeness).toBeLessThan(1.0);
      expect(score.completeness).toBeGreaterThan(0.5);
    });

    it('should prioritize carrier source over device', () => {
      const carrierEvent = {
        id: 'carrier-1',
        user_id: 'user-1',
        line_id: 'line-1',
        ts: '2023-01-01T10:00:00Z',
        number: '+1234567890',
        direction: 'inbound' as const,
        type: 'call' as const,
        source: 'carrier',
        created_at: '2023-01-01T10:00:00Z',
        updated_at: '2023-01-01T10:00:00Z'
      };

      const deviceEvent = {
        ...carrierEvent,
        id: 'device-1',
        source: 'device'
      };

      const carrierScore = ConflictResolver.calculateQualityScore(carrierEvent as Event);
      const deviceScore = ConflictResolver.calculateQualityScore(deviceEvent as Event);

      expect(carrierScore.source_reliability).toBe(0.9);
      expect(deviceScore.source_reliability).toBe(0.7);
      expect(carrierScore.overall).toBeGreaterThan(deviceScore.overall);
    });
  });

  describe('Conflict Detection', () => {

    it('should detect exact duplicates', () => {
      const duplicateEvent = { ...baseEvent, id: 'duplicate-1' };
      const existingEvents = [duplicateEvent];

      const result = ConflictResolver.detectDuplicate(baseEvent, existingEvents);

      expect(result.isDuplicate).toBe(true);
      expect(result.conflictType).toBe('exact');
      expect(result.confidence).toBeGreaterThan(0.9);
      expect(result.existingEventId).toBe('duplicate-1');
    });

    it('should detect time variance conflicts', () => {
      const timeVariantEvent = {
        ...baseEvent,
        id: 'variant-1',
        ts: '2023-01-01T10:00:01Z' // 1 second difference
      };
      const existingEvents = [timeVariantEvent];

      const result = ConflictResolver.detectDuplicate(baseEvent, existingEvents);

      expect(result.isDuplicate).toBe(true);
      expect(result.conflictType).toBe('time_variance');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should not detect conflicts for different numbers', () => {
      const differentEvent = {
        ...baseEvent,
        id: 'different-1',
        number: '+0987654321'
      };
      const existingEvents = [differentEvent];

      const result = ConflictResolver.detectDuplicate(baseEvent, existingEvents);

      expect(result.isDuplicate).toBe(false);
      expect(result.confidence).toBe(0);
    });

    it('should not detect conflicts for different line_ids', () => {
      const differentEvent = {
        ...baseEvent,
        id: 'different-1',
        line_id: 'line-2'
      };
      const existingEvents = [differentEvent];

      const result = ConflictResolver.detectDuplicate(baseEvent, existingEvents);

      expect(result.isDuplicate).toBe(false);
      expect(result.confidence).toBe(0);
    });
  });

  describe('Database Integration', () => {
    it('should call database function for conflict detection', async () => {
      const mockConflicts = [
        {
          original_id: 'event-1',
          duplicate_id: 'event-2',
          conflict_type: 'exact',
          similarity: 1.0,
          original_source: 'carrier',
          duplicate_source: 'device'
        }
      ];

      mockSupabase.rpc.mockResolvedValue({ data: mockConflicts, error: null });
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { ...baseEvent },
              error: null
            })
          })
        })
      } as ReturnType<typeof mockSupabase.from>);

      const result = await ConflictResolver.detectConflictsBatch('user-1', {
        batchSize: 10
      });

      expect(mockSupabase.rpc).toHaveBeenCalledWith('detect_event_conflicts', {
        p_user_id: 'user-1',
        p_batch_size: 10,
        p_time_tolerance_seconds: 1
      });

      expect(result).toHaveLength(1);
      expect(result[0].conflict_type).toBe('exact');
      expect(result[0].similarity).toBe(1.0);
    });

    it('should handle database errors gracefully', async () => {
      mockSupabase.rpc.mockResolvedValue({ 
        data: null, 
        error: { message: 'Database error' } 
      });

      const result = await ConflictResolver.detectConflictsBatch('user-1');

      expect(result).toEqual([]);
    });

    it('should fetch conflict metrics from database', async () => {
      const mockMetrics = {
        total_conflicts: 10,
        auto_resolved: 8,
        manual_resolved: 1,
        pending_resolution: 1,
        auto_resolution_rate: 80,
        avg_resolution_time: 5.2,
        data_quality_improvement: 95
      };

      mockSupabase.rpc.mockResolvedValue({ data: mockMetrics, error: null });

      const result = await ConflictResolver.getConflictMetrics('user-1');

      expect(mockSupabase.rpc).toHaveBeenCalledWith('get_conflict_metrics', {
        p_user_id: 'user-1'
      });

      expect(result).toEqual(mockMetrics);
    });
  });

  describe('Conflict Resolution', () => {
    it('should resolve high-confidence conflicts automatically', async () => {
      const conflict: ConflictEvent = {
        id: 'conflict-1',
        user_id: 'user-1',
        original: { ...baseEvent },
        duplicate: { ...baseEvent, id: 'duplicate-1' },
        conflict_type: 'exact',
        similarity: 0.95,
        original_quality: {
          completeness: 0.9,
          source_reliability: 0.9,
          freshness: 1.0,
          overall: 0.93
        },
        duplicate_quality: {
          completeness: 0.8,
          source_reliability: 0.7,
          freshness: 1.0,
          overall: 0.8
        },
        resolution_strategy: 'automatic',
        created_at: '2023-01-01T10:00:00Z'
      };

      mockSupabase.rpc.mockResolvedValue({ data: 'resolution-id', error: null });

      const result = await ConflictResolver.resolveConflictsAutomatically([conflict]);

      expect(result).toHaveLength(1);
      expect(result[0].auto_resolved).toBe(true);
      expect(result[0].resolution_strategy).toBe('automatic');
    });

    it('should not auto-resolve low-confidence conflicts', async () => {
      const conflict: ConflictEvent = {
        id: 'conflict-1',
        user_id: 'user-1',
        original: { ...baseEvent },
        duplicate: { ...baseEvent, id: 'duplicate-1' },
        conflict_type: 'fuzzy',
        similarity: 0.75, // Below auto-resolve threshold
        original_quality: {
          completeness: 0.8,
          source_reliability: 0.7,
          freshness: 1.0,
          overall: 0.8
        },
        duplicate_quality: {
          completeness: 0.8,
          source_reliability: 0.7,
          freshness: 1.0,
          overall: 0.8
        },
        resolution_strategy: 'manual',
        created_at: '2023-01-01T10:00:00Z'
      };

      const result = await ConflictResolver.resolveConflictsAutomatically([conflict]);

      expect(result).toHaveLength(0);
    });
  });

  describe('Performance and Error Handling', () => {
    it('should handle large batches efficiently', async () => {
      const startTime = Date.now();
      
      // Mock a large number of conflicts
      const mockConflicts = Array.from({ length: 1000 }, (_, i) => ({
        original_id: `event-${i}`,
        duplicate_id: `event-${i + 1000}`,
        conflict_type: 'exact',
        similarity: 1.0,
        original_source: 'device',
        duplicate_source: 'device'
      }));

      mockSupabase.rpc.mockResolvedValue({ data: mockConflicts, error: null });
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { ...baseEvent },
              error: null
            })
          })
        })
      } as ReturnType<typeof mockSupabase.from>);

      const result = await ConflictResolver.detectConflictsBatch('user-1', {
        batchSize: 1000
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete within reasonable time (under 5 seconds for this test)
      expect(duration).toBeLessThan(5000);
      expect(result).toBeDefined();
    });

    it('should handle network errors gracefully', async () => {
      mockSupabase.rpc.mockRejectedValue(new Error('Network error'));

      const result = await ConflictResolver.detectConflictsBatch('user-1');

      expect(result).toEqual([]);
    });
  });
});

describe('DuplicateDetector', () => {
  describe('Phone Number Normalization', () => {
    it('should normalize US phone numbers to E.164', () => {
      const testCases = [
        { input: '1234567890', expected: '+11234567890' },
        { input: '(123) 456-7890', expected: '+11234567890' },
        { input: '+1-123-456-7890', expected: '+11234567890' },
        { input: '11234567890', expected: '+11234567890' }
      ];

      testCases.forEach(({ input, expected }) => {
        const result = DuplicateDetector.normalizePhoneNumber(input);
        expect(result.normalized).toBe(expected);
        expect(result.countryCode).toBe('US');
      });
    });

    it('should handle international numbers', () => {
      const result = DuplicateDetector.normalizePhoneNumber('+44123456789');
      expect(result.normalized).toBe('+44123456789');
      expect(result.countryCode).toBe('GB');
    });
  });

  describe('Phone Number Comparison', () => {
    it('should detect exact matches', () => {
      const similarity = DuplicateDetector.comparePhoneNumbers(
        '+1234567890',
        '+1234567890'
      );
      expect(similarity).toBe(1.0);
    });

    it('should detect format variations', () => {
      const similarity = DuplicateDetector.comparePhoneNumbers(
        '(123) 456-7890',
        '+11234567890'
      );
      expect(similarity).toBe(1.0);
    });

    it('should detect partial matches', () => {
      const similarity = DuplicateDetector.comparePhoneNumbers(
        '1234567890',
        '4567890' // Last 7 digits
      );
      expect(similarity).toBeGreaterThan(0.5);
      expect(similarity).toBeLessThan(1.0);
    });
  });

  describe('Content Similarity', () => {
    it('should detect identical SMS content', () => {
      const similarity = DuplicateDetector.compareContent(
        'Hello world',
        'Hello world'
      );
      expect(similarity).toBe(1.0);
    });

    it('should handle case differences', () => {
      const similarity = DuplicateDetector.compareContent(
        'Hello World',
        'hello world'
      );
      expect(similarity).toBe(1.0);
    });

    it('should calculate similarity for similar content', () => {
      const similarity = DuplicateDetector.compareContent(
        'Hello world how are you',
        'Hello world how r u'
      );
      expect(similarity).toBeGreaterThan(0.7);
      expect(similarity).toBeLessThan(1.0);
    });

    it('should handle null/undefined content', () => {
      expect(DuplicateDetector.compareContent(null, null)).toBe(1.0);
      expect(DuplicateDetector.compareContent(null, 'hello')).toBe(0.0);
      expect(DuplicateDetector.compareContent('hello', undefined)).toBe(0.0);
    });
  });

  describe('Timestamp Comparison', () => {
    it('should detect exact timestamp matches', () => {
      const result = DuplicateDetector.compareTimestamps(
        '2023-01-01T10:00:00Z',
        '2023-01-01T10:00:00Z',
        1
      );
      expect(result.similarity).toBe(1.0);
      expect(result.withinTolerance).toBe(true);
      expect(result.timeDiffSeconds).toBe(0);
    });

    it('should handle timestamp variance within tolerance', () => {
      const result = DuplicateDetector.compareTimestamps(
        '2023-01-01T10:00:00Z',
        '2023-01-01T10:00:01Z',
        2
      );
      expect(result.withinTolerance).toBe(true);
      expect(result.timeDiffSeconds).toBe(1);
      expect(result.similarity).toBeGreaterThan(0.5);
    });

    it('should handle timestamps outside tolerance', () => {
      const result = DuplicateDetector.compareTimestamps(
        '2023-01-01T10:00:00Z',
        '2023-01-01T10:05:00Z',
        1
      );
      expect(result.withinTolerance).toBe(false);
      expect(result.timeDiffSeconds).toBe(300);
      expect(result.similarity).toBeLessThan(0.5);
    });
  });

  describe('Duration Comparison', () => {
    it('should handle identical durations', () => {
      const similarity = DuplicateDetector.compareDurations(120, 120);
      expect(similarity).toBe(1.0);
    });

    it('should handle durations within tolerance', () => {
      const similarity = DuplicateDetector.compareDurations(120, 121, 2);
      expect(similarity).toBe(1.0);
    });

    it('should handle durations outside tolerance', () => {
      const similarity = DuplicateDetector.compareDurations(120, 150, 1);
      expect(similarity).toBeLessThan(1.0);
      expect(similarity).toBeGreaterThan(0);
    });

    it('should handle null/undefined durations', () => {
      expect(DuplicateDetector.compareDurations(undefined, undefined)).toBe(1.0);
      expect(DuplicateDetector.compareDurations(undefined, 120)).toBe(0.0);
      expect(DuplicateDetector.compareDurations(120, undefined)).toBe(0.0);
    });
  });
});
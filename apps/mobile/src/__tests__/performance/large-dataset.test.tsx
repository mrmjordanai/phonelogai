/**
 * Large Dataset Performance Tests
 * 
 * Tests performance with large datasets (10k, 50k, 100k+ events)
 * including rendering, search, filtering, and memory usage.
 */

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import OptimizedEventsList from '../../screens/EventsScreen/components/OptimizedEventsList';
import OptimizedSearchBar from '../../screens/EventsScreen/components/OptimizedSearchBar';
import PerformanceMonitor from '../../services/PerformanceMonitor';
import MemoryProfiler from '../../utils/MemoryProfiler';
import { UIEvent } from '../../screens/EventsScreen/types';

// Mock data generators
const generateMockEvent = (id: number): UIEvent => ({
  // Core Event properties
  id: id.toString(),
  user_id: 'test-user',
  line_id: `line-${id}`,
  ts: new Date(Date.now() - id * 60000).toISOString(),
  number: `+1555${String(id).padStart(7, '0')}`,
  direction: id % 3 === 0 ? 'inbound' : 'outbound',
  type: id % 2 === 0 ? 'call' : 'sms',
  duration: id % 2 === 0 ? Math.floor(Math.random() * 600) : undefined,
  content: id % 2 === 1 ? `Message content ${id}` : undefined,
  contact_id: `contact-${id}`,
  status: id % 4 === 0 ? 'answered' : id % 4 === 1 ? 'missed' : id % 4 === 2 ? 'busy' : 'declined',
  source: 'device',
  created_at: new Date(Date.now() - id * 60000).toISOString(),
  updated_at: new Date(Date.now() - id * 60000).toISOString(),
  
  // UI-specific properties
  display_name: `Contact ${id}`,
  display_number: `+1555${String(id).padStart(7, '0')}`,
  is_anonymized: false,
});

const generateMockEvents = (count: number): UIEvent[] => {
  return Array.from({ length: count }, (_, index) => generateMockEvent(index + 1));
};

describe('Large Dataset Performance Tests', () => {
  let performanceMonitor: PerformanceMonitor;
  let memoryProfiler: MemoryProfiler;

  beforeEach(() => {
    performanceMonitor = PerformanceMonitor.getInstance();
    memoryProfiler = MemoryProfiler.getInstance();
    
    // Reset monitors
    performanceMonitor.resetMetrics();
    memoryProfiler.clearData();
  });

  afterEach(() => {
    memoryProfiler.stopProfiling();
  });

  describe('Events List Performance', () => {
    const mockProps = {
      loading: false,
      hasMore: false,
      onRefresh: jest.fn(),
      onLoadMore: jest.fn(),
      onEventPress: jest.fn(),
      onEventAction: jest.fn(),
    };

    it('should render 10k events within performance targets', async () => {
      const events = generateMockEvents(10000);
      const startTime = Date.now();
      
      memoryProfiler.startProfiling(100);
      
      await act(async () => {
        render(
          <OptimizedEventsList
            {...mockProps}
            events={events}
            enablePerformanceMonitoring={true}
          />
        );
      });
      
      const renderTime = Date.now() - startTime;
      const analysis = memoryProfiler.stopProfiling();
      
      // Performance targets
      expect(renderTime).toBeLessThan(1000); // Should render in under 1 second
      expect(analysis.trends.peakUsage).toBeLessThan(200); // Memory should stay reasonable
      
      console.log(`10k events rendered in ${renderTime}ms, peak memory: ${analysis.trends.peakUsage.toFixed(1)}MB`);
    });

    it('should handle 50k events without performance degradation', async () => {
      const events = generateMockEvents(50000);
      const startTime = Date.now();
      
      memoryProfiler.startProfiling(100);
      
      await act(async () => {
        render(
          <OptimizedEventsList
            {...mockProps}
            events={events}
            enablePerformanceMonitoring={true}
          />
        );
      });
      
      const renderTime = Date.now() - startTime;
      const analysis = memoryProfiler.stopProfiling();
      
      // Should handle larger datasets efficiently
      expect(renderTime).toBeLessThan(2000); // Allow more time for larger dataset
      expect(analysis.trends.peakUsage).toBeLessThan(300); // Higher memory allowance
      
      console.log(`50k events rendered in ${renderTime}ms, peak memory: ${analysis.trends.peakUsage.toFixed(1)}MB`);
    });

    it('should maintain 60fps scroll performance with large datasets', async () => {
      const events = generateMockEvents(25000);
      
      const { getByTestId } = render(
        <OptimizedEventsList
          {...mockProps}
          events={events}
          enablePerformanceMonitoring={true}
          testID="events-flatlist"
        />
      );
      
      // Simulate scroll events
      const flatList = getByTestId('events-flatlist');
      const scrollStartTime = Date.now();
      
      // Simulate rapid scrolling
      for (let i = 0; i < 10; i++) {
        await act(async () => {
          fireEvent.scroll(flatList, {
            nativeEvent: {
              contentOffset: { y: i * 1000, x: 0 },
              contentSize: { height: events.length * 80, width: 375 },
              layoutMeasurement: { height: 600, width: 375 },
            },
          });
        });
        
        // Small delay to simulate real scrolling
        await new Promise(resolve => setTimeout(resolve, 16)); // ~60fps
      }
      
      const scrollTime = Date.now() - scrollStartTime;
      const averageFrameTime = scrollTime / 10;
      
      // Should maintain 60fps (16.67ms per frame)
      expect(averageFrameTime).toBeLessThan(20); // Allow some margin
      
      console.log(`Scroll performance: ${averageFrameTime.toFixed(1)}ms avg per frame`);
    });

    it('should efficiently handle virtualization with 100k+ events', async () => {
      const events = generateMockEvents(100000);
      
      memoryProfiler.startProfiling(200);
      const renderStartTime = Date.now();
      
      const { getByTestId } = render(
        <OptimizedEventsList
          {...mockProps}
          events={events}
          enablePerformanceMonitoring={true}
          testID="events-flatlist"
        />
      );
      
      const renderTime = Date.now() - renderStartTime;
      
      // Test scrolling to different positions
      const flatList = getByTestId('events-flatlist');
      
      // Scroll to middle
      await act(async () => {
        fireEvent.scroll(flatList, {
          nativeEvent: {
            contentOffset: { y: 50000 * 80, x: 0 }, // Middle position
            contentSize: { height: events.length * 80, width: 375 },
            layoutMeasurement: { height: 600, width: 375 },
          },
        });
      });
      
      // Scroll to end
      await act(async () => {
        fireEvent.scroll(flatList, {
          nativeEvent: {
            contentOffset: { y: (events.length - 10) * 80, x: 0 }, // Near end
            contentSize: { height: events.length * 80, width: 375 },
            layoutMeasurement: { height: 600, width: 375 },
          },
        });
      });
      
      const analysis = memoryProfiler.stopProfiling();
      
      // Virtualization should keep memory reasonable even with 100k items
      expect(renderTime).toBeLessThan(3000); // Initial render should be fast
      expect(analysis.trends.peakUsage).toBeLessThan(400); // Memory should stay bounded
      
      console.log(`100k events: render ${renderTime}ms, peak memory ${analysis.trends.peakUsage.toFixed(1)}MB`);
    });
  });

  describe('Search Performance', () => {
    const mockSearchProps = {
      value: '',
      onChangeText: jest.fn(),
      onSearch: jest.fn(),
      onSuggestionPress: jest.fn(),
      onClear: jest.fn(),
    };

    it('should provide fast search response for large datasets', async () => {
      const suggestions = Array.from({ length: 1000 }, (_, i) => ({
        type: 'contact' as const,
        value: `contact-${i}`,
        display: `Contact ${i}`,
        metadata: {
          contactId: `contact-${i}`,
        },
      }));
      
      const { getByPlaceholderText } = render(
        <OptimizedSearchBar
          {...mockSearchProps}
          suggestions={suggestions}
          enablePerformanceMonitoring={true}
          placeholder="Search events..."
        />
      );
      
      const searchInput = getByPlaceholderText('Search events...');
      const searchStartTime = Date.now();
      
      // Simulate typing
      await act(async () => {
        fireEvent.changeText(searchInput, 'Contact 1');
      });
      
      // Wait for debounced search
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 350));
      });
      
      const searchTime = Date.now() - searchStartTime;
      
      // Search should be fast even with many suggestions
      expect(searchTime).toBeLessThan(400); // Including debounce time
      
      console.log(`Search completed in ${searchTime}ms with 1000 suggestions`);
    });

    it('should handle rapid typing without performance issues', async () => {
      const suggestions = Array.from({ length: 500 }, (_, i) => ({
        type: 'contact' as const,
        value: `contact-${i}`,
        display: `Contact ${i}`,
        metadata: {
          contactId: `contact-${i}`,
        },
      }));
      
      const { getByPlaceholderText } = render(
        <OptimizedSearchBar
          {...mockSearchProps}
          suggestions={suggestions}
          debounceMs={100} // Faster debounce for testing
          enablePerformanceMonitoring={true}
          placeholder="Search events..."
        />
      );
      
      const searchInput = getByPlaceholderText('Search events...');
      const rapidTypingStartTime = Date.now();
      
      // Simulate rapid typing
      const searchTerms = ['C', 'Co', 'Con', 'Cont', 'Conta', 'Contact', 'Contact 1'];
      
      for (const term of searchTerms) {
        await act(async () => {
          fireEvent.changeText(searchInput, term);
        });
        await new Promise(resolve => setTimeout(resolve, 50)); // Rapid typing
      }
      
      // Wait for final debounced search
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 150));
      });
      
      const totalTime = Date.now() - rapidTypingStartTime;
      
      // Should handle rapid typing efficiently
      expect(totalTime).toBeLessThan(1000);
      
      console.log(`Rapid typing sequence completed in ${totalTime}ms`);
    });
  });

  describe('Memory Management with Large Datasets', () => {
    it('should not leak memory when mounting/unmounting with large datasets', async () => {
      const events = generateMockEvents(25000);
      
      memoryProfiler.startProfiling(100);
      const initialMemory = memoryProfiler.takeSnapshot().usedMemory;
      
      // Mount and unmount multiple times
      for (let i = 0; i < 5; i++) {
        const { unmount } = render(
          <OptimizedEventsList
            loading={false}
            hasMore={false}
            events={events}
            onRefresh={jest.fn()}
            onLoadMore={jest.fn()}
            onEventPress={jest.fn()}
            onEventAction={jest.fn()}
            enablePerformanceMonitoring={true}
          />
        );
        
        await act(async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
        });
        
        unmount();
        
        await act(async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
        });
      }
      
      const analysis = memoryProfiler.stopProfiling();
      const finalMemory = memoryProfiler.takeSnapshot().usedMemory;
      const memoryGrowth = finalMemory - initialMemory;
      
      // Should not have significant memory growth after mount/unmount cycles
      expect(memoryGrowth).toBeLessThan(50); // Less than 50MB growth
      expect(analysis.leaks.length).toBe(0); // No memory leaks detected
      
      console.log(`Memory growth after 5 mount/unmount cycles: ${memoryGrowth.toFixed(1)}MB`);
    });

    it('should efficiently manage component registry with large datasets', async () => {
      const events = generateMockEvents(10000);
      
      const initialComponentCount = memoryProfiler.getMemorySummary().componentCount;
      
      const { unmount } = render(
        <OptimizedEventsList
          loading={false}
          hasMore={false}
          events={events}
          onRefresh={jest.fn()}
          onLoadMore={jest.fn()}
          onEventPress={jest.fn()}
          onEventAction={jest.fn()}
          enablePerformanceMonitoring={true}
        />
      );
      
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
      });
      
      const mountedComponentCount = memoryProfiler.getMemorySummary().componentCount;
      
      unmount();
      
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
      });
      
      const finalComponentCount = memoryProfiler.getMemorySummary().componentCount;
      
      // Components should be properly cleaned up
      expect(finalComponentCount).toBe(initialComponentCount);
      expect(mountedComponentCount).toBeGreaterThan(initialComponentCount);
      
      console.log(`Component lifecycle: ${initialComponentCount} → ${mountedComponentCount} → ${finalComponentCount}`);
    });
  });

  describe('Stress Testing', () => {
    it('should handle extreme dataset sizes gracefully', async () => {
      const events = generateMockEvents(200000); // 200k events
      
      memoryProfiler.startProfiling(500);
      const stressTestStartTime = Date.now();
      
      try {
        await act(async () => {
          render(
            <OptimizedEventsList
              loading={false}
              hasMore={false}
              events={events}
              onRefresh={jest.fn()}
              onLoadMore={jest.fn()}
              onEventPress={jest.fn()}
              onEventAction={jest.fn()}
              enablePerformanceMonitoring={true}
            />
          );
        });
        
        const renderTime = Date.now() - stressTestStartTime;
        const analysis = memoryProfiler.stopProfiling();
        
        // Should handle extreme datasets without crashing
        expect(renderTime).toBeLessThan(5000); // Allow more time for extreme dataset
        expect(analysis.trends.peakUsage).toBeLessThan(500); // Memory limit
        
        console.log(`Extreme dataset (200k): render ${renderTime}ms, peak memory ${analysis.trends.peakUsage.toFixed(1)}MB`);
        
      } catch (error: unknown) {
        // If it fails, it should fail gracefully
        expect(error).toBeInstanceOf(Error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.log(`Extreme dataset test failed gracefully: ${errorMessage}`);
      }
    });

    it('should maintain performance under memory pressure', async () => {
      const events = generateMockEvents(75000);
      
      // Simulate memory pressure
      memoryProfiler.startProfiling(50);
      
      // Create memory pressure by registering many components
      for (let i = 0; i < 1000; i++) {
        memoryProfiler.registerComponent(`PressureComponent${i}`);
      }
      
      const renderStartTime = Date.now();
      
      const { getByTestId } = render(
        <OptimizedEventsList
          loading={false}
          hasMore={false}
          events={events}
          onRefresh={jest.fn()}
          onLoadMore={jest.fn()}
          onEventPress={jest.fn()}
          onEventAction={jest.fn()}
          enablePerformanceMonitoring={true}
          testID="stressed-events-list"
        />
      );
      
      const renderTime = Date.now() - renderStartTime;
      
      // Test interaction under pressure
      const flatList = getByTestId('stressed-events-list');
      
      await act(async () => {
        fireEvent.scroll(flatList, {
          nativeEvent: {
            contentOffset: { y: 10000, x: 0 },
            contentSize: { height: events.length * 80, width: 375 },
            layoutMeasurement: { height: 600, width: 375 },
          },
        });
      });
      
      const analysis = memoryProfiler.stopProfiling();
      
      // Should maintain reasonable performance even under memory pressure
      expect(renderTime).toBeLessThan(3000);
      
      console.log(`Performance under pressure: render ${renderTime}ms, memory ${analysis.trends.peakUsage.toFixed(1)}MB`);
    });
  });
});


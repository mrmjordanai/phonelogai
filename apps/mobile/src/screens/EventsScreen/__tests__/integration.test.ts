/**
 * Integration Tests for EventsScreen
 * Tests the main functionality and component integration
 */

import { mockDataService } from '../services/MockDataService';
import { exportService } from '../services/ExportService';

describe('EventsScreen Integration', () => {
  beforeEach(() => {
    // Reset mock data before each test
    mockDataService.reset();
  });

  describe('MockDataService', () => {
    it('should generate realistic mock events', () => {
      const events = mockDataService.generateMockEvents(10);
      
      expect(events).toHaveLength(10);
      expect(events[0]).toHaveProperty('id');
      expect(events[0]).toHaveProperty('type');
      expect(events[0]).toHaveProperty('direction');
      expect(events[0]).toHaveProperty('ts');
      expect(events[0]).toHaveProperty('number');
      expect(events[0]).toHaveProperty('display_name');
    });

    it('should provide contact information for events', () => {
      const events = mockDataService.generateMockEvents(5);
      const contacts = mockDataService.getAllContacts();
      
      expect(contacts.length).toBeGreaterThan(0);
      
      // Each event should have a contact
      events.forEach(event => {
        expect(event.contact).toBeDefined();
        expect(event.contact?.id).toBeDefined();
        expect(event.contact?.name).toBeDefined();
      });
    });

    it('should generate search suggestions for contacts', () => {
      const suggestions = mockDataService.generateSearchSuggestions('John');
      
      expect(suggestions).toBeInstanceOf(Array);
      
      if (suggestions.length > 0) {
        const contactSuggestion = suggestions.find(s => s.type === 'contact');
        if (contactSuggestion) {
          expect(contactSuggestion).toHaveProperty('display');
          expect(contactSuggestion).toHaveProperty('metadata');
          expect(contactSuggestion.metadata).toHaveProperty('name');
        }
      }
    });

    it('should filter events correctly', async () => {
      // Test filtering functionality
      const result = await mockDataService.getFilteredEvents({
        type: 'call',
        direction: 'inbound'
      });

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('totalCount');
      
      result.data.forEach(event => {
        expect(event.type).toBe('call');
        expect(event.direction).toBe('inbound');
      });
    });
  });

  describe('ExportService', () => {
    let testEvents: unknown[];

    beforeEach(() => {
      testEvents = mockDataService.generateMockEvents(5);
    });

    it('should export events to CSV format', async () => {
      const csvContent = await exportService.exportToCSV(testEvents);
      
      expect(typeof csvContent).toBe('string');
      expect(csvContent).toContain('ID,Type,Direction'); // Headers
      expect(csvContent.split('\n').length).toBeGreaterThan(1); // Header + data rows
    });

    it('should export events to JSON format', async () => {
      const jsonContent = await exportService.exportToJSON(testEvents);
      
      expect(typeof jsonContent).toBe('string');
      
      const parsed = JSON.parse(jsonContent);
      expect(parsed).toHaveProperty('export_info');
      expect(parsed).toHaveProperty('events');
      expect(parsed.events).toBeInstanceOf(Array);
      expect(parsed.events.length).toBe(testEvents.length);
    });

    it('should estimate export file sizes', () => {
      const csvSize = exportService.getEstimatedSize(testEvents, 'csv', true);
      const jsonSize = exportService.getEstimatedSize(testEvents, 'json', true);
      
      expect(csvSize).toHaveProperty('bytes');
      expect(csvSize).toHaveProperty('readable');
      expect(jsonSize).toHaveProperty('bytes');
      expect(jsonSize).toHaveProperty('readable');
      
      // JSON should generally be larger than CSV for the same data
      expect(jsonSize.bytes).toBeGreaterThan(csvSize.bytes);
    });

    it('should provide available export formats', () => {
      const formats = exportService.getAvailableFormats();
      
      expect(formats).toBeInstanceOf(Array);
      expect(formats.length).toBe(2); // CSV and JSON
      
      const csvFormat = formats.find(f => f.format === 'csv');
      const jsonFormat = formats.find(f => f.format === 'json');
      
      expect(csvFormat).toBeDefined();
      expect(jsonFormat).toBeDefined();
      expect(csvFormat?.name).toContain('CSV');
      expect(jsonFormat?.name).toContain('JSON');
    });
  });

  describe('Data Integration', () => {
    it('should handle empty events list gracefully', () => {
      const emptyEvents: unknown[] = [];
      
      expect(() => mockDataService.getFilteredEvents({})).not.toThrow();
      expect(() => exportService.getEstimatedSize(emptyEvents, 'csv')).not.toThrow();
    });

    it('should respect privacy settings in exports', async () => {
      const events = mockDataService.generateMockEvents(3);
      
      // Set some events as anonymized
      events[0].is_anonymized = true;
      events[0].display_name = 'Private Contact';
      events[0].display_number = 'XXX-XXX-XXXX';

      const csvWithPrivate = await exportService.exportToCSV(events, { includePrivate: true });
      const csvWithoutPrivate = await exportService.exportToCSV(events, { includePrivate: false });
      
      expect(csvWithPrivate.split('\n').length).toBeGreaterThan(csvWithoutPrivate.split('\n').length);
    });

    it('should handle large datasets efficiently', () => {
      const largeEventSet = mockDataService.generateMockEvents(1000);
      
      expect(largeEventSet).toHaveLength(1000);
      
      // Check that events are properly distributed over time
      const timestamps = largeEventSet.map(e => new Date(e.ts).getTime());
      const uniqueTimestamps = new Set(timestamps);
      
      // Should have variety in timestamps
      expect(uniqueTimestamps.size).toBeGreaterThan(100);
    });

    it('should provide consistent event data structure', () => {
      const events = mockDataService.generateMockEvents(10);
      
      events.forEach(event => {
        // Required fields
        expect(event.id).toBeDefined();
        expect(event.type).toBeDefined();
        expect(['call', 'sms']).toContain(event.type);
        expect(event.direction).toBeDefined();
        expect(['inbound', 'outbound']).toContain(event.direction);
        expect(event.ts).toBeDefined();
        expect(event.number).toBeDefined();
        
        // UI-specific fields should be populated
        expect(event.display_name || event.display_number).toBeDefined();
        expect(event.contact).toBeDefined();
        
        if (event.type === 'call') {
          expect(event.duration).toBeDefined();
          expect(event.status).toBeDefined();
        }
        
        if (event.type === 'sms') {
          expect(event.content).toBeDefined();
        }
      });
    });
  });
});

// Export test utilities for other test files
export const testUtils = {
  createMockEvents: (count: number = 5) => mockDataService.generateMockEvents(count),
  createMockContacts: () => mockDataService.getAllContacts(),
  resetMockData: () => mockDataService.reset(),
};
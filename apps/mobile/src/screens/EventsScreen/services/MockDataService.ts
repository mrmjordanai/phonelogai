/**
 * Mock Data Service for Events Screen Development
 * Provides realistic mock data for testing and development
 */

import { UIEvent, SearchSuggestion } from '../types';

// Import types properly
interface Contact {
  id: string;
  user_id: string;
  number: string;
  name?: string;
  company?: string;
  email?: string;
  tags: string[];
  first_seen: string;
  last_seen: string;
  total_calls: number;
  total_sms: number;
  created_at: string;
  updated_at: string;
}

interface PrivacyRule {
  id: string;
  user_id: string;
  contact_id: string;
  visibility: 'private' | 'team' | 'public';
  anonymize_number: boolean;
  anonymize_content: boolean;
  created_at: string;
  updated_at: string;
}

// Sample contact names and companies
const SAMPLE_CONTACTS = [
  { name: 'John Smith', company: 'Acme Corp' },
  { name: 'Sarah Johnson', company: 'Tech Solutions' },
  { name: 'Michael Brown', company: 'Global Industries' },
  { name: 'Emma Wilson', company: 'StartupCo' },
  { name: 'David Lee', company: 'Innovation Labs' },
  { name: 'Lisa Chen', company: 'Digital Agency' },
  { name: 'Robert Taylor', company: 'Consulting Group' },
  { name: 'Jennifer Davis', company: 'Marketing Inc' },
  { name: 'Christopher Miller', company: 'Finance Solutions' },
  { name: 'Ashley Rodriguez', company: 'Health Systems' },
  { name: 'Matthew Garcia', company: 'Education Partners' },
  { name: 'Amanda Martinez', company: 'Retail Chain' },
  { name: 'Daniel Anderson', company: 'Manufacturing Ltd' },
  { name: 'Jessica Thomas', company: 'Media Group' },
  { name: 'Andrew Jackson', company: 'Real Estate Co' }
];

// Sample phone numbers
const SAMPLE_NUMBERS = [
  '+1-555-0101', '+1-555-0102', '+1-555-0103', '+1-555-0104', '+1-555-0105',
  '+1-555-0106', '+1-555-0107', '+1-555-0108', '+1-555-0109', '+1-555-0110',
  '+1-555-0111', '+1-555-0112', '+1-555-0113', '+1-555-0114', '+1-555-0115',
  '+1-555-0201', '+1-555-0202', '+1-555-0203', '+1-555-0204', '+1-555-0205'
];

// Sample SMS content
const SAMPLE_SMS_CONTENT = [
  'Hey, are you available for a quick call?',
  'Thanks for the meeting today. Let me know if you have any questions.',
  'Can we reschedule our call to tomorrow?',
  'The document is ready for review.',
  'Great meeting you at the conference!',
  'Please confirm the appointment time.',
  'The proposal looks good. Let\'s discuss next steps.',
  'Running 5 minutes late to the meeting.',
  'Could you send me the latest report?',
  'Let\'s catch up over coffee sometime.',
  'The project timeline has been updated.',
  'Thanks for your quick response.',
  'Looking forward to our collaboration.',
  'The contract has been signed and sent.',
  'Happy birthday! Hope you have a great day.'
];

class MockDataService {
  private static instance: MockDataService;
  private mockContacts: Map<string, Contact> = new Map();
  private mockPrivacyRules: Map<string, PrivacyRule> = new Map();
  private isInitialized = false;

  static getInstance(): MockDataService {
    if (!MockDataService.instance) {
      MockDataService.instance = new MockDataService();
    }
    return MockDataService.instance;
  }

  private constructor() {
    this.initializeMockData();
  }

  private initializeMockData() {
    if (this.isInitialized) return;

    const userId = 'mock-user-id';
    const now = new Date();

    // Generate mock contacts
    SAMPLE_CONTACTS.forEach((contactInfo, index) => {
      const contactId = `contact-${index + 1}`;
      const phoneNumber = SAMPLE_NUMBERS[index % SAMPLE_NUMBERS.length];

      const contact: Contact = {
        id: contactId,
        user_id: userId,
        number: phoneNumber,
        name: contactInfo.name,
        company: contactInfo.company,
        email: `${contactInfo.name.toLowerCase().replace(' ', '.')}@${contactInfo.company.toLowerCase().replace(' ', '')}.com`,
        tags: this.generateRandomTags(),
        first_seen: new Date(now.getTime() - Math.random() * 90 * 24 * 60 * 60 * 1000).toISOString(),
        last_seen: new Date(now.getTime() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
        total_calls: Math.floor(Math.random() * 50),
        total_sms: Math.floor(Math.random() * 100),
        created_at: new Date(now.getTime() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(now.getTime() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString()
      };

      this.mockContacts.set(contactId, contact);

      // Generate privacy rule
      const privacyRule: PrivacyRule = {
        id: `privacy-${index + 1}`,
        user_id: userId,
        contact_id: contactId,
        visibility: this.getRandomVisibility(),
        anonymize_number: Math.random() < 0.1,
        anonymize_content: Math.random() < 0.15,
        created_at: contact.created_at,
        updated_at: contact.updated_at
      };

      this.mockPrivacyRules.set(contactId, privacyRule);
    });

    this.isInitialized = true;
  }

  private generateRandomTags(): string[] {
    const allTags = ['work', 'personal', 'family', 'client', 'vendor', 'important', 'follow-up', 'urgent'];
    const numTags = Math.floor(Math.random() * 3);
    const shuffled = [...allTags].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, numTags);
  }

  private getRandomVisibility(): 'private' | 'team' | 'public' {
    const random = Math.random();
    if (random < 0.2) return 'private';
    if (random < 0.8) return 'team';
    return 'public';
  }

  private getRandomEventStatus(): 'answered' | 'missed' | 'busy' | 'declined' | undefined {
    const random = Math.random();
    if (random < 0.7) return 'answered';
    if (random < 0.85) return 'missed';
    if (random < 0.95) return 'busy';
    return 'declined';
  }

  /**
   * Generate mock events
   */
  generateMockEvents(count: number = 100): UIEvent[] {
    const events: UIEvent[] = [];
    const userId = 'mock-user-id';
    const now = new Date();

    for (let i = 0; i < count; i++) {
      const eventType: 'call' | 'sms' = Math.random() < 0.6 ? 'call' : 'sms';
      const direction: 'inbound' | 'outbound' = Math.random() < 0.5 ? 'inbound' : 'outbound';
      const contactIndex = Math.floor(Math.random() * SAMPLE_CONTACTS.length);
      const contact = Array.from(this.mockContacts.values())[contactIndex];
      const privacyRule = this.mockPrivacyRules.get(contact.id);

      // Random timestamp within the last 30 days
      const timestamp = new Date(now.getTime() - Math.random() * 30 * 24 * 60 * 60 * 1000);

      const event: UIEvent = {
        id: `event-${i + 1}`,
        user_id: userId,
        line_id: `line-${Math.floor(Math.random() * 3) + 1}`,
        ts: timestamp.toISOString(),
        number: contact.number,
        direction,
        type: eventType,
        duration: eventType === 'call' ? Math.floor(Math.random() * 3600) : undefined,
        content: eventType === 'sms' ? SAMPLE_SMS_CONTENT[Math.floor(Math.random() * SAMPLE_SMS_CONTENT.length)] : undefined,
        contact_id: contact.id,
        status: eventType === 'call' ? this.getRandomEventStatus() : undefined,
        source: Math.random() < 0.8 ? 'device' : 'carrier',
        created_at: timestamp.toISOString(),
        updated_at: timestamp.toISOString(),

        // UI-specific properties
        contact,
        privacy_rule: privacyRule,
        display_name: privacyRule?.anonymize_number ? 'Private Contact' : contact.name,
        display_number: privacyRule?.anonymize_number ? 'XXX-XXX-XXXX' : contact.number,
        is_anonymized: privacyRule?.anonymize_number || privacyRule?.anonymize_content || false
      };

      events.push(event);
    }

    // Sort by timestamp (newest first)
    return events.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  }

  /**
   * Get mock contact by ID
   */
  getContact(contactId: string): Contact | undefined {
    return this.mockContacts.get(contactId);
  }

  /**
   * Get all mock contacts
   */
  getAllContacts(): Contact[] {
    return Array.from(this.mockContacts.values());
  }

  /**
   * Get privacy rule for contact
   */
  getPrivacyRule(contactId: string): PrivacyRule | undefined {
    return this.mockPrivacyRules.get(contactId);
  }

  /**
   * Generate search suggestions based on query
   */
  generateSearchSuggestions(query: string): SearchSuggestion[] {
    if (!query.trim()) return [];

    const suggestions: SearchSuggestion[] = [];
    const normalizedQuery = query.toLowerCase();

    // Search in contacts
    const matchingContacts = Array.from(this.mockContacts.values())
      .filter(contact => 
        contact.name?.toLowerCase().includes(normalizedQuery) ||
        contact.company?.toLowerCase().includes(normalizedQuery) ||
        contact.number.includes(query)
      )
      .slice(0, 3);

    matchingContacts.forEach(contact => {
      suggestions.push({
        type: 'contact',
        value: contact.name || contact.number,
        display: contact.name ? `${contact.name} (${contact.company})` : contact.number,
        metadata: {
          contactId: contact.id,
          name: contact.name,
          company: contact.company
        }
      });
    });

    // Add number suggestion if query looks like a phone number
    if (/^[\d\s\-+()]+$/.test(query) && query.length >= 3) {
      suggestions.push({
        type: 'number',
        value: query,
        display: `Search number "${query}"`
      });
    }

    return suggestions.slice(0, 5);
  }

  /**
   * Simulate filtered events query
   */
  async getFilteredEvents(
    filters: {
      search?: string;
      type?: 'call' | 'sms' | 'all';
      direction?: 'inbound' | 'outbound' | 'all';
      status?: 'answered' | 'missed' | 'busy' | 'declined' | 'all';
      contactId?: string;
      dateRange?: { start?: Date; end?: Date };
      durationRange?: { min?: number; max?: number };
    },
    options: {
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ data: UIEvent[]; totalCount: number }> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, Math.random() * 500 + 200));

    const allEvents = this.generateMockEvents(500); // Generate larger dataset
    let filteredEvents = [...allEvents];

    // Apply filters
    if (filters.search?.trim()) {
      const search = filters.search.toLowerCase();
      filteredEvents = filteredEvents.filter(event =>
        event.number.includes(search) ||
        event.display_name?.toLowerCase().includes(search) ||
        event.content?.toLowerCase().includes(search)
      );
    }

    if (filters.type && filters.type !== 'all') {
      filteredEvents = filteredEvents.filter(event => event.type === filters.type);
    }

    if (filters.direction && filters.direction !== 'all') {
      filteredEvents = filteredEvents.filter(event => event.direction === filters.direction);
    }

    if (filters.status && filters.status !== 'all') {
      filteredEvents = filteredEvents.filter(event => event.status === filters.status);
    }

    if (filters.contactId) {
      filteredEvents = filteredEvents.filter(event => event.contact_id === filters.contactId);
    }

    if (filters.dateRange?.start || filters.dateRange?.end) {
      filteredEvents = filteredEvents.filter(event => {
        const eventDate = new Date(event.ts);
        if (filters.dateRange?.start && eventDate < filters.dateRange.start) return false;
        if (filters.dateRange?.end && eventDate > filters.dateRange.end) return false;
        return true;
      });
    }

    if (filters.durationRange) {
      filteredEvents = filteredEvents.filter(event => {
        if (event.type !== 'call') return true;
        if (!event.duration) return false;
        if (filters.durationRange?.min && event.duration < filters.durationRange.min) return false;
        if (filters.durationRange?.max && event.duration > filters.durationRange.max) return false;
        return true;
      });
    }

    // Apply pagination
    const { limit = 50, offset = 0 } = options;
    const paginatedEvents = filteredEvents.slice(offset, offset + limit);

    return {
      data: paginatedEvents,
      totalCount: filteredEvents.length
    };
  }

  /**
   * Reset mock data (useful for testing)
   */
  reset() {
    this.mockContacts.clear();
    this.mockPrivacyRules.clear();
    this.isInitialized = false;
    this.initializeMockData();
  }
}

export default MockDataService;

// Export singleton instance
export const mockDataService = MockDataService.getInstance();
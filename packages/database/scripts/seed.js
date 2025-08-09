#!/usr/bin/env node

/**
 * Database Seeding Script
 * Adds sample data for development and testing
 */

console.log('🌱 Seeding database with sample data...');

const sampleData = {
  organizations: [
    {
      id: 'test-org-id',
      name: 'Test Organization',
      owner_id: 'test-user-id'
    }
  ],
  users: [
    {
      id: 'test-user-id',
      email: 'test@phonelogai.com'
    }
  ],
  events: [
    {
      id: 'sample-event-1',
      user_id: 'test-user-id',
      phone_number: '+1-555-0123',
      event_type: 'call',
      direction: 'outgoing',
      duration: 120,
      timestamp: new Date().toISOString()
    },
    {
      id: 'sample-event-2',
      user_id: 'test-user-id',
      phone_number: '+1-555-0456',
      event_type: 'sms',
      direction: 'incoming',
      content: 'Hello, this is a test message',
      timestamp: new Date().toISOString()
    }
  ]
};

console.log('📊 Sample data structure:');
console.log(JSON.stringify(sampleData, null, 2));

console.log('');
console.log('To seed your database:');
console.log('1. Open your Supabase project dashboard');
console.log('2. Go to Table Editor');
console.log('3. Insert the sample data into respective tables');
console.log('');
console.log('Or use SQL Editor with INSERT statements based on the data above');

console.log('✅ Seeding information prepared');
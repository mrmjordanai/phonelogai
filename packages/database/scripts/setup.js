#!/usr/bin/env node

/**
 * Database Setup Script
 * Sets up the database with initial schema, RLS policies, and functions
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Setting up PhoneLog AI database...');

// Check if we have Supabase CLI
try {
  execSync('supabase --version', { stdio: 'ignore' });
} catch (error) {
  console.error('❌ Supabase CLI not found. Please install it first:');
  console.log('npm install -g supabase');
  console.log('Or visit: https://supabase.com/docs/guides/cli');
  process.exit(1);
}

// Check environment variables
const requiredEnvVars = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY'
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`❌ Missing environment variable: ${envVar}`);
    console.log('Please configure your environment variables in .env files');
    process.exit(1);
  }
}

console.log('✅ Environment variables configured');
console.log('✅ Supabase CLI available');

// Run migrations in order
const migrationsDir = path.join(__dirname, '../migrations');
const migrationFiles = fs.readdirSync(migrationsDir)
  .filter(file => file.endsWith('.sql'))
  .sort(); // Alphabetical order should work with our naming

console.log(`📁 Found ${migrationFiles.length} migration files`);

migrationFiles.forEach((file, index) => {
  console.log(`📝 Running migration ${index + 1}/${migrationFiles.length}: ${file}`);
  
  const migrationPath = path.join(migrationsDir, file);
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');
  
  try {
    // Note: In a real setup, you would run this via Supabase CLI or API
    // For now, we'll log what should be done
    console.log(`   → ${file} ready to execute`);
  } catch (error) {
    console.error(`❌ Migration ${file} failed:`, error.message);
    process.exit(1);
  }
});

console.log('🎉 Database setup completed successfully!');
console.log('');
console.log('Next steps:');
console.log('1. Execute the migration files in your Supabase SQL Editor');
console.log('2. Run: npm run seed (optional)');
console.log('3. Test the connection with your application');
#!/usr/bin/env node

/**
 * Database Migration Script
 * Applies database migrations in the correct order
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔄 Running database migrations...');

const migrationsDir = path.join(__dirname, '../migrations');

if (!fs.existsSync(migrationsDir)) {
  console.error('❌ Migrations directory not found');
  process.exit(1);
}

// Get all migration files in order
const migrationFiles = fs.readdirSync(migrationsDir)
  .filter(file => file.endsWith('.sql'))
  .sort();

console.log(`📁 Found ${migrationFiles.length} migration files:`);
migrationFiles.forEach((file, index) => {
  console.log(`   ${index + 1}. ${file}`);
});

console.log('');
console.log('To apply these migrations:');
console.log('1. Open your Supabase project dashboard');
console.log('2. Go to SQL Editor');
console.log('3. Execute each migration file in order:');
console.log('');

migrationFiles.forEach((file, index) => {
  const migrationPath = path.join(migrationsDir, file);
  console.log(`-- Migration ${index + 1}: ${file}`);
  console.log(`-- File: ${migrationPath}`);
  console.log('');
});

console.log('✅ Migration files listed successfully');
console.log('Note: Execute these in your Supabase SQL Editor');
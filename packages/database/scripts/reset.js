#!/usr/bin/env node

/**
 * Database Reset Script
 * WARNING: This will drop all tables and data
 */

console.log('⚠️  Database Reset Script');
console.log('This script will help you reset your database');
console.log('');

const resetInstructions = `
WARNING: This will permanently delete all data!

To reset your database:

1. Open Supabase Dashboard → SQL Editor
2. Execute this SQL to drop all tables:

DROP TABLE IF EXISTS audit_log CASCADE;
DROP TABLE IF EXISTS privacy_rules CASCADE;
DROP TABLE IF EXISTS sync_health CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS contacts CASCADE;
DROP TABLE IF EXISTS org_roles CASCADE;
DROP TABLE IF EXISTS organizations CASCADE;
DROP TABLE IF EXISTS event_embeddings CASCADE;
DROP TABLE IF EXISTS nlq_queries CASCADE;
DROP TABLE IF EXISTS nlq_query_templates CASCADE;

-- Drop all functions
DROP FUNCTION IF EXISTS get_dashboard_metrics CASCADE;
DROP FUNCTION IF EXISTS get_filtered_events CASCADE;
DROP FUNCTION IF EXISTS detect_data_gaps CASCADE;
DROP FUNCTION IF EXISTS can_access_contact CASCADE;
DROP FUNCTION IF EXISTS get_heatmap_data CASCADE;
DROP FUNCTION IF EXISTS get_heatmap_summary CASCADE;
DROP FUNCTION IF EXISTS detect_event_conflicts CASCADE;
DROP FUNCTION IF EXISTS resolve_event_conflict CASCADE;
DROP FUNCTION IF EXISTS get_conflict_metrics CASCADE;

3. After dropping tables, run setup script again:
   npm run setup

4. Reapply migrations in order
`;

console.log(resetInstructions);

console.log('❌ Database reset instructions provided');
console.log('Execute the SQL statements above in Supabase SQL Editor');
// Re-export types (avoid conflicts with RBAC types)
export type { Database } from '@phonelogai/database';

// Export shared utilities
export * from './utils';
export * from './i18n';

// Export shared components (will be added later)
export * from './components';

// Export RBAC system (this includes its own constants and types)
export * from './rbac';

// Export non-conflicting constants
export { 
  APP_NAME, 
  APP_VERSION, 
  API_BASE_URL, 
  API_KEY, 
  TABLES, 
  FILE_LIMITS, 
  PERFORMANCE_TARGETS, 
  SUPPORTED_LOCALES 
} from './constants';
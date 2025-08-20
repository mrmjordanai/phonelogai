/**
 * Comprehensive Security & Privacy System
 * Main export file for all security and privacy services
 * 
 * Phase 1: Minimal exports for infrastructure - full services will be restored in Phase 2
 */

// Core Services that compile successfully
export { EncryptionService } from './EncryptionService';
export { PrivacyRuleEngine } from './PrivacyRuleEngine';

// TODO: Phase 2 - Restore these services after fixing Supabase query builder issues
// export { AuditLogger } from './AuditLogger';
// export { ComplianceService } from './ComplianceService';
// export { SecurityMonitoringService } from './SecurityMonitoringService';

// Types from EncryptionService
export type {
  EncryptedField,
  EncryptionKeyInfo,
  DecryptionContext,
  KeyRotationResult
} from './EncryptionService';

// Types from PrivacyRuleEngine
export type {
  PrivacyScope,
  AnonymizationLevel,
  PrivacyRule,
  AccessContext,
  AccessDecision,
  BulkPrivacyUpdate,
  BulkOperationResult,
  OperationContext,
  PrivacyRuleFilter
} from './PrivacyRuleEngine';

// TODO: Phase 2 - Restore type exports after fixing service dependencies
// Types from AuditLogger
// export type {
//   AuditEventCategory,
//   AuditSeverity,
//   AuditOutcome,
//   ActorType,
//   AuditLogEntry,
//   AuditSearchCriteria,
//   AuditMetadata,
//   BulkAuditMetadata,
//   IntegrityVerificationResult
// } from './AuditLogger';

// Types from ComplianceService
// export type {
//   DSRRequestType,
//   DSRStatus,
//   DataSubjectRequest,
//   DSRProcessingStep,
//   ComplianceExportOptions,
//   ComplianceStats,
//   AnonymizationResult,
//   ConsentRecord
// } from './ComplianceService';

// Types from SecurityMonitoringService
// export type {
//   SecurityEventType,
//   ThreatLevel,
//   SecurityEvent,
//   AnomalyPattern,
//   SecurityMetrics,
//   MonitoringRule,
//   AlertNotification
// } from './SecurityMonitoringService';

// TODO: Phase 2 - Restore comprehensive SecurityManager after fixing service dependencies
/**
 * Comprehensive Security Manager
 * Will be restored in Phase 2 after resolving Supabase query builder type issues
 */
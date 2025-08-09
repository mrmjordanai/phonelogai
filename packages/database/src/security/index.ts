/**
 * Comprehensive Security & Privacy System
 * Main export file for all security and privacy services
 */

// Core Services
export { EncryptionService } from './EncryptionService';
export { AuditLogger } from './AuditLogger';
export { PrivacyRuleEngine } from './PrivacyRuleEngine';
export { ComplianceService } from './ComplianceService';
export { SecurityMonitoringService } from './SecurityMonitoringService';

// Types from EncryptionService
export type {
  EncryptedField,
  EncryptionKeyInfo,
  DecryptionContext,
  KeyRotationResult
} from './EncryptionService';

// Types from AuditLogger
export type {
  AuditEventCategory,
  AuditSeverity,
  AuditOutcome,
  ActorType,
  AuditLogEntry,
  AuditSearchCriteria,
  AuditMetadata,
  BulkAuditMetadata,
  IntegrityVerificationResult
} from './AuditLogger';

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

// Types from ComplianceService
export type {
  DSRRequestType,
  DSRStatus,
  DataSubjectRequest,
  DSRProcessingStep,
  ComplianceExportOptions,
  ComplianceStats,
  AnonymizationResult,
  ConsentRecord
} from './ComplianceService';

// Types from SecurityMonitoringService
export type {
  SecurityEventType,
  ThreatLevel,
  SecurityEvent,
  AnomalyPattern,
  SecurityMetrics,
  MonitoringRule,
  AlertNotification
} from './SecurityMonitoringService';

// Comprehensive Security Manager
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types';
import { EncryptionService } from './EncryptionService';
import { AuditLogger } from './AuditLogger';
import { PrivacyRuleEngine } from './PrivacyRuleEngine';
import { ComplianceService } from './ComplianceService';
import { SecurityMonitoringService } from './SecurityMonitoringService';

/**
 * Comprehensive Security Manager
 * Provides a unified interface to all security and privacy services
 */
export class SecurityManager {
  public readonly encryption: EncryptionService;
  public readonly audit: AuditLogger;
  public readonly privacy: PrivacyRuleEngine;
  public readonly compliance: ComplianceService;
  public readonly monitoring: SecurityMonitoringService;

  private supabase: SupabaseClient<Database>;

  constructor(supabase: SupabaseClient<Database>) {
    this.supabase = supabase;
    
    // Initialize services
    this.encryption = new EncryptionService(supabase);
    this.audit = new AuditLogger(supabase);
    this.privacy = new PrivacyRuleEngine(supabase, this.audit);
    this.compliance = new ComplianceService(supabase, this.audit, this.encryption);
    this.monitoring = new SecurityMonitoringService(supabase, this.audit);
  }

  /**
   * Initialize all security services
   */
  async initialize(): Promise<void> {
    try {
      // Start security monitoring
      await this.monitoring.startMonitoring();

      // Log system initialization
      await this.audit.logSystemEvent(
        'security_system_initialized',
        'security_manager',
        'success',
        {
          services: ['encryption', 'audit', 'privacy', 'compliance', 'monitoring'],
          initialization_timestamp: new Date().toISOString()
        }
      );

      console.log('🔐 Security Manager initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Security Manager:', error);
      throw error;
    }
  }

  /**
   * Shutdown all security services gracefully
   */
  async shutdown(): Promise<void> {
    try {
      // Stop monitoring
      this.monitoring.stopMonitoring();

      // Flush any pending audit logs
      await this.audit.flush();

      // Log system shutdown
      await this.audit.logSystemEvent(
        'security_system_shutdown',
        'security_manager',
        'success',
        {
          shutdown_timestamp: new Date().toISOString(),
          graceful_shutdown: true
        }
      );

      console.log('🔐 Security Manager shutdown complete');
    } catch (error) {
      console.error('Error during Security Manager shutdown:', error);
      throw error;
    }
  }

  /**
   * Perform comprehensive security health check
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    services: Record<string, boolean>;
    metrics: {
      encryptionKeysActive: number;
      pendingDSRRequests: number;
      unresolvedSecurityEvents: number;
      auditLogIntegrity: boolean;
    };
    recommendations: string[];
  }> {
    const recommendations: string[] = [];
    const services: Record<string, boolean> = {};

    try {
      // Check encryption service
      const encryptionKeys = await this.encryption.listKeys();
      const activeKeys = encryptionKeys.filter(k => k.status === 'active');
      services.encryption = activeKeys.length > 0;
      
      if (activeKeys.length === 0) {
        recommendations.push('No active encryption keys found - generate new keys');
      }

      // Check compliance service
      const complianceStats = await this.compliance.getComplianceStatistics();
      const pendingDSRs = complianceStats.requestsByStatus.pending + 
                          complianceStats.requestsByStatus.in_progress;
      services.compliance = complianceStats.complianceRate > 90;
      
      if (complianceStats.overdueRequests > 0) {
        recommendations.push(`${complianceStats.overdueRequests} overdue DSR requests need attention`);
      }

      // Check security monitoring
      const securityMetrics = await this.monitoring.getSecurityMetrics();
      const unresolvedEvents = securityMetrics.unresolvedCritical + securityMetrics.unresolvedHigh;
      services.monitoring = unresolvedEvents < 10;
      
      if (securityMetrics.unresolvedCritical > 0) {
        recommendations.push(`${securityMetrics.unresolvedCritical} critical security events need immediate attention`);
      }

      // Check audit log integrity (simplified)
      const integrityCheck = await this.audit.verifyIntegrity();
      services.audit = integrityCheck.isValid;
      
      if (!integrityCheck.isValid) {
        recommendations.push('Audit log integrity issues detected - investigate immediately');
      }

      // Determine overall status
      const healthyServices = Object.values(services).filter(Boolean).length;
      const totalServices = Object.keys(services).length;
      
      let status: 'healthy' | 'degraded' | 'unhealthy';
      if (healthyServices === totalServices) {
        status = 'healthy';
      } else if (healthyServices >= totalServices * 0.8) {
        status = 'degraded';
      } else {
        status = 'unhealthy';
      }

      return {
        status,
        services,
        metrics: {
          encryptionKeysActive: activeKeys.length,
          pendingDSRRequests: pendingDSRs,
          unresolvedSecurityEvents: unresolvedEvents,
          auditLogIntegrity: integrityCheck.isValid
        },
        recommendations
      };
    } catch (error) {
      console.error('Security health check failed:', error);
      return {
        status: 'unhealthy',
        services: {},
        metrics: {
          encryptionKeysActive: 0,
          pendingDSRRequests: 0,
          unresolvedSecurityEvents: 0,
          auditLogIntegrity: false
        },
        recommendations: ['Health check failed - system may be experiencing issues']
      };
    }
  }

  /**
   * Get comprehensive security dashboard metrics
   */
  async getDashboardMetrics(organizationId?: string): Promise<{
    security: any;
    compliance: any;
    privacy: {
      totalRules: number;
      activeRules: number;
      recentChanges: number;
    };
    encryption: {
      activeKeys: number;
      recentRotations: number;
    };
    audit: {
      totalEvents: number;
      last24Hours: number;
      requiresReview: number;
    };
  }> {
    const [securityMetrics, complianceStats, encryptionKeys, auditStats] = await Promise.all([
      this.monitoring.getSecurityMetrics(organizationId),
      this.compliance.getComplianceStatistics(organizationId),
      this.encryption.listKeys(),
      this.audit.getAuditStatistics(organizationId)
    ]);

    // Get privacy rules count (simplified - would normally use privacy service)
    const { count: totalPrivacyRules } = await this.supabase
      .from('enhanced_privacy_rules')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);

    const { count: recentPrivacyChanges } = await this.supabase
      .from('enhanced_privacy_rules')
      .select('*', { count: 'exact', head: true })
      .gte('updated_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    return {
      security: securityMetrics,
      compliance: complianceStats,
      privacy: {
        totalRules: totalPrivacyRules || 0,
        activeRules: totalPrivacyRules || 0,
        recentChanges: recentPrivacyChanges || 0
      },
      encryption: {
        activeKeys: encryptionKeys.filter(k => k.status === 'active').length,
        recentRotations: 0 // Would query key_rotations table
      },
      audit: {
        totalEvents: auditStats.totalEntries,
        last24Hours: auditStats.last24Hours,
        requiresReview: auditStats.reviewRequired
      }
    };
  }
}

/**
 * Create and initialize a new Security Manager instance
 */
export async function createSecurityManager(
  supabase: SupabaseClient<Database>
): Promise<SecurityManager> {
  const securityManager = new SecurityManager(supabase);
  await securityManager.initialize();
  return securityManager;
}

/**
 * Default export
 */
export default SecurityManager;

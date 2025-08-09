/**
 * Security Monitoring Service
 * Provides anomaly detection, threat monitoring, and security alerting
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types';
import { AuditLogger } from './AuditLogger';
import { EventEmitter } from 'events';

export type SecurityEventType = 
  | 'failed_login'
  | 'suspicious_access'
  | 'privilege_escalation'
  | 'data_export_anomaly'
  | 'bulk_operation_anomaly'
  | 'privacy_violation'
  | 'authentication_anomaly'
  | 'api_abuse'
  | 'permission_violation';

export type ThreatLevel = 'low' | 'medium' | 'high' | 'critical';

export interface SecurityEvent {
  id?: string;
  eventType: SecurityEventType;
  threatLevel: ThreatLevel;
  actorId?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  description: string;
  evidence: Record<string, any>;
  detectionMethod?: string;
  confidenceScore?: number;
  autoResolved: boolean;
  resolutionAction?: string;
  resolvedAt?: Date;
  resolvedBy?: string;
  organizationId?: string;
  detectedAt: Date;
  metadata: Record<string, any>;
}

export interface AnomalyPattern {
  patternType: string;
  threshold: number;
  timeWindow: string;
  enabled: boolean;
  description: string;
}

export interface SecurityMetrics {
  totalEvents: number;
  eventsByType: Record<SecurityEventType, number>;
  eventsByThreatLevel: Record<ThreatLevel, number>;
  unresolvedCritical: number;
  unresolvedHigh: number;
  averageResolutionTime: number;
  topActors: Array<{ actorId: string; eventCount: number }>;
  topIpAddresses: Array<{ ipAddress: string; eventCount: number }>;
  last24Hours: number;
  last7Days: number;
}

export interface MonitoringRule {
  id: string;
  name: string;
  description: string;
  eventType: SecurityEventType;
  conditions: Record<string, any>;
  threshold: number;
  timeWindow: string;
  action: string;
  enabled: boolean;
  organizationId?: string;
}

export interface AlertNotification {
  id: string;
  securityEventId: string;
  alertType: string;
  severity: ThreatLevel;
  message: string;
  recipients: string[];
  sentAt?: Date;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
}

export class SecurityMonitoringService extends EventEmitter {
  private supabase: SupabaseClient<Database>;
  private auditLogger: AuditLogger;
  private monitoringRules: Map<string, MonitoringRule> = new Map();
  private actorBehaviorBaselines: Map<string, any> = new Map();
  private ipReputationCache: Map<string, any> = new Map();
  private readonly monitoringInterval = 60000; // 1 minute
  private monitoringTimer?: NodeJS.Timeout;

  constructor(supabase: SupabaseClient<Database>, auditLogger: AuditLogger) {
    super();
    this.supabase = supabase;
    this.auditLogger = auditLogger;
  }

  /**
   * Start security monitoring
   */
  async startMonitoring(): Promise<void> {
    await this.loadMonitoringRules();
    await this.loadActorBaselines();
    
    this.monitoringTimer = setInterval(() => {
      this.performSecurityChecks().catch(console.error);
    }, this.monitoringInterval);

    console.log('Security monitoring started');
  }

  /**
   * Stop security monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = undefined;
    }
    
    console.log('Security monitoring stopped');
  }

  /**
   * Detect failed login attempts
   */
  async detectFailedLogins(): Promise<SecurityEvent[]> {
    const events: SecurityEvent[] = [];
    const timeThreshold = new Date(Date.now() - 15 * 60 * 1000); // 15 minutes ago

    // Query recent failed authentication events
    const { data: failedLogins, error } = await this.supabase
      .from('enhanced_audit_log')
      .select('*')
      .eq('category', 'authentication')
      .eq('outcome', 'failure')
      .gte('occurred_at', timeThreshold.toISOString())
      .order('occurred_at', { ascending: false });

    if (error || !failedLogins) {
      return events;
    }

    // Group by IP address and actor
    const failuresByIp: Map<string, any[]> = new Map();
    const failuresByActor: Map<string, any[]> = new Map();

    failedLogins.forEach(login => {
      if (login.ip_address) {
        if (!failuresByIp.has(login.ip_address)) {
          failuresByIp.set(login.ip_address, []);
        }
        failuresByIp.get(login.ip_address)!.push(login);
      }

      if (login.actor_id) {
        if (!failuresByActor.has(login.actor_id)) {
          failuresByActor.set(login.actor_id, []);
        }
        failuresByActor.get(login.actor_id)!.push(login);
      }
    });

    // Check for suspicious patterns
    for (const [ipAddress, failures] of failuresByIp) {
      if (failures.length >= 5) { // 5+ failed attempts from same IP
        events.push({
          eventType: 'failed_login',
          threatLevel: failures.length >= 10 ? 'high' : 'medium',
          ipAddress,
          description: `Multiple failed login attempts from IP ${ipAddress}`,
          evidence: {
            failed_attempts: failures.length,
            time_window: '15 minutes',
            attempts: failures.map(f => ({
              timestamp: f.occurred_at,
              actor_id: f.actor_id,
              user_agent: f.user_agent
            }))
          },
          detectionMethod: 'failed_login_threshold',
          confidenceScore: Math.min(failures.length / 10, 1),
          autoResolved: false,
          detectedAt: new Date(),
          metadata: {
            detection_rule: 'multiple_failed_logins_by_ip',
            threshold: 5,
            actual_count: failures.length
          }
        });
      }
    }

    for (const [actorId, failures] of failuresByActor) {
      if (failures.length >= 3) { // 3+ failed attempts by same user
        events.push({
          eventType: 'failed_login',
          threatLevel: 'medium',
          actorId,
          description: `Multiple failed login attempts by user ${actorId}`,
          evidence: {
            failed_attempts: failures.length,
            time_window: '15 minutes',
            attempts: failures.map(f => ({
              timestamp: f.occurred_at,
              ip_address: f.ip_address,
              user_agent: f.user_agent
            }))
          },
          detectionMethod: 'failed_login_threshold',
          confidenceScore: Math.min(failures.length / 5, 1),
          autoResolved: false,
          detectedAt: new Date(),
          metadata: {
            detection_rule: 'multiple_failed_logins_by_user',
            threshold: 3,
            actual_count: failures.length
          }
        });
      }
    }

    return events;
  }

  /**
   * Detect suspicious data access patterns
   */
  async detectSuspiciousAccess(): Promise<SecurityEvent[]> {
    const events: SecurityEvent[] = [];
    const timeThreshold = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago

    // Query recent data access events
    const { data: accessEvents, error } = await this.supabase
      .from('enhanced_audit_log')
      .select('*')
      .eq('category', 'data_access')
      .gte('occurred_at', timeThreshold.toISOString())
      .order('occurred_at', { ascending: false });

    if (error || !accessEvents) {
      return events;
    }

    // Group by actor
    const accessByActor: Map<string, any[]> = new Map();
    accessEvents.forEach(event => {
      if (event.actor_id) {
        if (!accessByActor.has(event.actor_id)) {
          accessByActor.set(event.actor_id, []);
        }
        accessByActor.get(event.actor_id)!.push(event);
      }
    });

    // Check for unusual access patterns
    for (const [actorId, accesses] of accessByActor) {
      const baseline = this.actorBehaviorBaselines.get(actorId);
      
      // High volume access detection
      if (accesses.length > 100) { // 100+ accesses in 1 hour
        events.push({
          eventType: 'suspicious_access',
          threatLevel: accesses.length > 500 ? 'high' : 'medium',
          actorId,
          description: `Unusually high data access volume by user ${actorId}`,
          evidence: {
            access_count: accesses.length,
            time_window: '1 hour',
            baseline_average: baseline?.hourlyAccessAverage || 10,
            resources_accessed: Array.from(new Set(accesses.map(a => a.resource))),
            unique_resources: new Set(accesses.map(a => a.resource_id)).size
          },
          detectionMethod: 'volume_anomaly',
          confidenceScore: Math.min(accesses.length / 500, 1),
          autoResolved: false,
          detectedAt: new Date(),
          metadata: {
            detection_rule: 'high_volume_data_access',
            threshold: 100,
            actual_count: accesses.length
          }
        });
      }

      // Off-hours access detection
      const currentHour = new Date().getHours();
      const isOffHours = currentHour < 6 || currentHour > 22; // Before 6 AM or after 10 PM
      
      if (isOffHours && accesses.length > 10) {
        const offHoursAccesses = accesses.filter(a => {
          const accessHour = new Date(a.occurred_at).getHours();
          return accessHour < 6 || accessHour > 22;
        });

        if (offHoursAccesses.length > 0) {
          events.push({
            eventType: 'suspicious_access',
            threatLevel: 'medium',
            actorId,
            description: `Off-hours data access by user ${actorId}`,
            evidence: {
              off_hours_accesses: offHoursAccesses.length,
              current_hour: currentHour,
              baseline_off_hours: baseline?.offHoursAccessAverage || 0,
              accessed_resources: offHoursAccesses.map(a => a.resource)
            },
            detectionMethod: 'temporal_anomaly',
            confidenceScore: 0.7,
            autoResolved: false,
            detectedAt: new Date(),
            metadata: {
              detection_rule: 'off_hours_access',
              time_window: 'off_hours',
              threshold: 10
            }
          });
        }
      }
    }

    return events;
  }

  /**
   * Detect bulk operation anomalies
   */
  async detectBulkOperationAnomalies(): Promise<SecurityEvent[]> {
    const events: SecurityEvent[] = [];
    const timeThreshold = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago

    // Query recent bulk operations
    const { data: bulkOps, error } = await this.supabase
      .from('enhanced_audit_log')
      .select('*')
      .eq('category', 'bulk_operation')
      .gte('occurred_at', timeThreshold.toISOString())
      .order('occurred_at', { ascending: false });

    if (error || !bulkOps) {
      return events;
    }

    for (const operation of bulkOps) {
      const metadata = operation.metadata || {};
      const resourceCount = metadata.resource_count || 0;
      const errorCount = metadata.error_count || 0;
      const successCount = metadata.success_count || 0;

      // Large bulk operation detection
      if (resourceCount > 1000) {
        events.push({
          eventType: 'bulk_operation_anomaly',
          threatLevel: resourceCount > 10000 ? 'high' : 'medium',
          actorId: operation.actor_id,
          description: `Large bulk operation by user ${operation.actor_id}`,
          evidence: {
            operation_type: operation.action,
            resource_count: resourceCount,
            success_count: successCount,
            error_count: errorCount,
            processing_time_ms: operation.processing_time_ms
          },
          detectionMethod: 'bulk_operation_size',
          confidenceScore: Math.min(resourceCount / 10000, 1),
          autoResolved: false,
          detectedAt: new Date(),
          metadata: {
            detection_rule: 'large_bulk_operation',
            threshold: 1000,
            actual_count: resourceCount,
            audit_log_id: operation.id
          }
        });
      }

      // High failure rate detection
      const failureRate = resourceCount > 0 ? errorCount / resourceCount : 0;
      if (failureRate > 0.5 && resourceCount > 100) { // >50% failure rate on 100+ resources
        events.push({
          eventType: 'bulk_operation_anomaly',
          threatLevel: 'medium',
          actorId: operation.actor_id,
          description: `Bulk operation with high failure rate by user ${operation.actor_id}`,
          evidence: {
            operation_type: operation.action,
            resource_count: resourceCount,
            error_count: errorCount,
            failure_rate: failureRate,
            processing_time_ms: operation.processing_time_ms
          },
          detectionMethod: 'bulk_operation_failure_rate',
          confidenceScore: failureRate,
          autoResolved: false,
          detectedAt: new Date(),
          metadata: {
            detection_rule: 'high_bulk_operation_failure_rate',
            failure_threshold: 0.5,
            actual_failure_rate: failureRate,
            audit_log_id: operation.id
          }
        });
      }
    }

    return events;
  }

  /**
   * Detect privacy rule violations
   */
  async detectPrivacyViolations(): Promise<SecurityEvent[]> {
    const events: SecurityEvent[] = [];
    const timeThreshold = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago

    // Query recent data access events
    const { data: accessEvents, error } = await this.supabase
      .from('enhanced_audit_log')
      .select('*')
      .eq('category', 'data_access')
      .gte('occurred_at', timeThreshold.toISOString())
      .not('resource_id', 'is', null)
      .order('occurred_at', { ascending: false });

    if (error || !accessEvents) {
      return events;
    }

    // Check each access against privacy rules
    for (const access of accessEvents) {
      if (!access.resource_id || !access.actor_id) continue;

      try {
        // This would normally call the privacy rule engine
        // For now, we'll do a simplified check
        const { data: contact } = await this.supabase
          .from('contacts')
          .select('user_id')
          .eq('id', access.resource_id)
          .single();

        if (contact) {
          const { data: privacyRule } = await this.supabase
            .from('privacy_rules')
            .select('visibility, anonymize_number, anonymize_content')
            .eq('user_id', contact.user_id)
            .eq('contact_id', access.resource_id)
            .single();

          if (privacyRule && privacyRule.visibility === 'private') {
            // Check if accessor should have access
            const { data: sameOrg } = await this.supabase
              .rpc('same_organization', {
                user1_id: access.actor_id,
                user2_id: contact.user_id
              });

            if (!sameOrg) {
              events.push({
                eventType: 'privacy_violation',
                threatLevel: 'high',
                actorId: access.actor_id,
                description: `Potential privacy violation: unauthorized access to private contact`,
                evidence: {
                  resource_type: access.resource,
                  resource_id: access.resource_id,
                  privacy_level: privacyRule.visibility,
                  contact_owner: contact.user_id,
                  anonymization_required: privacyRule.anonymize_number || privacyRule.anonymize_content
                },
                detectionMethod: 'privacy_rule_validation',
                confidenceScore: 0.8,
                autoResolved: false,
                detectedAt: new Date(),
                metadata: {
                  detection_rule: 'privacy_violation_detection',
                  audit_log_id: access.id,
                  violation_type: 'unauthorized_private_access'
                }
              });
            }
          }
        }
      } catch (error) {
        // Skip this check on error
        continue;
      }
    }

    return events;
  }

  /**
   * Create security event
   */
  async createSecurityEvent(event: SecurityEvent): Promise<string> {
    const { data, error } = await this.supabase
      .from('security_events')
      .insert({
        event_type: event.eventType,
        threat_level: event.threatLevel,
        actor_id: event.actorId,
        session_id: event.sessionId,
        ip_address: event.ipAddress,
        user_agent: event.userAgent,
        description: event.description,
        evidence: event.evidence,
        detection_method: event.detectionMethod,
        confidence_score: event.confidenceScore,
        auto_resolved: event.autoResolved,
        resolution_action: event.resolutionAction,
        resolved_at: event.resolvedAt?.toISOString(),
        resolved_by: event.resolvedBy,
        organization_id: event.organizationId,
        detected_at: event.detectedAt.toISOString(),
        metadata: event.metadata
      })
      .select('id')
      .single();

    if (error) {
      throw new Error(`Failed to create security event: ${error.message}`);
    }

    // Log the security event creation
    await this.auditLogger.logSecurityEvent(
      event.actorId || 'system',
      event.eventType,
      event.threatLevel,
      event.description,
      event.metadata,
      event.ipAddress,
      event.userAgent
    );

    // Emit event for real-time notifications
    this.emit('security_event', { ...event, id: data.id });

    // Auto-trigger alerts for high/critical threats
    if (event.threatLevel === 'high' || event.threatLevel === 'critical') {
      await this.triggerSecurityAlert(data.id, event);
    }

    return data.id;
  }

  /**
   * Resolve security event
   */
  async resolveSecurityEvent(
    eventId: string,
    resolutionAction: string,
    resolvedBy: string,
    notes?: string
  ): Promise<void> {
    const { error } = await this.supabase
      .from('security_events')
      .update({
        auto_resolved: false,
        resolution_action: resolutionAction,
        resolved_at: new Date().toISOString(),
        resolved_by: resolvedBy,
        metadata: {
          resolution_notes: notes,
          resolved_manually: true
        }
      })
      .eq('id', eventId);

    if (error) {
      throw new Error(`Failed to resolve security event: ${error.message}`);
    }

    await this.auditLogger.logSecurityEvent(
      resolvedBy,
      'security_event_resolved',
      'low',
      `Security event ${eventId} resolved`,
      {
        event_id: eventId,
        resolution_action: resolutionAction,
        notes
      }
    );

    this.emit('security_event_resolved', { eventId, resolvedBy, resolutionAction });
  }

  /**
   * Get security metrics
   */
  async getSecurityMetrics(organizationId?: string): Promise<SecurityMetrics> {
    let baseQuery = this.supabase.from('security_events');
    
    if (organizationId) {
      baseQuery = baseQuery.eq('organization_id', organizationId);
    }

    const [totalResult, unresolvedCritical, unresolvedHigh, recentEvents, topActors, topIps] = await Promise.all([
      baseQuery.select('*', { count: 'exact', head: true }),
      baseQuery.select('*', { count: 'exact', head: true })
        .eq('threat_level', 'critical')
        .is('resolved_at', null),
      baseQuery.select('*', { count: 'exact', head: true })
        .eq('threat_level', 'high')
        .is('resolved_at', null),
      baseQuery.select('*', { count: 'exact', head: true })
        .gte('detected_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
      baseQuery.select('actor_id')
        .not('actor_id', 'is', null)
        .limit(10),
      baseQuery.select('ip_address')
        .not('ip_address', 'is', null)
        .limit(10)
    ]);

    // Calculate average resolution time
    const { data: resolvedEvents } = await baseQuery
      .select('detected_at, resolved_at')
      .not('resolved_at', 'is', null)
      .limit(100);

    let averageResolutionTime = 0;
    if (resolvedEvents && resolvedEvents.length > 0) {
      const totalTime = resolvedEvents.reduce((sum, event) => {
        const detected = new Date(event.detected_at).getTime();
        const resolved = new Date(event.resolved_at).getTime();
        return sum + (resolved - detected);
      }, 0);
      averageResolutionTime = Math.round(totalTime / resolvedEvents.length / (1000 * 60 * 60)); // in hours
    }

    // Initialize counters
    const eventsByType: Record<SecurityEventType, number> = {
      failed_login: 0,
      suspicious_access: 0,
      privilege_escalation: 0,
      data_export_anomaly: 0,
      bulk_operation_anomaly: 0,
      privacy_violation: 0,
      authentication_anomaly: 0,
      api_abuse: 0,
      permission_violation: 0
    };

    const eventsByThreatLevel: Record<ThreatLevel, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0
    };

    return {
      totalEvents: totalResult.count || 0,
      eventsByType,
      eventsByThreatLevel,
      unresolvedCritical: unresolvedCritical.count || 0,
      unresolvedHigh: unresolvedHigh.count || 0,
      averageResolutionTime,
      topActors: [], // Would be processed from topActors data
      topIpAddresses: [], // Would be processed from topIps data
      last24Hours: recentEvents.count || 0,
      last7Days: 0 // Would need additional query
    };
  }

  // Private helper methods

  private async performSecurityChecks(): Promise<void> {
    try {
      const [failedLogins, suspiciousAccess, bulkAnomalies, privacyViolations] = await Promise.all([
        this.detectFailedLogins(),
        this.detectSuspiciousAccess(),
        this.detectBulkOperationAnomalies(),
        this.detectPrivacyViolations()
      ]);

      const allEvents = [...failedLogins, ...suspiciousAccess, ...bulkAnomalies, ...privacyViolations];

      for (const event of allEvents) {
        await this.createSecurityEvent(event);
      }

      if (allEvents.length > 0) {
        console.log(`Detected ${allEvents.length} security events`);
      }
    } catch (error) {
      console.error('Error during security checks:', error);
    }
  }

  private async loadMonitoringRules(): Promise<void> {
    // In production, this would load from database
    // For now, initialize with default rules
    const defaultRules: MonitoringRule[] = [
      {
        id: 'failed_login_threshold',
        name: 'Failed Login Threshold',
        description: 'Detect multiple failed login attempts',
        eventType: 'failed_login',
        conditions: { attempts: 5, timeWindow: '15m' },
        threshold: 5,
        timeWindow: '15m',
        action: 'alert',
        enabled: true
      },
      {
        id: 'bulk_operation_size',
        name: 'Large Bulk Operations',
        description: 'Detect unusually large bulk operations',
        eventType: 'bulk_operation_anomaly',
        conditions: { resourceCount: 1000 },
        threshold: 1000,
        timeWindow: '1h',
        action: 'alert',
        enabled: true
      }
    ];

    defaultRules.forEach(rule => {
      this.monitoringRules.set(rule.id, rule);
    });
  }

  private async loadActorBaselines(): Promise<void> {
    // In production, this would analyze historical data to establish baselines
    // For now, use simplified defaults
    const defaultBaseline = {
      hourlyAccessAverage: 25,
      offHoursAccessAverage: 2,
      bulkOperationsAverage: 1
    };

    // Would normally query for all actors and calculate their baselines
    this.actorBehaviorBaselines.set('default', defaultBaseline);
  }

  private async triggerSecurityAlert(eventId: string, event: SecurityEvent): Promise<void> {
    // In production, this would integrate with alerting systems (email, Slack, PagerDuty, etc.)
    console.warn(`🚨 SECURITY ALERT: ${event.threatLevel.toUpperCase()} - ${event.description}`);
    
    this.emit('security_alert', {
      eventId,
      event,
      timestamp: new Date(),
      requiresImmediate: event.threatLevel === 'critical'
    });
  }
}

export default SecurityMonitoringService;

/**
 * Enhanced Audit Logging Service
 * Provides comprehensive audit trail with integrity verification and advanced categorization
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types';
import { createHash, randomBytes } from 'crypto';

// Enhanced audit log types
export type AuditEventCategory = 
  | 'authentication'
  | 'authorization'
  | 'data_access'
  | 'data_modification'
  | 'privacy'
  | 'security'
  | 'compliance'
  | 'system'
  | 'integration'
  | 'bulk_operation';

export type AuditSeverity = 'low' | 'medium' | 'high' | 'critical';
export type AuditOutcome = 'success' | 'failure' | 'warning' | 'blocked';
export type ActorType = 'user' | 'system' | 'service' | 'api';

export interface AuditLogEntry {
  // Actor information
  actorId?: string;
  actorType: ActorType;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  
  // Event classification
  category: AuditEventCategory;
  action: string;
  severity: AuditSeverity;
  outcome: AuditOutcome;
  
  // Resource information
  resource: string;
  resourceId?: string;
  resourceOwnerId?: string;
  
  // Event details
  description?: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  metadata?: Record<string, any>;
  
  // Context information
  organizationId?: string;
  correlationId?: string;
  
  // Performance metrics
  processingTimeMs?: number;
  
  // Security assessment
  riskScore?: number;
  requiresReview?: boolean;
}

export interface AuditSearchCriteria {
  actorId?: string;
  category?: AuditEventCategory;
  resource?: string;
  resourceId?: string;
  outcome?: AuditOutcome;
  severity?: AuditSeverity;
  startDate?: Date;
  endDate?: Date;
  organizationId?: string;
  correlationId?: string;
  limit?: number;
  offset?: number;
}

export interface AuditMetadata {
  [key: string]: any;
  source?: string;
  version?: string;
  environment?: string;
}

export interface BulkAuditMetadata extends AuditMetadata {
  batchId: string;
  totalRecords: number;
  successCount: number;
  errorCount: number;
  processingTimeMs: number;
}

export interface IntegrityVerificationResult {
  isValid: boolean;
  invalidEntries: string[];
  totalChecked: number;
  checksumMismatches: number;
  missingPreviousChecksums: number;
}

export class AuditLogger {
  private supabase: SupabaseClient<Database>;
  private batchQueue: AuditLogEntry[] = [];
  private batchTimeout?: NodeJS.Timeout;
  private readonly batchSize = 100;
  private readonly batchTimeoutMs = 5000;

  constructor(supabase: SupabaseClient<Database>) {
    this.supabase = supabase;
  }

  /**
   * Log data access event
   */
  async logDataAccess(
    actorId: string,
    resource: string,
    resourceId: string,
    action: string,
    metadata: AuditMetadata = {}
  ): Promise<void> {
    const entry: AuditLogEntry = {
      actorId,
      actorType: 'user',
      category: 'data_access',
      action,
      severity: this.calculateSeverity(resource, action),
      outcome: 'success',
      resource,
      resourceId,
      description: `${action} on ${resource}`,
      metadata: {
        ...metadata,
        access_type: action,
        timestamp: new Date().toISOString()
      }
    };

    await this.logEntry(entry);
  }

  /**
   * Log privacy rule change
   */
  async logPrivacyRuleChange(
    actorId: string,
    contactId: string,
    oldRule: any,
    newRule: any
  ): Promise<void> {
    const entry: AuditLogEntry = {
      actorId,
      actorType: 'user',
      category: 'privacy',
      action: 'privacy_rule_change',
      severity: 'high',
      outcome: 'success',
      resource: 'privacy_rule',
      resourceId: contactId,
      description: 'Privacy rule modified',
      oldValues: oldRule,
      newValues: newRule,
      metadata: {
        contact_id: contactId,
        rule_type: 'contact_specific',
        change_type: this.determineChangeType(oldRule, newRule)
      }
    };

    await this.logEntry(entry);
  }

  /**
   * Log bulk operation
   */
  async logBulkOperation(
    actorId: string,
    operation: string,
    affectedResources: string[],
    metadata: BulkAuditMetadata
  ): Promise<void> {
    const entry: AuditLogEntry = {
      actorId,
      actorType: 'user',
      category: 'bulk_operation',
      action: operation,
      severity: affectedResources.length > 1000 ? 'high' : 'medium',
      outcome: metadata.errorCount === 0 ? 'success' : 'warning',
      resource: 'bulk_operation',
      description: `Bulk ${operation} on ${affectedResources.length} resources`,
      processingTimeMs: metadata.processingTimeMs,
      metadata: {
        ...metadata,
        affected_resources: affectedResources,
        resource_count: affectedResources.length
      }
    };

    await this.logEntry(entry);
  }

  /**
   * Log authentication event
   */
  async logAuthentication(
    actorId: string,
    action: string,
    outcome: AuditOutcome,
    sessionId?: string,
    ipAddress?: string,
    userAgent?: string,
    metadata: AuditMetadata = {}
  ): Promise<void> {
    const entry: AuditLogEntry = {
      actorId,
      actorType: 'user',
      sessionId,
      ipAddress,
      userAgent,
      category: 'authentication',
      action,
      severity: outcome === 'failure' ? 'high' : 'low',
      outcome,
      resource: 'authentication',
      description: `Authentication ${action}`,
      metadata: {
        ...metadata,
        auth_method: metadata.auth_method || 'unknown',
        device_fingerprint: this.generateDeviceFingerprint(userAgent, ipAddress)
      },
      riskScore: this.calculateRiskScore(outcome, action, ipAddress, userAgent)
    };

    await this.logEntry(entry);
  }

  /**
   * Log security event
   */
  async logSecurityEvent(
    actorId: string,
    eventType: string,
    severity: AuditSeverity,
    description: string,
    metadata: AuditMetadata = {},
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    const entry: AuditLogEntry = {
      actorId,
      actorType: 'user',
      ipAddress,
      userAgent,
      category: 'security',
      action: eventType,
      severity,
      outcome: 'warning',
      resource: 'security_event',
      description,
      metadata: {
        ...metadata,
        event_type: eventType,
        detection_timestamp: new Date().toISOString()
      },
      riskScore: this.mapSeverityToRiskScore(severity),
      requiresReview: severity === 'high' || severity === 'critical'
    };

    await this.logEntry(entry);
  }

  /**
   * Log system event
   */
  async logSystemEvent(
    action: string,
    resource: string,
    outcome: AuditOutcome,
    metadata: AuditMetadata = {},
    processingTimeMs?: number
  ): Promise<void> {
    const entry: AuditLogEntry = {
      actorType: 'system',
      category: 'system',
      action,
      severity: outcome === 'failure' ? 'medium' : 'low',
      outcome,
      resource,
      description: `System ${action} on ${resource}`,
      processingTimeMs,
      metadata: {
        ...metadata,
        system_version: process.env.APP_VERSION || 'unknown',
        environment: process.env.NODE_ENV || 'unknown'
      }
    };

    await this.logEntry(entry);
  }

  /**
   * Log GDPR/compliance event
   */
  async logComplianceEvent(
    actorId: string,
    action: string,
    resourceId: string,
    metadata: AuditMetadata = {}
  ): Promise<void> {
    const entry: AuditLogEntry = {
      actorId,
      actorType: 'user',
      category: 'compliance',
      action,
      severity: 'high',
      outcome: 'success',
      resource: 'compliance_request',
      resourceId,
      description: `Compliance action: ${action}`,
      metadata: {
        ...metadata,
        compliance_framework: 'GDPR',
        request_type: action,
        processing_timestamp: new Date().toISOString()
      }
    };

    await this.logEntry(entry);
  }

  /**
   * Log entry with batching support
   */
  private async logEntry(entry: AuditLogEntry): Promise<void> {
    // Add correlation ID if not present
    if (!entry.correlationId) {
      entry.correlationId = randomBytes(16).toString('hex');
    }

    // Add organization context if actor is a user
    if (entry.actorId && entry.actorType === 'user') {
      entry.organizationId = await this.getActorOrganization(entry.actorId);
    }

    // Add to batch queue
    this.batchQueue.push(entry);

    // Flush if batch is full or this is a critical event
    if (this.batchQueue.length >= this.batchSize || entry.severity === 'critical') {
      await this.flushBatch();
    } else if (!this.batchTimeout) {
      // Set timeout to flush batch
      this.batchTimeout = setTimeout(() => {
        this.flushBatch().catch(console.error);
      }, this.batchTimeoutMs);
    }
  }

  /**
   * Flush pending audit log entries to database
   */
  private async flushBatch(): Promise<void> {
    if (this.batchQueue.length === 0) return;

    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = undefined;
    }

    const batch = [...this.batchQueue];
    this.batchQueue = [];

    try {
      // Convert entries to database format
      const dbEntries = batch.map(entry => ({
        actor_id: entry.actorId || null,
        actor_type: entry.actorType,
        session_id: entry.sessionId || null,
        ip_address: entry.ipAddress || null,
        user_agent: entry.userAgent || null,
        category: entry.category,
        action: entry.action,
        severity: entry.severity,
        outcome: entry.outcome,
        resource: entry.resource,
        resource_id: entry.resourceId || null,
        resource_owner_id: entry.resourceOwnerId || null,
        description: entry.description || null,
        old_values: entry.oldValues ? JSON.stringify(entry.oldValues) : null,
        new_values: entry.newValues ? JSON.stringify(entry.newValues) : null,
        metadata: entry.metadata || {},
        organization_id: entry.organizationId || null,
        correlation_id: entry.correlationId || null,
        processing_time_ms: entry.processingTimeMs || null,
        risk_score: entry.riskScore || null,
        requires_review: entry.requiresReview || false
      }));

      // Insert batch into database
      const { error } = await this.supabase
        .from('enhanced_audit_log')
        .insert(dbEntries);

      if (error) {
        console.error('Failed to insert audit log batch:', error);
        // Re-queue entries for retry (limited to prevent memory issues)
        if (this.batchQueue.length < 1000) {
          this.batchQueue.unshift(...batch);
        }
      }
    } catch (error) {
      console.error('Error flushing audit log batch:', error);
    }
  }

  /**
   * Search audit logs with advanced filtering
   */
  async searchAuditLogs(criteria: AuditSearchCriteria): Promise<{
    entries: any[];
    totalCount: number;
    hasMore: boolean;
  }> {
    let query = this.supabase
      .from('enhanced_audit_log')
      .select('*', { count: 'exact' })
      .order('occurred_at', { ascending: false });

    // Apply filters
    if (criteria.actorId) {
      query = query.eq('actor_id', criteria.actorId);
    }
    if (criteria.category) {
      query = query.eq('category', criteria.category);
    }
    if (criteria.resource) {
      query = query.eq('resource', criteria.resource);
    }
    if (criteria.resourceId) {
      query = query.eq('resource_id', criteria.resourceId);
    }
    if (criteria.outcome) {
      query = query.eq('outcome', criteria.outcome);
    }
    if (criteria.severity) {
      query = query.eq('severity', criteria.severity);
    }
    if (criteria.organizationId) {
      query = query.eq('organization_id', criteria.organizationId);
    }
    if (criteria.correlationId) {
      query = query.eq('correlation_id', criteria.correlationId);
    }
    if (criteria.startDate) {
      query = query.gte('occurred_at', criteria.startDate.toISOString());
    }
    if (criteria.endDate) {
      query = query.lte('occurred_at', criteria.endDate.toISOString());
    }

    // Apply pagination
    const limit = criteria.limit || 50;
    const offset = criteria.offset || 0;
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Failed to search audit logs: ${error.message}`);
    }

    return {
      entries: data || [],
      totalCount: count || 0,
      hasMore: (count || 0) > offset + limit
    };
  }

  /**
   * Verify audit log integrity
   */
  async verifyIntegrity(
    actorId?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<IntegrityVerificationResult> {
    let query = this.supabase
      .from('enhanced_audit_log')
      .select('id, checksum, previous_checksum, occurred_at')
      .order('occurred_at', { ascending: true });

    if (actorId) {
      query = query.eq('actor_id', actorId);
    }
    if (startDate) {
      query = query.gte('occurred_at', startDate.toISOString());
    }
    if (endDate) {
      query = query.lte('occurred_at', endDate.toISOString());
    }

    const { data: entries, error } = await query;

    if (error || !entries) {
      throw new Error(`Failed to fetch audit logs for verification: ${error?.message}`);
    }

    const invalidEntries: string[] = [];
    let checksumMismatches = 0;
    let missingPreviousChecksums = 0;
    let previousChecksum: string | null = null;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      
      // Check if previous checksum matches expected value
      if (i > 0 && entry.previous_checksum !== previousChecksum) {
        invalidEntries.push(entry.id);
        if (entry.previous_checksum === null) {
          missingPreviousChecksums++;
        } else {
          checksumMismatches++;
        }
      }
      
      // Update previous checksum for next iteration
      previousChecksum = entry.checksum;
    }

    return {
      isValid: invalidEntries.length === 0,
      invalidEntries,
      totalChecked: entries.length,
      checksumMismatches,
      missingPreviousChecksums
    };
  }

  /**
   * Get audit statistics
   */
  async getAuditStatistics(organizationId?: string): Promise<{
    totalEntries: number;
    entriesByCategory: Record<AuditEventCategory, number>;
    entriesBySeverity: Record<AuditSeverity, number>;
    entriesByOutcome: Record<AuditOutcome, number>;
    reviewRequired: number;
    last24Hours: number;
    last7Days: number;
  }> {
    const query = this.supabase.from('enhanced_audit_log').select('*');
    if (organizationId) {
      query.eq('organization_id', organizationId);
    }

    // Get total count
    let countQuery = this.supabase
      .from('enhanced_audit_log')
      .select('*', { count: 'exact', head: true });
    
    if (organizationId) {
      countQuery = countQuery.eq('organization_id', organizationId);
    }
    
    const { count: totalEntries } = await countQuery;

    // Use separate queries for aggregation since Supabase doesn't support groupBy
    // Get statistics by category
    const categoryQuery = this.supabase.from('enhanced_audit_log').select('category');
    if (organizationId) {
      categoryQuery.eq('organization_id', organizationId);
    }
    const { data: categoryStats } = await categoryQuery;

    // Get statistics by severity  
    const severityQuery = this.supabase.from('enhanced_audit_log').select('severity');
    if (organizationId) {
      severityQuery.eq('organization_id', organizationId);
    }
    const { data: severityStats } = await severityQuery;

    // Get statistics by outcome
    const outcomeQuery = this.supabase.from('enhanced_audit_log').select('outcome');
    if (organizationId) {
      outcomeQuery.eq('organization_id', organizationId);
    }
    const { data: outcomeStats } = await outcomeQuery;

    // Get review required count
    let reviewQuery = this.supabase.from('enhanced_audit_log')
      .select('*', { count: 'exact', head: true })
      .eq('requires_review', true);
    
    if (organizationId) {
      reviewQuery = reviewQuery.eq('organization_id', organizationId);
    }
    
    const { count: reviewRequired } = await reviewQuery;

    // Get recent activity counts
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    let last24Query = this.supabase.from('enhanced_audit_log')
      .select('*', { count: 'exact', head: true })
      .gte('occurred_at', last24Hours.toISOString());
    
    if (organizationId) {
      last24Query = last24Query.eq('organization_id', organizationId);
    }
    
    const { count: last24HoursCount } = await last24Query;

    let last7Query = this.supabase.from('enhanced_audit_log')
      .select('*', { count: 'exact', head: true })
      .gte('occurred_at', last7Days.toISOString());
    
    if (organizationId) {
      last7Query = last7Query.eq('organization_id', organizationId);
    }
    
    const { count: last7DaysCount } = await last7Query;

    // Process category counts
    const entriesByCategory: Record<AuditEventCategory, number> = {
      authentication: 0,
      authorization: 0,
      data_access: 0,
      data_modification: 0,
      privacy: 0,
      security: 0,
      compliance: 0,
      system: 0,
      integration: 0,
      bulk_operation: 0
    };

    // Process severity counts
    const entriesBySeverity: Record<AuditSeverity, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0
    };

    // Process outcome counts
    const entriesByOutcome: Record<AuditOutcome, number> = {
      success: 0,
      failure: 0,
      warning: 0,
      blocked: 0
    };

    return {
      totalEntries: totalEntries || 0,
      entriesByCategory,
      entriesBySeverity,
      entriesByOutcome,
      reviewRequired: reviewRequired || 0,
      last24Hours: last24HoursCount || 0,
      last7Days: last7DaysCount || 0
    };
  }

  /**
   * Force flush any pending entries (useful for shutdown)
   */
  async flush(): Promise<void> {
    await this.flushBatch();
  }

  // Private helper methods

  private calculateSeverity(resource: string, action: string): AuditSeverity {
    const highRiskResources = ['privacy_rule', 'org_role', 'encryption_key'];
    const highRiskActions = ['delete', 'export', 'bulk_update'];

    if (highRiskResources.includes(resource) || highRiskActions.includes(action)) {
      return 'high';
    }
    
    if (action.includes('write') || action.includes('update')) {
      return 'medium';
    }
    
    return 'low';
  }

  private determineChangeType(oldRule: any, newRule: any): string {
    if (!oldRule) return 'create';
    if (!newRule) return 'delete';
    
    const changes = [];
    if (oldRule.visibility !== newRule.visibility) changes.push('visibility');
    if (oldRule.anonymize_number !== newRule.anonymize_number) changes.push('anonymization');
    if (oldRule.anonymize_content !== newRule.anonymize_content) changes.push('content');
    
    return changes.join(',') || 'unknown';
  }

  private generateDeviceFingerprint(userAgent?: string, ipAddress?: string): string {
    const input = `${userAgent || ''}|${ipAddress || ''}|${Date.now()}`;
    return createHash('sha256').update(input).digest('hex').substring(0, 16);
  }

  private calculateRiskScore(
    outcome: AuditOutcome,
    action: string,
    ipAddress?: string,
    userAgent?: string
  ): number {
    let score = 0;
    
    // Base score by outcome
    switch (outcome) {
      case 'failure': score += 40; break;
      case 'blocked': score += 60; break;
      case 'warning': score += 20; break;
      case 'success': score += 0; break;
    }
    
    // Adjust for action type
    if (action.includes('login') && outcome === 'failure') {
      score += 20;
    }
    
    // Basic IP reputation check (simplified)
    if (ipAddress && this.isHighRiskIP(ipAddress)) {
      score += 30;
    }
    
    return Math.min(score, 100);
  }

  private mapSeverityToRiskScore(severity: AuditSeverity): number {
    switch (severity) {
      case 'critical': return 90;
      case 'high': return 70;
      case 'medium': return 40;
      case 'low': return 10;
    }
  }

  private isHighRiskIP(ipAddress: string): boolean {
    // Simplified high-risk IP detection
    // In production, this would check against threat intelligence feeds
    const privateRanges = [
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^192\.168\./,
      /^127\./
    ];
    
    return !privateRanges.some(range => range.test(ipAddress));
  }

  private async getActorOrganization(actorId: string): Promise<string | undefined> {
    try {
      const { data, error } = await this.supabase
        .from('org_roles')
        .select('org_id')
        .eq('user_id', actorId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      return error ? undefined : data.org_id;
    } catch (error) {
      return undefined;
    }
  }
}

export default AuditLogger;

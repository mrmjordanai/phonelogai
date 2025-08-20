/**
 * GDPR/CCPA Compliance Service
 * Provides data subject request handling and compliance features
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types';
import { AuditLogger } from './AuditLogger';
import { EncryptionService } from './EncryptionService';
import { randomBytes } from 'crypto';

export type DSRRequestType = 
  | 'access'
  | 'portability'
  | 'rectification'
  | 'erasure'
  | 'restriction'
  | 'objection'
  | 'withdraw_consent';

export type DSRStatus = 
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'rejected'
  | 'expired';

export interface DataSubjectRequest {
  id: string;
  requestNumber: string;
  requestType: DSRRequestType;
  
  // Subject information
  subjectUserId?: string;
  subjectEmail: string;
  subjectPhone?: string;
  identityVerified: boolean;
  verificationMethod?: string;
  verificationTimestamp?: Date;
  
  // Request details
  description?: string;
  legalBasis?: string;
  scopeOfRequest?: Record<string, any>;
  
  // Processing information
  status: DSRStatus;
  priority: number;
  
  // Assignment and workflow
  assignedTo?: string;
  organizationId?: string;
  
  // Response and fulfillment
  responseData?: Record<string, any>;
  exportFileUrl?: string;
  fulfillmentNotes?: string;
  
  // Timing constraints
  requestedAt: Date;
  dueDate: Date;
  completedAt?: Date;
  
  // Audit information
  createdBy?: string;
  metadata: Record<string, any>;
}

export interface DSRProcessingStep {
  id: string;
  dsrId: string;
  action: string;
  performedBy?: string;
  performedAt: Date;
  details: Record<string, any>;
  recordsProcessed: number;
  dataTypesAffected: string[];
  processingTimeMs?: number;
}

export interface ComplianceExportOptions {
  includeMetadata?: boolean;
  includeAuditLogs?: boolean;
  includeEncryptedFields?: boolean;
  dateRange?: {
    start: Date;
    end: Date;
  };
  dataTypes?: string[];
  format?: 'json' | 'csv' | 'xml';
}

export interface ComplianceStats {
  totalRequests: number;
  requestsByType: Record<DSRRequestType, number>;
  requestsByStatus: Record<DSRStatus, number>;
  averageProcessingTime: number;
  overdueRequests: number;
  complianceRate: number;
  last30Days: number;
  criticalPending: number;
}

export interface AnonymizationResult {
  anonymizedEvents: number;
  anonymizedContacts: number;
  deletedPrivacyRules: number;
  totalOperations: number;
  processingTimeMs: number;
  retentionPolicy?: string;
}

export interface ConsentRecord {
  userId: string;
  consentType: string;
  granted: boolean;
  grantedAt?: Date;
  withdrawnAt?: Date;
  legalBasis: string;
  purpose: string;
  metadata: Record<string, any>;
}

export class ComplianceService {
  private supabase: SupabaseClient<Database>;
  private auditLogger: AuditLogger;
  private encryptionService: EncryptionService;

  constructor(
    supabase: SupabaseClient<Database>,
    auditLogger: AuditLogger,
    encryptionService: EncryptionService
  ) {
    this.supabase = supabase;
    this.auditLogger = auditLogger;
    this.encryptionService = encryptionService;
  }

  /**
   * Create a new data subject request
   */
  async createDataSubjectRequest(
    requestData: Omit<DataSubjectRequest, 'id' | 'requestNumber' | 'requestedAt' | 'dueDate'>,
    requestorId?: string
  ): Promise<string> {
    const startTime = Date.now();
    
    // Calculate due date based on request type (GDPR: 30 days, CCPA: 45 days)
    const daysToAdd = this.getDueDateDays(requestData.requestType);
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + daysToAdd);

    const dsrData = {
      request_type: requestData.requestType,
      subject_user_id: requestData.subjectUserId,
      subject_email: requestData.subjectEmail,
      subject_phone: requestData.subjectPhone,
      identity_verified: requestData.identityVerified,
      verification_method: requestData.verificationMethod,
      verification_timestamp: requestData.verificationTimestamp?.toISOString(),
      description: requestData.description,
      legal_basis: requestData.legalBasis,
      scope_of_request: requestData.scopeOfRequest,
      status: requestData.status,
      priority: requestData.priority,
      assigned_to: requestData.assignedTo,
      organization_id: requestData.organizationId,
      due_date: dueDate.toISOString(),
      created_by: requestorId,
      metadata: requestData.metadata
    };

    const { data, error } = await this.supabase
      .from('data_subject_requests')
      .insert(dsrData)
      .select('id, request_number')
      .single();

    if (error) {
      throw new Error(`Failed to create DSR: ${error.message}`);
    }

    // Log DSR creation
    await this.auditLogger.logComplianceEvent(
      requestorId || 'system',
      'dsr_created',
      data.id,
      {
        request_type: requestData.requestType,
        subject_email: requestData.subjectEmail,
        request_number: data.request_number,
        due_date: dueDate.toISOString(),
        processing_time_ms: Date.now() - startTime
      }
    );

    return data.id;
  }

  /**
   * Process access request (GDPR Article 15)
   */
  async processAccessRequest(dsrId: string, performedBy: string): Promise<void> {
    const startTime = Date.now();
    const dsr = await this.getDataSubjectRequest(dsrId);
    
    if (!dsr || !dsr.subjectUserId) {
      throw new Error('DSR not found or missing subject user ID');
    }

    await this.updateDSRStatus(dsrId, 'in_progress', performedBy);

    try {
      // Export all user data
      const exportData = await this.exportUserData(dsr.subjectUserId, {
        includeMetadata: true,
        includeAuditLogs: true,
        includeEncryptedFields: false,
        format: 'json'
      });

      // Store export data
      await this.supabase
        .from('data_subject_requests')
        .update({
          response_data: exportData,
          completed_at: new Date().toISOString()
        })
        .eq('id', dsrId);

      await this.updateDSRStatus(dsrId, 'completed', performedBy);
      
      // Log processing step
      await this.logDSRProcessingStep({
        dsrId,
        action: 'access_request_processed',
        performedBy,
        details: { export_size: JSON.stringify(exportData).length },
        recordsProcessed: this.countExportRecords(exportData),
        dataTypesAffected: Object.keys(exportData),
        processingTimeMs: Date.now() - startTime
      });
      
    } catch (error) {
      await this.updateDSRStatus(dsrId, 'rejected', performedBy);
      throw error;
    }
  }

  /**
   * Process erasure request (GDPR Article 17 - Right to be Forgotten)
   */
  async processErasureRequest(
    dsrId: string,
    performedBy: string,
    retentionPeriod: string = '0 days'
  ): Promise<AnonymizationResult> {
    const startTime = Date.now();
    const dsr = await this.getDataSubjectRequest(dsrId);
    
    if (!dsr || !dsr.subjectUserId) {
      throw new Error('DSR not found or missing subject user ID');
    }

    await this.updateDSRStatus(dsrId, 'in_progress', performedBy);

    try {
      // Parse retention period
      const retentionInterval = this.parseRetentionPeriod(retentionPeriod);
      
      // Anonymize user data
      const { data: result, error } = await this.supabase
        .rpc('anonymize_user_data', {
          p_user_id: dsr.subjectUserId,
          p_retention_period: retentionInterval
        });

      if (error) {
        throw new Error(`Anonymization failed: ${error.message}`);
      }

      const anonymizationResult: AnonymizationResult = {
        anonymizedEvents: result.anonymized_events,
        anonymizedContacts: result.anonymized_contacts,
        deletedPrivacyRules: result.deleted_privacy_rules,
        totalOperations: result.total_operations,
        processingTimeMs: Date.now() - startTime,
        retentionPolicy: retentionPeriod
      };

      // Update DSR with results
      await this.supabase
        .from('data_subject_requests')
        .update({
          response_data: anonymizationResult,
          completed_at: new Date().toISOString()
        })
        .eq('id', dsrId);

      await this.updateDSRStatus(dsrId, 'completed', performedBy);
      
      // Log processing step
      await this.logDSRProcessingStep({
        dsrId,
        action: 'erasure_request_processed',
        performedBy,
        details: anonymizationResult,
        recordsProcessed: result.total_operations,
        dataTypesAffected: ['events', 'contacts', 'privacy_rules'],
        processingTimeMs: Date.now() - startTime
      });

      return anonymizationResult;
      
    } catch (error) {
      await this.updateDSRStatus(dsrId, 'rejected', performedBy);
      throw error;
    }
  }

  /**
   * Process portability request (GDPR Article 20)
   */
  async processPortabilityRequest(
    dsrId: string,
    performedBy: string,
    exportOptions: ComplianceExportOptions = {}
  ): Promise<string> {
    const startTime = Date.now();
    const dsr = await this.getDataSubjectRequest(dsrId);
    
    if (!dsr || !dsr.subjectUserId) {
      throw new Error('DSR not found or missing subject user ID');
    }

    await this.updateDSRStatus(dsrId, 'in_progress', performedBy);

    try {
      // Export data in portable format
      const exportData = await this.exportUserData(dsr.subjectUserId, {
        ...exportOptions,
        format: exportOptions.format || 'json',
        includeMetadata: true
      });

      // Generate export file (in production, upload to secure storage)
      const exportFileUrl = await this.generateExportFile(exportData, exportOptions.format || 'json');

      // Update DSR with export file
      await this.supabase
        .from('data_subject_requests')
        .update({
          export_file_url: exportFileUrl,
          response_data: { export_summary: this.generateExportSummary(exportData) },
          completed_at: new Date().toISOString()
        })
        .eq('id', dsrId);

      await this.updateDSRStatus(dsrId, 'completed', performedBy);
      
      // Log processing step
      await this.logDSRProcessingStep({
        dsrId,
        action: 'portability_request_processed',
        performedBy,
        details: {
          export_file_url: exportFileUrl,
          export_format: exportOptions.format || 'json',
          data_types: Object.keys(exportData)
        },
        recordsProcessed: this.countExportRecords(exportData),
        dataTypesAffected: Object.keys(exportData),
        processingTimeMs: Date.now() - startTime
      });

      return exportFileUrl;
      
    } catch (error) {
      await this.updateDSRStatus(dsrId, 'rejected', performedBy);
      throw error;
    }
  }

  /**
   * Process rectification request (GDPR Article 16)
   */
  async processRectificationRequest(
    dsrId: string,
    performedBy: string,
    corrections: Record<string, any>
  ): Promise<void> {
    const startTime = Date.now();
    const dsr = await this.getDataSubjectRequest(dsrId);
    
    if (!dsr || !dsr.subjectUserId) {
      throw new Error('DSR not found or missing subject user ID');
    }

    await this.updateDSRStatus(dsrId, 'in_progress', performedBy);

    try {
      let recordsUpdated = 0;
      const updatedTables: string[] = [];

      // Apply corrections to contacts
      if (corrections.contacts) {
        const { error: contactsError } = await this.supabase
          .from('contacts')
          .update(corrections.contacts)
          .eq('user_id', dsr.subjectUserId);

        if (contactsError) {
          throw new Error(`Failed to update contacts: ${contactsError.message}`);
        }

        recordsUpdated++;
        updatedTables.push('contacts');
      }

      // Apply corrections to events
      if (corrections.events) {
        const { error: eventsError } = await this.supabase
          .from('events')
          .update(corrections.events)
          .eq('user_id', dsr.subjectUserId);

        if (eventsError) {
          throw new Error(`Failed to update events: ${eventsError.message}`);
        }

        recordsUpdated++;
        updatedTables.push('events');
      }

      // Store corrections summary
      await this.supabase
        .from('data_subject_requests')
        .update({
          response_data: {
            corrections_applied: corrections,
            records_updated: recordsUpdated,
            tables_affected: updatedTables
          },
          completed_at: new Date().toISOString()
        })
        .eq('id', dsrId);

      await this.updateDSRStatus(dsrId, 'completed', performedBy);
      
      // Log processing step
      await this.logDSRProcessingStep({
        dsrId,
        action: 'rectification_request_processed',
        performedBy,
        details: { corrections, records_updated: recordsUpdated },
        recordsProcessed: recordsUpdated,
        dataTypesAffected: updatedTables,
        processingTimeMs: Date.now() - startTime
      });
      
    } catch (error) {
      await this.updateDSRStatus(dsrId, 'rejected', performedBy);
      throw error;
    }
  }

  /**
   * Get compliance statistics
   */
  async getComplianceStatistics(organizationId?: string): Promise<ComplianceStats> {
    // Create properly typed queries
    let totalQuery = this.supabase.from('data_subject_requests').select('*', { count: 'exact', head: true });
    let typeQuery = this.supabase.from('data_subject_requests').select('request_type');
    let statusQuery = this.supabase.from('data_subject_requests').select('status');
    let overdueQuery = this.supabase.from('data_subject_requests').select('*', { count: 'exact', head: true });
    let recentQuery = this.supabase.from('data_subject_requests').select('*', { count: 'exact', head: true });
    
    if (organizationId) {
      totalQuery = totalQuery.eq('organization_id', organizationId);
      typeQuery = typeQuery.eq('organization_id', organizationId);
      statusQuery = statusQuery.eq('organization_id', organizationId);
      overdueQuery = overdueQuery.eq('organization_id', organizationId);
      recentQuery = recentQuery.eq('organization_id', organizationId);
    }

    // Add additional filters
    overdueQuery = overdueQuery.lt('due_date', new Date().toISOString()).neq('status', 'completed');
    recentQuery = recentQuery.gte('requested_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    const [totalResult, typeStats, statusStats, overdueResult, recentResult] = await Promise.all([
        totalQuery,
        typeQuery,
        statusQuery,
        overdueQuery,
        recentQuery
      ]);

    // Calculate average processing time
    let completedQuery = this.supabase.from('data_subject_requests')
      .select('requested_at, completed_at')
      .eq('status', 'completed')
      .not('completed_at', 'is', null);
    
    if (organizationId) {
      completedQuery = completedQuery.eq('organization_id', organizationId);
    }
    
    const { data: completedRequests } = await completedQuery;

    let averageProcessingTime = 0;
    if (completedRequests && completedRequests.length > 0) {
      const totalTime = completedRequests.reduce((sum, req) => {
        const requested = new Date(req.requested_at).getTime();
        const completed = new Date(req.completed_at!).getTime();
        return sum + (completed - requested);
      }, 0);
      averageProcessingTime = Math.round(totalTime / completedRequests.length / (1000 * 60 * 60 * 24)); // in days
    }

    // Initialize counters
    const requestsByType: Record<DSRRequestType, number> = {
      access: 0,
      portability: 0,
      rectification: 0,
      erasure: 0,
      restriction: 0,
      objection: 0,
      withdraw_consent: 0
    };

    const requestsByStatus: Record<DSRStatus, number> = {
      pending: 0,
      in_progress: 0,
      completed: 0,
      rejected: 0,
      expired: 0
    };

    const totalRequests = totalResult.count || 0;
    const completedCount = requestsByStatus.completed || 0;
    const complianceRate = totalRequests > 0 ? (completedCount / totalRequests) * 100 : 100;

    return {
      totalRequests,
      requestsByType,
      requestsByStatus,
      averageProcessingTime,
      overdueRequests: overdueResult.count || 0,
      complianceRate,
      last30Days: recentResult.count || 0,
      criticalPending: 0 // Would need to query for high priority pending requests
    };
  }

  /**
   * Export user data for compliance purposes
   */
  async exportUserData(
    userId: string,
    options: ComplianceExportOptions = {}
  ): Promise<Record<string, any>> {
    const { data: userData, error } = await this.supabase
      .rpc('export_user_data', {
        p_user_id: userId,
        p_include_anonymized: options.includeEncryptedFields || false
      });

    if (error) {
      throw new Error(`Failed to export user data: ${error.message}`);
    }

    // Filter by date range if specified
    if (options.dateRange) {
      return this.filterDataByDateRange(userData, options.dateRange);
    }

    // Filter by data types if specified
    if (options.dataTypes) {
      return this.filterDataByTypes(userData, options.dataTypes);
    }

    return userData;
  }

  /**
   * Record consent
   */
  async recordConsent(consent: ConsentRecord): Promise<void> {
    await this.auditLogger.logComplianceEvent(
      consent.userId,
      consent.granted ? 'consent_granted' : 'consent_withdrawn',
      consent.userId,
      {
        consent_type: consent.consentType,
        legal_basis: consent.legalBasis,
        purpose: consent.purpose,
        granted_at: consent.grantedAt?.toISOString(),
        withdrawn_at: consent.withdrawnAt?.toISOString(),
        metadata: consent.metadata
      }
    );
  }

  /**
   * Verify identity for DSR
   */
  async verifyIdentity(
    dsrId: string,
    verificationMethod: string,
    verifiedBy: string
  ): Promise<void> {
    const { error } = await this.supabase
      .from('data_subject_requests')
      .update({
        identity_verified: true,
        verification_method: verificationMethod,
        verification_timestamp: new Date().toISOString()
      })
      .eq('id', dsrId);

    if (error) {
      throw new Error(`Failed to verify identity: ${error.message}`);
    }

    await this.logDSRProcessingStep({
      dsrId,
      action: 'identity_verified',
      performedBy: verifiedBy,
      details: { verification_method: verificationMethod },
      recordsProcessed: 1,
      dataTypesAffected: ['dsr_identity']
    });
  }

  // Private helper methods

  private async getDataSubjectRequest(dsrId: string): Promise<DataSubjectRequest | null> {
    const { data, error } = await this.supabase
      .from('data_subject_requests')
      .select('*')
      .eq('id', dsrId)
      .single();

    if (error || !data) {
      return null;
    }

    return this.mapDatabaseDSRToDataSubjectRequest(data);
  }

  private async updateDSRStatus(
    dsrId: string,
    status: DSRStatus,
    performedBy: string
  ): Promise<void> {
    const { error } = await this.supabase
      .from('data_subject_requests')
      .update({ status })
      .eq('id', dsrId);

    if (error) {
      throw new Error(`Failed to update DSR status: ${error.message}`);
    }

    await this.auditLogger.logComplianceEvent(
      performedBy,
      'dsr_status_changed',
      dsrId,
      { new_status: status }
    );
  }

  private async logDSRProcessingStep(
    step: Omit<DSRProcessingStep, 'id' | 'performedAt'>
  ): Promise<void> {
    const { error } = await this.supabase
      .from('dsr_processing_log')
      .insert({
        dsr_id: step.dsrId,
        action: step.action,
        performed_by: step.performedBy,
        details: step.details,
        records_processed: step.recordsProcessed,
        data_types_affected: step.dataTypesAffected,
        processing_time_ms: step.processingTimeMs
      });

    if (error) {
      console.error('Failed to log DSR processing step:', error);
    }
  }

  private getDueDateDays(requestType: DSRRequestType): number {
    // GDPR: 30 days, CCPA: 45 days (simplified)
    switch (requestType) {
      case 'access':
      case 'portability':
        return 30;
      case 'erasure':
      case 'rectification':
        return 30;
      default:
        return 30;
    }
  }

  private parseRetentionPeriod(period: string): string {
    // Convert human-readable period to PostgreSQL interval
    // This is simplified - production would have more robust parsing
    return period.includes('day') || period.includes('month') || period.includes('year') 
      ? period 
      : `${period} days`;
  }

  private async generateExportFile(data: any, format: string): Promise<string> {
    // In production, this would upload to secure cloud storage
    // For now, return a placeholder URL
    const fileId = randomBytes(16).toString('hex');
    return `https://secure-exports.example.com/dsr/${fileId}.${format}`;
  }

  private generateExportSummary(data: any): Record<string, any> {
    return {
      total_records: this.countExportRecords(data),
      data_types: Object.keys(data),
      export_timestamp: new Date().toISOString(),
      format: 'json'
    };
  }

  private countExportRecords(data: any): number {
    let count = 0;
    for (const [key, value] of Object.entries(data)) {
      if (Array.isArray(value)) {
        count += value.length;
      } else if (typeof value === 'object' && value !== null) {
        count += 1;
      }
    }
    return count;
  }

  private filterDataByDateRange(
    data: any,
    dateRange: { start: Date; end: Date }
  ): any {
    // Simplified date filtering - production would be more sophisticated
    const filtered = { ...data };
    
    for (const [key, value] of Object.entries(data)) {
      if (Array.isArray(value)) {
        filtered[key] = value.filter((item: any) => {
          const itemDate = new Date(item.created_at || item.ts || item.occurred_at);
          return itemDate >= dateRange.start && itemDate <= dateRange.end;
        });
      }
    }
    
    return filtered;
  }

  private filterDataByTypes(data: any, dataTypes: string[]): any {
    const filtered: any = {};
    
    for (const type of dataTypes) {
      if (data[type]) {
        filtered[type] = data[type];
      }
    }
    
    return filtered;
  }

  private mapDatabaseDSRToDataSubjectRequest(dbDSR: any): DataSubjectRequest {
    return {
      id: dbDSR.id,
      requestNumber: dbDSR.request_number,
      requestType: dbDSR.request_type,
      subjectUserId: dbDSR.subject_user_id,
      subjectEmail: dbDSR.subject_email,
      subjectPhone: dbDSR.subject_phone,
      identityVerified: dbDSR.identity_verified,
      verificationMethod: dbDSR.verification_method,
      verificationTimestamp: dbDSR.verification_timestamp ? new Date(dbDSR.verification_timestamp) : undefined,
      description: dbDSR.description,
      legalBasis: dbDSR.legal_basis,
      scopeOfRequest: dbDSR.scope_of_request,
      status: dbDSR.status,
      priority: dbDSR.priority,
      assignedTo: dbDSR.assigned_to,
      organizationId: dbDSR.organization_id,
      responseData: dbDSR.response_data,
      exportFileUrl: dbDSR.export_file_url,
      fulfillmentNotes: dbDSR.fulfillment_notes,
      requestedAt: new Date(dbDSR.requested_at),
      dueDate: new Date(dbDSR.due_date),
      completedAt: dbDSR.completed_at ? new Date(dbDSR.completed_at) : undefined,
      createdBy: dbDSR.created_by,
      metadata: dbDSR.metadata || {}
    };
  }
}

export default ComplianceService;

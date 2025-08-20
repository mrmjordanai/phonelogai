/**
 * Privacy Rule Engine
 * Provides comprehensive privacy rule evaluation with inheritance and bulk operations
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, VisibilityType } from '../types';
import type { UserRole } from '@phonelogai/shared/rbac';
// TODO: Phase 1 - temporarily disabled due to AuditLogger issues
// import { AuditLogger } from './AuditLogger';

export type PrivacyScope = 'contact' | 'number_pattern' | 'organization' | 'global';
export type AnonymizationLevel = 'none' | 'partial' | 'full' | 'redacted';

export interface PrivacyRule {
  id: string;
  ruleName: string;
  rulePriority: number;
  scope: PrivacyScope;
  userId: string;
  organizationId?: string;
  
  // Target specification
  contactId?: string;
  numberPattern?: string;
  tagFilters?: string[];
  
  // Privacy configuration
  visibility: VisibilityType;
  anonymizeNumber: boolean;
  anonymizeContent: boolean;
  anonymizationLevel: AnonymizationLevel;
  
  // Advanced privacy controls
  allowExport: boolean;
  allowAnalytics: boolean;
  allowMlTraining: boolean;
  dataRetentionDays?: number;
  
  // Inheritance and cascading
  parentRuleId?: string;
  inheritFromParent: boolean;
  overrideChildren: boolean;
  
  // Temporal controls
  effectiveFrom: Date;
  effectiveUntil?: Date;
  
  // Rule management
  isActive: boolean;
  autoApplied: boolean;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  metadata: Record<string, any>;
}

export interface AccessContext {
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  purpose?: string;
  [key: string]: any;
}

export interface AccessDecision {
  canAccess: boolean;
  visibilityLevel: VisibilityType;
  anonymizeNumber: boolean;
  anonymizeContent: boolean;
  allowExport: boolean;
  allowAnalytics: boolean;
  allowMlTraining: boolean;
  appliedRuleId?: string;
  ruleSource: 'explicit' | 'inherited' | 'default';
  reason?: string;
  restrictions?: string[];
}

export interface BulkPrivacyUpdate {
  contactId?: string;
  numberPattern?: string;
  tagFilter?: string;
  visibility?: VisibilityType;
  anonymizeNumber?: boolean;
  anonymizeContent?: boolean;
  allowExport?: boolean;
  allowAnalytics?: boolean;
  allowMlTraining?: boolean;
}

export interface BulkOperationResult {
  successCount: number;
  errorCount: number;
  processedCount: number;
  errors: Array<{
    identifier: string;
    error: string;
  }>;
  affectedRules: string[];
  operationId: string;
}

export interface OperationContext {
  userId: string;
  sessionId?: string;
  reason?: string;
  metadata?: Record<string, any>;
}

export interface PrivacyRuleFilter {
  userId?: string;
  organizationId?: string;
  scope?: PrivacyScope;
  isActive?: boolean;
  effectiveDate?: Date;
  contactId?: string;
  numberPattern?: string;
}

export class PrivacyRuleEngine {
  private supabase: SupabaseClient<Database>;
  // TODO: Phase 1 - temporarily disabled AuditLogger dependency
  // private auditLogger: AuditLogger;
  private auditLogger: any = null;
  private ruleCache: Map<string, AccessDecision> = new Map();
  private cacheTimeout = 300000; // 5 minutes
  private cacheTimestamps: Map<string, number> = new Map();

  constructor(supabase: SupabaseClient<Database>, auditLogger?: any) {
    this.supabase = supabase;
    this.auditLogger = auditLogger || null;
  }

  /**
   * Evaluate access permissions for a specific contact/resource
   */
  async evaluateAccess(
    requesterId: string,
    targetUserId: string,
    contactId: string,
    context: AccessContext = {}
  ): Promise<AccessDecision> {
    const startTime = Date.now();
    
    try {
      // Generate cache key
      const cacheKey = this.generateCacheKey(requesterId, targetUserId, contactId, context);
      
      // Check cache first
      const cachedDecision = this.getCachedDecision(cacheKey);
      if (cachedDecision) {
        return cachedDecision;
      }

      // Get requester's role in target user's organization
      const requesterRole = await this.getUserRole(requesterId, targetUserId);
      
      // Owner always has full access to their own data
      if (requesterId === targetUserId) {
        const ownerDecision: AccessDecision = {
          canAccess: true,
          visibilityLevel: 'private',
          anonymizeNumber: false,
          anonymizeContent: false,
          allowExport: true,
          allowAnalytics: true,
          allowMlTraining: true,
          ruleSource: 'default',
          reason: 'Owner access'
        };
        
        this.setCachedDecision(cacheKey, ownerDecision);
        return ownerDecision;
      }

      // Check if users are in same organization
      const sameOrg = await this.checkSameOrganization(requesterId, targetUserId);
      if (!sameOrg) {
        const deniedDecision: AccessDecision = {
          canAccess: false,
          visibilityLevel: 'private',
          anonymizeNumber: true,
          anonymizeContent: true,
          allowExport: false,
          allowAnalytics: false,
          allowMlTraining: false,
          ruleSource: 'default',
          reason: 'Not in same organization'
        };
        
        this.setCachedDecision(cacheKey, deniedDecision);
        return deniedDecision;
      }

      // Find applicable privacy rule
      const applicableRule = await this.findApplicableRule(targetUserId, contactId, context);
      
      // Evaluate rule against requester role
      const decision = this.evaluateRuleAccess(applicableRule, requesterRole, context);
      
      // Cache the decision
      this.setCachedDecision(cacheKey, decision);
      
      // Log access evaluation for audit
      // TODO: Phase 1 - temporarily disabled audit logging
      if (this.auditLogger) {
        await this.auditLogger.logDataAccess(
        requesterId,
        'privacy_evaluation',
        contactId,
        'evaluate_access',
        {
          target_user_id: targetUserId,
          decision: decision.canAccess,
          rule_source: decision.ruleSource,
          applied_rule_id: decision.appliedRuleId,
          processing_time_ms: Date.now() - startTime,
          context
        }
      );
      }
      
      return decision;
    } catch (error) {
      const errorDecision: AccessDecision = {
        canAccess: false,
        visibilityLevel: 'private',
        anonymizeNumber: true,
        anonymizeContent: true,
        allowExport: false,
        allowAnalytics: false,
        allowMlTraining: false,
        ruleSource: 'default',
        reason: `Evaluation error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
      
      return errorDecision;
    }
  }

  /**
   * Apply bulk privacy updates
   */
  async bulkUpdatePrivacy(
    userId: string,
    updates: BulkPrivacyUpdate[],
    context: OperationContext
  ): Promise<BulkOperationResult> {
    const operationId = `bulk_privacy_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const startTime = Date.now();
    
    let successCount = 0;
    let errorCount = 0;
    const errors: Array<{ identifier: string; error: string }> = [];
    const affectedRules: string[] = [];

    // Log bulk operation start
    if (this.auditLogger) await this.auditLogger.logBulkOperation(
      context.userId,
      'bulk_privacy_update',
      updates.map((_, index) => `update_${index}`),
      {
        batchId: operationId,
        totalRecords: updates.length,
        successCount: 0,
        errorCount: 0,
        processingTimeMs: 0
      }
    );

    for (let i = 0; i < updates.length; i++) {
      const update = updates[i];
      const identifier = update.contactId || update.numberPattern || update.tagFilter || `update_${i}`;
      
      try {
        // Create or update privacy rule
        const ruleData = this.buildRuleData(userId, update, context);
        
        const { data: rule, error } = await this.supabase
          .from('enhanced_privacy_rules')
          .upsert(ruleData, {
            onConflict: update.contactId ? 'user_id,contact_id' : 'user_id,number_pattern',
            ignoreDuplicates: false
          })
          .select('id')
          .single();

        if (error) {
          throw new Error(error.message);
        }

        if (rule?.id) {
          affectedRules.push(rule.id);
        }
        successCount++;
      } catch (error) {
        errors.push({
          identifier,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        errorCount++;
      }
    }

    const result: BulkOperationResult = {
      successCount,
      errorCount,
      processedCount: updates.length,
      errors,
      affectedRules,
      operationId
    };

    // Log bulk operation completion
    if (this.auditLogger) await this.auditLogger.logBulkOperation(
      context.userId,
      'bulk_privacy_update_completed',
      affectedRules,
      {
        batchId: operationId,
        totalRecords: updates.length,
        successCount,
        errorCount,
        processingTimeMs: Date.now() - startTime
      }
    );

    // Clear related cache entries
    this.clearUserCache(userId);

    return result;
  }

  /**
   * Create a new privacy rule with inheritance support
   */
  async createPrivacyRule(
    rule: Omit<PrivacyRule, 'id' | 'createdAt' | 'updatedAt'>,
    context: OperationContext
  ): Promise<string> {
    const ruleData = {
      rule_name: rule.ruleName,
      rule_priority: rule.rulePriority,
      scope: rule.scope,
      user_id: rule.userId,
      organization_id: rule.organizationId,
      contact_id: rule.contactId,
      number_pattern: rule.numberPattern,
      tag_filters: rule.tagFilters,
      visibility: rule.visibility,
      anonymize_number: rule.anonymizeNumber,
      anonymize_content: rule.anonymizeContent,
      anonymization_level: rule.anonymizationLevel,
      allow_export: rule.allowExport,
      allow_analytics: rule.allowAnalytics,
      allow_ml_training: rule.allowMlTraining,
      data_retention_days: rule.dataRetentionDays,
      parent_rule_id: rule.parentRuleId,
      inherit_from_parent: rule.inheritFromParent,
      override_children: rule.overrideChildren,
      effective_from: rule.effectiveFrom.toISOString(),
      effective_until: rule.effectiveUntil?.toISOString(),
      is_active: rule.isActive,
      auto_applied: rule.autoApplied,
      created_by: rule.createdBy,
      metadata: rule.metadata
    };

    const { data, error } = await this.supabase
      .from('enhanced_privacy_rules')
      .insert(ruleData)
      .select('id')
      .single();

    if (error) {
      throw new Error(`Failed to create privacy rule: ${error.message}`);
    }

    // Log rule creation
    if (this.auditLogger) await this.auditLogger.logPrivacyRuleChange(
      context.userId,
      rule.contactId || 'pattern',
      null,
      ruleData
    );

    // Clear related cache
    this.clearUserCache(rule.userId);

    return data.id;
  }

  /**
   * Update an existing privacy rule
   */
  async updatePrivacyRule(
    ruleId: string,
    updates: Partial<PrivacyRule>,
    context: OperationContext
  ): Promise<void> {
    // Get current rule for audit
    const { data: currentRule, error: fetchError } = await this.supabase
      .from('enhanced_privacy_rules')
      .select('*')
      .eq('id', ruleId)
      .single();

    if (fetchError || !currentRule) {
      throw new Error(`Privacy rule not found: ${ruleId}`);
    }

    // Build update data
    const updateData: any = {};
    if (updates.ruleName !== undefined) updateData.rule_name = updates.ruleName;
    if (updates.rulePriority !== undefined) updateData.rule_priority = updates.rulePriority;
    if (updates.visibility !== undefined) updateData.visibility = updates.visibility;
    if (updates.anonymizeNumber !== undefined) updateData.anonymize_number = updates.anonymizeNumber;
    if (updates.anonymizeContent !== undefined) updateData.anonymize_content = updates.anonymizeContent;
    if (updates.allowExport !== undefined) updateData.allow_export = updates.allowExport;
    if (updates.allowAnalytics !== undefined) updateData.allow_analytics = updates.allowAnalytics;
    if (updates.allowMlTraining !== undefined) updateData.allow_ml_training = updates.allowMlTraining;
    if (updates.isActive !== undefined) updateData.is_active = updates.isActive;
    if (updates.effectiveUntil !== undefined) updateData.effective_until = updates.effectiveUntil?.toISOString();
    
    updateData.updated_at = new Date().toISOString();

    // Update rule
    const { error: updateError } = await this.supabase
      .from('enhanced_privacy_rules')
      .update(updateData)
      .eq('id', ruleId);

    if (updateError) {
      throw new Error(`Failed to update privacy rule: ${updateError.message}`);
    }

    // Log rule update
    if (this.auditLogger) await this.auditLogger.logPrivacyRuleChange(
      context.userId,
      currentRule.contact_id || 'pattern',
      currentRule,
      { ...currentRule, ...updateData }
    );

    // Clear related cache
    this.clearUserCache(currentRule.user_id);
  }

  /**
   * Delete a privacy rule
   */
  async deletePrivacyRule(ruleId: string, context: OperationContext): Promise<void> {
    // Get current rule for audit
    const { data: currentRule, error: fetchError } = await this.supabase
      .from('enhanced_privacy_rules')
      .select('*')
      .eq('id', ruleId)
      .single();

    if (fetchError || !currentRule) {
      throw new Error(`Privacy rule not found: ${ruleId}`);
    }

    // Delete rule
    const { error: deleteError } = await this.supabase
      .from('enhanced_privacy_rules')
      .delete()
      .eq('id', ruleId);

    if (deleteError) {
      throw new Error(`Failed to delete privacy rule: ${deleteError.message}`);
    }

    // Log rule deletion
    if (this.auditLogger) await this.auditLogger.logPrivacyRuleChange(
      context.userId,
      currentRule.contact_id || 'pattern',
      currentRule,
      null
    );

    // Clear related cache
    this.clearUserCache(currentRule.user_id);
  }

  /**
   * Get privacy rules with filtering
   */
  async getPrivacyRules(filter: PrivacyRuleFilter): Promise<PrivacyRule[]> {
    let query = this.supabase
      .from('enhanced_privacy_rules')
      .select('*')
      .order('rule_priority', { ascending: false })
      .order('created_at', { ascending: false });

    if (filter.userId) {
      query = query.eq('user_id', filter.userId);
    }
    if (filter.organizationId) {
      query = query.eq('organization_id', filter.organizationId);
    }
    if (filter.scope) {
      query = query.eq('scope', filter.scope);
    }
    if (filter.isActive !== undefined) {
      query = query.eq('is_active', filter.isActive);
    }
    if (filter.contactId) {
      query = query.eq('contact_id', filter.contactId);
    }
    if (filter.numberPattern) {
      query = query.eq('number_pattern', filter.numberPattern);
    }
    if (filter.effectiveDate) {
      query = query
        .lte('effective_from', filter.effectiveDate.toISOString())
        .or(`effective_until.is.null,effective_until.gt.${filter.effectiveDate.toISOString()}`);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch privacy rules: ${error.message}`);
    }

    return (data || []).map(this.mapDatabaseRuleToPrivacyRule);
  }

  /**
   * Inherit privacy rules from parent to children
   */
  async inheritPrivacyRules(
    parentRule: PrivacyRule,
    childContacts: string[]
  ): Promise<PrivacyRule[]> {
    if (!parentRule.overrideChildren || childContacts.length === 0) {
      return [];
    }

    const inheritedRules: PrivacyRule[] = [];

    for (const contactId of childContacts) {
      const childRule: Omit<PrivacyRule, 'id' | 'createdAt' | 'updatedAt'> = {
        ...parentRule,
        ruleName: `Inherited from ${parentRule.ruleName}`,
        contactId,
        scope: 'contact',
        parentRuleId: parentRule.id,
        inheritFromParent: true,
        autoApplied: true
      };

      try {
        const ruleId = await this.createPrivacyRule(childRule, {
          userId: parentRule.userId,
          reason: 'automatic_inheritance'
        });

        inheritedRules.push({
          ...childRule,
          id: ruleId,
          createdAt: new Date(),
          updatedAt: new Date()
        });
      } catch (error) {
        console.error(`Failed to create inherited rule for contact ${contactId}:`, error);
      }
    }

    return inheritedRules;
  }

  /**
   * Clear privacy rule cache
   */
  clearCache(): void {
    this.ruleCache.clear();
    this.cacheTimestamps.clear();
  }

  /**
   * Clear cache for specific user
   */
  clearUserCache(userId: string): void {
    const keysToDelete: string[] = [];
    
    for (const [key] of this.ruleCache.entries()) {
      if (key.includes(userId)) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => {
      this.ruleCache.delete(key);
      this.cacheTimestamps.delete(key);
    });
  }

  // Private helper methods

  private async findApplicableRule(
    userId: string,
    contactId: string,
    context: AccessContext
  ): Promise<PrivacyRule | null> {
    const { data: contact } = await this.supabase
      .from('contacts')
      .select('number, tags')
      .eq('id', contactId)
      .single();

    let query = this.supabase
      .from('enhanced_privacy_rules')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .lte('effective_from', new Date().toISOString())
      .order('rule_priority', { ascending: false })
      .order('created_at', { ascending: true });

    // Add effective_until filter
    query = query.or('effective_until.is.null,effective_until.gt.' + new Date().toISOString());

    const { data: rules, error } = await query;

    if (error || !rules) {
      return null;
    }

    // Find most specific applicable rule
    for (const rule of rules) {
      if (rule.scope === 'contact' && rule.contact_id === contactId) {
        return this.mapDatabaseRuleToPrivacyRule(rule);
      }
      
      if (rule.scope === 'number_pattern' && contact?.number && rule.number_pattern) {
        try {
          const regex = new RegExp(rule.number_pattern);
          if (regex.test(contact.number)) {
            return this.mapDatabaseRuleToPrivacyRule(rule);
          }
        } catch (error) {
          console.error('Invalid regex pattern:', rule.number_pattern);
        }
      }
      
      if (rule.scope === 'organization' || rule.scope === 'global') {
        return this.mapDatabaseRuleToPrivacyRule(rule);
      }
    }

    return null;
  }

  private evaluateRuleAccess(
    rule: PrivacyRule | null,
    requesterRole: UserRole,
    context: AccessContext
  ): AccessDecision {
    // Default rule if none found
    if (!rule) {
      return {
        canAccess: this.hasDefaultAccess(requesterRole),
        visibilityLevel: 'team',
        anonymizeNumber: false,
        anonymizeContent: false,
        allowExport: true,
        allowAnalytics: true,
        allowMlTraining: false,
        ruleSource: 'default',
        reason: 'No specific rule found, using defaults'
      };
    }

    // Evaluate rule based on visibility and requester role
    const canAccess = this.evaluateVisibilityAccess(rule.visibility, requesterRole);

    return {
      canAccess,
      visibilityLevel: rule.visibility,
      anonymizeNumber: rule.anonymizeNumber,
      anonymizeContent: rule.anonymizeContent,
      allowExport: rule.allowExport,
      allowAnalytics: rule.allowAnalytics,
      allowMlTraining: rule.allowMlTraining,
      appliedRuleId: rule.id,
      ruleSource: rule.parentRuleId ? 'inherited' : 'explicit',
      reason: canAccess ? 'Rule allows access' : `Rule denies access (visibility: ${rule.visibility}, role: ${requesterRole})`
    };
  }

  private evaluateVisibilityAccess(visibility: VisibilityType, role: UserRole): boolean {
    switch (visibility) {
      case 'public':
        return true;
      case 'team':
        return ['owner', 'admin', 'analyst', 'member'].includes(role);
      case 'private':
        return ['owner', 'admin'].includes(role);
      default:
        return false;
    }
  }

  private hasDefaultAccess(role: UserRole): boolean {
    return ['owner', 'admin', 'analyst', 'member'].includes(role);
  }

  private async getUserRole(requesterId: string, targetUserId: string): Promise<UserRole> {
    const { data, error } = await this.supabase
      .rpc('get_user_role', { target_user_id: targetUserId });

    if (error || !data) {
      return 'viewer';
    }

    return data as UserRole;
  }

  private async checkSameOrganization(user1Id: string, user2Id: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .rpc('same_organization', {
        user1_id: user1Id,
        user2_id: user2Id
      });

    return !error && data === true;
  }

  private buildRuleData(userId: string, update: BulkPrivacyUpdate, context: OperationContext) {
    return {
      rule_name: `Bulk Rule - ${update.contactId || update.numberPattern || 'Pattern'}`,
      rule_priority: 100,
      scope: update.contactId ? 'contact' : 'number_pattern',
      user_id: userId,
      contact_id: update.contactId,
      number_pattern: update.numberPattern,
      tag_filters: update.tagFilter ? [update.tagFilter] : null,
      visibility: update.visibility || 'team',
      anonymize_number: update.anonymizeNumber || false,
      anonymize_content: update.anonymizeContent || false,
      anonymization_level: 'none',
      allow_export: update.allowExport !== false,
      allow_analytics: update.allowAnalytics !== false,
      allow_ml_training: update.allowMlTraining || false,
      inherit_from_parent: true,
      override_children: false,
      effective_from: new Date().toISOString(),
      is_active: true,
      auto_applied: true,
      created_by: context.userId,
      metadata: context.metadata || {}
    };
  }

  private mapDatabaseRuleToPrivacyRule(dbRule: any): PrivacyRule {
    return {
      id: dbRule.id,
      ruleName: dbRule.rule_name,
      rulePriority: dbRule.rule_priority,
      scope: dbRule.scope,
      userId: dbRule.user_id,
      organizationId: dbRule.organization_id,
      contactId: dbRule.contact_id,
      numberPattern: dbRule.number_pattern,
      tagFilters: dbRule.tag_filters,
      visibility: dbRule.visibility,
      anonymizeNumber: dbRule.anonymize_number,
      anonymizeContent: dbRule.anonymize_content,
      anonymizationLevel: dbRule.anonymization_level,
      allowExport: dbRule.allow_export,
      allowAnalytics: dbRule.allow_analytics,
      allowMlTraining: dbRule.allow_ml_training,
      dataRetentionDays: dbRule.data_retention_days,
      parentRuleId: dbRule.parent_rule_id,
      inheritFromParent: dbRule.inherit_from_parent,
      overrideChildren: dbRule.override_children,
      effectiveFrom: new Date(dbRule.effective_from),
      effectiveUntil: dbRule.effective_until ? new Date(dbRule.effective_until) : undefined,
      isActive: dbRule.is_active,
      autoApplied: dbRule.auto_applied,
      createdAt: new Date(dbRule.created_at),
      updatedAt: new Date(dbRule.updated_at),
      createdBy: dbRule.created_by,
      metadata: dbRule.metadata || {}
    };
  }

  private generateCacheKey(
    requesterId: string,
    targetUserId: string,
    contactId: string,
    context: AccessContext
  ): string {
    return `${requesterId}:${targetUserId}:${contactId}:${context.purpose || 'general'}`;
  }

  private getCachedDecision(cacheKey: string): AccessDecision | null {
    const cached = this.ruleCache.get(cacheKey);
    const timestamp = this.cacheTimestamps.get(cacheKey);
    
    if (cached && timestamp && Date.now() - timestamp < this.cacheTimeout) {
      return cached;
    }
    
    return null;
  }

  private setCachedDecision(cacheKey: string, decision: AccessDecision): void {
    this.ruleCache.set(cacheKey, decision);
    this.cacheTimestamps.set(cacheKey, Date.now());
  }
}

export default PrivacyRuleEngine;

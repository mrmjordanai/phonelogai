// Anonymization Policy Management for Call/SMS Intelligence Platform
// Provides configurable anonymization rules and policies per organization/role

import type { UserRole } from '@phonelogai/types'
import type { PIIType, AnonymizationTechnique } from './types'

export type DataClassification = 'public' | 'internal' | 'confidential' | 'restricted'
export type PolicyScope = 'global' | 'organization' | 'team' | 'user'
export type ComplianceFramework = 'gdpr' | 'ccpa' | 'hipaa' | 'sox' | 'pci_dss' | 'custom'

export interface AnonymizationRule {
  id: string
  name: string
  description: string
  field: string
  dataType: string
  piiTypes: PIIType[]
  technique: AnonymizationTechnique
  strength: 'low' | 'medium' | 'high'
  reversible: boolean
  conditions: AnonymizationCondition[]
  config: Record<string, any>
  enabled: boolean
  priority: number
}

export interface AnonymizationCondition {
  type: 'role' | 'classification' | 'context' | 'time' | 'location' | 'custom'
  operator: 'equals' | 'not_equals' | 'in' | 'not_in' | 'greater' | 'less' | 'matches' | 'custom'
  value: any
  metadata?: Record<string, any>
}

export interface AnonymizationPolicy {
  id: string
  name: string
  description: string
  version: string
  scope: PolicyScope
  organizationId?: string
  teamId?: string
  userId?: string
  
  // Policy configuration
  enabled: boolean
  priority: number
  inheritanceEnabled: boolean
  overrideAllowed: boolean
  
  // Rules and conditions
  rules: AnonymizationRule[]
  defaultRule?: AnonymizationRule
  
  // Compliance and governance
  complianceFrameworks: ComplianceFramework[]
  dataClassifications: DataClassification[]
  retentionPeriod: number // seconds
  auditRequired: boolean
  
  // Metadata
  createdBy: string
  createdAt: Date
  updatedBy?: string
  updatedAt?: Date
  approvedBy?: string
  approvedAt?: Date
  effectiveDate: Date
  expirationDate?: Date
  
  metadata: Record<string, any>
}

export interface PolicyEvaluationContext {
  userId: string
  userRole: UserRole
  organizationId?: string
  teamId?: string
  dataClassification: DataClassification
  field: string
  dataType: string
  piiTypes: PIIType[]
  timestamp: Date
  location?: string
  purpose?: string
  metadata?: Record<string, any>
}

export interface PolicyEvaluationResult {
  policy: AnonymizationPolicy
  rule: AnonymizationRule
  shouldAnonymize: boolean
  technique: AnonymizationTechnique
  strength: 'low' | 'medium' | 'high'
  reversible: boolean
  config: Record<string, any>
  reasoning: string[]
  confidence: number
}

export interface PolicyManagerConfig {
  // Inheritance settings
  enableInheritance: boolean
  inheritanceOrder: PolicyScope[]
  
  // Caching
  enableCaching: boolean
  cacheSize: number
  cacheTTL: number // seconds
  
  // Validation
  strictValidation: boolean
  requireApproval: boolean
  
  // Audit
  auditAllEvaluations: boolean
  auditPolicyChanges: boolean
}

export class AnonymizationPolicyManager {
  private config: PolicyManagerConfig
  private policies = new Map<string, AnonymizationPolicy>()
  private evaluationCache = new Map<string, PolicyEvaluationResult>()
  private inheritanceCache = new Map<string, AnonymizationPolicy[]>()

  constructor(config: Partial<PolicyManagerConfig> = {}) {
    this.config = {
      enableInheritance: true,
      inheritanceOrder: ['global', 'organization', 'team', 'user'],
      enableCaching: true,
      cacheSize: 1000,
      cacheTTL: 300, // 5 minutes
      strictValidation: true,
      requireApproval: false,
      auditAllEvaluations: false,
      auditPolicyChanges: true,
      ...config
    }

    this.initializeDefaultPolicies()
  }

  /**
   * Create or update anonymization policy
   */
  async createPolicy(
    policy: Omit<AnonymizationPolicy, 'id' | 'createdAt' | 'version'>,
    createdBy: string
  ): Promise<AnonymizationPolicy> {
    const policyId = this.generatePolicyId(policy.name, policy.scope)
    
    const newPolicy: AnonymizationPolicy = {
      ...policy,
      id: policyId,
      version: '1.0.0',
      createdBy,
      createdAt: new Date(),
      effectiveDate: policy.effectiveDate || new Date()
    }

    // Validate policy
    this.validatePolicy(newPolicy)

    // Store policy
    this.policies.set(policyId, newPolicy)

    // Clear related caches
    this.clearRelatedCaches(newPolicy)

    return newPolicy
  }

  /**
   * Update existing policy
   */
  async updatePolicy(
    policyId: string,
    updates: Partial<AnonymizationPolicy>,
    updatedBy: string
  ): Promise<AnonymizationPolicy> {
    const existingPolicy = this.policies.get(policyId)
    if (!existingPolicy) {
      throw new Error(`Policy not found: ${policyId}`)
    }

    // Increment version
    const versionParts = existingPolicy.version.split('.').map(Number)
    versionParts[1]++ // Increment minor version
    const newVersion = versionParts.join('.')

    const updatedPolicy: AnonymizationPolicy = {
      ...existingPolicy,
      ...updates,
      id: policyId,
      version: newVersion,
      updatedBy,
      updatedAt: new Date()
    }

    // Validate updated policy
    this.validatePolicy(updatedPolicy)

    // Store updated policy
    this.policies.set(policyId, updatedPolicy)

    // Clear related caches
    this.clearRelatedCaches(updatedPolicy)

    return updatedPolicy
  }

  /**
   * Evaluate anonymization policy for given context
   */
  async evaluatePolicy(context: PolicyEvaluationContext): Promise<PolicyEvaluationResult> {
    // Check cache first
    if (this.config.enableCaching) {
      const cacheKey = this.createCacheKey(context)
      const cachedResult = this.evaluationCache.get(cacheKey)
      if (cachedResult) {
        return cachedResult
      }
    }

    // Get applicable policies in inheritance order
    const applicablePolicies = await this.getApplicablePolicies(context)
    
    if (applicablePolicies.length === 0) {
      throw new Error('No applicable anonymization policies found')
    }

    // Evaluate policies in priority order
    const result = this.evaluatePolicyChain(applicablePolicies, context)

    // Cache result
    if (this.config.enableCaching) {
      const cacheKey = this.createCacheKey(context)
      this.evaluationCache.set(cacheKey, result)
      
      // Clean cache if too large
      if (this.evaluationCache.size > this.config.cacheSize) {
        this.cleanEvaluationCache()
      }
    }

    return result
  }

  /**
   * Get applicable policies based on context and inheritance
   */
  private async getApplicablePolicies(context: PolicyEvaluationContext): Promise<AnonymizationPolicy[]> {
    const cacheKey = `policies:${context.userId}:${context.organizationId}:${context.teamId}`
    
    if (this.config.enableInheritance && this.inheritanceCache.has(cacheKey)) {
      return this.inheritanceCache.get(cacheKey)!
    }

    const policies: AnonymizationPolicy[] = []

    // Collect policies based on inheritance order
    for (const scope of this.config.inheritanceOrder) {
      const scopePolicies = this.getPoliciesByScope(scope, context)
      policies.push(...scopePolicies)
    }

    // Filter and sort by priority
    const applicablePolicies = policies
      .filter(policy => this.isPolicyApplicable(policy, context))
      .sort((a, b) => b.priority - a.priority)

    // Cache for future use
    if (this.config.enableInheritance) {
      this.inheritanceCache.set(cacheKey, applicablePolicies)
    }

    return applicablePolicies
  }

  /**
   * Get policies by scope
   */
  private getPoliciesByScope(scope: PolicyScope, context: PolicyEvaluationContext): AnonymizationPolicy[] {
    return Array.from(this.policies.values()).filter(policy => {
      if (policy.scope !== scope || !policy.enabled) return false
      
      switch (scope) {
        case 'global':
          return true
        case 'organization':
          return policy.organizationId === context.organizationId
        case 'team':
          return policy.teamId === context.teamId
        case 'user':
          return policy.userId === context.userId
        default:
          return false
      }
    })
  }

  /**
   * Check if policy is applicable to context
   */
  private isPolicyApplicable(policy: AnonymizationPolicy, context: PolicyEvaluationContext): boolean {
    // Check effective dates
    const now = context.timestamp || new Date()
    if (now < policy.effectiveDate) return false
    if (policy.expirationDate && now > policy.expirationDate) return false

    // Check data classification
    if (policy.dataClassifications.length > 0 && 
        !policy.dataClassifications.includes(context.dataClassification)) {
      return false
    }

    return true
  }

  /**
   * Evaluate policy chain and determine best rule
   */
  private evaluatePolicyChain(
    policies: AnonymizationPolicy[],
    context: PolicyEvaluationContext
  ): PolicyEvaluationResult {
    let bestMatch: { policy: AnonymizationPolicy; rule: AnonymizationRule; score: number } | null = null
    const reasoning: string[] = []

    for (const policy of policies) {
      const ruleEvaluation = this.evaluateRulesInPolicy(policy, context)
      
      if (ruleEvaluation) {
        reasoning.push(`Policy '${policy.name}' (${policy.scope}) - Rule '${ruleEvaluation.rule.name}' matched with score ${ruleEvaluation.score}`)
        
        if (!bestMatch || ruleEvaluation.score > bestMatch.score) {
          bestMatch = ruleEvaluation
        }
      }
    }

    if (!bestMatch) {
      throw new Error('No matching anonymization rules found')
    }

    const { policy, rule } = bestMatch
    
    return {
      policy,
      rule,
      shouldAnonymize: rule.enabled,
      technique: rule.technique,
      strength: rule.strength,
      reversible: rule.reversible,
      config: rule.config,
      reasoning,
      confidence: bestMatch.score
    }
  }

  /**
   * Evaluate rules within a policy
   */
  private evaluateRulesInPolicy(
    policy: AnonymizationPolicy,
    context: PolicyEvaluationContext
  ): { policy: AnonymizationPolicy; rule: AnonymizationRule; score: number } | null {
    // Sort rules by priority
    const sortedRules = [...policy.rules].sort((a, b) => b.priority - a.priority)
    
    for (const rule of sortedRules) {
      const score = this.evaluateRule(rule, context)
      
      if (score > 0) {
        return { policy, rule, score }
      }
    }

    // Fall back to default rule if no specific rule matches
    if (policy.defaultRule) {
      const score = this.evaluateRule(policy.defaultRule, context)
      if (score > 0) {
        return { policy, rule: policy.defaultRule, score }
      }
    }

    return null
  }

  /**
   * Evaluate individual rule against context
   */
  private evaluateRule(rule: AnonymizationRule, context: PolicyEvaluationContext): number {
    if (!rule.enabled) return 0

    let score = 0
    let totalConditions = 0

    // Check field match
    if (rule.field === context.field) {
      score += 10
    } else if (rule.field === '*' || rule.field === 'any') {
      score += 1
    } else {
      return 0 // Field must match
    }

    // Check PII types
    const piiMatches = rule.piiTypes.filter(type => context.piiTypes.includes(type))
    if (piiMatches.length > 0) {
      score += piiMatches.length * 5
    }

    // Evaluate conditions
    for (const condition of rule.conditions) {
      totalConditions++
      
      if (this.evaluateCondition(condition, context)) {
        score += 3
      } else {
        score -= 2 // Penalty for failed conditions
      }
    }

    // Normalize score based on condition count
    if (totalConditions > 0) {
      score = score / Math.max(1, totalConditions * 0.5)
    }

    return Math.max(0, score)
  }

  /**
   * Evaluate individual condition
   */
  private evaluateCondition(condition: AnonymizationCondition, context: PolicyEvaluationContext): boolean {
    const contextValue = this.getContextValue(condition.type, context)
    
    switch (condition.operator) {
      case 'equals':
        return contextValue === condition.value

      case 'not_equals':
        return contextValue !== condition.value

      case 'in':
        return Array.isArray(condition.value) && condition.value.includes(contextValue)

      case 'not_in':
        return Array.isArray(condition.value) && !condition.value.includes(contextValue)

      case 'greater':
        return typeof contextValue === 'number' && contextValue > condition.value

      case 'less':
        return typeof contextValue === 'number' && contextValue < condition.value

      case 'matches':
        return new RegExp(condition.value).test(String(contextValue))

      case 'custom':
        // Custom condition evaluation logic would go here
        return this.evaluateCustomCondition(condition, context)

      default:
        return false
    }
  }

  /**
   * Get context value for condition evaluation
   */
  private getContextValue(type: string, context: PolicyEvaluationContext): any {
    switch (type) {
      case 'role':
        return context.userRole
      case 'classification':
        return context.dataClassification
      case 'time':
        return context.timestamp
      case 'location':
        return context.location
      case 'context':
        return context.purpose
      default:
        return context.metadata?.[type]
    }
  }

  /**
   * Evaluate custom condition (extensible)
   */
  private evaluateCustomCondition(_condition: AnonymizationCondition, _context: PolicyEvaluationContext): boolean {
    // This would be extended with custom business logic
    return true
  }

  /**
   * Validate policy structure and rules
   */
  private validatePolicy(policy: AnonymizationPolicy): void {
    if (!policy.name || policy.name.trim().length === 0) {
      throw new Error('Policy name is required')
    }

    if (!policy.rules || policy.rules.length === 0) {
      throw new Error('Policy must have at least one rule')
    }

    // Validate each rule
    for (const rule of policy.rules) {
      this.validateRule(rule)
    }

    // Validate default rule if present
    if (policy.defaultRule) {
      this.validateRule(policy.defaultRule)
    }
  }

  /**
   * Validate individual rule
   */
  private validateRule(rule: AnonymizationRule): void {
    if (!rule.name || rule.name.trim().length === 0) {
      throw new Error('Rule name is required')
    }

    if (!rule.field) {
      throw new Error('Rule field is required')
    }

    if (!rule.technique) {
      throw new Error('Rule technique is required')
    }

    // Validate conditions
    for (const condition of rule.conditions) {
      if (!condition.type || !condition.operator) {
        throw new Error('Condition type and operator are required')
      }
    }
  }

  /**
   * Initialize default policies
   */
  private initializeDefaultPolicies(): void {
    // GDPR Compliance Policy
    const gdprPolicy: AnonymizationPolicy = {
      id: 'gdpr-default',
      name: 'GDPR Default Policy',
      description: 'Default anonymization policy for GDPR compliance',
      version: '1.0.0',
      scope: 'global',
      enabled: true,
      priority: 100,
      inheritanceEnabled: true,
      overrideAllowed: true,
      rules: [
        {
          id: 'gdpr-phone-rule',
          name: 'Phone Number Anonymization',
          description: 'Anonymize phone numbers for GDPR compliance',
          field: 'number',
          dataType: 'string',
          piiTypes: ['phone_number'],
          technique: 'masking',
          strength: 'medium',
          reversible: true,
          conditions: [
            {
              type: 'classification',
              operator: 'in',
              value: ['confidential', 'restricted']
            }
          ],
          config: {
            preserveCountryCode: true,
            preserveAreaCode: false,
            preserveLastDigits: 4,
            maskCharacter: '*'
          },
          enabled: true,
          priority: 10
        },
        {
          id: 'gdpr-content-rule',
          name: 'Content PII Anonymization',
          description: 'Anonymize PII in message content',
          field: 'content',
          dataType: 'string',
          piiTypes: ['person_name', 'email_address', 'address'],
          technique: 'suppression',
          strength: 'high',
          reversible: false,
          conditions: [
            {
              type: 'role',
              operator: 'in',
              value: ['viewer', 'member']
            }
          ],
          config: {
            replacement: '[REDACTED]'
          },
          enabled: true,
          priority: 5
        }
      ],
      complianceFrameworks: ['gdpr'],
      dataClassifications: ['confidential', 'restricted'],
      retentionPeriod: 86400 * 365 * 7, // 7 years
      auditRequired: true,
      createdBy: 'system',
      createdAt: new Date(),
      effectiveDate: new Date(),
      metadata: {
        source: 'system_default',
        compliance: 'gdpr'
      }
    }

    this.policies.set(gdprPolicy.id, gdprPolicy)
  }

  /**
   * Utility methods
   */
  private generatePolicyId(name: string, scope: PolicyScope): string {
    const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, '-')
    return `${scope}-${normalized}-${Date.now()}`
  }

  private createCacheKey(context: PolicyEvaluationContext): string {
    return [
      context.userId,
      context.userRole,
      context.organizationId || 'none',
      context.teamId || 'none',
      context.dataClassification,
      context.field,
      context.piiTypes.join(',')
    ].join(':')
  }

  private clearRelatedCaches(policy: AnonymizationPolicy): void {
    // Clear evaluation cache
    this.evaluationCache.clear()
    
    // Clear inheritance cache for related scopes
    const keysToDelete: string[] = []
    for (const key of Array.from(this.inheritanceCache.keys())) {
      if (this.isCacheKeyRelated(key, policy)) {
        keysToDelete.push(key)
      }
    }
    
    keysToDelete.forEach(key => this.inheritanceCache.delete(key))
  }

  private isCacheKeyRelated(cacheKey: string, policy: AnonymizationPolicy): boolean {
    const parts = cacheKey.split(':')
    
    switch (policy.scope) {
      case 'organization':
        return parts[1] === policy.organizationId
      case 'team':
        return parts[2] === policy.teamId
      case 'user':
        return parts[0] === policy.userId
      case 'global':
        return true
      default:
        return false
    }
  }

  private cleanEvaluationCache(): void {
    // Remove oldest entries to maintain cache size
    const entries = Array.from(this.evaluationCache.entries())
    const toDelete = entries.slice(0, entries.length - this.config.cacheSize + 100)
    
    toDelete.forEach(([key]) => this.evaluationCache.delete(key))
  }

  /**
   * Public API methods
   */
  
  /**
   * Get all policies
   */
  getAllPolicies(): AnonymizationPolicy[] {
    return Array.from(this.policies.values())
  }

  /**
   * Get policy by ID
   */
  getPolicy(policyId: string): AnonymizationPolicy | null {
    return this.policies.get(policyId) || null
  }

  /**
   * Delete policy
   */
  async deletePolicy(policyId: string): Promise<boolean> {
    const policy = this.policies.get(policyId)
    if (!policy) return false

    this.policies.delete(policyId)
    this.clearRelatedCaches(policy)
    
    return true
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    totalPolicies: number
    policiesByScope: Record<PolicyScope, number>
    totalRules: number
    cacheHitRate: number
    config: PolicyManagerConfig
  } {
    const policiesByScope: Record<PolicyScope, number> = {
      global: 0,
      organization: 0,
      team: 0,
      user: 0
    }

    let totalRules = 0

    for (const policy of Array.from(this.policies.values())) {
      policiesByScope[policy.scope as keyof typeof policiesByScope]++
      totalRules += policy.rules.length + (policy.defaultRule ? 1 : 0)
    }

    return {
      totalPolicies: this.policies.size,
      policiesByScope,
      totalRules,
      cacheHitRate: 0, // Would be calculated from actual cache hits/misses
      config: { ...this.config }
    }
  }
}

// Export singleton instance
export const anonymizationPolicyManager = new AnonymizationPolicyManager()
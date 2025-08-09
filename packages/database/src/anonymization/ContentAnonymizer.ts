// Content Anonymization for Call/SMS Intelligence Platform
// Provides SMS/call content anonymization with PII detection and context-aware replacement

import { PIIDetector, piiDetector } from '../../../shared/src/anonymization/PIIDetector'
import { TokenManager, tokenManager } from '../../../shared/src/anonymization/TokenManager'
import type { PIIType, PIIMatch, PIIDetectionResult } from '../../../shared/src/anonymization/PIIDetector'
import type { AuditLogInsert } from '../types'
import { supabaseAdmin } from '../client'
import crypto from 'crypto'

export interface ContentAnonymizationConfig {
  // PII detection settings
  enabledPIITypes: PIIType[]
  confidenceThreshold: number
  contextWindow: number
  
  // Anonymization strategies
  defaultReplacementStrategy: 'suppression' | 'tokenization' | 'generalization'
  preserveConversationFlow: boolean
  maintainMessageLength: boolean
  
  // Tokenization settings
  useConsistentTokens: boolean
  tokenFormat: 'placeholder' | 'pseudonym' | 'generic'
  
  // Context preservation
  preserveEmotions: boolean
  preserveQuestions: boolean
  preserveSentiment: boolean
  
  // Quality settings
  minQualityScore: number
  validateResults: boolean
  
  // Audit settings
  auditAllOperations: boolean
  includeOriginalHash: boolean
}

export interface ContentAnonymizationResult {
  originalContent: string
  anonymizedContent: string
  piiMatches: PIIMatch[]
  technique: string
  qualityScore: number
  preservationMetrics: {
    lengthRatio: number
    sentimentPreserved: boolean
    structurePreserved: boolean
    contextPreserved: boolean
  }
  reversible: boolean
  processingTime: number
  metadata: Record<string, any>
}

export interface ConversationContext {
  conversationId?: string
  messageIndex?: number
  participants: string[]
  timeframe: { start: Date; end: Date }
  messageType: 'sms' | 'call_transcript'
  direction: 'inbound' | 'outbound'
}

export class ContentAnonymizer {
  private config: ContentAnonymizationConfig
  private piiDetector: PIIDetector
  private tokenManager: TokenManager
  private conversationContexts = new Map<string, ConversationContext>()
  private entityMappings = new Map<string, string>()

  constructor(config: Partial<ContentAnonymizationConfig> = {}) {
    this.config = {
      enabledPIITypes: [
        'person_name',
        'phone_number',
        'email_address',
        'address',
        'ssn',
        'credit_card'
      ],
      confidenceThreshold: 0.7,
      contextWindow: 20,
      defaultReplacementStrategy: 'tokenization',
      preserveConversationFlow: true,
      maintainMessageLength: false,
      useConsistentTokens: true,
      tokenFormat: 'pseudonym',
      preserveEmotions: true,
      preserveQuestions: true,
      preserveSentiment: true,
      minQualityScore: 0.6,
      validateResults: true,
      auditAllOperations: true,
      includeOriginalHash: true,
      ...config
    }

    this.piiDetector = piiDetector
    this.tokenManager = tokenManager
  }

  /**
   * Anonymize message content with context awareness
   */
  async anonymizeContent(
    content: string,
    userId: string,
    context?: ConversationContext
  ): Promise<ContentAnonymizationResult> {
    const startTime = Date.now()

    if (!content || content.trim().length === 0) {
      return this.createEmptyResult(content, startTime)
    }

    try {
      // Step 1: Detect PII in content
      const piiResult = await this.detectPII(content)
      
      // Step 2: Apply anonymization strategies
      const anonymizedResult = await this.applyAnonymizationStrategies(
        content,
        piiResult.matches,
        userId,
        context
      )

      // Step 3: Calculate quality and preservation metrics
      const qualityScore = this.calculateQualityScore(content, anonymizedResult.content, piiResult)
      const preservationMetrics = this.calculatePreservationMetrics(content, anonymizedResult.content)

      // Step 4: Validate results if enabled
      if (this.config.validateResults) {
        this.validateAnonymizationResult(content, anonymizedResult.content, piiResult.matches)
      }

      const processingTime = Date.now() - startTime

      const result: ContentAnonymizationResult = {
        originalContent: content,
        anonymizedContent: anonymizedResult.content,
        piiMatches: piiResult.matches,
        technique: this.config.defaultReplacementStrategy,
        qualityScore,
        preservationMetrics,
        reversible: anonymizedResult.reversible,
        processingTime,
        metadata: {
          originalHash: this.config.includeOriginalHash ? 
            crypto.createHash('sha256').update(content).digest('hex').substring(0, 16) : undefined,
          piiDetectionTime: piiResult.processingTime,
          tokensUsed: anonymizedResult.tokensUsed,
          contextId: context?.conversationId
        }
      }

      // Audit logging
      if (this.config.auditAllOperations) {
        await this.logContentAnonymization(userId, result)
      }

      return result

    } catch (error) {
      throw new Error(`Content anonymization failed: ${(error as Error).message}`)
    }
  }

  /**
   * Detect PII in content using configured detector
   */
  private async detectPII(content: string): Promise<PIIDetectionResult> {
    // Update PII detector configuration
    this.piiDetector.updateConfig({
      enabledTypes: this.config.enabledPIITypes,
      confidenceThreshold: this.config.confidenceThreshold,
      contextWindow: this.config.contextWindow
    })

    return await this.piiDetector.detectAndAnonymize(content)
  }

  /**
   * Apply anonymization strategies to detected PII
   */
  private async applyAnonymizationStrategies(
    content: string,
    piiMatches: PIIMatch[],
    userId: string,
    context?: ConversationContext
  ): Promise<{ content: string; reversible: boolean; tokensUsed: number }> {
    if (piiMatches.length === 0) {
      return { content, reversible: false, tokensUsed: 0 }
    }

    let anonymizedContent = content
    let reversible = false
    let tokensUsed = 0
    let offsetAdjustment = 0

    // Process matches in reverse order to maintain indices
    const sortedMatches = [...piiMatches].sort((a, b) => b.startIndex - a.startIndex)

    for (const match of sortedMatches) {
      const strategy = this.selectAnonymizationStrategy(match, context)
      const replacement = await this.generateReplacement(match, strategy, userId, context)

      // Apply replacement
      const adjustedStart = match.startIndex + offsetAdjustment
      const adjustedEnd = match.endIndex + offsetAdjustment
      
      const before = anonymizedContent.substring(0, adjustedStart)
      const after = anonymizedContent.substring(adjustedEnd)
      
      anonymizedContent = before + replacement.text + after
      
      // Update offset for next replacements
      offsetAdjustment += replacement.text.length - (adjustedEnd - adjustedStart)
      
      if (replacement.reversible) {
        reversible = true
      }
      
      if (replacement.tokenUsed) {
        tokensUsed++
      }
    }

    // Apply post-processing for conversation flow preservation
    if (this.config.preserveConversationFlow && context) {
      anonymizedContent = this.preserveConversationFlow(anonymizedContent, content, context)
    }

    return { content: anonymizedContent, reversible, tokensUsed }
  }

  /**
   * Select appropriate anonymization strategy for PII match
   */
  private selectAnonymizationStrategy(
    match: PIIMatch,
    context?: ConversationContext
  ): 'suppression' | 'tokenization' | 'generalization' {
    // Use context to make intelligent strategy decisions
    switch (match.type) {
      case 'person_name':
        // Use tokenization for names to maintain conversation flow
        return this.config.useConsistentTokens ? 'tokenization' : 'suppression'
        
      case 'phone_number':
      case 'email_address':
        // Always suppress contact information for privacy
        return 'suppression'
        
      case 'address':
        // Generalize addresses to city level
        return 'generalization'
        
      case 'ssn':
      case 'credit_card':
        // Always suppress sensitive financial/identity information
        return 'suppression'
        
      default:
        return this.config.defaultReplacementStrategy
    }
  }

  /**
   * Generate replacement text for PII match
   */
  private async generateReplacement(
    match: PIIMatch,
    strategy: 'suppression' | 'tokenization' | 'generalization',
    userId: string,
    context?: ConversationContext
  ): Promise<{ text: string; reversible: boolean; tokenUsed: boolean }> {
    switch (strategy) {
      case 'suppression':
        return {
          text: this.generateSuppressionReplacement(match),
          reversible: false,
          tokenUsed: false
        }

      case 'tokenization':
        const tokenResult = await this.generateTokenizationReplacement(match, userId, context)
        return {
          text: tokenResult.token,
          reversible: tokenResult.reversible,
          tokenUsed: true
        }

      case 'generalization':
        return {
          text: this.generateGeneralizationReplacement(match),
          reversible: false,
          tokenUsed: false
        }

      default:
        return {
          text: '[REDACTED]',
          reversible: false,
          tokenUsed: false
        }
    }
  }

  /**
   * Generate suppression replacement
   */
  private generateSuppressionReplacement(match: PIIMatch): string {
    const replacements = {
      person_name: '[NAME]',
      phone_number: '[PHONE]',
      email_address: '[EMAIL]',
      address: '[ADDRESS]',
      ssn: '[SSN]',
      credit_card: '[CREDIT_CARD]',
      date_of_birth: '[DATE]',
      driver_license: '[ID]',
      passport: '[PASSPORT]',
      bank_account: '[ACCOUNT]',
      ip_address: '[IP]',
      custom: '[REDACTED]'
    }

    let replacement = replacements[match.type] || '[REDACTED]'

    // Maintain approximate length if requested
    if (this.config.maintainMessageLength) {
      const originalLength = match.value.length
      const replacementLength = replacement.length
      
      if (originalLength > replacementLength) {
        const padding = '*'.repeat(originalLength - replacementLength)
        replacement = replacement.slice(0, -1) + padding + replacement.slice(-1)
      }
    }

    return replacement
  }

  /**
   * Generate tokenization replacement
   */
  private async generateTokenizationReplacement(
    match: PIIMatch,
    userId: string,
    context?: ConversationContext
  ): Promise<{ token: string; reversible: boolean }> {
    const tokenConfig = {
      format: this.config.tokenFormat === 'pseudonym' ? 'alphanumeric' as const : 'uuid' as const,
      length: this.config.tokenFormat === 'pseudonym' ? 8 : undefined,
      caseSensitive: false
    }

    switch (match.type) {
      case 'person_name':
        return await this.generateNameToken(match.value, userId, tokenConfig, context)
        
      case 'phone_number':
        // Use consistent phone number tokens
        const phoneResult = await this.tokenManager.generateToken(match.value, {
          ...tokenConfig,
          format: 'numeric',
          length: 10,
          preserveFormat: true
        }, userId)
        return { token: `[PHONE-${phoneResult.token.substring(0, 6)}]`, reversible: false }
        
      default:
        const result = await this.tokenManager.generateToken(match.value, tokenConfig, userId)
        return { token: result.token, reversible: result.reversible }
    }
  }

  /**
   * Generate name token with context awareness
   */
  private async generateNameToken(
    name: string,
    userId: string,
    tokenConfig: any,
    context?: ConversationContext
  ): Promise<{ token: string; reversible: boolean }> {
    // Check for existing mapping in current conversation
    if (context?.conversationId) {
      const existingMapping = this.entityMappings.get(`${context.conversationId}:${name}`)
      if (existingMapping) {
        return { token: existingMapping, reversible: false }
      }
    }

    // Generate pseudonym based on token format
    let pseudonym: string
    
    if (this.config.tokenFormat === 'pseudonym') {
      pseudonym = this.generateRealisticPseudonym(name)
    } else {
      const result = await this.tokenManager.generateToken(name, tokenConfig, userId)
      pseudonym = `[${result.token}]`
    }

    // Store mapping for consistency within conversation
    if (context?.conversationId) {
      this.entityMappings.set(`${context.conversationId}:${name}`, pseudonym)
    }

    return { token: pseudonym, reversible: false }
  }

  /**
   * Generate realistic pseudonym for names
   */
  private generateRealisticPseudonym(originalName: string): string {
    // Simple pseudonym generation - in production would use more sophisticated approach
    const firstNames = ['Alex', 'Jordan', 'Taylor', 'Casey', 'Riley', 'Morgan', 'Avery', 'Quinn']
    const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis']
    
    const hash = crypto.createHash('md5').update(originalName).digest('hex')
    const firstIndex = parseInt(hash.substring(0, 2), 16) % firstNames.length
    const lastIndex = parseInt(hash.substring(2, 4), 16) % lastNames.length
    
    const nameParts = originalName.trim().split(/\s+/)
    
    if (nameParts.length === 1) {
      return firstNames[firstIndex]
    } else {
      return `${firstNames[firstIndex]} ${lastNames[lastIndex]}`
    }
  }

  /**
   * Generate generalization replacement
   */
  private generateGeneralizationReplacement(match: PIIMatch): string {
    switch (match.type) {
      case 'address':
        // Generalize to city/state level
        const addressParts = match.value.split(',').map(p => p.trim())
        if (addressParts.length >= 2) {
          return addressParts.slice(-2).join(', ') // Keep city, state
        }
        return '[CITY, STATE]'
        
      case 'date_of_birth':
        // Generalize to year only
        const dateMatch = match.value.match(/\b(19|20)\d{2}\b/)
        if (dateMatch) {
          return dateMatch[0] // Just the year
        }
        return '[YEAR]'
        
      default:
        return this.generateSuppressionReplacement(match)
    }
  }

  /**
   * Preserve conversation flow and natural language patterns
   */
  private preserveConversationFlow(
    anonymizedContent: string,
    originalContent: string,
    context: ConversationContext
  ): string {
    let result = anonymizedContent

    // Preserve questions
    if (this.config.preserveQuestions && originalContent.includes('?')) {
      if (!result.includes('?')) {
        // Try to restore question structure
        const questionWords = ['what', 'where', 'when', 'who', 'why', 'how', 'is', 'are', 'do', 'did', 'can', 'will']
        const hasQuestionWord = questionWords.some(word => 
          originalContent.toLowerCase().includes(word.toLowerCase())
        )
        
        if (hasQuestionWord && !result.endsWith('?')) {
          result = result.replace(/[.!]$/, '?')
        }
      }
    }

    // Preserve emotional indicators
    if (this.config.preserveEmotions) {
      const emotionMarkers = ['!', '...', '!!', '???']
      for (const marker of emotionMarkers) {
        if (originalContent.includes(marker) && !result.includes(marker)) {
          result = result.replace(/[.?]$/, marker)
        }
      }
    }

    return result
  }

  /**
   * Calculate quality score for anonymization
   */
  private calculateQualityScore(
    original: string,
    anonymized: string,
    piiResult: PIIDetectionResult
  ): number {
    let score = 1.0

    // Penalize for length changes if preservation is enabled
    if (this.config.maintainMessageLength) {
      const lengthRatio = anonymized.length / original.length
      if (Math.abs(lengthRatio - 1.0) > 0.2) {
        score -= 0.2
      }
    }

    // Reward for maintaining structure
    const originalWords = original.split(/\s+/).length
    const anonymizedWords = anonymized.split(/\s+/).length
    const wordRatio = anonymizedWords / originalWords
    
    if (Math.abs(wordRatio - 1.0) < 0.1) {
      score += 0.1
    }

    // Consider PII detection confidence
    score = score * piiResult.confidenceScore

    // Ensure score is within bounds
    return Math.max(0, Math.min(1, score))
  }

  /**
   * Calculate preservation metrics
   */
  private calculatePreservationMetrics(
    original: string,
    anonymized: string
  ): ContentAnonymizationResult['preservationMetrics'] {
    return {
      lengthRatio: anonymized.length / original.length,
      sentimentPreserved: this.isSentimentPreserved(original, anonymized),
      structurePreserved: this.isStructurePreserved(original, anonymized),
      contextPreserved: this.isContextPreserved(original, anonymized)
    }
  }

  /**
   * Check if sentiment is preserved (simplified implementation)
   */
  private isSentimentPreserved(original: string, anonymized: string): boolean {
    // Simple sentiment indicators
    const positiveIndicators = ['!', 'good', 'great', 'awesome', 'love', 'happy', 'yes']
    const negativeIndicators = [':(', 'bad', 'terrible', 'hate', 'sad', 'no', 'never']
    
    const originalPositive = positiveIndicators.some(indicator => 
      original.toLowerCase().includes(indicator.toLowerCase())
    )
    const anonymizedPositive = positiveIndicators.some(indicator => 
      anonymized.toLowerCase().includes(indicator.toLowerCase())
    )
    
    const originalNegative = negativeIndicators.some(indicator => 
      original.toLowerCase().includes(indicator.toLowerCase())
    )
    const anonymizedNegative = negativeIndicators.some(indicator => 
      anonymized.toLowerCase().includes(indicator.toLowerCase())
    )
    
    return (originalPositive === anonymizedPositive) && (originalNegative === anonymizedNegative)
  }

  /**
   * Check if structure is preserved
   */
  private isStructurePreserved(original: string, anonymized: string): boolean {
    const originalSentences = original.split(/[.!?]+/).filter(s => s.trim().length > 0).length
    const anonymizedSentences = anonymized.split(/[.!?]+/).filter(s => s.trim().length > 0).length
    
    return Math.abs(originalSentences - anonymizedSentences) <= 1
  }

  /**
   * Check if context is preserved
   */
  private isContextPreserved(original: string, anonymized: string): boolean {
    // Check if key context words are preserved
    const contextWords = ['meeting', 'appointment', 'call', 'text', 'message', 'today', 'tomorrow', 'yesterday']
    
    let preserved = 0
    let total = 0
    
    for (const word of contextWords) {
      if (original.toLowerCase().includes(word)) {
        total++
        if (anonymized.toLowerCase().includes(word)) {
          preserved++
        }
      }
    }
    
    return total === 0 || (preserved / total) >= 0.7
  }

  /**
   * Validate anonymization result
   */
  private validateAnonymizationResult(
    original: string,
    anonymized: string,
    piiMatches: PIIMatch[]
  ): void {
    // Check that all high-confidence PII has been removed
    for (const match of piiMatches) {
      if (match.confidence >= 0.9 && anonymized.includes(match.value)) {
        throw new Error(`High-confidence PII not properly anonymized: ${match.type}`)
      }
    }

    // Check minimum quality score
    // This would involve more sophisticated validation in practice
  }

  /**
   * Create empty result for empty/null content
   */
  private createEmptyResult(content: string, startTime: number): ContentAnonymizationResult {
    return {
      originalContent: content,
      anonymizedContent: content,
      piiMatches: [],
      technique: 'none',
      qualityScore: 1.0,
      preservationMetrics: {
        lengthRatio: 1.0,
        sentimentPreserved: true,
        structurePreserved: true,
        contextPreserved: true
      },
      reversible: false,
      processingTime: Date.now() - startTime,
      metadata: {}
    }
  }

  /**
   * Log content anonymization for audit trail
   */
  private async logContentAnonymization(
    userId: string,
    result: ContentAnonymizationResult
  ): Promise<void> {
    try {
      const auditLog: AuditLogInsert = {
        actor_id: userId,
        action: 'content.anonymize',
        resource: 'message_content',
        resource_id: result.metadata.originalHash || 'unknown',
        metadata: {
          technique: result.technique,
          piiMatchesCount: result.piiMatches.length,
          piiTypes: [...new Set(result.piiMatches.map(m => m.type))],
          qualityScore: result.qualityScore,
          reversible: result.reversible,
          processingTime: result.processingTime,
          preservationMetrics: result.preservationMetrics
        },
        ts: new Date().toISOString()
      }

      await supabaseAdmin.from('audit_log').insert(auditLog)
    } catch (error) {
      console.error('Failed to log content anonymization event:', error)
    }
  }

  /**
   * Batch anonymize multiple content pieces
   */
  async batchAnonymizeContent(
    contents: string[],
    userId: string,
    context?: ConversationContext
  ): Promise<ContentAnonymizationResult[]> {
    const results: ContentAnonymizationResult[] = []
    
    for (const content of contents) {
      try {
        const result = await this.anonymizeContent(content, userId, context)
        results.push(result)
      } catch (error) {
        console.error(`Failed to anonymize content: ${error}`)
        results.push(this.createErrorResult(content, (error as Error).message))
      }
    }
    
    return results
  }

  /**
   * Create error result for failed anonymization
   */
  private createErrorResult(content: string, error: string): ContentAnonymizationResult {
    return {
      originalContent: content,
      anonymizedContent: content, // Fallback to original
      piiMatches: [],
      technique: 'error',
      qualityScore: 0,
      preservationMetrics: {
        lengthRatio: 1.0,
        sentimentPreserved: false,
        structurePreserved: false,
        contextPreserved: false
      },
      reversible: false,
      processingTime: 0,
      metadata: { error }
    }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<ContentAnonymizationConfig>): void {
    this.config = { ...this.config, ...newConfig }
  }

  /**
   * Clear conversation contexts and entity mappings
   */
  clearContexts(): void {
    this.conversationContexts.clear()
    this.entityMappings.clear()
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    conversationContexts: number
    entityMappings: number
    config: ContentAnonymizationConfig
  } {
    return {
      conversationContexts: this.conversationContexts.size,
      entityMappings: this.entityMappings.size,
      config: { ...this.config }
    }
  }
}

// Export singleton instance
export const contentAnonymizer = new ContentAnonymizer()
// Token Management for Call/SMS Intelligence Platform
// Provides consistent pseudonymization and reversible tokenization with secure key management

import * as crypto from 'crypto'

export type TokenFormat = 'uuid' | 'numeric' | 'alphanumeric' | 'hash' | 'encrypted' | 'format_preserving'

export interface TokenConfig {
  format: TokenFormat
  length?: number
  prefix?: string
  suffix?: string
  preserveFormat?: boolean
  caseSensitive?: boolean
  includeChecksum?: boolean
  keyId?: string
}

export interface TokenMapping {
  id: string
  originalValue: string
  tokenValue: string
  format: TokenFormat
  reversible: boolean
  createdAt: Date
  lastUsed: Date
  usageCount: number
  metadata: Record<string, any>
}

export interface TokenGenerationResult {
  token: string
  mapping: TokenMapping
  isNew: boolean
  reversible: boolean
}

export interface TokenManagerConfig {
  // Storage settings
  enablePersistence: boolean
  maxMappings: number
  ttlSeconds: number
  
  // Security settings
  enableEncryption: boolean
  keyRotationInterval: number
  defaultKeyId: string
  
  // Consistency settings
  enforceConsistency: boolean
  caseSensitive: boolean
  
  // Performance settings
  cacheSize: number
  batchSize: number
  
  // Audit settings
  enableAuditing: boolean
  auditSensitiveOperations: boolean
}

export class TokenManager {
  private config: TokenManagerConfig
  private tokenMappings = new Map<string, TokenMapping>()
  private reverseTokenMappings = new Map<string, TokenMapping>()
  private encryptionKeys = new Map<string, Buffer>()
  private keyUsageCounter = new Map<string, number>()
  private cleanupInterval?: NodeJS.Timeout

  constructor(config: Partial<TokenManagerConfig> = {}) {
    this.config = {
      enablePersistence: true,
      maxMappings: 100000,
      ttlSeconds: 86400 * 30, // 30 days
      enableEncryption: true,
      keyRotationInterval: 86400 * 7, // 7 days
      defaultKeyId: 'default',
      enforceConsistency: true,
      caseSensitive: true,
      cacheSize: 10000,
      batchSize: 1000,
      enableAuditing: true,
      auditSensitiveOperations: true,
      ...config
    }

    // Start cleanup interval
    this.startCleanupInterval()
  }

  /**
   * Generate or retrieve consistent token for a value
   */
  async generateToken(
    originalValue: string,
    config: TokenConfig,
    userId?: string
  ): Promise<TokenGenerationResult> {
    const key = this.createMappingKey(originalValue, config)
    
    // Check for existing mapping if consistency is enforced
    if (this.config.enforceConsistency) {
      const existingMapping = this.tokenMappings.get(key)
      if (existingMapping) {
        existingMapping.lastUsed = new Date()
        existingMapping.usageCount++
        
        return {
          token: existingMapping.tokenValue,
          mapping: existingMapping,
          isNew: false,
          reversible: existingMapping.reversible
        }
      }
    }

    // Generate new token
    const token = await this.createToken(originalValue, config)
    const mappingId = crypto.randomUUID()
    
    const mapping: TokenMapping = {
      id: mappingId,
      originalValue,
      tokenValue: token,
      format: config.format,
      reversible: this.isReversibleFormat(config.format),
      createdAt: new Date(),
      lastUsed: new Date(),
      usageCount: 1,
      metadata: {
        config,
        userId,
        keyId: config.keyId || this.config.defaultKeyId
      }
    }

    // Store mappings
    this.tokenMappings.set(key, mapping)
    this.reverseTokenMappings.set(token, mapping)

    // Enforce cache size limits
    this.enforceCacheLimits()

    return {
      token,
      mapping,
      isNew: true,
      reversible: mapping.reversible
    }
  }

  /**
   * Create token based on configuration
   */
  private async createToken(originalValue: string, config: TokenConfig): Promise<string> {
    let token: string

    switch (config.format) {
      case 'uuid':
        token = crypto.randomUUID()
        break

      case 'numeric':
        token = this.generateNumericToken(originalValue, config)
        break

      case 'alphanumeric':
        token = this.generateAlphanumericToken(originalValue, config)
        break

      case 'hash':
        token = this.generateHashToken(originalValue, config)
        break

      case 'encrypted':
        token = await this.generateEncryptedToken(originalValue, config)
        break

      case 'format_preserving':
        token = await this.generateFormatPreservingToken(originalValue, config)
        break

      default:
        throw new Error(`Unsupported token format: ${config.format}`)
    }

    // Apply prefix and suffix if specified
    if (config.prefix) {
      token = config.prefix + token
    }
    if (config.suffix) {
      token = token + config.suffix
    }

    // Add checksum if requested
    if (config.includeChecksum) {
      const checksum = this.calculateChecksum(token)
      token = token + checksum
    }

    return token
  }

  /**
   * Generate numeric token
   */
  private generateNumericToken(originalValue: string, config: TokenConfig): string {
    const length = config.length || 10
    const digits = '0123456789'
    
    // Use hash of original value as seed for consistency
    const hash = crypto.createHash('sha256').update(originalValue).digest('hex')
    let token = ''
    
    for (let i = 0; i < length; i++) {
      const index = parseInt(hash.substring(i * 2, i * 2 + 2), 16) % digits.length
      token += digits[index]
    }
    
    return token
  }

  /**
   * Generate alphanumeric token
   */
  private generateAlphanumericToken(originalValue: string, config: TokenConfig): string {
    const length = config.length || 8
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    
    // Use hash for consistency
    const hash = crypto.createHash('sha256').update(originalValue).digest('hex')
    let token = ''
    
    for (let i = 0; i < length; i++) {
      const index = parseInt(hash.substring(i * 2, i * 2 + 2), 16) % chars.length
      token += chars[index]
    }
    
    return config.caseSensitive ? token : token.toLowerCase()
  }

  /**
   * Generate hash-based token
   */
  private generateHashToken(originalValue: string, config: TokenConfig): string {
    const algorithm = 'sha256'
    const hash = crypto.createHash(algorithm).update(originalValue).digest('hex')
    const length = config.length || 16
    
    return hash.substring(0, length)
  }

  /**
   * Generate encrypted token
   */
  private async generateEncryptedToken(originalValue: string, config: TokenConfig): Promise<string> {
    const keyId = config.keyId || this.config.defaultKeyId
    const key = await this.getEncryptionKey(keyId)
    
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
    
    let encrypted = cipher.update(originalValue, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    
    const authTag = cipher.getAuthTag()
    
    // Format: keyId:iv:encrypted:authTag
    return `${keyId}:${iv.toString('hex')}:${encrypted}:${authTag.toString('hex')}`
  }

  /**
   * Generate format-preserving token
   */
  private async generateFormatPreservingToken(originalValue: string, _config: TokenConfig): Promise<string> {
    // Maintain the structure and format of the original value
    // while replacing actual content with pseudonymized values
    
    let token = originalValue
    
    // Replace letters with consistent pseudonymized letters
    token = token.replace(/[a-zA-Z]/g, (match) => {
      const hash = crypto.createHash('md5').update(match + originalValue).digest('hex')
      const isUpperCase = match === match.toUpperCase()
      const letter = String.fromCharCode(97 + (parseInt(hash.substring(0, 2), 16) % 26))
      return isUpperCase ? letter.toUpperCase() : letter
    })
    
    // Replace digits with consistent pseudonymized digits
    token = token.replace(/[0-9]/g, (match) => {
      const hash = crypto.createHash('md5').update(match + originalValue).digest('hex')
      return String(parseInt(hash.substring(0, 2), 16) % 10)
    })
    
    return token
  }

  /**
   * Calculate checksum for token validation
   */
  private calculateChecksum(token: string): string {
    const hash = crypto.createHash('md5').update(token).digest('hex')
    return hash.substring(0, 4)
  }

  /**
   * Reverse token to original value (if reversible)
   */
  async reverseToken(token: string, _userId?: string): Promise<string | null> {
    // Remove checksum if present
    const cleanToken = this.removeChecksum(token)
    
    const mapping = this.reverseTokenMappings.get(cleanToken)
    if (!mapping) {
      return null
    }

    if (!mapping.reversible) {
      throw new Error('Token is not reversible')
    }

    // Handle encrypted tokens
    if (mapping.format === 'encrypted') {
      return await this.decryptToken(cleanToken, mapping.metadata.keyId)
    }

    // For other reversible formats, return original value from mapping
    mapping.lastUsed = new Date()
    mapping.usageCount++
    
    return mapping.originalValue
  }

  /**
   * Decrypt encrypted token
   */
  private async decryptToken(encryptedToken: string, keyId: string): Promise<string> {
    const parts = encryptedToken.split(':')
    if (parts.length !== 4) {
      throw new Error('Invalid encrypted token format')
    }

    const [tokenKeyId, ivHex, encrypted, authTagHex] = parts
    
    if (tokenKeyId !== keyId) {
      throw new Error('Key ID mismatch')
    }

    const key = await this.getEncryptionKey(keyId)
    const iv = Buffer.from(ivHex, 'hex')
    const authTag = Buffer.from(authTagHex, 'hex')
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(authTag)
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    
    return decrypted
  }

  /**
   * Remove checksum from token
   */
  private removeChecksum(token: string): string {
    // Simple checksum removal (last 4 characters)
    // In practice, this would be more sophisticated
    if (token.length > 4) {
      return token.substring(0, token.length - 4)
    }
    return token
  }

  /**
   * Check if token format is reversible
   */
  private isReversibleFormat(format: TokenFormat): boolean {
    return format === 'encrypted'
  }

  /**
   * Create mapping key for consistent lookups
   */
  private createMappingKey(originalValue: string, config: TokenConfig): string {
    const value = this.config.caseSensitive ? originalValue : originalValue.toLowerCase()
    const configKey = JSON.stringify({
      format: config.format,
      length: config.length,
      keyId: config.keyId
    })
    
    return crypto.createHash('sha256').update(value + configKey).digest('hex')
  }

  /**
   * Get or create encryption key
   */
  private async getEncryptionKey(keyId: string): Promise<Buffer> {
    if (this.encryptionKeys.has(keyId)) {
      return this.encryptionKeys.get(keyId)!
    }

    // In production, this should integrate with a proper key management service
    const key = crypto.randomBytes(32)
    this.encryptionKeys.set(keyId, key)
    
    // Track key usage
    this.keyUsageCounter.set(keyId, 0)
    
    return key
  }

  /**
   * Rotate encryption key
   */
  async rotateKey(keyId: string): Promise<void> {
    const newKey = crypto.randomBytes(32)
    const oldKey = this.encryptionKeys.get(keyId)
    
    if (oldKey) {
      // In production, would need to re-encrypt existing tokens with new key
      console.warn(`Key rotation for ${keyId} - existing encrypted tokens may need re-encryption`)
    }
    
    this.encryptionKeys.set(keyId, newKey)
    this.keyUsageCounter.set(keyId, 0)
  }

  /**
   * Batch generate tokens
   */
  async batchGenerateTokens(
    values: string[],
    config: TokenConfig,
    userId?: string
  ): Promise<TokenGenerationResult[]> {
    const results: TokenGenerationResult[] = []
    
    // Process in batches to avoid memory issues
    for (let i = 0; i < values.length; i += this.config.batchSize) {
      const batch = values.slice(i, i + this.config.batchSize)
      
      const batchResults = await Promise.all(
        batch.map(value => this.generateToken(value, config, userId))
      )
      
      results.push(...batchResults)
    }
    
    return results
  }

  /**
   * Get token mapping information
   */
  getTokenMapping(token: string): TokenMapping | null {
    return this.reverseTokenMappings.get(token) || null
  }

  /**
   * Validate token format
   */
  validateToken(token: string, expectedFormat: TokenFormat): boolean {
    const mapping = this.reverseTokenMappings.get(token)
    if (!mapping) {
      return false
    }
    
    return mapping.format === expectedFormat
  }

  /**
   * Clear expired mappings
   */
  private cleanupExpiredMappings(): void {
    const now = new Date()
    const expiredMappings: string[] = []
    
    for (const [key, mapping] of Array.from(this.tokenMappings.entries())) {
      const ageSeconds = (now.getTime() - mapping.lastUsed.getTime()) / 1000
      
      if (ageSeconds > this.config.ttlSeconds) {
        expiredMappings.push(key)
      }
    }
    
    // Remove expired mappings
    for (const key of expiredMappings) {
      const mapping = this.tokenMappings.get(key)
      if (mapping) {
        this.tokenMappings.delete(key)
        this.reverseTokenMappings.delete(mapping.tokenValue)
      }
    }
    
    if (expiredMappings.length > 0) {
      console.log(`Cleaned up ${expiredMappings.length} expired token mappings`)
    }
  }

  /**
   * Enforce cache size limits
   */
  private enforceCacheLimits(): void {
    if (this.tokenMappings.size <= this.config.maxMappings) {
      return
    }
    
    // Remove least recently used mappings
    const sortedMappings = Array.from(this.tokenMappings.entries())
      .sort(([, a], [, b]) => a.lastUsed.getTime() - b.lastUsed.getTime())
    
    const toRemove = sortedMappings.slice(0, this.tokenMappings.size - this.config.cacheSize)
    
    for (const [key, mapping] of toRemove) {
      this.tokenMappings.delete(key)
      this.reverseTokenMappings.delete(mapping.tokenValue)
    }
  }

  /**
   * Start cleanup interval
   */
  private startCleanupInterval(): void {
    const intervalMs = Math.min(this.config.ttlSeconds * 1000 / 10, 3600000) // Max 1 hour
    
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredMappings()
      this.enforceCacheLimits()
    }, intervalMs)
  }

  /**
   * Stop cleanup interval
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = undefined
    }
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    totalMappings: number
    reversibleMappings: number
    encryptionKeysCount: number
    formatDistribution: Record<TokenFormat, number>
    oldestMapping: Date | null
    newestMapping: Date | null
    config: TokenManagerConfig
  } {
    const formatDistribution: Record<TokenFormat, number> = {
      uuid: 0,
      numeric: 0,
      alphanumeric: 0,
      hash: 0,
      encrypted: 0,
      format_preserving: 0
    }
    
    let oldestMapping: Date | null = null
    let newestMapping: Date | null = null
    let reversibleCount = 0
    
    for (const mapping of Array.from(this.tokenMappings.values())) {
      formatDistribution[mapping.format as keyof typeof formatDistribution]++
      
      if (mapping.reversible) {
        reversibleCount++
      }
      
      if (!oldestMapping || mapping.createdAt < oldestMapping) {
        oldestMapping = mapping.createdAt
      }
      
      if (!newestMapping || mapping.createdAt > newestMapping) {
        newestMapping = mapping.createdAt
      }
    }
    
    return {
      totalMappings: this.tokenMappings.size,
      reversibleMappings: reversibleCount,
      encryptionKeysCount: this.encryptionKeys.size,
      formatDistribution,
      oldestMapping,
      newestMapping,
      config: { ...this.config }
    }
  }

  /**
   * Export mappings for backup/transfer
   */
  exportMappings(): TokenMapping[] {
    return Array.from(this.tokenMappings.values())
  }

  /**
   * Import mappings from backup
   */
  importMappings(mappings: TokenMapping[]): void {
    for (const mapping of mappings) {
      const key = this.createMappingKey(mapping.originalValue, mapping.metadata.config)
      this.tokenMappings.set(key, mapping)
      this.reverseTokenMappings.set(mapping.tokenValue, mapping)
    }
  }

  /**
   * Clear all mappings
   */
  clearAllMappings(): void {
    this.tokenMappings.clear()
    this.reverseTokenMappings.clear()
  }

  /**
   * Destroy token manager and cleanup resources
   */
  destroy(): void {
    this.stopCleanup()
    this.clearAllMappings()
    this.encryptionKeys.clear()
    this.keyUsageCounter.clear()
  }
}

// Export singleton instance
export const tokenManager = new TokenManager()
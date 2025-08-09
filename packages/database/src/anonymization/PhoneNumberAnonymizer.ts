// Phone Number Anonymization for Call/SMS Intelligence Platform
// Provides format-preserving masking and tokenization with reversible encryption

import crypto from 'crypto'
import type { AuditLogInsert } from '../types'
import { supabaseAdmin } from '../client'

export interface PhoneNumberFormat {
  countryCode?: string
  areaCode?: string
  prefix?: string
  number?: string
  extension?: string
  original: string
  formatted: string
  isValid: boolean
}

export interface PhoneAnonymizationConfig {
  // Masking configuration
  maskingStyle: 'partial' | 'full' | 'smart'
  preserveCountryCode: boolean
  preserveAreaCode: boolean
  preserveLastDigits: number
  maskCharacter: string
  
  // Tokenization configuration
  useConsistentTokens: boolean
  tokenFormat: 'uuid' | 'numeric' | 'formatted'
  encryptionKeyId: string
  
  // Format preservation
  preserveFormatting: boolean
  preserveLength: boolean
  
  // Reversibility
  enableReversibility: boolean
  
  // Audit settings
  auditLogging: boolean
}

export interface PhoneAnonymizationResult {
  original: string
  anonymized: string
  format: PhoneNumberFormat
  technique: 'masking' | 'tokenization' | 'encryption'
  reversible: boolean
  token?: string
  qualityScore: number
  metadata: Record<string, any>
}

export class PhoneNumberAnonymizer {
  private tokenMap = new Map<string, string>()
  private reverseTokenMap = new Map<string, string>()
  private encryptionKeys = new Map<string, Buffer>()
  private config: PhoneAnonymizationConfig

  // Common phone number patterns
  private patterns = {
    // US/Canada: +1-XXX-XXX-XXXX, (XXX) XXX-XXXX, XXX-XXX-XXXX, etc.
    northAmerica: /^(\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})(\s?ext\.?\s?([0-9]+))?$/,
    
    // International: +XX-XXX-XXX-XXXX
    international: /^(\+[1-9][0-9]{0,3})[-.\s]?([0-9]+)$/,
    
    // UK: +44-XXXX-XXXXXX
    uk: /^(\+44[-.\s]?)([0-9]{4})[-.\s]?([0-9]{6})$/,
    
    // Generic fallback
    generic: /^(\+?[0-9]{1,4}[-.\s]?)?([0-9\-.\s]+)$/
  }

  constructor(config: Partial<PhoneAnonymizationConfig> = {}) {
    this.config = {
      maskingStyle: 'smart',
      preserveCountryCode: true,
      preserveAreaCode: false,
      preserveLastDigits: 4,
      maskCharacter: '*',
      useConsistentTokens: true,
      tokenFormat: 'formatted',
      encryptionKeyId: 'phone_default',
      preserveFormatting: true,
      preserveLength: true,
      enableReversibility: true,
      auditLogging: true,
      ...config
    }
  }

  /**
   * Anonymize a phone number using the configured strategy
   */
  async anonymizePhoneNumber(
    phoneNumber: string,
    userId: string,
    technique: 'masking' | 'tokenization' | 'encryption' = 'masking'
  ): Promise<PhoneAnonymizationResult> {
    try {
      // Parse phone number format
      const format = this.parsePhoneNumber(phoneNumber)
      
      let anonymized: string
      let token: string | undefined
      let reversible = false
      let qualityScore = 1.0

      switch (technique) {
        case 'masking':
          anonymized = this.applyMasking(format)
          qualityScore = this.calculateMaskingQuality(format, anonymized)
          break

        case 'tokenization':
          const tokenResult = await this.applyTokenization(format, userId)
          anonymized = tokenResult.token
          token = tokenResult.token
          reversible = tokenResult.reversible
          qualityScore = 1.0 // Full utility for authorized users
          break

        case 'encryption':
          const encryptResult = await this.applyEncryption(format, userId)
          anonymized = encryptResult.encrypted
          token = encryptResult.token
          reversible = true
          qualityScore = 0.8 // Good utility with strong privacy
          break

        default:
          throw new Error(`Unsupported anonymization technique: ${technique}`)
      }

      const result: PhoneAnonymizationResult = {
        original: phoneNumber,
        anonymized,
        format,
        technique,
        reversible,
        token,
        qualityScore,
        metadata: {
          config: this.config,
          timestamp: new Date().toISOString()
        }
      }

      // Audit logging
      if (this.config.auditLogging) {
        await this.logAnonymizationEvent(userId, result)
      }

      return result

    } catch (error) {
      throw new Error(`Phone number anonymization failed: ${(error as Error).message}`)
    }
  }

  /**
   * Parse phone number and extract format information
   */
  private parsePhoneNumber(phoneNumber: string): PhoneNumberFormat {
    const cleaned = phoneNumber.trim()
    
    // Try North American format first
    let match = cleaned.match(this.patterns.northAmerica)
    if (match) {
      return {
        countryCode: match[1] ? match[1].replace(/\D/g, '') : '1',
        areaCode: match[2],
        prefix: match[3],
        number: match[4],
        extension: match[6],
        original: cleaned,
        formatted: this.formatNorthAmerican(match[1], match[2], match[3], match[4], match[6]),
        isValid: true
      }
    }

    // Try UK format
    match = cleaned.match(this.patterns.uk)
    if (match) {
      return {
        countryCode: '44',
        areaCode: match[2],
        number: match[3],
        original: cleaned,
        formatted: `+44-${match[2]}-${match[3]}`,
        isValid: true
      }
    }

    // Try international format
    match = cleaned.match(this.patterns.international)
    if (match) {
      return {
        countryCode: match[1].replace(/\D/g, ''),
        number: match[2],
        original: cleaned,
        formatted: `${match[1]}-${match[2]}`,
        isValid: true
      }
    }

    // Generic fallback
    match = cleaned.match(this.patterns.generic)
    if (match) {
      return {
        countryCode: match[1]?.replace(/\D/g, '') || undefined,
        number: match[2]?.replace(/\D/g, '') || cleaned,
        original: cleaned,
        formatted: cleaned,
        isValid: false
      }
    }

    // No pattern matched
    return {
      original: cleaned,
      formatted: cleaned,
      isValid: false
    }
  }

  /**
   * Format North American phone number
   */
  private formatNorthAmerican(
    countryCode: string | undefined,
    areaCode: string,
    prefix: string,
    number: string,
    extension: string | undefined
  ): string {
    let formatted = `(${areaCode}) ${prefix}-${number}`
    
    if (countryCode && countryCode !== '1') {
      formatted = `+${countryCode} ${formatted}`
    }
    
    if (extension) {
      formatted += ` ext. ${extension}`
    }
    
    return formatted
  }

  /**
   * Apply masking anonymization
   */
  private applyMasking(format: PhoneNumberFormat): string {
    if (!format.isValid) {
      // For invalid formats, apply simple masking
      return this.applySimpleMasking(format.original)
    }

    const { maskingStyle, preserveCountryCode, preserveAreaCode, preserveLastDigits, maskCharacter } = this.config

    switch (maskingStyle) {
      case 'full':
        return this.applyFullMasking(format)

      case 'partial':
        return this.applyPartialMasking(format)

      case 'smart':
      default:
        return this.applySmartMasking(format)
    }
  }

  /**
   * Apply full masking (everything becomes mask characters)
   */
  private applyFullMasking(format: PhoneNumberFormat): string {
    const { maskCharacter, preserveFormatting } = this.config
    
    if (!preserveFormatting) {
      return maskCharacter.repeat(10) // Standard 10-digit mask
    }

    // Preserve formatting structure
    return format.formatted.replace(/[0-9]/g, maskCharacter)
  }

  /**
   * Apply partial masking (preserve some digits)
   */
  private applyPartialMasking(format: PhoneNumberFormat): string {
    const { preserveCountryCode, preserveAreaCode, preserveLastDigits, maskCharacter } = this.config
    
    let result = format.formatted

    // Extract all digits
    const digits = format.original.replace(/\D/g, '')
    let maskedDigits = ''

    let index = 0
    
    // Handle country code
    if (format.countryCode && preserveCountryCode) {
      maskedDigits += format.countryCode
      index += format.countryCode.length
    } else if (format.countryCode) {
      maskedDigits += maskCharacter.repeat(format.countryCode.length)
      index += format.countryCode.length
    }

    // Handle area code
    if (format.areaCode && preserveAreaCode) {
      maskedDigits += format.areaCode
      index += format.areaCode.length
    } else if (format.areaCode) {
      maskedDigits += maskCharacter.repeat(format.areaCode.length)
      index += format.areaCode.length
    }

    // Handle middle digits
    const remainingDigits = digits.substring(index)
    const middleLength = Math.max(0, remainingDigits.length - preserveLastDigits)
    maskedDigits += maskCharacter.repeat(middleLength)

    // Handle last digits
    if (preserveLastDigits > 0 && remainingDigits.length >= preserveLastDigits) {
      maskedDigits += remainingDigits.substring(remainingDigits.length - preserveLastDigits)
    }

    // Replace digits in formatted string
    let digitIndex = 0
    return result.replace(/[0-9]/g, () => {
      return maskedDigits[digitIndex++] || maskCharacter
    })
  }

  /**
   * Apply smart masking (context-aware masking)
   */
  private applySmartMasking(format: PhoneNumberFormat): string {
    const { preserveCountryCode, maskCharacter } = this.config

    if (format.countryCode && format.areaCode && format.prefix && format.number) {
      // North American format: +1-***-***-1234
      let result = ''
      
      if (preserveCountryCode && format.countryCode) {
        result += `+${format.countryCode}-`
      } else {
        result += `+${maskCharacter}-`
      }
      
      // Always mask area code and prefix for privacy
      result += `${maskCharacter.repeat(3)}-${maskCharacter.repeat(3)}-`
      
      // Preserve last 4 digits
      result += format.number
      
      if (format.extension) {
        result += ` ext. ${format.extension}`
      }
      
      return result
    }

    // Fallback to partial masking
    return this.applyPartialMasking(format)
  }

  /**
   * Apply simple masking for invalid formats
   */
  private applySimpleMasking(phoneNumber: string): string {
    const { preserveLastDigits, maskCharacter } = this.config
    const digits = phoneNumber.replace(/\D/g, '')
    
    if (digits.length <= preserveLastDigits) {
      return phoneNumber // Too short to mask meaningfully
    }

    const maskedLength = digits.length - preserveLastDigits
    const maskedDigits = maskCharacter.repeat(maskedLength) + digits.substring(maskedLength)
    
    // Replace digits in original string
    let digitIndex = 0
    return phoneNumber.replace(/[0-9]/g, () => {
      return maskedDigits[digitIndex++] || maskCharacter
    })
  }

  /**
   * Apply tokenization anonymization
   */
  private async applyTokenization(
    format: PhoneNumberFormat,
    userId: string
  ): Promise<{ token: string; reversible: boolean }> {
    const phoneNumber = format.original
    
    // Check for existing token if consistency is required
    if (this.config.useConsistentTokens) {
      const existingToken = this.tokenMap.get(phoneNumber)
      if (existingToken) {
        return { token: existingToken, reversible: this.config.enableReversibility }
      }
    }

    let token: string

    switch (this.config.tokenFormat) {
      case 'uuid':
        token = crypto.randomUUID()
        break

      case 'numeric':
        token = this.generateNumericToken(format)
        break

      case 'formatted':
      default:
        token = this.generateFormattedToken(format)
        break
    }

    // Store mapping for consistency and potential reversibility
    if (this.config.useConsistentTokens || this.config.enableReversibility) {
      this.tokenMap.set(phoneNumber, token)
      this.reverseTokenMap.set(token, phoneNumber)
    }

    return { token, reversible: this.config.enableReversibility }
  }

  /**
   * Generate numeric token maintaining phone number format
   */
  private generateNumericToken(format: PhoneNumberFormat): string {
    const randomDigits = () => Math.floor(Math.random() * 10).toString()
    
    if (format.isValid && format.countryCode && format.areaCode && format.prefix && format.number) {
      // Generate format-preserving numeric token
      let token = ''
      
      if (this.config.preserveCountryCode && format.countryCode) {
        token += format.countryCode
      } else {
        token += Array.from({ length: format.countryCode?.length || 1 }, randomDigits).join('')
      }
      
      // Random area code (but valid range)
      const areaCode = this.generateValidAreaCode()
      token += areaCode
      
      // Random prefix and number
      token += Array.from({ length: 3 }, randomDigits).join('')
      token += Array.from({ length: 4 }, randomDigits).join('')
      
      return this.formatTokenAsPhoneNumber(token, format)
    }

    // Fallback: generate random digits of same length
    const digits = format.original.replace(/\D/g, '')
    return Array.from({ length: digits.length }, randomDigits).join('')
  }

  /**
   * Generate formatted token maintaining structure
   */
  private generateFormattedToken(format: PhoneNumberFormat): string {
    const numericToken = this.generateNumericToken(format)
    
    if (this.config.preserveFormatting && format.isValid) {
      return this.formatTokenAsPhoneNumber(numericToken, format)
    }
    
    return numericToken
  }

  /**
   * Format token to look like original phone number structure
   */
  private formatTokenAsPhoneNumber(token: string, format: PhoneNumberFormat): string {
    if (!this.config.preserveFormatting) {
      return token
    }

    // Use original formatting pattern but with token digits
    let digitIndex = 0
    return format.formatted.replace(/[0-9]/g, () => {
      return token[digitIndex++] || '0'
    })
  }

  /**
   * Generate valid area code (US/Canada)
   */
  private generateValidAreaCode(): string {
    // Valid area codes don't start with 0 or 1
    const validFirstDigits = [2, 3, 4, 5, 6, 7, 8, 9]
    const first = validFirstDigits[Math.floor(Math.random() * validFirstDigits.length)]
    const second = Math.floor(Math.random() * 10)
    const third = Math.floor(Math.random() * 10)
    
    return `${first}${second}${third}`
  }

  /**
   * Apply encryption anonymization
   */
  private async applyEncryption(
    format: PhoneNumberFormat,
    userId: string
  ): Promise<{ encrypted: string; token: string }> {
    const key = await this.getEncryptionKey(this.config.encryptionKeyId)
    const phoneNumber = format.original
    
    // Create cipher
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipher('aes-256-gcm', key)
    
    let encrypted = cipher.update(phoneNumber, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    
    const authTag = cipher.getAuthTag()
    const token = `${iv.toString('hex')}:${encrypted}:${authTag.toString('hex')}`
    
    // Store mapping for reversibility
    this.tokenMap.set(phoneNumber, token)
    this.reverseTokenMap.set(token, phoneNumber)
    
    // Format encrypted result to look like phone number if requested
    let displayValue = token
    if (this.config.preserveFormatting && format.isValid) {
      displayValue = this.formatEncryptedAsPhoneNumber(token, format)
    }
    
    return { encrypted: displayValue, token }
  }

  /**
   * Format encrypted token to resemble phone number
   */
  private formatEncryptedAsPhoneNumber(encryptedToken: string, format: PhoneNumberFormat): string {
    // Create a hash-based pseudo-phone number that maintains format
    const hash = crypto.createHash('sha256').update(encryptedToken).digest('hex')
    const digits = hash.replace(/[a-f]/g, (match) => {
      return String(parseInt(match, 16) % 10)
    }).substring(0, 10)
    
    if (format.countryCode && format.areaCode && format.prefix && format.number) {
      return this.formatNorthAmerican(
        this.config.preserveCountryCode ? format.countryCode : digits.substring(0, 1),
        digits.substring(1, 4),
        digits.substring(4, 7),
        digits.substring(7, 10),
        format.extension
      )
    }
    
    return digits
  }

  /**
   * Decrypt phone number (for authorized users)
   */
  async decryptPhoneNumber(encryptedToken: string, userId: string): Promise<string | null> {
    if (!this.config.enableReversibility) {
      throw new Error('Decryption not enabled in configuration')
    }

    try {
      // Check reverse mapping first
      const original = this.reverseTokenMap.get(encryptedToken)
      if (original) {
        return original
      }

      // Parse encrypted token
      const parts = encryptedToken.split(':')
      if (parts.length !== 3) {
        throw new Error('Invalid encrypted token format')
      }

      const [ivHex, encrypted, authTagHex] = parts
      const iv = Buffer.from(ivHex, 'hex')
      const authTag = Buffer.from(authTagHex, 'hex')
      
      const key = await this.getEncryptionKey(this.config.encryptionKeyId)
      const decipher = crypto.createDecipher('aes-256-gcm', key)
      decipher.setAuthTag(authTag)
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8')
      decrypted += decipher.final('utf8')
      
      // Cache the mapping
      this.reverseTokenMap.set(encryptedToken, decrypted)
      
      return decrypted

    } catch (error) {
      console.error('Phone number decryption failed:', error)
      return null
    }
  }

  /**
   * Calculate masking quality score
   */
  private calculateMaskingQuality(format: PhoneNumberFormat, masked: string): number {
    const originalDigits = format.original.replace(/\D/g, '')
    const maskedDigits = masked.replace(/\D/g, '')
    
    if (originalDigits.length === 0) return 1.0
    
    // Count preserved digits
    let preservedCount = 0
    let digitIndex = 0
    
    for (const char of maskedDigits) {
      if (char !== this.config.maskCharacter && digitIndex < originalDigits.length) {
        if (char === originalDigits[digitIndex]) {
          preservedCount++
        }
      }
      digitIndex++
    }
    
    // Quality score based on preserved information
    const preservationRatio = preservedCount / originalDigits.length
    const formatPreservationBonus = this.config.preserveFormatting ? 0.1 : 0
    
    return Math.min(1.0, preservationRatio + formatPreservationBonus)
  }

  /**
   * Get encryption key (placeholder - should use proper key management)
   */
  private async getEncryptionKey(keyId: string): Promise<Buffer> {
    if (this.encryptionKeys.has(keyId)) {
      return this.encryptionKeys.get(keyId)!
    }

    // In production, retrieve from secure key management service
    const key = crypto.randomBytes(32)
    this.encryptionKeys.set(keyId, key)
    return key
  }

  /**
   * Log anonymization event for audit trail
   */
  private async logAnonymizationEvent(
    userId: string,
    result: PhoneAnonymizationResult
  ): Promise<void> {
    try {
      const auditLog: AuditLogInsert = {
        actor_id: userId,
        action: 'phone.anonymize',
        resource: 'phone_number',
        resource_id: crypto.createHash('sha256').update(result.original).digest('hex').substring(0, 16),
        metadata: {
          technique: result.technique,
          reversible: result.reversible,
          qualityScore: result.qualityScore,
          config: {
            maskingStyle: this.config.maskingStyle,
            tokenFormat: this.config.tokenFormat,
            preserveFormatting: this.config.preserveFormatting
          }
        },
        ts: new Date().toISOString()
      }

      await supabaseAdmin.from('audit_log').insert(auditLog)
    } catch (error) {
      console.error('Failed to log phone anonymization event:', error)
    }
  }

  /**
   * Batch anonymize phone numbers
   */
  async batchAnonymizePhoneNumbers(
    phoneNumbers: string[],
    userId: string,
    technique: 'masking' | 'tokenization' | 'encryption' = 'masking'
  ): Promise<PhoneAnonymizationResult[]> {
    const results: PhoneAnonymizationResult[] = []
    
    for (const phoneNumber of phoneNumbers) {
      try {
        const result = await this.anonymizePhoneNumber(phoneNumber, userId, technique)
        results.push(result)
      } catch (error) {
        // Continue processing other numbers, but log the error
        console.error(`Failed to anonymize phone number: ${error}`)
        results.push({
          original: phoneNumber,
          anonymized: phoneNumber, // Fallback to original
          format: { original: phoneNumber, formatted: phoneNumber, isValid: false },
          technique,
          reversible: false,
          qualityScore: 0,
          metadata: { error: (error as Error).message }
        })
      }
    }
    
    return results
  }

  /**
   * Clear token mappings (for security)
   */
  clearTokenMappings(): void {
    this.tokenMap.clear()
    this.reverseTokenMap.clear()
  }

  /**
   * Get anonymization statistics
   */
  getStatistics(): {
    tokenMapSize: number
    encryptionKeysCount: number
    config: PhoneAnonymizationConfig
  } {
    return {
      tokenMapSize: this.tokenMap.size,
      encryptionKeysCount: this.encryptionKeys.size,
      config: { ...this.config }
    }
  }
}

// Export singleton instance with default configuration
export const phoneNumberAnonymizer = new PhoneNumberAnonymizer()
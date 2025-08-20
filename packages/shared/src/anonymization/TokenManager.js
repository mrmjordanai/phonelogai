"use strict";
// Token Management for Call/SMS Intelligence Platform
// Provides consistent pseudonymization and reversible tokenization with secure key management
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.tokenManager = exports.TokenManager = void 0;
const crypto = __importStar(require("crypto"));
class TokenManager {
    constructor(config = {}) {
        this.tokenMappings = new Map();
        this.reverseTokenMappings = new Map();
        this.encryptionKeys = new Map();
        this.keyUsageCounter = new Map();
        this.config = Object.assign({ enablePersistence: true, maxMappings: 100000, ttlSeconds: 86400 * 30, enableEncryption: true, keyRotationInterval: 86400 * 7, defaultKeyId: 'default', enforceConsistency: true, caseSensitive: true, cacheSize: 10000, batchSize: 1000, enableAuditing: true, auditSensitiveOperations: true }, config);
        // Start cleanup interval
        this.startCleanupInterval();
    }
    /**
     * Generate or retrieve consistent token for a value
     */
    async generateToken(originalValue, config, userId) {
        const key = this.createMappingKey(originalValue, config);
        // Check for existing mapping if consistency is enforced
        if (this.config.enforceConsistency) {
            const existingMapping = this.tokenMappings.get(key);
            if (existingMapping) {
                existingMapping.lastUsed = new Date();
                existingMapping.usageCount++;
                return {
                    token: existingMapping.tokenValue,
                    mapping: existingMapping,
                    isNew: false,
                    reversible: existingMapping.reversible
                };
            }
        }
        // Generate new token
        const token = await this.createToken(originalValue, config);
        const mappingId = crypto.randomUUID();
        const mapping = {
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
        };
        // Store mappings
        this.tokenMappings.set(key, mapping);
        this.reverseTokenMappings.set(token, mapping);
        // Enforce cache size limits
        this.enforceCacheLimits();
        return {
            token,
            mapping,
            isNew: true,
            reversible: mapping.reversible
        };
    }
    /**
     * Create token based on configuration
     */
    async createToken(originalValue, config) {
        let token;
        switch (config.format) {
            case 'uuid':
                token = crypto.randomUUID();
                break;
            case 'numeric':
                token = this.generateNumericToken(originalValue, config);
                break;
            case 'alphanumeric':
                token = this.generateAlphanumericToken(originalValue, config);
                break;
            case 'hash':
                token = this.generateHashToken(originalValue, config);
                break;
            case 'encrypted':
                token = await this.generateEncryptedToken(originalValue, config);
                break;
            case 'format_preserving':
                token = await this.generateFormatPreservingToken(originalValue, config);
                break;
            default:
                throw new Error(`Unsupported token format: ${config.format}`);
        }
        // Apply prefix and suffix if specified
        if (config.prefix) {
            token = config.prefix + token;
        }
        if (config.suffix) {
            token = token + config.suffix;
        }
        // Add checksum if requested
        if (config.includeChecksum) {
            const checksum = this.calculateChecksum(token);
            token = token + checksum;
        }
        return token;
    }
    /**
     * Generate numeric token
     */
    generateNumericToken(originalValue, config) {
        const length = config.length || 10;
        const digits = '0123456789';
        // Use hash of original value as seed for consistency
        const hash = crypto.createHash('sha256').update(originalValue).digest('hex');
        let token = '';
        for (let i = 0; i < length; i++) {
            const index = parseInt(hash.substring(i * 2, i * 2 + 2), 16) % digits.length;
            token += digits[index];
        }
        return token;
    }
    /**
     * Generate alphanumeric token
     */
    generateAlphanumericToken(originalValue, config) {
        const length = config.length || 8;
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        // Use hash for consistency
        const hash = crypto.createHash('sha256').update(originalValue).digest('hex');
        let token = '';
        for (let i = 0; i < length; i++) {
            const index = parseInt(hash.substring(i * 2, i * 2 + 2), 16) % chars.length;
            token += chars[index];
        }
        return config.caseSensitive ? token : token.toLowerCase();
    }
    /**
     * Generate hash-based token
     */
    generateHashToken(originalValue, config) {
        const algorithm = 'sha256';
        const hash = crypto.createHash(algorithm).update(originalValue).digest('hex');
        const length = config.length || 16;
        return hash.substring(0, length);
    }
    /**
     * Generate encrypted token
     */
    async generateEncryptedToken(originalValue, config) {
        const keyId = config.keyId || this.config.defaultKeyId;
        const key = await this.getEncryptionKey(keyId);
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        let encrypted = cipher.update(originalValue, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag();
        // Format: keyId:iv:encrypted:authTag
        return `${keyId}:${iv.toString('hex')}:${encrypted}:${authTag.toString('hex')}`;
    }
    /**
     * Generate format-preserving token
     */
    async generateFormatPreservingToken(originalValue, _config) {
        // Maintain the structure and format of the original value
        // while replacing actual content with pseudonymized values
        let token = originalValue;
        // Replace letters with consistent pseudonymized letters
        token = token.replace(/[a-zA-Z]/g, (match) => {
            const hash = crypto.createHash('md5').update(match + originalValue).digest('hex');
            const isUpperCase = match === match.toUpperCase();
            const letter = String.fromCharCode(97 + (parseInt(hash.substring(0, 2), 16) % 26));
            return isUpperCase ? letter.toUpperCase() : letter;
        });
        // Replace digits with consistent pseudonymized digits
        token = token.replace(/[0-9]/g, (match) => {
            const hash = crypto.createHash('md5').update(match + originalValue).digest('hex');
            return String(parseInt(hash.substring(0, 2), 16) % 10);
        });
        return token;
    }
    /**
     * Calculate checksum for token validation
     */
    calculateChecksum(token) {
        const hash = crypto.createHash('md5').update(token).digest('hex');
        return hash.substring(0, 4);
    }
    /**
     * Reverse token to original value (if reversible)
     */
    async reverseToken(token, _userId) {
        // Remove checksum if present
        const cleanToken = this.removeChecksum(token);
        const mapping = this.reverseTokenMappings.get(cleanToken);
        if (!mapping) {
            return null;
        }
        if (!mapping.reversible) {
            throw new Error('Token is not reversible');
        }
        // Handle encrypted tokens
        if (mapping.format === 'encrypted') {
            return await this.decryptToken(cleanToken, mapping.metadata.keyId);
        }
        // For other reversible formats, return original value from mapping
        mapping.lastUsed = new Date();
        mapping.usageCount++;
        return mapping.originalValue;
    }
    /**
     * Decrypt encrypted token
     */
    async decryptToken(encryptedToken, keyId) {
        const parts = encryptedToken.split(':');
        if (parts.length !== 4) {
            throw new Error('Invalid encrypted token format');
        }
        const [tokenKeyId, ivHex, encrypted, authTagHex] = parts;
        if (tokenKeyId !== keyId) {
            throw new Error('Key ID mismatch');
        }
        const key = await this.getEncryptionKey(keyId);
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }
    /**
     * Remove checksum from token
     */
    removeChecksum(token) {
        // Simple checksum removal (last 4 characters)
        // In practice, this would be more sophisticated
        if (token.length > 4) {
            return token.substring(0, token.length - 4);
        }
        return token;
    }
    /**
     * Check if token format is reversible
     */
    isReversibleFormat(format) {
        return format === 'encrypted';
    }
    /**
     * Create mapping key for consistent lookups
     */
    createMappingKey(originalValue, config) {
        const value = this.config.caseSensitive ? originalValue : originalValue.toLowerCase();
        const configKey = JSON.stringify({
            format: config.format,
            length: config.length,
            keyId: config.keyId
        });
        return crypto.createHash('sha256').update(value + configKey).digest('hex');
    }
    /**
     * Get or create encryption key
     */
    async getEncryptionKey(keyId) {
        if (this.encryptionKeys.has(keyId)) {
            return this.encryptionKeys.get(keyId);
        }
        // In production, this should integrate with a proper key management service
        const key = crypto.randomBytes(32);
        this.encryptionKeys.set(keyId, key);
        // Track key usage
        this.keyUsageCounter.set(keyId, 0);
        return key;
    }
    /**
     * Rotate encryption key
     */
    async rotateKey(keyId) {
        const newKey = crypto.randomBytes(32);
        const oldKey = this.encryptionKeys.get(keyId);
        if (oldKey) {
            // In production, would need to re-encrypt existing tokens with new key
            console.warn(`Key rotation for ${keyId} - existing encrypted tokens may need re-encryption`);
        }
        this.encryptionKeys.set(keyId, newKey);
        this.keyUsageCounter.set(keyId, 0);
    }
    /**
     * Batch generate tokens
     */
    async batchGenerateTokens(values, config, userId) {
        const results = [];
        // Process in batches to avoid memory issues
        for (let i = 0; i < values.length; i += this.config.batchSize) {
            const batch = values.slice(i, i + this.config.batchSize);
            const batchResults = await Promise.all(batch.map(value => this.generateToken(value, config, userId)));
            results.push(...batchResults);
        }
        return results;
    }
    /**
     * Get token mapping information
     */
    getTokenMapping(token) {
        return this.reverseTokenMappings.get(token) || null;
    }
    /**
     * Validate token format
     */
    validateToken(token, expectedFormat) {
        const mapping = this.reverseTokenMappings.get(token);
        if (!mapping) {
            return false;
        }
        return mapping.format === expectedFormat;
    }
    /**
     * Clear expired mappings
     */
    cleanupExpiredMappings() {
        const now = new Date();
        const expiredMappings = [];
        for (const [key, mapping] of Array.from(this.tokenMappings.entries())) {
            const ageSeconds = (now.getTime() - mapping.lastUsed.getTime()) / 1000;
            if (ageSeconds > this.config.ttlSeconds) {
                expiredMappings.push(key);
            }
        }
        // Remove expired mappings
        for (const key of expiredMappings) {
            const mapping = this.tokenMappings.get(key);
            if (mapping) {
                this.tokenMappings.delete(key);
                this.reverseTokenMappings.delete(mapping.tokenValue);
            }
        }
        if (expiredMappings.length > 0) {
            console.log(`Cleaned up ${expiredMappings.length} expired token mappings`);
        }
    }
    /**
     * Enforce cache size limits
     */
    enforceCacheLimits() {
        if (this.tokenMappings.size <= this.config.maxMappings) {
            return;
        }
        // Remove least recently used mappings
        const sortedMappings = Array.from(this.tokenMappings.entries())
            .sort(([, a], [, b]) => a.lastUsed.getTime() - b.lastUsed.getTime());
        const toRemove = sortedMappings.slice(0, this.tokenMappings.size - this.config.cacheSize);
        for (const [key, mapping] of toRemove) {
            this.tokenMappings.delete(key);
            this.reverseTokenMappings.delete(mapping.tokenValue);
        }
    }
    /**
     * Start cleanup interval
     */
    startCleanupInterval() {
        const intervalMs = Math.min(this.config.ttlSeconds * 1000 / 10, 3600000); // Max 1 hour
        this.cleanupInterval = setInterval(() => {
            this.cleanupExpiredMappings();
            this.enforceCacheLimits();
        }, intervalMs);
    }
    /**
     * Stop cleanup interval
     */
    stopCleanup() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = undefined;
        }
    }
    /**
     * Get statistics
     */
    getStatistics() {
        const formatDistribution = {
            uuid: 0,
            numeric: 0,
            alphanumeric: 0,
            hash: 0,
            encrypted: 0,
            format_preserving: 0
        };
        let oldestMapping = null;
        let newestMapping = null;
        let reversibleCount = 0;
        for (const mapping of Array.from(this.tokenMappings.values())) {
            formatDistribution[mapping.format]++;
            if (mapping.reversible) {
                reversibleCount++;
            }
            if (!oldestMapping || mapping.createdAt < oldestMapping) {
                oldestMapping = mapping.createdAt;
            }
            if (!newestMapping || mapping.createdAt > newestMapping) {
                newestMapping = mapping.createdAt;
            }
        }
        return {
            totalMappings: this.tokenMappings.size,
            reversibleMappings: reversibleCount,
            encryptionKeysCount: this.encryptionKeys.size,
            formatDistribution,
            oldestMapping,
            newestMapping,
            config: Object.assign({}, this.config)
        };
    }
    /**
     * Export mappings for backup/transfer
     */
    exportMappings() {
        return Array.from(this.tokenMappings.values());
    }
    /**
     * Import mappings from backup
     */
    importMappings(mappings) {
        for (const mapping of mappings) {
            const key = this.createMappingKey(mapping.originalValue, mapping.metadata.config);
            this.tokenMappings.set(key, mapping);
            this.reverseTokenMappings.set(mapping.tokenValue, mapping);
        }
    }
    /**
     * Clear all mappings
     */
    clearAllMappings() {
        this.tokenMappings.clear();
        this.reverseTokenMappings.clear();
    }
    /**
     * Destroy token manager and cleanup resources
     */
    destroy() {
        this.stopCleanup();
        this.clearAllMappings();
        this.encryptionKeys.clear();
        this.keyUsageCounter.clear();
    }
}
exports.TokenManager = TokenManager;
// Export singleton instance
exports.tokenManager = new TokenManager();

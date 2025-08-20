export type TokenFormat = 'uuid' | 'numeric' | 'alphanumeric' | 'hash' | 'encrypted' | 'format_preserving';
export interface TokenConfig {
    format: TokenFormat;
    length?: number;
    prefix?: string;
    suffix?: string;
    preserveFormat?: boolean;
    caseSensitive?: boolean;
    includeChecksum?: boolean;
    keyId?: string;
}
export interface TokenMapping {
    id: string;
    originalValue: string;
    tokenValue: string;
    format: TokenFormat;
    reversible: boolean;
    createdAt: Date;
    lastUsed: Date;
    usageCount: number;
    metadata: Record<string, any>;
}
export interface TokenGenerationResult {
    token: string;
    mapping: TokenMapping;
    isNew: boolean;
    reversible: boolean;
}
export interface TokenManagerConfig {
    enablePersistence: boolean;
    maxMappings: number;
    ttlSeconds: number;
    enableEncryption: boolean;
    keyRotationInterval: number;
    defaultKeyId: string;
    enforceConsistency: boolean;
    caseSensitive: boolean;
    cacheSize: number;
    batchSize: number;
    enableAuditing: boolean;
    auditSensitiveOperations: boolean;
}
export declare class TokenManager {
    private config;
    private tokenMappings;
    private reverseTokenMappings;
    private encryptionKeys;
    private keyUsageCounter;
    private cleanupInterval?;
    constructor(config?: Partial<TokenManagerConfig>);
    /**
     * Generate or retrieve consistent token for a value
     */
    generateToken(originalValue: string, config: TokenConfig, userId?: string): Promise<TokenGenerationResult>;
    /**
     * Create token based on configuration
     */
    private createToken;
    /**
     * Generate numeric token
     */
    private generateNumericToken;
    /**
     * Generate alphanumeric token
     */
    private generateAlphanumericToken;
    /**
     * Generate hash-based token
     */
    private generateHashToken;
    /**
     * Generate encrypted token
     */
    private generateEncryptedToken;
    /**
     * Generate format-preserving token
     */
    private generateFormatPreservingToken;
    /**
     * Calculate checksum for token validation
     */
    private calculateChecksum;
    /**
     * Reverse token to original value (if reversible)
     */
    reverseToken(token: string, _userId?: string): Promise<string | null>;
    /**
     * Decrypt encrypted token
     */
    private decryptToken;
    /**
     * Remove checksum from token
     */
    private removeChecksum;
    /**
     * Check if token format is reversible
     */
    private isReversibleFormat;
    /**
     * Create mapping key for consistent lookups
     */
    private createMappingKey;
    /**
     * Get or create encryption key
     */
    private getEncryptionKey;
    /**
     * Rotate encryption key
     */
    rotateKey(keyId: string): Promise<void>;
    /**
     * Batch generate tokens
     */
    batchGenerateTokens(values: string[], config: TokenConfig, userId?: string): Promise<TokenGenerationResult[]>;
    /**
     * Get token mapping information
     */
    getTokenMapping(token: string): TokenMapping | null;
    /**
     * Validate token format
     */
    validateToken(token: string, expectedFormat: TokenFormat): boolean;
    /**
     * Clear expired mappings
     */
    private cleanupExpiredMappings;
    /**
     * Enforce cache size limits
     */
    private enforceCacheLimits;
    /**
     * Start cleanup interval
     */
    private startCleanupInterval;
    /**
     * Stop cleanup interval
     */
    stopCleanup(): void;
    /**
     * Get statistics
     */
    getStatistics(): {
        totalMappings: number;
        reversibleMappings: number;
        encryptionKeysCount: number;
        formatDistribution: Record<TokenFormat, number>;
        oldestMapping: Date | null;
        newestMapping: Date | null;
        config: TokenManagerConfig;
    };
    /**
     * Export mappings for backup/transfer
     */
    exportMappings(): TokenMapping[];
    /**
     * Import mappings from backup
     */
    importMappings(mappings: TokenMapping[]): void;
    /**
     * Clear all mappings
     */
    clearAllMappings(): void;
    /**
     * Destroy token manager and cleanup resources
     */
    destroy(): void;
}
export declare const tokenManager: TokenManager;

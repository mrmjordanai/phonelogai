export type PIIType = 'person_name' | 'phone_number' | 'email_address' | 'ssn' | 'credit_card' | 'address' | 'date_of_birth' | 'driver_license' | 'passport' | 'bank_account' | 'ip_address' | 'custom';
export interface PIIMatch {
    type: PIIType;
    value: string;
    startIndex: number;
    endIndex: number;
    confidence: number;
    context: string;
    pattern?: string;
    metadata: Record<string, any>;
}
export interface PIIDetectionConfig {
    enabledTypes: PIIType[];
    confidenceThreshold: number;
    contextWindow: number;
    enableRegexPatterns: boolean;
    enableMLDetection: boolean;
    caseSensitive: boolean;
    maxTextLength: number;
    batchSize: number;
    customPatterns: Record<string, RegExp>;
    customReplacements: Partial<Record<PIIType, string>>;
}
export interface PIIDetectionResult {
    originalText: string;
    matches: PIIMatch[];
    anonymizedText: string;
    confidenceScore: number;
    processingTime: number;
    metadata: Record<string, any>;
}
export declare class PIIDetector {
    private config;
    private patterns;
    private contextPatterns;
    private replacements;
    constructor(config?: Partial<PIIDetectionConfig>);
    /**
     * Detect PII in text and return anonymized version
     */
    detectAndAnonymize(text: string): Promise<PIIDetectionResult>;
    /**
     * Perform regex-based PII detection
     */
    private performRegexDetection;
    /**
     * Perform ML-based PII detection (placeholder implementation)
     */
    private performMLDetection;
    /**
     * Detect person names using ML (placeholder)
     */
    private detectNamesWithML;
    /**
     * Initialize PII detection patterns
     */
    private initializePatterns;
    /**
     * Initialize context patterns for better detection accuracy
     */
    private initializeContextPatterns;
    /**
     * Initialize replacement patterns
     */
    private initializeReplacements;
    /**
     * Extract context around a match
     */
    private extractContext;
    /**
     * Calculate confidence score for pattern matches
     */
    private calculatePatternConfidence;
    /**
     * Calculate confidence for ML-detected names
     */
    private calculateNameMLConfidence;
    /**
     * Validate credit card using Luhn algorithm
     */
    private validateLuhnAlgorithm;
    /**
     * Filter overlapping matches and sort by position
     */
    private filterAndSortMatches;
    /**
     * Generate anonymized text from matches
     */
    private generateAnonymizedText;
    /**
     * Calculate overall confidence score
     */
    private calculateOverallConfidence;
    /**
     * Add custom PII pattern
     */
    addCustomPattern(type: PIIType, pattern: RegExp, replacement?: string): void;
    /**
     * Update configuration
     */
    updateConfig(newConfig: Partial<PIIDetectionConfig>): void;
    /**
     * Get detection statistics
     */
    getStatistics(): {
        enabledTypes: PIIType[];
        patternCount: number;
        contextPatternCount: number;
        config: PIIDetectionConfig;
    };
}
export declare const piiDetector: PIIDetector;

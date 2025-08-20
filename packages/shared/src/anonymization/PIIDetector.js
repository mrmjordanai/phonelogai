"use strict";
// Personal Information Detection for Call/SMS Intelligence Platform
// Provides ML-based and regex pattern detection for sensitive data identification
Object.defineProperty(exports, "__esModule", { value: true });
exports.piiDetector = exports.PIIDetector = void 0;
class PIIDetector {
    constructor(config = {}) {
        this.config = Object.assign({ enabledTypes: [
                'person_name',
                'phone_number',
                'email_address',
                'ssn',
                'credit_card',
                'address',
                'date_of_birth'
            ], confidenceThreshold: 0.7, contextWindow: 20, enableRegexPatterns: true, enableMLDetection: false, caseSensitive: false, maxTextLength: 10000, batchSize: 100, customPatterns: {}, customReplacements: {} }, config);
        this.patterns = this.initializePatterns();
        this.contextPatterns = this.initializeContextPatterns();
        this.replacements = this.initializeReplacements();
    }
    /**
     * Detect PII in text and return anonymized version
     */
    async detectAndAnonymize(text) {
        const startTime = Date.now();
        if (text.length > this.config.maxTextLength) {
            throw new Error(`Text length exceeds maximum allowed length of ${this.config.maxTextLength}`);
        }
        const matches = [];
        // Perform regex-based detection
        if (this.config.enableRegexPatterns) {
            const regexMatches = await this.performRegexDetection(text);
            matches.push(...regexMatches);
        }
        // Perform ML-based detection (if enabled)
        if (this.config.enableMLDetection) {
            const mlMatches = await this.performMLDetection(text);
            matches.push(...mlMatches);
        }
        // Remove overlapping matches and sort by position
        const filteredMatches = this.filterAndSortMatches(matches);
        // Generate anonymized text
        const anonymizedText = this.generateAnonymizedText(text, filteredMatches);
        // Calculate overall confidence score
        const confidenceScore = this.calculateOverallConfidence(filteredMatches);
        const processingTime = Date.now() - startTime;
        return {
            originalText: text,
            matches: filteredMatches,
            anonymizedText,
            confidenceScore,
            processingTime,
            metadata: {
                patternMatches: filteredMatches.filter(m => m.pattern).length,
                mlMatches: filteredMatches.filter(m => !m.pattern).length,
                totalMatches: filteredMatches.length
            }
        };
    }
    /**
     * Perform regex-based PII detection
     */
    async performRegexDetection(text) {
        const matches = [];
        const searchText = this.config.caseSensitive ? text : text.toLowerCase();
        for (const piiType of this.config.enabledTypes) {
            const patterns = this.patterns[piiType];
            if (!patterns)
                continue;
            for (const pattern of patterns) {
                const regex = this.config.caseSensitive ? pattern : new RegExp(pattern.source, 'gi');
                let match;
                while ((match = regex.exec(searchText)) !== null) {
                    const value = text.substring(match.index, match.index + match[0].length);
                    const context = this.extractContext(text, match.index, match[0].length);
                    // Calculate confidence based on pattern strength and context
                    const confidence = this.calculatePatternConfidence(piiType, match[0], context);
                    if (confidence >= this.config.confidenceThreshold) {
                        matches.push({
                            type: piiType,
                            value,
                            startIndex: match.index,
                            endIndex: match.index + match[0].length,
                            confidence,
                            context,
                            pattern: pattern.source,
                            metadata: {
                                patternType: 'regex',
                                matchedGroups: match.slice(1)
                            }
                        });
                    }
                    // Prevent infinite loops with zero-length matches
                    if (match[0].length === 0) {
                        regex.lastIndex++;
                    }
                }
            }
        }
        return matches;
    }
    /**
     * Perform ML-based PII detection (placeholder implementation)
     */
    async performMLDetection(text) {
        // This would integrate with actual ML models like spaCy, transformers, etc.
        // For now, return empty array as ML detection is disabled by default
        const matches = [];
        // Example implementation with Named Entity Recognition
        if (this.config.enabledTypes.includes('person_name')) {
            const nameMatches = await this.detectNamesWithML(text);
            matches.push(...nameMatches);
        }
        return matches;
    }
    /**
     * Detect person names using ML (placeholder)
     */
    async detectNamesWithML(text) {
        const matches = [];
        // This would use actual NLP libraries like:
        // - spaCy for Python integration
        // - compromise.js for JavaScript NLP
        // - cloud APIs like Google Cloud NLP, AWS Comprehend
        // Simple heuristic for demonstration
        const namePattern = /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g;
        let match;
        while ((match = namePattern.exec(text)) !== null) {
            const context = this.extractContext(text, match.index, match[0].length);
            const confidence = this.calculateNameMLConfidence(match[0], context);
            if (confidence >= this.config.confidenceThreshold) {
                matches.push({
                    type: 'person_name',
                    value: match[0],
                    startIndex: match.index,
                    endIndex: match.index + match[0].length,
                    confidence,
                    context,
                    metadata: {
                        patternType: 'ml',
                        algorithm: 'simple_heuristic'
                    }
                });
            }
        }
        return matches;
    }
    /**
     * Initialize PII detection patterns
     */
    initializePatterns() {
        return {
            phone_number: [
                // US/Canada formats
                /\+?1[-.\s]?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g,
                /\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g,
                // International formats
                /\+[1-9][0-9]{1,14}/g,
                // Generic phone patterns
                /\b[0-9]{3}[-.]?[0-9]{3}[-.]?[0-9]{4}\b/g
            ],
            email_address: [
                /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
                /\b[A-Za-z0-9._%+-]+\s*@\s*[A-Za-z0-9.-]+\s*\.\s*[A-Z|a-z]{2,}\b/g
            ],
            ssn: [
                // XXX-XX-XXXX format
                /\b[0-9]{3}-[0-9]{2}-[0-9]{4}\b/g,
                // XXXXXXXXX format
                /\b[0-9]{9}\b/g,
                // XXX XX XXXX format
                /\b[0-9]{3}\s[0-9]{2}\s[0-9]{4}\b/g
            ],
            credit_card: [
                // Visa (4xxx)
                /\b4[0-9]{12}(?:[0-9]{3})?\b/g,
                // MasterCard (5xxx)
                /\b5[1-5][0-9]{14}\b/g,
                // American Express (3xxx)
                /\b3[47][0-9]{13}\b/g,
                // Discover (6xxx)
                /\b6(?:011|5[0-9]{2})[0-9]{12}\b/g,
                // Generic 13-19 digit card
                /\b[0-9]{13,19}\b/g
            ],
            address: [
                // Street address with number
                /\b[0-9]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Way|Court|Ct|Place|Pl)\b/gi,
                // PO Box
                /\bP\.?O\.?\s+Box\s+[0-9]+\b/gi,
                // ZIP codes
                /\b[0-9]{5}(?:-[0-9]{4})?\b/g
            ],
            date_of_birth: [
                // MM/DD/YYYY
                /\b(?:0?[1-9]|1[0-2])\/(?:0?[1-9]|[12][0-9]|3[01])\/(?:19|20)[0-9]{2}\b/g,
                // MM-DD-YYYY
                /\b(?:0?[1-9]|1[0-2])-(?:0?[1-9]|[12][0-9]|3[01])-(?:19|20)[0-9]{2}\b/g,
                // YYYY-MM-DD
                /\b(?:19|20)[0-9]{2}-(?:0?[1-9]|1[0-2])-(?:0?[1-9]|[12][0-9]|3[01])\b/g
            ],
            driver_license: [
                // Generic alphanumeric patterns (varies by state)
                /\b[A-Z][0-9]{7,13}\b/g,
                /\b[0-9]{8,12}\b/g
            ],
            passport: [
                // US Passport
                /\b[0-9]{9}\b/g,
                // Generic passport patterns
                /\b[A-Z]{1,2}[0-9]{6,9}\b/g
            ],
            bank_account: [
                // Account numbers (8-17 digits)
                /\b[0-9]{8,17}\b/g,
                // Routing numbers (9 digits)
                /\b[0-9]{9}\b/g
            ],
            ip_address: [
                // IPv4
                /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g,
                // IPv6 (simplified)
                /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g
            ],
            person_name: [
                // Simple name patterns (enhanced by ML detection)
                /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g,
                /\b[A-Z][a-z]+ [A-Z]\. [A-Z][a-z]+\b/g,
                /\b[A-Z][a-z]+ [A-Z][a-z]+ [A-Z][a-z]+\b/g
            ],
            custom: []
        };
    }
    /**
     * Initialize context patterns for better detection accuracy
     */
    initializeContextPatterns() {
        return {
            phone_number: [
                /\b(?:phone|tel|call|number|mobile|cell)\b/gi,
                /\b(?:contact|reach|dial)\b/gi
            ],
            email_address: [
                /\b(?:email|e-mail|contact|send)\b/gi,
                /\b(?:@|at)\b/gi
            ],
            ssn: [
                /\b(?:ssn|social|security|number)\b/gi,
                /\b(?:social security|ss#)\b/gi
            ],
            credit_card: [
                /\b(?:card|credit|visa|mastercard|amex|discover)\b/gi,
                /\b(?:payment|billing|charge)\b/gi
            ],
            address: [
                /\b(?:address|location|home|residence)\b/gi,
                /\b(?:street|avenue|road|drive|lane)\b/gi
            ],
            date_of_birth: [
                /\b(?:born|birth|dob|birthday)\b/gi,
                /\b(?:age|years old)\b/gi
            ],
            driver_license: [
                /\b(?:driver|license|dl|id)\b/gi,
                /\b(?:state id|identification)\b/gi
            ],
            passport: [
                /\b(?:passport|travel|document)\b/gi,
                /\b(?:international|border)\b/gi
            ],
            bank_account: [
                /\b(?:account|bank|routing|checking|savings)\b/gi,
                /\b(?:deposit|withdrawal|transfer)\b/gi
            ],
            ip_address: [
                /\b(?:ip|address|server|network)\b/gi,
                /\b(?:internet|connection|host)\b/gi
            ],
            person_name: [
                /\b(?:name|called|known as|aka)\b/gi,
                /\b(?:mr|mrs|ms|dr|prof)\b/gi
            ],
            custom: []
        };
    }
    /**
     * Initialize replacement patterns
     */
    initializeReplacements() {
        return Object.assign({ person_name: '[NAME]', phone_number: '[PHONE]', email_address: '[EMAIL]', ssn: '[SSN]', credit_card: '[CREDIT_CARD]', address: '[ADDRESS]', date_of_birth: '[DATE_OF_BIRTH]', driver_license: '[DRIVER_LICENSE]', passport: '[PASSPORT]', bank_account: '[BANK_ACCOUNT]', ip_address: '[IP_ADDRESS]', custom: '[REDACTED]' }, this.config.customReplacements);
    }
    /**
     * Extract context around a match
     */
    extractContext(text, startIndex, matchLength) {
        const contextStart = Math.max(0, startIndex - this.config.contextWindow);
        const contextEnd = Math.min(text.length, startIndex + matchLength + this.config.contextWindow);
        return text.substring(contextStart, contextEnd);
    }
    /**
     * Calculate confidence score for pattern matches
     */
    calculatePatternConfidence(piiType, match, context) {
        let confidence = 0.8; // Base confidence for regex matches
        // Check context patterns for additional confidence
        const contextPatterns = this.contextPatterns[piiType] || [];
        let contextMatches = 0;
        for (const pattern of contextPatterns) {
            if (pattern.test(context)) {
                contextMatches++;
            }
        }
        // Boost confidence based on context matches
        if (contextMatches > 0) {
            confidence = Math.min(1.0, confidence + (contextMatches * 0.1));
        }
        // Apply type-specific confidence adjustments
        switch (piiType) {
            case 'phone_number':
                // Higher confidence for properly formatted phone numbers
                if (/^\+?1[-.\s]?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}$/.test(match)) {
                    confidence = Math.min(1.0, confidence + 0.1);
                }
                break;
            case 'email_address':
                // Higher confidence for complete email addresses
                if (/@.+\..+/.test(match)) {
                    confidence = Math.min(1.0, confidence + 0.1);
                }
                break;
            case 'ssn':
                // Lower confidence for numbers that might not be SSNs
                if (!/^[0-9]{3}-[0-9]{2}-[0-9]{4}$/.test(match)) {
                    confidence *= 0.7;
                }
                break;
            case 'credit_card':
                // Use Luhn algorithm for credit card validation
                if (this.validateLuhnAlgorithm(match.replace(/\D/g, ''))) {
                    confidence = Math.min(1.0, confidence + 0.15);
                }
                else {
                    confidence *= 0.5;
                }
                break;
        }
        return confidence;
    }
    /**
     * Calculate confidence for ML-detected names
     */
    calculateNameMLConfidence(name, context) {
        let confidence = 0.6; // Base confidence for ML heuristics
        // Check for name context indicators
        const nameIndicators = [
            /\b(?:name|called|known as|aka|mr|mrs|ms|dr|prof)\b/gi,
            /\b(?:hi|hello|dear|from|to|by)\b/gi
        ];
        for (const pattern of nameIndicators) {
            if (pattern.test(context)) {
                confidence = Math.min(0.95, confidence + 0.15);
            }
        }
        // Reduce confidence for common words that might be false positives
        const commonWords = ['Call', 'Text', 'Message', 'Phone', 'Number', 'Time', 'Date'];
        if (commonWords.some(word => name.includes(word))) {
            confidence *= 0.3;
        }
        return confidence;
    }
    /**
     * Validate credit card using Luhn algorithm
     */
    validateLuhnAlgorithm(cardNumber) {
        const digits = cardNumber.split('').map(Number);
        let sum = 0;
        let isEven = false;
        for (let i = digits.length - 1; i >= 0; i--) {
            let digit = digits[i];
            if (isEven) {
                digit *= 2;
                if (digit > 9) {
                    digit -= 9;
                }
            }
            sum += digit;
            isEven = !isEven;
        }
        return sum % 10 === 0;
    }
    /**
     * Filter overlapping matches and sort by position
     */
    filterAndSortMatches(matches) {
        if (matches.length === 0)
            return matches;
        // Sort by start index, then by confidence (descending)
        matches.sort((a, b) => {
            if (a.startIndex !== b.startIndex) {
                return a.startIndex - b.startIndex;
            }
            return b.confidence - a.confidence;
        });
        const filtered = [];
        let lastEndIndex = -1;
        for (const match of matches) {
            // Skip overlapping matches (keep the one with higher confidence)
            if (match.startIndex >= lastEndIndex) {
                filtered.push(match);
                lastEndIndex = match.endIndex;
            }
        }
        return filtered;
    }
    /**
     * Generate anonymized text from matches
     */
    generateAnonymizedText(text, matches) {
        if (matches.length === 0)
            return text;
        let result = '';
        let lastIndex = 0;
        for (const match of matches) {
            // Add text before the match
            result += text.substring(lastIndex, match.startIndex);
            // Add replacement text
            result += this.replacements[match.type] || '[REDACTED]';
            lastIndex = match.endIndex;
        }
        // Add remaining text
        result += text.substring(lastIndex);
        return result;
    }
    /**
     * Calculate overall confidence score
     */
    calculateOverallConfidence(matches) {
        if (matches.length === 0)
            return 1.0;
        const avgConfidence = matches.reduce((sum, match) => sum + match.confidence, 0) / matches.length;
        return avgConfidence;
    }
    /**
     * Add custom PII pattern
     */
    addCustomPattern(type, pattern, replacement) {
        if (!this.patterns[type]) {
            this.patterns[type] = [];
        }
        this.patterns[type].push(pattern);
        if (replacement) {
            this.replacements[type] = replacement;
        }
    }
    /**
     * Update configuration
     */
    updateConfig(newConfig) {
        this.config = Object.assign(Object.assign({}, this.config), newConfig);
    }
    /**
     * Get detection statistics
     */
    getStatistics() {
        const patternCount = Object.values(this.patterns).reduce((sum, patterns) => sum + patterns.length, 0);
        const contextPatternCount = Object.values(this.contextPatterns).reduce((sum, patterns) => sum + patterns.length, 0);
        return {
            enabledTypes: [...this.config.enabledTypes],
            patternCount,
            contextPatternCount,
            config: Object.assign({}, this.config)
        };
    }
}
exports.PIIDetector = PIIDetector;
// Export singleton instance
exports.piiDetector = new PIIDetector();

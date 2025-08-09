/**
 * Field-Level Encryption Service
 * Provides AES-GCM encryption for sensitive data fields with key rotation support
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types';

// Encryption configuration
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16;  // 128 bits
const TAG_LENGTH = 16; // 128 bits
const SALT_LENGTH = 32; // 256 bits

export interface EncryptedField {
  encryptedData: Buffer;
  keyId: string;
  algorithm: string;
  version: number;
}

export interface EncryptionKeyInfo {
  keyId: string;
  algorithm: string;
  version: number;
  createdAt: Date;
  expiresAt?: Date;
  status: 'active' | 'inactive' | 'revoked' | 'expired';
}

export interface DecryptionContext {
  userId: string;
  purpose: string;
  auditTrail?: boolean;
}

export interface KeyRotationResult {
  success: boolean;
  recordsProcessed: number;
  errors: string[];
  newKeyId: string;
  rotationId: string;
}

export class EncryptionService {
  private supabase: SupabaseClient<Database>;
  private keyCache: Map<string, Buffer> = new Map();
  private readonly cacheTimeout = 300000; // 5 minutes
  private keyTimestamps: Map<string, number> = new Map();

  constructor(supabase: SupabaseClient<Database>) {
    this.supabase = supabase;
  }

  /**
   * Encrypt a field value using AES-GCM encryption
   */
  async encryptField(
    plaintext: string,
    fieldType: string = 'phone_number',
    keyId?: string
  ): Promise<EncryptedField> {
    if (!plaintext) {
      throw new Error('Cannot encrypt empty value');
    }

    const startTime = Date.now();

    try {
      // Get active encryption key
      const activeKeyId = keyId || await this.getActiveKeyId();
      const encryptionKey = await this.getDecryptionKey(activeKeyId);

      // Generate random IV
      const iv = randomBytes(IV_LENGTH);
      
      // Create cipher
      const cipher = createCipheriv(ALGORITHM, encryptionKey, iv);
      
      // Encrypt the data
      const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final()
      ]);
      
      // Get authentication tag
      const tag = cipher.getAuthTag();
      
      // Combine IV + encrypted data + tag
      const encryptedData = Buffer.concat([iv, encrypted, tag]);

      const result: EncryptedField = {
        encryptedData,
        keyId: activeKeyId,
        algorithm: ALGORITHM,
        version: 1
      };

      // Log encryption operation for audit
      await this.logEncryptionOperation({
        operation: 'encrypt',
        fieldType,
        keyId: activeKeyId,
        success: true,
        executionTimeMs: Date.now() - startTime
      });

      return result;
    } catch (error) {
      // Log encryption failure
      await this.logEncryptionOperation({
        operation: 'encrypt',
        fieldType,
        keyId: keyId || 'unknown',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTimeMs: Date.now() - startTime
      });
      
      throw new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Decrypt a field value using AES-GCM decryption
   */
  async decryptField(
    encryptedField: EncryptedField,
    context: DecryptionContext
  ): Promise<string> {
    if (!encryptedField.encryptedData || encryptedField.encryptedData.length === 0) {
      throw new Error('Cannot decrypt empty encrypted data');
    }

    const startTime = Date.now();

    try {
      // Get decryption key
      const decryptionKey = await this.getDecryptionKey(encryptedField.keyId);
      
      // Extract IV, encrypted data, and tag
      const encryptedBuffer = encryptedField.encryptedData;
      const iv = encryptedBuffer.subarray(0, IV_LENGTH);
      const tag = encryptedBuffer.subarray(encryptedBuffer.length - TAG_LENGTH);
      const encrypted = encryptedBuffer.subarray(IV_LENGTH, encryptedBuffer.length - TAG_LENGTH);
      
      // Create decipher
      const decipher = createDecipheriv(ALGORITHM, decryptionKey, iv);
      decipher.setAuthTag(tag);
      
      // Decrypt the data
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
      ]);
      
      const plaintext = decrypted.toString('utf8');

      // Log decryption operation for audit if requested
      if (context.auditTrail !== false) {
        await this.logDecryptionOperation({
          userId: context.userId,
          purpose: context.purpose,
          keyId: encryptedField.keyId,
          success: true,
          executionTimeMs: Date.now() - startTime
        });
      }

      return plaintext;
    } catch (error) {
      // Log decryption failure
      await this.logDecryptionOperation({
        userId: context.userId,
        purpose: context.purpose,
        keyId: encryptedField.keyId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTimeMs: Date.now() - startTime
      });
      
      throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Rotate encryption keys and re-encrypt data
   */
  async rotateKeys(
    oldKeyId: string,
    newKeyId?: string
  ): Promise<KeyRotationResult> {
    const rotationId = `rotation_${Date.now()}_${randomBytes(8).toString('hex')}`;
    const startTime = Date.now();

    try {
      // Generate new key if not provided
      const activeNewKeyId = newKeyId || await this.generateNewKey();
      
      // Start rotation tracking
      await this.supabase
        .from('key_rotations')
        .insert({
          id: rotationId,
          old_key_id: oldKeyId,
          new_key_id: activeNewKeyId,
          status: 'in_progress'
        });

      let recordsProcessed = 0;
      const errors: string[] = [];

      // Rotate events table
      try {
        const eventsResult = await this.rotateTableKeys('events', oldKeyId, activeNewKeyId);
        recordsProcessed += eventsResult.processed;
        errors.push(...eventsResult.errors);
      } catch (error) {
        errors.push(`Events rotation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      // Rotate contacts table
      try {
        const contactsResult = await this.rotateTableKeys('contacts', oldKeyId, activeNewKeyId);
        recordsProcessed += contactsResult.processed;
        errors.push(...contactsResult.errors);
      } catch (error) {
        errors.push(`Contacts rotation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      // Mark rotation as completed
      const rotationStatus = errors.length === 0 ? 'completed' : 'failed';
      await this.supabase
        .from('key_rotations')
        .update({
          status: rotationStatus,
          completed_at: new Date().toISOString(),
          records_migrated: recordsProcessed,
          error_details: errors.length > 0 ? { errors } : null
        })
        .eq('id', rotationId);

      // If rotation successful, mark old key as inactive
      if (rotationStatus === 'completed') {
        await this.supabase
          .from('encryption_keys')
          .update({ status: 'inactive' })
          .eq('key_id', oldKeyId);
      }

      return {
        success: rotationStatus === 'completed',
        recordsProcessed,
        errors,
        newKeyId: activeNewKeyId,
        rotationId
      };
    } catch (error) {
      // Mark rotation as failed
      await this.supabase
        .from('key_rotations')
        .update({
          status: 'failed',
          error_details: { error: error instanceof Error ? error.message : 'Unknown error' }
        })
        .eq('id', rotationId);

      throw error;
    }
  }

  /**
   * Generate a new encryption key
   */
  async generateNewKey(): Promise<string> {
    const keyId = `key_${Date.now()}_${randomBytes(8).toString('hex')}`;
    const masterKey = await this.getMasterKey();
    const salt = randomBytes(SALT_LENGTH);
    const derivedKey = scryptSync(masterKey, salt, KEY_LENGTH);
    
    // Encrypt the key itself with master key
    const keyIv = randomBytes(IV_LENGTH);
    const keyCipher = createCipheriv(ALGORITHM, masterKey.subarray(0, KEY_LENGTH), keyIv);
    const encryptedKey = Buffer.concat([
      keyIv,
      salt,
      keyCipher.update(derivedKey),
      keyCipher.final(),
      keyCipher.getAuthTag()
    ]);

    // Store encrypted key in database
    await this.supabase
      .from('encryption_keys')
      .insert({
        key_id: keyId,
        encrypted_key: encryptedKey,
        algorithm: ALGORITHM,
        key_version: 1,
        status: 'active'
      });

    return keyId;
  }

  /**
   * Get active encryption key ID
   */
  private async getActiveKeyId(): Promise<string> {
    const { data, error } = await this.supabase
      .from('encryption_keys')
      .select('key_id')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      throw new Error('No active encryption key found');
    }

    return data.key_id;
  }

  /**
   * Get decryption key from cache or database
   */
  private async getDecryptionKey(keyId: string): Promise<Buffer> {
    // Check cache first
    const cachedKey = this.keyCache.get(keyId);
    const cacheTime = this.keyTimestamps.get(keyId);
    
    if (cachedKey && cacheTime && Date.now() - cacheTime < this.cacheTimeout) {
      return cachedKey;
    }

    // Fetch from database
    const { data, error } = await this.supabase
      .from('encryption_keys')
      .select('encrypted_key, algorithm')
      .eq('key_id', keyId)
      .eq('status', 'active')
      .single();

    if (error || !data) {
      throw new Error(`Encryption key not found: ${keyId}`);
    }

    // Decrypt the key
    const decryptedKey = await this.decryptStoredKey(data.encrypted_key);
    
    // Cache the decrypted key
    this.keyCache.set(keyId, decryptedKey);
    this.keyTimestamps.set(keyId, Date.now());

    return decryptedKey;
  }

  /**
   * Decrypt a stored encryption key using master key
   */
  private async decryptStoredKey(encryptedKey: Uint8Array): Promise<Buffer> {
    const masterKey = await this.getMasterKey();
    const encryptedBuffer = Buffer.from(encryptedKey);
    
    // Extract components
    const keyIv = encryptedBuffer.subarray(0, IV_LENGTH);
    const salt = encryptedBuffer.subarray(IV_LENGTH, IV_LENGTH + SALT_LENGTH);
    const tag = encryptedBuffer.subarray(encryptedBuffer.length - TAG_LENGTH);
    const encrypted = encryptedBuffer.subarray(IV_LENGTH + SALT_LENGTH, encryptedBuffer.length - TAG_LENGTH);
    
    // Decrypt
    const decipher = createDecipheriv(ALGORITHM, masterKey.subarray(0, KEY_LENGTH), keyIv);
    decipher.setAuthTag(tag);
    
    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);
  }

  /**
   * Get master key (in production, this would be from a secure key management service)
   */
  private async getMasterKey(): Promise<Buffer> {
    // In production, this would fetch from AWS KMS, HashiCorp Vault, etc.
    // For now, derive from environment variable
    const masterKeyHex = process.env.MASTER_ENCRYPTION_KEY;
    if (!masterKeyHex) {
      throw new Error('MASTER_ENCRYPTION_KEY environment variable not set');
    }

    return Buffer.from(masterKeyHex, 'hex');
  }

  /**
   * Rotate keys for a specific table
   */
  private async rotateTableKeys(
    tableName: 'events' | 'contacts',
    oldKeyId: string,
    newKeyId: string
  ): Promise<{ processed: number; errors: string[] }> {
    const batchSize = 1000;
    let processed = 0;
    const errors: string[] = [];
    let offset = 0;

    while (true) {
      // Fetch batch of records with old key
      const { data: records, error } = await this.supabase
        .from(tableName)
        .select('id, encrypted_number, number')
        .eq('encryption_key_id', oldKeyId)
        .range(offset, offset + batchSize - 1);

      if (error || !records || records.length === 0) {
        break;
      }

      // Process batch
      for (const record of records) {
        try {
          // Decrypt with old key
          const decrypted = await this.decryptField(
            {
              encryptedData: Buffer.from(record.encrypted_number),
              keyId: oldKeyId,
              algorithm: ALGORITHM,
              version: 1
            },
            {
              userId: 'system',
              purpose: 'key_rotation',
              auditTrail: false
            }
          );

          // Encrypt with new key
          const reEncrypted = await this.encryptField(decrypted, 'phone_number', newKeyId);

          // Update record
          await this.supabase
            .from(tableName)
            .update({
              encrypted_number: reEncrypted.encryptedData,
              encryption_key_id: newKeyId
            })
            .eq('id', record.id);

          processed++;
        } catch (error) {
          errors.push(`Record ${record.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      offset += batchSize;

      // Safety check to prevent infinite loops
      if (offset > 1000000) {
        errors.push(`Processing stopped at offset ${offset} for safety`);
        break;
      }
    }

    return { processed, errors };
  }

  /**
   * Log encryption operation for audit
   */
  private async logEncryptionOperation(params: {
    operation: 'encrypt' | 'decrypt';
    fieldType?: string;
    keyId: string;
    success: boolean;
    error?: string;
    executionTimeMs: number;
  }): Promise<void> {
    try {
      await this.supabase
        .from('enhanced_audit_log')
        .insert({
          actor_type: 'system',
          category: 'security',
          action: params.operation,
          severity: 'low',
          outcome: params.success ? 'success' : 'failure',
          resource: 'encryption',
          description: `Field ${params.operation} operation`,
          processing_time_ms: params.executionTimeMs,
          metadata: {
            field_type: params.fieldType,
            key_id: params.keyId,
            error: params.error,
            algorithm: ALGORITHM
          }
        });
    } catch (error) {
      // Silently fail audit logging to avoid breaking encryption operations
      console.error('Failed to log encryption operation:', error);
    }
  }

  /**
   * Log decryption operation for audit
   */
  private async logDecryptionOperation(params: {
    userId: string;
    purpose: string;
    keyId: string;
    success: boolean;
    error?: string;
    executionTimeMs: number;
  }): Promise<void> {
    try {
      await this.supabase
        .from('enhanced_audit_log')
        .insert({
          actor_id: params.userId,
          actor_type: 'user',
          category: 'data_access',
          action: 'decrypt',
          severity: 'medium',
          outcome: params.success ? 'success' : 'failure',
          resource: 'encrypted_field',
          description: `Field decryption for ${params.purpose}`,
          processing_time_ms: params.executionTimeMs,
          metadata: {
            purpose: params.purpose,
            key_id: params.keyId,
            error: params.error,
            algorithm: ALGORITHM
          }
        });
    } catch (error) {
      // Silently fail audit logging to avoid breaking decryption operations
      console.error('Failed to log decryption operation:', error);
    }
  }

  /**
   * List all encryption keys with their status
   */
  async listKeys(): Promise<EncryptionKeyInfo[]> {
    const { data, error } = await this.supabase
      .from('encryption_keys')
      .select('key_id, algorithm, key_version, created_at, expires_at, status')
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to list keys: ${error.message}`);
    }

    return data.map(key => ({
      keyId: key.key_id,
      algorithm: key.algorithm,
      version: key.key_version,
      createdAt: new Date(key.created_at),
      expiresAt: key.expires_at ? new Date(key.expires_at) : undefined,
      status: key.status as 'active' | 'inactive' | 'revoked' | 'expired'
    }));
  }

  /**
   * Clear key cache (useful for testing or security purposes)
   */
  clearKeyCache(): void {
    this.keyCache.clear();
    this.keyTimestamps.clear();
  }

  /**
   * Check if field-level encryption is enabled for a user
   */
  async isEncryptionEnabled(userId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .rpc('is_encryption_enabled', { p_user_id: userId });

    if (error) {
      console.error('Failed to check encryption status:', error);
      return false;
    }

    return data === true;
  }
}

export default EncryptionService;

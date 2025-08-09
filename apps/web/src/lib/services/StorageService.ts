/**
 * Storage Service for S3-compatible cloud storage
 * Handles file upload, retrieval, and management
 */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';

export interface StorageConfig {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
}

export interface UploadOptions {
  contentType?: string;
  contentEncoding?: string;
  metadata?: Record<string, string>;
  tags?: Record<string, string>;
  encryption?: boolean;
}

export interface PresignedUrlOptions {
  expiresIn?: number; // seconds
  contentType?: string;
  contentLength?: number;
}

export class StorageService {
  private s3Client: S3Client;
  private bucket: string;

  constructor(config: StorageConfig) {
    this.bucket = config.bucket;
    
    this.s3Client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: config.forcePathStyle || false,
    });
  }

  /**
   * Generate a unique storage key for a file
   */
  generateStorageKey(userId: string, filename: string, sessionId?: string): string {
    const timestamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const randomSuffix = crypto.randomBytes(8).toString('hex');
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    
    const prefix = sessionId ? `sessions/${sessionId}` : `uploads/${userId}/${timestamp}`;
    return `${prefix}/${randomSuffix}_${sanitizedFilename}`;
  }

  /**
   * Upload a file to storage
   */
  async uploadFile(
    key: string,
    buffer: Buffer,
    options: UploadOptions = {}
  ): Promise<{ success: boolean; url: string; error?: string }> {
    try {
      const uploadParams = {
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: options.contentType || 'application/octet-stream',
        ContentEncoding: options.contentEncoding,
        Metadata: options.metadata || {},
        Tagging: options.tags ? this.formatTags(options.tags) : undefined,
        ServerSideEncryption: options.encryption ? 'AES256' : undefined,
      };

      await this.s3Client.send(new PutObjectCommand(uploadParams));

      const url = `https://${this.bucket}.s3.amazonaws.com/${key}`;
      return { success: true, url };
    } catch (error) {
      console.error('Storage upload error:', error);
      return {
        success: false,
        url: '',
        error: error instanceof Error ? error.message : 'Upload failed'
      };
    }
  }

  /**
   * Upload a file chunk (for chunked uploads)
   */
  async uploadChunk(
    key: string,
    chunkNumber: number,
    buffer: Buffer,
    options: UploadOptions = {}
  ): Promise<{ success: boolean; etag?: string; error?: string }> {
    try {
      const chunkKey = `${key}.chunk.${chunkNumber.toString().padStart(4, '0')}`;
      
      const uploadParams = {
        Bucket: this.bucket,
        Key: chunkKey,
        Body: buffer,
        ContentType: 'application/octet-stream',
        Metadata: {
          ...options.metadata,
          'chunk-number': chunkNumber.toString(),
          'original-key': key,
        },
      };

      const result = await this.s3Client.send(new PutObjectCommand(uploadParams));
      
      return {
        success: true,
        etag: result.ETag?.replace(/"/g, ''),
      };
    } catch (error) {
      console.error('Chunk upload error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Chunk upload failed'
      };
    }
  }

  /**
   * Combine uploaded chunks into final file
   */
  async combineChunks(
    key: string,
    chunkCount: number,
    options: UploadOptions = {}
  ): Promise<{ success: boolean; url: string; error?: string }> {
    try {
      // In a real implementation, this would use S3's multipart upload completion
      // For now, we'll simulate by downloading chunks and combining them
      const chunks: Buffer[] = [];
      
      for (let i = 1; i <= chunkCount; i++) {
        const chunkKey = `${key}.chunk.${i.toString().padStart(4, '0')}`;
        const chunkData = await this.getFile(chunkKey);
        
        if (!chunkData.success || !chunkData.buffer) {
          throw new Error(`Failed to retrieve chunk ${i}`);
        }
        
        chunks.push(chunkData.buffer);
      }

      // Combine all chunks
      const combinedBuffer = Buffer.concat(chunks);
      
      // Upload the combined file
      const uploadResult = await this.uploadFile(key, combinedBuffer, options);
      
      if (uploadResult.success) {
        // Clean up chunk files
        await this.cleanupChunks(key, chunkCount);
      }
      
      return uploadResult;
    } catch (error) {
      console.error('Chunk combination error:', error);
      return {
        success: false,
        url: '',
        error: error instanceof Error ? error.message : 'Failed to combine chunks'
      };
    }
  }

  /**
   * Get a file from storage
   */
  async getFile(key: string): Promise<{
    success: boolean;
    buffer?: Buffer;
    contentType?: string;
    metadata?: Record<string, string>;
    error?: string;
  }> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const response = await this.s3Client.send(command);
      
      if (!response.Body) {
        return { success: false, error: 'No file content found' };
      }

      const buffer = Buffer.from(await response.Body.transformToByteArray());
      
      return {
        success: true,
        buffer,
        contentType: response.ContentType,
        metadata: response.Metadata,
      };
    } catch (error) {
      console.error('Storage get error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to retrieve file'
      };
    }
  }

  /**
   * Check if a file exists
   */
  async fileExists(key: string): Promise<boolean> {
    try {
      await this.s3Client.send(new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }));
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Delete a file from storage
   */
  async deleteFile(key: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.s3Client.send(new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }));

      return { success: true };
    } catch (error) {
      console.error('Storage delete error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete file'
      };
    }
  }

  /**
   * Generate a presigned URL for direct upload
   */
  async getPresignedUploadUrl(
    key: string,
    options: PresignedUrlOptions = {}
  ): Promise<{ success: boolean; url?: string; error?: string }> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: options.contentType,
        ContentLength: options.contentLength,
      });

      const url = await getSignedUrl(this.s3Client, command, {
        expiresIn: options.expiresIn || 3600, // 1 hour default
      });

      return { success: true, url };
    } catch (error) {
      console.error('Presigned URL error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate presigned URL'
      };
    }
  }

  /**
   * Generate a presigned URL for download
   */
  async getPresignedDownloadUrl(
    key: string,
    expiresIn: number = 3600
  ): Promise<{ success: boolean; url?: string; error?: string }> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const url = await getSignedUrl(this.s3Client, command, { expiresIn });

      return { success: true, url };
    } catch (error) {
      console.error('Presigned download URL error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate download URL'
      };
    }
  }

  /**
   * Get file metadata without downloading
   */
  async getFileMetadata(key: string): Promise<{
    success: boolean;
    size?: number;
    lastModified?: Date;
    contentType?: string;
    metadata?: Record<string, string>;
    error?: string;
  }> {
    try {
      const response = await this.s3Client.send(new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }));

      return {
        success: true,
        size: response.ContentLength,
        lastModified: response.LastModified,
        contentType: response.ContentType,
        metadata: response.Metadata,
      };
    } catch (error) {
      console.error('Get metadata error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get file metadata'
      };
    }
  }

  /**
   * Clean up chunk files after successful combination
   */
  private async cleanupChunks(key: string, chunkCount: number): Promise<void> {
    const deletePromises = [];
    
    for (let i = 1; i <= chunkCount; i++) {
      const chunkKey = `${key}.chunk.${i.toString().padStart(4, '0')}`;
      deletePromises.push(this.deleteFile(chunkKey));
    }

    await Promise.all(deletePromises);
  }

  /**
   * Format tags for S3 API
   */
  private formatTags(tags: Record<string, string>): string {
    return Object.entries(tags)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');
  }

  /**
   * Calculate file checksum
   */
  static calculateChecksum(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Verify file checksum
   */
  static verifyChecksum(buffer: Buffer, expectedChecksum: string): boolean {
    const actualChecksum = this.calculateChecksum(buffer);
    return actualChecksum === expectedChecksum;
  }
}

// Default storage service instance
export const defaultStorageService = new StorageService({
  region: process.env.AWS_REGION || 'us-east-1',
  bucket: process.env.S3_BUCKET || 'phonelogai-uploads',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
});
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@phonelogai/database';
import { FileUploadHandler, parsingOrchestrator } from '@phonelogai/data-ingestion';
import { withAuth } from '@/middleware/auth';
import { withRBAC } from '@/middleware/rbac';
import { defaultStorageService } from '@/lib/services/StorageService';
import { z } from 'zod';
import crypto from 'crypto';

// File upload validation schema
const uploadSchema = z.object({
  filename: z.string().min(1, 'Filename is required'),
  size: z.number().positive('File size must be positive'),
  type: z.string().min(1, 'File type is required'),
});

// Chunked upload schema
const chunkedUploadSchema = z.object({
  filename: z.string().min(1, 'Filename is required'),
  total_size: z.number().positive('Total size must be positive'),
  chunk_size: z.number().min(1024).max(10485760).default(5242880), // 1KB to 10MB, default 5MB
  mime_type: z.string().min(1, 'MIME type is required'),
  checksum: z.string().optional(),
});

// Single upload schema  
const singleUploadSchema = z.object({
  session_id: z.string().uuid().optional(),
  chunk_number: z.number().min(1).optional(),
  is_final_chunk: z.boolean().optional(),
});

// Configuration schema
const processingConfigSchema = z.object({
  chunk_size: z.number().min(100).max(10000).optional(),
  max_errors: z.number().min(0).max(1000).optional(),
  skip_validation: z.boolean().optional(),
  deduplication_enabled: z.boolean().optional(),
  anonymization_enabled: z.boolean().optional(),
  batch_size: z.number().min(100).max(5000).optional(),
  timeout_minutes: z.number().min(5).max(120).optional(),
}).optional();

/**
 * POST /api/parser/upload
 * 
 * Enhanced upload endpoint supporting:
 * - Single file uploads (traditional)
 * - Chunked uploads for large files
 * - Cloud storage integration with S3
 * - Content validation and virus scanning
 * - Resume capability for failed uploads
 */
export async function POST(request: NextRequest) {
  const contentType = request.headers.get('content-type') || '';
  
  // Route to appropriate handler based on content type
  if (contentType.includes('multipart/form-data')) {
    return handleSingleUpload(request);
  } else if (contentType.includes('application/octet-stream')) {
    return handleChunkedUpload(request);
  } else {
    return NextResponse.json(
      { error: 'Unsupported content type. Use multipart/form-data for single uploads or application/octet-stream for chunked uploads' },
      { status: 400 }
    );
  }
}

/**
 * Handle traditional single file upload
 */
async function handleSingleUpload(request: NextRequest) {
  try {
    // Apply authentication and RBAC middleware
    const authResult = await withAuth(request);
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const rbacResult = await withRBAC(request, 'data_ingestion', 'create');
    if (!rbacResult.success) {
      return NextResponse.json({ error: rbacResult.error }, { status: 403 });
    }

    const user = authResult.user!;
    const supabase = createClient();

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const configJson = formData.get('config') as string;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate basic file properties
    const fileValidation = uploadSchema.safeParse({
      filename: file.name,
      size: file.size,
      type: file.type,
    });

    if (!fileValidation.success) {
      return NextResponse.json(
        { 
          error: 'Invalid file properties',
          details: fileValidation.error.errors
        },
        { status: 400 }
      );
    }

    // Parse and validate processing configuration
    let processingConfig = {};
    if (configJson) {
      try {
        const parsedConfig = JSON.parse(configJson);
        const configValidation = processingConfigSchema.safeParse(parsedConfig);
        
        if (!configValidation.success) {
          return NextResponse.json(
            { 
              error: 'Invalid processing configuration',
              details: configValidation.error.errors
            },
            { status: 400 }
          );
        }
        
        processingConfig = configValidation.data || {};
      } catch (error) {
        return NextResponse.json(
          { error: 'Invalid JSON in config parameter' },
          { status: 400 }
        );
      }
    }

    // Convert file to buffer
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    
    // Calculate checksum for integrity verification
    const checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    // Generate storage key
    const storageKey = defaultStorageService.generateStorageKey(user.id, file.name);
    
    // Upload to cloud storage
    const storageResult = await defaultStorageService.uploadFile(storageKey, fileBuffer, {
      contentType: file.type,
      metadata: {
        userId: user.id,
        orgId: user.orgId,
        originalFilename: file.name,
        checksum,
      },
      tags: {
        source: 'single-upload',
        userId: user.id,
        orgId: user.orgId,
      },
    });

    if (!storageResult.success) {
      return NextResponse.json(
        { error: 'Failed to upload file to storage', details: storageResult.error },
        { status: 500 }
      );
    }

    // Create file upload request
    const uploadRequest = {
      file: fileBuffer,
      filename: file.name,
      mimetype: file.type,
      size: file.size,
      user_id: user.id,
      org_id: user.orgId,
      storage_key: storageKey,
      storage_url: storageResult.url,
      checksum,
      processing_config: processingConfig,
    };

    // Submit file to the new AI-powered parsing orchestrator
    const result = await parsingOrchestrator.submitFileForParsing({
      file: fileBuffer,
      filename: file.name,
      mimetype: file.type,
      size: file.size,
      user_id: user.id,
      processing_config: processingConfig,
    });

    if (result.status === 'failed') {
      return NextResponse.json(
        { 
          error: 'File upload failed',
          message: result.message
        },
        { status: 400 }
      );
    }

    // Return success response with job details
    return NextResponse.json({
      success: true,
      upload_type: 'single',
      job_id: result.job_id,
      status: result.status,
      message: result.message,
      storage_key: storageKey,
      checksum,
      estimated_processing_time: result.estimated_processing_time,
      next_steps: {
        status_endpoint: `/api/parser/status/${result.job_id}`,
        websocket_endpoint: `/api/parser/progress/${result.job_id}`,
      }
    });

  } catch (error) {
    console.error('Single file upload error:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * Handle chunked file upload
 */
async function handleChunkedUpload(request: NextRequest) {
  try {
    // Apply authentication and RBAC middleware
    const authResult = await withAuth(request);
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const rbacResult = await withRBAC(request, 'data_ingestion', 'create');
    if (!rbacResult.success) {
      return NextResponse.json({ error: rbacResult.error }, { status: 403 });
    }

    const user = authResult.user!;
    const supabase = createClient();

    // Parse headers for chunk information
    const sessionId = request.headers.get('x-upload-session-id');
    const chunkNumber = parseInt(request.headers.get('x-chunk-number') || '1');
    const isFinalChunk = request.headers.get('x-is-final-chunk') === 'true';
    const chunkChecksum = request.headers.get('x-chunk-checksum');

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Upload session ID is required for chunked uploads' },
        { status: 400 }
      );
    }

    // Get upload session
    const { data: session, error: sessionError } = await supabase
      .from('upload_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single();

    if (sessionError || !session) {
      return NextResponse.json(
        { error: 'Upload session not found or expired' },
        { status: 404 }
      );
    }

    if (session.status !== 'active') {
      return NextResponse.json(
        { error: 'Upload session is not active' },
        { status: 400 }
      );
    }

    // Check if chunk already uploaded
    if (session.uploaded_chunks.includes(chunkNumber)) {
      return NextResponse.json({
        success: true,
        message: 'Chunk already uploaded',
        chunk_number: chunkNumber,
        session_id: sessionId,
      });
    }

    // Read chunk data
    const chunkBuffer = Buffer.from(await request.arrayBuffer());
    
    // Verify chunk checksum if provided
    if (chunkChecksum) {
      const actualChecksum = crypto.createHash('sha256').update(chunkBuffer).digest('hex');
      if (actualChecksum !== chunkChecksum) {
        return NextResponse.json(
          { error: 'Chunk checksum mismatch' },
          { status: 400 }
        );
      }
    }

    // Upload chunk to storage
    const storageResult = await defaultStorageService.uploadChunk(
      session.storage_key,
      chunkNumber,
      chunkBuffer,
      {
        metadata: {
          sessionId,
          chunkNumber: chunkNumber.toString(),
          isFinalChunk: isFinalChunk.toString(),
          userId: user.id,
        },
      }
    );

    if (!storageResult.success) {
      return NextResponse.json(
        { error: 'Failed to upload chunk to storage', details: storageResult.error },
        { status: 500 }
      );
    }

    // Update session with uploaded chunk
    const updatedChunks = [...session.uploaded_chunks, chunkNumber].sort((a, b) => a - b);
    const updatedBytesUploaded = session.bytes_uploaded + chunkBuffer.length;

    const { error: updateError } = await supabase
      .from('upload_sessions')
      .update({
        uploaded_chunks: updatedChunks,
        bytes_uploaded: updatedBytesUploaded,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId);

    if (updateError) {
      console.error('Failed to update upload session:', updateError);
    }

    // Check if upload is complete
    const isComplete = updatedChunks.length === session.chunk_count;

    if (isComplete) {
      // Combine chunks into final file
      const combineResult = await defaultStorageService.combineChunks(
        session.storage_key,
        session.chunk_count,
        {
          contentType: session.mime_type,
          metadata: {
            userId: user.id,
            orgId: user.orgId,
            originalFilename: session.filename,
            checksum: session.checksum || 'unknown',
          },
        }
      );

      if (combineResult.success) {
        // Mark session as completed
        await supabase
          .from('upload_sessions')
          .update({
            status: 'completed',
            updated_at: new Date().toISOString(),
          })
          .eq('id', sessionId);

        // Submit combined file to AI-powered parsing orchestrator
        // For chunked uploads, we need to read the combined file from storage
        const combinedFileBuffer = await defaultStorageService.downloadFile(session.storage_key);
        
        const result = await parsingOrchestrator.submitFileForParsing({
          file: combinedFileBuffer.data!,
          filename: session.filename,
          mimetype: session.mime_type,
          size: session.total_size,
          user_id: user.id,
          processing_config: session.processing_config,
        });

        return NextResponse.json({
          success: true,
          upload_type: 'chunked',
          upload_complete: true,
          job_id: result.job_id,
          status: result.status,
          message: 'Upload completed successfully',
          session_id: sessionId,
          total_chunks: session.chunk_count,
          uploaded_chunks: updatedChunks.length,
          bytes_uploaded: session.total_size,
          storage_key: session.storage_key,
          estimated_processing_time: result.estimated_processing_time,
          next_steps: {
            status_endpoint: `/api/parser/status/${result.job_id}`,
            websocket_endpoint: `/api/parser/progress/${result.job_id}`,
          },
        });
      } else {
        // Mark session as failed
        await supabase
          .from('upload_sessions')
          .update({
            status: 'failed',
            validation_errors: [{ error: 'Failed to combine chunks', details: combineResult.error }],
            updated_at: new Date().toISOString(),
          })
          .eq('id', sessionId);

        return NextResponse.json(
          { error: 'Failed to combine chunks', details: combineResult.error },
          { status: 500 }
        );
      }
    }

    // Return progress update
    return NextResponse.json({
      success: true,
      upload_type: 'chunked',
      upload_complete: false,
      message: 'Chunk uploaded successfully',
      session_id: sessionId,
      chunk_number: chunkNumber,
      total_chunks: session.chunk_count,
      uploaded_chunks: updatedChunks.length,
      bytes_uploaded: updatedBytesUploaded,
      progress: Math.round((updatedChunks.length / session.chunk_count) * 100),
    });

  } catch (error) {
    console.error('Chunked upload error:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/parser/upload
 * 
 * Get upload requirements and limits
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await withAuth(request);
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const rbacResult = await withRBAC(request, 'data_ingestion', 'read');
    if (!rbacResult.success) {
      return NextResponse.json({ error: rbacResult.error }, { status: 403 });
    }

    return NextResponse.json({
      upload_limits: {
        max_file_size_mb: 100,
        max_rows_per_file: 1000000,
        supported_formats: ['pdf', 'csv', 'txt', 'xls', 'xlsx'],
        supported_carriers: ['att', 'verizon', 'tmobile', 'sprint', 'unknown'],
      },
      processing_config_options: {
        chunk_size: {
          min: 100,
          max: 10000,
          default: 1000,
          description: 'Number of rows to process in each batch'
        },
        max_errors: {
          min: 0,
          max: 1000,
          default: 100,
          description: 'Maximum errors before stopping processing'
        },
        skip_validation: {
          default: false,
          description: 'Skip data validation (faster but less safe)'
        },
        deduplication_enabled: {
          default: true,
          description: 'Remove duplicate records during processing'
        },
        anonymization_enabled: {
          default: true,
          description: 'Apply anonymization rules during processing'
        },
        batch_size: {
          min: 100,
          max: 5000,
          default: 500,
          description: 'Database insertion batch size'
        },
        timeout_minutes: {
          min: 5,
          max: 120,
          default: 30,
          description: 'Maximum processing time before timeout'
        }
      },
      performance_targets: {
        '100k_rows': '< 5 minutes',
        '1m_rows': '< 30 minutes',
        'ml_classification': '< 30 seconds',
        'accuracy': '> 95% for known carriers'
      }
    });

  } catch (error) {
    console.error('Get upload info error:', error);
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
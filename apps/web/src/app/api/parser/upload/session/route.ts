import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@phonelogai/database';
import { withAuth } from '@/middleware/auth';
import { withRBAC } from '@/middleware/rbac';
import { defaultStorageService } from '@/lib/services/StorageService';
import { z } from 'zod';
import crypto from 'crypto';

// Upload session creation schema
const createSessionSchema = z.object({
  filename: z.string().min(1, 'Filename is required'),
  total_size: z.number().positive('Total size must be positive').max(107374182400), // 100GB
  mime_type: z.string().min(1, 'MIME type is required'),
  chunk_size: z.number().min(1024).max(10485760).default(5242880), // 1KB to 10MB, default 5MB
  checksum: z.string().optional(),
  processing_config: z.object({
    chunk_size: z.number().min(100).max(10000).optional(),
    max_errors: z.number().min(0).max(1000).optional(),
    skip_validation: z.boolean().optional(),
    deduplication_enabled: z.boolean().optional(),
    anonymization_enabled: z.boolean().optional(),
    batch_size: z.number().min(100).max(5000).optional(),
    timeout_minutes: z.number().min(5).max(120).optional(),
  }).optional(),
});

/**
 * POST /api/parser/upload/session
 * 
 * Create a new upload session for chunked uploads
 */
export async function POST(request: NextRequest) {
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
    const requestData = await request.json();

    // Validate request data
    const validation = createSessionSchema.safeParse(requestData);
    if (!validation.success) {
      return NextResponse.json(
        { 
          error: 'Invalid request data',
          details: validation.error.errors
        },
        { status: 400 }
      );
    }

    const { filename, total_size, mime_type, chunk_size, checksum, processing_config } = validation.data;

    // Calculate number of chunks needed
    const chunk_count = Math.ceil(total_size / chunk_size);

    // Validate file type
    const supportedMimeTypes = [
      'application/pdf',
      'text/csv',
      'application/csv',
      'text/plain',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/json',
    ];

    if (!supportedMimeTypes.includes(mime_type)) {
      return NextResponse.json(
        { error: 'Unsupported file type', supported_types: supportedMimeTypes },
        { status: 400 }
      );
    }

    // Check user's active sessions limit
    const supabase = createClient();
    const { data: activeSessions, error: sessionCountError } = await supabase
      .from('upload_sessions')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .gte('expires_at', new Date().toISOString());

    if (sessionCountError) {
      console.error('Failed to check active sessions:', sessionCountError);
      return NextResponse.json(
        { error: 'Failed to check active sessions' },
        { status: 500 }
      );
    }

    if (activeSessions.length >= 5) { // Limit to 5 concurrent uploads per user
      return NextResponse.json(
        { error: 'Too many active upload sessions. Please complete or cancel existing uploads.' },
        { status: 429 }
      );
    }

    // Generate storage key
    const sessionId = crypto.randomUUID();
    const storageKey = defaultStorageService.generateStorageKey(user.id, filename, sessionId);

    // Create upload session record
    const { data: session, error: createError } = await supabase
      .from('upload_sessions')
      .insert({
        id: sessionId,
        user_id: user.id,
        org_id: user.orgId,
        filename,
        total_size,
        mime_type,
        chunk_count,
        chunk_size,
        storage_key: storageKey,
        checksum,
        processing_config: processing_config || {},
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
      })
      .select()
      .single();

    if (createError || !session) {
      console.error('Failed to create upload session:', createError);
      return NextResponse.json(
        { error: 'Failed to create upload session' },
        { status: 500 }
      );
    }

    // Generate presigned URLs for chunk uploads (optional optimization)
    const presignedUrls: Record<number, string> = {};
    
    // Only generate presigned URLs for smaller files to avoid too many URLs
    if (chunk_count <= 100) {
      for (let i = 1; i <= chunk_count; i++) {
        const chunkKey = `${storageKey}.chunk.${i.toString().padStart(4, '0')}`;
        const presignedResult = await defaultStorageService.getPresignedUploadUrl(chunkKey, {
          expiresIn: 24 * 60 * 60, // 24 hours
          contentType: 'application/octet-stream',
        });
        
        if (presignedResult.success && presignedResult.url) {
          presignedUrls[i] = presignedResult.url;
        }
      }
    }

    return NextResponse.json({
      success: true,
      session: {
        id: session.id,
        filename: session.filename,
        total_size: session.total_size,
        chunk_size: session.chunk_size,
        chunk_count: session.chunk_count,
        mime_type: session.mime_type,
        storage_key: session.storage_key,
        expires_at: session.expires_at,
        created_at: session.created_at,
      },
      upload_instructions: {
        endpoint: '/api/parser/upload',
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Upload-Session-Id': session.id,
          'X-Chunk-Number': 'CHUNK_NUMBER (1-based)',
          'X-Is-Final-Chunk': 'true|false',
          'X-Chunk-Checksum': 'SHA256_CHECKSUM (optional)',
        },
        chunk_numbering: '1-based (1, 2, 3, ...)',
        max_chunk_size: chunk_size,
      },
      presigned_urls: Object.keys(presignedUrls).length > 0 ? presignedUrls : undefined,
      resume_info: {
        resume_endpoint: `/api/parser/upload/session/${session.id}`,
        status_endpoint: `/api/parser/upload/session/${session.id}/status`,
      },
    });

  } catch (error) {
    console.error('Create upload session error:', error);
    
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
 * GET /api/parser/upload/session
 * 
 * List user's active upload sessions
 */
export async function GET(request: NextRequest) {
  try {
    // Apply authentication and RBAC middleware
    const authResult = await withAuth(request);
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const rbacResult = await withRBAC(request, 'data_ingestion', 'read');
    if (!rbacResult.success) {
      return NextResponse.json({ error: rbacResult.error }, { status: 403 });
    }

    const user = authResult.user!;
    const supabase = createClient();

    // Get user's upload sessions
    const { data: sessions, error } = await supabase
      .from('upload_sessions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Failed to fetch upload sessions:', error);
      return NextResponse.json(
        { error: 'Failed to fetch upload sessions' },
        { status: 500 }
      );
    }

    // Format sessions data
    const formattedSessions = sessions.map(session => ({
      id: session.id,
      filename: session.filename,
      total_size: session.total_size,
      chunk_size: session.chunk_size,
      chunk_count: session.chunk_count,
      mime_type: session.mime_type,
      status: session.status,
      uploaded_chunks: session.uploaded_chunks.length,
      bytes_uploaded: session.bytes_uploaded,
      progress: Math.round((session.uploaded_chunks.length / session.chunk_count) * 100),
      created_at: session.created_at,
      updated_at: session.updated_at,
      expires_at: session.expires_at,
      
      // Status checks
      is_expired: new Date(session.expires_at) < new Date(),
      can_resume: session.status === 'active' && new Date(session.expires_at) > new Date(),
      
      // Actions available
      actions: {
        resume: session.status === 'active' && new Date(session.expires_at) > new Date(),
        cancel: session.status === 'active',
        delete: session.status !== 'active',
        retry: session.status === 'failed',
      },
    }));

    // Separate active and historical sessions
    const activeSessions = formattedSessions.filter(s => s.status === 'active' && !s.is_expired);
    const historicalSessions = formattedSessions.filter(s => s.status !== 'active' || s.is_expired);

    return NextResponse.json({
      active_sessions: activeSessions,
      historical_sessions: historicalSessions,
      summary: {
        total_sessions: sessions.length,
        active_count: activeSessions.length,
        completed_count: sessions.filter(s => s.status === 'completed').length,
        failed_count: sessions.filter(s => s.status === 'failed').length,
        expired_count: sessions.filter(s => new Date(s.expires_at) < new Date() && s.status === 'active').length,
      },
    });

  } catch (error) {
    console.error('Get upload sessions error:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
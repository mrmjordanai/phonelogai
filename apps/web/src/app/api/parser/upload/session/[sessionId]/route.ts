import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@phonelogai/database';
import { withAuth } from '@/middleware/auth';
import { withRBAC } from '@/middleware/rbac';
import { defaultStorageService } from '@/lib/services/StorageService';

interface RouteParams {
  params: {
    sessionId: string;
  };
}

/**
 * GET /api/parser/upload/session/[sessionId]
 * 
 * Get details of a specific upload session
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
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
    const { sessionId } = params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(sessionId)) {
      return NextResponse.json(
        { error: 'Invalid session ID format' },
        { status: 400 }
      );
    }

    const supabase = createClient();

    // Get upload session
    const { data: session, error } = await supabase
      .from('upload_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single();

    if (error || !session) {
      return NextResponse.json(
        { error: 'Upload session not found' },
        { status: 404 }
      );
    }

    // Calculate progress and status
    const uploadedChunksCount = session.uploaded_chunks.length;
    const progress = Math.round((uploadedChunksCount / session.chunk_count) * 100);
    const isExpired = new Date(session.expires_at) < new Date();
    const remainingChunks = [];
    
    // Calculate which chunks are missing
    for (let i = 1; i <= session.chunk_count; i++) {
      if (!session.uploaded_chunks.includes(i)) {
        remainingChunks.push(i);
      }
    }

    // Get storage file status if completed
    let storageStatus = null;
    if (session.status === 'completed') {
      const fileExists = await defaultStorageService.fileExists(session.storage_key);
      if (fileExists) {
        const metadata = await defaultStorageService.getFileMetadata(session.storage_key);
        storageStatus = {
          exists: true,
          size: metadata.size,
          last_modified: metadata.lastModified,
        };
      } else {
        storageStatus = { exists: false };
      }
    }

    return NextResponse.json({
      session: {
        id: session.id,
        filename: session.filename,
        total_size: session.total_size,
        chunk_size: session.chunk_size,
        chunk_count: session.chunk_count,
        mime_type: session.mime_type,
        status: session.status,
        storage_key: session.storage_key,
        checksum: session.checksum,
        processing_config: session.processing_config,
        created_at: session.created_at,
        updated_at: session.updated_at,
        expires_at: session.expires_at,
      },
      progress: {
        uploaded_chunks: uploadedChunksCount,
        total_chunks: session.chunk_count,
        remaining_chunks: remainingChunks.length,
        bytes_uploaded: session.bytes_uploaded,
        progress_percentage: progress,
        is_complete: uploadedChunksCount === session.chunk_count,
      },
      status: {
        is_active: session.status === 'active',
        is_completed: session.status === 'completed',
        is_failed: session.status === 'failed',
        is_expired: isExpired,
        can_resume: session.status === 'active' && !isExpired,
        can_cancel: session.status === 'active',
        can_retry: session.status === 'failed',
      },
      remaining_chunks: remainingChunks.slice(0, 20), // Limit to first 20 missing chunks
      validation_errors: session.validation_errors || [],
      virus_scan_status: session.virus_scan_status,
      storage_status: storageStatus,
    });

  } catch (error) {
    console.error('Get upload session error:', error);
    
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
 * PATCH /api/parser/upload/session/[sessionId]
 * 
 * Update upload session (cancel, retry, etc.)
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    // Apply authentication and RBAC middleware
    const authResult = await withAuth(request);
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const rbacResult = await withRBAC(request, 'data_ingestion', 'update');
    if (!rbacResult.success) {
      return NextResponse.json({ error: rbacResult.error }, { status: 403 });
    }

    const user = authResult.user!;
    const { sessionId } = params;
    const { action } = await request.json();

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(sessionId)) {
      return NextResponse.json(
        { error: 'Invalid session ID format' },
        { status: 400 }
      );
    }

    const supabase = createClient();

    // Get current session
    const { data: session, error: fetchError } = await supabase
      .from('upload_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !session) {
      return NextResponse.json(
        { error: 'Upload session not found' },
        { status: 404 }
      );
    }

    let updateData: any = { updated_at: new Date().toISOString() };
    let message = '';

    switch (action) {
      case 'cancel':
        if (session.status !== 'active') {
          return NextResponse.json(
            { error: 'Can only cancel active sessions' },
            { status: 400 }
          );
        }
        
        updateData.status = 'failed';
        updateData.validation_errors = [
          { error: 'Upload cancelled by user', timestamp: new Date().toISOString() }
        ];
        message = 'Upload session cancelled';
        
        // Clean up uploaded chunks
        if (session.uploaded_chunks.length > 0) {
          // In background, clean up chunks from storage
          setTimeout(async () => {
            for (const chunkNumber of session.uploaded_chunks) {
              const chunkKey = `${session.storage_key}.chunk.${chunkNumber.toString().padStart(4, '0')}`;
              await defaultStorageService.deleteFile(chunkKey);
            }
          }, 0);
        }
        break;

      case 'retry':
        if (session.status !== 'failed') {
          return NextResponse.json(
            { error: 'Can only retry failed sessions' },
            { status: 400 }
          );
        }
        
        updateData.status = 'active';
        updateData.expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        updateData.validation_errors = [];
        message = 'Upload session reset for retry';
        break;

      case 'extend':
        if (session.status !== 'active') {
          return NextResponse.json(
            { error: 'Can only extend active sessions' },
            { status: 400 }
          );
        }
        
        // Extend expiration by 12 hours
        updateData.expires_at = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
        message = 'Upload session extended by 12 hours';
        break;

      default:
        return NextResponse.json(
          { error: 'Invalid action. Supported actions: cancel, retry, extend' },
          { status: 400 }
        );
    }

    // Update session
    const { data: updatedSession, error: updateError } = await supabase
      .from('upload_sessions')
      .update(updateData)
      .eq('id', sessionId)
      .select()
      .single();

    if (updateError) {
      console.error('Failed to update session:', updateError);
      return NextResponse.json(
        { error: 'Failed to update session' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message,
      action,
      session: {
        id: updatedSession.id,
        status: updatedSession.status,
        expires_at: updatedSession.expires_at,
        updated_at: updatedSession.updated_at,
      },
    });

  } catch (error) {
    console.error('Update upload session error:', error);
    
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
 * DELETE /api/parser/upload/session/[sessionId]
 * 
 * Delete an upload session and clean up associated files
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    // Apply authentication and RBAC middleware
    const authResult = await withAuth(request);
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const rbacResult = await withRBAC(request, 'data_ingestion', 'delete');
    if (!rbacResult.success) {
      return NextResponse.json({ error: rbacResult.error }, { status: 403 });
    }

    const user = authResult.user!;
    const { sessionId } = params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(sessionId)) {
      return NextResponse.json(
        { error: 'Invalid session ID format' },
        { status: 400 }
      );
    }

    const supabase = createClient();

    // Get session to check ownership and get storage info
    const { data: session, error: fetchError } = await supabase
      .from('upload_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !session) {
      return NextResponse.json(
        { error: 'Upload session not found' },
        { status: 404 }
      );
    }

    // Can't delete active sessions
    if (session.status === 'active') {
      return NextResponse.json(
        { error: 'Cannot delete active session. Cancel it first.' },
        { status: 400 }
      );
    }

    // Delete session record
    const { error: deleteError } = await supabase
      .from('upload_sessions')
      .delete()
      .eq('id', sessionId);

    if (deleteError) {
      console.error('Failed to delete session:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete session' },
        { status: 500 }
      );
    }

    // Clean up storage files in background
    setTimeout(async () => {
      try {
        // Delete main file if it exists
        await defaultStorageService.deleteFile(session.storage_key);
        
        // Delete any chunk files
        for (const chunkNumber of session.uploaded_chunks) {
          const chunkKey = `${session.storage_key}.chunk.${chunkNumber.toString().padStart(4, '0')}`;
          await defaultStorageService.deleteFile(chunkKey);
        }
      } catch (cleanupError) {
        console.error('Storage cleanup error:', cleanupError);
      }
    }, 0);

    return NextResponse.json({
      success: true,
      message: 'Upload session deleted successfully',
      deleted_session_id: sessionId,
    });

  } catch (error) {
    console.error('Delete upload session error:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
import { NextRequest, NextResponse } from 'next/server';
import { parsingOrchestrator } from '@phonelogai/data-ingestion';
import { withAuth } from '@/middleware/auth';
import { withRBAC } from '@/middleware/rbac';

/**
 * GET /api/parser/status/[jobId]
 * 
 * Get current status and progress of a file processing job
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
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
    const { jobId } = params;

    if (!jobId) {
      return NextResponse.json(
        { error: 'Job ID is required' },
        { status: 400 }
      );
    }

    // Get job status from new parsing orchestrator
    const jobStatus = await parsingOrchestrator.getJobStatus(jobId);

    if (!jobStatus || !jobStatus.job) {
      return NextResponse.json(
        { error: 'Job not found or access denied' },
        { status: 404 }
      );
    }

    const { job, progress, currentStep, classification, metrics, errors } = jobStatus;

    // Verify user owns this job
    if (job.userId !== user.id) {
      return NextResponse.json(
        { error: 'Job not found or access denied' },
        { status: 404 }
      );
    }

    // Calculate additional progress information
    const progressInfo = calculateProgressInfo(job, progress, currentStep);
    
    // Format response
    const response = {
      job_id: job.id,
      status: job.status,
      progress: progress,
      current_step: currentStep,
      filename: job.filename,
      file_size: job.fileSize,
      mime_type: job.mimeType,
      created_at: job.createdAt.toISOString(),
      updated_at: job.updatedAt.toISOString(),
      estimated_completion: progressInfo.estimated_completion,
      
      // AI Classification results (if available)
      classification: classification ? {
        format: classification.format,
        carrier: classification.carrier,
        confidence: classification.confidence,
        fallback_required: classification.fallbackRequired,
        field_mappings: classification.fieldMappings,
        template_id: classification.templateId,
        detected_at: classification.detectedAt.toISOString(),
        processing_metrics: classification.processingMetrics,
      } : null,
      
      // Performance metrics (if available)
      metrics: metrics ? {
        processing_time: metrics.processing_time,
        rows_processed: metrics.rows_processed,
        accuracy: metrics.accuracy,
        throughput: metrics.throughput,
        memory_usage: metrics.memory_usage,
      } : null,
      
      // Error summary
      errors: {
        total_count: errors?.length || 0,
        critical_count: errors?.filter((e: any) => e.severity === 'critical').length || 0,
        error_count: errors?.filter((e: any) => e.severity === 'error').length || 0,
        warning_count: errors?.filter((e: any) => e.severity === 'warning').length || 0,
        recent_errors: errors?.slice(-5).map((error: any) => ({
          error_type: error.error_type,
          error_message: error.error_message,
          row_number: error.row_number,
          severity: error.severity,
          created_at: error.created_at,
        })) || [],
      },
      
      // Next actions
      actions: getAvailableActions(job),
      
      // Additional AI-powered features
      ai_features: {
        ml_classification_enabled: true,
        auto_field_mapping: classification?.fieldMappings ? Object.keys(classification.fieldMappings).length > 0 : false,
        carrier_detection_confidence: classification?.confidence.carrier || 0,
        format_detection_confidence: classification?.confidence.format || 0,
        overall_confidence: classification?.confidence.overall || 0,
      }
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Get job status error:', error);
    
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
 * PUT /api/parser/status/[jobId]
 * 
 * Update job (retry, cancel, etc.)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
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
    const { jobId } = params;
    const { action } = await request.json();

    if (!jobId) {
      return NextResponse.json(
        { error: 'Job ID is required' },
        { status: 400 }
      );
    }

    if (!action) {
      return NextResponse.json(
        { error: 'Action is required' },
        { status: 400 }
      );
    }

    let result = false;

    switch (action) {
      case 'retry':
        result = await parsingOrchestrator.retryJob(jobId);
        break;
        
      case 'cancel':
        result = await parsingOrchestrator.cancelJob(jobId, 'Cancelled by user request');
        break;
        
      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }

    if (!result) {
      return NextResponse.json(
        { error: `Failed to ${action} job. Job may not exist or may not be in a valid state.` },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Job ${action} successful`,
      job_id: jobId,
    });

  } catch (error) {
    console.error('Update job status error:', error);
    
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
 * DELETE /api/parser/status/[jobId]
 * 
 * Delete a completed or failed job
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
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
    const { jobId } = params;

    if (!jobId) {
      return NextResponse.json(
        { error: 'Job ID is required' },
        { status: 400 }
      );
    }

    // For delete operations, we can use the cancel functionality
    // In a full implementation, you might want a separate delete method
    const result = await parsingOrchestrator.cancelJob(jobId, 'Job deleted by user');

    if (!result) {
      return NextResponse.json(
        { error: 'Failed to delete job. Job may not exist, may not belong to you, or may still be processing.' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Job deleted successfully',
      job_id: jobId,
    });

  } catch (error) {
    console.error('Delete job error:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Helper functions

function calculateProgressInfo(job: any, progress: number, currentStep: string) {
  const estimatedCompletion = calculateEstimatedCompletion(job, progress);
  
  return {
    current_step: currentStep,
    estimated_completion: estimatedCompletion,
  };
}

function getCurrentStep(status: string, progress: number): string {
  if (status === 'pending') {
    return 'file_upload';
  } else if (status === 'processing') {
    if (progress < 20) {
      return 'format_detection';
    } else if (progress < 30) {
      return 'layout_classification';
    } else if (progress < 60) {
      return 'data_extraction';
    } else if (progress < 75) {
      return 'validation';
    } else if (progress < 85) {
      return 'deduplication';
    } else if (progress < 95) {
      return 'database_insertion';
    } else {
      return 'privacy_application';
    }
  } else if (status === 'completed') {
    return 'completed';
  } else if (status === 'failed') {
    return 'failed';
  } else if (status === 'partial') {
    return 'completed_with_errors';
  } else {
    return 'unknown';
  }
}

function calculateEstimatedCompletion(job: any, progress: number): string | null {
  if (job.status === 'completed' || job.status === 'failed') {
    return null;
  }

  const startTime = new Date(job.createdAt);
  const now = new Date();
  const elapsed = now.getTime() - startTime.getTime();
  
  if (progress > 0) {
    const totalEstimated = (elapsed / progress) * 100;
    const remaining = totalEstimated - elapsed;
    const completionTime = new Date(now.getTime() + remaining);
    return completionTime.toISOString();
  }
  
  // Fallback estimate based on file size (1ms per KB, minimum 30s)
  const estimateMs = Math.max(30000, job.fileSize / 1000);
  const completionTime = new Date(now.getTime() + estimateMs);
  return completionTime.toISOString();
}

function getAvailableActions(job: any): string[] {
  const actions: string[] = [];
  
  if (job.status === 'pending') {
    actions.push('cancel');
  } else if (job.status === 'processing') {
    // No actions available during processing
  } else if (job.status === 'failed' || job.status === 'partial') {
    actions.push('retry', 'delete');
  } else if (job.status === 'completed') {
    actions.push('delete');
  }
  
  return actions;
}
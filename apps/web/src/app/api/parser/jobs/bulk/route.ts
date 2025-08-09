import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@phonelogai/database';
import { withAuth } from '@/middleware/auth';
import { withRBAC } from '@/middleware/rbac';
import { getWebSocketManager } from '@/lib/services/WebSocketManager';
import { z } from 'zod';

// Bulk operations schema
const bulkOperationSchema = z.object({
  operation: z.enum(['retry', 'cancel', 'delete', 'pause', 'resume']),
  job_ids: z.array(z.string().uuid()).min(1).max(100),
  options: z.object({
    force: z.boolean().default(false),
    notify_users: z.boolean().default(true),
    reason: z.string().max(500).optional(),
  }).optional(),
});

/**
 * POST /api/parser/jobs/bulk
 * 
 * Perform bulk operations on multiple jobs
 */
export async function POST(request: NextRequest) {
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
    const requestData = await request.json();

    // Validate request
    const validation = bulkOperationSchema.safeParse(requestData);
    if (!validation.success) {
      return NextResponse.json(
        { 
          error: 'Invalid bulk operation request',
          details: validation.error.errors
        },
        { status: 400 }
      );
    }

    const { operation, job_ids, options = {} } = validation.data;

    const supabase = createClient();
    const wsManager = getWebSocketManager();

    // Get jobs and verify ownership/permissions
    const { data: jobs, error: fetchError } = await supabase
      .from('parser_jobs')
      .select('*')
      .in('id', job_ids)
      .eq('user_id', user.id); // Ensure user owns the jobs

    if (fetchError) {
      console.error('Failed to fetch jobs:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch jobs' },
        { status: 500 }
      );
    }

    if (jobs.length !== job_ids.length) {
      const foundIds = jobs.map(j => j.id);
      const missingIds = job_ids.filter(id => !foundIds.includes(id));
      
      return NextResponse.json(
        { 
          error: 'Some jobs not found or access denied',
          missing_jobs: missingIds,
          found_jobs: foundIds.length,
          requested_jobs: job_ids.length
        },
        { status: 404 }
      );
    }

    // Validate operation is allowed for each job
    const operationResults: Array<{
      job_id: string;
      success: boolean;
      error?: string;
      previous_status?: string;
      new_status?: string;
    }> = [];

    const validationErrors: string[] = [];

    for (const job of jobs) {
      const validationResult = validateJobOperation(job, operation, options);
      if (!validationResult.valid) {
        validationErrors.push(`Job ${job.id}: ${validationResult.reason}`);
      }
    }

    if (validationErrors.length > 0 && !options.force) {
      return NextResponse.json(
        { 
          error: 'Some operations cannot be performed',
          validation_errors: validationErrors,
          hint: 'Use force: true to override validation errors'
        },
        { status: 400 }
      );
    }

    // Perform bulk operation
    const startTime = Date.now();

    for (const job of jobs) {
      try {
        const result = await performJobOperation(job, operation, options, user.id, supabase);
        
        operationResults.push({
          job_id: job.id,
          success: result.success,
          error: result.error,
          previous_status: job.status,
          new_status: result.new_status,
        });

        // Send real-time notification
        if (options.notify_users && result.success) {
          wsManager.sendJobProgress(job.id, {
            status: result.new_status,
            message: `Job ${operation} completed`,
            bulk_operation: true,
          }, user.id);
        }

      } catch (error) {
        console.error(`Failed to ${operation} job ${job.id}:`, error);
        operationResults.push({
          job_id: job.id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          previous_status: job.status,
        });
      }
    }

    // Calculate summary
    const successCount = operationResults.filter(r => r.success).length;
    const failureCount = operationResults.length - successCount;
    const processingTime = Date.now() - startTime;

    // Log bulk operation
    await supabase
      .from('audit_log')
      .insert({
        user_id: user.id,
        action: `bulk_${operation}`,
        resource_type: 'parser_jobs',
        resource_ids: job_ids,
        metadata: {
          operation,
          success_count: successCount,
          failure_count: failureCount,
          processing_time_ms: processingTime,
          options,
        },
      });

    // Send summary notification
    if (options.notify_users) {
      wsManager.sendSystemNotification({
        type: 'bulk_operation_complete',
        operation,
        total_jobs: job_ids.length,
        successful: successCount,
        failed: failureCount,
        processing_time_ms: processingTime,
      }, { userId: user.id });
    }

    return NextResponse.json({
      success: true,
      operation,
      summary: {
        total_jobs: job_ids.length,
        successful_operations: successCount,
        failed_operations: failureCount,
        processing_time_ms: processingTime,
      },
      results: operationResults,
      next_steps: failureCount > 0 ? {
        retry_failed: 'Review failed operations and retry if needed',
        check_logs: 'Check audit logs for detailed error information',
      } : undefined,
    });

  } catch (error) {
    console.error('Bulk job operation error:', error);
    
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
 * Validate if operation can be performed on job
 */
function validateJobOperation(
  job: any, 
  operation: string, 
  options: any
): { valid: boolean; reason?: string } {
  switch (operation) {
    case 'retry':
      if (!['failed', 'partial'].includes(job.status)) {
        return { valid: false, reason: 'Can only retry failed or partial jobs' };
      }
      break;

    case 'cancel':
      if (!['pending', 'processing'].includes(job.status)) {
        return { valid: false, reason: 'Can only cancel pending or processing jobs' };
      }
      break;

    case 'delete':
      if (['processing'].includes(job.status)) {
        return { valid: false, reason: 'Cannot delete jobs that are currently processing' };
      }
      break;

    case 'pause':
      if (!['processing', 'pending'].includes(job.status)) {
        return { valid: false, reason: 'Can only pause pending or processing jobs' };
      }
      break;

    case 'resume':
      if (job.status !== 'paused') {
        return { valid: false, reason: 'Can only resume paused jobs' };
      }
      break;

    default:
      return { valid: false, reason: 'Unknown operation' };
  }

  return { valid: true };
}

/**
 * Perform individual job operation
 */
async function performJobOperation(
  job: any,
  operation: string,
  options: any,
  userId: string,
  supabase: any
): Promise<{ success: boolean; error?: string; new_status?: string }> {
  const timestamp = new Date().toISOString();
  
  switch (operation) {
    case 'retry':
      const { error: retryError } = await supabase
        .from('parser_jobs')
        .update({
          status: 'pending',
          retry_count: (job.retry_count || 0) + 1,
          updated_at: timestamp,
          errors: [], // Clear previous errors
        })
        .eq('id', job.id);

      if (retryError) {
        return { success: false, error: retryError.message };
      }

      // Re-queue job for processing
      await requeueJob(job.id, supabase);
      
      return { success: true, new_status: 'pending' };

    case 'cancel':
      const { error: cancelError } = await supabase
        .from('parser_jobs')
        .update({
          status: 'failed',
          completed_at: timestamp,
          updated_at: timestamp,
          errors: [...(job.errors || []), {
            severity: 'info',
            message: 'Job cancelled by user',
            timestamp,
            user_id: userId,
            reason: options.reason || 'User requested cancellation',
          }],
        })
        .eq('id', job.id);

      if (cancelError) {
        return { success: false, error: cancelError.message };
      }

      // Cancel job in worker queue
      await cancelJobInQueue(job.id);
      
      return { success: true, new_status: 'failed' };

    case 'delete':
      // Soft delete by setting is_deleted flag
      const { error: deleteError } = await supabase
        .from('parser_jobs')
        .update({
          is_deleted: true,
          deleted_at: timestamp,
          updated_at: timestamp,
        })
        .eq('id', job.id);

      if (deleteError) {
        return { success: false, error: deleteError.message };
      }

      return { success: true, new_status: 'deleted' };

    case 'pause':
      const { error: pauseError } = await supabase
        .from('parser_jobs')
        .update({
          status: 'paused',
          paused_at: timestamp,
          updated_at: timestamp,
        })
        .eq('id', job.id);

      if (pauseError) {
        return { success: false, error: pauseError.message };
      }

      // Pause job in worker queue
      await pauseJobInQueue(job.id);
      
      return { success: true, new_status: 'paused' };

    case 'resume':
      const { error: resumeError } = await supabase
        .from('parser_jobs')
        .update({
          status: job.previous_status || 'pending',
          paused_at: null,
          updated_at: timestamp,
        })
        .eq('id', job.id);

      if (resumeError) {
        return { success: false, error: resumeError.message };
      }

      // Resume job in worker queue
      await resumeJobInQueue(job.id);
      
      return { success: true, new_status: job.previous_status || 'pending' };

    default:
      return { success: false, error: 'Unknown operation' };
  }
}

/**
 * Re-queue job for processing
 */
async function requeueJob(jobId: string, supabase: any): Promise<void> {
  // In a real implementation, this would interact with the Celery/Redis queue
  // For now, we'll simulate by updating the job queue priority
  
  await supabase
    .from('parser_jobs')
    .update({
      queue_priority: 'high',
      queued_at: new Date().toISOString(),
    })
    .eq('id', jobId);
}

/**
 * Cancel job in worker queue
 */
async function cancelJobInQueue(jobId: string): Promise<void> {
  // In a real implementation, this would send a cancel signal to the worker
  console.log(`Cancelling job ${jobId} in worker queue`);
}

/**
 * Pause job in worker queue
 */
async function pauseJobInQueue(jobId: string): Promise<void> {
  // In a real implementation, this would pause the job in the worker
  console.log(`Pausing job ${jobId} in worker queue`);
}

/**
 * Resume job in worker queue
 */
async function resumeJobInQueue(jobId: string): Promise<void> {
  // In a real implementation, this would resume the job in the worker
  console.log(`Resuming job ${jobId} in worker queue`);
}
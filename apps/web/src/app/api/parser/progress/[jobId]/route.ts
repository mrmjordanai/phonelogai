import { NextRequest, NextResponse } from 'next/server';
import { FileUploadHandler } from '@phonelogai/data-ingestion';
import { withAuth } from '@/middleware/auth';
import { withRBAC } from '@/middleware/rbac';
import { createClient } from '@phonelogai/database';

/**
 * GET /api/parser/progress/[jobId]
 * 
 * Server-Sent Events endpoint for real-time job progress updates
 * 
 * This endpoint provides real-time updates for file processing jobs using SSE.
 * The client can connect to this endpoint to receive live progress updates
 * without needing to poll the status endpoint repeatedly.
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

    // Verify job exists and belongs to user
    const fileUploadHandler = new FileUploadHandler();
    const job = await fileUploadHandler.getJobStatus(jobId, user.id);

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found or access denied' },
        { status: 404 }
      );
    }

    // Set up Server-Sent Events headers
    const responseHeaders = new Headers({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    });

    // Create a readable stream for SSE
    const stream = new ReadableStream({
      start(controller) {
        // Send initial job status
        sendProgressUpdate(controller, job);

        // Set up polling for job updates
        const pollInterval = setInterval(async () => {
          try {
            const updatedJob = await fileUploadHandler.getJobStatus(jobId, user.id);
            
            if (!updatedJob) {
              // Job was deleted or access revoked
              sendEvent(controller, 'error', { 
                error: 'Job no longer accessible',
                code: 'JOB_DELETED'
              });
              controller.close();
              clearInterval(pollInterval);
              return;
            }

            // Send progress update
            sendProgressUpdate(controller, updatedJob);

            // Close connection if job is completed or failed
            if (['completed', 'failed', 'partial'].includes(updatedJob.status)) {
              sendEvent(controller, 'complete', {
                job_id: jobId,
                final_status: updatedJob.status,
                message: `Job ${updatedJob.status}`
              });
              
              // Keep connection open for a few more seconds to ensure final message is received
              setTimeout(() => {
                controller.close();
                clearInterval(pollInterval);
              }, 2000);
            }

          } catch (error) {
            console.error('Error polling job status:', error);
            sendEvent(controller, 'error', {
              error: 'Failed to get job status',
              message: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }, 2000); // Poll every 2 seconds

        // Set up timeout to prevent infinite connections
        const timeout = setTimeout(() => {
          sendEvent(controller, 'timeout', {
            message: 'Connection timeout after 30 minutes'
          });
          controller.close();
          clearInterval(pollInterval);
        }, 30 * 60 * 1000); // 30 minutes timeout

        // Handle client disconnect
        request.signal.addEventListener('abort', () => {
          clearInterval(pollInterval);
          clearTimeout(timeout);
          controller.close();
        });
      },
    });

    return new Response(stream, { headers: responseHeaders });

  } catch (error) {
    console.error('Progress tracking error:', error);
    
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
 * Send progress update via SSE
 */
function sendProgressUpdate(controller: ReadableStreamDefaultController, job: any) {
  const progressData = {
    job_id: job.id,
    status: job.status,
    progress: job.progress,
    current_step: getCurrentStepFromProgress(job.status, job.progress),
    processed_rows: job.processed_rows,
    total_rows: job.total_rows,
    filename: job.filename,
    created_at: job.created_at,
    started_at: job.started_at,
    completed_at: job.completed_at,
    
    // Performance info
    processing_speed: calculateProcessingSpeed(job),
    estimated_completion: calculateEstimatedCompletion(job),
    
    // Error summary
    error_count: job.errors?.length || 0,
    recent_error: getRecentError(job.errors),
    
    // Classification status (if available)
    classification_complete: !!job.layout_classifications?.length,
    classification_confidence: job.layout_classifications?.[0]?.confidence || null,
    requires_manual_mapping: job.layout_classifications?.[0]?.requires_manual_mapping || false,
    
    // Current memory and performance estimates
    performance_estimate: getPerformanceEstimate(job),
  };

  sendEvent(controller, 'progress', progressData);
}

/**
 * Send SSE event
 */
function sendEvent(
  controller: ReadableStreamDefaultController, 
  eventType: string, 
  data: any
) {
  const eventData = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  controller.enqueue(new TextEncoder().encode(eventData));
}

/**
 * Get current processing step from status and progress
 */
function getCurrentStepFromProgress(status: string, progress: number): string {
  if (status === 'pending') {
    return 'queued';
  } else if (status === 'processing') {
    if (progress < 10) {
      return 'file_validation';
    } else if (progress < 25) {
      return 'layout_classification';
    } else if (progress < 60) {
      return 'data_extraction';
    } else if (progress < 75) {
      return 'data_validation';
    } else if (progress < 85) {
      return 'deduplication';
    } else if (progress < 95) {
      return 'database_insertion';
    } else {
      return 'finalization';
    }
  } else {
    return status;
  }
}

/**
 * Calculate processing speed (rows per minute)
 */
function calculateProcessingSpeed(job: any): number | null {
  if (!job.started_at || !job.processed_rows || job.processed_rows === 0) {
    return null;
  }

  const startTime = new Date(job.started_at);
  const now = new Date();
  const elapsedMinutes = (now.getTime() - startTime.getTime()) / (1000 * 60);
  
  if (elapsedMinutes > 0) {
    return Math.round(job.processed_rows / elapsedMinutes);
  }
  
  return null;
}

/**
 * Calculate estimated completion time
 */
function calculateEstimatedCompletion(job: any): string | null {
  if (!job.started_at || job.status !== 'processing') {
    return null;
  }

  const startTime = new Date(job.started_at);
  const now = new Date();
  const elapsed = now.getTime() - startTime.getTime();
  
  if (job.progress > 10) { // Need reasonable progress to estimate
    const totalEstimated = (elapsed / job.progress) * 100;
    const remaining = totalEstimated - elapsed;
    const completionTime = new Date(now.getTime() + remaining);
    return completionTime.toISOString();
  }
  
  return null;
}

/**
 * Get most recent error
 */
function getRecentError(errors: any[] | undefined): any | null {
  if (!errors || errors.length === 0) {
    return null;
  }

  const recentError = errors[errors.length - 1];
  return {
    error_type: recentError.error_type,
    error_message: recentError.error_message,
    severity: recentError.severity,
    row_number: recentError.row_number,
    created_at: recentError.created_at,
  };
}

/**
 * Get performance estimate based on file characteristics
 */
function getPerformanceEstimate(job: any): any {
  const estimate = {
    target_met: null,
    performance_tier: 'unknown',
    memory_usage_estimate: null,
    bottleneck_prediction: null,
  };

  if (!job.file_size) {
    return estimate;
  }

  // Estimate rows based on file size and format
  let estimatedRows = 0;
  if (job.format === 'csv') {
    estimatedRows = Math.round(job.file_size / 200); // ~200 bytes per row average
  } else if (job.format === 'pdf') {
    estimatedRows = Math.round(job.file_size / 500); // ~500 bytes per row average  
  } else if (job.format === 'txt') {
    estimatedRows = Math.round(job.file_size / 150); // ~150 bytes per row average
  }

  // Performance targets: 100k rows in <5min, 1M rows in <30min
  if (estimatedRows <= 100000) {
    estimate.performance_tier = 'fast';
    estimate.target_met = true; // Should be under 5 minutes
    estimate.memory_usage_estimate = '< 500MB';
  } else if (estimatedRows <= 1000000) {
    estimate.performance_tier = 'medium';
    estimate.target_met = true; // Should be under 30 minutes
    estimate.memory_usage_estimate = '< 2GB';
  } else {
    estimate.performance_tier = 'slow';
    estimate.target_met = false; // May exceed targets
    estimate.memory_usage_estimate = '> 2GB';
    estimate.bottleneck_prediction = 'Large dataset may require chunked processing';
  }

  // Update prediction based on current processing speed
  if (job.started_at && job.processed_rows > 0) {
    const speed = calculateProcessingSpeed(job);
    if (speed) {
      const remainingRows = estimatedRows - job.processed_rows;
      const estimatedMinutes = remainingRows / speed;
      
      if (estimatedRows <= 100000 && estimatedMinutes > 5) {
        estimate.target_met = false;
        estimate.bottleneck_prediction = 'Processing slower than expected';
      } else if (estimatedRows <= 1000000 && estimatedMinutes > 30) {
        estimate.target_met = false;
        estimate.bottleneck_prediction = 'Large file processing slower than target';
      }
    }
  }

  return estimate;
}
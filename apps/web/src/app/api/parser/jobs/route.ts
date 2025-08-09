import { NextRequest, NextResponse } from 'next/server';
import { FileUploadHandler } from '@phonelogai/data-ingestion';
import { withAuth } from '@/middleware/auth';
import { withRBAC } from '@/middleware/rbac';
import { z } from 'zod';

// Query parameters validation schema
const listJobsSchema = z.object({
  status: z.enum(['pending', 'processing', 'completed', 'failed', 'partial']).optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
  sort_by: z.enum(['created_at', 'completed_at', 'filename', 'file_size']).default('created_at'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
});

/**
 * GET /api/parser/jobs
 * 
 * List user's file processing jobs with pagination and filtering
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

    // Parse and validate query parameters
    const url = new URL(request.url);
    const queryParams = Object.fromEntries(url.searchParams.entries());
    
    const validationResult = listJobsSchema.safeParse(queryParams);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { 
          error: 'Invalid query parameters',
          details: validationResult.error.errors
        },
        { status: 400 }
      );
    }

    const { status, limit, offset, sort_by, sort_order } = validationResult.data;

    // Get jobs from database
    const fileUploadHandler = new FileUploadHandler();
    const result = await fileUploadHandler.listUserJobs(user.id, {
      status,
      limit,
      offset,
      sort_by,
      sort_order,
    });

    // Format job list response
    const formattedJobs = result.jobs.map(job => ({
      job_id: job.id,
      filename: job.filename,
      file_size: job.file_size,
      format: job.format,
      carrier: job.carrier,
      status: job.status,
      progress: job.progress,
      processed_rows: job.processed_rows,
      total_rows: job.total_rows,
      created_at: job.created_at,
      started_at: job.started_at,
      completed_at: job.completed_at,
      
      // Summary information
      error_count: job.errors?.length || 0,
      has_critical_errors: (job.errors?.some(e => e.severity === 'critical')) || false,
      
      // Quick actions
      can_retry: job.status === 'failed' || job.status === 'partial',
      can_cancel: job.status === 'pending',
      can_delete: job.status === 'completed' || job.status === 'failed' || job.status === 'partial',
    }));

    // Calculate pagination info
    const totalPages = Math.ceil(result.total / limit);
    const currentPage = Math.floor(offset / limit) + 1;
    const hasNextPage = offset + limit < result.total;
    const hasPrevPage = offset > 0;

    return NextResponse.json({
      jobs: formattedJobs,
      pagination: {
        total: result.total,
        limit,
        offset,
        current_page: currentPage,
        total_pages: totalPages,
        has_next_page: hasNextPage,
        has_prev_page: hasPrevPage,
      },
      filters: {
        status,
        sort_by,
        sort_order,
      },
    });

  } catch (error) {
    console.error('List jobs error:', error);
    
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
 * DELETE /api/parser/jobs
 * 
 * Bulk delete completed or failed jobs
 */
export async function DELETE(request: NextRequest) {
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
    const { job_ids } = await request.json();

    if (!Array.isArray(job_ids) || job_ids.length === 0) {
      return NextResponse.json(
        { error: 'job_ids array is required and cannot be empty' },
        { status: 400 }
      );
    }

    if (job_ids.length > 50) {
      return NextResponse.json(
        { error: 'Cannot delete more than 50 jobs at once' },
        { status: 400 }
      );
    }

    // Delete jobs one by one (could be optimized with batch operations)
    const fileUploadHandler = new FileUploadHandler();
    const results = [];

    for (const jobId of job_ids) {
      try {
        const success = await fileUploadHandler.deleteJob(jobId, user.id);
        results.push({
          job_id: jobId,
          success,
          error: success ? null : 'Job not found or cannot be deleted'
        });
      } catch (error) {
        results.push({
          job_id: jobId,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;

    return NextResponse.json({
      total_requested: job_ids.length,
      successful_deletions: successCount,
      failed_deletions: failureCount,
      results,
      message: `Deleted ${successCount} of ${job_ids.length} jobs`
    });

  } catch (error) {
    console.error('Bulk delete jobs error:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
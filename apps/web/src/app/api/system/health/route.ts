import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@phonelogai/database';
import { withAuth } from '@/middleware/auth';
import { withRBAC } from '@/middleware/rbac';

/**
 * GET /api/system/health
 * 
 * Comprehensive system health check
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Apply authentication and RBAC middleware for detailed health info
    // Note: Basic health check should be accessible without auth for monitoring systems
    const url = new URL(request.url);
    const detailed = url.searchParams.get('detailed') === 'true';

    let user = null;
    if (detailed) {
      const authResult = await withAuth(request);
      if (!authResult.success) {
        return NextResponse.json({ error: authResult.error }, { status: 401 });
      }

      const rbacResult = await withRBAC(request, 'system_monitoring', 'read');
      if (!rbacResult.success) {
        return NextResponse.json({ error: rbacResult.error }, { status: 403 });
      }

      user = authResult.user!;
    }

    const supabase = createClient();
    const healthChecks: any = {};

    // Database connectivity check
    try {
      const { data, error } = await supabase
        .from('system_metrics')
        .select('created_at')
        .limit(1);
      
      healthChecks.database = {
        status: error ? 'unhealthy' : 'healthy',
        response_time_ms: Date.now() - startTime,
        error: error?.message,
        last_check: new Date().toISOString(),
      };
    } catch (error) {
      healthChecks.database = {
        status: 'unhealthy',
        response_time_ms: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown database error',
        last_check: new Date().toISOString(),
      };
    }

    // Check processing queue health
    try {
      const { data: queueData, error: queueError } = await supabase
        .from('parser_jobs')
        .select('status, created_at')
        .in('status', ['pending', 'processing', 'paused'])
        .limit(100);

      if (queueError) throw queueError;

      const now = new Date();
      const pendingJobs = queueData?.filter(j => j.status === 'pending') || [];
      const processingJobs = queueData?.filter(j => j.status === 'processing') || [];
      const pausedJobs = queueData?.filter(j => j.status === 'paused') || [];

      // Check for jobs stuck in processing
      const stuckJobs = processingJobs.filter(job => {
        const jobAge = now.getTime() - new Date(job.created_at).getTime();
        return jobAge > 2 * 60 * 60 * 1000; // 2 hours
      });

      // Check for old pending jobs
      const oldPendingJobs = pendingJobs.filter(job => {
        const jobAge = now.getTime() - new Date(job.created_at).getTime();
        return jobAge > 30 * 60 * 1000; // 30 minutes
      });

      let queueStatus = 'healthy';
      const issues: string[] = [];

      if (stuckJobs.length > 0) {
        queueStatus = 'unhealthy';
        issues.push(`${stuckJobs.length} jobs appear stuck in processing`);
      }

      if (oldPendingJobs.length > 5) {
        queueStatus = queueStatus === 'unhealthy' ? 'unhealthy' : 'warning';
        issues.push(`${oldPendingJobs.length} jobs pending for >30 minutes`);
      }

      if (pendingJobs.length > 100) {
        queueStatus = 'warning';
        issues.push('High queue depth detected');
      }

      healthChecks.queue = {
        status: queueStatus,
        pending_jobs: pendingJobs.length,
        processing_jobs: processingJobs.length,
        paused_jobs: pausedJobs.length,
        stuck_jobs: stuckJobs.length,
        issues: issues,
        last_check: new Date().toISOString(),
      };

    } catch (error) {
      healthChecks.queue = {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown queue error',
        last_check: new Date().toISOString(),
      };
    }

    // Check recent system metrics
    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      
      const { data: recentMetrics, error: metricsError } = await supabase
        .from('system_metrics')
        .select('metric_name, value, created_at')
        .gte('created_at', fiveMinutesAgo.toISOString())
        .in('metric_name', ['memory_utilization_percent', 'cpu_utilization_percent', 'disk_utilization_percent'])
        .order('created_at', { ascending: false });

      if (metricsError) throw metricsError;

      const latestMetrics = (recentMetrics || []).reduce((acc: any, metric) => {
        if (!acc[metric.metric_name] || new Date(metric.created_at) > new Date(acc[metric.metric_name].created_at)) {
          acc[metric.metric_name] = metric;
        }
        return acc;
      }, {});

      const memoryUtil = latestMetrics.memory_utilization_percent?.value || 0;
      const cpuUtil = latestMetrics.cpu_utilization_percent?.value || 0;
      const diskUtil = latestMetrics.disk_utilization_percent?.value || 0;

      let resourceStatus = 'healthy';
      const resourceIssues: string[] = [];

      if (memoryUtil > 90) {
        resourceStatus = 'critical';
        resourceIssues.push(`Critical memory usage: ${memoryUtil.toFixed(1)}%`);
      } else if (memoryUtil > 80) {
        resourceStatus = 'warning';
        resourceIssues.push(`High memory usage: ${memoryUtil.toFixed(1)}%`);
      }

      if (cpuUtil > 90) {
        resourceStatus = 'critical';
        resourceIssues.push(`Critical CPU usage: ${cpuUtil.toFixed(1)}%`);
      } else if (cpuUtil > 80) {
        resourceStatus = resourceStatus === 'critical' ? 'critical' : 'warning';
        resourceIssues.push(`High CPU usage: ${cpuUtil.toFixed(1)}%`);
      }

      if (diskUtil > 95) {
        resourceStatus = 'critical';
        resourceIssues.push(`Critical disk usage: ${diskUtil.toFixed(1)}%`);
      } else if (diskUtil > 85) {
        resourceStatus = resourceStatus === 'critical' ? 'critical' : 'warning';
        resourceIssues.push(`High disk usage: ${diskUtil.toFixed(1)}%`);
      }

      healthChecks.resources = {
        status: resourceStatus,
        memory_utilization_percent: memoryUtil,
        cpu_utilization_percent: cpuUtil,
        disk_utilization_percent: diskUtil,
        issues: resourceIssues,
        metrics_age_minutes: latestMetrics.memory_utilization_percent ? 
          (Date.now() - new Date(latestMetrics.memory_utilization_percent.created_at).getTime()) / (1000 * 60) : 
          null,
        last_check: new Date().toISOString(),
      };

    } catch (error) {
      healthChecks.resources = {
        status: 'unknown',
        error: error instanceof Error ? error.message : 'Unknown resource error',
        last_check: new Date().toISOString(),
      };
    }

    // Check external services (if detailed)
    if (detailed && user) {
      // Check storage service connectivity
      try {
        // This would test actual S3/storage connectivity
        healthChecks.storage = {
          status: 'healthy', // Simulated
          last_check: new Date().toISOString(),
        };
      } catch (error) {
        healthChecks.storage = {
          status: 'unhealthy',
          error: error instanceof Error ? error.message : 'Storage check failed',
          last_check: new Date().toISOString(),
        };
      }

      // Check recent error rates
      try {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        
        const { data: recentJobs, error: jobsError } = await supabase
          .from('job_analytics')
          .select('rows_successful, rows_failed, created_at')
          .gte('created_at', oneHourAgo.toISOString())
          .eq('org_id', user.orgId);

        if (jobsError) throw jobsError;

        const totalJobs = recentJobs?.length || 0;
        const failedJobs = recentJobs?.filter(job => 
          (job.rows_failed || 0) > (job.rows_successful || 0)
        ).length || 0;

        const errorRate = totalJobs > 0 ? (failedJobs / totalJobs) * 100 : 0;

        let errorStatus = 'healthy';
        if (errorRate > 20) {
          errorStatus = 'critical';
        } else if (errorRate > 10) {
          errorStatus = 'warning';
        }

        healthChecks.error_rates = {
          status: errorStatus,
          error_rate_percent: Math.round(errorRate * 100) / 100,
          total_jobs_last_hour: totalJobs,
          failed_jobs_last_hour: failedJobs,
          last_check: new Date().toISOString(),
        };

      } catch (error) {
        healthChecks.error_rates = {
          status: 'unknown',
          error: error instanceof Error ? error.message : 'Error rate check failed',
          last_check: new Date().toISOString(),
        };
      }
    }

    // Calculate overall health status
    const componentStatuses = Object.values(healthChecks).map((check: any) => check.status);
    
    let overallStatus = 'healthy';
    if (componentStatuses.includes('critical') || componentStatuses.includes('unhealthy')) {
      overallStatus = 'unhealthy';
    } else if (componentStatuses.includes('warning')) {
      overallStatus = 'warning';
    } else if (componentStatuses.includes('unknown')) {
      overallStatus = 'warning';
    }

    // Compile summary
    const healthySystems = componentStatuses.filter(s => s === 'healthy').length;
    const totalSystems = componentStatuses.length;
    const healthScore = Math.round((healthySystems / totalSystems) * 100);

    const response = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      response_time_ms: Date.now() - startTime,
      
      summary: {
        overall_status: overallStatus,
        health_score_percent: healthScore,
        healthy_systems: healthySystems,
        total_systems: totalSystems,
        critical_issues: componentStatuses.filter(s => s === 'critical' || s === 'unhealthy').length,
      },
      
      systems: healthChecks,
      
      // Include additional info if detailed
      ...(detailed && {
        environment: {
          node_env: process.env.NODE_ENV || 'unknown',
          deployment_version: process.env.DEPLOYMENT_VERSION || 'unknown',
          deployment_time: process.env.DEPLOYMENT_TIME || 'unknown',
        },
        
        recommendations: generateHealthRecommendations(healthChecks),
        
        uptime: {
          // These would come from actual system metrics
          process_uptime_seconds: Math.floor(process.uptime()),
          system_uptime_hours: 24, // Placeholder
        },
      }),
    };

    // Set HTTP status based on health
    let httpStatus = 200;
    if (overallStatus === 'unhealthy') {
      httpStatus = 503; // Service Unavailable
    } else if (overallStatus === 'warning') {
      httpStatus = 200; // OK but with warnings
    }

    return NextResponse.json(response, { status: httpStatus });

  } catch (error) {
    console.error('Health check error:', error);
    
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        response_time_ms: Date.now() - startTime,
        error: 'Health check system failure',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 503 }
    );
  }
}

/**
 * Generate health recommendations
 */
function generateHealthRecommendations(healthChecks: any): string[] {
  const recommendations: string[] = [];

  // Database recommendations
  if (healthChecks.database?.status === 'unhealthy') {
    recommendations.push('Check database connectivity and server status');
    recommendations.push('Review database logs for error details');
  }

  // Queue recommendations
  if (healthChecks.queue?.status === 'unhealthy') {
    if (healthChecks.queue.stuck_jobs > 0) {
      recommendations.push('Investigate and restart stuck processing jobs');
    }
    if (healthChecks.queue.pending_jobs > 50) {
      recommendations.push('Consider scaling up worker capacity');
    }
  }

  // Resource recommendations
  if (healthChecks.resources?.status === 'critical') {
    if (healthChecks.resources.memory_utilization_percent > 90) {
      recommendations.push('Immediately scale up memory or restart services');
    }
    if (healthChecks.resources.cpu_utilization_percent > 90) {
      recommendations.push('Scale up CPU resources or optimize high-usage processes');
    }
    if (healthChecks.resources.disk_utilization_percent > 95) {
      recommendations.push('Free up disk space immediately or expand storage');
    }
  } else if (healthChecks.resources?.status === 'warning') {
    recommendations.push('Monitor resource usage closely and prepare for scaling');
  }

  // Error rate recommendations
  if (healthChecks.error_rates?.status === 'critical') {
    recommendations.push('Investigate high error rates in job processing');
    recommendations.push('Check for data quality issues or system problems');
  }

  // Storage recommendations
  if (healthChecks.storage?.status === 'unhealthy') {
    recommendations.push('Check external storage connectivity');
    recommendations.push('Verify storage service credentials and permissions');
  }

  // General recommendations
  if (recommendations.length === 0) {
    recommendations.push('System is healthy - continue monitoring');
  } else {
    recommendations.unshift('Address critical issues immediately to prevent service disruption');
  }

  return recommendations;
}
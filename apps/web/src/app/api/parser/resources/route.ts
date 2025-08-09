import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@phonelogai/database';
import { withAuth } from '@/middleware/auth';
import { withRBAC } from '@/middleware/rbac';
import { z } from 'zod';

// Resource query schema
const resourceQuerySchema = z.object({
  timeframe: z.enum(['1h', '6h', '24h', '7d', '30d']).default('24h'),
  metrics: z.array(z.enum(['memory', 'cpu', 'disk', 'network', 'queue_depth', 'processing_rate'])).default(['memory', 'cpu', 'queue_depth']),
  granularity: z.enum(['minute', 'hour', 'day']).default('hour'),
  include_predictions: z.coerce.boolean().default(false),
});

/**
 * GET /api/parser/resources
 * 
 * Get system resource usage metrics and monitoring data
 */
export async function GET(request: NextRequest) {
  try {
    // Apply authentication and RBAC middleware
    const authResult = await withAuth(request);
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const rbacResult = await withRBAC(request, 'system_monitoring', 'read');
    if (!rbacResult.success) {
      return NextResponse.json({ error: rbacResult.error }, { status: 403 });
    }

    const user = authResult.user!;
    const url = new URL(request.url);
    const queryParams = Object.fromEntries(url.searchParams.entries());
    
    const validation = resourceQuerySchema.safeParse(queryParams);
    if (!validation.success) {
      return NextResponse.json(
        { 
          error: 'Invalid query parameters',
          details: validation.error.errors
        },
        { status: 400 }
      );
    }

    const { timeframe, metrics, granularity, include_predictions } = validation.data;

    const supabase = createClient();

    // Calculate time range
    const timeRanges = {
      '1h': 1 * 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
    };

    const startTime = new Date(Date.now() - timeRanges[timeframe]);
    const endTime = new Date();

    // Get current resource status
    const currentStatus = await getCurrentResourceStatus(supabase);

    // Get historical metrics
    const historicalMetrics = await getHistoricalMetrics(
      supabase, 
      startTime, 
      endTime, 
      metrics, 
      granularity
    );

    // Get job processing statistics
    const processingStats = await getProcessingStatistics(
      supabase, 
      startTime, 
      endTime,
      user.orgId
    );

    // Get queue information
    const queueStatus = await getQueueStatus(supabase);

    // Calculate resource utilization trends
    const utilizationTrends = calculateUtilizationTrends(historicalMetrics);

    // Generate capacity predictions if requested
    let capacityPredictions = null;
    if (include_predictions) {
      capacityPredictions = await generateCapacityPredictions(
        historicalMetrics,
        processingStats,
        timeframe
      );
    }

    // Get resource alerts and recommendations
    const alerts = await getResourceAlerts(currentStatus, utilizationTrends);
    const recommendations = generateResourceRecommendations(currentStatus, utilizationTrends);

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      timeframe,
      granularity,
      
      // Current status
      current_status: currentStatus,
      
      // Historical data
      metrics: {
        timeframe: {
          start: startTime.toISOString(),
          end: endTime.toISOString(),
          duration_ms: timeRanges[timeframe],
        },
        data: historicalMetrics,
        trends: utilizationTrends,
      },
      
      // Processing statistics
      processing: processingStats,
      
      // Queue status
      queue: queueStatus,
      
      // Predictions and recommendations
      predictions: capacityPredictions,
      alerts: alerts,
      recommendations: recommendations,
      
      // System health summary
      health: {
        overall_status: calculateOverallHealth(currentStatus, alerts),
        performance_score: calculatePerformanceScore(utilizationTrends, processingStats),
        capacity_utilization: calculateCapacityUtilization(currentStatus),
      },
    });

  } catch (error) {
    console.error('Resource monitoring error:', error);
    
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
 * Get current resource status
 */
async function getCurrentResourceStatus(supabase: any): Promise<any> {
  // In a real implementation, this would query actual system metrics
  // For now, we'll simulate with database queries and reasonable estimates
  
  const now = new Date();
  const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

  // Get recent metrics from system_metrics table
  const { data: recentMetrics, error } = await supabase
    .from('system_metrics')
    .select('*')
    .gte('created_at', fiveMinutesAgo.toISOString())
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('Failed to fetch recent metrics:', error);
  }

  // Aggregate metrics by type
  const metricsByType = (recentMetrics || []).reduce((acc: any, metric: any) => {
    if (!acc[metric.metric_name]) {
      acc[metric.metric_name] = [];
    }
    acc[metric.metric_name].push(metric);
    return acc;
  }, {});

  // Calculate current values
  const getLatestMetric = (metricName: string, defaultValue: number = 0) => {
    const metrics = metricsByType[metricName] || [];
    return metrics.length > 0 ? metrics[0].value : defaultValue;
  };

  const getAverageMetric = (metricName: string, defaultValue: number = 0) => {
    const metrics = metricsByType[metricName] || [];
    if (metrics.length === 0) return defaultValue;
    
    const sum = metrics.reduce((acc, metric) => acc + metric.value, 0);
    return sum / metrics.length;
  };

  return {
    timestamp: now.toISOString(),
    
    // System resources
    memory: {
      used_mb: getLatestMetric('memory_used_mb', 1024),
      available_mb: getLatestMetric('memory_available_mb', 3072),
      utilization_percent: getLatestMetric('memory_utilization_percent', 25.0),
      peak_utilization_percent: Math.max(...(metricsByType['memory_utilization_percent'] || []).map((m: any) => m.value).concat([25.0])),
    },
    
    cpu: {
      utilization_percent: getAverageMetric('cpu_utilization_percent', 35.0),
      load_average: getLatestMetric('cpu_load_average', 1.2),
      cores_available: getLatestMetric('cpu_cores_available', 4),
      peak_utilization_percent: Math.max(...(metricsByType['cpu_utilization_percent'] || []).map((m: any) => m.value).concat([35.0])),
    },
    
    disk: {
      used_gb: getLatestMetric('disk_used_gb', 50),
      available_gb: getLatestMetric('disk_available_gb', 450),
      utilization_percent: getLatestMetric('disk_utilization_percent', 10.0),
      io_operations_per_sec: getLatestMetric('disk_iops', 150),
    },
    
    network: {
      bandwidth_utilization_percent: getLatestMetric('network_utilization_percent', 15.0),
      incoming_mbps: getLatestMetric('network_incoming_mbps', 25.0),
      outgoing_mbps: getLatestMetric('network_outgoing_mbps', 20.0),
      connections_active: getLatestMetric('network_connections_active', 45),
    },
    
    // Application-specific metrics
    workers: {
      active_workers: getLatestMetric('active_workers', 3),
      available_workers: getLatestMetric('available_workers', 7),
      max_workers: getLatestMetric('max_workers', 10),
      utilization_percent: (getLatestMetric('active_workers', 3) / getLatestMetric('max_workers', 10)) * 100,
    },
    
    database: {
      active_connections: getLatestMetric('db_active_connections', 15),
      max_connections: getLatestMetric('db_max_connections', 100),
      utilization_percent: (getLatestMetric('db_active_connections', 15) / getLatestMetric('db_max_connections', 100)) * 100,
      query_time_avg_ms: getAverageMetric('db_query_time_avg_ms', 45),
    },
  };
}

/**
 * Get historical metrics
 */
async function getHistoricalMetrics(
  supabase: any,
  startTime: Date,
  endTime: Date,
  requestedMetrics: string[],
  granularity: string
): Promise<any> {
  // Define metric mapping
  const metricMapping: Record<string, string[]> = {
    memory: ['memory_used_mb', 'memory_utilization_percent'],
    cpu: ['cpu_utilization_percent', 'cpu_load_average'],
    disk: ['disk_utilization_percent', 'disk_iops'],
    network: ['network_utilization_percent', 'network_incoming_mbps'],
    queue_depth: ['queue_depth', 'pending_jobs'],
    processing_rate: ['jobs_processed_per_minute', 'avg_processing_time_ms'],
  };

  // Get all metric names we need to query
  const metricNames = requestedMetrics.flatMap(metric => metricMapping[metric] || [metric]);

  // Query metrics
  const { data: metrics, error } = await supabase
    .from('system_metrics')
    .select('*')
    .in('metric_name', metricNames)
    .gte('created_at', startTime.toISOString())
    .lte('created_at', endTime.toISOString())
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to fetch historical metrics:', error);
    return {};
  }

  // Group metrics by name and time bucket
  const timeInterval = granularity === 'minute' ? 60000 : granularity === 'hour' ? 3600000 : 86400000;
  const groupedMetrics: Record<string, any[]> = {};

  metrics.forEach((metric: any) => {
    const timestamp = new Date(metric.created_at).getTime();
    const timeBucket = Math.floor(timestamp / timeInterval) * timeInterval;
    const bucketTime = new Date(timeBucket).toISOString();

    if (!groupedMetrics[metric.metric_name]) {
      groupedMetrics[metric.metric_name] = [];
    }

    // Find existing bucket or create new one
    let bucket = groupedMetrics[metric.metric_name].find(b => b.timestamp === bucketTime);
    if (!bucket) {
      bucket = {
        timestamp: bucketTime,
        values: [],
        count: 0,
        sum: 0,
        min: metric.value,
        max: metric.value,
      };
      groupedMetrics[metric.metric_name].push(bucket);
    }

    // Add value to bucket
    bucket.values.push(metric.value);
    bucket.count++;
    bucket.sum += metric.value;
    bucket.min = Math.min(bucket.min, metric.value);
    bucket.max = Math.max(bucket.max, metric.value);
  });

  // Calculate aggregated values for each bucket
  Object.keys(groupedMetrics).forEach(metricName => {
    groupedMetrics[metricName].forEach((bucket: any) => {
      bucket.avg = bucket.sum / bucket.count;
      bucket.median = calculateMedian(bucket.values);
      delete bucket.values; // Remove raw values to reduce payload size
    });
    
    // Sort by timestamp
    groupedMetrics[metricName].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  });

  return groupedMetrics;
}

/**
 * Get processing statistics
 */
async function getProcessingStatistics(
  supabase: any,
  startTime: Date,
  endTime: Date,
  orgId: string
): Promise<any> {
  // Get job statistics
  const { data: jobStats, error: jobError } = await supabase
    .from('job_analytics')
    .select('*')
    .gte('created_at', startTime.toISOString())
    .lte('created_at', endTime.toISOString())
    .eq('org_id', orgId);

  if (jobError) {
    console.error('Failed to fetch job statistics:', jobError);
  }

  const jobs = jobStats || [];

  // Calculate statistics
  const totalJobs = jobs.length;
  const completedJobs = jobs.filter(j => j.rows_successful > 0).length;
  const failedJobs = jobs.filter(j => j.rows_failed > j.rows_successful).length;
  
  const totalProcessingTime = jobs.reduce((sum, job) => sum + (job.processing_time_ms || 0), 0);
  const avgProcessingTime = totalJobs > 0 ? totalProcessingTime / totalJobs : 0;
  
  const totalRowsProcessed = jobs.reduce((sum, job) => sum + (job.rows_processed || 0), 0);
  const totalRowsSuccessful = jobs.reduce((sum, job) => sum + (job.rows_successful || 0), 0);
  
  const successRate = totalRowsProcessed > 0 ? (totalRowsSuccessful / totalRowsProcessed) * 100 : 0;
  
  // Calculate throughput (rows per minute)
  const timeRangeMinutes = (endTime.getTime() - startTime.getTime()) / (1000 * 60);
  const throughputRpm = timeRangeMinutes > 0 ? totalRowsProcessed / timeRangeMinutes : 0;

  return {
    timeframe: {
      start: startTime.toISOString(),
      end: endTime.toISOString(),
      duration_minutes: timeRangeMinutes,
    },
    
    jobs: {
      total: totalJobs,
      completed: completedJobs,
      failed: failedJobs,
      success_rate_percent: totalJobs > 0 ? (completedJobs / totalJobs) * 100 : 0,
    },
    
    processing: {
      total_processing_time_ms: totalProcessingTime,
      avg_processing_time_ms: Math.round(avgProcessingTime),
      min_processing_time_ms: jobs.length > 0 ? Math.min(...jobs.map(j => j.processing_time_ms || 0)) : 0,
      max_processing_time_ms: jobs.length > 0 ? Math.max(...jobs.map(j => j.processing_time_ms || 0)) : 0,
    },
    
    data: {
      total_rows_processed: totalRowsProcessed,
      total_rows_successful: totalRowsSuccessful,
      total_rows_failed: totalRowsProcessed - totalRowsSuccessful,
      success_rate_percent: Math.round(successRate * 100) / 100,
    },
    
    throughput: {
      rows_per_minute: Math.round(throughputRpm),
      jobs_per_minute: timeRangeMinutes > 0 ? totalJobs / timeRangeMinutes : 0,
      avg_file_size_mb: jobs.length > 0 ? jobs.reduce((sum, job) => sum + (job.file_size_mb || 0), 0) / jobs.length : 0,
    },
    
    performance: {
      meets_target_100k: jobs.filter(j => j.rows_processed >= 100000 && (j.processing_time_ms || 0) < 300000).length,
      meets_target_1m: jobs.filter(j => j.rows_processed >= 1000000 && (j.processing_time_ms || 0) < 1800000).length,
      performance_score: calculateProcessingPerformanceScore(jobs),
    },
  };
}

/**
 * Get queue status
 */
async function getQueueStatus(supabase: any): Promise<any> {
  // Get current job queue status
  const { data: queueData, error } = await supabase
    .from('parser_jobs')
    .select('status, priority, created_at, updated_at')
    .in('status', ['pending', 'processing', 'paused'])
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to fetch queue status:', error);
    return {};
  }

  const jobs = queueData || [];
  const now = new Date();

  // Calculate queue metrics
  const pendingJobs = jobs.filter(j => j.status === 'pending');
  const processingJobs = jobs.filter(j => j.status === 'processing');
  const pausedJobs = jobs.filter(j => j.status === 'paused');

  // Calculate wait times
  const avgWaitTime = pendingJobs.length > 0
    ? pendingJobs.reduce((sum, job) => {
        const waitTime = now.getTime() - new Date(job.created_at).getTime();
        return sum + waitTime;
      }, 0) / pendingJobs.length
    : 0;

  const oldestJob = pendingJobs.length > 0
    ? Math.max(...pendingJobs.map(job => now.getTime() - new Date(job.created_at).getTime()))
    : 0;

  return {
    timestamp: now.toISOString(),
    
    queue_depth: {
      pending: pendingJobs.length,
      processing: processingJobs.length,
      paused: pausedJobs.length,
      total: jobs.length,
    },
    
    wait_times: {
      avg_wait_time_ms: Math.round(avgWaitTime),
      oldest_job_wait_time_ms: oldestJob,
      avg_wait_time_minutes: Math.round(avgWaitTime / (1000 * 60)),
    },
    
    priority_distribution: {
      high: jobs.filter(j => j.priority === 'high').length,
      normal: jobs.filter(j => j.priority === 'normal' || !j.priority).length,
      low: jobs.filter(j => j.priority === 'low').length,
    },
    
    processing_capacity: {
      slots_in_use: processingJobs.length,
      estimated_capacity: 10, // This would come from worker configuration
      utilization_percent: (processingJobs.length / 10) * 100,
    },
  };
}

/**
 * Calculate utilization trends
 */
function calculateUtilizationTrends(metrics: any): any {
  const trends: Record<string, any> = {};

  Object.keys(metrics).forEach(metricName => {
    const data = metrics[metricName] || [];
    
    if (data.length < 2) {
      trends[metricName] = { direction: 'stable', change_percent: 0 };
      return;
    }

    // Calculate trend over time using linear regression
    const values = data.map((point: any) => point.avg);
    const trend = calculateLinearTrend(values);
    
    const firstValue = values[0];
    const lastValue = values[values.length - 1];
    const changePercent = firstValue > 0 ? ((lastValue - firstValue) / firstValue) * 100 : 0;

    trends[metricName] = {
      direction: trend > 0.1 ? 'increasing' : trend < -0.1 ? 'decreasing' : 'stable',
      change_percent: Math.round(changePercent * 100) / 100,
      slope: trend,
      current_value: lastValue,
      min_value: Math.min(...values),
      max_value: Math.max(...values),
      volatility: calculateVolatility(values),
    };
  });

  return trends;
}

/**
 * Generate capacity predictions
 */
async function generateCapacityPredictions(
  historicalMetrics: any,
  processingStats: any,
  timeframe: string
): Promise<any> {
  // Simple capacity prediction based on trends
  const predictions: any = {};

  // Predict resource exhaustion points
  Object.keys(historicalMetrics).forEach(metricName => {
    const data = historicalMetrics[metricName] || [];
    
    if (data.length > 0) {
      const values = data.map((point: any) => point.avg);
      const trend = calculateLinearTrend(values);
      const currentValue = values[values.length - 1];
      
      // Predict when resource might reach capacity (assuming 90% is critical)
      let timeToCapacity = null;
      if (trend > 0 && currentValue < 90) {
        const remainingCapacity = 90 - currentValue;
        const hoursToCapacity = remainingCapacity / trend;
        if (hoursToCapacity > 0 && hoursToCapacity < 24 * 30) { // Within 30 days
          timeToCapacity = new Date(Date.now() + hoursToCapacity * 60 * 60 * 1000);
        }
      }
      
      predictions[metricName] = {
        current_value: currentValue,
        trend_per_hour: trend,
        predicted_value_24h: Math.max(0, Math.min(100, currentValue + (trend * 24))),
        time_to_capacity: timeToCapacity?.toISOString() || null,
        confidence: calculatePredictionConfidence(values),
      };
    }
  });

  // Predict processing capacity needs
  const currentThroughput = processingStats.throughput?.rows_per_minute || 0;
  const jobsPerMinute = processingStats.throughput?.jobs_per_minute || 0;
  
  predictions.processing_capacity = {
    current_throughput_rpm: currentThroughput,
    predicted_throughput_24h: currentThroughput * 1.1, // Assume 10% growth
    recommended_worker_scaling: jobsPerMinute > 5 ? 'scale_up' : jobsPerMinute < 1 ? 'scale_down' : 'maintain',
    estimated_cost_impact: calculateCostImpact(jobsPerMinute),
  };

  return predictions;
}

/**
 * Get resource alerts
 */
async function getResourceAlerts(currentStatus: any, trends: any): Promise<any[]> {
  const alerts: any[] = [];

  // Memory alerts
  if (currentStatus.memory?.utilization_percent > 85) {
    alerts.push({
      type: 'critical',
      category: 'memory',
      message: 'High memory utilization detected',
      current_value: currentStatus.memory.utilization_percent,
      threshold: 85,
      recommendation: 'Consider scaling up memory or optimizing memory usage',
    });
  }

  // CPU alerts
  if (currentStatus.cpu?.utilization_percent > 80) {
    alerts.push({
      type: 'warning',
      category: 'cpu',
      message: 'High CPU utilization detected',
      current_value: currentStatus.cpu.utilization_percent,
      threshold: 80,
      recommendation: 'Monitor CPU usage and consider scaling',
    });
  }

  // Worker capacity alerts
  if (currentStatus.workers?.utilization_percent > 90) {
    alerts.push({
      type: 'critical',
      category: 'workers',
      message: 'Worker capacity near limit',
      current_value: currentStatus.workers.utilization_percent,
      threshold: 90,
      recommendation: 'Scale up worker instances immediately',
    });
  }

  // Trend-based alerts
  Object.keys(trends).forEach(metricName => {
    const trend = trends[metricName];
    if (trend.direction === 'increasing' && trend.change_percent > 50) {
      alerts.push({
        type: 'warning',
        category: 'trend',
        message: `${metricName} showing rapid increase`,
        change_percent: trend.change_percent,
        recommendation: 'Monitor closely and prepare for scaling',
      });
    }
  });

  return alerts;
}

/**
 * Generate resource recommendations
 */
function generateResourceRecommendations(currentStatus: any, trends: any): any[] {
  const recommendations: any[] = [];

  // Memory optimization
  if (currentStatus.memory?.utilization_percent > 70) {
    recommendations.push({
      category: 'memory',
      priority: 'medium',
      title: 'Optimize memory usage',
      description: 'Memory utilization is approaching limits',
      actions: [
        'Review memory-intensive operations',
        'Implement memory pooling for large files',
        'Consider increasing available memory',
      ],
    });
  }

  // Worker scaling
  const workerUtil = currentStatus.workers?.utilization_percent || 0;
  if (workerUtil > 75) {
    recommendations.push({
      category: 'scaling',
      priority: 'high',
      title: 'Scale worker capacity',
      description: 'Worker utilization is high, consider scaling up',
      actions: [
        'Add more worker instances',
        'Optimize job processing efficiency',
        'Implement job prioritization',
      ],
    });
  } else if (workerUtil < 25) {
    recommendations.push({
      category: 'cost_optimization',
      priority: 'low',
      title: 'Consider scaling down',
      description: 'Worker utilization is low, may be over-provisioned',
      actions: [
        'Reduce worker instances during low usage',
        'Implement auto-scaling policies',
        'Review resource allocation',
      ],
    });
  }

  return recommendations;
}

// Utility functions
function calculateMedian(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 
    ? (sorted[mid - 1] + sorted[mid]) / 2 
    : sorted[mid];
}

function calculateLinearTrend(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;

  const xSum = (n * (n - 1)) / 2;
  const ySum = values.reduce((sum, val) => sum + val, 0);
  const xySum = values.reduce((sum, val, index) => sum + val * index, 0);
  const x2Sum = (n * (n - 1) * (2 * n - 1)) / 6;

  const slope = (n * xySum - xSum * ySum) / (n * x2Sum - xSum * xSum);
  return slope;
}

function calculateVolatility(values: number[]): number {
  if (values.length < 2) return 0;
  
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

function calculateProcessingPerformanceScore(jobs: any[]): number {
  if (jobs.length === 0) return 100;

  let score = 100;
  
  // Penalize slow jobs
  const slowJobs = jobs.filter(j => {
    const rowsProcessed = j.rows_processed || 0;
    const processingTime = j.processing_time_ms || 0;
    
    if (rowsProcessed >= 1000000) {
      return processingTime > 1800000; // > 30 minutes for 1M rows
    } else if (rowsProcessed >= 100000) {
      return processingTime > 300000; // > 5 minutes for 100k rows
    }
    return false;
  });

  const slowJobPenalty = (slowJobs.length / jobs.length) * 30;
  score -= slowJobPenalty;

  // Penalize failed jobs
  const failedJobs = jobs.filter(j => j.rows_failed > j.rows_successful);
  const failedJobPenalty = (failedJobs.length / jobs.length) * 40;
  score -= failedJobPenalty;

  return Math.max(0, Math.round(score));
}

function calculatePredictionConfidence(values: number[]): number {
  if (values.length < 3) return 0.3;
  
  const volatility = calculateVolatility(values);
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const coefficientOfVariation = mean > 0 ? volatility / mean : 1;
  
  // Lower volatility = higher confidence
  return Math.max(0.1, Math.min(0.9, 1 - coefficientOfVariation));
}

function calculateCostImpact(jobsPerMinute: number): string {
  if (jobsPerMinute > 10) return 'high_cost_scaling_needed';
  if (jobsPerMinute > 5) return 'moderate_cost_increase';
  if (jobsPerMinute < 1) return 'cost_savings_possible';
  return 'cost_neutral';
}

function calculateOverallHealth(currentStatus: any, alerts: any[]): string {
  const criticalAlerts = alerts.filter(a => a.type === 'critical').length;
  const warningAlerts = alerts.filter(a => a.type === 'warning').length;

  if (criticalAlerts > 0) return 'critical';
  if (warningAlerts > 2) return 'degraded';
  if (warningAlerts > 0) return 'warning';
  return 'healthy';
}

function calculatePerformanceScore(trends: any, processingStats: any): number {
  let score = 100;

  // Factor in processing performance
  const processingScore = processingStats.performance?.performance_score || 100;
  score = score * 0.4 + processingScore * 0.6;

  // Factor in resource trend stability
  const unstableTrends = Object.values(trends).filter((trend: any) => 
    trend.direction !== 'stable' && Math.abs(trend.change_percent) > 20
  ).length;
  
  score -= unstableTrends * 10;

  return Math.max(0, Math.round(score));
}

function calculateCapacityUtilization(currentStatus: any): number {
  const memoryUtil = currentStatus.memory?.utilization_percent || 0;
  const cpuUtil = currentStatus.cpu?.utilization_percent || 0;
  const workerUtil = currentStatus.workers?.utilization_percent || 0;
  const dbUtil = currentStatus.database?.utilization_percent || 0;

  return Math.round((memoryUtil + cpuUtil + workerUtil + dbUtil) / 4);
}
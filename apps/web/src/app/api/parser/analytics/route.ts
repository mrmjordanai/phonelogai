import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@phonelogai/database';
import { withAuth } from '@/middleware/auth';
import { withRBAC } from '@/middleware/rbac';
import { z } from 'zod';

// Analytics query schema
const analyticsQuerySchema = z.object({
  timeframe: z.enum(['1h', '6h', '24h', '7d', '30d', '90d']).default('7d'),
  metrics: z.array(z.enum(['processing_time', 'success_rate', 'throughput', 'error_patterns', 'file_types', 'carriers'])).default(['processing_time', 'success_rate', 'throughput']),
  granularity: z.enum(['hour', 'day', 'week']).default('day'),
  group_by: z.array(z.enum(['carrier', 'file_format', 'user', 'template', 'file_size_category'])).optional(),
  filters: z.object({
    carrier: z.string().optional(),
    file_format: z.enum(['csv', 'pdf', 'txt', 'xlsx', 'json']).optional(),
    user_id: z.string().uuid().optional(),
    template_id: z.string().uuid().optional(),
    min_file_size_mb: z.number().optional(),
    max_file_size_mb: z.number().optional(),
    status: z.enum(['completed', 'failed', 'partial']).optional(),
  }).optional(),
  include_comparisons: z.coerce.boolean().default(false),
  include_predictions: z.coerce.boolean().default(false),
});

/**
 * GET /api/parser/analytics
 * 
 * Get comprehensive analytics and insights for job processing
 */
export async function GET(request: NextRequest) {
  try {
    // Apply authentication and RBAC middleware
    const authResult = await withAuth(request);
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const rbacResult = await withRBAC(request, 'analytics', 'read');
    if (!rbacResult.success) {
      return NextResponse.json({ error: rbacResult.error }, { status: 403 });
    }

    const user = authResult.user!;
    const url = new URL(request.url);
    const queryParams = Object.fromEntries(url.searchParams.entries());
    
    // Parse array parameters
    if (queryParams.metrics) {
      queryParams.metrics = queryParams.metrics.split(',');
    }
    if (queryParams.group_by) {
      queryParams.group_by = queryParams.group_by.split(',');
    }
    
    const validation = analyticsQuerySchema.safeParse(queryParams);
    if (!validation.success) {
      return NextResponse.json(
        { 
          error: 'Invalid query parameters',
          details: validation.error.errors
        },
        { status: 400 }
      );
    }

    const { timeframe, metrics, granularity, group_by, filters, include_comparisons, include_predictions } = validation.data;

    const supabase = createClient();

    // Calculate time range
    const timeRanges = {
      '1h': 1 * 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
      '90d': 90 * 24 * 60 * 60 * 1000,
    };

    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - timeRanges[timeframe]);

    // Get analytics data
    const analyticsData = await getAnalyticsData(
      supabase,
      startTime,
      endTime,
      metrics,
      granularity,
      group_by,
      filters,
      user.orgId
    );

    // Get comparison data if requested
    let comparisonData = null;
    if (include_comparisons) {
      const comparisonStartTime = new Date(startTime.getTime() - timeRanges[timeframe]);
      comparisonData = await getAnalyticsData(
        supabase,
        comparisonStartTime,
        startTime,
        metrics,
        granularity,
        group_by,
        filters,
        user.orgId
      );
    }

    // Generate insights and recommendations
    const insights = generateInsights(analyticsData, comparisonData);

    // Generate predictions if requested
    let predictions = null;
    if (include_predictions) {
      predictions = await generatePredictions(analyticsData, timeframe);
    }

    // Calculate key performance indicators
    const kpis = calculateKPIs(analyticsData);

    // Get top performers and problem areas
    const topPerformers = identifyTopPerformers(analyticsData);
    const problemAreas = identifyProblemAreas(analyticsData);

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      timeframe: {
        start: startTime.toISOString(),
        end: endTime.toISOString(),
        duration_ms: timeRanges[timeframe],
      },
      
      // Core analytics data
      analytics: analyticsData,
      
      // Comparison with previous period
      comparison: comparisonData ? {
        data: comparisonData,
        changes: calculatePeriodChanges(analyticsData, comparisonData),
      } : null,
      
      // Key performance indicators
      kpis: kpis,
      
      // Insights and patterns
      insights: insights,
      
      // Performance analysis
      performance: {
        top_performers: topPerformers,
        problem_areas: problemAreas,
        efficiency_score: calculateEfficiencyScore(analyticsData),
        quality_score: calculateQualityScore(analyticsData),
      },
      
      // Predictions and forecasts
      predictions: predictions,
      
      // Configuration used for this analysis
      query: {
        timeframe,
        metrics,
        granularity,
        group_by,
        filters,
      },
    });

  } catch (error) {
    console.error('Analytics error:', error);
    
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
 * Get analytics data from database
 */
async function getAnalyticsData(
  supabase: any,
  startTime: Date,
  endTime: Date,
  metrics: string[],
  granularity: string,
  groupBy: string[] = [],
  filters: any = {},
  orgId: string
): Promise<any> {
  // Base query for job analytics
  let query = supabase
    .from('job_analytics')
    .select('*')
    .gte('created_at', startTime.toISOString())
    .lte('created_at', endTime.toISOString())
    .eq('org_id', orgId);

  // Apply filters
  if (filters.carrier) {
    query = query.eq('carrier_detected', filters.carrier);
  }
  if (filters.file_format) {
    query = query.eq('file_format', filters.file_format);
  }
  if (filters.user_id) {
    query = query.eq('user_id', filters.user_id);
  }
  if (filters.template_used) {
    query = query.eq('template_used', filters.template_used);
  }
  if (filters.min_file_size_mb) {
    query = query.gte('file_size_mb', filters.min_file_size_mb);
  }
  if (filters.max_file_size_mb) {
    query = query.lte('file_size_mb', filters.max_file_size_mb);
  }

  const { data: jobs, error } = await query;

  if (error) {
    console.error('Failed to fetch analytics data:', error);
    throw error;
  }

  // Process and aggregate data
  const result: any = {
    raw_data: jobs,
    summary: calculateSummary(jobs || []),
    time_series: generateTimeSeries(jobs || [], startTime, endTime, granularity),
  };

  // Add grouping if requested
  if (groupBy && groupBy.length > 0) {
    result.grouped_data = {};
    
    groupBy.forEach(groupField => {
      result.grouped_data[groupField] = groupData(jobs || [], groupField);
    });
  }

  // Calculate specific metrics
  metrics.forEach(metric => {
    switch (metric) {
      case 'processing_time':
        result.processing_time = calculateProcessingTimeMetrics(jobs || []);
        break;
      case 'success_rate':
        result.success_rate = calculateSuccessRateMetrics(jobs || []);
        break;
      case 'throughput':
        result.throughput = calculateThroughputMetrics(jobs || [], startTime, endTime);
        break;
      case 'error_patterns':
        result.error_patterns = analyzeErrorPatterns(jobs || []);
        break;
      case 'file_types':
        result.file_types = analyzeFileTypes(jobs || []);
        break;
      case 'carriers':
        result.carriers = analyzeCarriers(jobs || []);
        break;
    }
  });

  return result;
}

/**
 * Calculate summary statistics
 */
function calculateSummary(jobs: any[]): any {
  const totalJobs = jobs.length;
  const successfulJobs = jobs.filter(j => j.rows_successful > j.rows_failed).length;
  const failedJobs = jobs.filter(j => j.rows_failed > j.rows_successful).length;
  const partialJobs = totalJobs - successfulJobs - failedJobs;

  const totalRows = jobs.reduce((sum, job) => sum + (job.rows_processed || 0), 0);
  const successfulRows = jobs.reduce((sum, job) => sum + (job.rows_successful || 0), 0);
  const failedRows = jobs.reduce((sum, job) => sum + (job.rows_failed || 0), 0);

  const totalProcessingTime = jobs.reduce((sum, job) => sum + (job.processing_time_ms || 0), 0);
  const totalFileSize = jobs.reduce((sum, job) => sum + (job.file_size_mb || 0), 0);

  return {
    jobs: {
      total: totalJobs,
      successful: successfulJobs,
      failed: failedJobs,
      partial: partialJobs,
      success_rate_percent: totalJobs > 0 ? (successfulJobs / totalJobs) * 100 : 0,
    },
    
    data: {
      total_rows: totalRows,
      successful_rows: successfulRows,
      failed_rows: failedRows,
      data_success_rate_percent: totalRows > 0 ? (successfulRows / totalRows) * 100 : 0,
    },
    
    performance: {
      total_processing_time_ms: totalProcessingTime,
      avg_processing_time_ms: totalJobs > 0 ? totalProcessingTime / totalJobs : 0,
      total_file_size_mb: totalFileSize,
      avg_file_size_mb: totalJobs > 0 ? totalFileSize / totalJobs : 0,
      throughput_rows_per_second: totalProcessingTime > 0 ? (totalRows / (totalProcessingTime / 1000)) : 0,
    },
  };
}

/**
 * Generate time series data
 */
function generateTimeSeries(
  jobs: any[],
  startTime: Date,
  endTime: Date,
  granularity: string
): any[] {
  const interval = granularity === 'hour' ? 60 * 60 * 1000 : 
                  granularity === 'day' ? 24 * 60 * 60 * 1000 : 
                  7 * 24 * 60 * 60 * 1000; // week

  const timeSeries: any[] = [];
  let currentTime = new Date(Math.floor(startTime.getTime() / interval) * interval);

  while (currentTime < endTime) {
    const nextTime = new Date(currentTime.getTime() + interval);
    const periodJobs = jobs.filter(job => {
      const jobTime = new Date(job.created_at);
      return jobTime >= currentTime && jobTime < nextTime;
    });

    const summary = calculateSummary(periodJobs);
    
    timeSeries.push({
      timestamp: currentTime.toISOString(),
      period_end: nextTime.toISOString(),
      ...summary,
      job_count: periodJobs.length,
    });

    currentTime = nextTime;
  }

  return timeSeries;
}

/**
 * Group data by specified field
 */
function groupData(jobs: any[], groupField: string): any {
  const groups: Record<string, any[]> = {};

  jobs.forEach(job => {
    let groupValue = '';
    
    switch (groupField) {
      case 'carrier':
        groupValue = job.carrier_detected || 'unknown';
        break;
      case 'file_format':
        groupValue = job.file_format || 'unknown';
        break;
      case 'user':
        groupValue = job.user_id || 'unknown';
        break;
      case 'template':
        groupValue = job.template_used || 'no_template';
        break;
      case 'file_size_category':
        const sizeMb = job.file_size_mb || 0;
        if (sizeMb < 1) groupValue = 'small';
        else if (sizeMb < 10) groupValue = 'medium';
        else if (sizeMb < 50) groupValue = 'large';
        else groupValue = 'xlarge';
        break;
      default:
        groupValue = 'unknown';
    }

    if (!groups[groupValue]) {
      groups[groupValue] = [];
    }
    groups[groupValue].push(job);
  });

  // Calculate summary for each group
  const groupSummaries: Record<string, any> = {};
  Object.keys(groups).forEach(groupValue => {
    groupSummaries[groupValue] = {
      ...calculateSummary(groups[groupValue]),
      job_count: groups[groupValue].length,
    };
  });

  return groupSummaries;
}

/**
 * Calculate processing time metrics
 */
function calculateProcessingTimeMetrics(jobs: any[]): any {
  const processingTimes = jobs
    .map(job => job.processing_time_ms || 0)
    .filter(time => time > 0)
    .sort((a, b) => a - b);

  if (processingTimes.length === 0) {
    return {
      avg: 0,
      median: 0,
      p95: 0,
      p99: 0,
      min: 0,
      max: 0,
    };
  }

  const sum = processingTimes.reduce((acc, time) => acc + time, 0);
  const count = processingTimes.length;

  return {
    avg: Math.round(sum / count),
    median: processingTimes[Math.floor(count / 2)],
    p95: processingTimes[Math.floor(count * 0.95)],
    p99: processingTimes[Math.floor(count * 0.99)],
    min: processingTimes[0],
    max: processingTimes[count - 1],
    
    // Performance targets
    meets_100k_target: jobs.filter(j => 
      (j.rows_processed >= 100000) && (j.processing_time_ms <= 300000)
    ).length,
    meets_1m_target: jobs.filter(j => 
      (j.rows_processed >= 1000000) && (j.processing_time_ms <= 1800000)
    ).length,
  };
}

/**
 * Calculate success rate metrics
 */
function calculateSuccessRateMetrics(jobs: any[]): any {
  const totalJobs = jobs.length;
  if (totalJobs === 0) {
    return { job_success_rate: 0, data_success_rate: 0, by_file_size: {} };
  }

  const successfulJobs = jobs.filter(j => j.rows_successful > j.rows_failed).length;
  const jobSuccessRate = (successfulJobs / totalJobs) * 100;

  const totalRows = jobs.reduce((sum, job) => sum + (job.rows_processed || 0), 0);
  const successfulRows = jobs.reduce((sum, job) => sum + (job.rows_successful || 0), 0);
  const dataSuccessRate = totalRows > 0 ? (successfulRows / totalRows) * 100 : 0;

  // Success rate by file size
  const sizeCategories = ['small', 'medium', 'large', 'xlarge'];
  const byFileSize: Record<string, any> = {};

  sizeCategories.forEach(category => {
    const categoryJobs = jobs.filter(job => {
      const sizeMb = job.file_size_mb || 0;
      switch (category) {
        case 'small': return sizeMb < 1;
        case 'medium': return sizeMb >= 1 && sizeMb < 10;
        case 'large': return sizeMb >= 10 && sizeMb < 50;
        case 'xlarge': return sizeMb >= 50;
        default: return false;
      }
    });

    if (categoryJobs.length > 0) {
      const successfulInCategory = categoryJobs.filter(j => j.rows_successful > j.rows_failed).length;
      byFileSize[category] = {
        job_count: categoryJobs.length,
        success_rate: (successfulInCategory / categoryJobs.length) * 100,
      };
    }
  });

  return {
    job_success_rate_percent: Math.round(jobSuccessRate * 100) / 100,
    data_success_rate_percent: Math.round(dataSuccessRate * 100) / 100,
    by_file_size: byFileSize,
  };
}

/**
 * Calculate throughput metrics
 */
function calculateThroughputMetrics(jobs: any[], startTime: Date, endTime: Date): any {
  const durationHours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
  const durationMinutes = durationHours * 60;

  const totalJobs = jobs.length;
  const totalRows = jobs.reduce((sum, job) => sum + (job.rows_processed || 0), 0);
  const totalFileSize = jobs.reduce((sum, job) => sum + (job.file_size_mb || 0), 0);

  return {
    jobs_per_hour: durationHours > 0 ? totalJobs / durationHours : 0,
    rows_per_minute: durationMinutes > 0 ? totalRows / durationMinutes : 0,
    mb_per_hour: durationHours > 0 ? totalFileSize / durationHours : 0,
    avg_rows_per_job: totalJobs > 0 ? totalRows / totalJobs : 0,
    
    // Peak throughput analysis
    peak_analysis: calculatePeakThroughput(jobs, startTime, endTime),
  };
}

/**
 * Calculate peak throughput
 */
function calculatePeakThroughput(jobs: any[], startTime: Date, endTime: Date): any {
  // Group jobs by hour and find peak
  const hourlyGroups: Record<string, any[]> = {};
  
  jobs.forEach(job => {
    const jobDate = new Date(job.created_at);
    const hourKey = new Date(jobDate.getFullYear(), jobDate.getMonth(), jobDate.getDate(), jobDate.getHours()).toISOString();
    
    if (!hourlyGroups[hourKey]) {
      hourlyGroups[hourKey] = [];
    }
    hourlyGroups[hourKey].push(job);
  });

  let peakHour = '';
  let peakJobCount = 0;
  let peakRowCount = 0;

  Object.keys(hourlyGroups).forEach(hourKey => {
    const hourJobs = hourlyGroups[hourKey];
    const jobCount = hourJobs.length;
    const rowCount = hourJobs.reduce((sum, job) => sum + (job.rows_processed || 0), 0);

    if (jobCount > peakJobCount) {
      peakHour = hourKey;
      peakJobCount = jobCount;
      peakRowCount = rowCount;
    }
  });

  return {
    peak_hour: peakHour,
    peak_jobs_per_hour: peakJobCount,
    peak_rows_per_hour: peakRowCount,
    avg_jobs_per_hour: Object.keys(hourlyGroups).length > 0 
      ? jobs.length / Object.keys(hourlyGroups).length 
      : 0,
  };
}

/**
 * Analyze error patterns
 */
function analyzeErrorPatterns(jobs: any[]): any {
  const errorCounts: Record<string, number> = {};
  const errorsByCarrier: Record<string, Record<string, number>> = {};
  const errorsByFileFormat: Record<string, Record<string, number>> = {};

  jobs.forEach(job => {
    if (job.error_count > 0 || job.rows_failed > 0) {
      const carrier = job.carrier_detected || 'unknown';
      const format = job.file_format || 'unknown';
      
      // This would normally parse actual error messages
      // For now, we'll simulate based on job characteristics
      let errorType = 'unknown_error';
      
      if (job.rows_failed > job.rows_processed * 0.8) {
        errorType = 'parsing_failure';
      } else if (job.processing_time_ms > 1800000) {
        errorType = 'timeout';
      } else if (job.file_size_mb > 100) {
        errorType = 'file_too_large';
      } else {
        errorType = 'data_validation_error';
      }

      errorCounts[errorType] = (errorCounts[errorType] || 0) + 1;

      if (!errorsByCarrier[carrier]) errorsByCarrier[carrier] = {};
      errorsByCarrier[carrier][errorType] = (errorsByCarrier[carrier][errorType] || 0) + 1;

      if (!errorsByFileFormat[format]) errorsByFileFormat[format] = {};
      errorsByFileFormat[format][errorType] = (errorsByFileFormat[format][errorType] || 0) + 1;
    }
  });

  const totalErrors = Object.values(errorCounts).reduce((sum, count) => sum + count, 0);
  const topErrors = Object.entries(errorCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([error, count]) => ({
      error_type: error,
      count,
      percentage: totalErrors > 0 ? (count / totalErrors) * 100 : 0,
    }));

  return {
    total_errors: totalErrors,
    top_errors: topErrors,
    by_carrier: errorsByCarrier,
    by_file_format: errorsByFileFormat,
  };
}

/**
 * Analyze file types
 */
function analyzeFileTypes(jobs: any[]): any {
  const typeStats: Record<string, any> = {};

  jobs.forEach(job => {
    const format = job.file_format || 'unknown';
    
    if (!typeStats[format]) {
      typeStats[format] = {
        count: 0,
        total_size_mb: 0,
        total_rows: 0,
        successful_jobs: 0,
        total_processing_time: 0,
      };
    }

    const stats = typeStats[format];
    stats.count++;
    stats.total_size_mb += job.file_size_mb || 0;
    stats.total_rows += job.rows_processed || 0;
    stats.total_processing_time += job.processing_time_ms || 0;
    
    if (job.rows_successful > job.rows_failed) {
      stats.successful_jobs++;
    }
  });

  // Calculate derived metrics
  Object.keys(typeStats).forEach(format => {
    const stats = typeStats[format];
    stats.avg_size_mb = stats.count > 0 ? stats.total_size_mb / stats.count : 0;
    stats.avg_rows = stats.count > 0 ? stats.total_rows / stats.count : 0;
    stats.avg_processing_time_ms = stats.count > 0 ? stats.total_processing_time / stats.count : 0;
    stats.success_rate_percent = stats.count > 0 ? (stats.successful_jobs / stats.count) * 100 : 0;
  });

  return typeStats;
}

/**
 * Analyze carriers
 */
function analyzeCarriers(jobs: any[]): any {
  const carrierStats: Record<string, any> = {};

  jobs.forEach(job => {
    const carrier = job.carrier_detected || 'unknown';
    
    if (!carrierStats[carrier]) {
      carrierStats[carrier] = {
        count: 0,
        total_rows: 0,
        successful_jobs: 0,
        total_processing_time: 0,
        file_formats: new Set(),
      };
    }

    const stats = carrierStats[carrier];
    stats.count++;
    stats.total_rows += job.rows_processed || 0;
    stats.total_processing_time += job.processing_time_ms || 0;
    
    if (job.file_format) {
      stats.file_formats.add(job.file_format);
    }
    
    if (job.rows_successful > job.rows_failed) {
      stats.successful_jobs++;
    }
  });

  // Calculate derived metrics and convert Sets to arrays
  Object.keys(carrierStats).forEach(carrier => {
    const stats = carrierStats[carrier];
    stats.avg_rows = stats.count > 0 ? stats.total_rows / stats.count : 0;
    stats.avg_processing_time_ms = stats.count > 0 ? stats.total_processing_time / stats.count : 0;
    stats.success_rate_percent = stats.count > 0 ? (stats.successful_jobs / stats.count) * 100 : 0;
    stats.file_formats = Array.from(stats.file_formats);
  });

  return carrierStats;
}

/**
 * Generate insights from analytics data
 */
function generateInsights(analyticsData: any, comparisonData?: any): any[] {
  const insights: any[] = [];

  // Processing time insights
  if (analyticsData.processing_time) {
    const avgTime = analyticsData.processing_time.avg;
    if (avgTime > 600000) { // > 10 minutes average
      insights.push({
        type: 'performance',
        severity: 'warning',
        title: 'High Average Processing Time',
        description: `Average processing time is ${Math.round(avgTime / 60000)} minutes, which may indicate performance issues.`,
        recommendation: 'Review file sizes, optimize parsing algorithms, or increase processing capacity.',
      });
    }

    if (analyticsData.processing_time.meets_100k_target === 0 && analyticsData.summary.jobs.total > 0) {
      insights.push({
        type: 'performance',
        severity: 'critical',
        title: 'Missing Performance Targets',
        description: 'No jobs are meeting the 100k rows in 5 minutes performance target.',
        recommendation: 'Investigate processing bottlenecks and optimize system performance.',
      });
    }
  }

  // Success rate insights
  if (analyticsData.success_rate) {
    const successRate = analyticsData.success_rate.job_success_rate_percent;
    if (successRate < 90) {
      insights.push({
        type: 'quality',
        severity: successRate < 70 ? 'critical' : 'warning',
        title: 'Low Success Rate',
        description: `Job success rate is ${successRate.toFixed(1)}%, indicating quality issues.`,
        recommendation: 'Review error patterns and improve data validation or template accuracy.',
      });
    }
  }

  // Error pattern insights
  if (analyticsData.error_patterns && analyticsData.error_patterns.total_errors > 0) {
    const topError = analyticsData.error_patterns.top_errors[0];
    if (topError && topError.percentage > 50) {
      insights.push({
        type: 'error_analysis',
        severity: 'warning',
        title: `Dominant Error Pattern: ${topError.error_type}`,
        description: `${topError.error_type} accounts for ${topError.percentage.toFixed(1)}% of all errors.`,
        recommendation: `Focus on resolving ${topError.error_type} issues to improve overall success rates.`,
      });
    }
  }

  // Throughput insights
  if (analyticsData.throughput) {
    const rowsPerMinute = analyticsData.throughput.rows_per_minute;
    if (rowsPerMinute < 1000) { // Less than 1k rows per minute
      insights.push({
        type: 'throughput',
        severity: 'info',
        title: 'Low Processing Throughput',
        description: `Current throughput is ${Math.round(rowsPerMinute)} rows per minute.`,
        recommendation: 'Consider optimizing processing algorithms or scaling up resources.',
      });
    }
  }

  // Comparison insights
  if (comparisonData) {
    const currentSuccess = analyticsData.success_rate?.job_success_rate_percent || 0;
    const previousSuccess = comparisonData.success_rate?.job_success_rate_percent || 0;
    const successChange = currentSuccess - previousSuccess;

    if (Math.abs(successChange) > 5) {
      insights.push({
        type: 'trend',
        severity: successChange > 0 ? 'positive' : 'negative',
        title: `Success Rate ${successChange > 0 ? 'Improvement' : 'Decline'}`,
        description: `Success rate has ${successChange > 0 ? 'increased' : 'decreased'} by ${Math.abs(successChange).toFixed(1)}% compared to the previous period.`,
        recommendation: successChange > 0 
          ? 'Continue current practices that led to this improvement.'
          : 'Investigate what changed to cause this decline in success rates.',
      });
    }
  }

  return insights;
}

/**
 * Calculate period-over-period changes
 */
function calculatePeriodChanges(current: any, previous: any): any {
  const changes: any = {};

  // Success rate changes
  if (current.success_rate && previous.success_rate) {
    changes.success_rate = {
      current: current.success_rate.job_success_rate_percent,
      previous: previous.success_rate.job_success_rate_percent,
      change_percent: current.success_rate.job_success_rate_percent - previous.success_rate.job_success_rate_percent,
    };
  }

  // Processing time changes
  if (current.processing_time && previous.processing_time) {
    changes.processing_time = {
      current: current.processing_time.avg,
      previous: previous.processing_time.avg,
      change_percent: previous.processing_time.avg > 0 
        ? ((current.processing_time.avg - previous.processing_time.avg) / previous.processing_time.avg) * 100
        : 0,
    };
  }

  // Volume changes
  if (current.summary && previous.summary) {
    changes.volume = {
      current_jobs: current.summary.jobs.total,
      previous_jobs: previous.summary.jobs.total,
      change_percent: previous.summary.jobs.total > 0 
        ? ((current.summary.jobs.total - previous.summary.jobs.total) / previous.summary.jobs.total) * 100
        : 0,
    };
  }

  return changes;
}

/**
 * Generate predictions based on historical data
 */
async function generatePredictions(analyticsData: any, timeframe: string): Promise<any> {
  // Simple trend-based predictions
  const timeSeries = analyticsData.time_series || [];
  
  if (timeSeries.length < 3) {
    return {
      note: 'Insufficient data for reliable predictions',
      confidence: 0,
    };
  }

  // Predict next period volumes
  const recentVolumes = timeSeries.slice(-3).map((point: any) => point.job_count);
  const volumeTrend = calculateTrend(recentVolumes);
  const nextPeriodVolume = Math.max(0, recentVolumes[recentVolumes.length - 1] + volumeTrend);

  // Predict success rate trend
  const recentSuccessRates = timeSeries.slice(-3).map((point: any) => point.jobs.success_rate_percent);
  const successTrend = calculateTrend(recentSuccessRates);
  const nextPeriodSuccessRate = Math.max(0, Math.min(100, recentSuccessRates[recentSuccessRates.length - 1] + successTrend));

  return {
    next_period: {
      predicted_job_volume: Math.round(nextPeriodVolume),
      predicted_success_rate: Math.round(nextPeriodSuccessRate * 100) / 100,
      volume_trend: volumeTrend > 0 ? 'increasing' : volumeTrend < 0 ? 'decreasing' : 'stable',
      success_trend: successTrend > 0 ? 'improving' : successTrend < 0 ? 'declining' : 'stable',
    },
    confidence: calculatePredictionConfidence(timeSeries),
    recommendations: generatePredictionRecommendations(volumeTrend, successTrend),
  };
}

/**
 * Calculate simple linear trend
 */
function calculateTrend(values: number[]): number {
  if (values.length < 2) return 0;
  
  const n = values.length;
  const sumX = (n * (n - 1)) / 2; // Sum of indices
  const sumY = values.reduce((sum, val) => sum + val, 0);
  const sumXY = values.reduce((sum, val, index) => sum + val * index, 0);
  const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  return slope;
}

/**
 * Calculate prediction confidence
 */
function calculatePredictionConfidence(timeSeries: any[]): number {
  if (timeSeries.length < 5) return 0.3;
  if (timeSeries.length < 10) return 0.6;
  return 0.8;
}

/**
 * Generate prediction recommendations
 */
function generatePredictionRecommendations(volumeTrend: number, successTrend: number): string[] {
  const recommendations: string[] = [];

  if (volumeTrend > 2) {
    recommendations.push('Prepare for increased processing volume by scaling up resources');
  } else if (volumeTrend < -2) {
    recommendations.push('Consider scaling down resources due to decreasing volume');
  }

  if (successTrend < -5) {
    recommendations.push('Address declining success rates before they impact user satisfaction');
  } else if (successTrend > 5) {
    recommendations.push('Success rates are improving - maintain current practices');
  }

  return recommendations;
}

/**
 * Calculate KPIs
 */
function calculateKPIs(analyticsData: any): any {
  return {
    overall_health_score: calculateOverallHealthScore(analyticsData),
    efficiency_score: calculateEfficiencyScore(analyticsData),
    quality_score: calculateQualityScore(analyticsData),
    performance_score: calculatePerformanceScore(analyticsData),
  };
}

/**
 * Calculate overall health score (0-100)
 */
function calculateOverallHealthScore(analyticsData: any): number {
  const successRate = analyticsData.success_rate?.job_success_rate_percent || 0;
  const avgProcessingTime = analyticsData.processing_time?.avg || 0;
  const errorCount = analyticsData.error_patterns?.total_errors || 0;
  const totalJobs = analyticsData.summary?.jobs?.total || 1;

  let score = 100;

  // Penalize low success rates
  score -= (100 - successRate) * 0.5;

  // Penalize slow processing
  if (avgProcessingTime > 600000) { // > 10 minutes
    score -= 20;
  }

  // Penalize high error rates
  const errorRate = (errorCount / totalJobs) * 100;
  score -= errorRate * 0.3;

  return Math.max(0, Math.round(score));
}

/**
 * Calculate efficiency score (0-100)
 */
function calculateEfficiencyScore(analyticsData: any): number {
  const throughput = analyticsData.throughput?.rows_per_minute || 0;
  const avgProcessingTime = analyticsData.processing_time?.avg || 0;
  
  let score = 100;

  // Score based on throughput
  if (throughput < 500) score -= 30;
  else if (throughput < 1000) score -= 15;

  // Score based on processing time
  if (avgProcessingTime > 1800000) score -= 40; // > 30 minutes
  else if (avgProcessingTime > 600000) score -= 20; // > 10 minutes

  return Math.max(0, Math.round(score));
}

/**
 * Calculate quality score (0-100)
 */
function calculateQualityScore(analyticsData: any): number {
  const jobSuccessRate = analyticsData.success_rate?.job_success_rate_percent || 0;
  const dataSuccessRate = analyticsData.success_rate?.data_success_rate_percent || 0;
  
  // Weighted average favoring data success rate
  const qualityScore = (jobSuccessRate * 0.3) + (dataSuccessRate * 0.7);
  
  return Math.round(qualityScore);
}

/**
 * Calculate performance score (0-100)
 */
function calculatePerformanceScore(analyticsData: any): number {
  const meets100k = analyticsData.processing_time?.meets_100k_target || 0;
  const meets1m = analyticsData.processing_time?.meets_1m_target || 0;
  const totalJobs = analyticsData.summary?.jobs?.total || 1;

  const targetMeetingRate = ((meets100k + meets1m) / totalJobs) * 100;
  
  return Math.round(targetMeetingRate);
}

/**
 * Identify top performers
 */
function identifyTopPerformers(analyticsData: any): any {
  const performers: any = {};

  // Top performing carriers
  if (analyticsData.carriers) {
    const carriersBySuccessRate = Object.entries(analyticsData.carriers)
      .map(([carrier, stats]: [string, any]) => ({ carrier, ...stats }))
      .sort((a, b) => b.success_rate_percent - a.success_rate_percent)
      .slice(0, 3);
    
    performers.carriers = carriersBySuccessRate;
  }

  // Top performing file formats
  if (analyticsData.file_types) {
    const formatsBySuccessRate = Object.entries(analyticsData.file_types)
      .map(([format, stats]: [string, any]) => ({ format, ...stats }))
      .sort((a, b) => b.success_rate_percent - a.success_rate_percent)
      .slice(0, 3);
    
    performers.file_formats = formatsBySuccessRate;
  }

  return performers;
}

/**
 * Identify problem areas
 */
function identifyProblemAreas(analyticsData: any): any {
  const problems: any = {};

  // Worst performing carriers
  if (analyticsData.carriers) {
    const worstCarriers = Object.entries(analyticsData.carriers)
      .map(([carrier, stats]: [string, any]) => ({ carrier, ...stats }))
      .sort((a, b) => a.success_rate_percent - b.success_rate_percent)
      .slice(0, 3);
    
    problems.carriers = worstCarriers.filter(c => c.success_rate_percent < 80);
  }

  // Problematic file formats
  if (analyticsData.file_types) {
    const problemFormats = Object.entries(analyticsData.file_types)
      .map(([format, stats]: [string, any]) => ({ format, ...stats }))
      .sort((a, b) => a.success_rate_percent - b.success_rate_percent)
      .filter(([, stats]: [string, any]) => stats.success_rate_percent < 80)
      .slice(0, 3);
    
    problems.file_formats = problemFormats;
  }

  return problems;
}
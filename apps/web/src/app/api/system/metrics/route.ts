import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@phonelogai/database';
import { withAuth } from '@/middleware/auth';
import { withRBAC } from '@/middleware/rbac';

/**
 * POST /api/system/metrics
 * 
 * Submit system metrics (typically used by monitoring agents)
 */
export async function POST(request: NextRequest) {
  try {
    // For metrics submission, we might use API key auth instead of session auth
    const apiKey = request.headers.get('x-api-key');
    const isMetricsAgent = apiKey === process.env.METRICS_API_KEY;

    if (!isMetricsAgent) {
      // Apply normal authentication for user-submitted metrics
      const authResult = await withAuth(request);
      if (!authResult.success) {
        return NextResponse.json({ error: authResult.error }, { status: 401 });
      }

      const rbacResult = await withRBAC(request, 'system_monitoring', 'create');
      if (!rbacResult.success) {
        return NextResponse.json({ error: rbacResult.error }, { status: 403 });
      }
    }

    const metricsData = await request.json();
    
    // Validate metrics data structure
    if (!Array.isArray(metricsData.metrics)) {
      return NextResponse.json(
        { error: 'Metrics data must contain a metrics array' },
        { status: 400 }
      );
    }

    const supabase = createClient();
    const timestamp = new Date().toISOString();
    const source = metricsData.source || 'api';

    // Process and validate each metric
    const validatedMetrics = metricsData.metrics
      .map((metric: any) => {
        // Validate required fields
        if (!metric.metric_name || typeof metric.value !== 'number') {
          return null;
        }

        return {
          metric_name: metric.metric_name,
          metric_type: metric.metric_type || 'gauge',
          value: metric.value,
          count: metric.count || 1,
          tags: metric.tags || {},
          source: source,
          environment: process.env.NODE_ENV || 'development',
          created_at: metric.timestamp || timestamp,
          
          // Optional timing fields for histograms
          min_value: metric.min_value,
          max_value: metric.max_value,
          avg_value: metric.avg_value,
          p95_value: metric.p95_value,
          p99_value: metric.p99_value,
        };
      })
      .filter(Boolean); // Remove invalid metrics

    if (validatedMetrics.length === 0) {
      return NextResponse.json(
        { error: 'No valid metrics found in submission' },
        { status: 400 }
      );
    }

    // Insert metrics into database
    const { data: insertedMetrics, error: insertError } = await supabase
      .from('system_metrics')
      .insert(validatedMetrics)
      .select('id, metric_name, created_at');

    if (insertError) {
      console.error('Failed to insert metrics:', insertError);
      return NextResponse.json(
        { error: 'Failed to store metrics' },
        { status: 500 }
      );
    }

    // Check for alert conditions on critical metrics
    const alerts = await checkMetricAlerts(validatedMetrics);

    return NextResponse.json({
      success: true,
      message: 'Metrics stored successfully',
      metrics_stored: insertedMetrics?.length || 0,
      alerts_triggered: alerts.length,
      alerts: alerts.length > 0 ? alerts : undefined,
    });

  } catch (error) {
    console.error('Submit metrics error:', error);
    
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
 * GET /api/system/metrics
 * 
 * Retrieve system metrics with filtering and aggregation
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

    const url = new URL(request.url);
    const params = Object.fromEntries(url.searchParams.entries());

    // Parse query parameters
    const metricNames = params.metrics ? params.metrics.split(',') : [];
    const timeframe = params.timeframe || '1h'; // 1h, 6h, 24h, 7d, 30d
    const granularity = params.granularity || 'minute'; // minute, hour, day
    const aggregation = params.aggregation || 'avg'; // avg, min, max, sum, count
    const tags = params.tags ? JSON.parse(params.tags) : {};

    // Calculate time range
    const timeRanges: Record<string, number> = {
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
    };

    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - (timeRanges[timeframe] || timeRanges['1h']));

    const supabase = createClient();

    // Build query
    let query = supabase
      .from('system_metrics')
      .select('*')
      .gte('created_at', startTime.toISOString())
      .lte('created_at', endTime.toISOString())
      .order('created_at', { ascending: true });

    // Filter by metric names
    if (metricNames.length > 0) {
      query = query.in('metric_name', metricNames);
    }

    // Filter by tags (basic implementation)
    if (Object.keys(tags).length > 0) {
      query = query.contains('tags', tags);
    }

    const { data: metrics, error } = await query;

    if (error) {
      console.error('Failed to fetch metrics:', error);
      return NextResponse.json(
        { error: 'Failed to fetch metrics' },
        { status: 500 }
      );
    }

    // Group and aggregate metrics
    const aggregatedData = aggregateMetrics(
      metrics || [],
      granularity,
      aggregation,
      startTime,
      endTime
    );

    // Calculate summary statistics
    const summary = calculateMetricsSummary(metrics || []);

    return NextResponse.json({
      timeframe: {
        start: startTime.toISOString(),
        end: endTime.toISOString(),
        duration_ms: timeRanges[timeframe] || timeRanges['1h'],
      },
      query: {
        metrics: metricNames,
        granularity,
        aggregation,
        tags,
      },
      summary,
      data: aggregatedData,
      metadata: {
        total_points: (metrics || []).length,
        unique_metrics: [...new Set((metrics || []).map(m => m.metric_name))],
        data_sources: [...new Set((metrics || []).map(m => m.source))],
      },
    });

  } catch (error) {
    console.error('Get metrics error:', error);
    
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
 * Check for alert conditions in submitted metrics
 */
async function checkMetricAlerts(metrics: any[]): Promise<any[]> {
  const alerts: any[] = [];

  metrics.forEach(metric => {
    const { metric_name, value } = metric;

    // Define alert thresholds
    const thresholds: Record<string, { warning: number; critical: number }> = {
      'memory_utilization_percent': { warning: 80, critical: 90 },
      'cpu_utilization_percent': { warning: 80, critical: 90 },
      'disk_utilization_percent': { warning: 85, critical: 95 },
      'queue_depth': { warning: 50, critical: 100 },
      'error_rate_percent': { warning: 5, critical: 10 },
      'response_time_ms': { warning: 2000, critical: 5000 },
    };

    const threshold = thresholds[metric_name];
    if (!threshold) return;

    let severity = null;
    if (value >= threshold.critical) {
      severity = 'critical';
    } else if (value >= threshold.warning) {
      severity = 'warning';
    }

    if (severity) {
      alerts.push({
        metric_name,
        current_value: value,
        threshold_type: severity,
        threshold_value: severity === 'critical' ? threshold.critical : threshold.warning,
        message: `${metric_name} is ${value} (${severity} threshold: ${severity === 'critical' ? threshold.critical : threshold.warning})`,
        timestamp: new Date().toISOString(),
      });
    }
  });

  return alerts;
}

/**
 * Aggregate metrics by time window and aggregation function
 */
function aggregateMetrics(
  metrics: any[],
  granularity: string,
  aggregation: string,
  startTime: Date,
  endTime: Date
): any {
  // Define time bucket sizes
  const bucketSizes: Record<string, number> = {
    'minute': 60 * 1000,
    'hour': 60 * 60 * 1000,
    'day': 24 * 60 * 60 * 1000,
  };

  const bucketSize = bucketSizes[granularity] || bucketSizes['minute'];

  // Group metrics by name and time bucket
  const groupedMetrics: Record<string, Record<string, any[]>> = {};

  metrics.forEach(metric => {
    const metricName = metric.metric_name;
    const timestamp = new Date(metric.created_at).getTime();
    const bucketTime = Math.floor(timestamp / bucketSize) * bucketSize;
    const bucketKey = new Date(bucketTime).toISOString();

    if (!groupedMetrics[metricName]) {
      groupedMetrics[metricName] = {};
    }

    if (!groupedMetrics[metricName][bucketKey]) {
      groupedMetrics[metricName][bucketKey] = [];
    }

    groupedMetrics[metricName][bucketKey].push(metric);
  });

  // Aggregate values within each bucket
  const result: Record<string, any[]> = {};

  Object.keys(groupedMetrics).forEach(metricName => {
    result[metricName] = [];
    
    const buckets = groupedMetrics[metricName];
    const sortedBuckets = Object.keys(buckets).sort();

    sortedBuckets.forEach(bucketKey => {
      const bucketMetrics = buckets[bucketKey];
      const values = bucketMetrics.map(m => m.value);

      let aggregatedValue = 0;
      switch (aggregation) {
        case 'avg':
          aggregatedValue = values.reduce((sum, val) => sum + val, 0) / values.length;
          break;
        case 'min':
          aggregatedValue = Math.min(...values);
          break;
        case 'max':
          aggregatedValue = Math.max(...values);
          break;
        case 'sum':
          aggregatedValue = values.reduce((sum, val) => sum + val, 0);
          break;
        case 'count':
          aggregatedValue = values.length;
          break;
        default:
          aggregatedValue = values.reduce((sum, val) => sum + val, 0) / values.length;
      }

      result[metricName].push({
        timestamp: bucketKey,
        value: Math.round(aggregatedValue * 100) / 100, // Round to 2 decimal places
        count: values.length,
        raw_values: values.length <= 10 ? values : undefined, // Include raw values for small buckets
      });
    });
  });

  return result;
}

/**
 * Calculate summary statistics for metrics
 */
function calculateMetricsSummary(metrics: any[]): any {
  const metricGroups: Record<string, number[]> = {};

  // Group values by metric name
  metrics.forEach(metric => {
    if (!metricGroups[metric.metric_name]) {
      metricGroups[metric.metric_name] = [];
    }
    metricGroups[metric.metric_name].push(metric.value);
  });

  // Calculate statistics for each metric
  const summary: Record<string, any> = {};

  Object.keys(metricGroups).forEach(metricName => {
    const values = metricGroups[metricName].sort((a, b) => a - b);
    
    if (values.length === 0) return;

    const sum = values.reduce((acc, val) => acc + val, 0);
    const avg = sum / values.length;
    const min = values[0];
    const max = values[values.length - 1];
    const median = values[Math.floor(values.length / 2)];
    const p95 = values[Math.floor(values.length * 0.95)] || max;
    const p99 = values[Math.floor(values.length * 0.99)] || max;

    // Calculate variance and standard deviation
    const variance = values.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    summary[metricName] = {
      count: values.length,
      avg: Math.round(avg * 100) / 100,
      min,
      max,
      median,
      p95,
      p99,
      std_dev: Math.round(stdDev * 100) / 100,
      latest_value: metrics
        .filter(m => m.metric_name === metricName)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]?.value,
    };
  });

  return summary;
}
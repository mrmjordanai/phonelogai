import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@phonelogai/database';
import { withAuth } from '@/middleware/auth';
import { withRBAC } from '@/middleware/rbac';
import { z } from 'zod';
import crypto from 'crypto';

interface RouteParams {
  params: {
    webhookId: string;
  };
}

// Webhook update schema
const updateWebhookSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  events: z.array(z.enum([
    'job.started',
    'job.progress',
    'job.completed',
    'job.failed',
    'job.cancelled',
    'template.created',
    'template.updated',
    'system.alert',
    'system.maintenance',
    'user.notification',
  ])).min(1).optional(),
  headers: z.record(z.string()).optional(),
  retry_count: z.number().min(0).max(10).optional(),
  timeout_seconds: z.number().min(1).max(300).optional(),
  is_active: z.boolean().optional(),
});

/**
 * GET /api/webhooks/[webhookId]
 * 
 * Get detailed information about a specific webhook
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    // Apply authentication and RBAC middleware
    const authResult = await withAuth(request);
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const rbacResult = await withRBAC(request, 'webhooks', 'read');
    if (!rbacResult.success) {
      return NextResponse.json({ error: rbacResult.error }, { status: 403 });
    }

    const user = authResult.user!;
    const { webhookId } = params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(webhookId)) {
      return NextResponse.json(
        { error: 'Invalid webhook ID format' },
        { status: 400 }
      );
    }

    const supabase = createClient();

    // Get webhook details
    const { data: webhook, error } = await supabase
      .from('webhooks')
      .select('*')
      .eq('id', webhookId)
      .eq('user_id', user.id)
      .single();

    if (error || !webhook) {
      return NextResponse.json(
        { error: 'Webhook not found' },
        { status: 404 }
      );
    }

    // Get delivery history
    const { data: deliveries, error: deliveriesError } = await supabase
      .from('webhook_deliveries')
      .select('*')
      .eq('webhook_id', webhookId)
      .order('sent_at', { ascending: false })
      .limit(50);

    if (deliveriesError) {
      console.error('Failed to fetch delivery history:', deliveriesError);
    }

    // Calculate statistics
    const stats = calculateWebhookStatistics(webhook, deliveries || []);

    return NextResponse.json({
      webhook: {
        id: webhook.id,
        name: webhook.name,
        url: webhook.url,
        events: webhook.events,
        headers: webhook.headers,
        is_active: webhook.is_active,
        retry_count: webhook.retry_count,
        timeout_seconds: webhook.timeout_seconds,
        created_at: webhook.created_at,
        updated_at: webhook.updated_at,
        last_success_at: webhook.last_success_at,
        last_failure_at: webhook.last_failure_at,
        last_response_status: webhook.last_response_status,
      },
      
      statistics: stats.summary,
      performance: stats.performance,
      reliability: stats.reliability,
      
      recent_deliveries: (deliveries || []).slice(0, 20).map(delivery => ({
        id: delivery.id,
        event_type: delivery.event_type,
        http_status: delivery.http_status,
        response_time_ms: delivery.response_time_ms,
        sent_at: delivery.sent_at,
        attempt_number: delivery.attempt_number,
        is_final_attempt: delivery.is_final_attempt,
        error_message: delivery.error_message,
      })),
      
      health: {
        status: determineWebhookHealth(webhook, deliveries || []),
        issues: identifyWebhookIssues(webhook, deliveries || []),
        recommendations: generateWebhookRecommendations(webhook, deliveries || []),
      },
      
      configuration: {
        signature_validation: {
          algorithm: 'sha256',
          header: 'X-Webhook-Signature',
          format: 'sha256=<hex_digest>',
        },
        required_headers: [
          'X-Webhook-Signature',
          'X-Webhook-ID',
          'X-Webhook-Event',
          'X-Webhook-Timestamp',
        ],
        retry_policy: {
          max_attempts: webhook.retry_count + 1,
          backoff_strategy: 'exponential',
          base_delay_ms: 1000,
          max_delay_ms: 60000,
        },
        timeout_policy: {
          request_timeout_seconds: webhook.timeout_seconds,
          read_timeout_seconds: webhook.timeout_seconds,
        },
      },
    });

  } catch (error) {
    console.error('Get webhook error:', error);
    
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
 * PATCH /api/webhooks/[webhookId]
 * 
 * Update webhook configuration
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    // Apply authentication and RBAC middleware
    const authResult = await withAuth(request);
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const rbacResult = await withRBAC(request, 'webhooks', 'update');
    if (!rbacResult.success) {
      return NextResponse.json({ error: rbacResult.error }, { status: 403 });
    }

    const user = authResult.user!;
    const { webhookId } = params;
    const requestData = await request.json();

    // Validate request data
    const validation = updateWebhookSchema.safeParse(requestData);
    if (!validation.success) {
      return NextResponse.json(
        { 
          error: 'Invalid update data',
          details: validation.error.errors
        },
        { status: 400 }
      );
    }

    const updateData = validation.data;
    const supabase = createClient();

    // Check if webhook exists and user owns it
    const { data: existingWebhook, error: fetchError } = await supabase
      .from('webhooks')
      .select('*')
      .eq('id', webhookId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !existingWebhook) {
      return NextResponse.json(
        { error: 'Webhook not found or access denied' },
        { status: 404 }
      );
    }

    // Update webhook
    const { data: updatedWebhook, error: updateError } = await supabase
      .from('webhooks')
      .update({
        ...updateData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', webhookId)
      .select()
      .single();

    if (updateError || !updatedWebhook) {
      console.error('Failed to update webhook:', updateError);
      return NextResponse.json(
        { error: 'Failed to update webhook' },
        { status: 500 }
      );
    }

    // If webhook was reactivated, send a test ping
    let testResult = null;
    if (updateData.is_active === true && !existingWebhook.is_active) {
      testResult = await testWebhookDelivery(updatedWebhook, {
        event: 'webhook.reactivated',
        data: {
          webhook_id: updatedWebhook.id,
          message: 'Webhook reactivated',
          timestamp: new Date().toISOString(),
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Webhook updated successfully',
      webhook: {
        id: updatedWebhook.id,
        name: updatedWebhook.name,
        url: updatedWebhook.url,
        events: updatedWebhook.events,
        is_active: updatedWebhook.is_active,
        updated_at: updatedWebhook.updated_at,
      },
      changes: Object.keys(updateData),
      test_delivery: testResult,
    });

  } catch (error) {
    console.error('Update webhook error:', error);
    
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
 * DELETE /api/webhooks/[webhookId]
 * 
 * Delete a webhook
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    // Apply authentication and RBAC middleware
    const authResult = await withAuth(request);
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const rbacResult = await withRBAC(request, 'webhooks', 'delete');
    if (!rbacResult.success) {
      return NextResponse.json({ error: rbacResult.error }, { status: 403 });
    }

    const user = authResult.user!;
    const { webhookId } = params;

    const supabase = createClient();

    // Check if webhook exists and user owns it
    const { data: webhook, error: fetchError } = await supabase
      .from('webhooks')
      .select('id, name, total_requests')
      .eq('id', webhookId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !webhook) {
      return NextResponse.json(
        { error: 'Webhook not found or access denied' },
        { status: 404 }
      );
    }

    // Delete webhook (this will cascade delete deliveries)
    const { error: deleteError } = await supabase
      .from('webhooks')
      .delete()
      .eq('id', webhookId);

    if (deleteError) {
      console.error('Failed to delete webhook:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete webhook' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Webhook deleted successfully',
      deleted_webhook: {
        id: webhookId,
        name: webhook.name,
        total_requests_processed: webhook.total_requests,
      },
    });

  } catch (error) {
    console.error('Delete webhook error:', error);
    
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
 * POST /api/webhooks/[webhookId]/test
 * 
 * Test webhook delivery
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    // Apply authentication and RBAC middleware
    const authResult = await withAuth(request);
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const rbacResult = await withRBAC(request, 'webhooks', 'update');
    if (!rbacResult.success) {
      return NextResponse.json({ error: rbacResult.error }, { status: 403 });
    }

    const user = authResult.user!;
    const { webhookId } = params;
    const url = new URL(request.url);
    const isTest = url.pathname.endsWith('/test');

    if (!isTest) {
      return NextResponse.json(
        { error: 'Invalid endpoint' },
        { status: 404 }
      );
    }

    const supabase = createClient();

    // Get webhook
    const { data: webhook, error } = await supabase
      .from('webhooks')
      .select('*')
      .eq('id', webhookId)
      .eq('user_id', user.id)
      .single();

    if (error || !webhook) {
      return NextResponse.json(
        { error: 'Webhook not found' },
        { status: 404 }
      );
    }

    if (!webhook.is_active) {
      return NextResponse.json(
        { error: 'Cannot test inactive webhook' },
        { status: 400 }
      );
    }

    // Send test payload
    const testPayload = {
      event: 'webhook.test',
      webhook_id: webhook.id,
      data: {
        message: 'This is a test webhook delivery from PhoneLogAI',
        test_timestamp: new Date().toISOString(),
        user_id: user.id,
        test_data: {
          sample_job: {
            id: 'test-job-123',
            status: 'completed',
            filename: 'sample_data.csv',
            rows_processed: 1000,
            success_rate: 95.5,
          },
        },
      },
      timestamp: new Date().toISOString(),
    };

    const testResult = await testWebhookDelivery(webhook, testPayload);

    // Log the test delivery
    await supabase
      .from('webhook_deliveries')
      .insert({
        webhook_id: webhook.id,
        event_type: 'webhook.test',
        payload: testPayload,
        url: webhook.url,
        http_status: testResult.statusCode || 0,
        response_time_ms: testResult.responseTime || 0,
        error_message: testResult.error || null,
        attempt_number: 1,
        is_final_attempt: true,
      });

    return NextResponse.json({
      success: testResult.success,
      message: testResult.success ? 'Webhook test successful' : 'Webhook test failed',
      test_result: {
        status_code: testResult.statusCode,
        response_time_ms: testResult.responseTime,
        success: testResult.success,
        error: testResult.error,
      },
      payload_sent: testPayload,
      recommendations: testResult.success ? [] : [
        'Check if webhook endpoint is accessible',
        'Verify webhook URL is correct',
        'Ensure webhook endpoint accepts POST requests',
        'Check for SSL/TLS certificate issues',
        'Verify webhook endpoint handles JSON payloads',
      ],
    });

  } catch (error) {
    console.error('Test webhook error:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Helper functions (reused from the main webhook route)

/**
 * Calculate comprehensive webhook statistics
 */
function calculateWebhookStatistics(webhook: any, deliveries: any[]): any {
  const now = new Date();
  const last24h = deliveries.filter(d => 
    new Date(d.sent_at) > new Date(now.getTime() - 24 * 60 * 60 * 1000)
  );
  const last7d = deliveries.filter(d => 
    new Date(d.sent_at) > new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  );

  const successful = deliveries.filter(d => d.http_status >= 200 && d.http_status < 300);
  const failed = deliveries.filter(d => d.http_status >= 400);

  return {
    summary: {
      total_deliveries: deliveries.length,
      successful_deliveries: successful.length,
      failed_deliveries: failed.length,
      success_rate_percent: deliveries.length > 0 
        ? (successful.length / deliveries.length) * 100 
        : 0,
      deliveries_last_24h: last24h.length,
      deliveries_last_7d: last7d.length,
    },
    
    performance: {
      avg_response_time_ms: deliveries.length > 0
        ? Math.round(deliveries.reduce((sum, d) => sum + (d.response_time_ms || 0), 0) / deliveries.length)
        : 0,
      fastest_response_ms: deliveries.length > 0
        ? Math.min(...deliveries.map(d => d.response_time_ms || 0))
        : 0,
      slowest_response_ms: deliveries.length > 0
        ? Math.max(...deliveries.map(d => d.response_time_ms || 0))
        : 0,
      p95_response_time_ms: calculatePercentile(deliveries.map(d => d.response_time_ms || 0), 0.95),
    },
    
    reliability: {
      uptime_last_24h: calculateUptime(last24h),
      uptime_last_7d: calculateUptime(last7d),
      consecutive_failures: calculateConsecutiveFailures(deliveries),
      last_successful_delivery: successful.length > 0 
        ? successful[0].sent_at 
        : null,
      retry_rate_percent: deliveries.length > 0
        ? (deliveries.filter(d => d.attempt_number > 1).length / deliveries.length) * 100
        : 0,
    },
  };
}

/**
 * Calculate uptime percentage
 */
function calculateUptime(deliveries: any[]): number {
  if (deliveries.length === 0) return 100;
  
  const successful = deliveries.filter(d => d.http_status >= 200 && d.http_status < 300);
  return (successful.length / deliveries.length) * 100;
}

/**
 * Calculate consecutive failures
 */
function calculateConsecutiveFailures(deliveries: any[]): number {
  let consecutive = 0;
  
  for (const delivery of deliveries) {
    if (delivery.http_status >= 400) {
      consecutive++;
    } else if (delivery.http_status >= 200 && delivery.http_status < 300) {
      break;
    }
  }
  
  return consecutive;
}

/**
 * Calculate percentile
 */
function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  
  const sorted = values.filter(v => v > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  
  const index = Math.ceil(sorted.length * percentile) - 1;
  return sorted[index] || 0;
}

/**
 * Test webhook delivery
 */
async function testWebhookDelivery(webhook: any, payload: any): Promise<{
  success: boolean;
  statusCode?: number;
  responseTime?: number;
  error?: string;
}> {
  const startTime = Date.now();
  
  try {
    // Create signature
    const signature = createWebhookSignature(payload, webhook.secret);
    
    // Prepare headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'PhoneLogAI-Webhook/1.0',
      'X-Webhook-Signature': signature,
      'X-Webhook-ID': webhook.id,
      'X-Webhook-Event': payload.event,
      'X-Webhook-Timestamp': new Date().toISOString(),
      ...webhook.headers,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), webhook.timeout_seconds * 1000);

    const response = await fetch(webhook.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const responseTime = Date.now() - startTime;

    return {
      success: response.ok,
      statusCode: response.status,
      responseTime,
      error: response.ok ? undefined : `HTTP ${response.status}: ${response.statusText}`,
    };

  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    return {
      success: false,
      responseTime,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Create webhook signature
 */
function createWebhookSignature(payload: any, secret: string): string {
  const payloadString = JSON.stringify(payload);
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payloadString)
    .digest('hex');
  
  return `sha256=${signature}`;
}

/**
 * Determine webhook health status
 */
function determineWebhookHealth(webhook: any, deliveries: any[]): string {
  if (!webhook.is_active) return 'inactive';
  
  const recentDeliveries = deliveries.filter((d: any) => 
    new Date(d.sent_at) > new Date(Date.now() - 24 * 60 * 60 * 1000)
  );

  if (recentDeliveries.length === 0) return 'no_activity';

  const successfulRecent = recentDeliveries.filter((d: any) => 
    d.http_status >= 200 && d.http_status < 300
  );

  const recentSuccessRate = successfulRecent.length / recentDeliveries.length;

  if (recentSuccessRate >= 0.95) return 'healthy';
  if (recentSuccessRate >= 0.8) return 'warning';
  return 'unhealthy';
}

/**
 * Identify webhook issues
 */
function identifyWebhookIssues(webhook: any, deliveries: any[]): string[] {
  const issues: string[] = [];

  if (!webhook.is_active) {
    issues.push('Webhook is inactive');
  }

  const recentDeliveries = deliveries.filter((d: any) => 
    new Date(d.sent_at) > new Date(Date.now() - 24 * 60 * 60 * 1000)
  );

  if (recentDeliveries.length === 0) {
    issues.push('No recent activity');
  } else {
    const failedRecent = recentDeliveries.filter((d: any) => 
      d.http_status >= 400
    );

    if (failedRecent.length > 0) {
      issues.push('Recent delivery failures');
    }

    const slowDeliveries = recentDeliveries.filter((d: any) => 
      (d.response_time_ms || 0) > webhook.timeout_seconds * 500
    );

    if (slowDeliveries.length > recentDeliveries.length * 0.3) {
      issues.push('High response times');
    }
  }

  const consecutiveFailures = calculateConsecutiveFailures(deliveries);
  if (consecutiveFailures > 3) {
    issues.push(`${consecutiveFailures} consecutive failures`);
  }

  return issues;
}

/**
 * Generate webhook recommendations
 */
function generateWebhookRecommendations(webhook: any, deliveries: any[]): string[] {
  const recommendations: string[] = [];
  const issues = identifyWebhookIssues(webhook, deliveries);

  if (issues.includes('Recent delivery failures')) {
    recommendations.push('Check webhook endpoint logs for error details');
    recommendations.push('Verify webhook endpoint is accessible and responding correctly');
  }

  if (issues.includes('High response times')) {
    recommendations.push('Optimize webhook endpoint performance');
    recommendations.push('Consider increasing timeout settings');
  }

  const consecutiveFailures = calculateConsecutiveFailures(deliveries);
  if (consecutiveFailures > 5) {
    recommendations.push('Consider temporarily disabling webhook to prevent further failures');
    recommendations.push('Debug webhook endpoint implementation');
  }

  const recentDeliveries = deliveries.filter((d: any) => 
    new Date(d.sent_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  );

  if (recentDeliveries.length === 0) {
    recommendations.push('Test webhook to ensure it\'s working correctly');
  }

  return recommendations;
}
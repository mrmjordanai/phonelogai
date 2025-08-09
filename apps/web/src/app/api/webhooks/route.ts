import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@phonelogai/database';
import { withAuth } from '@/middleware/auth';
import { withRBAC } from '@/middleware/rbac';
import { z } from 'zod';
import crypto from 'crypto';

// Webhook creation schema
const webhookSchema = z.object({
  name: z.string().min(1, 'Webhook name is required').max(100),
  url: z.string().url('Valid URL is required'),
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
  ])).min(1, 'At least one event must be selected'),
  headers: z.record(z.string()).default({}),
  secret: z.string().optional(),
  retry_count: z.number().min(0).max(10).default(3),
  timeout_seconds: z.number().min(1).max(300).default(30),
  is_active: z.boolean().default(true),
});

// Webhook update schema
const updateWebhookSchema = webhookSchema.partial().omit(['url']);

// Query schema
const listWebhooksSchema = z.object({
  is_active: z.coerce.boolean().optional(),
  event: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
  sort_by: z.enum(['name', 'created_at', 'updated_at', 'last_success_at']).default('created_at'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
});

/**
 * GET /api/webhooks
 * 
 * List user's webhooks with filtering and pagination
 */
export async function GET(request: NextRequest) {
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
    const url = new URL(request.url);
    const queryParams = Object.fromEntries(url.searchParams.entries());
    
    const validation = listWebhooksSchema.safeParse(queryParams);
    if (!validation.success) {
      return NextResponse.json(
        { 
          error: 'Invalid query parameters',
          details: validation.error.errors
        },
        { status: 400 }
      );
    }

    const { is_active, event, limit, offset, sort_by, sort_order } = validation.data;

    const supabase = createClient();

    // Build query
    let query = supabase
      .from('webhooks')
      .select(`
        *,
        webhook_deliveries(
          id,
          event_type,
          http_status,
          sent_at,
          response_time_ms
        )
      `)
      .eq('user_id', user.id);

    // Apply filters
    if (is_active !== undefined) {
      query = query.eq('is_active', is_active);
    }
    if (event) {
      query = query.contains('events', [event]);
    }

    // Apply sorting and pagination
    query = query.order(sort_by, { ascending: sort_order === 'asc' });
    query = query.range(offset, offset + limit - 1);

    const { data: webhooks, error, count } = await query;

    if (error) {
      console.error('Failed to fetch webhooks:', error);
      return NextResponse.json(
        { error: 'Failed to fetch webhooks' },
        { status: 500 }
      );
    }

    // Format webhook data with statistics
    const formattedWebhooks = (webhooks || []).map(webhook => {
      const deliveries = webhook.webhook_deliveries || [];
      const recentDeliveries = deliveries.filter((d: any) => 
        new Date(d.sent_at) > new Date(Date.now() - 24 * 60 * 60 * 1000)
      );

      const successfulDeliveries = deliveries.filter((d: any) => 
        d.http_status >= 200 && d.http_status < 300
      );

      const avgResponseTime = deliveries.length > 0
        ? deliveries.reduce((sum: number, d: any) => sum + (d.response_time_ms || 0), 0) / deliveries.length
        : 0;

      return {
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
        
        // Statistics
        statistics: {
          total_requests: webhook.total_requests,
          successful_requests: webhook.successful_requests,
          failed_requests: webhook.failed_requests,
          success_rate_percent: webhook.total_requests > 0 
            ? (webhook.successful_requests / webhook.total_requests) * 100 
            : 0,
          last_success_at: webhook.last_success_at,
          last_failure_at: webhook.last_failure_at,
          last_response_status: webhook.last_response_status,
          avg_response_time_ms: Math.round(avgResponseTime),
        },
        
        // Recent activity
        recent_activity: {
          deliveries_24h: recentDeliveries.length,
          successful_24h: recentDeliveries.filter((d: any) => 
            d.http_status >= 200 && d.http_status < 300
          ).length,
        },
        
        // Health status
        health: {
          status: determineWebhookHealth(webhook, deliveries),
          issues: identifyWebhookIssues(webhook, deliveries),
        },
      };
    });

    return NextResponse.json({
      webhooks: formattedWebhooks,
      pagination: {
        total: count || 0,
        limit,
        offset,
        has_more: (count || 0) > offset + limit,
      },
      filters: { is_active, event, sort_by, sort_order },
    });

  } catch (error) {
    console.error('Get webhooks error:', error);
    
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
 * POST /api/webhooks
 * 
 * Create a new webhook
 */
export async function POST(request: NextRequest) {
  try {
    // Apply authentication and RBAC middleware
    const authResult = await withAuth(request);
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const rbacResult = await withRBAC(request, 'webhooks', 'create');
    if (!rbacResult.success) {
      return NextResponse.json({ error: rbacResult.error }, { status: 403 });
    }

    const user = authResult.user!;
    const requestData = await request.json();

    // Validate request data
    const validation = webhookSchema.safeParse(requestData);
    if (!validation.success) {
      return NextResponse.json(
        { 
          error: 'Invalid webhook data',
          details: validation.error.errors
        },
        { status: 400 }
      );
    }

    const webhookData = validation.data;

    // Validate URL accessibility (basic check)
    const urlValidation = await validateWebhookUrl(webhookData.url);
    if (!urlValidation.valid) {
      return NextResponse.json(
        { 
          error: 'Webhook URL validation failed',
          details: urlValidation.error
        },
        { status: 400 }
      );
    }

    const supabase = createClient();

    // Check webhook limit (max 10 per user)
    const { data: existingWebhooks, error: countError } = await supabase
      .from('webhooks')
      .select('id')
      .eq('user_id', user.id);

    if (countError) {
      console.error('Failed to check webhook count:', countError);
      return NextResponse.json(
        { error: 'Failed to check webhook limit' },
        { status: 500 }
      );
    }

    if (existingWebhooks.length >= 10) {
      return NextResponse.json(
        { error: 'Maximum webhook limit reached (10 per user)' },
        { status: 429 }
      );
    }

    // Generate secret if not provided
    const secret = webhookData.secret || generateWebhookSecret();

    // Create webhook
    const { data: newWebhook, error: createError } = await supabase
      .from('webhooks')
      .insert({
        user_id: user.id,
        org_id: user.orgId,
        name: webhookData.name,
        url: webhookData.url,
        events: webhookData.events,
        headers: webhookData.headers,
        secret,
        retry_count: webhookData.retry_count,
        timeout_seconds: webhookData.timeout_seconds,
        is_active: webhookData.is_active,
      })
      .select()
      .single();

    if (createError || !newWebhook) {
      console.error('Failed to create webhook:', createError);
      return NextResponse.json(
        { error: 'Failed to create webhook' },
        { status: 500 }
      );
    }

    // Test webhook with a ping event
    const testResult = await testWebhookDelivery(newWebhook, {
      event: 'webhook.test',
      data: {
        webhook_id: newWebhook.id,
        message: 'Test webhook delivery',
        timestamp: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Webhook created successfully',
      webhook: {
        id: newWebhook.id,
        name: newWebhook.name,
        url: newWebhook.url,
        events: newWebhook.events,
        is_active: newWebhook.is_active,
        created_at: newWebhook.created_at,
      },
      test_delivery: {
        success: testResult.success,
        status_code: testResult.statusCode,
        response_time_ms: testResult.responseTime,
        error: testResult.error,
      },
      webhook_info: {
        signature_header: 'X-Webhook-Signature',
        signature_algorithm: 'sha256',
        secret: secret, // Only returned on creation
        retry_policy: {
          max_retries: webhookData.retry_count,
          timeout_seconds: webhookData.timeout_seconds,
          backoff_strategy: 'exponential',
        },
      },
    });

  } catch (error) {
    console.error('Create webhook error:', error);
    
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
 * Validate webhook URL accessibility
 */
async function validateWebhookUrl(url: string): Promise<{ valid: boolean; error?: string }> {
  try {
    // Basic URL format validation
    const urlObj = new URL(url);
    
    // Only allow HTTPS in production
    if (process.env.NODE_ENV === 'production' && urlObj.protocol !== 'https:') {
      return { valid: false, error: 'Only HTTPS URLs are allowed in production' };
    }

    // Block localhost and private IPs in production
    if (process.env.NODE_ENV === 'production') {
      const hostname = urlObj.hostname;
      
      if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') {
        return { valid: false, error: 'localhost URLs are not allowed' };
      }
      
      // Check for private IP ranges
      const privateIpRegex = /^(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.)/;
      if (privateIpRegex.test(hostname)) {
        return { valid: false, error: 'Private IP addresses are not allowed' };
      }
    }

    // Optional: Perform a HEAD request to check if URL is accessible
    // This is commented out to avoid blocking during webhook creation
    /*
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      headers: {
        'User-Agent': 'PhoneLogAI-Webhook-Validator/1.0',
      },
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      return { valid: false, error: `URL returned status ${response.status}` };
    }
    */

    return { valid: true };
  } catch (error) {
    return { 
      valid: false, 
      error: error instanceof Error ? error.message : 'Invalid URL format'
    };
  }
}

/**
 * Generate a secure webhook secret
 */
function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString('hex');
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
      const commonStatusCodes = getCommonStatusCodes(failedRecent);
      issues.push(`Recent failures: ${commonStatusCodes.join(', ')}`);
    }

    const slowDeliveries = recentDeliveries.filter((d: any) => 
      (d.response_time_ms || 0) > webhook.timeout_seconds * 500 // Half of timeout
    );

    if (slowDeliveries.length > recentDeliveries.length * 0.3) {
      issues.push('High response times detected');
    }
  }

  if (webhook.last_failure_at && 
      (!webhook.last_success_at || 
       new Date(webhook.last_failure_at) > new Date(webhook.last_success_at))) {
    issues.push('Last delivery failed');
  }

  return issues;
}

/**
 * Get common HTTP status codes from failed deliveries
 */
function getCommonStatusCodes(failedDeliveries: any[]): string[] {
  const statusCounts: Record<number, number> = {};
  
  failedDeliveries.forEach((d: any) => {
    statusCounts[d.http_status] = (statusCounts[d.http_status] || 0) + 1;
  });

  return Object.entries(statusCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 3)
    .map(([status]) => status);
}
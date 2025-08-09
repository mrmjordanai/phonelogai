/**
 * Rate Limiting Middleware
 * Implements rate limiting with in-memory and Redis support
 */

import { NextRequest, NextResponse } from 'next/server';
import type { UserRole } from '@phonelogai/shared/rbac';

export interface RateLimitOptions {
  requests: number; // Max requests
  window: number; // Time window in seconds
  keyGenerator?: (request: NextRequest) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  customRules?: RateLimitRule[];
}

export interface RateLimitRule {
  condition: (request: NextRequest) => boolean;
  requests: number;
  window: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  response?: NextResponse;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// In-memory store for rate limiting
// TODO: Replace with Redis for production multi-instance deployments
const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Main rate limiting function
 */
export async function rateLimitRequest(
  request: NextRequest,
  options: RateLimitOptions
): Promise<RateLimitResult> {
  try {
    const key = options.keyGenerator 
      ? options.keyGenerator(request)
      : generateDefaultKey(request);

    const now = Date.now();
    const windowMs = options.window * 1000;

    // Check custom rules first
    if (options.customRules) {
      for (const rule of options.customRules) {
        if (rule.condition(request)) {
          const ruleResult = await checkRateLimit(
            `${key}:custom`,
            rule.requests,
            rule.window * 1000,
            now
          );
          
          if (!ruleResult.allowed) {
            return createRateLimitResponse(ruleResult, 'Custom rule exceeded');
          }
        }
      }
    }

    // Check main rate limit
    const result = await checkRateLimit(key, options.requests, windowMs, now);

    if (!result.allowed) {
      return createRateLimitResponse(result, 'Rate limit exceeded');
    }

    return result;
  } catch (error) {
    console.error('Rate limiting error:', error);
    
    // Fail open - allow request if rate limiting fails
    return {
      allowed: true,
      remaining: 0,
      resetTime: Date.now() + options.window * 1000,
    };
  }
}

/**
 * Check rate limit against store
 */
async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
  now: number
): Promise<RateLimitResult> {
  const entry = rateLimitStore.get(key);
  const resetTime = now + windowMs;

  if (!entry || now > entry.resetTime) {
    // New window or expired entry
    rateLimitStore.set(key, { count: 1, resetTime });
    
    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetTime,
    };
  }

  if (entry.count >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: entry.resetTime,
    };
  }

  // Increment count
  entry.count++;
  rateLimitStore.set(key, entry);

  return {
    allowed: true,
    remaining: maxRequests - entry.count,
    resetTime: entry.resetTime,
  };
}

/**
 * Generate default rate limit key
 */
function generateDefaultKey(request: NextRequest): string {
  // Try to get user ID from auth header or cookie
  const authHeader = request.headers.get('authorization');
  if (authHeader) {
    // Extract user ID from JWT if possible
    // For now, use a simplified approach
    const token = authHeader.replace('Bearer ', '');
    return `user:${hashString(token)}`;
  }

  // Fallback to IP address
  const ip = getClientIP(request);
  return `ip:${ip}`;
}

/**
 * Get client IP address
 */
function getClientIP(request: NextRequest): string {
  // Check various headers for the real IP
  const headers = [
    'x-forwarded-for',
    'x-real-ip', 
    'cf-connecting-ip',
    'x-client-ip',
    'x-cluster-client-ip',
  ];

  for (const header of headers) {
    const value = request.headers.get(header);
    if (value) {
      // Take the first IP from comma-separated list
      return value.split(',')[0].trim();
    }
  }

  // Fallback to request IP (may not be available in all environments)
  return 'unknown';
}

/**
 * Simple string hashing for anonymization
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Create rate limit exceeded response
 */
function createRateLimitResponse(
  result: RateLimitResult,
  message: string
): RateLimitResult {
  const retryAfter = Math.ceil((result.resetTime - Date.now()) / 1000);
  
  const response = NextResponse.json(
    {
      error: message,
      retryAfter,
      timestamp: new Date().toISOString(),
    },
    { 
      status: 429,
      headers: {
        'Retry-After': retryAfter.toString(),
        'X-RateLimit-Remaining': result.remaining.toString(),
        'X-RateLimit-Reset': result.resetTime.toString(),
      },
    }
  );

  return { ...result, response };
}

/**
 * Role-based rate limiting
 */
export function createRoleBasedRateLimit(baseOptions: RateLimitOptions) {
  const roleMultipliers: Record<UserRole, number> = {
    viewer: 0.5,   // 50% of base limit
    member: 1,     // 100% of base limit
    analyst: 2,    // 200% of base limit
    admin: 5,      // 500% of base limit
    owner: 10,     // 1000% of base limit (effectively unlimited)
  };

  return {
    ...baseOptions,
    keyGenerator: (request: NextRequest) => {
      const baseKey = baseOptions.keyGenerator 
        ? baseOptions.keyGenerator(request)
        : generateDefaultKey(request);

      // TODO: Extract user role from auth context
      // For now, use base key
      return baseKey;
    },
  };
}

/**
 * Endpoint-specific rate limits
 */
export const rateLimits = {
  // Authentication endpoints
  auth: {
    requests: 5,
    window: 300, // 5 minutes
    keyGenerator: (request: NextRequest) => `auth:${getClientIP(request)}`,
  },

  // Data export (strict limits)
  export: {
    requests: 3,
    window: 3600, // 1 hour
    keyGenerator: (request: NextRequest) => `export:${generateDefaultKey(request)}`,
  },

  // File uploads
  upload: {
    requests: 10,
    window: 300, // 5 minutes
    keyGenerator: (request: NextRequest) => `upload:${generateDefaultKey(request)}`,
  },

  // Search endpoints
  search: {
    requests: 100,
    window: 60,
    keyGenerator: (request: NextRequest) => `search:${generateDefaultKey(request)}`,
  },

  // Dashboard/analytics
  dashboard: {
    requests: 1000,
    window: 60,
    keyGenerator: (request: NextRequest) => `dashboard:${generateDefaultKey(request)}`,
  },

  // API endpoints (general)
  api: {
    requests: 1000,
    window: 60,
    customRules: [
      // Stricter limits for write operations
      {
        condition: (req) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method),
        requests: 100,
        window: 60,
      },
      // Very strict for bulk operations
      {
        condition: (req) => req.url.includes('/bulk'),
        requests: 10,
        window: 60,
      },
    ],
  },
} as const;

/**
 * Cleanup expired entries from in-memory store
 */
export function cleanupRateLimitStore(): void {
  const now = Date.now();
  
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}

/**
 * Get rate limit statistics
 */
export function getRateLimitStats(): {
  totalKeys: number;
  memoryUsage: number;
  activeWindows: number;
} {
  const now = Date.now();
  let activeWindows = 0;
  
  for (const entry of rateLimitStore.values()) {
    if (now <= entry.resetTime) {
      activeWindows++;
    }
  }

  return {
    totalKeys: rateLimitStore.size,
    memoryUsage: JSON.stringify(Array.from(rateLimitStore.entries())).length,
    activeWindows,
  };
}

// Periodic cleanup of expired entries
setInterval(cleanupRateLimitStore, 60000); // Clean up every minute

export type { RateLimitOptions, RateLimitResult, RateLimitRule };
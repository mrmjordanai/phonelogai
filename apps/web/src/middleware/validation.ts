/**
 * Request Validation Middleware
 * Validates request structure, content types, and parameters
 */

import { NextRequest, NextResponse } from 'next/server';

export interface RequestValidationOptions {
  requireBody?: boolean;
  maxBodySize?: number; // bytes
  contentTypes?: string[];
  requiredHeaders?: string[];
  requiredParams?: string[];
  maxParams?: number;
  allowedMethods?: string[];
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  response?: NextResponse;
}

/**
 * Validate incoming request
 */
export async function validateRequest(
  request: NextRequest,
  options: RequestValidationOptions
): Promise<ValidationResult> {
  try {
    // Validate HTTP method
    if (options.allowedMethods && !options.allowedMethods.includes(request.method)) {
      return {
        valid: false,
        error: `Method ${request.method} not allowed`,
        response: createValidationErrorResponse(
          `Method ${request.method} not allowed. Allowed: ${options.allowedMethods.join(', ')}`,
          405
        ),
      };
    }

    // Validate content type
    if (options.contentTypes) {
      const contentType = request.headers.get('content-type');
      
      if (!contentType) {
        return {
          valid: false,
          error: 'Content-Type header required',
          response: createValidationErrorResponse('Content-Type header required', 400),
        };
      }

      const isValidContentType = options.contentTypes.some(type =>
        contentType.toLowerCase().includes(type.toLowerCase())
      );

      if (!isValidContentType) {
        return {
          valid: false,
          error: `Invalid content type: ${contentType}`,
          response: createValidationErrorResponse(
            `Invalid content type. Allowed: ${options.contentTypes.join(', ')}`,
            415
          ),
        };
      }
    }

    // Validate required headers
    if (options.requiredHeaders) {
      for (const header of options.requiredHeaders) {
        if (!request.headers.get(header)) {
          return {
            valid: false,
            error: `Required header missing: ${header}`,
            response: createValidationErrorResponse(
              `Required header missing: ${header}`,
              400
            ),
          };
        }
      }
    }

    // Validate body requirements
    if (options.requireBody) {
      const contentLength = request.headers.get('content-length');
      
      if (!contentLength || parseInt(contentLength, 10) === 0) {
        return {
          valid: false,
          error: 'Request body required',
          response: createValidationErrorResponse('Request body required', 400),
        };
      }
    }

    // Validate body size
    if (options.maxBodySize) {
      const contentLength = request.headers.get('content-length');
      
      if (contentLength && parseInt(contentLength, 10) > options.maxBodySize) {
        return {
          valid: false,
          error: `Request body too large: ${contentLength} bytes`,
          response: createValidationErrorResponse(
            `Request body too large. Maximum: ${formatBytes(options.maxBodySize)}`,
            413
          ),
        };
      }
    }

    // Validate URL parameters
    const url = new URL(request.url);
    const params = Array.from(url.searchParams.keys());

    if (options.maxParams && params.length > options.maxParams) {
      return {
        valid: false,
        error: `Too many parameters: ${params.length}`,
        response: createValidationErrorResponse(
          `Too many parameters. Maximum: ${options.maxParams}`,
          400
        ),
      };
    }

    if (options.requiredParams) {
      for (const param of options.requiredParams) {
        if (!url.searchParams.has(param)) {
          return {
            valid: false,
            error: `Required parameter missing: ${param}`,
            response: createValidationErrorResponse(
              `Required parameter missing: ${param}`,
              400
            ),
          };
        }
      }
    }

    return { valid: true };
  } catch (error) {
    console.error('Request validation error:', error);
    return {
      valid: false,
      error: 'Validation error',
      response: createValidationErrorResponse('Request validation failed', 500),
    };
  }
}

/**
 * Validate JSON body structure
 */
export async function validateJSONBody(
  request: NextRequest,
  schema: {
    required?: string[];
    optional?: string[];
    types?: Record<string, string>;
    maxProperties?: number;
  }
): Promise<ValidationResult> {
  try {
    const body = await request.json();

    if (typeof body !== 'object' || body === null) {
      return {
        valid: false,
        error: 'Body must be a JSON object',
        response: createValidationErrorResponse('Body must be a JSON object', 400),
      };
    }

    // Check required properties
    if (schema.required) {
      for (const prop of schema.required) {
        if (!(prop in body)) {
          return {
            valid: false,
            error: `Required property missing: ${prop}`,
            response: createValidationErrorResponse(
              `Required property missing: ${prop}`,
              400
            ),
          };
        }
      }
    }

    // Check property count
    const propCount = Object.keys(body).length;
    if (schema.maxProperties && propCount > schema.maxProperties) {
      return {
        valid: false,
        error: `Too many properties: ${propCount}`,
        response: createValidationErrorResponse(
          `Too many properties. Maximum: ${schema.maxProperties}`,
          400
        ),
      };
    }

    // Validate property types
    if (schema.types) {
      for (const [prop, expectedType] of Object.entries(schema.types)) {
        if (prop in body) {
          const actualType = Array.isArray(body[prop]) ? 'array' : typeof body[prop];
          
          if (actualType !== expectedType) {
            return {
              valid: false,
              error: `Invalid type for ${prop}: expected ${expectedType}, got ${actualType}`,
              response: createValidationErrorResponse(
                `Invalid type for ${prop}: expected ${expectedType}, got ${actualType}`,
                400
              ),
            };
          }
        }
      }
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: 'Invalid JSON body',
      response: createValidationErrorResponse('Invalid JSON body', 400),
    };
  }
}

/**
 * Validate UUID parameter
 */
export function validateUUID(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * Validate email format
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate phone number format
 */
export function validatePhoneNumber(phone: string): boolean {
  // Remove all non-digit characters
  const cleaned = phone.replace(/\D/g, '');
  
  // Check if it's between 10-15 digits (international format)
  return cleaned.length >= 10 && cleaned.length <= 15;
}

/**
 * Validate date string (ISO 8601)
 */
export function validateISO8601Date(date: string): boolean {
  try {
    const parsed = new Date(date);
    return parsed instanceof Date && !isNaN(parsed.getTime()) && date.includes('T');
  } catch {
    return false;
  }
}

/**
 * Validate integer within range
 */
export function validateIntegerRange(
  value: unknown,
  min?: number,
  max?: number
): boolean {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return false;
  }

  if (min !== undefined && value < min) {
    return false;
  }

  if (max !== undefined && value > max) {
    return false;
  }

  return true;
}

/**
 * Validate array with constraints
 */
export function validateArray(
  value: unknown,
  options: {
    minLength?: number;
    maxLength?: number;
    itemType?: string;
    allowEmpty?: boolean;
  } = {}
): boolean {
  if (!Array.isArray(value)) {
    return false;
  }

  if (!options.allowEmpty && value.length === 0) {
    return false;
  }

  if (options.minLength !== undefined && value.length < options.minLength) {
    return false;
  }

  if (options.maxLength !== undefined && value.length > options.maxLength) {
    return false;
  }

  if (options.itemType) {
    return value.every(item => typeof item === options.itemType);
  }

  return true;
}

/**
 * Sanitize string input
 */
export function sanitizeString(input: string, maxLength = 1000): string {
  return input
    .slice(0, maxLength)
    .replace(/[\x00-\x1F\x7F-\x9F]/g, '') // Remove control characters
    .trim();
}

/**
 * Create validation error response
 */
function createValidationErrorResponse(message: string, status = 400): NextResponse {
  return NextResponse.json(
    {
      error: message,
      timestamp: new Date().toISOString(),
      path: 'middleware/validation',
    },
    { status }
  );
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)}${units[unitIndex]}`;
}

/**
 * Pre-built validation schemas
 */
export const validationSchemas = {
  eventCreate: {
    required: ['line_id', 'ts', 'number', 'direction', 'type'],
    optional: ['duration', 'content', 'contact_id', 'source', 'metadata'],
    types: {
      line_id: 'string',
      ts: 'string',
      number: 'string',
      direction: 'string',
      type: 'string',
      duration: 'number',
      content: 'string',
      contact_id: 'string',
      source: 'string',
      metadata: 'object',
    },
    maxProperties: 10,
  },

  contactCreate: {
    required: ['number'],
    optional: ['name', 'company', 'tags', 'metadata'],
    types: {
      number: 'string',
      name: 'string',
      company: 'string',
      tags: 'array',
      metadata: 'object',
    },
    maxProperties: 6,
  },

  privacyRuleCreate: {
    required: ['contact_id'],
    optional: ['visibility', 'anonymize_number', 'anonymize_content'],
    types: {
      contact_id: 'string',
      visibility: 'string',
      anonymize_number: 'boolean',
      anonymize_content: 'boolean',
    },
    maxProperties: 4,
  },

  search: {
    optional: ['query', 'limit', 'offset', 'filters', 'sort'],
    types: {
      query: 'string',
      limit: 'number',
      offset: 'number',
      filters: 'object',
      sort: 'string',
    },
    maxProperties: 5,
  },
};
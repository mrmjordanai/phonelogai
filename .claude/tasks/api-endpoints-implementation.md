# API Endpoints Implementation Plan

## Overview
Implement comprehensive Next.js App Router API endpoints for the Call/SMS Intelligence Platform web application. The endpoints will provide secure, high-performance REST APIs with proper authentication, RBAC, and privacy controls.

## Architecture Overview

### Technology Stack
- **Next.js App Router**: Route handlers in `app/api/` directory
- **Supabase Auth**: Authentication and session management
- **Database Package**: `@phonelogai/database` for data operations
- **TypeScript**: Full type safety across all endpoints
- **RLS & RBAC**: Database-level security with org roles

### Key Architectural Principles
1. **Security First**: All endpoints require authentication and respect RLS policies
2. **RBAC Integration**: Role-based access control using org roles (owner > admin > analyst > member > viewer)
3. **Privacy Compliance**: Respect per-contact privacy rules and anonymization
4. **Performance**: Implement caching, pagination, and optimized queries
5. **Audit Logging**: Track sensitive operations for compliance
6. **Error Handling**: Comprehensive error responses with appropriate HTTP codes

## Implementation Plan

### Phase 1: Core Infrastructure (Priority: High)

#### 1.1 Authentication Middleware & Utilities
- **File**: `apps/web/src/lib/api/auth.ts`
- **Purpose**: Common authentication and authorization utilities
- **Features**:
  - JWT token validation
  - User session extraction
  - RBAC permission checking
  - Request user context
  - Rate limiting helpers

#### 1.2 API Response Utilities
- **File**: `apps/web/src/lib/api/responses.ts`
- **Purpose**: Standardized API response formats
- **Features**:
  - Success/error response builders
  - HTTP status code constants
  - Pagination response formatting
  - Error message sanitization

#### 1.3 Request Validation
- **File**: `apps/web/src/lib/api/validation.ts`
- **Purpose**: Request validation schemas and utilities
- **Features**:
  - Zod schemas for request validation
  - Query parameter parsing
  - File upload validation
  - Input sanitization

### Phase 2: Authentication Endpoints (Priority: High)

#### 2.1 User Info Endpoint
- **File**: `apps/web/src/app/api/auth/user/route.ts`
- **Methods**: GET
- **Purpose**: Get current authenticated user information
- **Features**:
  - User profile data
  - Organization roles
  - Permissions summary
  - Session validity

#### 2.2 Session Management
- **File**: `apps/web/src/app/api/auth/session/route.ts`
- **Methods**: GET, POST, DELETE
- **Purpose**: Manage user sessions
- **Features**:
  - Session validation (GET)
  - Session refresh (POST)
  - Session logout (DELETE)

### Phase 3: Dashboard Endpoints (Priority: High)

#### 3.1 User Dashboard Metrics
- **File**: `apps/web/src/app/api/dashboard/metrics/route.ts`
- **Methods**: GET
- **Purpose**: Personal dashboard metrics
- **Features**:
  - Total calls/SMS counts
  - Unique contacts
  - Average call duration
  - Recent activity
  - Time range filtering

#### 3.2 Team Dashboard Metrics
- **File**: `apps/web/src/app/api/dashboard/team/route.ts`
- **Methods**: GET
- **Purpose**: Team-wide dashboard metrics
- **Features**:
  - Aggregated team statistics
  - Team member activity
  - Cross-team contact visibility
  - RBAC-filtered data

#### 3.3 Communication Trends
- **File**: `apps/web/src/app/api/dashboard/trends/route.ts`
- **Methods**: GET
- **Purpose**: Time-series trend analysis
- **Features**:
  - Daily/weekly/monthly trends
  - Call vs SMS patterns
  - Contact engagement trends
  - Configurable time ranges

### Phase 4: Events Endpoints (Priority: High)

#### 4.1 Events CRUD Operations
- **File**: `apps/web/src/app/api/events/route.ts`
- **Methods**: GET, POST
- **Purpose**: List and create events
- **Features**:
  - Filtered event listing with pagination
  - Search by contact, date range, type
  - Privacy-aware results
  - Bulk event creation
  - CSV/JSON export

#### 4.2 File Upload Processing
- **File**: `apps/web/src/app/api/events/upload/route.ts`
- **Methods**: POST
- **Purpose**: Handle file uploads for event ingestion
- **Features**:
  - Multi-format support (CSV, PDF, XLSX)
  - Background processing queue
  - Progress tracking
  - Error handling and validation
  - Duplicate detection

### Phase 5: Contacts Endpoints (Priority: Medium)

#### 5.1 Contacts CRUD Operations
- **File**: `apps/web/src/app/api/contacts/route.ts`
- **Methods**: GET, POST
- **Purpose**: List and create contacts
- **Features**:
  - Paginated contact listing
  - Search and filtering
  - Privacy-aware visibility
  - Contact creation/import
  - Statistics aggregation

#### 5.2 Individual Contact Operations
- **File**: `apps/web/src/app/api/contacts/[id]/route.ts`
- **Methods**: GET, PUT, DELETE
- **Purpose**: Individual contact management
- **Features**:
  - Contact details retrieval
  - Contact updates (name, company, tags)
  - Contact deletion (with audit logging)
  - Privacy rule application

#### 5.3 Contact Intelligence
- **File**: `apps/web/src/app/api/contacts/[id]/intelligence/route.ts`
- **Methods**: GET
- **Purpose**: AI-powered contact insights
- **Features**:
  - Communication patterns
  - Engagement scoring
  - Anomaly detection
  - Relationship strength
  - Activity predictions

### Phase 6: Privacy Endpoints (Priority: Medium)

#### 6.1 Privacy Rules Management
- **File**: `apps/web/src/app/api/privacy/rules/route.ts`
- **Methods**: GET, POST, PUT, DELETE
- **Purpose**: Manage per-contact privacy rules
- **Features**:
  - Privacy rule CRUD operations
  - Bulk rule application
  - Visibility level management
  - Anonymization controls

#### 6.2 Bulk Anonymization
- **File**: `apps/web/src/app/api/privacy/bulk-anonymize/route.ts`
- **Methods**: POST
- **Purpose**: Bulk anonymization operations
- **Features**:
  - Contact-based anonymization
  - Date range anonymization
  - Preview before execution
  - Audit trail maintenance

### Phase 7: Sync Endpoints (Priority: Low)

#### 7.1 Sync Health Status
- **File**: `apps/web/src/app/api/sync/health/route.ts`
- **Methods**: GET
- **Purpose**: Monitor data synchronization health
- **Features**:
  - Sync status by source
  - Queue depth monitoring
  - Error tracking
  - Performance metrics

#### 7.2 Data Gap Detection
- **File**: `apps/web/src/app/api/sync/gaps/route.ts`
- **Methods**: GET
- **Purpose**: Detect potential data gaps
- **Features**:
  - Time gap analysis
  - Missing data identification
  - Confidence scoring
  - Gap filling suggestions

## Security Implementation Details

### Authentication Flow
1. Extract JWT token from Authorization header or cookies
2. Validate token with Supabase Auth
3. Retrieve user session and organization context
4. Apply RBAC checks based on endpoint requirements

### RBAC Permission Matrix
- **Owner**: Full access to all organization data
- **Admin**: Manage team data, create/delete contacts, configure privacy
- **Analyst**: View team data, create reports, limited contact management
- **Member**: View own data, limited team visibility
- **Viewer**: Read-only access to assigned data

### Privacy Rule Enforcement
- Apply per-contact visibility rules (private/team/public)
- Anonymize phone numbers and content based on rules
- Respect org boundaries for data access
- Audit sensitive data access

### Rate Limiting Strategy
- User-based rate limiting (100 req/min for standard users)
- Endpoint-specific limits (upload: 5/min, search: 50/min)
- IP-based fallback limits
- Premium tier adjustments

## Performance Optimization

### Caching Strategy
- Redis caching for dashboard metrics (5-minute TTL)
- Query result caching for complex aggregations
- Session caching to reduce auth overhead
- Static data caching (contacts, rules)

### Database Query Optimization
- Use database functions for complex aggregations
- Implement proper indexing for time-series queries
- Leverage RLS policies for automatic filtering
- Batch operations for bulk updates

### Pagination Implementation
- Cursor-based pagination for large datasets
- Configurable page sizes (default: 50, max: 500)
- Total count caching for UI indicators
- Efficient offset handling

## Error Handling Standards

### HTTP Status Codes
- 200: Success
- 201: Created
- 400: Bad Request (validation errors)
- 401: Unauthorized (authentication required)
- 403: Forbidden (insufficient permissions)
- 404: Not Found
- 429: Too Many Requests (rate limited)
- 500: Internal Server Error

### Error Response Format
```typescript
{
  error: string;           // Error code
  message: string;         // Human-readable message
  details?: any;          // Additional error context
  timestamp: string;      // ISO timestamp
  requestId: string;      // Unique request identifier
}
```

### Logging Strategy
- Structured logging with request context
- Error tracking with stack traces
- Performance metrics collection
- Audit logging for sensitive operations

## Testing Strategy

### Unit Tests
- Request validation logic
- Authentication utilities
- Response formatting
- Error handling

### Integration Tests
- End-to-end API flows
- Database interaction
- Authentication flows
- RBAC enforcement

### Performance Tests
- Load testing for high-traffic endpoints
- Database query performance
- Caching effectiveness
- Rate limiting behavior

## Implementation Order

1. **Phase 1**: Core infrastructure and utilities
2. **Phase 2**: Authentication endpoints
3. **Phase 3**: Dashboard endpoints (for immediate user value)
4. **Phase 4**: Events endpoints (core data operations)
5. **Phase 5**: Contacts endpoints
6. **Phase 6**: Privacy endpoints
7. **Phase 7**: Sync endpoints

## Success Criteria

### Performance Targets
- Dashboard endpoints: p95 < 2s response time
- Search endpoints: p95 < 1s response time
- Upload endpoints: Support 100MB files
- Concurrent users: Support 1000+ users

### Security Requirements
- All endpoints require authentication
- RBAC properly enforced
- Privacy rules respected
- Audit logging complete
- No data leakage between organizations

### Quality Standards
- 100% TypeScript coverage
- Comprehensive error handling
- Proper HTTP status codes
- Consistent API patterns
- Documentation complete

## Next Steps

1. **Review this plan** with the user for approval
2. **Implement Phase 1** (core infrastructure)
3. **Implement Phase 2** (authentication endpoints)
4. **Continue with remaining phases** in priority order
5. **Test and validate** each phase before proceeding
6. **Document API endpoints** for frontend integration

This implementation will provide a solid foundation for the Call/SMS Intelligence Platform's web API layer, ensuring security, performance, and scalability while maintaining compliance with privacy requirements.
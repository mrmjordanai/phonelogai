# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Plan & Review

### Before starting work
- Ultrathink and review (.claude/tasks/implementaion.md)
- Write a plan to .claude/tasks/TASK_NAME.md.
- The plan should be a detailed implementation plan and the reasoning behind them, as well as tasks broken down.
- Don't over plan it, always think MVP.
- Once you write the plan, firstly ask me to review it. Do not continue until I approve the plan.

### While implementing
- You should update the plan as you work.
- After you complete tasks in the plan, you should update and append detailed descriptions of the changes you made, so following tasks can be easily handed over to other engineers.

### Task Checklist Management
- **TASKCHECKLIST.md** tracks main tasks only - detailed sub-tasks remain in individual `.claude/tasks/*.md` files
- When starting work on a main task, update TASKCHECKLIST.md status from `[ ]` to `[~]` (in progress)
- When completing a main task, update TASKCHECKLIST.md status from `[~]` to `[X]` (completed)
- A task is only considered complete when:
  - All functionality is implemented and tested
  - Code passes linting (`npm run lint`)
  - Code passes type checking (`npm run type-check`)
  - Manual testing confirms the feature works as expected
- Always update the "Last Updated" timestamp in TASKCHECKLIST.md when making status changes
- The checklist serves as a single source of truth for overall project progress

## Development Commands

### Monorepo Management (Turbo)
```bash
# Start all development servers
npm run dev

# Start specific applications
npm run web                    # Next.js web app on port 3000
npm run mobile                 # Expo mobile app

# Build all applications
npm run build

# Linting and type checking
npm run lint                   # ESLint across all packages
npm run type-check            # TypeScript checking across all packages

# Testing
npm run test                  # Run all tests

# Clean build artifacts
npm run clean                 # Clean all build outputs and node_modules
```

### Database Operations
```bash
# Database migrations (from packages/database)
cd packages/database
npm run migrate               # Apply pending migrations
npm run seed                  # Seed with sample data
npm run reset                 # Reset database (development only)
npm run setup                 # Initial database setup
```

### Testing
```bash
# Run all tests across the monorepo
npm run test

# Run tests for specific packages
cd packages/types && npm test          # Type tests
cd apps/mobile/src/services && npm test   # Mobile service tests (Jest)

# Run individual test files
npx jest ConflictResolver.test.ts      # Run specific test file
npx jest --watch                       # Run tests in watch mode
```

### Individual Package Development
```bash
# Web application (apps/web)
cd apps/web
npm run dev                   # Development server
npm run build                 # Production build
npm run start                 # Start production server
npm run lint                  # ESLint for web app
npm run type-check           # TypeScript checking

# Mobile application (apps/mobile)
cd apps/mobile
npm run start                 # Start Expo development server
npm run android              # Run on Android device/emulator
npm run ios                  # Run on iOS device/simulator
npm run web                  # Run Expo web version
```

## Monorepo Architecture

### Workspace Structure
- **apps/web**: Next.js web application with App Router
- **apps/mobile**: React Native/Expo mobile application
- **packages/shared**: Shared components, utilities, and i18n
- **packages/types**: TypeScript type definitions
- **packages/database**: Supabase client, migrations, and database utilities

### Package Dependencies
- All packages depend on `@phonelogai/types` for shared TypeScript definitions
- Web and mobile apps depend on `@phonelogai/shared` for common utilities
- Database operations use `@phonelogai/database` package
- Turbo manages build dependencies and caching across packages

### Key Architectural Patterns

#### Database Layer (`packages/database`)
- **Two Supabase clients**: `supabase` (RLS-enabled) and `supabaseAdmin` (bypasses RLS)
- **Migration system**: SQL files in `migrations/` directory applied sequentially
- **RLS policies**: Comprehensive Row-Level Security for all tables
- **Database functions**: PostgreSQL functions for complex queries (dashboard metrics, gap detection)
- **Type generation**: Database types auto-generated in `src/types.ts`

#### Authentication Flow
- **Supabase Auth**: Unified authentication across web and mobile
- **Session management**: Web uses cookies, mobile uses AsyncStorage
- **Auth providers**: Both applications use identical AuthProvider pattern
- **Role-based access**: 5-tier RBAC system (owner > admin > analyst > member > viewer)

#### Privacy Architecture
- **Per-contact privacy rules**: Granular visibility controls (private/team/public)
- **Anonymization functions**: Phone number masking at database level
- **Audit logging**: Automatic tracking of sensitive operations
- **RLS enforcement**: Database-level security policies prevent unauthorized access

#### Mobile-Specific Patterns
- **Platform detection**: iOS manual import vs Android on-device collection
- **Offline queue**: AsyncStorage-based queue for sync operations
- **Conflict resolution**: Composite key deduplication with quality scoring and automatic resolution
- **Sync health monitoring**: Real-time tracking of data collection and resolution metrics
- **Permissions**: Android-specific permissions for call/SMS log access

#### Conflict Resolution System
- **ConflictResolver**: Main service with database integration and batch processing
- **DuplicateDetector**: Advanced fuzzy matching with phone number normalization and content similarity
- **ConflictQueue**: Memory-efficient priority queue with AsyncStorage persistence
- **Quality Scoring**: Source reliability weighting (carrier 0.9 > device 0.7 > manual 0.5)
- **Auto-Resolution**: 85%+ automatic conflict resolution based on similarity and quality scores
- **Composite Key Matching**: `(line_id, ts±1s, number, direction, duration)` for duplicate detection

#### Component Architecture
- **Shared components**: Common UI components in `packages/shared`
- **Platform-specific implementations**: Web uses Tailwind + Headless UI, Mobile uses React Native components
- **i18n integration**: React-i18next setup for internationalization
- **Loading states**: Consistent loading patterns across both platforms

## Database Schema Understanding

### Core Tables Hierarchy
1. **events**: Primary data table for calls/SMS with foreign key to contacts
2. **contacts**: Normalized contact information with aggregated statistics
3. **privacy_rules**: Controls visibility and anonymization per contact
4. **sync_health**: Monitors data source synchronization status
5. **conflict_resolutions**: Tracks duplicate event resolution with quality metrics

### Key Database Functions
- `get_dashboard_metrics(user_id)`: Returns aggregated user statistics
- `get_filtered_events(requesting_user_id, target_user_id, limit, offset)`: Returns events respecting privacy rules
- `detect_data_gaps(user_id, threshold_hours)`: Identifies potential missing data periods
- `can_access_contact(contact_id)`: Checks privacy permissions for contact access
- `detect_event_conflicts(user_id, batch_size, time_tolerance_seconds)`: Finds duplicate events using composite key matching
- `resolve_event_conflict(original_id, duplicate_id, strategy, conflict_type, similarity)`: Resolves conflicts with audit trail
- `get_conflict_metrics(user_id)`: Returns conflict resolution statistics and data quality scores

### RLS Policy Pattern
All tables follow consistent RLS patterns:
- Users can always access their own data
- Team members can access data based on privacy rules and org roles
- Admins have broader access within organization boundaries
- System functions can bypass RLS using `supabaseAdmin` client

## Environment Configuration

### Required Environment Variables
```bash
# Supabase (required for both web and mobile)
NEXT_PUBLIC_SUPABASE_URL=          # Public Supabase URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=     # Public anon key
SUPABASE_SERVICE_ROLE_KEY=         # Service role key (server-side only)

# Optional integrations
OPENROUTER_API_KEY=                # For NLQ features via OpenRouter
OPENROUTER_MODEL=openai/gpt-4o-mini # Optional model selection
STRIPE_SECRET_KEY=                 # For billing features
REDIS_URL=                         # For caching/queuing
```

### Performance Considerations
- **Target metrics** defined in `packages/shared/src/constants.ts`
- **File upload limits**: 100MB max size, 1M rows max
- **Database indexing**: Optimized for time-series queries on events table
- **Caching strategy**: Redis for query results and session data
- **Conflict resolution**: <50MB memory usage, <5 seconds per 1000 events
- **Mobile sync**: Battery-efficient background processing with configurable thresholds

### Key Service Patterns
- **Singleton services**: ConflictResolver, SyncHealthMonitor use getInstance() pattern
- **AsyncStorage persistence**: All mobile services persist state for offline resilience
- **Event-driven architecture**: Services emit events for cross-component communication
- **Batch processing**: Memory-efficient handling of large datasets with configurable batch sizes
- **Quality metrics**: All data processing includes quality scoring and validation
- **Error boundary pattern**: Graceful degradation with comprehensive error handling and retry logic

## Specialized Sub-Agents

This codebase has specialized sub-agents available through the Task tool. **Always use these sub-agents for domain-specific work** to ensure expert-level implementation and adherence to architectural patterns.

### When to Use Sub-Agents

Use the **Task tool** to delegate work to these specialized agents:

#### **data-ingestion-ai-agent**
**Use for:** File parsing, ML models, Python workers, ETL pipelines, NLQ processing
- AI-powered file parsers for carrier CDR/PDF/CSV files
- ETL pipelines for data normalization and validation
- Python workers for background data processing
- Natural language query (NLQ) processing with SQL generation
- Machine learning models for layout classification
- Performance targets: 100k rows in <5min, NLQ p95 <5s

#### **database-backend-agent**
**Use for:** SQL, schemas, APIs, Supabase, RLS policies, backend performance
- Database schema design and optimization
- Row-Level Security (RLS) policy implementation
- pgvector configuration for embeddings
- API endpoint design with authentication
- Query performance optimization for large datasets
- Multi-tenant data isolation strategies

#### **frontend-dashboard-agent**
**Use for:** Next.js/React components, dashboards, visualizations, UI/UX, i18n
- Interactive dashboards (Time Explorer, Heat-Map, Contact Intelligence)
- Natural language query chat interface
- Data visualization with large dataset performance
- Shared component library development
- Internationalization (i18n) implementation
- Responsive design and accessibility (WCAG 2.1 AA)

#### **mobile-development-agent**
**Use for:** React Native/Expo work, device permissions, offline sync, Android/iOS native features
- Cross-platform mobile app development
- Android call/SMS log collection with permissions
- iOS manual file import workflows
- Offline-first architecture with AsyncStorage
- Platform-specific implementations and optimizations
- Conflict resolution system with quality scoring and automatic duplicate handling
- Sync health monitoring with real-time metrics and issue detection

#### **security-privacy-agent**
**Use for:** Authentication, RBAC, encryption, privacy controls, compliance, audit logging
- Authentication and authorization systems
- Role-based access control (RBAC) implementation
- Per-contact privacy controls and anonymization
- Field-level encryption for sensitive data
- Comprehensive audit logging
- GDPR/CCPA compliance features

### Sub-Agent Usage Examples

```bash
# Use the Task tool to delegate to sub-agents
Task(
  description="Create file upload system",
  prompt="Implement an AI-powered file parser for carrier CDR files with layout classification...",
  subagent_type="data-ingestion-ai-agent"
)

Task(
  description="Implement RLS policies",
  prompt="Create comprehensive Row-Level Security policies for the events table...",
  subagent_type="database-backend-agent"
)

Task(
  description="Build dashboard component",
  prompt="Create an interactive Time Explorer dashboard with date range picker...",
  subagent_type="frontend-dashboard-agent"
)
```

**Important:** Always specify the appropriate `subagent_type` when using the Task tool for specialized work. This ensures expert-level implementation and consistency with architectural patterns.

## Important Instructions

Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files unless explicitly requested.
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Plan & Review

### Before starting work
- Review existing task files in `.claude/tasks/` directory
- Write a plan to `.claude/tasks/TASK_NAME.md`
- The plan should be a detailed implementation plan with reasoning and broken down tasks
- Don't over plan it, always think MVP
- Once you write the plan, ask for review before proceeding

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

### Mobile Development
```bash
# Start mobile development server
npm run dev                    # Starts Expo mobile app (primary command)
npm run mobile                 # Alternative mobile start command

# Platform-specific development  
cd apps/mobile
npx expo start                 # Direct Expo start (recommended for development)
npx expo start --android      # Launch on Android device/emulator
npx expo start --ios          # Launch on iOS device/simulator

# Build and deployment
npm run build                  # Build mobile app (placeholder - use Expo EAS for production)

# Code quality
npm run lint                   # ESLint for mobile app
npm run type-check            # TypeScript checking for mobile app

# Testing
npm run test                  # Run mobile app tests
cd apps/mobile/src/services && npx jest --watch   # Watch mode for service tests

# Utilities
npm run clean                 # Clean all node_modules
```

### Database Operations
```bash
# Database setup and management (from packages/database)
cd packages/database
npm run setup                 # Initial database setup
npm run migrate               # Apply pending migrations
npm run seed                  # Seed with sample data
npm run reset                 # Reset database (development only)
```

### Mobile Testing Specific
```bash
# Run specific test suites
cd apps/mobile
npx jest ConflictResolver.test.ts      # Test conflict resolution system
npx jest OfflineQueueSystem.test.ts    # Test offline queue functionality
npx jest ConflictQueue.test.ts         # Test conflict queue

# Test with coverage
npx jest --coverage             # Generate test coverage report
```

## Mobile-Only Architecture

### Workspace Structure
- **apps/mobile**: React Native/Expo mobile application
- **packages/shared**: Mobile utilities, RBAC, and shared functions
- **packages/types**: TypeScript type definitions
- **packages/database**: Supabase client, migrations, and database utilities

### Package Dependencies
- Mobile app depends on `@phonelogai/types` for shared TypeScript definitions
- Mobile app depends on `@phonelogai/shared` for mobile utilities and RBAC
- Database operations use `@phonelogai/database` package
- Simplified monorepo focused on mobile development

### Key Architectural Patterns

#### Database Layer (`packages/database`)
- **Two Supabase clients**: `supabase` (RLS-enabled) and `supabaseAdmin` (bypasses RLS)
- **Migration system**: SQL files in `migrations/` directory applied sequentially
- **RLS policies**: Comprehensive Row-Level Security for all tables
- **Database functions**: PostgreSQL functions for complex queries (dashboard metrics, gap detection)
- **Type generation**: Database types auto-generated in `src/types.ts`

#### Authentication Flow
- **Supabase Auth**: Mobile authentication with AsyncStorage session management
- **Auth providers**: Mobile AuthProvider pattern with React Native integration
- **Role-based access**: 5-tier RBAC system (owner > admin > analyst > member > viewer)
- **Mobile security**: Secure token storage and biometric authentication support

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
- **Mobile components**: React Native UI components optimized for mobile
- **Shared utilities**: Common business logic and RBAC in `packages/shared`
- **i18n integration**: React-i18next setup for mobile internationalization
- **Loading states**: Consistent mobile loading patterns and animations
- **Navigation**: React Navigation for mobile screen management

#### Mobile Service Layer Architecture (`apps/mobile/src/services/`)
The mobile app has a sophisticated service layer for offline-first functionality:

- **ConflictResolver**: Automated duplicate detection and resolution with 85%+ success rate
- **OfflineQueue**: AsyncStorage-based queue with priority processing and retry logic
- **SyncEngine**: Network-aware synchronization with conflict resolution
- **SyncHealthMonitor**: Real-time monitoring of sync status and data quality
- **DuplicateDetector**: Advanced fuzzy matching using composite keys
- **ConflictQueue**: Memory-efficient priority queue with persistence
- **DataCollectionService**: Batch processing for mobile data collection
- **Android collectors**: Native call/SMS log collection services
- **CryptoService**: AES-GCM encryption for sensitive data

**Key Patterns:**
- All services use **singleton pattern** with `getInstance()`
- **AsyncStorage persistence** for offline resilience
- **Event-driven architecture** with service communication
- **Quality scoring** system for data reliability assessment
- **Background processing** support with Expo TaskManager

#### Screen Architecture Pattern (`apps/mobile/src/screens/EventsScreen/`)
The Events Screen demonstrates the mobile app's architectural patterns:

**Component Structure:**
- **Main Screen Component** (`EventsScreen.tsx`) - Screen coordinator
- **Enhanced Screen** (`EnhancedEventsScreen.tsx`) - Production-ready version with full features
- **Sub-components** (`components/`) - Reusable UI components
- **Custom Hooks** (`hooks/`) - Business logic abstraction
- **Types** (`types.ts`) - Screen-specific TypeScript definitions

**Key Features:**
- **Infinite scroll** with FlatList virtualization for performance
- **Advanced filtering** with real-time search and date ranges
- **Pull-to-refresh** with loading states
- **Offline support** with cached data and sync indicators
- **Accessibility** compliance with VoiceOver/TalkBack
- **Error boundaries** with retry mechanisms
- **Performance monitoring** with metrics tracking

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
# Mobile app environment (.env in apps/mobile/)
EXPO_PUBLIC_SUPABASE_URL=          # Public Supabase URL for mobile
EXPO_PUBLIC_SUPABASE_ANON_KEY=     # Public anon key for mobile
EXPO_PUBLIC_API_URL=               # API base URL
EXPO_PUBLIC_ENVIRONMENT=           # development | staging | production

# Root environment (.env for backend services)
SUPABASE_SERVICE_ROLE_KEY=         # Service role key (server-side only)
OPENROUTER_API_KEY=                # For NLQ features via OpenRouter
OPENROUTER_MODEL=openai/gpt-4o-mini # Optional model selection
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
**Use for:** Mobile dashboard components, visualizations, UI/UX, i18n (Note: Web removed from project)
- Mobile dashboard components and data visualization
- React Native UI component development
- Shared mobile component library
- Mobile internationalization (i18n) implementation
- Mobile accessibility (VoiceOver/TalkBack) compliance

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
  description="Implement mobile Events Screen",
  prompt="Create a comprehensive Events Screen with infinite scroll, filtering, and offline support...",
  subagent_type="mobile-development-agent"
)

Task(
  description="Implement RLS policies",
  prompt="Create comprehensive Row-Level Security policies for the events table...",
  subagent_type="database-backend-agent"
)

Task(
  description="Build mobile dashboard",
  prompt="Create mobile dashboard components with React Native optimizations...",
  subagent_type="frontend-dashboard-agent"
)
```

**Important:** Always specify the appropriate `subagent_type` when using the Task tool for specialized work. This ensures expert-level implementation and consistency with architectural patterns.

## Current Development Status

### ✅ Completed Components
- **Mobile Architecture**: Full React Native/Expo setup with AsyncStorage
- **Service Layer**: Complete offline-first service architecture
- **Events Screen**: Comprehensive implementation with 19+ TypeScript files
- **Conflict Resolution**: Advanced duplicate detection with 85%+ auto-resolution
- **Sync System**: Network-aware sync with health monitoring
- **Database Layer**: Supabase integration with RLS policies
- **RBAC System**: 5-tier role-based access control

### 🚧 In Development / Next Steps
- **Contacts Screen**: Priority 1B implementation needed
- **Chat/NLQ Screen**: Priority 1C for natural language queries  
- **Android Native**: Call/SMS log collection bridge
- **iOS File Import**: Manual file upload system
- **Additional mobile screens**: Settings, Dashboard, Profile

### 🏗️ Architecture Notes for Development
- Project simplified to **mobile-only** (web app removed)
- Use `npx expo start` for development server
- All services follow **singleton pattern** with persistence
- Screen components should follow the **Events Screen architecture pattern**
- New screens need: main component, hooks, sub-components, types

## Important Instructions

Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files unless explicitly requested.
# important-instruction-reminders
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.
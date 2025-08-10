# Fix Mobile Package Linting Errors

## Task Overview
Fix all 190 linting errors (149 errors, 41 warnings) in the mobile package to get `npm run lint` to pass with zero errors.

## Error Categories Analysis

### 1. Unused Variables (Most Common)
- **Total**: ~90+ instances
- **Pattern**: Variables defined but never used
- **Solution**: Either remove or prefix with underscore

### 2. Missing Type Definitions
- **'baseEvent' is not defined**: Multiple occurrences in test files
- **'NodeJS' is not defined**: Type import missing
- **'performance' is not defined**: Global type missing

### 3. TypeScript Violations
- **no-explicit-any warnings**: 41 instances
- **no-case-declarations**: Switch statement issues
- **no-unreachable**: Dead code

### 4. Import/Export Issues
- **Unused imports**: Remove unused type imports
- **Missing imports**: Add required type definitions

## Implementation Plan

### Phase 1: Test Files (High Priority)
**Target**: Fix critical test file issues first
- `/services/__tests__/ConflictResolver.test.ts` - baseEvent undefined errors
- `/services/__tests__/OfflineQueueSystem.test.ts` - unused imports
- `/services/__tests__/ConflictQueue.test.ts` - unused variables

### Phase 2: Core Service Files
**Target**: Main service implementations
- `/services/ConflictResolver.ts` - switch case declarations, unused params
- `/services/SyncService.ts` - NodeJS type, unused variables
- `/services/SyncHealthMonitor.ts` - performance global, unused variables
- `/services/ConflictQueue.ts` - unused variables

### Phase 3: Android Collectors
**Target**: Platform-specific implementations
- `/services/android/CallLogCollector.ts` - unused params
- `/services/android/SmsLogCollector.ts` - unreachable code, unused params

### Phase 4: Components & Screens
**Target**: UI layer fixes
- `/components/EnhancedAuthProvider.tsx` - unused RBAC params
- `/rbac/RBACProvider.tsx` - unused RBAC params
- `/screens/ConflictReviewScreen.tsx` - unused imports
- `/screens/AuthScreen.tsx` - explicit any

### Phase 5: Utility & Crypto Services
**Target**: Supporting services
- `/services/CryptoService.ts` - unused Platform import
- `/services/NetworkService.ts` - unused variables
- Other utility files

## Fix Strategies

### For Unused Variables
```typescript
// Before: error 'data' is defined but never used
const data = await fetchData();

// After: prefix with underscore
const _data = await fetchData();

// Or remove if truly unused
// (remove the line entirely)
```

### For Missing Types
```typescript
// Add proper imports
import type { Event } from '@phonelogai/types';

// Define baseEvent for tests
const baseEvent: Event = {
  id: 'test-id',
  // ... other required properties
};
```

### For Switch Case Declarations
```typescript
// Before: error in switch
case 'type1':
  const result = process();
  break;

// After: wrap in block
case 'type1': {
  const result = process();
  break;
}
```

### For Explicit Any
```typescript
// Before: warning Unexpected any
const data: any = response;

// After: proper typing
const data: ResponseType = response;
// or use unknown if type is truly unknown
const data: unknown = response;
```

## Success Criteria
- [ ] All 149 errors resolved
- [ ] All 41 warnings addressed (prioritize explicit-any)
- [ ] `npm run lint` passes with 0 errors
- [ ] No functionality broken by changes
- [ ] All tests still pass

## Estimated Effort
- **Phase 1**: 30 minutes (critical test fixes)
- **Phase 2**: 45 minutes (core services)
- **Phase 3**: 15 minutes (Android collectors)
- **Phase 4**: 30 minutes (components/screens)
- **Phase 5**: 15 minutes (utilities)
- **Testing**: 15 minutes (verify fixes)

**Total**: ~2.5 hours

## Implementation Notes
- Make minimal changes to preserve functionality
- Prefer underscore prefixing over removal for potentially needed variables
- Add proper type imports rather than using `any`
- Test after each phase to catch any breaking changes
- Focus on errors first, then warnings
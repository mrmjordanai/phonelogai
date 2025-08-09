/**
 * RBAC Manager Tests
 * Unit tests for the core RBAC permission checking engine
 */

import { describe, it, expect, beforeEach, afterEach, jest } from 'jest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { RBACManager } from '../RBACManager';
import { PermissionCache } from '../PermissionCache';
import type { PermissionCheckRequest, RBACUser } from '@phonelogai/shared/rbac';

// Mock Supabase client
const mockSupabase = {
  from: jest.fn(),
  rpc: jest.fn(),
} as unknown as SupabaseClient<any>;

// Mock cache
const mockCache = {
  get: jest.fn(),
  set: jest.fn(),
  has: jest.fn(),
  delete: jest.fn(),
  invalidateUser: jest.fn(),
  getStats: jest.fn(),
  close: jest.fn(),
} as unknown as PermissionCache;

describe('RBACManager', () => {
  let rbacManager: RBACManager;

  beforeEach(() => {
    rbacManager = new RBACManager(mockSupabase, mockCache);
    
    // Reset all mocks
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await rbacManager.close();
  });

  describe('Permission Checking', () => {
    const mockUser: RBACUser = {
      id: 'user-123',
      role: 'member',
      orgId: 'org-456',
      powerLevel: 2,
    };

    beforeEach(() => {
      // Mock user lookup
      (mockSupabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { role: 'member', org_id: 'org-456' },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      });
    });

    it('should allow permissions for valid role-resource-action combinations', async () => {
      // Mock cache miss
      (mockCache.get as jest.Mock).mockResolvedValue(null);

      const request: PermissionCheckRequest = {
        userId: 'user-123',
        resource: 'events',
        action: 'read',
      };

      const result = await rbacManager.checkPermission(request);

      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should deny permissions for invalid role-resource-action combinations', async () => {
      // Mock cache miss
      (mockCache.get as jest.Mock).mockResolvedValue(null);

      const request: PermissionCheckRequest = {
        userId: 'user-123',
        resource: 'billing',
        action: 'manage',
      };

      const result = await rbacManager.checkPermission(request);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it('should use cached results when available', async () => {
      const cachedResult = {
        result: {
          allowed: true,
          reason: 'Cached result',
          cacheable: true,
        },
        timestamp: Date.now() - 1000, // 1 second ago
        ttl: 300, // 5 minutes
      };

      (mockCache.get as jest.Mock).mockResolvedValue(cachedResult);

      const request: PermissionCheckRequest = {
        userId: 'user-123',
        resource: 'events',
        action: 'read',
      };

      const result = await rbacManager.checkPermission(request);

      expect(result).toEqual(cachedResult.result);
      expect(mockSupabase.from).not.toHaveBeenCalled(); // Should not query database
    });

    it('should handle expired cache entries', async () => {
      const expiredCachedResult = {
        result: {
          allowed: true,
          reason: 'Expired cached result',
          cacheable: true,
        },
        timestamp: Date.now() - 400000, // 400 seconds ago (expired)
        ttl: 300, // 5 minutes
      };

      (mockCache.get as jest.Mock).mockResolvedValue(expiredCachedResult);

      const request: PermissionCheckRequest = {
        userId: 'user-123',
        resource: 'events',
        action: 'read',
      };

      const result = await rbacManager.checkPermission(request);

      // Should get fresh result, not expired cache
      expect(result.allowed).toBe(true);
      expect(result.reason).not.toBe('Expired cached result');
    });

    it('should handle user not found scenario', async () => {
      // Mock user not found
      (mockSupabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: null,
                  error: new Error('User not found'),
                }),
              }),
            }),
          }),
        }),
      });

      const request: PermissionCheckRequest = {
        userId: 'nonexistent-user',
        resource: 'events',
        action: 'read',
      };

      const result = await rbacManager.checkPermission(request);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('User not found');
      expect(result.cacheable).toBe(false);
    });

    it('should check multiple permissions efficiently', async () => {
      (mockCache.get as jest.Mock).mockResolvedValue(null);

      const requests: PermissionCheckRequest[] = [
        { userId: 'user-123', resource: 'events', action: 'read' },
        { userId: 'user-123', resource: 'contacts', action: 'read' },
        { userId: 'user-123', resource: 'billing', action: 'manage' },
      ];

      const results = await rbacManager.checkPermissions(requests);

      expect(results).toHaveLength(3);
      expect(results[0].allowed).toBe(true);  // events:read for member
      expect(results[1].allowed).toBe(true);  // contacts:read for member
      expect(results[2].allowed).toBe(false); // billing:manage for member
    });
  });

  describe('User Management', () => {
    beforeEach(() => {
      // Mock user lookups for role comparisons
      (mockSupabase.from as jest.Mock).mockImplementation((table) => ({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                single: jest.fn().mockImplementation(({ eq }) => {
                  // Mock different users with different roles
                  if (table === 'org_roles') {
                    return Promise.resolve({
                      data: { role: 'admin', org_id: 'org-456' },
                      error: null,
                    });
                  }
                  return Promise.resolve({ data: null, error: null });
                }),
              }),
            }),
          }),
        }),
      }));
    });

    it('should correctly determine if a user can manage another user', async () => {
      // Admin (level 4) should be able to manage member (level 2)
      const canManage = await rbacManager.canManageUser('admin-user', 'member-user');
      expect(canManage).toBe(true);
    });

    it('should get user permissions based on role', async () => {
      const permissions = await rbacManager.getUserPermissions('user-123');
      expect(Array.isArray(permissions)).toBe(true);
    });
  });

  describe('Cache Management', () => {
    it('should invalidate user cache correctly', async () => {
      await rbacManager.invalidateUserCache('user-123');
      expect(mockCache.invalidateUser).toHaveBeenCalledWith('user-123');
    });

    it('should return cache statistics', async () => {
      const mockStats = {
        hitRatio: 0.85,
        size: 150,
        maxSize: 1000,
      };

      (mockCache.getStats as jest.Mock).mockResolvedValue(mockStats);

      const stats = await rbacManager.getCacheStats();
      expect(stats).toEqual(mockStats);
    });

    it('should warm up cache with common permissions', async () => {
      (mockCache.get as jest.Mock).mockResolvedValue(null);

      await rbacManager.warmupCache(['user-1', 'user-2']);

      // Should have made multiple permission checks
      expect(mockSupabase.from).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Mock database error
      (mockSupabase.from as jest.Mock).mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      const request: PermissionCheckRequest = {
        userId: 'user-123',
        resource: 'events',
        action: 'read',
      };

      const result = await rbacManager.checkPermission(request);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Database error');
      expect(result.cacheable).toBe(false);
    });

    it('should handle cache errors gracefully', async () => {
      // Mock cache error
      (mockCache.get as jest.Mock).mockRejectedValue(new Error('Cache error'));

      const request: PermissionCheckRequest = {
        userId: 'user-123',
        resource: 'events',
        action: 'read',
      };

      // Should still work without cache
      const result = await rbacManager.checkPermission(request);
      expect(result).toBeDefined();
    });
  });

  describe('Performance', () => {
    it('should complete permission checks within performance target', async () => {
      (mockCache.get as jest.Mock).mockResolvedValue(null);

      const startTime = Date.now();

      const request: PermissionCheckRequest = {
        userId: 'user-123',
        resource: 'events',
        action: 'read',
      };

      await rbacManager.checkPermission(request);

      const duration = Date.now() - startTime;
      
      // Should complete within 5ms (performance target)
      expect(duration).toBeLessThan(5);
    });

    it('should handle concurrent permission checks efficiently', async () => {
      (mockCache.get as jest.Mock).mockResolvedValue(null);

      const requests = Array.from({ length: 10 }, (_, i) => ({
        userId: `user-${i}`,
        resource: 'events' as const,
        action: 'read' as const,
      }));

      const startTime = Date.now();
      
      await Promise.all(requests.map(req => rbacManager.checkPermission(req)));
      
      const duration = Date.now() - startTime;
      
      // Concurrent requests should complete reasonably quickly
      expect(duration).toBeLessThan(100);
    });
  });

  describe('Resource-Specific Checks', () => {
    beforeEach(() => {
      // Mock resource-specific database queries
      (mockSupabase.from as jest.Mock).mockImplementation((table) => {
        if (table === 'events' || table === 'contacts') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { id: 'resource-123', user_id: 'user-123' },
                  error: null,
                }),
              }),
            }),
          };
        }
        
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                limit: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({
                    data: { role: 'member', org_id: 'org-456' },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      });

      // Mock RPC calls
      (mockSupabase.rpc as jest.Mock).mockImplementation((funcName) => {
        if (funcName === 'same_organization') {
          return Promise.resolve({ data: true, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      });
    });

    it('should check resource ownership for specific resources', async () => {
      const request: PermissionCheckRequest = {
        userId: 'user-123',
        resource: 'events',
        action: 'write',
        resourceId: 'resource-123',
      };

      const result = await rbacManager.checkPermission(request);

      expect(result.allowed).toBe(true); // User owns the resource
    });

    it('should deny access to resources owned by other users in different orgs', async () => {
      // Mock different organization
      (mockSupabase.rpc as jest.Mock).mockImplementation((funcName) => {
        if (funcName === 'same_organization') {
          return Promise.resolve({ data: false, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      });

      const request: PermissionCheckRequest = {
        userId: 'user-123',
        resource: 'events',
        action: 'write',
        resourceId: 'other-user-resource',
      };

      const result = await rbacManager.checkPermission(request);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('not in same organization');
    });
  });
});
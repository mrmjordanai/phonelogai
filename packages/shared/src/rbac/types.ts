/**
 * RBAC Types and Interfaces
 * Comprehensive type definitions for Role-Based Access Control
 */

// Import and re-export UserRole from types package
import type { UserRole } from '@phonelogai/types';
export type { UserRole };

// Resource types that can be protected by RBAC
export type RBACResource = 
  | 'events'
  | 'contacts'
  | 'privacy_rules'
  | 'organizations'
  | 'users'
  | 'dashboards'
  | 'integrations'
  | 'billing'
  | 'audit'
  | 'uploads'
  | 'nlq_queries'
  | 'sync_health'
  | 'webhooks'
  | 'incidents'
  | 'tickets';

// Actions that can be performed on resources
export type RBACAction = 
  | 'read'
  | 'write' 
  | 'delete'
  | 'manage'
  | 'export'
  | 'bulk';

// Permission object combining resource and action
export interface Permission {
  resource: RBACResource;
  action: RBACAction;
  conditions?: PermissionCondition[];
}

// Conditions that can modify permissions
export interface PermissionCondition {
  field: string;
  operator: 'eq' | 'in' | 'gt' | 'lt' | 'contains' | 'owned_by' | 'same_org';
  value: any;
}

// User with role context
export interface RBACUser {
  id: string;
  email?: string;
  role: UserRole;
  orgId: string;
  powerLevel: number;
  permissions?: Permission[];
}

// Organization context for RBAC
export interface RBACOrganization {
  id: string;
  name?: string;
  members: RBACUser[];
}

// Permission check request
export interface PermissionCheckRequest {
  userId: string;
  resource: RBACResource;
  action: RBACAction;
  resourceId?: string;
  context?: Record<string, any>;
}

// Permission check result
export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
  conditions?: PermissionCondition[];
  cacheable: boolean;
  cacheKey?: string;
}

// Cache entry for permission results
export interface PermissionCacheEntry {
  result: PermissionCheckResult;
  timestamp: number;
  ttl: number;
}

// API key with role mapping
export interface APIKeyRole {
  keyId: string;
  role: UserRole;
  orgId: string;
  permissions: Permission[];
  expiresAt?: Date;
}

// Just-in-time access request
export interface JITAccessRequest {
  userId: string;
  resource: RBACResource;
  action: RBACAction;
  reason: string;
  duration: number; // minutes
  requestedAt: Date;
  approvedBy?: string;
  approvedAt?: Date;
  expiresAt?: Date;
}

// Audit event for RBAC operations
export interface RBACAuditEvent {
  id: string;
  userId: string;
  action: 'permission_check' | 'role_change' | 'policy_update' | 'access_denied';
  resource: RBACResource;
  resourceId?: string;
  result: 'allowed' | 'denied';
  reason?: string;
  metadata?: Record<string, any>;
  timestamp: Date;
}

// Role template for pre-configured permission sets
export interface RoleTemplate {
  role: UserRole;
  name: string;
  description: string;
  permissions: Permission[];
  isDefault: boolean;
}

// Delegation of authority
export interface RoleDelegation {
  id: string;
  delegatorId: string;
  delegateeId: string;
  role: UserRole;
  permissions: Permission[];
  expiresAt: Date;
  isActive: boolean;
  reason?: string;
}

// RBAC configuration
export interface RBACConfig {
  enableCache: boolean;
  cacheMaxAge: number; // seconds
  enableAudit: boolean;
  enableJITAccess: boolean;
  performanceTargets: {
    permissionCheckLatency: number; // ms
    cacheHitRatio: number; // 0-1
    maxCacheSize: number; // entries
  };
}

// Permission matrix entry
export interface PermissionMatrixEntry {
  role: UserRole;
  resource: RBACResource;
  actions: RBACAction[];
  conditions?: PermissionCondition[];
}

// Role comparison result
export interface RoleComparison {
  canElevate: boolean;
  canDelegate: boolean;
  canManage: boolean;
  powerDifference: number;
}
'use client';

/**
 * Enhanced AuthProvider with RBAC Integration
 * Combines authentication and role-based access control in a single provider
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@phonelogai/database';
import type { 
  UserRole, 
  RBACUser, 
  Permission,
  RBACResource,
  RBACAction 
} from '@phonelogai/shared/rbac';
import {
  ROLE_HIERARCHY,
  ROLE_DISPLAY,
  getRolePermissions,
  roleHasPermission,
  canManageRole,
} from '@phonelogai/shared/rbac';

interface EnhancedAuthContextType {
  // Core authentication
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  
  // RBAC integration
  rbacUser: RBACUser | null;
  role: UserRole | null;
  powerLevel: number;
  permissions: Permission[];
  
  // Permission methods
  hasPermission: (resource: RBACResource, action: RBACAction) => boolean;
  checkPermission: (resource: RBACResource, action: RBACAction, resourceId?: string) => Promise<boolean>;
  canManageUser: (targetRole: UserRole) => boolean;
  
  // Role utilities
  isOwner: boolean;
  isAdmin: boolean;
  isAnalyst: boolean;
  isMember: boolean;
  isViewer: boolean;
  getDisplayRole: () => { name: string; description: string } | null;
  
  // Organization context
  orgId: string | null;
  orgMembers: RBACUser[];
  
  // Refresh methods
  refreshPermissions: () => Promise<void>;
  refreshOrgMembers: () => Promise<void>;
}

const EnhancedAuthContext = createContext<EnhancedAuthContextType | undefined>(undefined);

export function useEnhancedAuth() {
  const context = useContext(EnhancedAuthContext);
  if (context === undefined) {
    throw new Error('useEnhancedAuth must be used within an EnhancedAuthProvider');
  }
  return context;
}

interface EnhancedAuthProviderProps {
  children: React.ReactNode;
}

export function EnhancedAuthProvider({ children }: EnhancedAuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  
  // RBAC state
  const [rbacUser, setRbacUser] = useState<RBACUser | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [orgMembers, setOrgMembers] = useState<RBACUser[]>([]);
  const [rbacLoading, setRbacLoading] = useState(false);

  // Fetch user's RBAC data
  const fetchRBACData = useCallback(async (authUser: User) => {
    setRbacLoading(true);
    
    try {
      const response = await fetch('/api/rbac/user-profile');
      
      if (!response.ok) {
        throw new Error('Failed to fetch RBAC data');
      }

      const data = await response.json();
      
      const rbacUserData: RBACUser = {
        id: authUser.id,
        email: authUser.email,
        role: data.role,
        orgId: data.orgId,
        powerLevel: ROLE_HIERARCHY[data.role as UserRole],
        permissions: data.permissions,
      };

      setRbacUser(rbacUserData);
      setPermissions(data.permissions || getRolePermissions(data.role));
      
      return rbacUserData;
    } catch (error) {
      console.error('Failed to fetch RBAC data:', error);
      // Fallback to basic user data with minimal role
      const fallbackUser: RBACUser = {
        id: authUser.id,
        email: authUser.email,
        role: 'viewer',
        orgId: '',
        powerLevel: 1,
      };
      
      setRbacUser(fallbackUser);
      setPermissions(getRolePermissions('viewer'));
      
      return fallbackUser;
    } finally {
      setRbacLoading(false);
    }
  }, []);

  // Fetch organization members
  const fetchOrgMembers = useCallback(async () => {
    if (!rbacUser) return;

    try {
      const response = await fetch('/api/rbac/org-members');
      
      if (response.ok) {
        const data = await response.json();
        setOrgMembers(data.members || []);
      }
    } catch (error) {
      console.error('Failed to fetch organization members:', error);
    }
  }, [rbacUser]);

  // Handle authentication state changes
  const handleAuthChange = useCallback(async (event: string, session: Session | null) => {
    setSession(session);
    setUser(session?.user ?? null);

    if (session?.user) {
      await fetchRBACData(session.user);
    } else {
      setRbacUser(null);
      setPermissions([]);
      setOrgMembers([]);
    }
    
    setLoading(false);
  }, [fetchRBACData]);

  // Initialize auth and RBAC
  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        // Get initial session
        const { data: { session } } = await supabase.auth.getSession();
        
        if (mounted) {
          await handleAuthChange('INITIAL_SESSION', session);
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
        if (mounted) {
          setLoading(false);
        }
      }
    };

    initAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(handleAuthChange);

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [handleAuthChange]);

  // Fetch org members when RBAC user is available
  useEffect(() => {
    if (rbacUser && rbacUser.role !== 'viewer') {
      fetchOrgMembers();
    }
  }, [rbacUser, fetchOrgMembers]);

  // Permission checking methods
  const hasPermission = useCallback((resource: RBACResource, action: RBACAction): boolean => {
    if (!rbacUser) return false;

    // Check basic role permission first
    const hasRolePermission = roleHasPermission(rbacUser.role, resource, action);
    if (!hasRolePermission) return false;

    // Check if user has specific permission in their permission list
    return permissions.some(perm => 
      perm.resource === resource && perm.action === action
    );
  }, [rbacUser, permissions]);

  const checkPermission = useCallback(async (
    resource: RBACResource,
    action: RBACAction,
    resourceId?: string
  ): Promise<boolean> => {
    if (!rbacUser) return false;

    try {
      const response = await fetch('/api/rbac/check-permission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resource,
          action,
          resourceId,
        }),
      });

      if (!response.ok) {
        return hasPermission(resource, action);
      }

      const result = await response.json();
      return result.allowed === true;
    } catch (error) {
      console.error('Permission check failed:', error);
      return hasPermission(resource, action);
    }
  }, [rbacUser, hasPermission]);

  const canManageUserRole = useCallback((targetRole: UserRole): boolean => {
    if (!rbacUser) return false;
    return canManageRole(rbacUser.role, targetRole);
  }, [rbacUser]);

  // Role utility functions
  const isOwner = rbacUser?.role === 'owner';
  const isAdmin = rbacUser?.role === 'admin' || isOwner;
  const isAnalyst = rbacUser?.role === 'analyst' || isAdmin;
  const isMember = rbacUser?.role === 'member' || isAnalyst;
  const isViewer = rbacUser?.role === 'viewer' || isMember;

  const getDisplayRole = useCallback(() => {
    if (!rbacUser) return null;
    return ROLE_DISPLAY[rbacUser.role];
  }, [rbacUser]);

  // Sign out with cleanup
  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
      setRbacUser(null);
      setPermissions([]);
      setOrgMembers([]);
    } catch (error) {
      console.error('Sign out error:', error);
    }
  }, []);

  // Refresh methods
  const refreshPermissions = useCallback(async () => {
    if (user) {
      await fetchRBACData(user);
    }
  }, [user, fetchRBACData]);

  const refreshOrgMembers = useCallback(async () => {
    await fetchOrgMembers();
  }, [fetchOrgMembers]);

  const value: EnhancedAuthContextType = {
    // Core authentication
    user,
    session,
    loading: loading || rbacLoading,
    signOut,

    // RBAC integration
    rbacUser,
    role: rbacUser?.role || null,
    powerLevel: rbacUser?.powerLevel || 0,
    permissions,

    // Permission methods
    hasPermission,
    checkPermission,
    canManageUser: canManageUserRole,

    // Role utilities
    isOwner,
    isAdmin,
    isAnalyst,
    isMember,
    isViewer,
    getDisplayRole,

    // Organization context
    orgId: rbacUser?.orgId || null,
    orgMembers,

    // Refresh methods
    refreshPermissions,
    refreshOrgMembers,
  };

  return (
    <EnhancedAuthContext.Provider value={value}>
      {children}
    </EnhancedAuthContext.Provider>
  );
}

// Backward compatibility hook
export function useAuth() {
  const enhanced = useEnhancedAuth();
  
  return {
    user: enhanced.user,
    session: enhanced.session,
    loading: enhanced.loading,
    signOut: enhanced.signOut,
  };
}

// RBAC-specific hook
export function useRBAC() {
  const enhanced = useEnhancedAuth();
  
  return {
    user: enhanced.rbacUser,
    role: enhanced.role,
    powerLevel: enhanced.powerLevel,
    permissions: enhanced.permissions,
    loading: enhanced.loading,
    
    hasPermission: enhanced.hasPermission,
    checkPermission: enhanced.checkPermission,
    canManageUser: enhanced.canManageUser,
    
    isOwner: enhanced.isOwner,
    isAdmin: enhanced.isAdmin,
    isAnalyst: enhanced.isAnalyst,
    isMember: enhanced.isMember,
    isViewer: enhanced.isViewer,
    getDisplayRole: enhanced.getDisplayRole,
    
    refreshPermissions: enhanced.refreshPermissions,
  };
}

// Organization management hook
export function useOrganization() {
  const enhanced = useEnhancedAuth();
  
  return {
    orgId: enhanced.orgId,
    orgMembers: enhanced.orgMembers,
    refreshMembers: enhanced.refreshOrgMembers,
    canManage: enhanced.isAdmin,
  };
}
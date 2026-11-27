import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import supabase from '../lib/supabase';
import { apiFetch } from '../lib/api';
import type { WorkspaceBootstrap, Role } from '../types';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  workspace: WorkspaceBootstrap | null;
  loading: boolean;
  workspaceLoading: boolean;
  error: string | null;
  refreshWorkspace: (orgId?: string) => Promise<void>;
  signOut: () => Promise<void>;
  hasRole: (roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  workspace: null,
  loading: true,
  workspaceLoading: false,
  error: null,
  refreshWorkspace: async () => {},
  signOut: async () => {},
  hasRole: () => false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceBootstrap | null>(null);
  const [loading, setLoading] = useState(true);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshWorkspace = useCallback(async (orgId?: string) => {
    setWorkspaceLoading(true);
    setError(null);
    try {
      const data = await apiFetch<WorkspaceBootstrap>('/api/workspace?action=bootstrap', {
        orgId,
      });
      setWorkspace(data);
    } catch (err: any) {
      console.error('[AuthContext] bootstrap failed:', err);
      setError(err.message || 'Failed to load workspace');
    } finally {
      setWorkspaceLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      if (!mounted) return;
      setSession(initialSession);
      setUser(initialSession?.user ?? null);
      setLoading(false);
      if (initialSession?.user) {
        refreshWorkspace();
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);
      if (nextSession?.user) {
        refreshWorkspace();
      } else {
        setWorkspace(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [refreshWorkspace]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setWorkspace(null);
  };

  const hasRole = useCallback(
    (roles: Role[]) => {
      const role = workspace?.member?.role;
      return Boolean(role && roles.includes(role));
    },
    [workspace?.member?.role]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        workspace,
        loading,
        workspaceLoading,
        error,
        refreshWorkspace,
        signOut,
        hasRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

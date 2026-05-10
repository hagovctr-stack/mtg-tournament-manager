import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, getStoredUserId, setStoredUserId, type AuthSession } from './api';

type AuthContextValue = {
  session: AuthSession | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  canManage: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const nextSession = await api.getSession();
      const storedUserId = getStoredUserId();
      if (!storedUserId && nextSession.userId) {
        setStoredUserId(nextSession.userId);
      }
      setSession(nextSession);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load session');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      loading,
      error,
      refresh,
      canManage: session?.role === 'ORG_ADMIN' || session?.role === 'ORGANIZER',
    }),
    [error, loading, refresh, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}

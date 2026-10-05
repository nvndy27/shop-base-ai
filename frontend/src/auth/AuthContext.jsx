import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { client, authService, configurationError } from './client';
import { authMessage } from './service';
import { AuthContext, useAuth } from './context';

export function AuthProvider({ children }) {
  const [state, setState] = useState({ session: null, loading: Boolean(client), error: configurationError });
  const revision = useRef(0);
  const refreshSession = useCallback(async () => {
    const startRevision = revision.current;
    const session = await authService.restore();
    if (startRevision !== revision.current) return null;
    setState({ session, loading: false, error: null });
    return session;
  }, []);
  useEffect(() => {
    if (!client) {
      return;
    }
    let active = true;
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if (!active || event === 'INITIAL_SESSION') return;
      revision.current++;
      // Never await another SDK auth call inside this callback (SDK lock).
      setState({ session, loading: false, error: null });
    });
    const startRevision = revision.current;
    authService.restore().then(session => {
      if (active && startRevision === revision.current) setState({ session, loading: false, error: null });
    }).catch(error => {
      if (active && startRevision === revision.current) {
        setState({ session: null, loading: false, error: authMessage(error) });
      }
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);
  return <AuthContext.Provider value={{ ...state, user: state.session?.user || null, authService, refreshSession }}>
    {children}
  </AuthContext.Provider>;
}

export function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="container"><p>Đang kiểm tra phiên đăng nhập...</p></div>;
  if (!user) return <Navigate to="/auth" replace />;
  return children;
}

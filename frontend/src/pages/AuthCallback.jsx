import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/context';
import { authMessage } from '../auth/service';
import { accountDestination } from '../auth/onboarding';
import { parseAuthReturn } from '../auth/return';
import './LoginRegister.css';

export default function AuthCallback() {
  const location = useLocation();
  const navigate = useNavigate();
  const { authService } = useAuth();
  const [error, setError] = useState(null);
  useEffect(() => {
    let active = true;
    const search = location.search;
    const hash = location.hash;
    // Remove the code/provider error before further rendering. Never echo it or log it.
    window.history.replaceState(window.history.state, '', '/auth/callback');
    const finish = async () => {
      try {
        const result = parseAuthReturn(search, hash);
        if (result.kind === 'pkce') await authService.exchangeCode(result.code);
        else await authService.acceptEmailLink(result.accessToken, result.refreshToken);
        if (active) navigate(accountDestination(), { replace: true });
      } catch (failure) {
        if (active) setError(authMessage(failure));
      }
    };
    finish();
    return () => { active = false; };
  }, [authService, location.search, location.hash, navigate]);
  return <div className="container"><div className="auth-form">
    <h1>Đăng nhập</h1>
    {error ? <div className="alert alert-error" role="alert"><p>{error}</p>
      <Link to="/auth">Quay lại đăng nhập</Link>
    </div> : <p>Đang xác thực phiên đăng nhập...</p>}
  </div></div>;
}

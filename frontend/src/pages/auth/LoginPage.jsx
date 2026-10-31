import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams, Navigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Spinner } from '../../components/Spinner';
import toast from 'react-hot-toast';

export const LoginPage = () => {
  const { login, session, user, loading, role, roleHome } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = searchParams.get('next');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // While auth session is loading, show Spinner
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-canvas">
        <Spinner size="lg" />
      </div>
    );
  }

  // If already signed in, redirect to role home
  if (session && user) {
    const home = roleHome || (role === 'CUSTOMER' ? '/portal/profile' : '/customers');
    return <Navigate to={home} replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await login({ email, password });
      toast.success('Signed in successfully');

      const userRole = res?.profile?.role || role;
      const defaultHome = userRole === 'CUSTOMER' ? '/portal/profile' : '/customers';

      if (next) {
        const decoded = decodeURIComponent(next);
        if (decoded && !decoded.startsWith('/login')) {
          navigate(decoded, { replace: true });
          return;
        }
      }

      navigate(defaultHome, { replace: true });
    } catch (err) {
      const msg = err.message || 'Invalid email or password';
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-canvas flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-[420px] bg-white rounded-[16px] border border-surface-border shadow-card p-8">
        {/* Brand header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-brand text-white font-bold text-xl mb-3 shadow-sm">
            BL
          </div>
          <h1 className="text-[24px] font-bold text-surface-text tracking-tight">
            Sign in to Brightloop
          </h1>
          <p className="text-[13px] text-surface-muted mt-1">
            Subscription & Revenue Management Platform
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-[8px] bg-status-danger-soft border border-status-danger/20 text-[13px] text-status-danger">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Email address"
            type="email"
            name="email"
            placeholder="name@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            autoFocus
          />

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-[12px] font-medium text-surface-muted">
                Password <span className="text-status-danger">*</span>
              </label>
              <Link
                to="/forgot-password"
                className="text-[12px] font-medium text-brand hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <input
              type="password"
              name="password"
              placeholder="•••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full px-3 py-2 text-[14px] bg-white border border-surface-border rounded-[8px] focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand transition-colors"
            />
          </div>

          <Button
            type="submit"
            loading={submitting}
            className="w-full mt-2"
          >
            Sign in
          </Button>
        </form>

        <div className="mt-6 pt-6 border-t border-surface-border text-center text-[13px] text-surface-muted">
          Don't have an account?{' '}
          <Link to="/signup" className="font-semibold text-brand hover:underline">
            Create an account
          </Link>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;


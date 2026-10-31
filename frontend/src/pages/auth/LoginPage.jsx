import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import toast from 'react-hot-toast';

export const LoginPage = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = searchParams.get('next');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }

    setLoading(true);
    try {
      const data = await login({ email, password });
      toast.success('Signed in successfully');

      if (next) {
        navigate(decodeURIComponent(next), { replace: true });
        return;
      }

      // Check role from profile or metadata
      const userRole = data?.user?.user_metadata?.role;
      if (userRole === 'CUSTOMER') {
        navigate('/portal/subscriptions', { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
    } catch (err) {
      const msg = err.message || 'Invalid email or password';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
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
            loading={loading}
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

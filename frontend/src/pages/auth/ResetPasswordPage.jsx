import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/Button';
import { Check, Circle } from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';

export const ResetPasswordPage = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');

  // 4 live password validation rules
  const rules = [
    { label: 'Minimum 9 characters', valid: password.length >= 9 },
    { label: 'At least one uppercase letter (A-Z)', valid: /[A-Z]/.test(password) },
    { label: 'At least one lowercase letter (a-z)', valid: /[a-z]/.test(password) },
    { label: 'At least one special character (!@#$%^&*...)', valid: /[^A-Za-z0-9]/.test(password) },
  ];

  const allRulesPassed = rules.every((r) => r.valid);
  const passwordsMatch = password && confirmPassword && password === confirmPassword;

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setHasSession(true);
      }
      setChecking(false);
    });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!allRulesPassed) {
      setError('Please fulfill all password requirements.');
      return;
    }

    if (!passwordsMatch) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      // Call backend reset-password endpoint with the recovery token attached via api client
      await api.post('/auth/reset-password', { password });

      toast.success('Your password has been reset successfully!');
      await supabase.auth.signOut();
      navigate('/login', { replace: true });
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message || 'Failed to reset password';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-surface-canvas flex items-center justify-center">
        <div className="animate-spin w-8 h-8 rounded-full border-2 border-brand border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-canvas flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-[440px] bg-white rounded-[16px] border border-surface-border shadow-card p-8">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-brand text-white font-bold text-xl mb-3 shadow-sm">
            BL
          </div>
          <h1 className="text-[24px] font-bold text-surface-text tracking-tight">
            Set New Password
          </h1>
          <p className="text-[13px] text-surface-muted mt-1">
            Choose a strong password to secure your account
          </p>
        </div>

        {!hasSession && (
          <div className="mb-4 p-3 rounded-[8px] bg-status-warning-soft border border-status-warning/20 text-[12px] text-[#B26200]">
            Notice: If you did not click a valid password recovery link from your email, this submission will fail.
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 rounded-[8px] bg-status-danger-soft border border-status-danger/20 text-[13px] text-status-danger">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[12px] font-medium text-surface-muted mb-1.5">
              New Password <span className="text-status-danger">*</span>
            </label>
            <input
              type="password"
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoFocus
              className="w-full px-3 py-2 text-[14px] bg-white border border-surface-border rounded-[8px] focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand transition-colors"
            />

            {/* Live checklist */}
            <div className="mt-3 p-3 bg-surface-canvas/60 rounded-[8px] border border-surface-border/80">
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-surface-muted mb-2">
                Requirements:
              </span>
              <ul className="space-y-1.5 text-[12px]">
                {rules.map((rule, idx) => (
                  <li
                    key={idx}
                    className={`flex items-center gap-2 transition-colors ${
                      rule.valid ? 'text-status-success font-medium' : 'text-surface-muted'
                    }`}
                  >
                    {rule.valid ? (
                      <Check className="w-3.5 h-3.5 text-status-success shrink-0" />
                    ) : (
                      <Circle className="w-3.5 h-3.5 text-surface-muted/50 shrink-0" />
                    )}
                    <span>{rule.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-medium text-surface-muted mb-1.5">
              Confirm New Password <span className="text-status-danger">*</span>
            </label>
            <input
              type="password"
              placeholder="••••••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="w-full px-3 py-2 text-[14px] bg-white border border-surface-border rounded-[8px] focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand transition-colors"
            />
            {confirmPassword && !passwordsMatch && (
              <p className="mt-1 text-[12px] text-status-danger">Passwords do not match</p>
            )}
          </div>

          <Button
            type="submit"
            loading={loading}
            disabled={!allRulesPassed || !passwordsMatch}
            className="w-full mt-2"
          >
            Update password
          </Button>
        </form>

        <div className="mt-6 pt-6 border-t border-surface-border text-center text-[13px] text-surface-muted">
          Back to{' '}
          <Link to="/login" className="font-semibold text-brand hover:underline">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordPage;

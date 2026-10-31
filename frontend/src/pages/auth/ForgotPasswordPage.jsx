import React, { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Spinner } from '../../components/Spinner';
import { MailCheck } from 'lucide-react';
import toast from 'react-hot-toast';

export const ForgotPasswordPage = () => {
  const { session, user, loading, role, roleHome } = useAuth();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
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

    if (!email) {
      setError('Please enter your email address.');
      return;
    }

    setSubmitting(true);
    try {
      const redirectUrl = `${window.location.origin}/reset-password`;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl,
      });

      if (resetError) throw resetError;

      setSent(true);
      toast.success('Password reset email sent');
    } catch (err) {
      const msg = err.message || 'Failed to send reset link';
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-canvas flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-[420px] bg-white rounded-[16px] border border-surface-border shadow-card p-8">
        {sent ? (
          <div className="text-center py-4">
            <div className="w-12 h-12 rounded-full bg-status-success-soft text-status-success flex items-center justify-center mx-auto mb-4">
              <MailCheck className="w-6 h-6" />
            </div>
            <h2 className="text-[20px] font-bold text-surface-text mb-2">Check your email</h2>
            <p className="text-[13px] text-surface-muted mb-6">
              We have sent a password reset link to <span className="font-semibold text-surface-text">{email}</span>. Click the link in the email to choose a new password.
            </p>
            <Link to="/login">
              <Button variant="outline" className="w-full">
                Back to Sign in
              </Button>
            </Link>
          </div>
        ) : (
          <>
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-brand text-white font-bold text-xl mb-3 shadow-sm">
                BL
              </div>
              <h1 className="text-[24px] font-bold text-surface-text tracking-tight">
                Reset your password
              </h1>
              <p className="text-[13px] text-surface-muted mt-1">
                Enter your registered email address and we'll send you a recovery link.
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
                autoFocus
              />

              <Button
                type="submit"
                loading={submitting}
                className="w-full mt-2"
              >
                Send reset link
              </Button>
            </form>

            <div className="mt-6 pt-6 border-t border-surface-border text-center text-[13px] text-surface-muted">
              Remember your password?{' '}
              <Link to="/login" className="font-semibold text-brand hover:underline">
                Sign in
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ForgotPasswordPage;


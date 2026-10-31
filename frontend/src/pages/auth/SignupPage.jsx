import React, { useState } from 'react';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Spinner } from '../../components/Spinner';
import { PasswordChecklist, isPasswordValid } from '../../components/PasswordChecklist';
import api from '../../lib/api';
import toast from 'react-hot-toast';

export const SignupPage = () => {
  const { login, session, user, loading, role, roleHome } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

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

  const allRulesPassed = isPasswordValid(password);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});

    if (!allRulesPassed) {
      setError('Please fulfill all password requirements before signing up.');
      setFieldErrors({ password: 'Password does not meet all security requirements.' });
      return;
    }

    setSubmitting(true);
    try {
      // Call backend signup API which enforces password rules and creates profile/customer
      await api.post('/auth/signup', {
        email,
        password,
        fullName,
        phone: phone || null,
      });

      toast.success('Account created successfully!');

      // Automatically sign in and go to customer role home
      await login({ email, password });
      navigate('/portal/profile', { replace: true });
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message || 'Signup failed';
      setError(msg);

      const details = err.response?.data?.error?.details || [];
      const map = {};
      details.forEach((d) => {
        if (d.field) map[d.field] = d.message;
      });
      setFieldErrors(map);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-canvas flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-[440px] bg-white rounded-[16px] border border-surface-border shadow-card p-8">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-brand text-white font-bold text-xl mb-3 shadow-sm">
            BL
          </div>
          <h1 className="text-[24px] font-bold text-surface-text tracking-tight">
            Create an Account
          </h1>
          <p className="text-[13px] text-surface-muted mt-1">
            Sign up for the Brightloop customer portal
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-[8px] bg-status-danger-soft border border-status-danger/20 text-[13px] text-status-danger">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Full Name"
            name="fullName"
            placeholder="Jane Doe"
            value={fullName}
            error={fieldErrors.fullName}
            onChange={(e) => {
              setFullName(e.target.value);
              if (fieldErrors.fullName) setFieldErrors((p) => ({ ...p, fullName: '' }));
            }}
            required
            autoFocus
          />

          <Input
            label="Email address"
            type="email"
            name="email"
            placeholder="name@example.com"
            value={email}
            error={fieldErrors.email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: '' }));
            }}
            required
            autoComplete="email"
          />

          <Input
            label="Phone number (optional)"
            type="tel"
            name="phone"
            placeholder="+91 9876543210"
            value={phone}
            error={fieldErrors.phone}
            onChange={(e) => {
              setPhone(e.target.value);
              if (fieldErrors.phone) setFieldErrors((p) => ({ ...p, phone: '' }));
            }}
          />

          <div>
            <label className="block text-[12px] font-medium text-surface-muted mb-1.5">
              Password <span className="text-status-danger">*</span>
            </label>
            <input
              type="password"
              name="password"
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: '' }));
              }}
              required
              autoComplete="new-password"
              className={`w-full px-3 py-2 text-[14px] bg-white border rounded-[8px] focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand transition-colors ${
                fieldErrors.password ? 'border-status-danger' : 'border-surface-border'
              }`}
            />
            {fieldErrors.password && (
              <p className="mt-1 text-[12px] text-status-danger">{fieldErrors.password}</p>
            )}

            {/* Live Password Checklist */}
            <PasswordChecklist password={password} title="Password Requirements:" />
          </div>

          <Button
            type="submit"
            loading={submitting}
            disabled={!allRulesPassed}
            className="w-full mt-3"
          >
            Create account
          </Button>
        </form>

        <div className="mt-6 pt-6 border-t border-surface-border text-center text-[13px] text-surface-muted">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-brand hover:underline">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
};

export default SignupPage;


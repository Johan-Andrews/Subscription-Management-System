import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Check, Circle } from 'lucide-react';
import api from '../../lib/api';
import toast from 'react-hot-toast';

export const SignupPage = () => {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 4 live password validation rules
  const rules = [
    { label: 'Minimum 9 characters', valid: password.length >= 9 },
    { label: 'At least one uppercase letter (A-Z)', valid: /[A-Z]/.test(password) },
    { label: 'At least one lowercase letter (a-z)', valid: /[a-z]/.test(password) },
    { label: 'At least one special character (!@#$%^&*...)', valid: /[^A-Za-z0-9]/.test(password) },
  ];

  const allRulesPassed = rules.every((r) => r.valid);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!allRulesPassed) {
      setError('Please fulfill all password requirements before signing up.');
      return;
    }

    setLoading(true);
    try {
      // Call backend signup API which enforces password rules and creates profile/customer
      await api.post('/auth/signup', {
        email,
        password,
        fullName,
        phone: phone || null,
      });

      toast.success('Account created successfully!');

      // Automatically sign in
      await login({ email, password });
      navigate('/portal/subscriptions', { replace: true });
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message || 'Signup failed';
      setError(msg);
    } finally {
      setLoading(false);
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
            onChange={(e) => setFullName(e.target.value)}
            required
            autoFocus
          />

          <Input
            label="Email address"
            type="email"
            name="email"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />

          <Input
            label="Phone number (optional)"
            type="tel"
            name="phone"
            placeholder="+91 9876543210"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
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
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="w-full px-3 py-2 text-[14px] bg-white border border-surface-border rounded-[8px] focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand transition-colors"
            />

            {/* Live Password Checklist */}
            <div className="mt-3 p-3 bg-surface-canvas/60 rounded-[8px] border border-surface-border/80">
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-surface-muted mb-2">
                Password Requirements:
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

          <Button
            type="submit"
            loading={loading}
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


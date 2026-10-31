import React from 'react';
import { Check, Circle } from 'lucide-react';

export const getPasswordRules = (password = '') => [
  { label: 'Minimum 9 characters', valid: password.length >= 9 },
  { label: 'At least one uppercase letter (A-Z)', valid: /[A-Z]/.test(password) },
  { label: 'At least one lowercase letter (a-z)', valid: /[a-z]/.test(password) },
  { label: 'At least one special character (!@#$%^&*...)', valid: /[^A-Za-z0-9]/.test(password) },
];

export const isPasswordValid = (password = '') => {
  return getPasswordRules(password).every((r) => r.valid);
};

export const PasswordChecklist = ({ password = '', title = 'Requirements:' }) => {
  const rules = getPasswordRules(password);

  return (
    <div className="mt-3 p-3 bg-surface-canvas/60 rounded-[8px] border border-surface-border/80">
      <span className="block text-[11px] font-semibold uppercase tracking-wider text-surface-muted mb-2">
        {title}
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
  );
};

export default PasswordChecklist;


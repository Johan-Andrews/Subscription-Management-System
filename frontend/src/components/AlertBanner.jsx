import React from 'react';
import { AlertCircle } from 'lucide-react';

export const AlertBanner = ({
  message,
  highlight,
  icon: Icon = AlertCircle,
  className = '',
  action,
}) => {
  return (
    <div
      className={`p-4 rounded-[12px] bg-status-danger-soft border border-status-danger/20 flex items-center justify-between gap-3 text-[14px] text-surface-text ${className}`}
    >
      <div className="flex items-center gap-3">
        <Icon className="w-5 h-5 text-status-danger shrink-0" />
        <div>
          {message}{' '}
          {highlight && <span className="font-bold text-status-danger">{highlight}</span>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
};

export default AlertBanner;


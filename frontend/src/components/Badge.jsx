import React from 'react';

export const Badge = ({
  children,
  variant = 'neutral', // neutral | success | warning | danger | info | brand
  className = '',
}) => {
  const variants = {
    neutral: 'bg-status-neutral-soft text-status-neutral',
    success: 'bg-status-success-soft text-status-success',
    warning: 'bg-status-warning-soft text-[#B26200]',
    danger: 'bg-status-danger-soft text-status-danger',
    info: 'bg-status-info-soft text-brand',
    brand: 'bg-brand text-white',
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-medium leading-4 ${
        variants[variant] || variants.neutral
      } ${className}`}
    >
      {children}
    </span>
  );
};

export const StatusBadge = ({ status, className = '' }) => {
  if (!status) return null;
  const s = String(status).toUpperCase();

  let variant = 'neutral';
  let label = status;

  switch (s) {
    case 'DRAFT':
      variant = 'neutral';
      label = 'Draft';
      break;
    case 'QUOTATION':
      variant = 'info';
      label = 'Quotation';
      break;
    case 'CONFIRMED':
      variant = 'info';
      label = 'Confirmed';
      break;
    case 'ACTIVE':
      variant = 'success';
      label = 'Active';
      break;
    case 'CLOSED':
      variant = 'neutral';
      label = 'Closed';
      break;
    case 'PAID':
      variant = 'success';
      label = 'Paid';
      break;
    case 'OVERDUE':
      variant = 'danger';
      label = 'Overdue';
      break;
    case 'PAUSED':
      variant = 'warning';
      label = 'Paused';
      break;
    case 'CANCELLED':
      variant = 'neutral';
      label = 'Cancelled';
      break;
    case 'VOIDED':
      variant = 'neutral';
      label = 'Voided';
      break;
    default:
      variant = 'neutral';
      label = status;
  }

  return (
    <Badge variant={variant} className={className}>
      {label}
    </Badge>
  );
};

export default Badge;


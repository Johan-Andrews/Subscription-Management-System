import React from 'react';

export const KpiTile = ({
  label,
  value,
  trend,
  isPrimary = false,
  icon: Icon,
  className = '',
  onClick,
}) => {
  return (
    <div
      onClick={onClick}
      className={`rounded-[16px] border p-6 transition-all ${
        onClick ? 'cursor-pointer' : ''
      } ${
        isPrimary
          ? 'bg-brand text-white border-brand shadow-md'
          : 'bg-white text-surface-text border-surface-border shadow-card'
      } ${className}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span
          className={`text-[12px] font-medium uppercase tracking-wider ${
            isPrimary ? 'text-white/80' : 'text-surface-muted'
          }`}
        >
          {label}
        </span>
        {Icon && (
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center ${
              isPrimary ? 'bg-white/20 text-white' : 'bg-surface-canvas text-surface-muted'
            }`}
          >
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>
      <div className="text-[36px] font-bold tracking-tight tabular-nums leading-none mb-1">
        {value}
      </div>
      {trend && (
        <div
          className={`text-[12px] font-medium flex items-center gap-1 ${
            isPrimary ? 'text-white/90' : 'text-surface-muted'
          }`}
        >
          {trend}
        </div>
      )}
    </div>
  );
};

export default KpiTile;


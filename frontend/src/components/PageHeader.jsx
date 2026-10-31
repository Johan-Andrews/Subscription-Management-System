import React from 'react';

export const PageHeader = ({
  title,
  subtitle,
  actions,
  breadcrumbs,
  className = '',
}) => {
  return (
    <div className={`mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 ${className}`}>
      <div>
        {breadcrumbs && (
          <nav className="text-[12px] text-surface-muted mb-1 flex items-center gap-1.5">
            {breadcrumbs}
          </nav>
        )}
        <h1 className="text-[28px] font-semibold text-surface-text tracking-tight">{title}</h1>
        {subtitle && <p className="text-[14px] text-surface-muted mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-3 shrink-0">{actions}</div>}
    </div>
  );
};

export const RecordHeader = ({
  typeLabel = 'Record',
  title,
  icon: Icon,
  iconBg = 'bg-brand-soft text-brand',
  actions,
  className = '',
}) => {
  return (
    <div className={`flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-6 bg-white rounded-[16px] border border-surface-border shadow-card mb-6 ${className}`}>
      <div className="flex items-center gap-4">
        {Icon && (
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${iconBg}`}>
            <Icon className="w-5 h-5" />
          </div>
        )}
        <div>
          <span className="text-[12px] font-medium uppercase tracking-wider text-surface-muted">{typeLabel}</span>
          <h1 className="text-[28px] font-semibold text-surface-text tracking-tight leading-tight">{title}</h1>
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
};

export default PageHeader;

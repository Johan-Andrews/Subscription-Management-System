import React from 'react';

export const Card = ({
  children,
  className = '',
  title,
  subtitle,
  actions,
  padding = true,
}) => {
  return (
    <div
      className={`bg-white rounded-[16px] border border-surface-border shadow-card ${
        padding ? 'p-6' : ''
      } ${className}`}
    >
      {(title || actions) && (
        <div className={`flex items-center justify-between ${padding ? 'mb-4' : 'p-6 border-b border-surface-border'}`}>
          <div>
            {title && <h3 className="text-[20px] font-semibold text-surface-text">{title}</h3>}
            {subtitle && <p className="text-[12px] text-surface-muted mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
};

export default Card;


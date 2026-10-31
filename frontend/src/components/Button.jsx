import React from 'react';

export const Button = ({
  children,
  variant = 'primary', // primary | secondary | outline | danger | ghost
  size = 'md',        // sm | md | lg
  type = 'button',
  disabled = false,
  loading = false,
  icon: Icon,
  className = '',
  onClick,
  ...props
}) => {
  const baseStyles = 'inline-flex items-center justify-center font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed rounded-full h-[36px] px-4 text-[14px]';

  const variants = {
    primary: 'bg-brand hover:bg-brand-hover text-white shadow-sm',
    secondary: 'bg-white border border-brand text-brand hover:bg-brand-soft',
    outline: 'bg-white border border-surface-border text-surface-text hover:bg-surface-canvas',
    danger: 'bg-status-danger hover:bg-red-700 text-white shadow-sm',
    ghost: 'bg-transparent text-surface-muted hover:bg-surface-canvas hover:text-surface-text',
  };

  const sizes = {
    sm: 'h-[30px] px-3 text-[12px]',
    md: 'h-[36px] px-4 text-[14px]',
    lg: 'h-[42px] px-6 text-[15px]',
  };

  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className={`${baseStyles} ${variants[variant] || variants.primary} ${sizes[size] || sizes.md} ${className}`}
      {...props}
    >
      {loading ? (
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
        </svg>
      ) : Icon ? (
        <Icon className="w-4 h-4 mr-2" />
      ) : null}
      {children}
    </button>
  );
};

export const ButtonGroup = ({ children, className = '' }) => {
  return (
    <div className={`inline-flex rounded-full shadow-sm ${className}`}>
      {React.Children.map(children, (child, index) => {
        if (!React.isValidElement(child)) return child;
        const isFirst = index === 0;
        const isLast = index === React.Children.count(children) - 1;
        
        let borderClass = 'rounded-none border-r-0';
        if (isFirst) borderClass = 'rounded-l-full border-r-0';
        if (isLast) borderClass = 'rounded-r-full';

        return React.cloneElement(child, {
          className: `${child.props.className || ''} ${borderClass}`,
        });
      })}
    </div>
  );
};

export default Button;


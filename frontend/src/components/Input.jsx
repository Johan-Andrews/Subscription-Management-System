import React from 'react';

export const Input = ({
  label,
  error,
  helperText,
  id,
  className = '',
  required = false,
  ...props
}) => {
  const inputId = id || props.name || Math.random().toString(36).substring(2, 9);

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="block text-[12px] font-medium text-surface-muted mb-1.5"
        >
          {label} {required && <span className="text-status-danger">*</span>}
        </label>
      )}
      <input
        id={inputId}
        className={`w-full px-3 py-2 text-[14px] bg-white border rounded-[8px] transition-colors
          placeholder:text-surface-muted/60 focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand
          disabled:bg-surface-canvas disabled:text-surface-muted disabled:cursor-not-allowed
          ${error ? 'border-status-danger focus:ring-status-danger' : 'border-surface-border'}
          ${className}`}
        {...props}
      />
      {error ? (
        <p className="mt-1 text-[12px] text-status-danger">{error}</p>
      ) : helperText ? (
        <p className="mt-1 text-[12px] text-surface-muted">{helperText}</p>
      ) : null}
    </div>
  );
};

export default Input;


import React from 'react';
import { Button } from './Button';

export const Table = ({
  columns = [],
  data = [],
  loading = false,
  emptyMessage = 'No records found',
  emptyActionLabel,
  onEmptyAction,
  keyExtractor = (item, index) => item.id || index,
  onRowClick,
  className = '',
}) => {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-surface-border text-[12px] font-semibold text-surface-muted">
            {columns.map((col, idx) => (
              <th
                key={col.key || idx}
                className={`py-3.5 px-4 first:pl-6 last:pr-6 ${col.className || ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-[14px] text-surface-text divide-y divide-surface-border">
          {loading ? (
            // Skeleton rows
            Array.from({ length: 5 }).map((_, rIdx) => (
              <tr key={rIdx} className="h-[56px] animate-pulse">
                {columns.map((col, cIdx) => (
                  <td key={cIdx} className="py-3.5 px-4 first:pl-6 last:pr-6">
                    <div className="h-4 bg-surface-border/60 rounded w-3/4"></div>
                  </td>
                ))}
              </tr>
            ))
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="py-12 text-center">
                <div className="flex flex-col items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-surface-canvas flex items-center justify-center mb-3">
                    <svg
                      className="w-6 h-6 text-surface-muted"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.5"
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                  </div>
                  <p className="text-[14px] text-surface-muted mb-4">{emptyMessage}</p>
                  {emptyActionLabel && onEmptyAction && (
                    <Button onClick={onEmptyAction} size="sm">
                      {emptyActionLabel}
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ) : (
            data.map((row, index) => (
              <tr
                key={keyExtractor(row, index)}
                onClick={() => onRowClick && onRowClick(row)}
                className={`h-[56px] transition-colors hover:bg-brand-soft/50 ${
                  onRowClick ? 'cursor-pointer' : ''
                }`}
              >
                {columns.map((col, cIdx) => (
                  <td
                    key={col.key || cIdx}
                    className={`py-3.5 px-4 first:pl-6 last:pr-6 align-middle ${
                      col.cellClassName || ''
                    }`}
                  >
                    {col.render ? col.render(row, index) : row[col.accessor || col.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

export default Table;


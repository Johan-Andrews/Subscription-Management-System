import React from 'react';
import { Button } from './Button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export const Pagination = ({
  page = 1,
  pageSize = 20,
  total = 0,
  onPageChange,
  className = '',
}) => {
  const totalPages = Math.ceil(total / pageSize) || 1;
  const startItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);

  if (total <= 0) return null;

  return (
    <div className={`flex items-center justify-between px-6 py-4 border-t border-surface-border text-[12px] text-surface-muted ${className}`}>
      <div>
        Showing <span className="font-semibold text-surface-text tabular-nums">{startItem}</span> to{' '}
        <span className="font-semibold text-surface-text tabular-nums">{endItem}</span> of{' '}
        <span className="font-semibold text-surface-text tabular-nums">{total}</span> results
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="w-4 h-4 mr-1" /> Previous
        </Button>
        <span className="px-2 font-medium tabular-nums">
          Page {page} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
  );
};

export default Pagination;


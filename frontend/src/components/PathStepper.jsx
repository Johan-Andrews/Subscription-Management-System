import React from 'react';
import { Check } from 'lucide-react';
import { Button } from './Button';

export const PathStepper = ({
  steps = [], // array of strings or { id, label }
  currentStep,
  actionButtonLabel,
  onActionClick,
  className = '',
}) => {
  const currentIndex = steps.findIndex(
    (s) => (typeof s === 'string' ? s.toUpperCase() : s.id.toUpperCase()) === String(currentStep).toUpperCase()
  );

  return (
    <div className={`p-4 bg-white rounded-[16px] border border-surface-border shadow-card flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6 ${className}`}>
      <div className="flex items-center flex-wrap gap-2 flex-1">
        {steps.map((step, index) => {
          const label = typeof step === 'string' ? step : step.label;
          const isDone = index < currentIndex;
          const isCurrent = index === currentIndex;

          let bgClass = 'bg-[#E5E7EB] text-[#5C667A]'; // path-todo
          if (isDone) {
            bgClass = 'bg-[#A8F0E0] text-[#0A2A66] font-medium'; // path-done
          } else if (isCurrent) {
            bgClass = 'bg-[#0A2A66] text-white font-semibold shadow-sm'; // path-current
          }

          return (
            <div
              key={index}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] transition-all ${bgClass}`}
            >
              {isDone ? (
                <Check className="w-4 h-4 text-[#0A2A66]" />
              ) : (
                <span className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] border border-current">
                  {index + 1}
                </span>
              )}
              <span>{label}</span>
            </div>
          );
        })}
      </div>

      {actionButtonLabel && onActionClick && (
        <div className="shrink-0">
          <Button onClick={onActionClick} size="sm">
            {actionButtonLabel}
          </Button>
        </div>
      )}
    </div>
  );
};

export default PathStepper;


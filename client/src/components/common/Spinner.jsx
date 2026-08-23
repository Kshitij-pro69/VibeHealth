import React from 'react';
import clsx from 'clsx';

export const Spinner = ({ size = 'md', className = '' }) => {
  const sizes = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
  };

  return (
    <div className="flex items-center justify-center p-4">
      <div
        className={clsx(
          'animate-spin rounded-full border-2 border-slate-200 border-t-teal-600',
          sizes[size],
          className
        )}
      />
    </div>
  );
};

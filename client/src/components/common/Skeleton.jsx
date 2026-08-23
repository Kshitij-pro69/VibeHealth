import React from 'react';
import clsx from 'clsx';

export const Skeleton = ({ className = '', variant = 'text' }) => {
  const baseClasses = 'animate-pulse bg-slate-200/80 rounded-xl';

  if (variant === 'circle') {
    return <div className={clsx(baseClasses, 'rounded-full', className)} />;
  }

  if (variant === 'card') {
    return (
      <div className={clsx('p-5 border border-slate-200/80 bg-white rounded-2xl space-y-3', className)}>
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-slate-200 animate-pulse shrink-0" />
          <div className="space-y-1.5 flex-1">
            <div className="h-4 w-1/3 bg-slate-200 animate-pulse rounded" />
            <div className="h-3 w-1/4 bg-slate-200/70 animate-pulse rounded" />
          </div>
        </div>
        <div className="h-12 w-full bg-slate-100 animate-pulse rounded-xl" />
      </div>
    );
  }

  return <div className={clsx(baseClasses, className)} />;
};

export const CardSkeleton = () => <Skeleton variant="card" />;

export const TableRowSkeleton = ({ cols = 5 }) => (
  <tr className="animate-pulse">
    {Array.from({ length: cols }).map((_, i) => (
      <td key={i} className="p-4">
        <div className="h-4 bg-slate-200/70 rounded w-3/4" />
      </td>
    ))}
  </tr>
);

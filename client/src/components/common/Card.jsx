import React from 'react';
import clsx from 'clsx';

export const Card = ({ children, className = '', hoverable = false, ...props }) => {
  return (
    <div
      className={clsx(
        'bg-white rounded-2xl border border-slate-100/80 shadow-sm shadow-slate-200/50 p-6 transition-all duration-200',
        hoverable && 'hover:shadow-md hover:border-teal-100 hover:-translate-y-0.5 cursor-pointer',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

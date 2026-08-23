import React from 'react';
import { Info, AlertTriangle, AlertCircle, ShieldCheck } from 'lucide-react';
import clsx from 'clsx';

export const UrgencyBadge = ({ urgency = 'Low', className = '', size = 'sm' }) => {
  const normUrgency = (urgency || 'Low').toString().toLowerCase();

  let label = 'LOW URGENCY';
  let variantClass = 'bg-teal-50 text-teal-800 border-teal-200';
  let IconComponent = Info;

  if (normUrgency.includes('high')) {
    label = 'HIGH URGENCY';
    variantClass = 'bg-rose-50 text-rose-800 border-rose-200 font-bold';
    IconComponent = AlertCircle;
  } else if (normUrgency.includes('medium') || normUrgency.includes('med')) {
    label = 'MEDIUM URGENCY';
    variantClass = 'bg-amber-50 text-amber-800 border-amber-200 font-bold';
    IconComponent = AlertTriangle;
  }

  const sizeClasses = size === 'xs' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs';
  const iconSizes = size === 'xs' ? 'w-3 h-3' : 'w-3.5 h-3.5';

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full font-semibold border tracking-wide uppercase',
        sizeClasses,
        variantClass,
        className
      )}
    >
      <IconComponent className={clsx('shrink-0', iconSizes)} />
      <span>{label}</span>
    </span>
  );
};

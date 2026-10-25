import React from 'react';

type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'muted';

interface StatusBadgeProps {
  label: string;
  tone?: StatusTone;
  className?: string;
}

const toneMap: Record<StatusTone, string> = {
  success: 'border border-teal-200 bg-teal-50 text-teal-700',
  warning: 'border border-amber-200 bg-amber-50 text-amber-700',
  danger: 'border border-rose-200 bg-rose-50 text-rose-700',
  info: 'border border-sky-200 bg-sky-50 text-sky-700',
  neutral: 'border border-slate-200 bg-slate-100 text-slate-700',
  muted: 'border border-slate-200 bg-white text-slate-600',
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ label, tone = 'neutral', className = '' }) => (
  <span
    className={['inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide uppercase', toneMap[tone], className].join(' ')}
  >
    {label}
  </span>
);

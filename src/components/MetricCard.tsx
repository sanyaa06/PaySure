import React from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: string;
  detail?: string;
  trend?: { direction: 'up' | 'down' | 'flat'; label: string };
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  className?: string;
}

const toneMap = {
  default: 'border-slate-200 bg-white text-slate-900',
  success: 'border-teal-200 bg-teal-50 text-teal-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  danger: 'border-rose-200 bg-rose-50 text-rose-900',
  info: 'border-sky-200 bg-sky-50 text-sky-900',
};

export const MetricCard: React.FC<MetricCardProps> = ({ title, value, detail, trend, tone = 'default', className = '' }) => {
  const trendIcon = trend?.direction === 'up' ? ArrowUpRight : trend?.direction === 'down' ? ArrowDownRight : null;
  const TrendIcon = trendIcon;

  return (
    <div className={['rounded-2xl border bg-white p-4 shadow-[0_1px_0_rgba(15,23,42,0.02)]', toneMap[tone], className].join(' ')}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{title}</p>
        {trend && TrendIcon && (
          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white/80 px-2 py-1 text-[10px] font-medium text-slate-600">
            <TrendIcon className="h-3.5 w-3.5" />
            {trend.label}
          </span>
        )}
      </div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold tracking-tight text-slate-900">{value}</div>
          {detail && <div className="mt-1 text-xs text-slate-500">{detail}</div>}
        </div>
      </div>
    </div>
  );
};

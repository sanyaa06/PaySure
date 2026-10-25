import React from 'react';

interface LoadingSkeletonProps {
  rows?: number;
  className?: string;
}

export const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({ rows = 4, className = '' }) => (
  <div className={['space-y-3', className].join(' ')} aria-live="polite" aria-busy="true">
    {Array.from({ length: rows }).map((_, index) => (
      <div key={index} className="animate-pulse rounded-2xl border border-slate-200 bg-slate-100 p-4">
        <div className="mb-3 h-3 w-1/3 rounded bg-slate-200" />
        <div className="space-y-2">
          <div className="h-3 rounded bg-slate-200" />
          <div className="h-3 w-5/6 rounded bg-slate-200" />
          <div className="h-3 w-2/3 rounded bg-slate-200" />
        </div>
      </div>
    ))}
  </div>
);

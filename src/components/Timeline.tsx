import React from 'react';

interface TimelineEntry {
  title: string;
  time: string;
  detail?: string;
}

interface TimelineProps {
  items: TimelineEntry[];
}

export const Timeline: React.FC<TimelineProps> = ({ items }) => (
  <div className="space-y-4">
    {items.map((item, index) => (
      <div key={`${item.title}-${index}`} className="flex gap-3">
        <div className="flex flex-col items-center">
          <div className="h-3 w-3 rounded-full border-2 border-teal-500 bg-teal-100" />
          {index < items.length - 1 && <div className="mt-1 h-full w-px min-h-[16px] bg-slate-200" />}
        </div>
        <div className="flex-1 pb-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm font-medium text-slate-800">{item.title}</div>
            <div className="text-[11px] text-slate-500">{item.time}</div>
          </div>
          {item.detail && <div className="mt-1 text-xs text-slate-600">{item.detail}</div>}
        </div>
      </div>
    ))}
  </div>
);

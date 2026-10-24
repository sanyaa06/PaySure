import React from 'react';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  phaseNotice: string;
  details?: { label: string; value: string }[];
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  phaseNotice,
  details,
}) => {
  return (
    <div className="max-w-2xl mx-auto my-12 p-8 bg-white border border-slate-200 rounded-lg text-center shadow-xs">
      <div className="w-12 h-12 mx-auto mb-4 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500">
        <Icon className="w-6 h-6" />
      </div>

      <h3 className="text-lg font-semibold text-slate-900 mb-2">
        {title}
      </h3>

      <p className="text-sm text-slate-600 max-w-lg mx-auto mb-6 leading-relaxed">
        {description}
      </p>

      {/* Phase status indicator (unboxed metadata) */}
      <div className="inline-flex items-center gap-2 px-3 py-1 bg-slate-50 border border-slate-200 rounded text-xs text-slate-600 mb-6">
        <span className="font-semibold text-slate-800">Roadmap Notice:</span>
        <span>{phaseNotice}</span>
      </div>

      {details && details.length > 0 && (
        <div className="mt-4 pt-6 border-t border-slate-100 text-left">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
            Planned Technical Capabilities
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {details.map((item, idx) => (
              <div key={idx} className="p-2.5 rounded bg-slate-50 border border-slate-100">
                <span className="font-medium text-slate-800 block mb-0.5">{item.label}</span>
                <span className="text-slate-500">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

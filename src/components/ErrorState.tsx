import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface ErrorStateProps {
  title: string;
  message: string;
  action?: React.ReactNode;
}

export const ErrorState: React.FC<ErrorStateProps> = ({ title, message, action }) => (
  <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-900">
    <div className="flex items-start gap-3">
      <div className="mt-0.5 rounded-full bg-white p-1.5 text-rose-600">
        <AlertTriangle className="h-4 w-4" />
      </div>
      <div className="flex-1">
        <div className="text-sm font-semibold">{title}</div>
        <p className="mt-1 text-sm text-rose-800/80">{message}</p>
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  </div>
);

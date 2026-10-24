import React from 'react';
import { 
  LayoutDashboard, 
  Receipt, 
  Flame, 
  Activity, 
  GitFork, 
  Settings as SettingsIcon,
  ShieldCheck
} from 'lucide-react';
import { NavigationTab } from '../types';

interface SidebarProps {
  currentTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
}

interface NavItem {
  id: NavigationTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  phaseTag: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, phaseTag: 'Phase 1' },
  { id: 'transactions', label: 'Transactions', icon: Receipt, phaseTag: 'Phase 2' },
  { id: 'chaos-lab', label: 'Chaos Lab', icon: Flame, phaseTag: 'Phase 5' },
  { id: 'monitoring', label: 'Monitoring', icon: Activity, phaseTag: 'Phase 6' },
  { id: 'processor-routing', label: 'Processor Routing', icon: GitFork, phaseTag: 'Phase 7' },
  { id: 'settings', label: 'Settings', icon: SettingsIcon, phaseTag: 'Phase 1' },
];

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, onSelectTab }) => {
  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col shrink-0 border-r border-slate-800">
      {/* Brand Header */}
      <div className="h-16 px-6 flex items-center gap-3 border-b border-slate-800/80">
        <div className="w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div>
          <span className="text-base font-semibold tracking-tight text-white block">
            PaySure
          </span>
          <span className="text-xs text-slate-400 block -mt-0.5">
            Reliability Platform
          </span>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <div className="px-3 pb-2 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
          Navigation
        </div>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-md transition-colors text-left ${
                isActive
                  ? 'bg-slate-800 text-white font-semibold shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-teal-400' : 'text-slate-400'}`} />
                <span className="truncate">{item.label}</span>
              </div>
              <span className="text-[10px] font-mono text-slate-400 shrink-0">
                {item.phaseTag}
              </span>
            </button>
          );
        })}
      </nav>

      {/* System Phase Footer */}
      <div className="p-4 border-t border-slate-800/80 bg-slate-950/40">
        <div className="text-xs text-slate-400 space-y-1">
          <div className="flex items-center justify-between text-slate-300 font-medium">
            <span>Platform State</span>
            <span className="text-[11px] text-teal-400 font-mono">Phase 1</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Architecture, database models, and state machine initialized.
          </p>
        </div>
      </div>
    </aside>
  );
};

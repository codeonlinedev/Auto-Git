import React from 'react';
import { LayoutDashboard, MessageCircle, Bell, Settings } from 'lucide-react';
interface BottomNavigationProps {
  activeTab: 'dashboard' | 'chat' | 'notification' | 'settings';
  onTabChange: (tab: 'dashboard' | 'chat' | 'notification' | 'settings') => void;
}

const BottomNavigation: React.FC<BottomNavigationProps> = ({ activeTab, onTabChange }) => {
  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[420px] font-vscode bg-[var(--vscode-sideBar-background)] border-t border-solid border-[var(--vscode-panel-border)] flex items-center justify-around px-2 py-2.5 z-50">

      {/* Tab Dashboard */}
      <button
        onClick={() => onTabChange('dashboard')}
        className={`cursor-pointer flex-1 flex flex-col items-center gap-1 pt-1 pb-0.5 transition-colors border-b-2 border-solid ${activeTab === 'dashboard'
          ? 'border-[var(--vscode-focusBorder)] text-vscode-fg'
          : 'border-transparent text-vscode-desc hover:text-vscode-fg'
          }`}
      >
        <LayoutDashboard className="w-6 h-6" strokeWidth={2} />
        <span className="text-[10px] font-bold uppercase tracking-wider">Dashboard</span>
      </button>

      {/* Tab Chat */}
      <button
        onClick={() => onTabChange('chat')}
        className={`cursor-pointer flex-1 flex flex-col items-center gap-1 pt-1 pb-0.5 transition-colors border-b-2 border-solid ${activeTab === 'chat'
          ? 'border-[var(--vscode-focusBorder)] text-vscode-fg'
          : 'border-transparent text-vscode-desc hover:text-vscode-fg'
          }`}
      >
        <MessageCircle className="w-6 h-6" strokeWidth={2} />
        <span className="text-[10px] font-bold uppercase tracking-wider">Chat</span>
      </button>

      {/* Tab Notification */}
      <button
        onClick={() => onTabChange('notification')}
        className={`cursor-pointer flex-1 flex flex-col items-center gap-1 pt-1 pb-0.5 transition-colors border-b-2 border-solid ${activeTab === 'notification'
          ? 'border-[var(--vscode-focusBorder)] text-vscode-fg'
          : 'border-transparent text-vscode-desc hover:text-vscode-fg'
          }`}
      >
        <div className="relative">
          <Bell className="w-6 h-6" strokeWidth={2} />
          {/* Chấm tròn thông báo chưa đọc - Dùng màu Badge chuẩn của VS Code */}
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[var(--vscode-activityBarBadge-background)]"></span>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-wider">Notif</span>
      </button>

      {/* Tab Settings */}
      <button
        onClick={() => onTabChange('settings')}
        className={`cursor-pointer flex-1 flex flex-col items-center gap-1 pt-1 pb-0.5 transition-colors border-b-2 border-solid ${activeTab === 'settings'
          ? 'border-[var(--vscode-focusBorder)] text-vscode-fg'
          : 'border-transparent text-vscode-desc hover:text-vscode-fg'
          }`}
      >
        <Settings className="w-6 h-6" strokeWidth={2} />
        <span className="text-[10px] font-bold uppercase tracking-wider">Settings</span>
      </button>

    </nav>
  );
};

export default BottomNavigation;

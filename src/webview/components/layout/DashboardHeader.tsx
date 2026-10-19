import React from 'react';
import uetLogo from '../../assets/uet.jpg';

interface DashboardHeaderProps {
  vscode: any;
  user: any;
  fallbackName: string;
  className?: string;
}

const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  vscode,
  user,
  fallbackName,
  className = ''
}) => {
  return (
    <header className={`flex items-center justify-between px-4 py-4 border-b border-solid border-[var(--vscode-panel-border)] bg-[var(--vscode-sideBar-background)] sticky top-0 z-50 ${className}`}>
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 flex items-center justify-center rounded-sm bg-white p-[2px]">
          <img src={uetLogo} alt="UET Logo" className="w-full h-full object-contain rounded-sm" />
        </div>
        <h1 className="text-lg font-bold tracking-tight text-vscode-fg">CodingRooms</h1>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-vscode-fg">{user?.name || fallbackName}</span>
        <div className="w-px h-4 bg-[var(--vscode-panel-border)]"></div>
        <button
          onClick={() => vscode.postMessage({ type: 'logout' })}
          className="cursor-pointer flex items-center justify-center p-1.5 rounded-sm text-vscode-desc hover:text-[var(--vscode-errorForeground)] hover:bg-vscode-hoverBg transition-colors"
          title="Đăng xuất"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </button>
      </div>
    </header>
  );
};

export default DashboardHeader;

import React, { useEffect, useState } from 'react';
import DashboardHeader from '../layout/DashboardHeader';

interface TeacherFormProps {
  vscode: any;
  user?: any;
  onClose?: () => void;
}

const TeacherForm: React.FC<TeacherFormProps> = ({ vscode, user, onClose }) => {
  const [className, setClassName] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.command === 'createClassSuccess') {
        setMessage(`Lớp học đã được tạo! Mã lớp: ${msg.data.classCode}`);
        setClassName('');
        if (onClose) {
          onClose();
        }
      } else if (msg.command === 'createClassError') {
        setMessage(`Lỗi: ${msg.error}`);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onClose]);

  const handleCreateClass = () => {
    if (!className) {
      setMessage('Vui lòng nhập tên lớp học');
      return;
    }
    vscode.postMessage({ type: 'createClass', className });
    setMessage('Đang tạo lớp học...');
  };

  const handleCancel = () => {
    if (onClose) {
      onClose();
    }
  };

  return (
    <div className="font-vscode bg-vscode-bg text-vscode-fg min-h-screen flex justify-center">
      <div className="flex flex-col min-h-screen max-w-[500px] w-full">
        <DashboardHeader vscode={vscode} user={user} fallbackName="Giáo viên" />

        <main className="flex flex-1 flex-col px-6 pt-8 pb-10">
          <div className="w-full flex flex-col gap-6">
            <div>
              <h1 className="text-vscode-fg text-[22px] font-normal leading-tight mb-1.5">
                Tạo lớp học mới
              </h1>
              <p className="text-vscode-desc text-[13px] leading-relaxed">
                Tạo một không gian (workspace) để tổ chức quản lý bài tập của sinh viên.
              </p>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-vscode-fg text-[13px] font-medium">Tên lớp học</label>
                <input
                  className="flex w-full rounded-sm border border-solid border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] outline-none focus:outline focus:outline-1 focus:-outline-offset-1 focus:border-[var(--vscode-focusBorder)] focus:outline-[var(--vscode-focusBorder)] h-7 px-2.5 text-[13px] transition-all placeholder:text-[var(--vscode-input-placeholderForeground)]"
                  placeholder="Ví dụ: Lập trình Web - K66"
                  type="text"
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') handleCreateClass();
                  }}
                  autoFocus
                />
              </div>

              {message && (
                <div className="px-3 py-2 rounded-sm bg-[var(--vscode-textBlockQuote-background)] border border-solid border-[var(--vscode-panel-border)] flex items-start gap-2">
                  <svg className="w-4 h-4 text-vscode-link shrink-0 mt-[1px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-[12px] text-vscode-fg leading-relaxed font-medium">{message}</p>
                </div>
              )}

              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={handleCreateClass}
                  className="cursor-pointer flex items-center justify-center rounded-sm h-7 px-4 bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] text-[13px] font-medium hover:bg-[var(--vscode-button-hoverBackground)] transition-colors active:scale-[0.98]"
                >
                  Tạo lớp học
                </button>
                <button
                  onClick={handleCancel}
                  className="cursor-pointer flex items-center justify-center rounded-sm h-7 px-4 border border-solid border-[var(--vscode-button-secondaryBackground)] bg-transparent text-vscode-fg text-[13px] font-medium hover:bg-vscode-hoverBg transition-colors"
                >
                  Hủy
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default TeacherForm;

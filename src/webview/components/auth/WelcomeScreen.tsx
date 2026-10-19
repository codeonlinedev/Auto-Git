import React from 'react';
import uetLogo from '../../assets/uet.jpg';

interface WelcomeScreenProps {
  onSelectRole: (role: 'student' | 'teacher') => void;
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onSelectRole }) => {
  return (
    // Áp dụng font-vscode, màu nền và màu chữ gốc cho toàn bộ màn hình
    <div className="flex flex-col min-h-screen max-w-[420px] mx-auto px-6 py-8 font-vscode bg-vscode-bg text-vscode-fg">

      {/* Branding */}
      <section className="flex flex-col items-center text-center gap-6 mt-4 mb-8">
        <div className="flex items-center gap-2">
          {/* Logo */}
          <div className="w-8 h-8 flex items-center justify-center rounded-sm bg-white p-[2px]">
            <img src={uetLogo} alt="UET Logo" className="w-full h-full object-contain rounded-sm" />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-vscode-fg">CodingRooms</h2>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-vscode-fg">
          Chào mừng đến với CodingRooms
        </h1>
        <p className="text-sm font-medium text-vscode-desc">
          Bắt đầu bằng cách chọn vai trò của bạn
        </p>
      </section>

      {/* Main Content */}
      <main className="flex flex-col gap-4 w-full">

        {/* Teacher Card */}
        <button
          onClick={() => onSelectRole('teacher')}
          className="cursor-pointer flex items-center gap-4 w-full p-5 rounded-lg border border-solid border-[var(--vscode-panel-border)] bg-vscode-bg text-left group transition-all hover:![border-color:var(--vscode-focusBorder)] hover:bg-vscode-hoverBg active:scale-[0.98]"        >
          {/* Icon Box */}
          <div className="flex items-center justify-center w-12 h-12 rounded-lg shrink-0 transition-colors bg-vscode-iconBg text-vscode-link group-hover:bg-vscode-activeBg group-hover:text-vscode-activeFg">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <h3 className="text-base font-bold text-vscode-fg">Teacher</h3>
            <p className="text-sm leading-normal text-vscode-desc">
              Quản lý học viên và xây dựng lộ trình học tập tương tác
            </p>
          </div>
          {/* Chevron mũi tên */}
          <svg className="w-5 h-5 shrink-0 transition-colors text-vscode-desc group-hover:text-vscode-link" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* Student Card */}
        <button
          onClick={() => onSelectRole('student')}
          className="cursor-pointer flex items-center gap-4 w-full p-5 rounded-lg border border-solid border-[var(--vscode-panel-border)] bg-vscode-bg text-left group transition-all hover:![border-color:var(--vscode-focusBorder)] hover:bg-vscode-hoverBg active:scale-[0.98]"        >
          {/* Icon Box */}
          <div className="flex items-center justify-center w-12 h-12 rounded-lg shrink-0 transition-colors bg-vscode-iconBg text-vscode-link group-hover:bg-vscode-activeBg group-hover:text-vscode-activeFg">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <h3 className="text-base font-bold text-vscode-fg">Student</h3>
            <p className="text-sm leading-normal text-vscode-desc">
              Tham gia lớp học và chinh phục các thử thách lập trình
            </p>
          </div>
          {/* Chevron mũi tên */}
          <svg className="w-5 h-5 shrink-0 transition-colors text-vscode-desc group-hover:text-vscode-link" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </main>

      {/* Footer */}
      <footer className="mt-auto pt-8 w-full">
        <p className="text-center text-xs leading-relaxed text-vscode-desc">
          Bằng việc tiếp tục, bạn đồng ý với{' '}
          <a className="font-medium cursor-pointer text-vscode-link hover:underline">Điều khoản dịch vụ</a>
          {' '}and{' '}
          <a className="font-medium cursor-pointer text-vscode-link hover:underline">Chính sách bảo mật</a>
        </p>
        <div className="mt-4 text-center text-[10px] text-vscode-desc">
          © 2026 CodingRooms.
        </div>
      </footer>

    </div>
  );
};

export default WelcomeScreen;

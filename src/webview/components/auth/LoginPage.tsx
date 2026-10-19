import React, { useState } from 'react';
import uetLogo from '../../assets/uet.jpg';

interface LoginPageProps {
  vscode: any;
  role: 'TEACHER' | 'STUDENT';
  onBack: () => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ vscode, role, onBack }) => {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [message, setMessage] = useState('');

  const handleRequestOtp = () => {
    if (!email) {
      setMessage('Vui lòng nhập email');
      return;
    }
    vscode.postMessage({ type: 'requestOtp', email });
    setIsOtpSent(true);
    setMessage('OTP đã được gửi đến email của bạn');
  };

  const handleVerifyOtp = () => {
    if (!otp) {
      setMessage('Vui lòng nhập mã OTP');
      return;
    }
    vscode.postMessage({ type: 'verifyOtp', email, otp, role });
  };

  const handleGoogleLogin = () => {
    vscode.postMessage({ type: 'googleLogin', role });
  };

  const roleText = role === 'TEACHER' ? 'Giáo viên' : 'Sinh viên';

  return (
    // Áp dụng font-vscode, nền và chữ chuẩn
    <div className="flex flex-col min-h-screen max-w-[420px] mx-auto px-6 py-8 font-vscode bg-vscode-bg text-vscode-fg">

      {/* Logo Section */}
      <div className="flex flex-col items-center gap-6 mt-4 mb-6 w-full">
        {/* Nút Back */}
        <button
          onClick={onBack}
          className="cursor-pointer self-start text-vscode-desc hover:text-vscode-fg transition-colors text-sm font-medium flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Quay lại
        </button>

        <div className="flex items-center gap-2">
          {/* Logo Icon */}
          <div className="w-8 h-8 flex items-center justify-center rounded-sm bg-white p-[2px]">
            <img src={uetLogo} alt="UET Logo" className="w-full h-full object-contain rounded-sm" />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-vscode-fg">CodingRooms</h2>
        </div>
        <h1 className="text-xl font-bold tracking-tight text-center text-vscode-fg">
          Đăng nhập với tư cách <span className="text-vscode-link">{roleText}</span>
        </h1>
      </div>

      {/* Login Form Container */}
      <div className="w-full space-y-4 mt-8">

        {/* Email Input */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium leading-none text-vscode-fg">Email</label>
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isOtpSent}
            // Input chuẩn VS Code: Nền gốc, viền mỏng, khi focus đổi viền xanh
            className="flex w-full rounded-md border border-solid border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] px-3 py-2.5 text-sm text-[var(--vscode-input-foreground)] outline-none focus:border-[var(--vscode-focusBorder)] transition-colors placeholder:text-[var(--vscode-input-placeholderForeground)] disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>

        {!isOtpSent ? (
          <button
            onClick={handleRequestOtp}
            // Primary Button chuẩn VS Code
            className="cursor-pointer flex w-full items-center justify-center rounded-md bg-[var(--vscode-button-background)] py-2.5 text-sm font-medium text-[var(--vscode-button-foreground)] transition-colors hover:bg-[var(--vscode-button-hoverBackground)] active:scale-[0.98]"
          >
            Gửi mã OTP
          </button>
        ) : (
          <>
            {/* OTP Input */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium leading-none text-vscode-fg">Mã OTP</label>
              <input
                type="text"
                placeholder="Nhập mã OTP từ email"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') handleVerifyOtp();
                }}
                className="flex w-full rounded-md border border-solid border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] px-3 py-2.5 text-sm text-[var(--vscode-input-foreground)] outline-none focus:border-[var(--vscode-focusBorder)] transition-colors placeholder:text-[var(--vscode-input-placeholderForeground)]"
              />
            </div>

            <button
              onClick={handleVerifyOtp}
              // Primary Button
              className="cursor-pointer flex w-full items-center justify-center rounded-md bg-[var(--vscode-button-background)] py-2.5 text-sm font-medium text-[var(--vscode-button-foreground)] transition-colors hover:bg-[var(--vscode-button-hoverBackground)] active:scale-[0.98]"
            >
              Xác nhận
            </button>

            <button
              onClick={() => {
                setIsOtpSent(false);
                setOtp('');
                setMessage('');
              }}
              // Secondary Button (viền mảnh, nền trong suốt)
              className="cursor-pointer flex w-full items-center justify-center rounded-md border border-solid border-[var(--vscode-button-secondaryBackground)] bg-transparent py-2 text-sm font-medium text-vscode-fg transition-colors hover:bg-vscode-hoverBg active:scale-[0.98]"
            >
              Gửi lại mã
            </button>
          </>
        )}

        {/* Divider */}
        <div className="relative py-4">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-[var(--vscode-panel-border)]"></span>
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            {/* Dùng màu nền gốc để cắt ngang đường kẻ */}
            <span className="bg-vscode-bg px-2 text-vscode-desc font-bold">HOẶC</span>
          </div>
        </div>

        {/* Google Login */}
        <button
          onClick={handleGoogleLogin}
          // Secondary/Outline Button
          className="cursor-pointer flex w-full items-center justify-center gap-3 rounded-md border border-solid border-[var(--vscode-panel-border)] bg-vscode-bg py-2.5 text-sm font-medium text-vscode-fg transition-colors hover:bg-vscode-hoverBg hover:![border-color:var(--vscode-focusBorder)] active:scale-[0.98]"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          Đăng nhập với Google
        </button>

        {/* Message */}
        {message && (
          // Thông báo lỗi/thành công: Dùng nền của BlockQuote để trông giống một notification
          <div className="mt-4 p-4 rounded-md bg-vscode-iconBg border border-solid border-[var(--vscode-panel-border)]">
            <p className="text-sm text-vscode-fg text-center font-medium">{message}</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="mt-auto w-full pt-8 pb-4">
        <p className="text-center text-xs leading-relaxed text-vscode-desc">
          Bằng việc tiếp tục, bạn đồng ý với{' '}
          <a className="font-medium cursor-pointer text-vscode-link hover:underline">Điều khoản dịch vụ</a>
          {' '}và{' '}
          <a className="font-medium cursor-pointer text-vscode-link hover:underline">Chính sách bảo mật</a> của chúng tôi.
        </p>
      </footer>

    </div>
  );
};

export default LoginPage;

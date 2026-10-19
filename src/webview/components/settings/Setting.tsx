import React, { useEffect, useState } from 'react';

interface SettingsProps {
    vscode: any;
    user: any;
    baseDirectory?: string;
}

const Settings: React.FC<SettingsProps> = ({ vscode, user }) => {
    const [baseDirectory, setBaseDirectory] = useState<string>('');

    useEffect(() => {
        vscode.postMessage({ type: 'loadSetting', userId: user.userId });

        const handleMessage = (event: MessageEvent) => {
            const message = event.data;
            if (message.type === 'settingLoaded' && message.baseDirectory) {
                setBaseDirectory(message.baseDirectory);
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [vscode]);

    return (
        <main className="flex-1 flex flex-col px-6 pt-12 pb-24 gap-12 overflow-y-auto bg-vscode-bg">
            {/* Profile Header */}
            <section className="flex flex-col items-center text-center space-y-6">
                <div className="relative">
                    <div className="w-32 h-32 rounded-full ring-2 ring-[var(--vscode-panel-border)]">
                        <img
                            alt="User Avatar"
                            className="w-full h-full rounded-full object-cover"
                            src={user?.profilePicture || `https://ui-avatars.com/api/?name=${user?.name || 'S'}&background=random`}
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <h2 className="text-3xl font-bold tracking-tight text-vscode-fg">
                        {user?.name || 'Người dùng'}
                    </h2>
                    <p className="text-base text-vscode-desc font-medium">
                        {user?.email || 'user@hust.edu.vn'}
                    </p>
                    <div className="pt-2">
                        <div className="inline-flex items-center gap-1.5 bg-vscode-activeBg text-vscode-activeFg px-4 py-1.5 rounded-full">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
                            </svg>
                            <span className="text-[11px] font-bold uppercase tracking-wider">
                                {user?.role === 'TEACHER' ? 'Giảng viên' : 'Sinh viên'}
                            </span>
                        </div>
                    </div>
                </div>
            </section>

            {/* Storage Directory Section */}
            <section className="space-y-4">
                <h3 className="text-sm font-bold text-vscode-fg px-1">
                    Thư mục lưu trữ
                </h3>

                <div className="space-y-4">
                    <div className="bg-vscode-iconBg border border-solid border-[var(--vscode-panel-border)] rounded-2xl px-5 py-4 flex items-center shadow-[0_8px_30px_rgba(0,0,0,0.2)]">
                        <p className="text-sm text-vscode-fg break-all font-medium">
                            {baseDirectory || 'Đang tải cấu hình...'}
                        </p>
                    </div>

                    <p className="text-[11px] text-vscode-desc leading-relaxed italic text-center px-1">
                        Toàn bộ mã nguồn bài tập và dữ liệu cục bộ đang được lưu trữ an toàn tại thư mục này.
                    </p>
                </div>
            </section>
        </main>
    );
};

export default Settings;

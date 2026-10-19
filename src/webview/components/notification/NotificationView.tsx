import React, { useEffect, useMemo, useState } from 'react';

interface NotificationViewProps {
  vscode: any;
  onNotificationAction?: (notification: NotificationItem) => void;
}

interface NotificationItem {
  id: number;
  rawType: string;
  title: string;
  subtitle?: string;
  time: string;
  type: 'class' | 'student' | 'instructor';
  roleLabel?: string;
  preview?: string;
  unread?: boolean;
  initials: string;
  assignmentCode?: string;
  classCode?: string;
  targetBranch?: string;
  studentFilePath?: string;
}

interface IncomingNotification {
  id?: number;
  type?: string;
  title?: string;
  message?: string;
  createdAt?: string;
  isRead?: boolean;
  score?: number;
  assignmentCode?: string;
  classCode?: string;
  targetBranch?: string;
  studentFilePath?: string;
}

const getInitials = (text: string) => {
  const words = text.trim().split(/\s+/);
  if (words.length >= 2) return `${words[0][0]}${words[1][0]}`.toUpperCase();
  return text.slice(0, 2).toUpperCase();
};

const formatTime = (iso?: string) => {
  if (!iso) return 'Now';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Now';
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  if (days === 1) return 'Yesterday';
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
};

const mapIncomingToItem = (incoming: IncomingNotification): NotificationItem => {
  const type = incoming.type || 'INFO';
  const title = incoming.title || '';
  const message = incoming.message || 'Bạn có thông báo mới';
  const isRead = incoming.isRead ?? false;
  const createdAt = incoming.createdAt;

  if (type === 'SUBMIT') {
    return {
      id: incoming.id || Date.now(),
      rawType: type,
      title: title || 'Bài nộp mới',
      subtitle: 'Thông báo cho giáo viên',
      preview: message,
      time: formatTime(createdAt),
      type: 'student',
      roleLabel: 'Student',
      unread: !isRead,
      initials: 'SV',
      assignmentCode: incoming.assignmentCode,
      classCode: incoming.classCode,
      targetBranch: incoming.targetBranch,
      studentFilePath: incoming.studentFilePath
    };
  }

  if (type === 'GRADED') {
    return {
      id: incoming.id || Date.now(),
      rawType: type,
      title: title || 'Đã chấm điểm',
      subtitle: 'Thông báo cho sinh viên',
      preview: message,
      time: formatTime(createdAt),
      type: 'instructor',
      roleLabel: 'Instructor',
      unread: !isRead,
      initials: 'GV',
      assignmentCode: incoming.assignmentCode,
      classCode: incoming.classCode,
      targetBranch: incoming.targetBranch,
      studentFilePath: incoming.studentFilePath
    };
  }

  if (type === 'COMMENT') {
    return {
      id: incoming.id || Date.now(),
      rawType: type,
      title: title || 'Nhận xét mới từ giáo viên',
      subtitle: 'Thông báo cho sinh viên',
      preview: message,
      time: formatTime(createdAt),
      type: 'instructor',
      roleLabel: 'Instructor',
      unread: !isRead,
      initials: 'GV',
      assignmentCode: incoming.assignmentCode,
      classCode: incoming.classCode,
      targetBranch: incoming.targetBranch,
      studentFilePath: incoming.studentFilePath
    };
  }

  return {
    id: incoming.id || Date.now(),
    rawType: type,
    title: title || 'Thông báo mới',
    preview: message,
    time: formatTime(createdAt),
    type: 'class',
    unread: !isRead,
    initials: getInitials('TB'),
    assignmentCode: incoming.assignmentCode,
    classCode: incoming.classCode,
    targetBranch: incoming.targetBranch,
    studentFilePath: incoming.studentFilePath
  };
};

const NotificationView: React.FC<NotificationViewProps> = ({ vscode, onNotificationAction }) => {
  const [search, setSearch] = useState('');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  useEffect(() => {
    vscode.postMessage({ type: 'getNotifications' });

    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (data?.type === 'notificationsLoaded' && Array.isArray(data.notifications)) {
        const loaded = data.notifications.map((item: IncomingNotification) => mapIncomingToItem(item));
        setNotifications(loaded);
      } else if (data?.type === 'websocketNotification' && data.notification) {
        const item = mapIncomingToItem(data.notification as IncomingNotification);
        setNotifications(prev => [item, ...prev.filter(p => p.id !== item.id)].slice(0, 100));
      } else if (data?.type === 'notificationMarkedAsRead' && data.notificationId) {
        setNotifications(prev => prev.map(item =>
          item.id === data.notificationId ? { ...item, unread: false } : item
        ));
      } else if (data?.type === 'allNotificationsMarkedAsRead') {
        setNotifications(prev => prev.map(item => ({ ...item, unread: false })));
      } else if (data?.type === 'notificationDeleted' && data.notificationId) {
        setNotifications(prev => prev.filter(item => item.id !== data.notificationId));
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [vscode]);

  const filteredNotifications = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return notifications;
    return notifications.filter((item) =>
      item.title.toLowerCase().includes(keyword) ||
      (item.preview || '').toLowerCase().includes(keyword) ||
      (item.subtitle || '').toLowerCase().includes(keyword) ||
      (item.roleLabel || '').toLowerCase().includes(keyword)
    );
  }, [search, notifications]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-vscode-bg">
      {/* Search Section */}
      <div className="px-4 py-4">
        <div className="relative flex items-center">
          <svg className="absolute left-3 w-[18px] h-[18px] text-vscode-desc" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            className="w-full bg-vscode-iconBg border-none rounded-full py-2.5 pl-10 pr-4 text-sm font-medium focus:ring-1 focus:ring-vscode-focus text-vscode-fg placeholder:text-vscode-desc outline-none transition-all"
            placeholder="Search notifications..."
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              className="absolute right-3 text-vscode-desc hover:text-vscode-fg transition-colors"
              onClick={() => setSearch('')}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Main List Section */}
      <main className="w-full flex-grow flex flex-col pb-28 overflow-y-auto custom-scrollbar">
        {filteredNotifications.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-6 py-12">
            <p className="text-vscode-desc text-sm font-medium">
              {search.trim() ? 'Không tìm thấy thông báo' : 'Không có thông báo nào'}
            </p>
          </div>
        ) : (
          <div className="flex-grow">
            {/* Header Title */}
            <div className="px-4 py-2 bg-vscode-iconBg flex items-center justify-between">
              <h2 className="font-bold text-[10px] tracking-widest uppercase text-vscode-desc">
                Tất cả thông báo
              </h2>
              {notifications.some(n => n.unread) && (
                <button
                  onClick={() => vscode.postMessage({ type: 'markAllNotificationsAsRead' })}
                  className="text-[10px] font-bold text-vscode-fg hover:text-vscode-desc uppercase tracking-tight transition-colors"
                >
                  Đánh dấu đã đọc
                </button>
              )}
            </div>

            {/* List */}
            <div className="divide-y divide-[var(--vscode-widget-border)]">
              {filteredNotifications.map((item) => (
                <div
                  key={item.id}
                  className="group flex items-center justify-between px-4 py-4 hover:bg-vscode-hoverBg transition-colors active:scale-[0.98] cursor-pointer"
                  onClick={() => {
                    if (item.unread) {
                      vscode.postMessage({ type: 'markNotificationAsRead', notificationId: item.id });
                    }
                    if (!onNotificationAction && item.rawType === 'COMMENT' && item.assignmentCode && item.studentFilePath) {
                      vscode.postMessage({
                        type: 'openCommentedFileFromNotification',
                        assignmentCode: item.assignmentCode,
                        studentFilePath: item.studentFilePath
                      });
                    }
                    onNotificationAction?.(item);
                  }}
                >
                  <div className="flex items-center gap-4 min-w-0">
                    {/* Avatar */}
                    <div className="w-12 h-12 bg-vscode-activeBg flex items-center justify-center rounded-full shrink-0">
                      <span className="font-extrabold text-vscode-activeFg text-xs uppercase tracking-tighter">
                        {item.initials}
                      </span>
                    </div>

                    {/* Content */}
                    <div className="flex flex-col min-w-0 pr-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-vscode-fg tracking-tight truncate">
                          {item.title}
                        </span>
                        {item.roleLabel && (
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-tighter ${item.type === 'instructor'
                                ? 'bg-vscode-activeBg text-vscode-activeFg'
                                : 'bg-vscode-iconBg text-vscode-desc'
                              }`}
                          >
                            {item.roleLabel}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-col mt-0.5">
                        {item.subtitle && (
                          <span className="text-[12px] text-vscode-desc truncate font-medium">
                            {item.subtitle}
                          </span>
                        )}
                        {item.preview && (
                          <span className="text-[12px] text-vscode-desc truncate opacity-75">
                            {item.preview}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: time + delete + unread dot */}
                  <div className="flex flex-col items-end justify-between h-full shrink-0 gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[10px] tracking-tight text-vscode-desc uppercase">
                        {item.time}
                      </span>
                      {/* Delete button — visible on hover */}
                      <button
                        className="p-1 rounded text-vscode-desc hover:text-[var(--vscode-errorForeground)] transition-colors opacity-0 group-hover:opacity-100"
                        title="Xóa thông báo"
                        onClick={(e) => {
                          e.stopPropagation();
                          vscode.postMessage({ type: 'deleteNotification', notificationId: item.id });
                        }}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>

                    {/* Unread dot */}
                    {item.unread && (
                      <div className="w-2 h-2 bg-vscode-link rounded-full mt-auto mb-1" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default NotificationView;

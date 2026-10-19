import React, { useState, useEffect } from 'react';
import StudentForm from './StudentForm';
import AssignmentList from '../assignment/AssignmentList';
import BottomNavigation from '../layout/BottomNavigation';
import NotificationView from '../notification/NotificationView';
import Settings from '../settings/Setting';
import ChatView from '../chat/ChatView';
import ChatWindow from '../chat/ChatWindow';
import DashboardHeader from '../layout/DashboardHeader';
import { useDashboardChat } from '../chat/useDashboardChat';

interface StudentDashboardProps {
  vscode: any;
  user: any;
  apiService: any;
}

interface ClassItem {
  classId: string;
  className: string;
  classCode: string;
  assignmentCount?: number;
}

interface NotificationActionItem {
  id: number;
  rawType: string;
  assignmentCode?: string;
  classCode?: string;
  studentFilePath?: string;
}

interface AssignmentItem {
  assignmentId: string;
  assignmentCode: string;
  title: string;
  description: string;
  repoUrl: string;
  deadline: string;
  studentCount: number;
  createdAt: string;
  joined?: boolean;
  commitCount?: number;
  lastCommitAt?: string;
  localPath?: string;
  className?: string;
  classCode?: string;
}

const StudentDashboard: React.FC<StudentDashboardProps> = ({ vscode, user, apiService }) => {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [showJoinForm, setShowJoinForm] = useState(false);
  const [selectedClass, setSelectedClass] = useState<ClassItem | null>(null);
  const [viewAssignments, setViewAssignments] = useState(false);
  const [currentAssignmentCode, setCurrentAssignmentCode] = useState<string | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'chat' | 'notification' | 'settings'>('dashboard');
  const [isViewingAssignmentDetail, setIsViewingAssignmentDetail] = useState(false);
  const [notificationTargetAssignmentCode, setNotificationTargetAssignmentCode] = useState<string | undefined>(undefined);
  const [notificationTargetAssignmentData, setNotificationTargetAssignmentData] = useState<AssignmentItem | undefined>(undefined);
  const { chatOpen, chatConfig, openChat: handleOpenChat, closeChat } = useDashboardChat();
  const isChatDetailOpen = activeTab === 'chat' && chatOpen && !!chatConfig;

  const handleTabChange = (tab: 'dashboard' | 'chat' | 'notification' | 'settings') => {
    setActiveTab(tab);
    if (tab !== 'dashboard') {
      setSelectedClass(null);
      setViewAssignments(false);
    }
    if (tab !== 'chat') {
      closeChat();
    }
  };

  const handleNotificationAction = async (notification: NotificationActionItem) => {
    if (notification.rawType === 'GRADED' && notification.assignmentCode && notification.classCode) {
      const targetClass = classes.find((c) => c.classCode === notification.classCode);
      if (!targetClass) {
        return;
      }

      let preloadedAssignment: AssignmentItem | undefined;
      try {
        const assignments = await apiService.getAssignments(notification.classCode);
        const found = (assignments || []).find((a: AssignmentItem) => a.assignmentCode === notification.assignmentCode);
        if (found) {
          preloadedAssignment = {
            ...found,
            className: targetClass.className,
            classCode: targetClass.classCode
          };
        }
      } catch (error) {
        // Fallback to lazy open by assignment code below.
      }

      setActiveTab('dashboard');
      setSelectedClass(targetClass);
      setViewAssignments(true);
      setNotificationTargetAssignmentData(preloadedAssignment);
      setNotificationTargetAssignmentCode(notification.assignmentCode);
      return;
    }

    if (notification.rawType === 'COMMENT' && notification.assignmentCode && notification.studentFilePath) {
      vscode.postMessage({
        type: 'openCommentedFileFromNotification',
        assignmentCode: notification.assignmentCode,
        studentFilePath: notification.studentFilePath
      });
    }
  };

  useEffect(() => {
    // Request current workspace info from extension
    vscode.postMessage({ type: 'getCurrentWorkspace' });

    // Listen for messages from extension
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      switch (message.type) {
        case 'classesLoaded':
          setClasses(message.classes);
          break;
        case 'classJoined':
          vscode.postMessage({ type: 'loadMyClasses' });
          setShowJoinForm(false);
          break;
        case 'classLeft':
          vscode.postMessage({ type: 'loadMyClasses' });
          break;
        case 'currentWorkspaceInfo':
          if (message.assignmentCode) {
            setCurrentAssignmentCode(message.assignmentCode);
          }
          break;
      }
    };

    window.addEventListener('message', handleMessage);

    // Load classes on mount
    vscode.postMessage({ type: 'loadMyClasses' });

    return () => window.removeEventListener('message', handleMessage);
  }, [vscode]);

  const handleLeaveClass = (classItem: ClassItem) => {
    vscode.postMessage({
      type: 'leaveClass',
      classCode: classItem.classCode,
      className: classItem.className
    });
  };

  if (showJoinForm) {
    return (
      <div className="font-vscode bg-[var(--vscode-sideBar-background)] text-vscode-fg min-h-screen flex justify-center w-full">
        <div className="flex flex-col min-h-screen max-w-[420px] w-full mx-auto relative">
          <StudentForm
            vscode={vscode}
            user={user}
            onClose={() => {
              setShowJoinForm(false);
              vscode.postMessage({ type: 'loadMyClasses' });
            }}
          />
        </div>
      </div>
    );
  }

  if (selectedClass && viewAssignments) {
    return (
      <div className="font-vscode bg-[var(--vscode-sideBar-background)] text-vscode-fg min-h-screen flex justify-center w-full">
        <div className="flex flex-col min-h-screen max-w-[420px] w-full mx-auto relative">

          <DashboardHeader vscode={vscode} user={user} fallbackName="Sinh viên" />

          {/* Back Button and Class Info */}
          {!isViewingAssignmentDetail && (
            <>
              <div className="px-4 py-4">
                <button
                  onClick={() => {
                    setViewAssignments(false);
                    setSelectedClass(null);
                  }}
                  className="cursor-pointer flex items-center gap-2 text-vscode-desc hover:text-vscode-fg transition-colors text-sm font-medium outline-none focus:outline-none focus-visible:outline-none"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Quay lại
                </button>
              </div>

              <div className="px-4 py-5 border-b border-solid border-[var(--vscode-panel-border)]">
                <h2 className="text-2xl font-bold tracking-tight text-vscode-fg mb-1">{selectedClass.className}</h2>
                <p className="text-sm text-vscode-desc">Mã lớp: <strong className="font-mono font-bold text-vscode-fg">{selectedClass.classCode}</strong></p>
              </div>
            </>
          )}

          {/* Assignments */}
          <div className="flex-1 overflow-y-auto pb-24">
            <AssignmentList
              vscode={vscode}
              classCode={selectedClass.classCode}
              className={selectedClass.className}
              isTeacher={false}
              currentAssignmentCode={currentAssignmentCode}
              initialAssignmentCode={notificationTargetAssignmentCode}
              initialAssignmentData={notificationTargetAssignmentData}
              onInitialAssignmentHandled={() => {
                setNotificationTargetAssignmentCode(undefined);
                setNotificationTargetAssignmentData(undefined);
              }}
              onViewChange={(isDetailView) => setIsViewingAssignmentDetail(isDetailView)}
            />
          </div>

          {/* Bottom Navigation */}
          <BottomNavigation activeTab={activeTab} onTabChange={handleTabChange} />
        </div>
      </div>
    );
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'chat':
        return chatOpen && chatConfig ? (
          <ChatWindow
            vscode={vscode}
            currentUserId={Number(user?.userId ?? user?.id)}
            currentUserName={user.name}
            otherUserId={chatConfig.otherUserId}
            otherUserName={chatConfig.otherUserName}
            classroomId={chatConfig.classroomId}
            classroomName={chatConfig.classroomName}
            chatType={chatConfig.chatType}
            onClose={closeChat}
            fullScreen={true}
          />
        ) : (
          <ChatView
            vscode={vscode}
            onOpenChat={handleOpenChat}
          />
        );

      case 'notification':
        return (
          <NotificationView
            vscode={vscode}
            onNotificationAction={handleNotificationAction}
          />
        );

      case 'settings':
        return (
          <Settings
            vscode={vscode}
            user={user}
          />
        );

      case 'dashboard':
      default:
        return (
          <>
            {/* Page Heading */}
            <div className="pt-8 px-5 pb-5 border-b border-solid border-[var(--vscode-panel-border)]">
              <div className="flex flex-col gap-1">
                <h2 className="text-2xl font-black leading-tight tracking-tight text-vscode-fg">Dashboard</h2>
                <p className="text-vscode-desc text-[13px] font-medium">Tổng quan Sinh viên</p>
              </div>
            </div>

            {/* Main Content */}
            <main className="flex-1 flex flex-col gap-6 pb-24 overflow-y-auto">

              {/* Join Class Button */}
              <section className="px-5 pt-5">
                <button
                  onClick={() => setShowJoinForm(true)}
                  className="cursor-pointer w-full bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] h-9 rounded-sm font-medium text-[13px] flex items-center justify-center gap-2 hover:bg-[var(--vscode-button-hoverBackground)] transition-colors active:scale-[0.98]"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Tham gia lớp học
                </button>
              </section>

              {/* My Classes Section */}
              <section className="px-5">
                <div className="flex items-center justify-between pb-3">
                  <h3 className="text-[14px] font-bold leading-tight tracking-tight text-vscode-fg">
                    Lớp học của tôi ({classes?.length || 0})
                  </h3>
                </div>

                {!classes || classes.length === 0 ? (
                  <div className="text-center py-10 border border-dashed border-[var(--vscode-panel-border)] rounded-sm">
                    <p className="text-vscode-desc mb-4 text-[13px]">Bạn chưa tham gia lớp học nào</p>
                    <button
                      onClick={() => setShowJoinForm(true)}
                      className="cursor-pointer px-4 h-7 bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] rounded-sm font-medium text-[13px] hover:bg-[var(--vscode-button-hoverBackground)] transition-colors"
                    >
                      + Tham gia lớp đầu tiên
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3"> {/* Tăng khoảng cách giữa các thẻ */}
                    {classes.map((classItem: any) => (
                      <div
                        key={classItem.classId}
                        onClick={() => {
                          setSelectedClass(classItem);
                          setViewAssignments(true);
                        }}
                        // Cập nhật thẻ Class to và rộng rãi như Teacher Dashboard
                        className="group relative flex flex-col p-5 border border-solid border-[var(--vscode-panel-border)] bg-[var(--vscode-editorWidget-background)] rounded-md hover:border-[var(--vscode-focusBorder)] hover:bg-vscode-hoverBg transition-all cursor-pointer"
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleLeaveClass(classItem);
                          }}
                          className="absolute top-4 right-4 text-vscode-desc opacity-0 group-hover:opacity-100 hover:text-[var(--vscode-errorForeground)] transition-all p-1 rounded-sm hover:bg-vscode-bg"
                          title="Rời lớp"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                          </svg>
                        </button>

                        <div className="pr-8">
                          <span className="text-[10px] font-bold text-vscode-desc uppercase tracking-widest block mb-1">
                            {classItem.classCode}
                          </span>
                          <h3 className="text-base font-bold leading-tight mb-4 text-vscode-fg">{classItem.className}</h3>

                          <div className="flex items-center gap-6">
                            <div className="flex items-center gap-1.5 text-xs font-medium uppercase text-vscode-fg">
                              <svg className="w-[16px] h-[16px] text-vscode-desc" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              {classItem.assignmentCount || 0} BÀI TẬP
                            </div>
                            {/* Bỏ phần hiển thị studentCount vì đây là view của Sinh viên */}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </main>

            {/* Footer */}
            <footer className="p-4 border-t border-solid border-[var(--vscode-panel-border)] flex justify-center bg-transparent">
              <span className="text-[10px] text-vscode-desc font-medium uppercase tracking-widest">
                CodingRooms VS Code Extension v1.0
              </span>
            </footer>
          </>
        );
    }
  };

  return (
    <div className="font-vscode bg-[var(--vscode-sideBar-background)] text-vscode-fg min-h-screen flex justify-center w-full">
      <div className="flex flex-col min-h-screen max-w-[420px] w-full mx-auto relative">

        {/* Header - Dùng sideBar-background và z-50 để đặt ruột */}
        {!isChatDetailOpen && (
          <DashboardHeader vscode={vscode} user={user} fallbackName="Sinh viên" />
        )}

        {renderContent()}

        {/* Bottom Navigation */}
        {!isChatDetailOpen && (
          <BottomNavigation activeTab={activeTab} onTabChange={handleTabChange} />
        )}

      </div>
    </div>
  );
};

export default StudentDashboard;

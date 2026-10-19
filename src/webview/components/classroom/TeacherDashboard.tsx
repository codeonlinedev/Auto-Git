import React, { useState, useEffect } from 'react';
import TeacherForm from './TeacherForm';
import CreateAssignmentForm from '../assignment/CreateAssignmentForm';
import AssignmentList from '../assignment/AssignmentList';
import BottomNavigation from '../layout/BottomNavigation';
import ChatView from '../chat/ChatView';
import NotificationView from '../notification/NotificationView';
import ChatWindow from '../chat/ChatWindow';
import Setting from '../settings/Setting';
import DashboardHeader from '../layout/DashboardHeader';
import TeacherStudentsList from './TeacherStudentsList';
import { useDashboardChat } from '../chat/useDashboardChat';

interface TeacherDashboardProps {
  vscode: any;
  user: any;
}

interface ClassItem {
  classId: string;
  className: string;
  classCode: string;
  studentCount: number;
  assignmentCount?: number;
}

interface Student {
  studentId: string;
  studentName: string;
  branchName: string;
  commitCount: number;
  lastCommitAt: string | null;
  joinedAt: string;
}

const TeacherDashboard: React.FC<TeacherDashboardProps> = ({ vscode, user }) => {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClass, setSelectedClass] = useState<ClassItem | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showCreateAssignmentForm, setShowCreateAssignmentForm] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'chat' | 'notification' | 'settings'>('dashboard');
  const { chatOpen, chatConfig, openChat: handleOpenChat, closeChat } = useDashboardChat();
  const [isViewingAssignmentDetail, setIsViewingAssignmentDetail] = useState(false);
  const isChatDetailOpen = activeTab === 'chat' && chatOpen && !!chatConfig;

  useEffect(() => {
    // Listen for messages from extension
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      switch (message.type) {
        case 'classesLoaded':
          setClasses(message.classes);
          break;
        case 'studentsLoaded':
          setStudents(message.students);
          break;
        case 'classCreated':
          vscode.postMessage({ type: 'loadMyClasses' });
          setShowCreateForm(false);
          break;
        case 'assignmentCreated':
          // Reload assignments for current class
          if (selectedClass) {
            setSelectedClass({ ...selectedClass });
          }
          setShowCreateAssignmentForm(false);
          break;
        case 'classDeleted':
          vscode.postMessage({ type: 'loadMyClasses' });
          setSelectedClass(null);
          setStudents([]);
          break;
        case 'studentRemoved':
          setStudents((current) => current.filter((student) => student.studentId !== message.studentId));
          vscode.postMessage({ type: 'loadMyClasses' });
          if (message.classCode || selectedClass?.classCode) {
            vscode.postMessage({ type: 'loadStudents', classCode: message.classCode || selectedClass?.classCode });
          }
          break;
      }
    };

    window.addEventListener('message', handleMessage);

    // Load classes on mount
    vscode.postMessage({ type: 'loadMyClasses' });

    return () => window.removeEventListener('message', handleMessage);
  }, [vscode]);

  const handleViewStudents = (classItem: ClassItem) => {
    setSelectedClass(classItem);
    setShowCreateAssignmentForm(false);
    vscode.postMessage({ type: 'loadStudents', classCode: classItem.classCode });
  };

  const handleDeleteClass = (classItem: ClassItem) => {
    vscode.postMessage({
      type: 'deleteClass',
      classCode: classItem.classCode,
      className: classItem.className
    });
  };

  const handleRemoveStudent = (student: Pick<Student, 'studentId' | 'studentName'>) => {
    if (!selectedClass) {
      return;
    }

    vscode.postMessage({
      type: 'removeStudent',
      classCode: selectedClass.classCode,
      studentId: student.studentId,
      studentName: student.studentName
    });
  };

  const handleTabChange = (tab: 'dashboard' | 'chat' | 'notification' | 'settings') => {
    setActiveTab(tab);
    if (tab !== 'dashboard') {
      setSelectedClass(null);
      setShowCreateAssignmentForm(false);
    }
    if (tab === 'chat') {
      // Show chat view
      closeChat(); // Reset individual chat
    } else {
      closeChat();
    }
  };

  if (showCreateForm) {
    return (
      <div className="font-vscode bg-[var(--vscode-sideBar-background)] text-vscode-fg min-h-screen flex justify-center w-full">
        <div className="flex flex-col min-h-screen max-w-[420px] w-full mx-auto relative">
          <TeacherForm
            vscode={vscode}
            user={user}
            onClose={() => {
              setShowCreateForm(false);
              vscode.postMessage({ type: 'loadMyClasses' });
            }}
          />
        </div>
      </div>
    );
  }

  if (selectedClass && showCreateAssignmentForm) {
    return (
      <div className="font-vscode bg-[var(--vscode-sideBar-background)] text-vscode-fg min-h-screen flex justify-center w-full">
        <div className="flex flex-col min-h-screen max-w-[420px] w-full mx-auto relative">
          <CreateAssignmentForm
            vscode={vscode}
            user={user}
            classCode={selectedClass.classCode}
            onClose={() => setShowCreateAssignmentForm(false)}
          />
        </div>
      </div>
    );
  }

  if (selectedClass) {
    return (
      <div className="font-vscode bg-[var(--vscode-sideBar-background)] text-vscode-fg min-h-screen flex justify-center w-full">
        <div className="flex flex-col min-h-screen max-w-[420px] w-full mx-auto relative">
          {/* Header - Dùng sideBar-background và z-50 để đặt ruột */}
          <DashboardHeader vscode={vscode} user={user} fallbackName="Giáo viên" />

          {!isViewingAssignmentDetail && (
            <>
              {/* Back Button */}
              <div className="px-4 py-4">
                <button
                  onClick={() => setSelectedClass(null)}
                  className="cursor-pointer flex items-center gap-2 text-vscode-desc hover:text-vscode-fg transition-colors text-sm font-medium outline-none focus:outline-none focus-visible:outline-none"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Quay lại
                </button>
              </div>

              {/* Class Header */}
              <div className="px-4 py-5 border-b border-solid border-[var(--vscode-panel-border)]">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h2 className="text-2xl font-bold tracking-tight text-vscode-fg mb-1">{selectedClass.className}</h2>
                    <p className="text-sm text-vscode-desc">Mã lớp: <strong className="font-mono font-bold text-vscode-fg">{selectedClass.classCode}</strong></p>
                  </div>
                  <button
                    onClick={() => handleDeleteClass(selectedClass)}
                    className="cursor-pointer text-vscode-desc hover:text-[var(--vscode-errorForeground)] hover:bg-vscode-hoverBg rounded-md transition-colors p-2"
                    title="Xóa lớp"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
                <button
                  onClick={() => setShowCreateAssignmentForm(true)}
                  className="cursor-pointer w-full bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] py-2.5 rounded-md font-medium text-sm hover:bg-[var(--vscode-button-hoverBackground)] transition-colors flex items-center justify-center gap-2 active:scale-[0.98]"
                >
                  Tạo bài tập mới
                </button>
              </div>
            </>
          )}

          {/* Assignments Section */}
          <div className="flex-1 overflow-y-auto pb-24">
            <AssignmentList
              vscode={vscode}
              classCode={selectedClass.classCode}
              className={selectedClass.className}
              isTeacher={true}
              onViewChange={(isDetailView) => setIsViewingAssignmentDetail(isDetailView)}
            />

            {/* Student List */}
            {!isViewingAssignmentDetail && (
              <TeacherStudentsList students={students} onRemoveStudent={handleRemoveStudent} />
            )}
          </div>

          {/* Bottom Navigation */}
          {!showCreateAssignmentForm && (
            <BottomNavigation activeTab={activeTab} onTabChange={handleTabChange} />
          )}
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
        return <NotificationView vscode={vscode} />;

      case 'settings':
        return <Setting vscode={vscode} user={user} />;

      case 'dashboard':
      default:
        return (
          <>
            {/* Create Button */}
            <div className="px-4 pb-2 pt-8">
              <button
                onClick={() => setShowCreateForm(true)}
                className="cursor-pointer w-full bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] py-3 rounded-md font-medium text-sm tracking-wide hover:bg-[var(--vscode-button-hoverBackground)] transition-colors flex items-center justify-center gap-2 active:scale-[0.98]"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                TẠO LỚP MỚI
              </button>
            </div>

            {/* Classes Title */}
            <div className="px-4 pt-6 pb-3">
              <h2 className="text-lg font-bold tracking-tight text-vscode-fg">Lớp học của tôi</h2>
            </div>

            {/* Stats Section */}
            <section className="px-4 pb-4">
              <div className="flex items-center gap-4 text-xs uppercase tracking-wider font-bold text-vscode-desc">
                <div className="flex items-center gap-1.5">
                  <span className="text-vscode-fg text-sm">{classes.length}</span> CLASSES
                </div>
                <div className="w-px h-3 bg-[var(--vscode-panel-border)]"></div>
                <div className="flex items-center gap-1.5">
                  <span className="text-vscode-fg text-sm">
                    {classes.reduce((sum, c) => sum + (c.assignmentCount || 0), 0)}
                  </span> ASSIGNMENTS
                </div>
              </div>
            </section>

            {/* Classes List */}
            <main className="flex-1 overflow-y-auto px-4 pb-24 space-y-3">
              {classes.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-[var(--vscode-panel-border)] rounded-md mt-4">
                  <p className="text-vscode-desc mb-4 text-sm">Bạn chưa tạo lớp học nào</p>
                  <button
                    onClick={() => setShowCreateForm(true)}
                    className="cursor-pointer px-6 py-2 bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] rounded-md font-medium text-sm hover:bg-[var(--vscode-button-hoverBackground)] transition-colors"
                  >
                    + Tạo lớp học đầu tiên
                  </button>
                </div>
              ) : (
                classes.map((classItem) => (
                  <div
                    key={classItem.classId}
                    onClick={() => handleViewStudents(classItem)}
                    className="group relative p-5 rounded-md border border-solid border-[var(--vscode-panel-border)] bg-[var(--vscode-editorWidget-background)] hover:border-[var(--vscode-focusBorder)] hover:bg-vscode-hoverBg transition-all cursor-pointer"
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteClass(classItem);
                      }}
                      className="absolute top-4 right-4 text-vscode-desc opacity-0 group-hover:opacity-100 hover:text-[var(--vscode-errorForeground)] transition-all p-1 rounded-md hover:bg-vscode-bg"
                      title="Xóa lớp"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                    <div className="pr-8">
                      <h3 className="text-base font-bold leading-tight mb-1 text-vscode-fg">{classItem.className}</h3>
                      <p className="text-xs font-mono font-bold text-vscode-desc mb-4">{classItem.classCode}</p>
                      <div className="flex items-center gap-6">
                        <div className="flex items-center gap-1.5 text-xs font-medium uppercase text-vscode-fg">
                          <svg className="w-[16px] h-[16px] text-vscode-desc" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          {classItem.assignmentCount || 0}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs font-medium uppercase text-vscode-fg">
                          <svg className="w-[16px] h-[16px] text-vscode-desc" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                          </svg>
                          {classItem.studentCount}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </main>
          </>
        );
    }
  };

  return (
    <div className="font-vscode bg-[var(--vscode-sideBar-background)] text-vscode-fg min-h-screen flex justify-center w-full">
      <div className="flex flex-col min-h-screen max-w-[420px] w-full mx-auto relative">
        {/* Header */}
        {!isChatDetailOpen && (
          <DashboardHeader vscode={vscode} user={user} fallbackName="Giáo viên" />
        )}

        {/* Conditional Content Based on Active Tab */}
        {renderContent()}

        {/* Bottom Navigation */}
        {!isChatDetailOpen && (
          <BottomNavigation activeTab={activeTab} onTabChange={handleTabChange} />
        )}
      </div>
    </div>
  );
};

export default TeacherDashboard;

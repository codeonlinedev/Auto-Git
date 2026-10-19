import React, { useState, useEffect, useLayoutEffect } from 'react';
import AssignmentDetail from './AssignmentDetail';

interface AssignmentListProps {
  vscode: any;
  classCode: string;
  isTeacher: boolean;
  currentAssignmentCode?: string; // Assignment code of currently opened workspace
  initialAssignmentCode?: string;
  initialAssignmentData?: Assignment;
  onInitialAssignmentHandled?: () => void;
  onViewChange?: (isDetailView: boolean) => void; // Notify parent when view changes
  className?: string;
}

interface Assignment {
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

const AssignmentList: React.FC<AssignmentListProps> = ({
  vscode,
  classCode,
  isTeacher,
  currentAssignmentCode,
  initialAssignmentCode,
  initialAssignmentData,
  onInitialAssignmentHandled,
  onViewChange,
  className
}) => {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeAssignmentCode, setActiveAssignmentCode] = useState<string | undefined>(currentAssignmentCode);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(initialAssignmentData || null);

  useEffect(() => {
    setActiveAssignmentCode(currentAssignmentCode);
  }, [currentAssignmentCode]);

  useEffect(() => {
    if (initialAssignmentData) {
      setSelectedAssignment(initialAssignmentData);
      onInitialAssignmentHandled?.();
    }
  }, [initialAssignmentData, onInitialAssignmentHandled]);

  useEffect(() => {
    if (!initialAssignmentCode || selectedAssignment) {
      return;
    }

    const found = assignments.find((a) => a.assignmentCode === initialAssignmentCode);
    if (!found) {
      return;
    }

    setSelectedAssignment(found);
    onInitialAssignmentHandled?.();
  }, [initialAssignmentCode, assignments, selectedAssignment, onInitialAssignmentHandled]);

  useEffect(() => {
    if (!initialAssignmentCode || loading || selectedAssignment) {
      return;
    }

    const found = assignments.find((a) => a.assignmentCode === initialAssignmentCode);
    if (!found) {
      onInitialAssignmentHandled?.();
    }
  }, [initialAssignmentCode, loading, selectedAssignment, assignments, onInitialAssignmentHandled]);

  // Keep parent header/back-button state in sync before paint to avoid flicker.
  useLayoutEffect(() => {
    if (onViewChange) {
      onViewChange(!!selectedAssignment);
    }
  }, [selectedAssignment, onViewChange]);

  useEffect(() => {
    loadAssignments();
    // Request current workspace info when component mounts
    vscode.postMessage({ type: 'getCurrentWorkspace' });

    // Listen for messages from extension
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === 'assignmentJoinedSuccess') {
        loadAssignments();
      } else if (message.type === 'currentWorkspaceInfo') {
        setActiveAssignmentCode(message.assignmentCode);
      } else if (message.type === 'assignmentsLoaded') {
        setAssignments(message.assignments);
        setLoading(false);
      } else if (message.type === 'assignmentsError') {
        setLoading(false);
      } else if (message.type === 'assignmentDeleted') {
        loadAssignments();
      } else if (message.type === 'setupWorkspaceSuccess') {
        if (message.data && message.data.workspacePath) {
          vscode.postMessage({ type: 'openFolder', path: message.data.workspacePath });
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [classCode]);

  const loadAssignments = () => {
    setLoading(true);
    vscode.postMessage({
      type: 'getAssignments',
      classCode: classCode
    });
  };

  const handleJoinAssignment = (assignment: Assignment) => {
    vscode.postMessage({
      type: 'joinAssignment',
      assignmentCode: assignment.assignmentCode,
      title: assignment.title
    });
  };

  const handleDeleteAssignment = (assignment: Assignment) => {
    // Send message to provider which will show VS Code confirmation dialog
    vscode.postMessage({
      type: 'deleteAssignment',
      assignmentCode: assignment.assignmentCode,
      title: assignment.title
    });
  };

  const formatDeadline = (deadline: string) => {
    if (!deadline) return 'Không có deadline';
    return new Date(deadline).toLocaleString('vi-VN');
  };

  const formatLastCommit = (lastCommitAt: string) => {
    if (!lastCommitAt) return 'Chưa có commit';
    return new Date(lastCommitAt).toLocaleString('vi-VN');
  };

  if (selectedAssignment) {
    return (
      <AssignmentDetail
        vscode={vscode}
        assignment={{
          ...selectedAssignment,
          className: className,
          classCode: classCode
        }}
        onBack={() => {
          onViewChange?.(false);
          setSelectedAssignment(null);
        }}
        isTeacher={isTeacher}
      />
    );
  }

  if (loading) {
    return <div className="text-center p-10 text-vscode-desc">Đang tải bài tập...</div>;
  }

  if (assignments.length === 0) {
    return (
      <div className="text-center py-12 px-5 border border-dashed border-[var(--vscode-panel-border)] rounded-md mx-5 mt-4">
        <p className="text-vscode-desc mb-2 text-sm">Chưa có bài tập nào</p>
        {isTeacher && <p className="text-xs text-vscode-desc">Nhấn "Tạo bài tập" để thêm bài tập mới</p>}
      </div>
    );
  }

  return (
    <section className="py-4 font-vscode">
      <div className="px-5 flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold tracking-tight text-vscode-fg">
          Danh sách bài tập ({assignments.length})
        </h2>
      </div>

      {/* Assignment Cards List */}
      <div className="px-5 space-y-3">
        {assignments.map((assignment) => {
          const isCurrentAssignment = assignment.assignmentCode === activeAssignmentCode;

          return (
            <div
              key={assignment.assignmentId}
              // Card Style: Phẳng, viền mỏng. Nếu là bài tập đang Active thì sáng viền và nền lên
              className={`group relative rounded-md p-4 border border-solid transition-all cursor-pointer ${isCurrentAssignment
                ? 'border-[var(--vscode-focusBorder)] bg-vscode-hoverBg'
                : 'border-[var(--vscode-panel-border)] bg-vscode-bg hover:![border-color:var(--vscode-focusBorder)] hover:bg-vscode-hoverBg'
                }`}
              onClick={() => {
                if (isTeacher) {
                  // Teacher: Navigate to detail view
                  onViewChange?.(true);
                  setSelectedAssignment(assignment);
                } else if (assignment.joined) {
                  // Student: Navigate to detail view if joined
                  onViewChange?.(true);
                  setSelectedAssignment(assignment);
                } else {
                  // Student: Join assignment if not joined
                  handleJoinAssignment(assignment);
                }
              }}
            >
              {/* Delete Button */}
              {isTeacher && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteAssignment(assignment);
                  }}
                  // Ẩn nút xóa, chỉ hiện khi Hover chuột vào Card + dùng màu Error của VS Code
                  className="absolute top-4 right-4 text-vscode-desc opacity-0 group-hover:opacity-100 hover:!text-[var(--vscode-errorForeground)] transition-all p-1 rounded-md hover:bg-vscode-bg"
                  title="Xóa bài tập"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}

              <div className="flex flex-col gap-2">
                {/* Title only */}
                <div className="pr-8">
                  <h3 className="text-base font-bold leading-tight text-vscode-fg group-hover:underline mb-1">
                    {assignment.title}
                  </h3>
                </div>

                {/* Info Section */}
                <div className="flex flex-col gap-1.5 mt-1">
                  {/* Deadline */}
                  <div className="flex items-center gap-1.5 text-vscode-desc">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="text-xs font-medium">
                      Deadline: {formatDeadline(assignment.deadline)}
                    </p>
                  </div>

                  {/* Student Info */}
                  {!isTeacher && assignment.joined && (
                    <>
                      <div className="flex items-center gap-1.5 text-vscode-desc">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <p className="text-xs font-medium">
                          Số lần nộp: {assignment.commitCount || 0}
                        </p>
                      </div>
                      {assignment.lastCommitAt && (
                        <div className="flex items-center gap-1.5 text-vscode-desc">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <p className="text-xs font-medium">
                            Lần nộp gần nhất: {formatLastCommit(assignment.lastCommitAt)}
                          </p>
                        </div>
                      )}
                    </>
                  )}

                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default AssignmentList;

import React, { useState, useEffect } from 'react';
import { StudentSubmissionDTO } from '../../../services/apiService';
import StudentResultView from '../result/StudentResultView';
import 'katex/dist/katex.min.css';
import { FileSpreadsheet, RefreshCw } from 'lucide-react';

const ReactMarkdown = require('react-markdown').default;
const remarkGfm = require('remark-gfm').default;
const remarkMath = require('remark-math').default;
const rehypeKatex = require('rehype-katex').default;

interface AssignmentDetailProps {
  vscode: any;
  assignment: Assignment;
  onBack: () => void;
  isTeacher?: boolean;
}

interface Assignment {
  assignmentId: string;
  assignmentCode: string;
  title: string;
  description: string;
  tasks?: AssignmentTask[];
  assignmentTasks?: AssignmentTask[];
  deadline: string;
  studentCount: number;
  className?: string;
  classCode?: string;
  commitCount?: number;
  lastCommitAt?: string;
}

interface AssignmentTask {
  orderNo?: number;
  taskName?: string;
  description?: string;
}

const AssignmentDetail: React.FC<AssignmentDetailProps> = ({ vscode, assignment, onBack, isTeacher = true }) => {
  const [submissions, setSubmissions] = useState<StudentSubmissionDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTaskId, setActiveTaskId] = useState(1);
  const [viewingResultFor, setViewingResultFor] = useState<{ studentId?: number, studentName?: string } | null>(null);

  const normalizedTasks = React.useMemo(() => {
    const incomingTasks = (assignment.tasks && assignment.tasks.length > 0)
      ? assignment.tasks
      : (assignment.assignmentTasks && assignment.assignmentTasks.length > 0)
        ? assignment.assignmentTasks
        : [];

    if (incomingTasks.length === 0) {
      return [{
        id: 1,
        orderNo: 1,
        taskName: 'Task 1',
        description: assignment.description || ''
      }];
    }

    return incomingTasks.map((task, index) => ({
      id: index + 1,
      orderNo: task.orderNo || index + 1,
      taskName: (task.taskName && task.taskName.trim()) ? task.taskName.trim() : `Task ${index + 1}`,
      description: task.description || ''
    }));
  }, [assignment.tasks, assignment.assignmentTasks, assignment.description]);

  const activeTask = normalizedTasks.find((task) => task.id === activeTaskId) || normalizedTasks[0];

  useEffect(() => {
    loadSubmissions();
    // Scroll to top when viewing assignment detail
    window.scrollTo(0, 0);

    // Listen for messages from extension
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === 'submissionsLoaded') {
        setSubmissions(message.submissions);
        setLoading(false);
      } else if (message.type === 'submissionsError') {
        setLoading(false);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [assignment.assignmentCode]);

  useEffect(() => {
    setActiveTaskId(1);
  }, [assignment.assignmentCode]);

  const loadSubmissions = () => {
    setLoading(true);
    vscode.postMessage({
      type: 'getAssignmentSubmissions',
      assignmentCode: assignment.assignmentCode
    });
  };

  const handleTeacherViewResult = (student: StudentSubmissionDTO) => {
    setViewingResultFor({
      studentId: student.studentId,
      studentName: student.studentName
    });
  }

  const handleViewResult = () => {
    setViewingResultFor({
      studentName: 'Bạn'
    });
  }

  const handleExportExcel = () => {
    vscode.postMessage({
      type: 'exportAssignmentExcel',
      assignmentId: assignment.assignmentId,
      assignmentCode: assignment.assignmentCode,
      title: assignment.title
    });
  };

  const formatScore = (score: number | null) => {
    if (score === null || score === undefined) return 'Chưa chấm';
    return `${score}`; // Only show the number, not "/10"
  };

  const handleOpenWorkspace = () => {
    vscode.postMessage({
      type: 'openAssignment',
      assignmentCode: assignment.assignmentCode
    });
  };

  const markdownPreviewComponents = {
    h1: ({ children }: { children?: React.ReactNode }) => (
      <h1 className="mb-2 text-base font-bold tracking-tight text-vscode-fg border-b border-solid border-[var(--vscode-panel-border)] pb-1">{children}</h1>
    ),
    h2: ({ children }: { children?: React.ReactNode }) => (
      <h2 className="mb-2 mt-3 text-[15px] font-bold text-vscode-fg">{children}</h2>
    ),
    h3: ({ children }: { children?: React.ReactNode }) => (
      <h3 className="mb-1.5 mt-2.5 text-sm font-semibold text-vscode-fg">{children}</h3>
    ),
    p: ({ children }: { children?: React.ReactNode }) => (
      <p className="mb-2.5 text-[13px] leading-6 text-vscode-fg">{children}</p>
    ),
    ul: ({ children }: { children?: React.ReactNode }) => (
      <ul className="mb-2.5 ml-5 list-disc space-y-1 text-[13px] text-vscode-fg">{children}</ul>
    ),
    ol: ({ children }: { children?: React.ReactNode }) => (
      <ol className="mb-2.5 ml-5 list-decimal space-y-1 text-[13px] text-vscode-fg">{children}</ol>
    ),
    li: ({ children }: { children?: React.ReactNode }) => (
      <li className="leading-7">{children}</li>
    ),
    strong: ({ children }: { children?: React.ReactNode }) => (
      <strong className="font-bold text-vscode-fg">{children}</strong>
    ),
    code: ({ inline, children }: { inline?: boolean; children?: React.ReactNode }) => {
      if (inline) {
        return (
          // Inline code chuẩn VS Code: Nền xám mờ, chữ màu cam/đỏ gạch (tùy theme)
          <code className="rounded-md bg-[var(--vscode-textCodeBlock-background)] px-1.5 py-0.5 font-mono text-[0.9em] text-[var(--vscode-textPreformat-foreground)]">
            {children}
          </code>
        );
      }

      return (
        // Block code chuẩn VS Code: Nền khối code đặc thù, có viền mỏng
        <pre className="mb-3 overflow-x-auto rounded-md bg-[var(--vscode-textCodeBlock-background)] border border-solid border-[var(--vscode-panel-border)] p-4 text-sm text-vscode-fg">
          <code className="font-mono">{children}</code>
        </pre>
      );
    },
    // Bổ sung thêm blockquote để đề phòng Markdown có trích dẫn
    blockquote: ({ children }: { children?: React.ReactNode }) => (
      <blockquote className="border-l-4 border-[var(--vscode-textBlockQuote-border)] bg-[var(--vscode-textBlockQuote-background)] px-3 py-1 mb-2.5 text-vscode-desc italic">
        {children}
      </blockquote>
    ),
  };

  if (viewingResultFor) {
    return (
      <StudentResultView
        vscode={vscode}
        assignmentCode={assignment.assignmentCode}
        studentId={viewingResultFor.studentId}
        studentName={viewingResultFor.studentName}
        onBack={() => setViewingResultFor(null)}
      />
    );
  }

  return (
    // Đồng bộ font, màu nền, màu chữ cho toàn bộ trang
    <div className="font-vscode bg-vscode-bg text-vscode-fg min-h-screen flex justify-center">
      <div className="w-full max-w-[420px] flex flex-col min-h-screen pb-5">

        {/* Back Button */}
        <div className="px-4 py-4">
          <button
            onClick={onBack}
            className="cursor-pointer flex items-center gap-2 text-vscode-desc hover:text-vscode-fg transition-colors text-sm font-medium outline-none focus:outline-none focus-visible:outline-none"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Quay lại
          </button>
        </div>

        <main className="flex flex-col flex-1">
          <div className="px-4 py-4 space-y-4">

            {/* Header Info Card */}
            <div className="rounded-md p-4 border border-solid border-[var(--vscode-panel-border)] bg-vscode-bg">
              <div className="flex items-center justify-between mb-1">
                {assignment.className && (
                  <h1 className="text-xl font-bold text-vscode-fg">
                    {assignment.className}
                  </h1>
                )}
                <div className="flex items-center gap-2">
                  {/* Nút Kết quả hiển thị cho Sinh viên (Secondary Button) */}
                  {!isTeacher && (
                    <button
                      onClick={() => { handleViewResult() }}
                      className="cursor-pointer bg-transparent text-vscode-fg border border-solid border-[var(--vscode-button-secondaryBackground)] px-3 py-1.5 rounded-md text-xs font-semibold hover:bg-vscode-hoverBg transition-colors"
                    >
                      Kết quả
                    </button>
                  )}
                  {/* Nút Primary */}
                  <button
                    onClick={handleOpenWorkspace}
                    className="cursor-pointer bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 hover:bg-[var(--vscode-button-hoverBackground)] transition-colors active:scale-[0.98]"
                  >
                    {isTeacher ? 'Đồng bộ & mở' : 'Mở'}
                  </button>
                </div>
              </div>

              {assignment.classCode && (
                <p className="text-sm text-vscode-desc mb-2.5">
                  Mã lớp: <span className="font-semibold text-vscode-fg">{assignment.classCode}</span>
                </p>
              )}

              <h2 className="text-lg font-bold text-vscode-fg mb-3">
                {assignment.title}
              </h2>

              <div className="flex items-center gap-2 text-sm text-vscode-desc">
                <span>Deadline: {new Date(assignment.deadline).toLocaleDateString('vi-VN')}</span>
              </div>
            </div>

            {/* Task Tabs */}
            <div className="flex flex-wrap gap-2 items-start">
              {normalizedTasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => setActiveTaskId(task.id)}
                  // Style Tab chuẩn VS Code
                  className={`cursor-pointer px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-tight whitespace-nowrap transition-colors border border-solid ${task.id === activeTask?.id
                    ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] border-[var(--vscode-button-background)]'
                    : 'bg-transparent text-vscode-desc border-[var(--vscode-panel-border)] hover:bg-vscode-hoverBg hover:text-vscode-fg'
                    }`}
                >
                  {`Câu ${task.orderNo}`}
                </button>
              ))}
            </div>

            {/* Markdown Preview Area */}
            <div className="rounded-md overflow-hidden border border-solid border-[var(--vscode-panel-border)] bg-vscode-bg">
              <div className="p-4 text-sm leading-relaxed markdown-preview text-vscode-fg">
                {(activeTask?.description || '').trim() ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={markdownPreviewComponents}>
                    {activeTask?.description || ''}
                  </ReactMarkdown>
                ) : (
                  <p className="text-vscode-desc">Không có mô tả</p>
                )}
              </div>
            </div>
          </div>

          {isTeacher && (
            <div className="mt-2">
              <div className="flex items-center justify-between px-6 py-3 border-b border-solid border-[var(--vscode-panel-border)]">
                <h3 className="text-sm font-bold tracking-tight text-vscode-fg">
                  Danh sách nộp bài ({submissions.length})
                </h3>
                <div className="flex items-center gap-1">
                  {/* Icon Buttons phẳng */}
                  <button
                    onClick={handleExportExcel}
                    className="cursor-pointer h-8 w-8 inline-flex items-center justify-center rounded-md bg-transparent text-vscode-desc hover:text-vscode-fg hover:bg-vscode-hoverBg transition-colors"
                    title="Xuất file Excel"
                  >
                    <FileSpreadsheet className="h-4 w-4" />
                  </button>
                  <button
                    onClick={loadSubmissions}
                    className="cursor-pointer h-8 w-8 inline-flex items-center justify-center rounded-md bg-transparent text-vscode-desc hover:text-vscode-fg hover:bg-vscode-hoverBg transition-colors"
                    title="Tải lại danh sách"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {loading ? (
                <div className="text-center py-12 text-vscode-desc text-[13px]">
                  Đang tải dữ liệu...
                </div>
              ) : (
                <div className="w-full overflow-hidden">
                  {submissions.length === 0 ? (
                    <div className="text-center py-12 text-vscode-desc text-[13px]">
                      Chưa có sinh viên nộp bài
                    </div>
                  ) : (
                    <table className="w-full border-collapse text-left">
                      <thead>
                        <tr>
                          <th className="px-6 py-3 text-[10px] font-bold text-vscode-desc uppercase tracking-widest border-b border-solid border-[var(--vscode-panel-border)]">
                            Họ và tên
                          </th>
                          <th className="px-6 py-3 text-[10px] font-bold text-vscode-desc uppercase tracking-widest border-b border-solid border-[var(--vscode-panel-border)] text-right">
                            Điểm
                          </th>
                        </tr>
                      </thead>
                      {/* Bảng danh sách chuẩn */}
                      <tbody className="divide-y divide-[var(--vscode-panel-border)]">
                        {submissions.map((submission, index) => (
                          <tr
                            key={submission.studentId || index}
                            className="hover:bg-[var(--vscode-list-hoverBackground)] transition-colors group cursor-pointer"
                            onClick={() => handleTeacherViewResult(submission)}
                          >
                            <td className="px-6 py-3.5">
                              <span className="text-[13px] font-medium text-vscode-fg group-hover:text-vscode-link group-hover:underline cursor-pointer">
                                {submission.studentName}
                              </span>
                            </td>
                            <td className="px-6 py-3.5 text-right">
                              <span className="text-[13px] font-bold text-vscode-fg">
                                {formatScore(submission.score)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default AssignmentDetail;

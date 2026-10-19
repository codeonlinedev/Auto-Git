import React, { useState, useEffect } from 'react';
import { CheckCircle2, AlertCircle, Code2, ChevronDown } from 'lucide-react';

interface TaskDTO {
    resultId: number;
    orderNo?: number | null;
    language: string;
    score: number;
    pass: number;
    total: number;
    status: string;
    errorMessage?: string | null;
    commitHash: string;
    sourceCode: string;
}

interface TaskWithHistoryDTO {
    taskId: number;
    taskOrderNo: number;
    taskName: string;
    bestScore: number; // Double trong Java map sang number trong JS
    maxScore: number;
    history: TaskDTO[] | null;
}

interface TaskResultResponse {
    totalScore: number;
    maxTotalScore: number;
    tasks: TaskWithHistoryDTO[];
}

interface StudentResultViewProps {
    vscode: any;
    assignmentCode: string;
    studentId?: number;
    studentName?: string;
    onBack: () => void;
}

const StudentResultView: React.FC<StudentResultViewProps> = ({
    vscode,
    assignmentCode,
    studentId,
    studentName,
    onBack,
}) => {
    const [data, setData] = useState<TaskResultResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [expandedTaskId, setExpandedTaskId] = useState<number | null>(null);

    useEffect(() => {
        window.scrollTo(0, 0);
        setLoading(true);

        vscode.postMessage({
            type: 'viewResult',
            studentId,
            assignmentCode
        });

        const handleMessage = (event: MessageEvent) => {
            const message = event.data;
            if (message.type === 'viewTaskResultSuccess') {
                setData(message.data);
                if (message.data?.tasks?.length > 0) {
                    setExpandedTaskId(message.data.tasks[0].taskId);
                }
                setLoading(false);
            } else if (message.type === 'viewTaskResultError') {
                setLoading(false);
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [assignmentCode, studentId]);

    const handleViewSourceCode = (task: TaskWithHistoryDTO, record: TaskDTO, e: React.MouseEvent) => {
        e.stopPropagation();

        vscode.postMessage({
            type: 'viewStudentCode',
            sourceCode: record.sourceCode,
            language: record.language,
            taskName: task.taskName
        });
    };

    const toggleTask = (taskId: number) => {
        setExpandedTaskId(prev => prev === taskId ? null : taskId);
    };

    if (loading) {
        return (
            <div className="font-vscode bg-vscode-bg text-vscode-fg min-h-screen flex justify-center">
                <div className="w-full max-w-[420px] flex flex-col min-h-screen items-center justify-center">
                    <span className="text-sm font-medium text-vscode-desc">Đang tải kết quả...</span>
                </div>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="font-vscode bg-vscode-bg text-vscode-fg min-h-screen flex justify-center">
                <div className="w-full max-w-[420px] flex flex-col min-h-screen pb-5">
                    <div className="px-4 py-3 bg-vscode-bg sticky top-0 z-10">
                        <button
                            onClick={onBack}
                            className="cursor-pointer flex items-center gap-2 text-vscode-desc hover:text-vscode-fg transition-colors text-sm font-medium outline-none focus:outline-none"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                            Quay lại
                        </button>
                    </div>
                    <div className="flex flex-1 items-center justify-center px-6 text-center">
                        <p className="text-sm font-medium text-vscode-desc">Không có dữ liệu kết quả để hiển thị.</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="font-vscode bg-vscode-bg text-vscode-fg min-h-screen flex justify-center">
            <div className="w-full max-w-[420px] flex flex-col min-h-screen pb-5">

                {/* Header Navbar */}
                <div className="px-4 py-3 bg-vscode-bg sticky top-0 z-10">
                    <button
                        onClick={onBack}
                        className="cursor-pointer flex items-center gap-2 text-vscode-desc hover:text-vscode-fg transition-colors text-sm font-medium outline-none focus:outline-none"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        Quay lại
                    </button>
                </div>

                <main className="flex flex-col flex-1 px-4 py-4 space-y-5">

                    {/* Thẻ Tổng điểm */}
                    <div className="rounded-md p-6 border border-solid border-[var(--vscode-panel-border)] bg-vscode-bg text-center">
                        <p className="text-sm font-medium text-vscode-desc mb-2">
                            {studentName ? `Kết quả của: ${studentName}` : 'Tổng điểm đánh giá'}
                        </p>
                        <div className="flex items-baseline justify-center gap-1">
                            <h1 className="text-5xl font-bold text-vscode-fg">{data.totalScore}</h1>
                        </div>
                    </div>

                    {/* Danh sách Task Accordion */}
                    <div className="flex flex-col gap-3">
                        <h3 className="text-sm font-bold text-vscode-fg px-1">Chi tiết bài nộp</h3>

                        {data.tasks.map((task) => {
                            const isExpanded = expandedTaskId === task.taskId;

                            const sortedHistory = [...(task.history || [])].sort((a, b) => b.resultId - a.resultId);
                            const totalAttempts = sortedHistory.length;

                            return (
                                <div key={task.taskId} className="rounded-md overflow-hidden border border-solid border-[var(--vscode-panel-border)] bg-vscode-bg transition-all">

                                    {/* Task Header - Đã fix khoảng cách */}
                                    <div
                                        onClick={() => toggleTask(task.taskId)}
                                        // Thêm gap-4 để tạo khoảng cách an toàn giữa 2 bên
                                        className="flex justify-between items-center p-4 gap-4 cursor-pointer hover:bg-vscode-hoverBg transition-colors"
                                    >
                                        {/* Thêm min-w-0 để flex cho phép cắt chữ (truncate) */}
                                        <div className="flex-1 min-w-0">
                                            <h4
                                                className="text-[15px] font-bold text-vscode-fg mb-0.5 truncate block"
                                                title={`Task ${task.taskOrderNo}: ${task.taskName}`} // Hover chuột vào sẽ hiện tên đầy đủ
                                            >
                                                Câu {task.taskOrderNo}: {task.taskName}
                                            </h4>
                                            <p className="text-[11px] font-medium text-vscode-desc">
                                                {totalAttempts > 0 ? `Đã nộp ${totalAttempts} lần` : 'Chưa nộp bài'}
                                            </p>
                                        </div>
                                        {/* Thêm shrink-0 để khối chứa Điểm không bao giờ bị bóp méo */}
                                        <div className="flex items-center gap-3 shrink-0">
                                            <span className="text-base font-bold text-vscode-fg">
                                                {task.bestScore}
                                            </span>
                                            <ChevronDown className={`w-5 h-5 text-vscode-desc transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                                        </div>
                                    </div>

                                    {/* Task History Details */}
                                    {isExpanded && (
                                        <div className="bg-[var(--vscode-textBlockQuote-background)] border-t border-solid border-[var(--vscode-panel-border)] divide-y divide-solid divide-[var(--vscode-panel-border)]">
                                            {totalAttempts > 0 ? (
                                                sortedHistory.map((record) => {
                                                    const isRecordPerfect = record.pass === record.total && record.total > 0;

                                                    return (
                                                        <div key={record.resultId} className="p-4 hover:bg-vscode-hoverBg transition-colors">
                                                            {/* History Header - Đã fix khoảng cách */}
                                                            <div className="flex justify-between items-start mb-2 gap-4">
                                                                <div className="flex-1 min-w-0">
                                                                    <span className="px-1.5 py-0.5 rounded-sm bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)] text-[10px] font-bold uppercase tracking-wider inline-block">
                                                                        Ngôn ngữ: {record.language}
                                                                    </span>
                                                                </div>
                                                                <span className="text-[14px] font-bold text-vscode-fg shrink-0">
                                                                    {record.score}
                                                                </span>
                                                            </div>

                                                            <div className="flex items-center justify-between mt-3">
                                                                <div className="flex items-center gap-1.5">
                                                                    {isRecordPerfect ? (
                                                                        <CheckCircle2 className="text-vscode-fg" size={16} />
                                                                    ) : (
                                                                        <AlertCircle className="text-vscode-fg" size={16} />
                                                                    )}
                                                                    <span className="text-xs font-medium text-vscode-fg">
                                                                        Vượt qua {record.pass}/{record.total} test
                                                                    </span>
                                                                </div>

                                                                <button
                                                                    onClick={(e) => handleViewSourceCode(task, record, e)}
                                                                    className="cursor-pointer flex items-center gap-1.5 bg-transparent text-vscode-fg border border-solid border-[var(--vscode-button-secondaryBackground)] px-2.5 py-1.5 rounded-md text-[11px] font-bold hover:bg-vscode-hoverBg transition-colors"
                                                                >
                                                                    <Code2 size={14} strokeWidth={2.5} /> Xem code
                                                                </button>
                                                            </div>
                                                            {record.errorMessage && (
                                                                <div className="mt-2 text-[11px] text-[var(--vscode-errorForeground)] bg-[var(--vscode-inputValidation-errorBackground)] p-2 rounded-sm border border-solid border-[var(--vscode-inputValidation-errorBorder)] font-mono overflow-x-auto">
                                                                    {record.errorMessage}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })
                                            ) : (
                                                <div className="p-6 text-center text-sm font-medium text-vscode-desc">
                                                    Chưa có lịch sử nộp bài cho câu này.
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </main>
            </div>
        </div>
    );
};

export default StudentResultView;

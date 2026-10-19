import React, { useState } from 'react';
import 'katex/dist/katex.min.css';
import DashboardHeader from '../layout/DashboardHeader';

const ReactMarkdown = require('react-markdown').default;
const remarkGfm = require('remark-gfm').default;
const remarkMath = require('remark-math').default;
const rehypeKatex = require('rehype-katex').default;

interface CreateAssignmentFormProps {
  vscode: any;
  user?: any;
  classCode: string;
  onClose: () => void;
}

interface TaskFilePayload {
  name: string;
  size: number;
  base64: string;
}

interface SampleTestCase {
  ordinal: number;
  input: string;
  output: string;
  explain?: string;
}

interface TaskDraft {
  id: number;
  taskName: string;
  description: string;
  descriptionMode: 'write' | 'preview';
  testCasesFile: TaskFilePayload | null;
  sampleTestCases: SampleTestCase[];
}

// Bỏ phần Example mẫu đi để giáo viên tự add qua nút
const DESCRIPTION_TEMPLATE = `
## Tên bài toán 
### Mô tả bài toán
Cho ...

### Định dạng đầu vào (Input)
- Mỗi bộ test gồm...

### Định dạng đầu ra (Output)
- Với mỗi bộ test, in ra... trên một dòng.

### Giới hạn (Constraints)
- $1 \\le N \\le 10^5$
- Thời gian chạy: 1.0s
- Bộ nhớ: 256MB

---
### Gợi ý / Note (nếu có)
- Chú ý xử lý số nguyên lớn.

---
### Ví dụ (Example)
`;

const buildDefaultTask = (taskIndex: number): TaskDraft => ({
  id: taskIndex,
  taskName: `Task ${taskIndex}`,
  description: DESCRIPTION_TEMPLATE,
  descriptionMode: 'write',
  testCasesFile: null,
  sampleTestCases: []
});

const getTodayDateValue = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const CreateAssignmentForm: React.FC<CreateAssignmentFormProps> = ({ vscode, user, classCode, onClose }) => {
  const [title, setTitle] = useState('');
  const [tasks, setTasks] = useState<TaskDraft[]>([buildDefaultTask(1)]);
  const [activeTaskId, setActiveTaskId] = useState(1);
  const [deadlineDate, setDeadlineDate] = useState(getTodayDateValue);
  const [deadlineTime, setDeadlineTime] = useState('23:59');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const descriptionRef = React.useRef<HTMLTextAreaElement | null>(null);

  // --- STATE CHO MODAL THÊM TEST CASE ---
  const [isTcModalOpen, setIsTcModalOpen] = useState(false);
  const [tcInput, setTcInput] = useState('');
  const [tcOutput, setTcOutput] = useState('');
  const [tcExplain, setTcExplain] = useState('');
  const [tcError, setTcError] = useState('');

  const activeTask = tasks.find((task) => task.id === activeTaskId) || tasks[0];

  const updateTaskById = (taskId: number, updater: (task: TaskDraft) => TaskDraft) => {
    setTasks((prev) => prev.map((task) => (task.id === taskId ? updater(task) : task)));
  };

  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.command === 'createAssignmentSuccess') {
        const assignmentCode = msg.data.assignmentCode;
        const tasksWithFile = tasks
          .filter((task) => !!task.testCasesFile)
          .map((task) => ({
            taskName: task.taskName,
            fileName: task.testCasesFile!.name,
            fileContent: task.testCasesFile!.base64
          }));

        if (tasksWithFile.length !== tasks.length) {
          setMessage('Thiếu file test cases .zip cho một hoặc nhiều task');
          setIsSubmitting(false);
          return;
        }

        vscode.postMessage({
          type: 'uploadTaskTestCasesZip',
          assignmentCode,
          tasks: tasksWithFile
        });
        setMessage('Bài tập đã tạo, đang upload test cases theo từng task...');
      } else if (msg.command === 'createAssignmentError') {
        setMessage(`Lỗi: ${msg.error}`);
        setIsSubmitting(false);
      } else if (msg.command === 'uploadTaskTestCasesSuccess' || msg.command === 'uploadTestCasesSuccess') {
        setMessage('Test cases theo task đã được upload thành công!');
        setIsSubmitting(false);
        setTimeout(() => {
          vscode.postMessage({ type: 'assignmentCreated', classCode });
          onClose();
        }, 1000);
      } else if (msg.command === 'uploadTaskTestCasesError' || msg.command === 'uploadTestCasesError') {
        setMessage(`Lỗi upload test cases: ${msg.error}`);
        setIsSubmitting(false);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [vscode, classCode, onClose, tasks]);

  React.useEffect(() => {
    if (descriptionRef.current) {
      descriptionRef.current.style.height = 'auto';
      descriptionRef.current.style.height = `${Math.max(220, descriptionRef.current.scrollHeight)}px`;
    }
  }, [activeTask?.descriptionMode, activeTask?.id]);

  const toDeadlineValue = (): string | null => {
    if (!deadlineDate) return null;
    return `${deadlineDate}T${deadlineTime || '23:59'}`;
  };

  const validateBeforeCreate = () => {
    if (!title.trim()) {
      setMessage('Vui lòng nhập tên bài tập');
      return false;
    }

    if (tasks.length === 0) {
      setMessage('Vui lòng tạo ít nhất một task');
      return false;
    }

    for (const [index, task] of tasks.entries()) {
      const taskLabel = `Câu ${index + 1}`;
      if (!task.description.trim()) {
        setActiveTaskId(task.id);
        setMessage(`${taskLabel} chưa có mô tả`);
        return false;
      }

      if (!task.testCasesFile) {
        setActiveTaskId(task.id);
        setMessage(`${taskLabel} chưa có file test cases .zip`);
        return false;
      }

      if (task.sampleTestCases.length === 0) {
        setActiveTaskId(task.id);
        setMessage(`${taskLabel} cần ít nhất 1 testcase mẫu`);
        return false;
      }
    }

    if (!deadlineDate) {
      setMessage('Vui lòng chọn ngày deadline');
      return false;
    }

    return true;
  };

  const addTask = () => {
    setTasks((prev) => {
      const nextTaskNumber = prev.length + 1;
      const nextId = prev.length === 0 ? 1 : Math.max(...prev.map((task) => task.id)) + 1;
      const nextTask: TaskDraft = {
        ...buildDefaultTask(nextTaskNumber),
        id: nextId,
        taskName: `Task ${nextTaskNumber}`
      };
      setActiveTaskId(nextId);
      return [...prev, nextTask];
    });
  };

  const removeTask = (taskId: number) => {
    if (tasks.length <= 1) {
      setMessage('Assignment cần ít nhất 1 task');
      return;
    }
    setTasks((prev) => {
      const filtered = prev.filter((task) => task.id !== taskId);
      if (filtered.length === 0) return prev;
      const normalized = filtered.map((task, index) => ({
        ...task,
        taskName: `Task ${index + 1}`
      }));
      if (activeTaskId === taskId) {
        setActiveTaskId(normalized[0].id);
      }
      return normalized;
    });
  };

  const handleCreateAssignment = () => {
    if (isSubmitting) return;
    if (!validateBeforeCreate()) return;

    setIsSubmitting(true);

    vscode.postMessage({
      type: 'createAssignment',
      classCode,
      title: title.trim(),
      description: "",
      tasks: tasks.map((task, index) => {
        const nameMatch = task.description.match(/^##\s*(.+)/m);
        const extractedName = nameMatch ? nameMatch[1].trim() : task.taskName;

        return {
          orderNo: index + 1,
          taskName: extractedName,
          description: task.description,
          sampleTestCases: task.sampleTestCases
        };
      }),
      deadline: toDeadlineValue()
    });
    setMessage('Đang tạo bài tập nhiều task...');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!activeTask) return;

    if (file) {
      if (!file.name.endsWith('.zip')) {
        setMessage('Chỉ chấp nhận file .zip');
        e.target.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        const arrayBuffer = event.target?.result as ArrayBuffer;
        const bytes = new Uint8Array(arrayBuffer);
        const base64 = btoa(bytes.reduce((data, byte) => data + String.fromCharCode(byte), ''));
        updateTaskById(activeTask.id, (task) => ({
          ...task,
          testCasesFile: { name: file.name, size: file.size, base64 }
        }));
      };
      reader.onerror = () => setMessage('Lỗi đọc file');
      reader.readAsArrayBuffer(file);
    } else {
      updateTaskById(activeTask.id, (task) => ({ ...task, testCasesFile: null }));
    }
  };

  const handleAddTestCaseToMarkdown = () => {
    if (!activeTask) return;
    if (!tcInput.trim() || !tcOutput.trim()) {
      setTcError('Testcase mẫu cần có cả input và output');
      return;
    }

    const nextExampleNumber = activeTask.sampleTestCases.length + 1;

    const newSample: SampleTestCase = {
      ordinal: nextExampleNumber,
      input: tcInput.trim(),
      output: tcOutput.trim(),
      explain: tcExplain.trim()
    };

    const newTcMarkdown = `
**Ví dụ ${nextExampleNumber}:**

**Input:**
\`\`\`text
${newSample.input}
\`\`\`

**Output:**
\`\`\`text
${newSample.output}
\`\`\`

${newSample.explain ? `**Giải thích:** ${newSample.explain}\n\n` : ''}---
`;

    updateTaskById(activeTask.id, (task) => ({
      ...task,
      description: task.description.trim() + '\n' + newTcMarkdown,
      sampleTestCases: [...task.sampleTestCases, newSample]
    }));

    setIsTcModalOpen(false);
    setTcInput('');
    setTcOutput('');
    setTcExplain('');
    setTcError('');
    setMessage('');
  };


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleCreateAssignment();
  };

  const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!activeTask) return;
    updateTaskById(activeTask.id, (task) => ({ ...task, description: e.target.value }));
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.max(220, e.target.scrollHeight)}px`;
  };

  const markdownPreviewComponents = {
    h1: ({ children }: any) => <h1 className="mb-3 text-xl font-bold tracking-tight text-vscode-fg border-b border-solid border-[var(--vscode-panel-border)] pb-1">{children}</h1>,
    h2: ({ children }: any) => <h2 className="mb-2 mt-5 text-lg font-bold text-vscode-fg">{children}</h2>,
    h3: ({ children }: any) => <h3 className="mb-2 mt-4 text-base font-bold text-vscode-fg">{children}</h3>,
    p: ({ children }: any) => <p className="mb-3 text-[13px] leading-6 text-vscode-fg">{children}</p>,
    ul: ({ children }: any) => <ul className="mb-3 ml-5 list-disc space-y-1 text-[13px] text-vscode-fg">{children}</ul>,
    ol: ({ children }: any) => <ol className="mb-3 ml-5 list-decimal space-y-1 text-[13px] text-vscode-fg">{children}</ol>,
    li: ({ children }: any) => <li className="leading-6">{children}</li>,
    strong: ({ children }: any) => <strong className="font-bold text-vscode-fg">{children}</strong>,
    code: ({ inline, children }: any) => {
      if (inline) {
        return <code className="rounded-sm bg-[var(--vscode-textCodeBlock-background)] px-1.5 py-0.5 font-mono text-[0.9em] text-[var(--vscode-textPreformat-foreground)]">{children}</code>;
      }
      return <pre className="mb-3 overflow-x-auto rounded-sm bg-[var(--vscode-textCodeBlock-background)] p-4 text-sm border border-solid border-[var(--vscode-panel-border)] text-vscode-fg"><code>{children}</code></pre>;
    }
  };

  return (
    <div className="font-vscode bg-vscode-bg text-vscode-fg min-h-screen flex justify-center w-full">
      <div className="flex flex-col min-h-screen max-w-[420px] w-full mx-auto relative">

        <DashboardHeader vscode={vscode} user={user} fallbackName="Giáo viên" />

        <form onSubmit={handleSubmit} className="px-5 pt-5 pb-[160px] space-y-5">
          {message && (
            <div className="px-3 py-2 rounded-sm bg-[var(--vscode-textBlockQuote-background)] border border-solid border-[var(--vscode-panel-border)] text-[12px] text-vscode-fg leading-relaxed">
              {message}
            </div>
          )}

          {/* TÊN BÀI TẬP */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-medium text-vscode-fg">Tên bài tập</label>
            <input
              type="text"
              className="flex w-full rounded-sm border border-solid border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] outline-none focus:border-[var(--vscode-focusBorder)] h-10 px-4 text-[13px] transition-all placeholder:text-vscode-desc"
              placeholder="Ví dụ: Bài tập tuần 1 - OOP"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* LIST TASKS */}
          <div className="flex flex-wrap gap-2 items-start">
            {tasks.map((task) => (
              <div key={task.id} className="flex items-stretch rounded-sm overflow-hidden border border-solid border-[var(--vscode-panel-border)]">
                <button
                  type="button"
                  onClick={() => setActiveTaskId(task.id)}
                  className={`cursor-pointer px-3 py-1.5 text-[12px] font-medium uppercase transition-colors ${task.id === activeTask?.id
                    ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]'
                    : 'bg-[var(--vscode-input-background)] text-vscode-desc hover:bg-vscode-hoverBg'
                    }`}
                >
                  Câu {task.id}
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeTask(task.id); }}
                  className={`cursor-pointer px-1.5 flex items-center justify-center border-l border-solid border-[var(--vscode-panel-border)] ${task.id === activeTask?.id
                    ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-errorForeground)]'
                    : 'bg-[var(--vscode-input-background)] text-vscode-desc hover:bg-[var(--vscode-errorForeground)] hover:text-white'
                    }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ))}
            <button type="button" onClick={addTask} className="w-8 h-8 flex items-center justify-center rounded-sm border border-dashed border-[var(--vscode-panel-border)] text-vscode-link hover:bg-vscode-hoverBg font-bold">+</button>
          </div>

          {/* EDITOR SECTION */}
          <div className="flex flex-col border border-solid border-[var(--vscode-panel-border)] rounded-sm bg-vscode-bg overflow-hidden">
            <div className="flex items-center justify-between px-2 py-1.5 border-b border-solid border-[var(--vscode-panel-border)] bg-[var(--vscode-editorGroupHeader-tabsBackground)]">
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => updateTaskById(activeTask!.id, t => ({ ...t, descriptionMode: 'write' }))}
                  className={`px-3 py-1 rounded-sm text-[12px] ${activeTask?.descriptionMode === 'write' ? 'bg-[var(--vscode-tab-activeBackground)] text-[var(--vscode-tab-activeForeground)]' : 'text-vscode-desc'}`}
                > Soạn thảo </button>
                <button
                  type="button"
                  onClick={() => updateTaskById(activeTask!.id, t => ({ ...t, descriptionMode: 'preview' }))}
                  className={`px-3 py-1 rounded-sm text-[12px] ${activeTask?.descriptionMode === 'preview' ? 'bg-[var(--vscode-tab-activeBackground)] text-[var(--vscode-tab-activeForeground)]' : 'text-vscode-desc'}`}
                > Xem trước </button>
              </div>
              {activeTask?.descriptionMode === 'write' && (
                <button
                  type="button"
                  onClick={() => {
                    setTcError('');
                    setIsTcModalOpen(true);
                  }}
                  className="text-[12px] text-vscode-link hover:underline px-2"
                >
                  + Testcase
                </button>
              )}
            </div>
            <div className="p-1">
              {activeTask?.descriptionMode === 'write' ? (
                <textarea
                  className="w-full min-h-[220px] p-4 text-[13px] bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] outline-none resize-none font-mono"
                  value={activeTask?.description || ''}
                  onChange={handleDescriptionChange}
                />
              ) : (
                <div className="min-h-[220px] p-4 bg-vscode-bg text-[13px] leading-relaxed markdown-preview">
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={markdownPreviewComponents}>
                    {activeTask?.description || ''}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          </div>

          {/* UPLOAD ZIP */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-medium text-vscode-fg">File Test Cases (.zip)</label>
            <input type="file" accept=".zip" onChange={handleFileChange} className="hidden" id="testCasesFileInput" />
            <label htmlFor="testCasesFileInput" className="flex flex-col items-center justify-center w-full p-6 rounded-sm cursor-pointer border border-dashed border-[var(--vscode-panel-border)] bg-[var(--vscode-input-background)] hover:bg-vscode-hoverBg">
              <svg className="w-8 h-8 text-vscode-desc mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
              <span className="text-[13px]">{activeTask?.testCasesFile ? activeTask.testCasesFile.name : 'Click để tải lên file .zip'}</span>
            </label>
          </div>
        </form>

        <div className="fixed bottom-0 left-0 right-0 max-w-[420px] mx-auto bg-[var(--vscode-sideBar-background)] border-t border-solid border-[var(--vscode-panel-border)] p-4 flex flex-col gap-4 z-50 shadow-[0_-4px_12px_rgba(0,0,0,0.2)]">
          <div className="flex gap-4">
            <div className="flex-1 flex flex-col gap-1.5">
              <label className="text-[11px] uppercase font-bold text-vscode-desc">Ngày Deadline</label>
              <input type="date" value={deadlineDate} onChange={(e) => setDeadlineDate(e.target.value)} className="w-full bg-[var(--vscode-input-background)] border border-solid border-[var(--vscode-input-border)] rounded-sm px-3 py-1.5 text-[13px] text-vscode-fg outline-none focus:border-[var(--vscode-focusBorder)]" />
            </div>
            <div className="flex-1 flex flex-col gap-1.5">
              <label className="text-[11px] uppercase font-bold text-vscode-desc">Giờ (UTC)</label>
              <input type="time" value={deadlineTime} onChange={(e) => setDeadlineTime(e.target.value)} className="w-full bg-[var(--vscode-input-background)] border border-solid border-[var(--vscode-input-border)] rounded-sm px-3 py-1.5 text-[13px] text-vscode-fg outline-none focus:border-[var(--vscode-focusBorder)]" />
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 h-9 bg-transparent border border-solid border-[var(--vscode-button-secondaryBackground)] text-vscode-fg text-[13px] rounded-sm hover:bg-vscode-hoverBg">Hủy</button>
            <button
              onClick={handleCreateAssignment}
              disabled={isSubmitting}
              className="flex-[2] h-9 bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] text-[13px] rounded-sm hover:bg-[var(--vscode-button-hoverBackground)] font-bold disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Đang tạo...' : 'Tạo Assignment'}
            </button>
          </div>
        </div>

        {/* MODAL TESTCASE */}
        {isTcModalOpen && (
          <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
            <div className="bg-[var(--vscode-editorWidget-background)] border border-solid border-[var(--vscode-widget-border)] rounded-sm w-full max-w-[380px] shadow-2xl p-4">
              <div className="flex justify-between items-center mb-4">
                <span className="text-[13px] font-bold uppercase text-vscode-fg">Thêm Testcase mẫu</span>
                <button onClick={() => setIsTcModalOpen(false)} className="text-vscode-desc hover:text-vscode-fg">✕</button>
              </div>
              <div className="space-y-4">
                {tcError && (
                  <div className="px-3 py-2 rounded-sm bg-[var(--vscode-inputValidation-errorBackground)] border border-solid border-[var(--vscode-inputValidation-errorBorder)] text-[12px] text-vscode-fg">
                    {tcError}
                  </div>
                )}
                <textarea value={tcInput} onChange={e => setTcInput(e.target.value)} placeholder="Input" className="w-full bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] p-2 text-[13px] text-vscode-fg outline-none focus:border-[var(--vscode-focusBorder)]" />
                <textarea value={tcOutput} onChange={e => setTcOutput(e.target.value)} placeholder="Output" className="w-full bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] p-2 text-[13px] text-vscode-fg outline-none focus:border-[var(--vscode-focusBorder)]" />
                <input value={tcExplain} onChange={e => setTcExplain(e.target.value)} placeholder="Giải thích" className="w-full h-8 bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] px-2 text-[13px] text-vscode-fg outline-none focus:border-[var(--vscode-focusBorder)]" />
                <button onClick={handleAddTestCaseToMarkdown} className="w-full h-9 bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] text-[13px] font-bold rounded-sm">Chèn vào Markdown</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CreateAssignmentForm;

import React from 'react';
import { UserMinus } from 'lucide-react';

export interface TeacherStudent {
  studentId: string;
  studentName: string;
  joinedAt: string;
}

interface TeacherStudentsListProps {
  students: TeacherStudent[];
  onRemoveStudent: (student: TeacherStudent) => void;
}

const TeacherStudentsList: React.FC<TeacherStudentsListProps> = ({ students, onRemoveStudent }) => {
  return (
    <div className="px-4 py-6">
      <h3 className="text-lg font-bold tracking-tight text-vscode-fg mb-4">
        Danh sách sinh viên
      </h3>
      {students.length === 0 ? (
        <p className="text-sm text-vscode-desc text-center py-8">Chưa có sinh viên nào tham gia</p>
      ) : (
        <div className="border-y border-solid border-[var(--vscode-panel-border)]">
          {students.map((student) => (
            <div
              key={student.studentId}
              className="group min-h-[44px] flex items-center gap-3 border-b border-solid border-[var(--vscode-panel-border)] last:border-b-0 hover:bg-vscode-hoverBg transition-colors"
            >
              <div className="min-w-0 flex-1 py-3">
                <div className="font-semibold text-vscode-fg text-sm truncate">{student.studentName}</div>
              </div>
              <div className="flex items-center gap-2 py-3 pl-2">
                <span className="text-xs text-vscode-desc whitespace-nowrap">
                  Tham gia: {new Date(student.joinedAt).toLocaleDateString('vi-VN')}
                </span>
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemoveStudent(student);
                  }}
                  className="cursor-pointer w-7 h-7 flex items-center justify-center rounded-sm text-vscode-desc opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-[var(--vscode-errorForeground)] hover:bg-vscode-bg transition-all"
                  title="Xóa sinh viên khỏi lớp"
                  aria-label={`Xóa sinh viên ${student.studentName} khỏi lớp`}
                >
                  <UserMinus className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TeacherStudentsList;

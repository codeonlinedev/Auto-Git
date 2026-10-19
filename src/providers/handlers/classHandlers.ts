import * as vscode from 'vscode';
import { ApiService } from '../../services/apiService';
import { ensureBaseDirectory, removeRoomsByClassCode } from '../../utils/localWorkspaceStore';

export async function handleCreateClass(
    apiService: ApiService,
    className: string,
    postMessage: (message: any) => void
): Promise<void> {
    try {
        const response = await apiService.createClass(className);

        postMessage({
            command: 'createClassSuccess',
            data: response
        });

        vscode.window.showInformationMessage(
            `Lớp học đã được tạo! Class Code: ${response.classCode}`,
            'Copy Class Code'
        ).then(selection => {
            if (selection === 'Copy Class Code') {
                vscode.env.clipboard.writeText(response.classCode);
                vscode.window.showInformationMessage('Đã copy class code!');
            }
        });
    } catch (error: any) {
        postMessage({
            command: 'createClassError',
            error: error.message
        });
        vscode.window.showErrorMessage(`Lỗi tạo lớp: ${error.message}`);
    }
}

export async function handleJoinClass(
    apiService: ApiService,
    studentName: string,
    classCode: string,
    postMessage: (message: any) => void
): Promise<void> {
    try {
        const response = await apiService.joinClass(studentName, classCode);

        postMessage({
            command: 'joinClassSuccess',
            data: response
        });

        vscode.window.showInformationMessage(
            'Đã tham gia lớp! Bây giờ bạn có thể tham gia các bài tập.'
        );
    } catch (error: any) {
        postMessage({
            command: 'joinClassError',
            error: error.message
        });
        vscode.window.showErrorMessage(`Lỗi tham gia lớp: ${error.message}`);
    }
}

export async function handleLoadMyClasses(
    apiService: ApiService,
    context: vscode.ExtensionContext,
    postMessage: (message: any) => void
): Promise<void> {
    try {
        console.log('[Extension] _handleLoadMyClasses called');
        const result = await apiService.getMyClasses();
        console.log('[Extension] API result:', result);

        const userData = context.globalState.get<any>('user_data');
        const role = userData?.role;

        let classesToSend = [];
        if (role === 'TEACHER') {
            classesToSend = result.teacherClasses || [];
        } else {
            classesToSend = result.studentClasses || [];
        }

        postMessage({
            type: 'classesLoaded',
            classes: classesToSend
        });

        console.log('[Extension] Message posted to webview');
    } catch (error: any) {
        console.error('[Extension] Error loading classes:', error);
        vscode.window.showErrorMessage(`Lỗi tải danh sách lớp: ${error.message}`);
    }
}

export async function handleLoadStudents(
    apiService: ApiService,
    classCode: string,
    postMessage: (message: any) => void
): Promise<void> {
    try {
        const students = await apiService.getStudents(classCode);

        postMessage({
            type: 'studentsLoaded',
            students
        });
    } catch (error: any) {
        vscode.window.showErrorMessage(`Lỗi tải danh sách sinh viên: ${error.message}`);
    }
}

export async function handleDeleteClass(
    apiService: ApiService,
    context: vscode.ExtensionContext,
    classCode: string,
    className: string | undefined,
    postMessage: (message: any) => void
): Promise<void> {
    console.log('Extension received deleteClass message:', classCode);

    const classNameDisplay = className || classCode;
    const confirm = await vscode.window.showWarningMessage(
        `Bạn có chắc muốn xóa lớp "${classNameDisplay}"?`,
        { modal: true },
        'delete',
    );

    if (confirm !== 'delete') {
        console.log('Delete cancelled by user');
        return;
    }

    try {
        await apiService.deleteClass(classCode);
        console.log('Delete class successful');

        const userData = context.globalState.get<any>('user_data');
        if (userData?.userId) {
            const baseDirectory = await ensureBaseDirectory(context, userData.userId);
            if (baseDirectory) {
                const removedCount = removeRoomsByClassCode(baseDirectory, userData.userId, classCode);
                console.log(`[JSON] Removed ${removedCount} room(s) for class ${classCode}`);
            }
        }

        postMessage({
            type: 'classDeleted'
        });

        vscode.window.showInformationMessage('Đã xóa lớp học thành công!');
    } catch (error: any) {
        console.error('Delete class error:', error);
        vscode.window.showErrorMessage(`Lỗi xóa lớp: ${error.message}`);
    }
}

export async function handleLeaveClass(
    apiService: ApiService,
    classCode: string,
    className: string | undefined,
    branchName: string | undefined,
    postMessage: (message: any) => void
): Promise<void> {
    console.log('Extension received leaveClass message:', classCode);

    const classNameDisplay = className || classCode;
    const branchNameDisplay = branchName || 'branch của bạn';
    const confirm = await vscode.window.showWarningMessage(
        `Bạn có chắc muốn rời khỏi lớp "${classNameDisplay}"?\n\nBranch "${branchNameDisplay}" sẽ bị xóa vĩnh viễn!`,
        { modal: true },
        'Rời lớp',
        'Hủy'
    );

    if (confirm !== 'Rời lớp') {
        console.log('Leave cancelled by user');
        return;
    }

    try {
        console.log('Calling apiService.leaveClass...');
        await apiService.leaveClass(classCode);
        console.log('Leave class successful');

        postMessage({
            type: 'classLeft'
        });

        vscode.window.showInformationMessage('Đã rời khỏi lớp học!');
    } catch (error: any) {
        console.error('Leave class error:', error);
        vscode.window.showErrorMessage(`Lỗi rời lớp: ${error.message}`);
    }
}

export async function handleRemoveStudent(
    apiService: ApiService,
    classCode: string,
    studentId: string,
    studentName: string,
    postMessage: (message: any) => void
): Promise<void> {
    const confirmed = await vscode.window.showWarningMessage(
        `Xóa sinh viên ${studentName} khỏi lớp?`,
        { modal: true },
        'Xóa',
        'Hủy'
    );

    if (confirmed !== 'Xóa') {
        return;
    }

    try {
        await apiService.removeStudent(classCode, studentId);

        vscode.window.showInformationMessage(`Đã xóa sinh viên ${studentName}`);

        postMessage({
            type: 'studentRemoved',
            classCode,
            studentId
        });
    } catch (error: any) {
        vscode.window.showErrorMessage(`Lỗi xóa sinh viên: ${error.message}`);
    }
}

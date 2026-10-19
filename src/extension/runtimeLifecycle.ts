import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import simpleGit from 'simple-git';
import { ApiService } from '../services/apiService';
import { ClassroomViewProvider } from '../providers/classroomViewProvider';
import {
    ensureBaseDirectory,
    getCurrentAssignmentCodeFromWorkspace,
    getRoomData
} from '../utils/localWorkspaceStore';

export interface RuntimeLifecycleDeps {
    apiService: ApiService;
    classroomViewProvider: ClassroomViewProvider;
}

export function notifyFrontendOfCurrentWorkspace(
    context: vscode.ExtensionContext,
    deps: RuntimeLifecycleDeps
): void {
    try {
        const userData = context.globalState.get<any>('user_data');
        if (!userData?.userId) {
            return;
        }

        const assignmentCode = getCurrentAssignmentCodeFromWorkspace(context, userData.userId);
        if (!assignmentCode) {
            return;
        }

        deps.classroomViewProvider.notifyWorkspaceChanged(assignmentCode);
    } catch (error) {
        console.error('[Workspace] Failed to notify frontend of current workspace:', error);
    }
}

export async function tryOpenPendingNotificationFile(context: vscode.ExtensionContext): Promise<void> {
    try {
        const pending = context.globalState.get<any>('pending_notification_open_file');
        if (!pending?.assignmentCode || !pending?.studentFilePath) {
            return;
        }

        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const classInfo = context.globalState.get<any>('current_class') || {};
        if (!workspaceRoot || String(classInfo.assignmentCode || '') !== String(pending.assignmentCode)) {
            return;
        }

        const normalizedStudentFile = String(pending.studentFilePath).replace(/\\/g, '/');
        const candidates = [path.join(workspaceRoot, normalizedStudentFile)];

        if (classInfo.branch) {
            candidates.push(path.join(workspaceRoot, 'students', String(classInfo.branch), normalizedStudentFile));
        }

        const targetPath = candidates.find((candidate) => fs.existsSync(candidate));
        if (!targetPath) {
            return;
        }

        const document = await vscode.workspace.openTextDocument(targetPath);
        await vscode.window.showTextDocument(document, { preview: false });
        await context.globalState.update('pending_notification_open_file', undefined);
    } catch (error: any) {
        console.error('[Notification] Failed to open pending commented file:', error?.message || error);
    }
}

export async function restoreRuntimeState(
    context: vscode.ExtensionContext,
    deps: RuntimeLifecycleDeps
): Promise<void> {
    try {
        const token = context.globalState.get<string>('jwt_token');
        deps.apiService.setToken(token || null);

        const userData = context.globalState.get<any>('user_data');
        if (!userData?.userId) {
            return;
        }

        const assignmentCode = getCurrentAssignmentCodeFromWorkspace(context, userData.userId);
        if (!assignmentCode) {
            return;
        }

        const baseDirectory = await ensureBaseDirectory(context, userData.userId);
        if (!baseDirectory) {
            return;
        }

        const roomData = getRoomData(baseDirectory, userData.userId, assignmentCode);
        if (!roomData.found || !roomData.fullPath || !roomData.room) {
            return;
        }

        const role = roomData.room.branchName === 'teacher' ? 'teacher' : 'student';
        const roleSpecificKey = role === 'teacher'
            ? `assignment_${assignmentCode}`
            : `student_assignment_${assignmentCode}`;
        const roleSpecificInfo = context.globalState.get<any>(roleSpecificKey) || {};
        const currentClass = context.globalState.get<any>('current_class') || {};
        const currentClassMatches = String(currentClass.assignmentCode || '') === String(assignmentCode);

        await context.globalState.update('current_class', {
            assignmentCode,
            localPath: roomData.fullPath,
            repoUrl: roomData.room.repoUrl,
            branch: roomData.room.branchName,
            token: roleSpecificInfo.token || (currentClassMatches ? currentClass.token : undefined),
            role,
            deadline: roleSpecificInfo.deadline || (currentClassMatches ? currentClass.deadline : undefined)
        });
    } catch (error) {
        console.error('[Runtime] Failed to restore runtime state:', error);
    }
}

export async function checkGitInstalled(): Promise<void> {
    const git = simpleGit();
    try {
        await git.version();
        console.log('Git is installed');
    } catch (error) {
        vscode.window.showErrorMessage(
            'Git chưa được cài đặt! Extension cần Git để hoạt động.',
            'Hướng dẫn cài đặt'
        ).then(selection => {
            if (selection === 'Hướng dẫn cài đặt') {
                vscode.env.openExternal(vscode.Uri.parse('https://git-scm.com/downloads'));
            }
        });
    }
}

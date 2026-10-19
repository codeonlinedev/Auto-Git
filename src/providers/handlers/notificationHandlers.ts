import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ApiService } from '../../services/apiService';

export async function handleGetNotifications(
    apiService: ApiService,
    postMessage: (message: any) => void
): Promise<void> {
    try {
        const notifications = await apiService.getNotifications();
        postMessage({ type: 'notificationsLoaded', notifications });
    } catch (error: any) {
        postMessage({ type: 'notificationsError', error: error.message });
    }
}

export async function handleMarkNotificationAsRead(
    apiService: ApiService,
    notificationId: number,
    postMessage: (message: any) => void
): Promise<void> {
    try {
        await apiService.markNotificationAsRead(notificationId);
        postMessage({ type: 'notificationMarkedAsRead', notificationId });
    } catch (error: any) {
        console.error('[ClassroomViewProvider] markNotificationAsRead error:', error.message);
    }
}

export async function handleMarkAllNotificationsAsRead(
    apiService: ApiService,
    postMessage: (message: any) => void
): Promise<void> {
    try {
        await apiService.markAllNotificationsAsRead();
        postMessage({ type: 'allNotificationsMarkedAsRead' });
    } catch (error: any) {
        console.error('[ClassroomViewProvider] markAllNotificationsAsRead error:', error.message);
    }
}

export async function handleDeleteNotification(
    apiService: ApiService,
    notificationId: number,
    postMessage: (message: any) => void
): Promise<void> {
    try {
        await apiService.deleteNotification(notificationId);
        postMessage({ type: 'notificationDeleted', notificationId });
    } catch (error: any) {
        console.error('[ClassroomViewProvider] deleteNotification error:', error.message);
    }
}

function normalizePathForCompare(filePath: string): string {
    return path.normalize(filePath).replace(/\\/g, '/').toLowerCase();
}

async function closeOpenEditorForFile(filePath: string): Promise<void> {
    const targetPath = normalizePathForCompare(filePath);

    for (const group of vscode.window.tabGroups.all) {
        const matchingTabs = group.tabs.filter((tab) => {
            const input = tab.input;
            return input instanceof vscode.TabInputText &&
                normalizePathForCompare(input.uri.fsPath) === targetPath;
        });

        if (matchingTabs.length > 0) {
            await vscode.window.tabGroups.close(matchingTabs, true);
        }
    }
}

export async function handleOpenCommentedFileFromNotification(
    context: vscode.ExtensionContext,
    assignmentCode: string,
    studentFilePath: string,
    openAssignment: (assignmentCode: string) => Promise<void>
): Promise<void> {
    try {
        if (!assignmentCode || !studentFilePath) {
            return;
        }

        const normalizedFilePath = String(studentFilePath).replace(/\\/g, '/');
        const currentClass = context.globalState.get<any>('current_class') || {};
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

        if (workspaceRoot && String(currentClass.assignmentCode || '') === String(assignmentCode)) {
            const directCandidates = [
                path.join(workspaceRoot, normalizedFilePath)
            ];

            if (currentClass.branch) {
                directCandidates.push(path.join(workspaceRoot, 'students', String(currentClass.branch), normalizedFilePath));
            }

            const directTarget = directCandidates.find((candidate) => fs.existsSync(candidate));
            if (directTarget) {
                await closeOpenEditorForFile(directTarget);
                const document = await vscode.workspace.openTextDocument(directTarget);
                await vscode.window.showTextDocument(document, { preview: false });
                return;
            }
        }

        await context.globalState.update('pending_notification_open_file', {
            assignmentCode,
            studentFilePath: normalizedFilePath
        });

        await openAssignment(assignmentCode);
    } catch (error: any) {
        console.error('[ClassroomViewProvider] openCommentedFileFromNotification error:', error.message);
    }
}

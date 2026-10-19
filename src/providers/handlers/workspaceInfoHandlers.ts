import * as vscode from 'vscode';
import { createHash } from 'crypto';
import { AiChatRequest, ApiService, FileContext } from '../../services/apiService';
import { getCurrentAssignmentCodeFromWorkspace } from '../../utils/localWorkspaceStore';

function getRelativeFilePath(uri: vscode.Uri): string {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    if (!folder) {
        return uri.fsPath;
    }
    return vscode.workspace.asRelativePath(uri, false);
}

async function resolveWorkspaceFileUri(filePath: string): Promise<vscode.Uri | undefined> {
    const normalizedPath = String(filePath || '').trim().replace(/\\/g, '/');
    if (!normalizedPath) {
        return undefined;
    }

    const folders = vscode.workspace.workspaceFolders || [];
    for (const folder of folders) {
        const directCandidate = vscode.Uri.joinPath(folder.uri, normalizedPath);
        try {
            await vscode.workspace.fs.stat(directCandidate);
            return directCandidate;
        } catch {
            // Try next strategy
        }

        const prefix = `${folder.name}/`;
        if (normalizedPath.startsWith(prefix)) {
            const withoutPrefix = normalizedPath.slice(prefix.length);
            const prefixedCandidate = vscode.Uri.joinPath(folder.uri, withoutPrefix);
            try {
                await vscode.workspace.fs.stat(prefixedCandidate);
                return prefixedCandidate;
            } catch {
                // Continue fallback search
            }
        }
    }

    if (normalizedPath.includes(':') || normalizedPath.startsWith('/')) {
        const absoluteUri = vscode.Uri.file(normalizedPath);
        try {
            await vscode.workspace.fs.stat(absoluteUri);
            return absoluteUri;
        } catch {
            return undefined;
        }
    }

    return undefined;
}

export function notifyWorkspaceChanged(
    assignmentCode: string,
    postMessage: (message: any) => void
): void {
    console.log('[ClassroomViewProvider] Notifying webview of workspace change:', assignmentCode);
    postMessage({
        type: 'currentWorkspaceInfo',
        assignmentCode,
        role: 'student'
    });
}

export async function handleGetCurrentWorkspace(
    context: vscode.ExtensionContext,
    postMessage: (message: any) => void
): Promise<void> {
    try {
        const currentClass = context.globalState.get<any>('current_class');
        if (currentClass && currentClass.assignmentCode) {
            postMessage({
                type: 'currentWorkspaceInfo',
                assignmentCode: currentClass.assignmentCode,
                role: currentClass.role
            });
        }
    } catch (error) {
        console.error('[ClassroomViewProvider] Failed to get current workspace:', error);
    }
}

export async function handleRequestChatActiveFile(
    postMessage: (message: any) => void
): Promise<void> {
    try {
        const activeEditor = vscode.window.activeTextEditor;
        const filePath = activeEditor ? getRelativeFilePath(activeEditor.document.uri) : '';
        postMessage({
            type: 'chatActiveFile',
            filePath
        });
    } catch (error) {
        console.error('[ClassroomViewProvider] Failed to get active file for chat:', error);
        postMessage({
            type: 'chatActiveFile',
            filePath: ''
        });
    }
}

export async function handlePickWorkspaceFileForChat(
    postMessage: (message: any) => void
): Promise<void> {
    try {
        const files = await vscode.workspace.findFiles(
            '**/*',
            '**/{.git,node_modules,dist,out,target,build}/**',
            2000
        );

        if (!files.length) {
            postMessage({
                type: 'chatWorkspaceFilePicked',
                filePath: ''
            });
            return;
        }

        const quickPickItems = files.map((uri) => ({
            label: getRelativeFilePath(uri),
            uri
        }));

        const picked = await vscode.window.showQuickPick(quickPickItems, {
            placeHolder: 'Chon file de them vao chat context',
            matchOnDescription: true,
            matchOnDetail: true
        });

        postMessage({
            type: 'chatWorkspaceFilePicked',
            filePath: picked ? getRelativeFilePath(picked.uri) : ''
        });
    } catch (error) {
        console.error('[ClassroomViewProvider] Failed to pick workspace file for chat:', error);
        postMessage({
            type: 'chatWorkspaceFilePicked',
            filePath: ''
        });
    }
}

export async function handleOpenChatContextFile(filePath: string): Promise<void> {
    try {
        const targetUri = await resolveWorkspaceFileUri(filePath);
        if (!targetUri) {
            vscode.window.showWarningMessage('Không tìm thấy file trong workspace.');
            return;
        }

        const document = await vscode.workspace.openTextDocument(targetUri);
        await vscode.window.showTextDocument(document, { preview: false });
    } catch (error) {
        console.error('[ClassroomViewProvider] Failed to open chat context file:', error);
        vscode.window.showErrorMessage('Không mở được file từ chat context.');
    }
}

async function buildFileContext(filePath: string): Promise<FileContext | null> {
    const targetUri = await resolveWorkspaceFileUri(filePath);
    if (!targetUri) {
        return null;
    }

    const bytes = await vscode.workspace.fs.readFile(targetUri);
    const buffer = Buffer.from(bytes);
    const fileContent = buffer.toString('utf8');
    const hashcode = createHash('sha256').update(buffer).digest('hex');

    return {
        filename: getRelativeFilePath(targetUri),
        fileContent,
        hashcode
    };
}

export async function handleAskAiWithContext(
    apiService: ApiService,
    context: vscode.ExtensionContext,
    message: string,
    contextFiles: string[] | undefined,
    postMessage: (message: any) => void
): Promise<void> {
    try {
        const userData = context.globalState.get<any>('user_data');
        const assignmentCode = userData?.userId
            ? (getCurrentAssignmentCodeFromWorkspace(context, String(userData.userId)) || '')
            : '';
        const selectedFiles = Array.isArray(contextFiles) ? contextFiles : [];
        const dedupedFiles = Array.from(new Set(selectedFiles.map((item) => String(item || '').trim()).filter(Boolean)));

        const files: FileContext[] = [];
        for (const filePath of dedupedFiles) {
            const fileContext = await buildFileContext(filePath);
            if (fileContext) {
                files.push(fileContext);
            }
        }

        const payload: AiChatRequest = {
            message: String(message || ''),
            assignmentCode,
            files
        };

        await apiService.askAi(payload);
    } catch (error: any) {
        console.error('[ClassroomViewProvider] Failed to ask AI with context:', error);
        postMessage({
            type: 'aiAskFailed',
            error: error?.response?.data?.message || error?.message || 'Khong the gui yeu cau AI'
        });
    }
}

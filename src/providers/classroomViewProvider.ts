import * as vscode from 'vscode';
import { ApiService } from '../services/apiService';
import { GitService } from '../services/gitService';
import {
    handleDeleteNotification,
    handleGetNotifications,
    handleMarkAllNotificationsAsRead,
    handleMarkNotificationAsRead,
    handleOpenCommentedFileFromNotification
} from './handlers/notificationHandlers';
import {
    handleGetChatClassrooms,
    handleGetClassMessages,
    handleGetPrivateMessages,
    handleGetRecentPrivateChats,
    handleMarkMessageAsRead,
    handleSearchChatMembers
} from './handlers/chatHandlers';
import {
    handleAskAiWithContext,
    handleGetCurrentWorkspace,
    handleOpenChatContextFile,
    handlePickWorkspaceFileForChat,
    handleRequestChatActiveFile,
    notifyWorkspaceChanged
} from './handlers/workspaceInfoHandlers';
import {
    handleCreateClass,
    handleDeleteClass,
    handleJoinClass,
    handleLeaveClass,
    handleLoadMyClasses,
    handleLoadStudents,
    handleRemoveStudent
} from './handlers/classHandlers';
import {
    handleGoogleLogin,
    handleLogout,
    handleRequestOTP,
    handleRestoreState,
    handleVerifyOTP
} from './handlers/authHandlers';
import {
    AssignmentHandlerDeps,
    handleCreateAssignment,
    handleDeleteAssignment,
    handleExportAssignmentExcel,
    handleGetAssignments,
    handleGetAssignmentSubmissions,
    handleJoinAssignmentWithPrompt,
    handleOpenAssignment,
    handleUploadTaskTestCasesZip,
    viewTaskResult
} from './handlers/assignmentHandlers';
import { getBaseDirectoryKey } from '../utils/localWorkspaceStore';

export class ClassroomViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'autoGitClassroom.mainView';
    private _view?: vscode.WebviewView;
    private apiService: ApiService;
    private gitService: GitService;
    private _activeEditorChangeDisposable?: vscode.Disposable;

    private async _closeAllEditorsBeforeWorkspaceOpen() {
        try {
            await vscode.commands.executeCommand('workbench.action.closeAllEditors');
            console.log('[Workspace] Closed all editors before opening workspace/folder.');
        } catch (error: any) {
            console.warn('[Workspace] Failed to close editors before opening workspace/folder:', error?.message || error);
        }
    }

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _context: vscode.ExtensionContext,
        apiService: ApiService,
        gitService: GitService
    ) {
        this.apiService = apiService;
        this.gitService = gitService;
        this._activeEditorChangeDisposable = vscode.window.onDidChangeActiveTextEditor(() => {
            this._handleRequestChatActiveFile();
        });
    }

    private _getAssignmentHandlerDeps(): AssignmentHandlerDeps {
        return {
            apiService: this.apiService,
            gitService: this.gitService,
            context: this._context,
            postMessage: (message: any) => this._postMessage(message),
            closeAllEditorsBeforeWorkspaceOpen: () => this._closeAllEditorsBeforeWorkspaceOpen()
        };
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this._extensionUri, 'out', 'webview')
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        this._handleRequestChatActiveFile();

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(async (data) => {
            await this._handleMessage(data);
        });

        // Restore state if available - delay để đảm bảo webview đã load xong
        setTimeout(() => {
            this._restoreState();
        }, 100);
    }

    public notifyCodeCommentDraft(draftComment: any) {
        this._postMessage({
            type: 'codeCommentDraftCreated',
            data: draftComment
        });
    }

    public notifyCurrentFileCommentContext(context: any) {
        this._postMessage({
            type: 'currentFileCommentContext',
            data: context
        });
    }

    private async _handleMessage(message: any) {
        console.log('Extension received message:', message.type || message.command, message);
        switch (message.type || message.command) {
            case 'checkLoginStatus':
                await this._restoreState();
                break;

            case 'googleLogin':
                await this._handleGoogleLogin(message.role);
                break;

            case 'requestOtp':
                await this._handleRequestOTP(message.email);
                break;

            case 'verifyOtp':
                await this._handleVerifyOTP(message.email, message.otp, message.role);
                break;

            case 'logout':
                await this._handleLogout();
                break;

            case 'createClass':
                await this._handleCreateClass(message.className);
                break;

            case 'joinClass':
                await this._handleJoinClass(message.studentName, message.classCode);
                break;

            case 'createAssignment':
                await this._handleCreateAssignment(
                    message.classCode,
                    message.title,
                    message.description,
                    message.deadline,
                    message.tasks
                );
                break;

            case 'uploadTaskTestCasesZip':
                await this._handleUploadTaskTestCasesZip(message.assignmentCode, message.tasks);
                break;

            case 'joinAssignment':
                await this._handleJoinAssignmentWithPrompt(message.assignmentCode);
                break;

            case 'openAssignment':
                await this._handleOpenAssignment(message.assignmentCode);
                break;

            case 'loadMyClasses':
                await this._handleLoadMyClasses();
                break;

            case 'loadStudents':
                await this._handleLoadStudents(message.classCode);
                break;

            case 'deleteClass':
                await this._handleDeleteClass(message.classCode, message.className);
                break;

            case 'leaveClass':
                await this._handleLeaveClass(message.classCode, message.className, message.branchName);
                break;

            case 'getCurrentWorkspace':
                await this._handleGetCurrentWorkspace();
                break;

            case 'removeStudent':
                await this._handleRemoveStudent(message.classCode, message.studentId, message.studentName);
                break;

            case 'getAssignments':
                await this._handleGetAssignments(message.classCode);
                break;

            case 'getAssignmentSubmissions':
                await this._handleGetAssignmentSubmissions(message.assignmentCode);
                break;

            case 'exportAssignmentExcel':
                await this._handleExportAssignmentExcel(
                    message.assignmentId,
                    message.assignmentCode,
                    message.title
                );
                break;
            case 'deleteAssignment':
                await this._handleDeleteAssignment(message.assignmentCode, message.title);
                break;

            case 'getChatClassrooms':
                await this._handleGetChatClassrooms();
                break;

            case 'getRecentPrivateChats':
                await this._handleGetRecentPrivateChats();
                break;

            case 'searchChatMembers':
                await this._handleSearchChatMembers(message.query);
                break;

            case 'getPrivateMessages':
                await this._handleGetPrivateMessages(message.otherUserId);
                break;

            case 'getClassMessages':
                await this._handleGetClassMessages(message.classroomId);
                break;

            case 'markMessageAsRead':
                await this._handleMarkMessageAsRead(message.messageId);
                break;

            case 'requestChatActiveFile':
                await this._handleRequestChatActiveFile();
                break;

            case 'pickWorkspaceFileForChat':
                await this._handlePickWorkspaceFileForChat();
                break;

            case 'openChatContextFile':
                await this._handleOpenChatContextFile(message.filePath);
                break;

            case 'askAiWithContext':
                await this._handleAskAiWithContext(message.message, message.contextFiles);
                break;

            case 'getNotifications':
                await this._handleGetNotifications();
                break;

            case 'markNotificationAsRead':
                await this._handleMarkNotificationAsRead(message.notificationId);
                break;

            case 'markAllNotificationsAsRead':
                await this._handleMarkAllNotificationsAsRead();
                break;

            case 'deleteNotification':
                await this._handleDeleteNotification(message.notificationId);
                break;

            case 'openCommentedFileFromNotification':
                await this._handleOpenCommentedFileFromNotification(message.assignmentCode, message.studentFilePath);
                break;

            case 'loadSetting':
                await this._handleLoadSetting(message.userId);
                break;

            case 'viewResult':
                await this._handleViewResult(message.studentId, message.assignmentCode);
                break;

            case 'viewStudentCode':
                await this._handleViewStudentCode(message.sourceCode, message.language, message.taskName);
                break;
        }
    }

    private async _handleGoogleLogin(role: string) {
        await handleGoogleLogin(this.apiService, this._context, role, (message) => this._postMessage(message));
    }

    private async _handleRequestOTP(email: string) {
        await handleRequestOTP(this.apiService, email, (message) => this._postMessage(message));
    }

    private async _handleVerifyOTP(email: string, otp: string, role: string) {
        await handleVerifyOTP(this.apiService, this._context, email, otp, role, (message) => this._postMessage(message));
    }

    private async _handleLogout() {
        await handleLogout(this._context, this.apiService, (message) => this._postMessage(message));
    }

    private async _handleCreateClass(className: string) {
        await handleCreateClass(this.apiService, className, (message) => this._postMessage(message));
    }

    private async _handleJoinClass(studentName: string, classCode: string) {
        await handleJoinClass(this.apiService, studentName, classCode, (message) => this._postMessage(message));
    }

    private async _restoreState() {
        await handleRestoreState(this._context, this.apiService, !!this._view, (message) => this._postMessage(message));
    }

    private async _handleCreateAssignment(
        classCode: string,
        title: string,
        description: string,
        deadline: string,
        tasks: any[] = []
    ) {
        await handleCreateAssignment(this._getAssignmentHandlerDeps(), classCode, title, description, deadline, tasks);
    }

    private async _handleUploadTaskTestCasesZip(assignmentCode: string, tasks: any[]) {
        await handleUploadTaskTestCasesZip(this._getAssignmentHandlerDeps(), assignmentCode, tasks || []);
    }

    private async _handleJoinAssignmentWithPrompt(assignmentCode: string) {
        await handleJoinAssignmentWithPrompt(this._getAssignmentHandlerDeps(), assignmentCode);
    }

    private async _handleOpenAssignment(assignmentCode: string) {
        await handleOpenAssignment(this._getAssignmentHandlerDeps(), assignmentCode);
    }

    private async _handleRemoveStudent(classCode: string, studentId: string, studentName: string) {
        await handleRemoveStudent(this.apiService, classCode, studentId, studentName, (message) => this._postMessage(message));
    }

    private _postMessage(message: any) {
        if (this._view) {
            this._view.webview.postMessage(message);
        }
    }

    private async _handleLoadMyClasses() {
        await handleLoadMyClasses(this.apiService, this._context, (message) => this._postMessage(message));
    }

    private async _handleLoadStudents(classCode: string) {
        await handleLoadStudents(this.apiService, classCode, (message) => this._postMessage(message));
    }

    private async _handleDeleteClass(classCode: string, className?: string) {
        await handleDeleteClass(this.apiService, this._context, classCode, className, (message) => this._postMessage(message));
    }

    private async _handleLeaveClass(classCode: string, className?: string, branchName?: string) {
        await handleLeaveClass(this.apiService, classCode, className, branchName, (message) => this._postMessage(message));
    }

    private async _handleGetAssignments(classCode: string) {
        await handleGetAssignments(this._getAssignmentHandlerDeps(), classCode);
    }

    private async _handleExportAssignmentExcel(
        assignmentId: string,
        assignmentCode?: string,
        title?: string
    ) {
        await handleExportAssignmentExcel(this._getAssignmentHandlerDeps(), assignmentId, assignmentCode, title);
    }

    private async _handleGetAssignmentSubmissions(assignmentCode: string) {
        await handleGetAssignmentSubmissions(this._getAssignmentHandlerDeps(), assignmentCode);
    }

    private async _handleDeleteAssignment(assignmentCode: string, title?: string) {
        await handleDeleteAssignment(this._getAssignmentHandlerDeps(), assignmentCode, title);
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        // Load the compiled React bundle
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'webview.js')
        );

        const logoUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'uet.jpg')
        );

        const nonce = this._getNonce();

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} vscode-webview-resource: https: data: blob:; script-src 'nonce-${nonce}'; style-src ${webview.cspSource} 'unsafe-inline' https:; font-src ${webview.cspSource} https: data: vscode-webview-resource:; connect-src http://localhost:8080 ws://localhost:8080;">
                <title>Auto Submit</title>
                <script nonce="${nonce}">
                    window.__uetLogoUri = "${logoUri}";
                </script>
            </head>
            <body>
                <div id="root"></div>
                <script nonce="${nonce}" src="${scriptUri}"></script>
            </body>
            </html>`;
    }

    private _getNonce() {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    public notifyWorkspaceChanged(assignmentCode: string) {
        notifyWorkspaceChanged(assignmentCode, (message) => this._postMessage(message));
    }

    private async _handleGetCurrentWorkspace() {
        await handleGetCurrentWorkspace(this._context, (message) => this._postMessage(message));
    }

    private async _handleGetChatClassrooms() {
        await handleGetChatClassrooms(this.apiService, (message) => this._postMessage(message));
    }

    private async _handleGetRecentPrivateChats() {
        await handleGetRecentPrivateChats(this.apiService, (message) => this._postMessage(message));
    }

    private async _handleSearchChatMembers(query?: string) {
        await handleSearchChatMembers(this.apiService, query, (message) => this._postMessage(message));
    }

    private async _handleGetPrivateMessages(otherUserId: number) {
        await handleGetPrivateMessages(this.apiService, otherUserId, (message) => this._postMessage(message));
    }

    private async _handleGetClassMessages(classroomId: number) {
        await handleGetClassMessages(this.apiService, classroomId, (message) => this._postMessage(message));
    }

    private async _handleMarkMessageAsRead(messageId: number) {
        await handleMarkMessageAsRead(this.apiService, messageId);
    }

    private async _handleRequestChatActiveFile() {
        await handleRequestChatActiveFile((message) => this._postMessage(message));
    }

    private async _handlePickWorkspaceFileForChat() {
        await handlePickWorkspaceFileForChat((message) => this._postMessage(message));
    }

    private async _handleOpenChatContextFile(filePath: string) {
        await handleOpenChatContextFile(filePath);
    }

    private async _handleAskAiWithContext(message: string, contextFiles?: string[]) {
        await handleAskAiWithContext(this.apiService, this._context, message, contextFiles, (payload) => this._postMessage(payload));
    }

    private async _handleGetNotifications() {
        await handleGetNotifications(this.apiService, (message) => this._postMessage(message));
    }

    private async _handleMarkNotificationAsRead(notificationId: number) {
        await handleMarkNotificationAsRead(this.apiService, notificationId, (message) => this._postMessage(message));
    }

    private async _handleMarkAllNotificationsAsRead() {
        await handleMarkAllNotificationsAsRead(this.apiService, (message) => this._postMessage(message));
    }

    private async _handleDeleteNotification(notificationId: number) {
        await handleDeleteNotification(this.apiService, notificationId, (message) => this._postMessage(message));
    }

    private async _handleOpenCommentedFileFromNotification(assignmentCode: string, studentFilePath: string) {
        await handleOpenCommentedFileFromNotification(
            this._context,
            assignmentCode,
            studentFilePath,
            (targetAssignmentCode) => this._handleOpenAssignment(targetAssignmentCode)
        );
    }

    private async _handleLoadSetting(userId: string) {
        const key = getBaseDirectoryKey(userId);

        const savedBaseDirectory = this._context.globalState.get<string>(key);
        this._postMessage({
            type: 'settingLoaded',
            baseDirectory: savedBaseDirectory || 'Chưa thiết lập'
        });
    }

    private async _handleViewResult(studentId: number, assignmentCode: string) {
        await viewTaskResult(this._getAssignmentHandlerDeps(), studentId, assignmentCode);
    }

    private async _handleViewStudentCode(sourceCode: string, language: string, taskName: string) {
        const doc = await vscode.workspace.openTextDocument({
            content: sourceCode,
            language: language
        });
        await vscode.window.showTextDocument(doc, { preview: true });
    }
}

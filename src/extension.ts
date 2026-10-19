// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { ClassroomViewProvider } from './providers/classroomViewProvider';
import { ApiService } from './services/apiService';
import { GitService } from './services/gitService';
import { registerCodeCommentFeatures } from './extension/codeComments';
import {
	checkGitInstalled,
	notifyFrontendOfCurrentWorkspace,
	restoreRuntimeState,
	tryOpenPendingNotificationFile
} from './extension/runtimeLifecycle';

import {
	handleRunCode,
	handleSubmitCode
} from './extension/executeCode';

let classroomViewProvider: ClassroomViewProvider;
let apiService: ApiService;
let gitService: GitService;
async function closeAllOpenEditors() {
	try {
		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
		console.log('[Startup] Closed all open editors by default.');
	} catch (error: any) {
		console.warn('[Startup] Failed to close all editors:', error?.message || error);
	}
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
	console.log('Auto Git Classroom extension is now active!');
	checkGitInstalled();

	apiService = new ApiService('http://localhost:8080/api');
	gitService = new GitService();

	// Create and register webview provider
	classroomViewProvider = new ClassroomViewProvider(
		context.extensionUri,
		context,
		apiService,
		gitService
	);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			ClassroomViewProvider.viewType,
			classroomViewProvider,
			{
				webviewOptions: {
					retainContextWhenHidden: true
				}
			}
		)
	);

	const runtimeDeps = {
		apiService,
		gitService,
		classroomViewProvider
	};

	const codeComments = registerCodeCommentFeatures({
		context,
		apiService,
		classroomViewProvider
	});

	// Register commands
	const openClassroomCommand = vscode.commands.registerCommand(
		'auto-git.openClassroom',
		() => {
			vscode.commands.executeCommand('autoGitClassroom.mainView.focus');
		}
	);

	const inspectStateCmd = vscode.commands.registerCommand('auto-git.inspectGlobalState', () => {
		const keys = context.globalState.keys();
		console.log("=== TẤT CẢ KEYS TRONG GLOBAL STATE ===");

		keys.forEach(key => {
			const value = context.globalState.get(key);
			console.log(`Key: ${key} | Value:`, value);
		});

		vscode.window.showInformationMessage("Đã in globalState ra Debug Console!");
	});


	const logoutCommand = vscode.commands.registerCommand(
		'auto-git.logout',
		async () => {
			await context.globalState.update('jwt_token', undefined);
			await context.globalState.update('user_data', undefined);
			await context.globalState.update('current_class', undefined);
			apiService.setToken(null);
			vscode.window.showInformationMessage('Đã đăng xuất và xóa dữ liệu');
		}
	);

	const runCodeCommand = vscode.commands.registerCommand('codingrooms.runCode', async () => {
		const userData = context.globalState.get<{ userId: string }>('user_data');

		if (!userData || !userData.userId) {
			vscode.window.showErrorMessage('Vui lòng đăng nhập để thực hiện lệnh Run!');
			return;
		}

		await handleRunCode(
			runtimeDeps.apiService,
			userData.userId,
			context
		);
	});

	const submitCodeCommand = vscode.commands.registerCommand('codingrooms.submitCode', async () => {
		const userData = context.globalState.get<{ userId: string }>('user_data');

		if (!userData || !userData.userId) {
			vscode.window.showErrorMessage('Vui lòng đăng nhập để nộp bài!');
			return;
		}

		await handleSubmitCode(
			runtimeDeps.apiService,
			userData.userId,
			context
		);
	});

	context.subscriptions.push(
		inspectStateCmd,
		openClassroomCommand,
		logoutCommand,
		...codeComments.disposables,
		runCodeCommand,
		submitCodeCommand
	);

	await restoreRuntimeState(context, runtimeDeps);
	await closeAllOpenEditors();
	await tryOpenPendingNotificationFile(context);
	codeComments.setAutoLoadSuppressed(false);

	const initialEditor = vscode.window.activeTextEditor;
	codeComments.notifyCurrentFileCommentContext(initialEditor);
	await codeComments.loadAndRenderForEditor(initialEditor, 'initialActivation');

	// Listen for workspace folder changes to update UI
	const workspaceFoldersChangeListener = vscode.workspace.onDidChangeWorkspaceFolders(async () => {
		console.log('[DEBUG] Workspace folders changed, restoring state...');
		await restoreRuntimeState(context, runtimeDeps);
		await tryOpenPendingNotificationFile(context);
		codeComments.notifyCurrentFileCommentContext(vscode.window.activeTextEditor);
		await codeComments.loadAndRenderForEditor(vscode.window.activeTextEditor, 'onDidChangeWorkspaceFolders');
		notifyFrontendOfCurrentWorkspace(context, runtimeDeps);
	});

	context.subscriptions.push(workspaceFoldersChangeListener);
}

// This method is called when your extension is deactivated
export function deactivate() {
	console.log('Auto Git Classroom extension is now deactivated');
}

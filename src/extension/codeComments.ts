import * as vscode from 'vscode';
import simpleGit from 'simple-git';
import type { ClassroomViewProvider } from '../providers/classroomViewProvider';
import type { ApiService } from '../services/apiService';
import { getBaseDirectoryKey, getRoomData } from '../utils/localWorkspaceStore';

type WorktreeBranchMap = Map<string, string>;

interface FileCommentContext {
	assignmentCode: string;
	targetBranch: string;
	studentFilePath: string;
}

export interface CodeCommentFeatureDeps {
	context: vscode.ExtensionContext;
	apiService: ApiService;
	classroomViewProvider: ClassroomViewProvider;
}

export interface CodeCommentController {
	readonly disposables: vscode.Disposable[];
	setAutoLoadSuppressed(suppressed: boolean): void;
	notifyCurrentFileCommentContext(editor?: vscode.TextEditor): Promise<void>;
	loadAndRenderForEditor(editor: vscode.TextEditor | undefined, triggerSource?: string): Promise<void>;
}

function isTeacherRole(context: vscode.ExtensionContext): boolean {
	const classInfo = context.globalState.get<any>('current_class') || {};
	return String(classInfo.role || '').toLowerCase() === 'teacher';
}

class SelectionCommentCodeLensProvider implements vscode.CodeLensProvider {
	constructor(private readonly context: vscode.ExtensionContext) { }

	private readonly _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
	public readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

	refresh() {
		this._onDidChangeCodeLenses.fire();
	}

	provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
		const editor = vscode.window.activeTextEditor;
		if (!editor || editor.document.uri.toString() !== document.uri.toString()) {
			return [];
		}

		if (!isTeacherRole(this.context)) {
			return [];
		}

		if (editor.selection.isEmpty) {
			return [];
		}

		const line = editor.selection.start.line;
		return [
			new vscode.CodeLens(new vscode.Range(line, 0, line, 0), {
				title: '$(comment-discussion) Comment selected code',
				command: 'auto-git.createCodeCommentFromSelection'
			})
		];
	}
}

function normalizePathForCompare(input: string): string {
	return input.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

function truncateForInlineComment(text: string, maxLen: number = 72): string {
	if (!text) {
		return '';
	}
	const compact = text.replace(/\s+/g, ' ').trim();
	return compact.length > maxLen ? `${compact.slice(0, maxLen)}...` : compact;
}

function buildResolveCommandUri(comment: any, fileContext: FileCommentContext): vscode.Uri {
	const args = [{
		commentId: comment.id,
		assignmentCode: fileContext.assignmentCode,
		targetBranch: fileContext.targetBranch,
		studentFilePath: fileContext.studentFilePath
	}];
	return vscode.Uri.parse(`command:auto-git.resolveCodeComment?${encodeURIComponent(JSON.stringify(args))}`);
}

class CodeCommentControllerImpl implements CodeCommentController {
	public readonly disposables: vscode.Disposable[] = [];

	private cachedWorktreeBranchMap: WorktreeBranchMap = new Map();
	private cachedWorktreeRepoRoot = '';
	private lastCommentFetchKey = '';
	private lastCommentFetchAt = 0;
	private readonly inFlightCommentFetches = new Map<string, Promise<void>>();
	private suppressAutoLoad = true;
	private readonly selectionCommentCodeLensProvider: SelectionCommentCodeLensProvider;
	private readonly commentDecorationType: vscode.TextEditorDecorationType;
	private readonly rangeHighlightDecorationType: vscode.TextEditorDecorationType;

	constructor(private readonly deps: CodeCommentFeatureDeps) {
		this.selectionCommentCodeLensProvider = new SelectionCommentCodeLensProvider(deps.context);
		this.commentDecorationType = vscode.window.createTextEditorDecorationType({
			after: {
				margin: '0 0 0 3.2rem',
				fontStyle: 'normal',
				fontWeight: '700'
			},
			light: {
				after: {
					backgroundColor: 'rgba(37, 99, 235, 0.15)',
					color: '#1e40af'
				}
			},
			dark: {
				after: {
					backgroundColor: 'rgba(37, 99, 235, 0.25)',
					color: '#bfdbfe'
				}
			}
		});
		this.rangeHighlightDecorationType = vscode.window.createTextEditorDecorationType({
			light: {
				backgroundColor: 'rgba(56, 189, 248, 0.3)'
			},
			dark: {
				backgroundColor: 'rgba(56, 189, 248, 0.24)'
			}
		});
	}

	register(): void {
		const createCodeCommentCommand = vscode.commands.registerCommand(
			'auto-git.createCodeCommentFromSelection',
			() => this.createCodeCommentFromSelection()
		);

		const resolveCodeCommentCommand = vscode.commands.registerCommand(
			'auto-git.resolveCodeComment',
			(args?: { commentId: number; assignmentCode: string; targetBranch: string; studentFilePath: string }) => this.resolveCodeComment(args)
		);

		const codelensProviderRegistration = vscode.languages.registerCodeLensProvider(
			{ scheme: 'file' },
			this.selectionCommentCodeLensProvider
		);

		const selectionChangeListener = vscode.window.onDidChangeTextEditorSelection(() => {
			this.selectionCommentCodeLensProvider.refresh();
		});

		const activeEditorChangeListener = vscode.window.onDidChangeActiveTextEditor((editor) => {
			this.selectionCommentCodeLensProvider.refresh();
			if (this.suppressAutoLoad) {
				return;
			}
			this.notifyCurrentFileCommentContext(editor);
			this.loadAndRenderForEditor(editor, 'onDidChangeActiveTextEditor');
		});

		this.disposables.push(
			createCodeCommentCommand,
			resolveCodeCommentCommand,
			codelensProviderRegistration,
			selectionChangeListener,
			activeEditorChangeListener,
			this.commentDecorationType,
			this.rangeHighlightDecorationType
		);
	}

	setAutoLoadSuppressed(suppressed: boolean): void {
		this.suppressAutoLoad = suppressed;
	}

	async notifyCurrentFileCommentContext(editor?: vscode.TextEditor): Promise<void> {
		const fileContext = await this.resolveCurrentFileCommentContext(editor);
		if (!fileContext) {
			return;
		}

		this.deps.classroomViewProvider.notifyCurrentFileCommentContext(fileContext);
	}

	async loadAndRenderForEditor(
		editor: vscode.TextEditor | undefined,
		triggerSource: string = 'unknown'
	): Promise<void> {
		if (!editor || editor.document.uri.scheme !== 'file') {
			return;
		}

		const fileContext = await this.resolveCurrentFileCommentContext(editor);
		if (!fileContext) {
			editor.setDecorations(this.commentDecorationType, []);
			editor.setDecorations(this.rangeHighlightDecorationType, []);
			return;
		}

		const fetchKey = `${fileContext.assignmentCode}|${fileContext.targetBranch}|${fileContext.studentFilePath}|${editor.document.uri.fsPath}`;
		const now = Date.now();
		const existingInFlight = this.inFlightCommentFetches.get(fetchKey);
		if (existingInFlight) {
			console.log(`[Comment] Skip duplicate in-flight fetch (${triggerSource}) -> ${fetchKey}`);
			await existingInFlight;
			return;
		}

		if (fetchKey === this.lastCommentFetchKey && now - this.lastCommentFetchAt < 700) {
			console.log(`[Comment] Skip rapid duplicate fetch (${triggerSource}) -> ${fetchKey}`);
			return;
		}

		const fetchTask = this.fetchAndRenderComments(editor, fileContext, fetchKey, triggerSource);
		this.inFlightCommentFetches.set(fetchKey, fetchTask);
		await fetchTask;
	}

	private async createCodeCommentFromSelection(): Promise<void> {
		const { context, apiService, classroomViewProvider } = this.deps;
		if (!isTeacherRole(context)) {
			vscode.window.showWarningMessage('Chỉ giáo viên mới có thể tạo comment trên code.');
			return;
		}

		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showWarningMessage('Không tìm thấy editor đang mở.');
			return;
		}

		const selection = editor.selection;
		if (selection.isEmpty) {
			vscode.window.showWarningMessage('Hãy bôi đen đoạn code trước khi comment.');
			return;
		}

		const selectedText = editor.document.getText(selection);
		const comment = await vscode.window.showInputBox({
			prompt: 'Nhập comment cho đoạn code đã chọn',
			placeHolder: 'Ví dụ: Đoạn này cần xử lý null'
		});

		if (!comment || !comment.trim()) {
			return;
		}

		const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		if (!workspaceRoot) {
			vscode.window.showWarningMessage('Không tìm thấy workspace hiện tại để xác định branch.');
			return;
		}

		const classInfo = context.globalState.get<any>('current_class') || {};
		const assignmentCode = classInfo.assignmentCode || null;

		const relativeFilePath = vscode.workspace.asRelativePath(editor.document.uri, false).replace(/\\/g, '/');
		const studentFilePath = relativeFilePath.startsWith('students/')
			? relativeFilePath.split('/').slice(2).join('/')
			: relativeFilePath;

		let targetBranch: string | null = null;
		try {
			targetBranch = await this.resolveBranchForEditorFile(workspaceRoot, editor);
		} catch (error: any) {
			console.error('[Comment] Failed to resolve worktree branch:', error?.message || error);
		}

		if (!targetBranch) {
			vscode.window.showWarningMessage('Không xác định được branch của file này. Hãy sync workspace và mở file trong students/.');
			return;
		}

		const draftComment = {
			assignmentCode,
			targetBranch,
			filePath: relativeFilePath,
			studentFilePath,
			startLine: selection.start.line + 1,
			startColumn: selection.start.character + 1,
			endLine: selection.end.line + 1,
			endColumn: selection.end.character + 1,
			selectedText,
			comment: comment.trim(),
			createdAt: new Date().toISOString()
		};

		try {
			await apiService.createCodeComment(draftComment);
			await this.loadAndRenderForEditor(editor, 'createCodeCommentCommand');
			classroomViewProvider.notifyCurrentFileCommentContext({
				assignmentCode,
				targetBranch,
				studentFilePath
			});
		} catch (error: any) {
			vscode.window.showErrorMessage(`Tạo comment thất bại: ${error?.message || error}`);
		}
	}

	private async resolveCodeComment(args?: { commentId: number; assignmentCode: string; targetBranch: string; studentFilePath: string }): Promise<void> {
		if (!args || !args.commentId) {
			return;
		}

		try {
			await this.deps.apiService.resolveCodeComment(args.commentId);
			await this.loadAndRenderForEditor(vscode.window.activeTextEditor, 'resolveCodeCommentCommand');
			vscode.window.showInformationMessage('Đã resolve comment.');
		} catch (error: any) {
			vscode.window.showErrorMessage(`Resolve comment thất bại: ${error?.message || error}`);
		}
	}

	private async fetchAndRenderComments(
		editor: vscode.TextEditor,
		fileContext: FileCommentContext,
		fetchKey: string,
		triggerSource: string
	): Promise<void> {
		console.log(`[Comment] Fetch triggered by ${triggerSource} -> ${fetchKey}`);
		try {
			const comments = await this.deps.apiService.getCodeComments(
				fileContext.assignmentCode,
				fileContext.targetBranch,
				fileContext.studentFilePath
			);

			const decorations: vscode.DecorationOptions[] = comments
				.map((comment: any) => this.toCommentDecoration(editor, comment, fileContext))
				.filter((item: vscode.DecorationOptions | null): item is vscode.DecorationOptions => item !== null);

			const highlightedRanges: vscode.Range[] = comments
				.map((comment: any) => this.toHighlightedRange(editor, comment))
				.filter((range: vscode.Range | null): range is vscode.Range => range !== null);

			editor.setDecorations(this.commentDecorationType, decorations);
			editor.setDecorations(this.rangeHighlightDecorationType, highlightedRanges);
		} catch (error: any) {
			console.error('[Comment] Failed to load/render comments:', error?.message || error);
			editor.setDecorations(this.commentDecorationType, []);
			editor.setDecorations(this.rangeHighlightDecorationType, []);
		} finally {
			this.lastCommentFetchKey = fetchKey;
			this.lastCommentFetchAt = Date.now();
			this.inFlightCommentFetches.delete(fetchKey);
		}
	}

	private toCommentDecoration(
		editor: vscode.TextEditor,
		comment: any,
		fileContext: FileCommentContext
	): vscode.DecorationOptions | null {
		const lineIndex = Math.max((comment.startLine || 1) - 1, 0);
		if (lineIndex >= editor.document.lineCount) {
			return null;
		}

		const startLine = Math.max((comment.startLine || 1) - 1, 0);
		const endLine = Math.min(Math.max((comment.endLine || comment.startLine || 1) - 1, startLine), editor.document.lineCount - 1);

		let anchorLine = startLine;
		let anchorLength = editor.document.lineAt(startLine).text.length;
		for (let i = startLine; i <= endLine; i++) {
			const len = editor.document.lineAt(i).text.length;
			if (len > anchorLength) {
				anchorLength = len;
				anchorLine = i;
			}
		}

		const range = new vscode.Range(anchorLine, anchorLength, anchorLine, anchorLength);
		const author = comment.authorName || 'Teacher';
		const content = comment.content || '';
		const resolveUri = buildResolveCommandUri(comment, fileContext);
		const hover = new vscode.MarkdownString(
			`**${author}**  \n\n${content}  \n\n[✓ Đồng ý](${resolveUri.toString()})`
		);
		hover.isTrusted = true;

		return {
			range,
			hoverMessage: hover,
			renderOptions: {
				after: {
					contentText: `   ${author}: ${truncateForInlineComment(content, 96)}   `
				}
			}
		};
	}

	private toHighlightedRange(editor: vscode.TextEditor, comment: any): vscode.Range | null {
		const startLine = Math.max((comment.startLine || 1) - 1, 0);
		const startChar = Math.max((comment.startColumn || 1) - 1, 0);
		const endLine = Math.max((comment.endLine || comment.startLine || 1) - 1, 0);
		const endChar = Math.max((comment.endColumn || comment.startColumn || 1) - 1, 0);

		if (startLine >= editor.document.lineCount) {
			return null;
		}

		const safeEndLine = Math.min(endLine, editor.document.lineCount - 1);
		const safeStartLine = Math.min(startLine, safeEndLine);
		const safeEndChar = Math.min(endChar, editor.document.lineAt(safeEndLine).text.length);
		const safeStartChar = Math.min(startChar, editor.document.lineAt(safeStartLine).text.length);

		return new vscode.Range(safeStartLine, safeStartChar, safeEndLine, safeEndChar);
	}

	private async resolveCurrentFileCommentContext(editor?: vscode.TextEditor): Promise<FileCommentContext | null> {
		if (!editor || editor.document.uri.scheme !== 'file') {
			return null;
		}

		const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		if (!workspaceRoot) {
			return null;
		}

		const classInfo = this.deps.context.globalState.get<any>('current_class') || {};
		const assignmentCode = classInfo.assignmentCode || null;
		if (!assignmentCode) {
			return null;
		}

		const relativeFilePath = vscode.workspace.asRelativePath(editor.document.uri, false).replace(/\\/g, '/');
		const studentFilePath = relativeFilePath.startsWith('students/')
			? relativeFilePath.split('/').slice(2).join('/')
			: relativeFilePath;

		const role = String(classInfo.role || '').toLowerCase();
		let targetBranch: string | null = null;

		if (role === 'student') {
			targetBranch = this.resolveStudentBranchFromCodingRooms(assignmentCode);
		} else {
			try {
				targetBranch = await this.resolveBranchForEditorFile(workspaceRoot, editor);
			} catch (error: any) {
				console.error('[Comment] Failed to load worktree context:', error?.message || error);
			}
		}

		if (!targetBranch) {
			return null;
		}

		return {
			assignmentCode,
			targetBranch,
			studentFilePath
		};
	}

	private resolveStudentBranchFromCodingRooms(assignmentCode: string): string | null {
		try {
			const userData = this.deps.context.globalState.get<any>('user_data') || {};
			const userId = userData.userId ? String(userData.userId) : '';
			if (!userId) {
				return null;
			}

			const baseDirectoryKey = getBaseDirectoryKey(userId);
			const baseDirectory = this.deps.context.globalState.get<string>(baseDirectoryKey);
			if (!baseDirectory) {
				return null;
			}

			const roomData = getRoomData(baseDirectory, userId, assignmentCode);
			const branchName = roomData.room?.branchName?.trim();
			return branchName || null;
		} catch (error: any) {
			console.warn('[Comment] Failed to resolve student branch from .coding-rooms.json:', error?.message || error);
			return null;
		}
	}

	private async resolveBranchForEditorFile(workspaceRoot: string, editor: vscode.TextEditor): Promise<string | null> {
		const worktreeMap = await this.refreshWorktreeBranchMap(workspaceRoot);
		return this.findBranchForFile(editor.document.uri.fsPath, worktreeMap);
	}

	private async refreshWorktreeBranchMap(repoRoot: string, forceRefresh: boolean = false): Promise<WorktreeBranchMap> {
		const normalizedRoot = normalizePathForCompare(repoRoot);
		if (!forceRefresh && this.cachedWorktreeRepoRoot === normalizedRoot && this.cachedWorktreeBranchMap.size > 0) {
			return this.cachedWorktreeBranchMap;
		}

		const git = simpleGit(repoRoot);
		const porcelain = await git.raw(['worktree', 'list', '--porcelain']);
		const blocks = porcelain.split(/\r?\n\r?\n/);
		const parsedMap: WorktreeBranchMap = new Map();

		for (const block of blocks) {
			const lines = block.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
			const worktreeLine = lines.find(l => l.startsWith('worktree '));
			const branchLine = lines.find(l => l.startsWith('branch '));
			if (!worktreeLine || !branchLine) {
				continue;
			}

			const worktreePath = worktreeLine.replace('worktree ', '').trim();
			const fullRef = branchLine.replace('branch ', '').trim();
			const branchName = fullRef.replace(/^refs\/heads\//, '');

			parsedMap.set(normalizePathForCompare(worktreePath), branchName);
		}

		this.cachedWorktreeRepoRoot = normalizedRoot;
		this.cachedWorktreeBranchMap = parsedMap;
		return parsedMap;
	}

	private findBranchForFile(filePath: string, worktreeMap: WorktreeBranchMap): string | null {
		const normalizedFile = normalizePathForCompare(filePath);
		let bestMatchPath = '';
		let bestMatchBranch: string | null = null;

		for (const [worktreePath, branch] of worktreeMap.entries()) {
			if (normalizedFile.startsWith(worktreePath) && worktreePath.length > bestMatchPath.length) {
				bestMatchPath = worktreePath;
				bestMatchBranch = branch;
			}
		}

		return bestMatchBranch;
	}
}

export function registerCodeCommentFeatures(deps: CodeCommentFeatureDeps): CodeCommentController {
	const controller = new CodeCommentControllerImpl(deps);
	controller.register();
	return controller;
}

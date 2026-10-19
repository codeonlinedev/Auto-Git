import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as os from 'os';

export interface RoomEntry {
    relativePath: string;
    repoUrl: string;
    branchName: string;
    joinedAt: string;
    lastOpened: string;
    status: 'active' | 'missing';
}

interface CodingRoomsData {
    version: number;
    userId: string;
    createdAt: string;
    updatedAt: string;
    rooms: Record<string, RoomEntry>;
}

const CONFIG_FILE = '.coding-rooms.json';

function normalizeRelative(relativePath: string): string {
    return relativePath.replace(/\\/g, '/');
}

export function getBaseDirectoryKey(userId: string): string {
    return `base_directory_${userId}`;
}

export function getConfigPath(baseDirectory: string): string {
    return path.join(baseDirectory, CONFIG_FILE);
}

export async function ensureBaseDirectory(
    context: vscode.ExtensionContext,
    userId: string
): Promise<string | null> {
    const key = getBaseDirectoryKey(userId);
    const savedBaseDirectory = context.globalState.get<string>(key);

    if (savedBaseDirectory && fs.existsSync(savedBaseDirectory)) {
        ensureConfigInitialized(savedBaseDirectory, userId);
        return savedBaseDirectory;
    }

    try {
        const appDataPath = process.env.APPDATA ||
            (process.platform === 'darwin'
                ? path.join(os.homedir(), 'Library', 'Application Support')
                : path.join(os.homedir(), '.config'));

        const autoGitPath = path.join(appDataPath, 'AutoGit', userId);

        if (!fs.existsSync(autoGitPath)) {
            fs.mkdirSync(autoGitPath, { recursive: true });
        }

        await context.globalState.update(key, autoGitPath);

        ensureConfigInitialized(autoGitPath, userId);
        return autoGitPath;

    } catch (error) {
        vscode.window.showErrorMessage(`Lỗi khi khởi tạo thư mục lưu trữ: ${error}`);
        return null;
    }
}

export function getCurrentAssignmentCodeFromWorkspace(
    context: vscode.ExtensionContext,
    userId: string
): string | null {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) return null;

    const currentWorkspacePath = path.normalize(workspaceFolders[0].uri.fsPath).toLowerCase();

    const key = getBaseDirectoryKey(userId);
    const baseDirectory = context.globalState.get<string>(key);
    if (!baseDirectory || !fs.existsSync(baseDirectory)) return null;

    try {
        const config = loadConfig(baseDirectory, userId);
        for (const [assignmentCode, room] of Object.entries(config.rooms)) {

            const resolved = resolvePathInBaseDirectory(baseDirectory, room.relativePath);

            if (resolved.ok) {
                const roomFullPath = path.normalize(resolved.fullPath).toLowerCase();
                if (currentWorkspacePath === roomFullPath) {
                    return assignmentCode;
                }
            }
        }
    } catch (error) {
        console.error('Lỗi khi đọc config để tìm Assignment Code:', error);
    }

    return null;
}

export function loadConfig(baseDirectory: string, userId: string): CodingRoomsData {
    ensureConfigInitialized(baseDirectory, userId);
    const configPath = getConfigPath(baseDirectory);

    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as any;

    if (parsed.version !== 1 || !parsed.rooms || String(parsed.userId) !== String(userId)) {
        throw new Error('File .coding-rooms.json không hợp lệ hoặc không đúng user.');
    }

    const migrated: CodingRoomsData = {
        version: 1,
        userId: String(parsed.userId),
        createdAt: parsed.createdAt || parsed.updatedAt || new Date().toISOString(),
        updatedAt: parsed.updatedAt || new Date().toISOString(),
        rooms: {}
    };

    for (const [repoId, roomAny] of Object.entries(parsed.rooms as Record<string, any>)) {
        const room = roomAny as any;
        const now = new Date().toISOString();

        migrated.rooms[repoId] = {
            relativePath: normalizeRelative(room.relativePath || ''),
            repoUrl: room.repoUrl || '',
            branchName: room.branchName || (room.role === 'teacher' ? 'teacher' : ''),
            joinedAt: room.joinedAt || room.openedAt || now,
            lastOpened: room.lastOpened || room.openedAt || now,
            status: room.status === 'missing' ? 'missing' : 'active'
        };
    }

    for (const room of Object.values(migrated.rooms)) {
        if (!room.branchName || !room.branchName.trim()) {
            room.branchName = 'teacher';
        }
    }

    return migrated;
}

export function upsertRoom(
    baseDirectory: string,
    userId: string,
    repoId: string,
    relativePath: string,
    repoUrl: string,
    branchName: string
): void {
    const config = loadConfig(baseDirectory, userId);
    const now = new Date().toISOString();
    const existing = config.rooms[repoId];

    config.rooms[repoId] = {
        relativePath: normalizeRelative(relativePath),
        repoUrl,
        branchName,
        joinedAt: existing?.joinedAt || now,
        lastOpened: now,
        status: 'active'
    };
    config.updatedAt = now;

    writeConfigAtomic(baseDirectory, config);
}

export function markLastOpen(baseDirectory: string, userId: string, repoId: string): void {
    const config = loadConfig(baseDirectory, userId);
    const room = config.rooms[repoId];
    if (!room) {
        return;
    }

    const now = new Date().toISOString();
    room.lastOpened = now;
    config.updatedAt = now;
    writeConfigAtomic(baseDirectory, config);
}

export function removeRoom(baseDirectory: string, userId: string, repoId: string): boolean {
    const config = loadConfig(baseDirectory, userId);
    if (!config.rooms[repoId]) {
        return false;
    }

    delete config.rooms[repoId];
    config.updatedAt = new Date().toISOString();
    writeConfigAtomic(baseDirectory, config);
    return true;
}

export function removeRoomsByClassCode(baseDirectory: string, userId: string, classCode: string): number {
    const config = loadConfig(baseDirectory, userId);
    const normalizedPrefix = `${classCode.replace(/\\/g, '/')}/`;

    const roomIdsToDelete = Object.entries(config.rooms)
        .filter(([, room]) => normalizeRelative(room.relativePath).startsWith(normalizedPrefix))
        .map(([repoId]) => repoId);

    if (roomIdsToDelete.length === 0) {
        return 0;
    }

    for (const repoId of roomIdsToDelete) {
        delete config.rooms[repoId];
    }

    config.updatedAt = new Date().toISOString();
    writeConfigAtomic(baseDirectory, config);
    return roomIdsToDelete.length;
}

export function getRoomData(
    baseDirectory: string,
    userId: string,
    repoId: string
): { found: boolean; fullPath?: string; room?: RoomEntry; error?: string } {
    const config = loadConfig(baseDirectory, userId);
    const room = config.rooms[repoId];

    if (!room) {
        return { found: false };
    }

    const resolved = resolvePathInBaseDirectory(baseDirectory, room.relativePath);
    if (!resolved.ok) {
        return { found: true, error: resolved.error };
    }

    return { found: true, fullPath: resolved.fullPath, room };
}

export function getRoomAbsolutePath(
    baseDirectory: string,
    userId: string,
    repoId: string
): { found: boolean; fullPath?: string; error?: string } {
    const roomData = getRoomData(baseDirectory, userId, repoId);
    if (!roomData.found) {
        return { found: false };
    }

    if (roomData.error) {
        return { found: true, error: roomData.error };
    }

    return { found: true, fullPath: roomData.fullPath };
}

export function sortAssignmentsByLastOpen<T extends { assignmentCode?: string }>(
    assignments: T[],
    baseDirectory: string,
    userId: string
): T[] {
    const config = loadConfig(baseDirectory, userId);

    return [...assignments].sort((a, b) => {
        const aCode = a.assignmentCode || '';
        const bCode = b.assignmentCode || '';

        const aOpened = config.rooms[aCode]?.lastOpened || '';
        const bOpened = config.rooms[bCode]?.lastOpened || '';

        return bOpened.localeCompare(aOpened);
    });
}

function ensureConfigInitialized(baseDirectory: string, userId: string): void {
    if (!fs.existsSync(baseDirectory)) {
        fs.mkdirSync(baseDirectory, { recursive: true });
    }

    const configPath = getConfigPath(baseDirectory);
    if (fs.existsSync(configPath)) {
        return;
    }

    const initialData: CodingRoomsData = {
        version: 1,
        userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        rooms: {}
    };

    writeConfigAtomic(baseDirectory, initialData);
}

function writeConfigAtomic(baseDirectory: string, data: CodingRoomsData): void {
    const configPath = getConfigPath(baseDirectory);
    const tempPath = `${configPath}.tmp`;

    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempPath, configPath);
}

function resolvePathInBaseDirectory(
    baseDirectory: string,
    relativePath: string
): { ok: true; fullPath: string } | { ok: false; error: string } {
    const normalizedRelative = path.normalize(relativePath);

    if (path.isAbsolute(normalizedRelative)) {
        return { ok: false, error: 'Relative path không hợp lệ (absolute path).' };
    }

    const fullPath = path.resolve(baseDirectory, normalizedRelative);
    const baseResolved = path.resolve(baseDirectory);
    const relativeCheck = path.relative(baseResolved, fullPath);

    if (relativeCheck.startsWith('..') || path.isAbsolute(relativeCheck)) {
        return { ok: false, error: 'Phát hiện path traversal, đã chặn mở thư mục.' };
    }

    return { ok: true, fullPath };
}

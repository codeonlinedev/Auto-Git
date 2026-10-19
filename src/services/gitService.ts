import simpleGit, { SimpleGit } from 'simple-git';
import * as path from 'path';
import * as fs from 'fs';

export interface CloneOptions {
    repoUrl: string;
    branch: string;
    token: string;
    localPath: string;
}

export interface TeacherWorkspaceStudent {
    studentName?: string;
    branchName?: string;
}

export interface SyncTeacherWorkspaceOptions {
    localPath: string;
    students: TeacherWorkspaceStudent[];
    repoUrl?: string;
    token?: string;
}

export class GitService {
    private git: SimpleGit | null = null;
    private token: string | null = null;
    private repoUrl: string | null = null;

    async cloneRepository(options: CloneOptions): Promise<void> {
        try {
            if (!fs.existsSync(options.localPath)) {
                fs.mkdirSync(options.localPath, { recursive: true });
            }

            const authenticatedUrl = this.buildAuthenticatedUrl(options.repoUrl, options.token);

            console.log(`Cloning repository to ${options.localPath}...`);
            await simpleGit().clone(authenticatedUrl, options.localPath, ['--branch', options.branch]);

            this.git = simpleGit(options.localPath);
            this.token = options.token;
            this.repoUrl = options.repoUrl;

            await this.configureGit();
            console.log(`Repository setup completed on branch: ${options.branch}`);
        } catch (error: any) {
            throw new Error(`Failed to clone repository: ${error.message}`);
        }
    }

    async syncTeacherWorkspace(options: SyncTeacherWorkspaceOptions): Promise<void> {
        try {
            if (!fs.existsSync(options.localPath)) {
                throw new Error(`Workspace does not exist: ${options.localPath}. Please setup workspace first.`);
            }

            this.git = simpleGit(options.localPath);

            if (options.token) this.token = options.token;
            if (options.repoUrl) this.repoUrl = options.repoUrl;

            await this.configureGit();
            await this.setAuthenticatedRemoteIfAvailable();

            await this.git.fetch(['--all']);
            await this.git.pull('origin', 'teacher');

            const studentsRoot = path.join(options.localPath, 'students');
            if (!fs.existsSync(studentsRoot)) {
                fs.mkdirSync(studentsRoot, { recursive: true });
            }

            for (const student of options.students) {
                const branchName = student.branchName?.trim();
                if (!branchName) {
                    continue;
                }

                const studentFolderName = this.sanitizeStudentFolderName(student.studentName || branchName);
                const worktreePath = path.join(studentsRoot, studentFolderName);

                try {
                    await this.syncStudentWorktree(options.localPath, worktreePath, branchName);
                } catch (error: any) {
                    console.warn(`[Git] Failed to sync student branch ${branchName}:`, error?.message || error);
                }
            }
        } catch (error: any) {
            throw new Error(`Sync teacher workspace failed: ${error.message}`);
        }
    }

    private async configureGit(): Promise<void> {
        if (!this.git) return;

        try {
            const globalName = await this.git.raw(['config', '--global', 'user.name']).catch(() => '');
            const globalEmail = await this.git.raw(['config', '--global', 'user.email']).catch(() => '');

            if (!globalName.trim()) {
                await this.git.addConfig('user.name', 'VSCode Auto Git User', false);
            }
            if (!globalEmail.trim()) {
                await this.git.addConfig('user.email', 'autogit@vscode.local', false);
            }

            await this.git.raw(['config', '--unset', 'credential.helper']).catch(() => undefined);
            await this.git.addConfig('credential.helper', '', false);
        } catch (error) {
            console.error('Failed to configure git:', error);
        }
    }

    private async setAuthenticatedRemoteIfAvailable(): Promise<void> {
        if (!this.git || !this.token || !this.repoUrl) {
            return;
        }

        try {
            const authenticatedUrl = this.buildAuthenticatedUrl(this.repoUrl, this.token);
            await this.git.remote(['set-url', 'origin', authenticatedUrl]);
        } catch (error: any) {
            console.warn('Failed to set authenticated remote URL:', error?.message || error);
        }
    }

    private async syncStudentWorktree(repoPath: string, worktreePath: string, branchName: string): Promise<void> {
        const repoGit = simpleGit(repoPath);

        await repoGit.fetch('origin', branchName);

        if (!fs.existsSync(worktreePath)) {
            const localBranches = await repoGit.branchLocal();
            const localBranchExists = localBranches.all.includes(branchName);

            if (localBranchExists) {
                await repoGit.raw(['worktree', 'add', worktreePath, branchName]);
            } else {
                await repoGit.raw(['worktree', 'add', '--track', '-b', branchName, worktreePath, `origin/${branchName}`]);
            }
        }

        const worktreeGit = simpleGit(worktreePath);
        await worktreeGit.pull('origin', branchName);
    }

    private sanitizeStudentFolderName(name: string): string {
        const sanitized = name
            .replace(/[\\/:*?"<>|]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/[. ]+$/g, '')
            .trim();

        return sanitized || 'unknown-student';
    }

    private buildAuthenticatedUrl(repoUrl: string, token: string): string {
        const cleanUrl = repoUrl.replace(/\.git$/, '');
        const match = cleanUrl.match(/https:\/\/github\.com\/(.+)/);

        if (!match) {
            throw new Error('Invalid GitHub repository URL');
        }

        return `https://x-access-token:${token}@github.com/${match[1]}.git`;
    }
}

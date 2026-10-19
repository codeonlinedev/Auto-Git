import axios, { AxiosInstance } from 'axios';

export interface LoginResponse {
    token: string;
    email: string;
    name: string;
    userId: string;
    role?: string;
    profilePicture?: string;
}

export interface CreateClassResponse {
    classId: string;
    classCode: string;
    className: string;
}

export interface JoinClassResponse {
    studentId: string;
}

export interface CreateAssignmentResponse {
    assignmentId: string;
    assignmentCode: string;
    title: string;
    repoUrl: string;
    token: string;
    deadline?: string;
}

export interface CreateAssignmentTaskPayload {
    orderNo?: number;
    taskName: string;
    description: string;
}

export interface UploadTaskZipPayload {
    taskName: string;
    fileName: string;
    fileContent: string;
}

export interface JoinAssignmentResponse {
    repoUrl: string;
    branch: string;
    token: string;
    studentId: string;
    assignmentTitle: string;
    deadline?: string;
}

export interface AssignmentInfoResponse {
    assignmentId: string | number;
    assignmentCode: string;
    title: string;
    description?: string;
    repoUrl?: string;
    deadline?: string;
    createdAt?: string;
}

export interface CreateCodeCommentRequest {
    assignmentCode: string;
    targetBranch: string;
    studentFilePath: string;
    filePath?: string;
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
    selectedText?: string;
    comment: string;
}

export interface CodeCommentResponse {
    id: number;
    assignmentId: number;
    studentId: number;
    targetBranch: string;
    studentFilePath: string;
    filePath?: string;
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
    selectedText?: string;
    content: string;
    authorId: number;
    authorName: string;
    status: 'OPEN' | 'RESOLVED' | 'DELETED';
    createdAt: string;
    updatedAt: string;
}

export interface ResolveCommentResponse extends CodeCommentResponse { }

export interface FileContext {
    filename: string;
    fileContent: string;
    hashcode: string;
}

export interface AiChatRequest {
    message: string;
    assignmentCode: string;
    files: FileContext[];
}

export interface VectorFileDTO {
    fileName: string;
    fileContent: string;
    hashcode: string;
    taskOrderNo?: number;
}

export interface VectorStudentAssignmentDTO {
    studentName: string;
    files: VectorFileDTO[];
}

export interface WorkspaceUploadRequest {
    assignmentCode: string;
    studentAssignments: VectorStudentAssignmentDTO[];
}

export interface StudentSubmissionDTO {
    studentId: number;
    studentName: string;
    studentCode: string;
    email: string;
    commitCount: number;
    lastCommitAt: string | null;
    score: number | null;
}

export class ApiService {
    private api: AxiosInstance;
    private baseURL: string;
    private jwtToken: string | null = null;

    private normalizeRequestPayload(data: unknown): unknown {
        if (typeof data === 'undefined') {
            return null;
        }

        if (data === null) {
            return null;
        }

        if (typeof data === 'string') {
            try {
                return JSON.parse(data);
            } catch {
                return data;
            }
        }

        if (data instanceof URLSearchParams) {
            return Object.fromEntries(data.entries());
        }

        if (
            typeof data === 'object' &&
            !Array.isArray(data) &&
            Object.getPrototypeOf(data) === Object.prototype &&
            Object.keys(data as Record<string, unknown>).length === 0
        ) {
            return null;
        }

        return data;
    }

    constructor(baseURL: string = 'http://localhost:8080/api') {
        this.baseURL = baseURL;
        this.api = axios.create({
            baseURL: this.baseURL,
            timeout: 60000,
            headers: {
                'Content-Type': 'application/json'
            }
        });

        // Add request interceptor to include JWT token and log API calls
        this.api.interceptors.request.use(
            (config) => {
                if (this.jwtToken) {
                    config.headers.Authorization = `Bearer ${this.jwtToken}`;
                }

                // Log API request with method, endpoint, payload and query params.
                const method = (config.method || 'GET').toUpperCase();
                const url = config.url || '';
                const fullUrl = url.startsWith('http') ? url : `${this.baseURL}${url}`;
                const payload = this.normalizeRequestPayload(config.data);
                const params = config.params ?? null;
                const requestDetail = {
                    api: fullUrl,
                    method,
                    payload,
                    params
                };

                console.log(`[API ${method}] ${fullUrl}`);
                console.log(`[API Request Detail] ${JSON.stringify(requestDetail)}`);

                return config;
            },
            (error) => {
                return Promise.reject(error);
            }
        );
    }

    setToken(token: string | null) {
        this.jwtToken = token;
    }

    async initiateGoogleLogin(): Promise<string> {
        try {
            const response = await this.api.get('/auth/google/url');
            return response.data.authUrl;
        } catch (error: any) {
            throw new Error(`Failed to initiate Google login: ${error.message}`);
        }
    }

    async handleGoogleCallback(code: string, role: string): Promise<LoginResponse> {
        try {
            const response = await this.api.post('/auth/google/callback', { code, role });
            const data = response.data;
            this.setToken(data.token);
            return data;
        } catch (error: any) {
            throw new Error(`Failed to complete Google login: ${error.response?.data?.name || error.message}`);
        }
    }

    async createClass(className: string): Promise<CreateClassResponse> {
        try {
            const response = await this.api.post('/class/create', { className });
            return response.data;
        } catch (error: any) {
            throw new Error(`Failed to create class: ${error.response?.data?.message || error.message}`);
        }
    }

    async joinClass(studentName: string, classCode: string): Promise<JoinClassResponse> {
        try {
            const response = await this.api.post('/class/join', {
                studentName,
                classCode
            });
            return response.data;
        } catch (error: any) {
            throw new Error(`Failed to join class: ${error.response?.data?.message || error.message}`);
        }
    }

    async createAssignment(
        classCode: string,
        title: string,
        description: string,
        deadline?: string,
        tasks?: CreateAssignmentTaskPayload[]
    ): Promise<CreateAssignmentResponse> {
        try {
            const response = await this.api.post('/assignment/create', {
                classCode,
                title,
                description,
                deadline: deadline || null,
                tasks: tasks || []
            });
            return response.data;
        } catch (error: any) {
            throw new Error(`Failed to create assignment: ${error.response?.data?.message || error.message}`);
        }
    }

    async uploadTaskTestCasesZip(assignmentCode: string, tasks: UploadTaskZipPayload[]): Promise<any> {
        try {
            const formData = new FormData();
            formData.append('assignmentCode', assignmentCode);

            tasks.forEach((task, index) => {
                if (!task?.fileContent) {
                    return;
                }

                const taskName = task.taskName && task.taskName.trim()
                    ? task.taskName.trim()
                    : `Task ${index + 1}`;
                const fileName = task.fileName && task.fileName.trim()
                    ? task.fileName.trim()
                    : `task-${index + 1}.zip`;

                const buffer = Buffer.from(task.fileContent, 'base64');
                const fileBlob = new Blob([buffer], { type: 'application/zip' });

                formData.append('taskNames', taskName);
                formData.append('files', fileBlob, fileName);
            });

            const headers: Record<string, string> = {};
            if (this.jwtToken) {
                headers.Authorization = `Bearer ${this.jwtToken}`;
            }

            const response = await fetch(`${this.baseURL}/test-cases/upload-task-zips`, {
                method: 'POST',
                body: formData,
                headers
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || `HTTP ${response.status}`);
            }

            return await response.json();
        } catch (error: any) {
            throw new Error(`Failed to upload task test cases ZIP: ${error?.message || String(error)}`);
        }
    }

    async joinAssignment(assignmentCode: string, localPath: string): Promise<JoinAssignmentResponse> {
        try {
            const response = await this.api.post('/assignment/join', {
                assignmentCode,
                localPath
            });
            return response.data;
        } catch (error: any) {
            throw new Error(`Failed to join assignment: ${error.response?.data?.message || error.message}`);
        }
    }

    async getAssignments(classCode: string): Promise<any[]> {
        try {
            const response = await this.api.get(`/assignment/class/${classCode}`);
            console.log(`[DEBUG] getAssignments response for ${classCode}:`, JSON.stringify(response.data, null, 2));
            response.data.forEach((assignment: any) => {
                console.log(`[DEBUG] Assignment ${assignment.assignmentCode}: joined=${assignment.joined}, localPath=${assignment.localPath}`);
            });
            return response.data;
        } catch (error: any) {
            throw new Error(`Failed to get assignments: ${error.response?.data?.message || error.message}`);
        }
    }

    async getAssignment(assignmentCode: string): Promise<AssignmentInfoResponse> {
        try {
            const response = await this.api.get(`/assignment/${assignmentCode}`);
            return response.data;
        } catch (error: any) {
            throw new Error(`Failed to get assignment: ${error.response?.data?.message || error.response?.data?.error || error.message}`);
        }
    }

    async getAssignmentStudents(assignmentCode: string): Promise<any[]> {
        try {
            const response = await this.api.get(`/assignment/${assignmentCode}/students`);
            return response.data;
        } catch (error: any) {
            throw new Error(`Failed to get assignment students: ${error.response?.data?.message || error.message}`);
        }
    }

    async deleteAssignment(assignmentCode: string): Promise<void> {
        try {
            await this.api.delete(`/assignment/${assignmentCode}`);
        } catch (error: any) {
            throw new Error(`Failed to delete assignment: ${error.response?.data?.message || error.message}`);
        }
    }

    async requestOTP(email: string): Promise<{ success: boolean, message: string }> {
        try {
            const response = await this.api.post('/auth/otp/request', { email });
            return response.data;
        } catch (error: any) {
            throw new Error(`Failed to request OTP: ${error.response?.data?.message || error.message}`);
        }
    }

    async verifyOTP(email: string, otp: string, role: string): Promise<LoginResponse> {
        try {
            const response = await this.api.post('/auth/otp/verify', { email, otp, role });
            const data = response.data;
            this.setToken(data.token);
            return data;
        } catch (error: any) {
            throw new Error(`Failed to verify OTP: ${error.response?.data?.name || error.message}`);
        }
    }

    async getMyClasses(): Promise<{ teacherClasses: any[], studentClasses: any[] }> {
        try {
            const response = await this.api.get('/class/my-classes');
            return response.data;
        } catch (error: any) {
            throw new Error(`Failed to get classes: ${error.response?.data?.message || error.message}`);
        }
    }

    async getStudents(classCode: string): Promise<any[]> {
        try {
            const response = await this.api.get(`/class/${classCode}/students`);
            return response.data;
        } catch (error: any) {
            throw new Error(`Failed to get students: ${error.response?.data?.message || error.message}`);
        }
    }

    async deleteClass(classCode: string): Promise<void> {
        try {
            const response = await this.api.delete(`/class/${classCode}`);
            console.log('Delete class response:', response);
        } catch (error: any) {
            console.error('Delete class API error:', error);
            throw new Error(`Failed to delete class: ${error.response?.data?.message || error.message}`);
        }
    }

    async leaveClass(classCode: string): Promise<void> {
        console.log('apiService.leaveClass called with:', classCode);
        try {
            console.log('Making DELETE request to:', `/class/${classCode}/leave`);
            const response = await this.api.delete(`/class/${classCode}/leave`);
            console.log('Leave class response:', response);
        } catch (error: any) {
            console.error('Leave class API error:', error);
            throw new Error(`Failed to leave class: ${error.response?.data?.message || error.message}`);
        }
    }

    async removeStudent(classCode: string, studentId: string): Promise<{ message: string }> {
        try {
            const response = await this.api.delete(`/class/${classCode}/student/${studentId}`);
            return response.data;
        } catch (error: any) {
            console.error('[API] Remove student error:', error);
            throw new Error(`Failed to remove student: ${error.response?.data?.error || error.message}`);
        }
    }

    async getAssignmentSubmissions(assignmentCode: string): Promise<StudentSubmissionDTO[]> {
        try {
            const response = await this.api.get(`/assignment/${assignmentCode}/submissions`);
            return response.data;
        } catch (error: any) {
            console.error('[API] Get assignment submissions ERROR:', error);
            throw new Error(`Failed to get submissions: ${error.response?.data?.error || error.message}`);
        }
    }

    async exportAssignmentExcel(assignmentId: string): Promise<ArrayBuffer> {
        try {
            const response = await this.api.get(`/assignment/export-excel/${parseInt(assignmentId, 10)}`, {
                responseType: 'arraybuffer',
                headers: {
                    Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                }
            });
            return response.data;
        } catch (error: any) {
            console.error('[API] Export assignment excel ERROR:', error);
            throw new Error(`Failed to export excel: ${error.response?.data?.error || error.message}`);
        }
    }

    async createCodeComment(payload: CreateCodeCommentRequest): Promise<CodeCommentResponse> {
        try {
            const response = await this.api.post('/assignment/comments', payload);
            return response.data;
        } catch (error: any) {
            console.error('[API] Create code comment ERROR:', error);
            throw new Error(`Failed to create comment: ${error.response?.data?.error || error.message}`);
        }
    }

    async getCodeComments(assignmentCode: string, targetBranch: string, studentFilePath: string): Promise<CodeCommentResponse[]> {
        try {
            const response = await this.api.get('/assignment/comments', {
                params: {
                    assignmentCode,
                    targetBranch,
                    studentFilePath
                }
            });
            return response.data || [];
        } catch (error: any) {
            console.error('[API] Get code comments ERROR:', error);
            throw new Error(`Failed to get comments: ${error.response?.data?.error || error.message}`);
        }
    }

    async resolveCodeComment(commentId: number): Promise<ResolveCommentResponse> {
        try {
            const response = await this.api.patch(`/assignment/comments/${commentId}/resolve`, {});
            return response.data;
        } catch (error: any) {
            console.error('[API] Resolve code comment ERROR:', error);
            throw new Error(`Failed to resolve comment: ${error.response?.data?.error || error.message}`);
        }
    }

    async getClassesWithMessages(): Promise<any[]> {
        const response = await this.api.get('/class/chat/classes-with-messages');
        return response.data || [];
    }

    async getRecentPrivateChats(): Promise<any[]> {
        const response = await this.api.get('/messages/recent-chats');
        return response.data || [];
    }

    async searchChatMembers(query?: string): Promise<any[]> {
        const url = query?.trim()
            ? `/class/chat/search-members?query=${encodeURIComponent(query)}`
            : '/class/chat/search-members';
        const response = await this.api.get(url);
        return response.data || [];
    }

    async getPrivateMessages(otherUserId: number): Promise<any[]> {
        const response = await this.api.get(`/messages/private/${otherUserId}`);
        return response.data || [];
    }

    async getClassMessages(classroomId: number): Promise<any[]> {
        const response = await this.api.get(`/messages/class/${classroomId}`);
        return response.data || [];
    }

    async markMessageAsRead(messageId: number): Promise<void> {
        await this.api.post(`/messages/${messageId}/read`, {});
    }

    async askAi(payload: AiChatRequest): Promise<void> {
        await this.api.post('/ai/ask', payload);
    }

    async uploadVectorDb(payload: WorkspaceUploadRequest): Promise<void> {
        await this.api.post('/ai/upload-vector-db', payload);
    }

    async getNotifications(): Promise<any[]> {
        const response = await this.api.get('/notifications');
        return response.data || [];
    }

    async markNotificationAsRead(notificationId: number): Promise<void> {
        await this.api.patch(`/notifications/${notificationId}/read`, {});
    }

    async deleteNotification(notificationId: number): Promise<void> {
        await this.api.delete(`/notifications/${notificationId}`);
    }

    async markAllNotificationsAsRead(): Promise<void> {
        await this.api.patch('/notifications/read-all', {});
    }

    public async runCode(payload: any): Promise<any> {
        try {
            const response = await this.api.post('/judge/run', payload);
            return response.data;
        } catch (error) {
            console.error('[ApiService] Error running code:', error);
            throw error;
        }
    }

    public async submitCode(payload: any): Promise<any> {
        try {
            const response = await this.api.post('/judge/submit', payload);
            return response.data;
        } catch (error) {
            console.error('[ApiService] Error submitting code:', error);
            throw error;
        }
    }

    public async getTaskResult(payload: any): Promise<any> {
        try {
            const response = await this.api.post('result/task', payload);
            return response.data;
        }
        catch (error) {
            console.error('[ApiService] Error getting task result:', error);
            throw error;
        }
    }
}



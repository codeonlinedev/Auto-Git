import * as http from 'http';
import * as vscode from 'vscode';
import { ApiService } from '../../services/apiService';
import { ensureBaseDirectory } from '../../utils/localWorkspaceStore';

export async function handleGoogleLogin(
    apiService: ApiService,
    context: vscode.ExtensionContext,
    role: string,
    postMessage: (message: any) => void
): Promise<void> {
    let server: http.Server | null = null;

    const closeServer = () => {
        if (server) {
            return new Promise<void>((resolve) => {
                server!.close(() => {
                    console.log('[OAuth] Server closed');
                    server = null;
                    resolve();
                });
                setTimeout(() => {
                    server = null;
                    resolve();
                }, 100);
            });
        }
        return Promise.resolve();
    };

    try {
        server = http.createServer();
        const port = 3000;
        server.unref();

        let loginResult: { success: boolean; error?: string } = { success: false };

        const codePromise = new Promise<string>((resolve, reject) => {
            const timeout = setTimeout(() => {
                closeServer().then(() => {
                    reject(new Error('OAuth timeout - không nhận được callback sau 5 phút'));
                });
            }, 5 * 60 * 1000);

            server!.on('request', async (req, res) => {
                try {
                    const url = new URL(req.url!, `http://localhost:${port}`);
                    const code = url.searchParams.get('code');

                    if (code) {
                        clearTimeout(timeout);

                        try {
                            const loginResponse = await apiService.handleGoogleCallback(code, role);

                            await context.globalState.update('jwt_token', loginResponse.token);
                            await context.globalState.update('user_data', {
                                email: loginResponse.email,
                                userId: loginResponse.userId,
                                name: loginResponse.name,
                                role: loginResponse.role,
                                profilePicture: loginResponse.profilePicture
                            });

                            apiService.setToken(loginResponse.token);
                            loginResult = { success: true };

                            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                            res.end(`
                                <!DOCTYPE html>
                                <html>
                                <head>
                                    <meta charset="UTF-8">
                                    <title>Đăng nhập thành công</title>
                                    <style>
                                        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f0f0f0; }
                                        .success { background: white; padding: 40px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 500px; margin: 0 auto; }
                                        h1 { color: #28a745; font-size: 32px; }
                                        p { font-size: 18px; color: #666; }
                                        .icon { font-size: 64px; margin-bottom: 20px; }
                                    </style>
                                </head>
                                <body>
                                    <div class="success">
                                        <div class="icon">✓</div>
                                        <h1>Đăng nhập thành công!</h1>
                                        <p>Xin chào ${loginResponse.name}</p>
                                        <p>Bạn có thể đóng tab này và quay lại VSCode.</p>
                                        <p style="font-size: 14px; color: #999; margin-top: 30px;">Tự động đóng sau 3 giây...</p>
                                    </div>
                                    <script>setTimeout(() => window.close(), 3000);</script>
                                </body>
                                </html>
                            `);

                            postMessage({
                                type: 'loginSuccess',
                                user: {
                                    email: loginResponse.email,
                                    userId: loginResponse.userId,
                                    name: loginResponse.name,
                                    role: loginResponse.role,
                                    profilePicture: loginResponse.profilePicture
                                },
                                token: loginResponse.token
                            });

                            res.on('finish', () => {
                                closeServer().then(() => resolve(code));
                            });
                        } catch (error: any) {
                            loginResult = { success: false, error: error.message };

                            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                            res.end(`
                                <!DOCTYPE html>
                                <html>
                                <head>
                                    <meta charset="UTF-8">
                                    <title>Đăng nhập thất bại</title>
                                    <style>
                                        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f0f0f0; }
                                        .error { background: white; padding: 40px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 500px; margin: 0 auto; }
                                        h1 { color: #dc3545; font-size: 32px; }
                                        p { font-size: 18px; color: #666; }
                                        .icon { font-size: 64px; margin-bottom: 20px; }
                                        .message { background: #f8d7da; padding: 15px; border-radius: 5px; color: #721c24; margin-top: 20px; }
                                    </style>
                                </head>
                                <body>
                                    <div class="error">
                                        <div class="icon">✗</div>
                                        <h1>Đăng nhập thất bại!</h1>
                                        <div class="message">
                                            ${error.message}
                                        </div>
                                        <p style="font-size: 14px; color: #999; margin-top: 30px;">Tự động đóng sau 5 giây...</p>
                                    </div>
                                    <script>setTimeout(() => window.close(), 5000);</script>
                                </body>
                                </html>
                            `);

                            res.on('finish', () => {
                                closeServer().then(() => reject(error));
                            });
                        }
                    } else {
                        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
                        res.end('<html><body><h1>Error: No authorization code</h1></body></html>');
                        closeServer().then(() => reject(new Error('No authorization code received')));
                    }
                } catch (err) {
                    closeServer().then(() => reject(err));
                }
            });

            server!.on('error', (err) => {
                clearTimeout(timeout);
                closeServer().then(() => reject(err));
            });
        });

        await new Promise<void>((resolve, reject) => {
            server!.listen(port, 'localhost', () => {
                console.log(`[OAuth] Callback server listening on http://localhost:${port}`);
                resolve();
            });
            server!.on('error', (err: any) => {
                if (err.code === 'EADDRINUSE') {
                    console.error(`[OAuth] Port ${port} is already in use`);
                    reject(new Error(`Port ${port} đang được sử dụng. Vui lòng reload VSCode (Ctrl+Shift+P -> "Developer: Reload Window")`));
                } else {
                    reject(err);
                }
            });
        });

        const authUrl = await apiService.initiateGoogleLogin();
        vscode.window.showInformationMessage('Đang mở trình duyệt để đăng nhập Google...');

        const uri = vscode.Uri.parse(authUrl);
        await vscode.env.openExternal(uri);
        await codePromise;

        if (loginResult.success) {
            const userData = context.globalState.get<any>('user_data');

            if (userData?.userId) {
                await ensureBaseDirectory(context, userData.userId);
            }

            vscode.window.showInformationMessage(`Đăng nhập thành công! Xin chào ${userData?.name}`);
        }
    } catch (error: any) {
        await closeServer();

        postMessage({
            type: 'loginError',
            error: error.message
        });
        vscode.window.showErrorMessage(`Lỗi đăng nhập: ${error.message}`);
    }
}

export async function handleRequestOTP(
    apiService: ApiService,
    email: string,
    postMessage: (message: any) => void
): Promise<void> {
    try {
        const response = await apiService.requestOTP(email);

        postMessage({
            command: 'otpRequested',
            message: response.message
        });

        vscode.window.showInformationMessage(response.message);
    } catch (error: any) {
        postMessage({
            command: 'otpRequestError',
            error: error.message
        });
        vscode.window.showErrorMessage(`Lỗi gửi OTP: ${error.message}`);
    }
}

export async function handleVerifyOTP(
    apiService: ApiService,
    context: vscode.ExtensionContext,
    email: string,
    otp: string,
    role: string,
    postMessage: (message: any) => void
): Promise<void> {
    try {
        const loginResponse = await apiService.verifyOTP(email, otp, role);

        await context.globalState.update('jwt_token', loginResponse.token);
        await context.globalState.update('user_data', {
            email: loginResponse.email,
            userId: loginResponse.userId,
            name: loginResponse.name,
            role: loginResponse.role
        });

        apiService.setToken(loginResponse.token);

        postMessage({
            type: 'loginSuccess',
            user: {
                email: loginResponse.email,
                userId: loginResponse.userId,
                name: loginResponse.name,
                role: loginResponse.role
            },
            token: loginResponse.token
        });

        await ensureBaseDirectory(context, loginResponse.userId);
        vscode.window.showInformationMessage(`Đăng nhập thành công! Xin chào ${loginResponse.name}`);
    } catch (error: any) {
        postMessage({
            type: 'loginError',
            error: error.message
        });
        vscode.window.showErrorMessage('Mã OTP không đúng hoặc đã hết hạn');
    }
}

export async function handleLogout(
    context: vscode.ExtensionContext,
    apiService: ApiService,
    postMessage: (message: any) => void
): Promise<void> {
    await context.globalState.update('jwt_token', undefined);
    await context.globalState.update('user_data', undefined);
    await context.globalState.update('current_class', undefined);
    apiService.setToken(null);

    postMessage({
        type: 'logout'
    });

    vscode.window.showInformationMessage('Đã đăng xuất');
}

export async function handleRestoreState(
    context: vscode.ExtensionContext,
    apiService: ApiService,
    hasView: boolean,
    postMessage: (message: any) => void
): Promise<void> {
    const token = context.globalState.get<string>('jwt_token');
    const userData = context.globalState.get<any>('user_data');

    if (token) {
        apiService.setToken(token);
    }

    if (userData && hasView) {
        if (userData.userId) {
            try {
                await ensureBaseDirectory(context, userData.userId);
            } catch (error: any) {
                vscode.window.showWarningMessage(`Không thể khởi tạo thư mục gốc: ${error.message}`);
            }
        }

        postMessage({
            type: 'restoreState',
            user: userData,
            token
        });
    } else if (hasView) {
        postMessage({
            type: 'restoreState',
            user: null,
            token: null
        });
    }
}

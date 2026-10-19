import * as vscode from 'vscode';
import * as path from 'path';
import { ApiService } from '../services/apiService';
import { getCurrentAssignmentCodeFromWorkspace } from '../utils/localWorkspaceStore';

export async function handleRunCode(
    apiService: ApiService,
    userId: string,
    context: vscode.ExtensionContext
) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('Vui lòng mở một file code trước khi chạy!');
        return;
    }

    const languageId = editor.document.languageId;
    const sourceCode = editor.document.getText();
    const fullFilePath = editor.document.fileName;


    const fileName = path.basename(fullFilePath);

    let currentTaskOrderNo = 1;
    const match = fileName.match(/task(\d+)/i);

    if (match && match[1]) {
        currentTaskOrderNo = parseInt(match[1], 10);
    }
    const assignmentCode = getCurrentAssignmentCodeFromWorkspace(context, userId);

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Chạy thử nghiệm (Task ${currentTaskOrderNo})`,
        cancellable: false
    }, async (progress) => {

        progress.report({ increment: 20, message: "Đang đóng gói mã nguồn..." });

        try {
            const payload = {
                language: languageId,
                sourceCode: sourceCode,
                assignmentCode: assignmentCode,
                taskOrderNo: currentTaskOrderNo,
            };

            progress.report({ increment: 40, message: "Đang gọi máy chủ Judge0..." });
            const response = await apiService.runCode(payload);

            progress.report({ increment: 30, message: "Đang xử lý kết quả..." });
            const results = response.results;

            if (results && results.length > 0) {
                await showResultInVirtualDocument(results);
            } else {
                console.log("Dữ liệu thực tế nhận được:", response);
                vscode.window.showWarningMessage("Backend không trả về kết quả test case nào.");
            }

        } catch (error: any) {
            const errorMsg = error.response?.data?.message || 'Không thể kết nối tới máy chủ chấm bài!';
            vscode.window.showErrorMessage(`Lỗi hệ thống: ${errorMsg}`);
            console.error(error);
        }
    });
}

export async function handleSubmitCode(
    apiService: ApiService,
    userId: string,
    context: vscode.ExtensionContext
) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('Vui lòng mở một file code trước khi nộp bài!');
        return;
    }

    const assignmentCode = getCurrentAssignmentCodeFromWorkspace(context, userId);
    if (!assignmentCode) {
        vscode.window.showErrorMessage('Không tìm thấy assignment hiện tại. Vui lòng mở đúng workspace bài tập.');
        return;
    }

    const canSubmit = await ensureCanSubmitBeforeDeadline(apiService, context, assignmentCode);
    if (!canSubmit) {
        return;
    }

    const answer = await vscode.window.showInformationMessage(
        'Bạn có chắc chắn muốn nộp bài tập này lên hệ thống?',
        'Có', 'Không'
    );

    if (answer === 'Có') {
        const languageId = editor.document.languageId;
        const sourceCode = editor.document.getText();
        const fullFilePath = editor.document.fileName;

        let relativePath = path.basename(fullFilePath);
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
        if (workspaceFolder) {
            relativePath = path.relative(workspaceFolder.uri.fsPath, fullFilePath);
            relativePath = relativePath.replace(/\\/g, '/');
        }

        const fileName = path.basename(fullFilePath);

        let currentTaskOrderNo = 1;
        const match = fileName.match(/task(\d+)/i);

        if (match && match[1]) {
            currentTaskOrderNo = parseInt(match[1], 10);
        }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Hệ thống CodingRooms",
            cancellable: false
        }, async (progress) => {

            progress.report({ increment: 10, message: "Đang đóng gói mã nguồn..." });

            try {
                const payload = {
                    assignmentCode: assignmentCode,
                    taskOrderNo: currentTaskOrderNo,
                    language: languageId,
                    sourceCode: sourceCode,
                    filePath: relativePath
                };

                progress.report({ increment: 40, message: "Đang gửi lên máy chủ..." });
                const response = await apiService.submitCode(payload);

                progress.report({ increment: 50, message: "Đang chấm điểm..." });
                const { score, passedTestCases, totalTestCases, status } = response;

                await showSubmitResultInVirtualDocument(response);
                if (score === 100) {
                    vscode.window.showInformationMessage(
                        `Tuyệt vời! Bạn đạt ${score}/100 điểm (${passedTestCases}/${totalTestCases} Test cases).`
                    );
                } else {
                    vscode.window.showInformationMessage(
                        `Hoàn thành: ${score}/100 điểm (${passedTestCases}/${totalTestCases} Test cases). Trạng thái: ${status}`
                    );
                }

            } catch (error: any) {
                const errorMsg = error.response?.data?.message || 'Lỗi kết nối tới Server!';
                vscode.window.showErrorMessage(`Nộp bài thất bại: ${errorMsg}`);
                console.error(error);
            }
        });
    }
}

async function ensureCanSubmitBeforeDeadline(
    apiService: ApiService,
    context: vscode.ExtensionContext,
    assignmentCode: string
): Promise<boolean> {
    const userData = context.globalState.get<any>('user_data') || {};
    const currentClass = context.globalState.get<any>('current_class') || {};
    const isTeacher = userData.role === 'TEACHER' || currentClass.role === 'teacher';

    if (isTeacher) {
        return true;
    }

    let deadlineValue: string | undefined;
    try {
        const assignment = await apiService.getAssignment(assignmentCode);
        deadlineValue = assignment.deadline;
    } catch (error: any) {
        const errorMsg = error?.message || 'Không thể kiểm tra deadline.';
        vscode.window.showErrorMessage(`Không thể kiểm tra deadline trước khi nộp bài: ${errorMsg}`);
        return false;
    }

    if (!deadlineValue) {
        return true;
    }

    const deadline = new Date(deadlineValue);
    if (Number.isNaN(deadline.getTime())) {
        vscode.window.showErrorMessage('Deadline của bài tập không hợp lệ. Không thể nộp bài.');
        return false;
    }

    if (Date.now() > deadline.getTime()) {
        vscode.window.showErrorMessage(
            `Đã quá deadline (${deadline.toLocaleString('vi-VN')}). Bạn không thể nộp bài nữa.`
        );
        return false;
    }

    return true;
}

async function showResultInVirtualDocument(results: any[]) {
    let reportBody = "";

    results.forEach((res, index) => {
        const stdout = res.stdout || "";
        const stderr = res.stderr || "";
        const compileOutput = res.compile_output || "";
        const status = res.status?.description || res.statusDescription || "Unknown";
        const time = res.time || "0.0";
        const memory = res.memory || "0";
        const stdin = res.stdin || "";
        reportBody += `
[TEST CASE ${index + 1}]
Trạng thái : ${status}
Thời gian  : ${time}s | Bộ nhớ: ${memory} KB
${compileOutput ? `Lỗi biên dịch:\n${compileOutput}\n` : ""}
${stderr ? `Lỗi thực thi (Stderr):\n${stderr}\n` : ""}
Input:
${stdin || "(Không có input)"}
Output:
${stdout || "(Không có đầu ra)"}
-----------------------------------------
`;
    });

    const resultText =
        `=========================================
    KẾT QUẢ CHẠY THỬ (RUN CODE)
=========================================
Tổng số Test Cases: ${results.length}
${reportBody}
=========================================
`;

    const document = await vscode.workspace.openTextDocument({
        content: resultText,
        language: 'plaintext'
    });

    await vscode.window.showTextDocument(document, {
        viewColumn: vscode.ViewColumn.Beside,
        preserveFocus: false,
        preview: true
    });
}

async function showSubmitResultInVirtualDocument(response: any) {
    const timeDisplay = response.time !== undefined && response.time !== null ? `${response.time} giây` : "N/A";
    const memoryDisplay = response.memory !== undefined && response.memory !== null ? `${response.memory} KB` : "N/A";

    let resultText =
        `=============================
  KẾT QUẢ CHẤM ĐIỂM CHI TIẾT
=============================
Trạng thái     : ${response.status}
Điểm số        : ${response.score} / 10
Số test pass   : ${response.passedTestCases} / ${response.totalTestCases}
Thời gian chạy : ${timeDisplay}
Bộ nhớ sử dụng : ${memoryDisplay}

-----------------------------
Thời gian nộp  : ${new Date().toLocaleString()}
`;

    if (response.errorMessage) {
        resultText += `\n=============================\n`;
        resultText += `CHI TIẾT LỖI (ERROR LOG):\n`;
        resultText += `-----------------------------\n`;
        resultText += `${response.errorMessage}\n`;
        resultText += `=============================\n`;
    }

    const document = await vscode.workspace.openTextDocument({
        content: resultText,
        language: 'log'
    });

    await vscode.window.showTextDocument(document, {
        viewColumn: vscode.ViewColumn.Beside,
        preserveFocus: false,
        preview: true
    });
}

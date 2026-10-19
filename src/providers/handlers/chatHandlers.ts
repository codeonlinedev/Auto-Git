import { ApiService } from '../../services/apiService';

export async function handleGetChatClassrooms(
    apiService: ApiService,
    postMessage: (message: any) => void
): Promise<void> {
    try {
        const classes = await apiService.getClassesWithMessages();
        postMessage({ type: 'chatClassroomsLoaded', classes });
    } catch (error: any) {
        postMessage({ type: 'chatClassroomsError', error: error.message });
    }
}

export async function handleGetRecentPrivateChats(
    apiService: ApiService,
    postMessage: (message: any) => void
): Promise<void> {
    try {
        const chats = await apiService.getRecentPrivateChats();
        postMessage({ type: 'recentPrivateChatsLoaded', chats });
    } catch (error: any) {
        postMessage({ type: 'recentPrivateChatsError', error: error.message });
    }
}

export async function handleSearchChatMembers(
    apiService: ApiService,
    query: string | undefined,
    postMessage: (message: any) => void
): Promise<void> {
    try {
        const results = await apiService.searchChatMembers(query);
        postMessage({ type: 'chatMembersSearchResult', results });
    } catch (error: any) {
        postMessage({ type: 'chatMembersSearchError', error: error.message });
    }
}

export async function handleGetPrivateMessages(
    apiService: ApiService,
    otherUserId: number,
    postMessage: (message: any) => void
): Promise<void> {
    try {
        const messages = await apiService.getPrivateMessages(otherUserId);
        postMessage({ type: 'privateMessagesLoaded', messages, otherUserId });
    } catch (error: any) {
        postMessage({ type: 'privateMessagesError', error: error.message });
    }
}

export async function handleGetClassMessages(
    apiService: ApiService,
    classroomId: number,
    postMessage: (message: any) => void
): Promise<void> {
    try {
        const messages = await apiService.getClassMessages(classroomId);
        postMessage({ type: 'classMessagesLoaded', messages, classroomId });
    } catch (error: any) {
        postMessage({ type: 'classMessagesError', error: error.message });
    }
}

export async function handleMarkMessageAsRead(
    apiService: ApiService,
    messageId: number
): Promise<void> {
    try {
        await apiService.markMessageAsRead(messageId);
    } catch (error: any) {
        console.error('[ClassroomViewProvider] markMessageAsRead error:', error.message);
    }
}

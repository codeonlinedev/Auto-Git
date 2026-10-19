import { MessageType } from '../../services/websocketService';

export type DashboardTab = 'dashboard' | 'chat' | 'notification' | 'settings';

export interface ChatConfig {
  otherUserId?: number;
  otherUserName?: string;
  classroomId?: number;
  classroomName?: string;
  chatType: MessageType;
}

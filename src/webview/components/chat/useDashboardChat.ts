import { useState } from 'react';
import { ChatConfig } from './types';

export function useDashboardChat() {
  const [chatOpen, setChatOpen] = useState(false);
  const [chatConfig, setChatConfig] = useState<ChatConfig | null>(null);

  const openChat = (config: ChatConfig) => {
    setChatConfig(config);
    setChatOpen(true);
  };

  const closeChat = () => {
    setChatOpen(false);
  };

  return {
    chatOpen,
    chatConfig,
    openChat,
    closeChat
  };
}

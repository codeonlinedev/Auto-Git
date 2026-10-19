import React, { useState, useEffect, useRef } from 'react';
import { Bot } from 'lucide-react';
import { AI_ASSISTANT, AI_ASSISTANT_ID } from '../../constants/aiConstants';

interface ChatViewProps {
  vscode: any;
  onOpenChat: (config: any) => void;
}

interface Classroom {
  id: number;
  className: string;
  classCode: string;
  teacherName: string;
  studentCount: number;
  lastMessage?: string;
  lastMessageTime?: string;
  unreadCount?: number;
}

interface RecentPrivateChat {
  userId: number;
  userName: string;
  userEmail: string;
  lastMessage?: string;
  lastMessageTime?: string;
  unreadCount?: number;
}

interface SearchMember {
  userId: number;
  userName: string;
  role?: string;
  className?: string;
}

type ChatPreview = {
  lastMessage?: string;
  lastMessageTime?: string;
};

const ChatView: React.FC<ChatViewProps> = ({ vscode, onOpenChat }) => {
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [recentPrivateChats, setRecentPrivateChats] = useState<RecentPrivateChat[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchResults, setSearchResults] = useState<SearchMember[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [aiPreview, setAiPreview] = useState<ChatPreview>({});
  const [classPreviews, setClassPreviews] = useState<Record<number, ChatPreview>>({});
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);

  const getMessageTime = (message: any): number => {
    const raw = message?.createdAt || message?.sentAt;
    const parsed = raw ? new Date(raw).getTime() : Number.NaN;
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  const buildPreviewFromMessages = (messages: any[] = []): ChatPreview => {
    if (!Array.isArray(messages) || messages.length === 0) {
      return {};
    }

    const latest = [...messages].sort((a, b) => getMessageTime(b) - getMessageTime(a))[0];
    return {
      lastMessage: latest?.content || '',
      lastMessageTime: latest?.createdAt || latest?.sentAt
    };
  };

  useEffect(() => {
    // Set up message listener FIRST
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;

      if (message && message.type === 'chatClassroomsLoaded') {
        console.log('[ChatView] ✓ Received chatClassroomsLoaded');
        if (Array.isArray(message.classes)) {
          setClassrooms(message.classes);
          loadClassPreviews(message.classes);
          setLoading(false);
        }
      } else if (message && message.type === 'recentPrivateChatsLoaded') {
        console.log('[ChatView] ✓ Received recentPrivateChatsLoaded');
        const chats = Array.isArray(message.chats) ? message.chats : [];
        setRecentPrivateChats(chats.filter((chat: any) => chat.userId !== AI_ASSISTANT_ID));
      } else if (message && message.type === 'chatMembersSearchResult') {
        console.log('[ChatView] ✓ Received chatMembersSearchResult');
        setSearchResults(message.results || []);
        setIsSearching(false);
      } else if (message && message.type === 'privateMessagesLoaded' && message.otherUserId === AI_ASSISTANT_ID) {
        setAiPreview(buildPreviewFromMessages(message.messages || []));
      } else if (message && message.type === 'classMessagesLoaded' && typeof message.classroomId === 'number') {
        const preview = buildPreviewFromMessages(message.messages || []);
        setClassPreviews((prev) => ({
          ...prev,
          [message.classroomId]: preview
        }));
      } else if (message && message.type === 'refreshChatView') {
        refreshData();
      } else if (message && message.type === 'newMessage') {
        // Refresh chat list when new message arrives
        refreshData();
      }
    };

    window.addEventListener('message', handleMessage);

    // THEN load data after listener is ready
    loadData();

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  const loadData = () => {
    setLoading(true);
    loadClassrooms();
    loadRecentPrivateChats();
    loadAiPreview();
  };

  const refreshData = () => {
    loadClassrooms();
    loadRecentPrivateChats();
    loadAiPreview();
  };

  const loadClassrooms = () => {
    console.log('[ChatView] Requesting classrooms with messages via postMessage');
    vscode.postMessage({ type: 'getChatClassrooms' });
  };

  const loadRecentPrivateChats = () => {
    console.log('[ChatView] Requesting recent private chats via postMessage');
    vscode.postMessage({ type: 'getRecentPrivateChats' });
  };

  const loadAiPreview = () => {
    vscode.postMessage({ type: 'getPrivateMessages', otherUserId: AI_ASSISTANT_ID });
  };

  const loadClassPreviews = (classes: Classroom[]) => {
    classes.forEach((classroom) => {
      vscode.postMessage({ type: 'getClassMessages', classroomId: classroom.id });
    });
  };

  const searchMembers = (query: string = '') => {
    vscode.postMessage({ type: 'searchChatMembers', query });
  };

  useEffect(() => {
    const shouldSearch = isSearchFocused || searchQuery.trim().length > 0;
    if (!shouldSearch) {
      setIsSearching(false);
      return;
    }

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    setIsSearching(true);
    searchDebounceRef.current = setTimeout(() => {
      searchMembers(searchQuery.trim());
    }, 250);

    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, [searchQuery, isSearchFocused]);

  const openChat = (config: any) => {
    onOpenChat(config);
  };

  const handleOpenGroupChat = (classroom: Classroom) => {
    openChat({
      classroomId: classroom.id,
      classroomName: classroom.className,
      chatType: 'CLASS_GROUP'
    });
  };

  const handleOpenPrivateChat = (chat: RecentPrivateChat) => {
    openChat({
      otherUserId: chat.userId,
      otherUserName: chat.userName,
      chatType: 'PRIVATE'
    });
  };

  const handleOpenSearchResult = (member: SearchMember) => {
    openChat({
      otherUserId: member.userId,
      otherUserName: member.userName,
      chatType: 'PRIVATE'
    });
    setSearchQuery('');
    setSearchResults([]);
    setIsSearching(false);
    setIsSearchFocused(false);
  };

  const isSearchMode = isSearchFocused || searchQuery.trim().length > 0;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-[#616f89] text-sm">Đang tải...</p>
      </div>
    );
  }

  const formatTime = (timeString: string | undefined) => {
    if (!timeString) return '';
    const date = new Date(timeString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
      return 'Yesterday';
    } else if (days < 7) {
      return date.toLocaleDateString('vi-VN', { weekday: 'long' });
    }
    return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
  };

  const getInitials = (name: string) => {
    const words = name.split(' ');
    if (words.length >= 2) {
      return (words[0][0] + words[words.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-vscode-bg">
      {/* Search Section */}
      <div className="px-4 py-4">
        <div className="relative flex items-center">
          <svg className="absolute left-3 w-[18px] h-[18px] text-vscode-desc" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            className="w-full bg-vscode-iconBg border-none rounded-full py-2.5 pl-10 pr-4 text-sm font-medium focus:ring-1 focus:ring-vscode-focus text-vscode-fg placeholder:text-vscode-desc outline-none transition-all"
            placeholder="Search conversations..."
            value={searchQuery}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className="absolute right-3 text-vscode-desc hover:text-vscode-fg transition-colors"
              onClick={() => { setSearchQuery(''); setIsSearchFocused(true); }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Chat List Layout */}
      <main className="w-full bg-vscode-bg flex-grow flex flex-col pb-28 overflow-y-auto custom-scrollbar">
        {isSearchMode ? (
          isSearching ? (
            <div className="text-center py-12">
              <p className="text-vscode-desc text-sm font-medium">Đang tìm người dùng...</p>
            </div>
          ) : searchResults.length > 0 ? (
            <div className="flex-grow">
              <div className="px-4 py-2 bg-vscode-iconBg">
                <h2 className="font-bold text-[10px] tracking-widest uppercase text-vscode-desc">Kết quả tìm kiếm</h2>
              </div>
              <div className="divide-y divide-[var(--vscode-widget-border)]">
                {searchResults.map((member) => (
                  <div
                    key={`search-${member.userId}`}
                    className="flex items-center justify-between px-4 py-4 hover:bg-vscode-hoverBg transition-colors active:scale-[0.98] cursor-pointer"
                    onMouseDown={(e) => { e.preventDefault(); handleOpenSearchResult(member); }}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-vscode-iconBg flex items-center justify-center rounded-full shrink-0">
                        <span className="font-extrabold text-vscode-desc text-sm">
                          {getInitials(member.userName)}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-vscode-fg tracking-tight">{member.userName}</span>
                          <span className="px-1.5 py-0.5 rounded bg-vscode-iconBg text-[10px] font-bold text-vscode-desc uppercase tracking-tighter">
                            {member.role}
                          </span>
                        </div>
                        <span className="text-[12px] text-vscode-desc truncate mt-0.5 font-medium">{member.className || 'Direct message'}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-vscode-desc text-sm font-medium">
                {searchQuery.trim() ? 'Không tìm thấy người dùng' : 'Nhập tên hoặc email để tìm người dùng'}
              </p>
            </div>
          )
        ) : (
          /* Normal Chat List */
          <div className="flex-grow">
            <div className="px-4 py-2 bg-vscode-iconBg">
              <h2 className="font-bold text-[10px] tracking-widest uppercase text-vscode-desc">Tất cả</h2>
            </div>

            <div className="divide-y divide-[var(--vscode-widget-border)]">
              {(() => {
                const aiItem = {
                  ...AI_ASSISTANT,
                  userEmail: 'ai-assistant@system',
                  lastMessage: aiPreview.lastMessage,
                  lastMessageTime: aiPreview.lastMessageTime,
                  type: 'private',
                  time: aiPreview.lastMessageTime
                };

                const merged = [
                  aiItem,
                  ...classrooms.map(c => {
                    const preview = classPreviews[c.id] || {};
                    const latestTime = preview.lastMessageTime || c.lastMessageTime;
                    return { ...c, type: 'group', lastMessage: preview.lastMessage || c.lastMessage, lastMessageTime: latestTime, time: latestTime };
                  }),
                  ...recentPrivateChats.map(c => ({ ...c, type: 'private', time: c.lastMessageTime }))
                ];

                const sorted = merged.sort((a: any, b: any) => {
                  if (!a.time && !b.time) return 0;
                  if (!a.time) return 1;
                  if (!b.time) return -1;
                  return new Date(b.time).getTime() - new Date(a.time).getTime();
                });

                return sorted.map((chat: any) => {
                  if (chat.type === 'group') {
                    return (
                      <div
                        key={`group-${chat.id}`}
                        className="flex items-center justify-between px-4 py-4 hover:bg-vscode-hoverBg transition-colors active:scale-[0.98] cursor-pointer"
                        onClick={() => handleOpenGroupChat(chat)}
                      >
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="w-12 h-12 bg-vscode-activeBg flex items-center justify-center rounded-full shrink-0">
                            <span className="font-extrabold text-vscode-activeFg text-xs uppercase tracking-tighter">
                              {getInitials(chat.className)}
                            </span>
                          </div>
                          <div className="flex flex-col min-w-0 pr-2">
                            <span className="font-bold text-sm text-vscode-fg tracking-tight truncate">
                              {chat.className}
                            </span>
                            <span className="text-[12px] text-vscode-desc truncate mt-0.5 font-medium">
                              {chat.lastMessage || `Class Group • ${chat.studentCount} members`}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className="font-medium text-[10px] tracking-tight text-vscode-desc uppercase">
                            {formatTime(chat.lastMessageTime) || 'MỚI'}
                          </span>
                          {chat.unreadCount && chat.unreadCount > 0 ? (
                            <div className="w-2 h-2 bg-vscode-link rounded-full"></div>
                          ) : null}
                        </div>
                      </div>
                    );
                  } else {
                    const isAI = chat.userId === AI_ASSISTANT_ID;
                    return (
                      <div
                        key={`private-${chat.userId}`}
                        className="flex items-center justify-between px-4 py-4 hover:bg-vscode-hoverBg transition-colors active:scale-[0.98] cursor-pointer"
                        onClick={() => handleOpenPrivateChat(chat)}
                      >
                        <div className="flex items-center gap-4 min-w-0">
                          {isAI ? (
                            <div className="w-12 h-12 border-2 border-vscode-link flex items-center justify-center rounded-full shrink-0">
                              <Bot size={22} className="text-vscode-link" />
                            </div>
                          ) : (
                            <div className="w-12 h-12 bg-vscode-iconBg flex items-center justify-center rounded-full overflow-hidden shrink-0">
                              <span className="font-extrabold text-vscode-desc text-sm">
                                {getInitials(chat.userName)}
                              </span>
                            </div>
                          )}
                          <div className="flex flex-col min-w-0 pr-2">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-vscode-fg tracking-tight truncate">
                                {chat.userName}
                              </span>
                            </div>
                            <span className="text-[12px] text-vscode-desc truncate mt-0.5 font-medium">
                              {chat.lastMessage || 'Bắt đầu trò chuyện'}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className="font-medium text-[10px] tracking-tight text-vscode-desc uppercase">
                            {formatTime(chat.lastMessageTime) || 'MỚI'}
                          </span>
                          {chat.unreadCount && chat.unreadCount > 0 ? (
                            <div className="w-2 h-2 bg-vscode-link rounded-full"></div>
                          ) : null}
                        </div>
                      </div>
                    );
                  }
                });
              })()}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default ChatView;

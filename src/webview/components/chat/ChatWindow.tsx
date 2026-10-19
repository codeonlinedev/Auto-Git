import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ChatMessage, MessageType, getWebSocketService } from '../../services/websocketService';
import { Plus, Send, ThumbsUp, File, X, ImagePlus, Paperclip, Check, CheckCheck, Copy } from 'lucide-react';
import { AI_ASSISTANT_ID, AI_STREAM_DONE } from '../../constants/aiConstants';
import 'katex/dist/katex.min.css';

const ReactMarkdown = require('react-markdown').default;
const remarkGfm = require('remark-gfm').default;
const remarkMath = require('remark-math').default;
const rehypeKatex = require('rehype-katex').default;

/* ── Thinking animation ──────────────────────────────────────── */
const THINKING_STYLE = `
@keyframes ai-thinking-spin {
  0%   { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
@keyframes ai-dot-bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
  40%            { transform: translateY(-5px); opacity: 1; }
}
.ai-thinking-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(128,128,128,0.25);
  border-top-color: var(--vscode-focusBorder, #007acc);
  border-radius: 50%;
  animation: ai-thinking-spin 0.75s linear infinite;
  display: inline-block;
}
.ai-dot { animation: ai-dot-bounce 1.2s ease-in-out infinite; }
.ai-dot:nth-child(2) { animation-delay: 0.2s; }
.ai-dot:nth-child(3) { animation-delay: 0.4s; }
`;

const ThinkingIndicator: React.FC = () => (
  <>
    <style>{THINKING_STYLE}</style>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
      <span className="ai-thinking-spinner" />
      <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        {['', '', ''].map((_, i) => (
          <span
            key={i}
            className="ai-dot"
            style={{
              width: 5, height: 5,
              borderRadius: '50%',
              background: 'var(--vscode-focusBorder, #007acc)',
              display: 'inline-block',
            }}
          />
        ))}
      </span>
      <span style={{ fontSize: 12, opacity: 0.6 }}>Đang suy nghĩ...</span>
    </div>
  </>
);

type AttachmentPayload = {
  kind: 'image' | 'file';
  name: string;
  mimeType: string;
  dataUrl: string;
};

type AiStreamEvent = {
  type: 'chunk' | 'done' | 'error';
  sequence?: number;
  content?: string;
};

interface ChatWindowProps {
  vscode: any;
  currentUserId: number;
  currentUserName: string;
  otherUserId?: number;
  otherUserName?: string;
  classroomId?: number;
  classroomName?: string;
  chatType: MessageType;
  onClose: () => void;
  fullScreen?: boolean;
}

const CodeBlock = React.memo(({ className, rawCode }: { className: string; rawCode: string }) => {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const languageMatch = /language-([\w-]+)/.exec(className);
  const languageLabel = languageMatch ? languageMatch[1] : 'Plaintext';

  const handleCopy = useCallback(async () => {
    if (!rawCode) return;
    try {
      await navigator.clipboard.writeText(rawCode);
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1400);
    } catch (e) {
      console.error('[CodeBlock] copy failed', e);
    }
  }, [rawCode]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return (
    <div className="mb-2 overflow-hidden rounded-2xl border border-[var(--vscode-panel-border)] bg-vscode-iconBg">
      <div className="flex items-center justify-between border-b border-[var(--vscode-panel-border)] px-3 py-1.5">
        <span className="text-[13px] font-medium text-vscode-desc">{languageLabel}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex h-5 w-5 items-center justify-center rounded-md text-vscode-desc transition hover:bg-vscode-hoverBg hover:text-vscode-fg"
          title={copied ? 'Copied' : 'Copy code'}
          aria-label="Copy code"
        >
          {copied ? <Check size={14} strokeWidth={2.2} /> : <Copy size={14} strokeWidth={2.2} />}
        </button>
      </div>
      <pre className="overflow-x-hidden whitespace-pre-wrap break-words px-3 py-2 text-[14px] leading-6 text-vscode-fg">
        <code className={`${className} bg-transparent`}>{rawCode}</code>
      </pre>
    </div>
  );
});
CodeBlock.displayName = 'CodeBlock';

const ChatWindow: React.FC<ChatWindowProps> = ({
  vscode,
  currentUserId,
  currentUserName,
  otherUserId,
  otherUserName,
  classroomId,
  classroomName,
  chatType,
  onClose,
  fullScreen = false
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<AttachmentPayload | null>(null);
  const [activeFilePath, setActiveFilePath] = useState('');
  const [contextFiles, setContextFiles] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wsService = getWebSocketService();
  const connectionCheckInterval = useRef<NodeJS.Timeout | null>(null);
  const aiStreamingMessageIdRef = useRef<number | null>(null);
  const aiDoneTimerRef = useRef<NodeJS.Timeout | null>(null);
  const aiStreamBufferRef = useRef('');
  const aiStreamFlushTimerRef = useRef<NodeJS.Timeout | null>(null);
  const aiStreamNextSequenceRef = useRef(0);
  const aiStreamPendingChunksRef = useRef<Map<number, string>>(new Map());
  const aiStreamDoneSequenceRef = useRef<number | null>(null);
  const keepStreamingPinnedRef = useRef(true);
  const resizeFrameRef = useRef<number | null>(null);
  const scrollRafRef = useRef<number | null>(null);
  const initialScrollDoneRef = useRef(false);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [isAiResponding, setIsAiResponding] = useState(false);

  const ATTACHMENT_PREFIX = '__ATTACHMENT__:';
  const normalizedOtherUserId = typeof otherUserId === 'number' ? otherUserId : Number(otherUserId);
  const hasValidOtherUserId = Number.isFinite(normalizedOtherUserId);
  const isAiAssistantChat = chatType === MessageType.PRIVATE && hasValidOtherUserId && normalizedOtherUserId === AI_ASSISTANT_ID;

  const isNearBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return true;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    return distanceFromBottom < 96;
  }, []);

  const scrollToBottomInstant = useCallback(() => {
    requestAnimationFrame(() => {
      const container = messagesContainerRef.current;
      if (container) {
        container.scrollTop = container.scrollHeight;
        return;
      }
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    });
  }, []);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const container = messagesContainerRef.current;
      if (container) {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
        return;
      }
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    });
  }, []);

  const scrollToBottomThrottled = useCallback(() => {
    if (scrollRafRef.current !== null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      const container = messagesContainerRef.current;
      if (container) {
        container.scrollTop = container.scrollHeight;
      } else {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      }
      scrollRafRef.current = null;
    });
  }, []);

  const flushAiStreamBuffer = useCallback((forceScroll = false) => {
    const bufferedChunk = aiStreamBufferRef.current;
    if (!bufferedChunk) return;

    aiStreamBufferRef.current = '';
    const shouldPinToBottom = forceScroll || keepStreamingPinnedRef.current || isNearBottom();

    setMessages((prev) => {
      const streamingId = aiStreamingMessageIdRef.current;
      if (!streamingId) return prev;
      const idx = prev.findIndex((msg) => msg.id === streamingId);
      if (idx === -1) return prev;
      const updated = [...prev];
      updated[idx] = { ...updated[idx], content: updated[idx].content + bufferedChunk };
      return updated;
    });

    if (shouldPinToBottom) {
      scrollToBottomThrottled();
    }
  }, [isNearBottom, scrollToBottomThrottled]);

  const scheduleAiStreamFlush = useCallback(() => {
    if (aiStreamFlushTimerRef.current) return;
    aiStreamFlushTimerRef.current = setTimeout(() => {
      aiStreamFlushTimerRef.current = null;
      flushAiStreamBuffer();
    }, 40);
  }, [flushAiStreamBuffer]);

  const resetAiStreamOrdering = useCallback(() => {
    aiStreamBufferRef.current = '';
    aiStreamNextSequenceRef.current = 0;
    aiStreamPendingChunksRef.current.clear();
    aiStreamDoneSequenceRef.current = null;
  }, []);

  const parseAiStreamEvent = useCallback((payload: string): AiStreamEvent => {
    const text = String(payload || '');
    const normalized = text.trim();
    if (['DONE', '[DONE]', '__END__', AI_STREAM_DONE].includes(normalized)) {
      return { type: 'done' };
    }

    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object') {
        const eventType = parsed.type === 'done' || parsed.type === 'error' ? parsed.type : 'chunk';
        const sequence = typeof parsed.sequence === 'number' ? parsed.sequence : undefined;
        const content = typeof parsed.content === 'string' ? parsed.content : '';
        return { type: eventType, sequence, content };
      }
    } catch {
      // Legacy backend fallback: raw body is the token itself.
    }

    return { type: 'chunk', content: text };
  }, []);

  const completeAiStream = useCallback(() => {
    if (aiStreamFlushTimerRef.current) {
      clearTimeout(aiStreamFlushTimerRef.current);
      aiStreamFlushTimerRef.current = null;
    }
    flushAiStreamBuffer(true);
    aiDoneTimerRef.current = setTimeout(() => {
      aiStreamingMessageIdRef.current = null;
      resetAiStreamOrdering();
      setIsAiThinking(false);
      setIsAiResponding(false);
      aiDoneTimerRef.current = null;
    }, 250);
  }, [flushAiStreamBuffer, resetAiStreamOrdering]);

  const aiMarkdownComponents = useMemo(() => ({
    h1: ({ children }: { children?: React.ReactNode }) => (
      <h1 className="mb-2 text-[16px] font-semibold leading-6 text-vscode-fg">{children}</h1>
    ),
    h2: ({ children }: { children?: React.ReactNode }) => (
      <h2 className="mb-2 mt-2 text-[15px] font-semibold leading-6 text-vscode-fg">{children}</h2>
    ),
    h3: ({ children }: { children?: React.ReactNode }) => (
      <h3 className="mb-1.5 mt-2 text-[15px] font-medium leading-6 text-vscode-fg">{children}</h3>
    ),
    p: ({ children }: { children?: React.ReactNode }) => (
      <p className="mb-2 whitespace-pre-wrap text-[15px] leading-relaxed text-vscode-fg">{children}</p>
    ),
    ul: ({ children }: { children?: React.ReactNode }) => (
      <ul className="mb-2 ml-5 list-disc space-y-1 text-[15px] leading-relaxed text-vscode-fg">{children}</ul>
    ),
    ol: ({ children }: { children?: React.ReactNode }) => (
      <ol className="mb-2 ml-5 list-decimal space-y-1 text-[15px] leading-relaxed text-vscode-fg">{children}</ol>
    ),
    li: ({ children }: { children?: React.ReactNode }) => <li className="leading-relaxed">{children}</li>,
    pre: ({ children }: { children?: React.ReactNode }) => {
      const firstChild = React.Children.toArray(children)[0];
      const childElement = React.isValidElement(firstChild)
        ? firstChild as React.ReactElement<{ className?: string; children?: React.ReactNode }>
        : null;
      const className = childElement?.props?.className || '';
      const rawCode = String(childElement?.props?.children ?? '').replace(/\n$/, '');
      return <CodeBlock className={className} rawCode={rawCode} />;
    },
    code: ({ children }: { children?: React.ReactNode }) => (
      <code className="break-words rounded-md bg-vscode-iconBg px-1.5 py-0.5 font-mono text-[0.92em] text-vscode-fg">
        {children}
      </code>
    )
  }), []);

  const encodeAttachment = (payload: AttachmentPayload): string =>
    `${ATTACHMENT_PREFIX}${JSON.stringify(payload)}`;

  const decodeAttachment = (content: string): AttachmentPayload | null => {
    if (!content.startsWith(ATTACHMENT_PREFIX)) return null;
    try {
      return JSON.parse(content.slice(ATTACHMENT_PREFIX.length)) as AttachmentPayload;
    } catch {
      return null;
    }
  };

  const addContextFile = (filePath: string, pinToTop = false) => {
    if (!filePath) return;
    setContextFiles((prev) => {
      const normalized = filePath.trim();
      if (!normalized) return prev;
      const deduped = prev.filter((item) => item !== normalized);
      const merged = pinToTop ? [normalized, ...deduped] : [...deduped, normalized];
      return merged.slice(0, 8);
    });
  };

  const removeContextFile = (filePath: string) => {
    setContextFiles((prev) => prev.filter((item) => item !== filePath));
  };

  useEffect(() => {
    const checkConnection = () => setIsConnected(wsService.isConnected());
    checkConnection();
    connectionCheckInterval.current = setInterval(checkConnection, 1000);
    return () => {
      if (connectionCheckInterval.current) clearInterval(connectionCheckInterval.current);
      if (resizeFrameRef.current !== null) cancelAnimationFrame(resizeFrameRef.current);
      if (scrollRafRef.current !== null) cancelAnimationFrame(scrollRafRef.current);
      if (aiDoneTimerRef.current) clearTimeout(aiDoneTimerRef.current);
      if (aiStreamFlushTimerRef.current) clearTimeout(aiStreamFlushTimerRef.current);
    };
  }, []);

  useEffect(() => {
    initialScrollDoneRef.current = false;

    const handleMessage = (event: MessageEvent) => {
      const msg = event.data;
      if (msg && msg.type === 'privateMessagesLoaded' && Number(msg.otherUserId) === normalizedOtherUserId) {
        const data: ChatMessage[] = msg.messages || [];
        setMessages(data);
        setLoading(false);
        const unread = data.filter((m: any) => Number(m.senderId) === normalizedOtherUserId && !m.isRead);
        for (const m of unread) markAsRead(m.id);
        if (unread.length > 0) window.parent.postMessage({ type: 'newMessage' }, '*');
      } else if (msg && msg.type === 'classMessagesLoaded' && msg.classroomId === classroomId) {
        setMessages(msg.messages || []);
        setLoading(false);
      } else if (isAiAssistantChat && msg && msg.type === 'chatActiveFile') {
        const filePath = typeof msg.filePath === 'string' ? msg.filePath : '';
        setActiveFilePath(filePath);
        if (filePath) addContextFile(filePath, true);
      } else if (isAiAssistantChat && msg && msg.type === 'chatWorkspaceFilePicked') {
        const filePath = typeof msg.filePath === 'string' ? msg.filePath : '';
        if (filePath) addContextFile(filePath);
      } else if (isAiAssistantChat && msg && msg.type === 'aiAskFailed') {
        aiStreamingMessageIdRef.current = null;
        resetAiStreamOrdering();
        if (aiStreamFlushTimerRef.current) {
          clearTimeout(aiStreamFlushTimerRef.current);
          aiStreamFlushTimerRef.current = null;
        }
        setIsAiThinking(false);
        setIsAiResponding(false);
        const errorText = typeof msg.error === 'string' && msg.error.trim() ? msg.error : 'AI khong phan hoi!';
        const errorMessage: ChatMessage = {
          id: Date.now() + 1,
          senderId: AI_ASSISTANT_ID,
          senderName: otherUserName || 'AI Assistant',
          receiverId: currentUserId,
          content: errorText,
          type: MessageType.PRIVATE,
          isRead: true,
          sentAt: new Date().toISOString()
        };
        setMessages((prev) => [...prev, errorMessage]);
      }
    };

    window.addEventListener('message', handleMessage);
    if (isAiAssistantChat) vscode.postMessage({ type: 'requestChatActiveFile' });
    loadMessageHistory();
    const loadingTimeout = setTimeout(() => setLoading(false), 5000);

    return () => {
      window.removeEventListener('message', handleMessage);
      clearTimeout(loadingTimeout);
    };
  }, [otherUserId, classroomId, isAiAssistantChat, normalizedOtherUserId]);

  useEffect(() => {
    if (loading) return;
    if (!initialScrollDoneRef.current) {
      scrollToBottomInstant();
      initialScrollDoneRef.current = true;
      return;
    }
    const lastMsg = messages[messages.length - 1];
    const isStreaming =
      lastMsg?.senderId === AI_ASSISTANT_ID &&
      lastMsg?.id === aiStreamingMessageIdRef.current;
    if (!isStreaming) {
      scrollToBottom();
    }
  }, [messages, loading, scrollToBottom, scrollToBottomInstant]);

  useEffect(() => {
    if (!wsService.isConnected()) return;
    const removeListener = wsService.addGlobalMessageListener((message: ChatMessage) => {
      if (chatType === MessageType.PRIVATE && hasValidOtherUserId) {
        const isFromOther = Number(message.senderId) === normalizedOtherUserId;
        const isToOther = Number(message.receiverId) === normalizedOtherUserId && Number(message.senderId) === currentUserId;
        if (isFromOther || isToOther) {
          setMessages((prev) => {
            const existingIndex = prev.findIndex(m => m.id === message.id);
            if (existingIndex !== -1) {
              const updated = [...prev];
              updated[existingIndex] = message;
              return updated;
            }
            if (isToOther) {
              const optimisticIndex = prev.findIndex(m =>
                m.senderId === currentUserId &&
                Number(m.receiverId) === normalizedOtherUserId &&
                m.content === message.content &&
                m.id > Date.now() - 5000
              );
              if (optimisticIndex !== -1) {
                const updated = [...prev];
                updated[optimisticIndex] = message;
                return updated;
              }
            }
            return [...prev, message];
          });
          setTimeout(() => scrollToBottom(), 80);
          if (isFromOther && !message.isRead) setTimeout(() => markAsRead(message.id), 100);
        }
      } else if (chatType === MessageType.CLASS_GROUP && classroomId) {
        if (message.classroomId === classroomId) {
          setMessages((prev) => {
            const exists = prev.some(m => m.id === message.id);
            if (exists) return prev;
            if (message.senderId === currentUserId) {
              const optimisticIndex = prev.findIndex(m =>
                m.senderId === currentUserId &&
                m.content === message.content &&
                m.id > Date.now() - 5000
              );
              if (optimisticIndex !== -1) {
                const newMessages = [...prev];
                newMessages[optimisticIndex] = message;
                return newMessages;
              }
            }
            return [...prev, message];
          });
          setTimeout(() => scrollToBottom(), 80);
        }
      }
    });
    return () => removeListener();
  }, [currentUserId, otherUserId, classroomId, chatType, isConnected, hasValidOtherUserId, normalizedOtherUserId, scrollToBottom]);

  useEffect(() => {
    if (chatType !== MessageType.CLASS_GROUP || !classroomId || !wsService.isConnected()) return;
    const unsubscribe = wsService.subscribeToClassMessages(classroomId, () => { });
    return () => { if (unsubscribe) unsubscribe(); };
  }, [chatType, classroomId, isConnected]);

  const loadMessageHistory = () => {
    setLoading(true);
    if (chatType === MessageType.PRIVATE && hasValidOtherUserId) {
      vscode.postMessage({ type: 'getPrivateMessages', otherUserId: normalizedOtherUserId });
    } else if (chatType === MessageType.CLASS_GROUP && classroomId) {
      vscode.postMessage({ type: 'getClassMessages', classroomId });
    } else {
      setLoading(false);
    }
  };

  const markAsRead = (messageId: number) => {
    vscode.postMessage({ type: 'markMessageAsRead', messageId });
  };

  const handleSendMessage = async () => {
    const hasText = newMessage.trim().length > 0;
    const payloadContent = pendingAttachment ? encodeAttachment(pendingAttachment) : (hasText ? newMessage.trim() : '👍');
    if (!payloadContent) return;
    if (isAiAssistantChat && isAiResponding) {
      return;
    }
    if (isAiAssistantChat && !wsService.isConnected()) {
      alert('AI stream chua ket noi. Vui long doi WebSocket ket noi lai.');
      return;
    }
    if (!isAiAssistantChat && !isConnected) {
      alert('WebSocket chưa kết nối. Vui lòng đợi kết nối được thiết lập.');
      return;
    }
    try {
      const optimisticMessage: ChatMessage = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        senderId: currentUserId,
        senderName: currentUserName,
        receiverId: hasValidOtherUserId ? normalizedOtherUserId : undefined,
        classroomId: classroomId,
        content: payloadContent,
        messageType: chatType,
        sentAt: new Date().toISOString(),
        isRead: false
      };
      setMessages((prev) => [...prev, optimisticMessage]);

      if (isAiAssistantChat) {
        const aiResponseId = Date.now() + Math.floor(Math.random() * 1000) + 1;
        aiStreamingMessageIdRef.current = aiResponseId;
        resetAiStreamOrdering();
        keepStreamingPinnedRef.current = true;
        setIsAiThinking(true);
        setIsAiResponding(true);
        setMessages((prev) => [
          ...prev,
          {
            id: aiResponseId,
            senderId: AI_ASSISTANT_ID,
            senderName: otherUserName || 'AI Assistant',
            receiverId: currentUserId,
            content: '',
            type: MessageType.PRIVATE,
            isRead: true,
            sentAt: new Date().toISOString()
          }
        ]);
        vscode.postMessage({ type: 'askAiWithContext', message: payloadContent, contextFiles });
      } else if (chatType === MessageType.PRIVATE && hasValidOtherUserId) {
        wsService.sendPrivateMessage(normalizedOtherUserId, payloadContent);
      } else if (chatType === MessageType.CLASS_GROUP && classroomId) {
        wsService.sendClassMessage(classroomId, payloadContent);
      }

      setNewMessage('');
      setPendingAttachment(null);
      if (textareaRef.current) textareaRef.current.style.height = '32px';
      if (!isAiAssistantChat) setTimeout(() => window.parent.postMessage({ type: 'newMessage' }, '*'), 500);
      setTimeout(() => {
        if (isAiAssistantChat) {
          scrollToBottomInstant();
        } else {
          scrollToBottom();
        }
      }, 80);
    } catch (error) {
      console.error('Error sending message:', error);
      if (isAiAssistantChat) {
        aiStreamingMessageIdRef.current = null;
        resetAiStreamOrdering();
        setIsAiThinking(false);
        setIsAiResponding(false);
        setMessages((prev) => [...prev, {
          id: Date.now() + 1,
          senderId: AI_ASSISTANT_ID,
          senderName: otherUserName || 'AI Assistant',
          receiverId: currentUserId,
          content: 'AI khong phan hoi!',
          type: MessageType.PRIVATE,
          isRead: true,
          sentAt: new Date().toISOString()
        }]);
      } else {
        alert('Không thể gửi tin nhắn. Vui lòng thử lại.');
      }
    }
  };

  useEffect(() => {
    if (!isAiAssistantChat || !wsService.isConnected()) return;
    const unsubscribe = wsService.subscribeToAiStream((chunk: string) => {
      if (!chunk) return;
      if (aiDoneTimerRef.current) { clearTimeout(aiDoneTimerRef.current); aiDoneTimerRef.current = null; }

      const event = parseAiStreamEvent(chunk);
      const canFinishSequencedStream = () => {
        const doneSequence = aiStreamDoneSequenceRef.current;
        return doneSequence !== null && aiStreamNextSequenceRef.current >= doneSequence;
      };

      if (event.type === 'done') {
        if (typeof event.sequence === 'number') {
          aiStreamDoneSequenceRef.current = event.sequence;
          if (!canFinishSequencedStream()) return;
        }
        completeAiStream();
        return;
      }

      if (!aiStreamingMessageIdRef.current) return;
      keepStreamingPinnedRef.current = isNearBottom();
      setIsAiThinking(false);

      if (event.type === 'error') {
        if (event.content) {
          aiStreamBufferRef.current += event.content;
          scheduleAiStreamFlush();
        }
        completeAiStream();
        return;
      }

      if (typeof event.sequence === 'number') {
        if (event.sequence < aiStreamNextSequenceRef.current) return;
        aiStreamPendingChunksRef.current.set(event.sequence, event.content || '');

        while (aiStreamPendingChunksRef.current.has(aiStreamNextSequenceRef.current)) {
          const nextChunk = aiStreamPendingChunksRef.current.get(aiStreamNextSequenceRef.current) || '';
          aiStreamPendingChunksRef.current.delete(aiStreamNextSequenceRef.current);
          aiStreamBufferRef.current += nextChunk;
          aiStreamNextSequenceRef.current += 1;
        }

        if (canFinishSequencedStream()) {
          completeAiStream();
          return;
        }
      } else {
        aiStreamBufferRef.current += event.content || '';
      }

      setIsAiThinking(false);
      scheduleAiStreamFlush();
    });
    return () => {
      if (aiDoneTimerRef.current) { clearTimeout(aiDoneTimerRef.current); aiDoneTimerRef.current = null; }
      if (aiStreamFlushTimerRef.current) { clearTimeout(aiStreamFlushTimerRef.current); aiStreamFlushTimerRef.current = null; }
      resetAiStreamOrdering();
      if (unsubscribe) unsubscribe();
    };
  }, [isAiAssistantChat, currentUserId, otherUserName, isConnected, completeAiStream, isNearBottom, parseAiStreamEvent, resetAiStreamOrdering, scheduleAiStreamFlush]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (pendingAttachment) setPendingAttachment(null);
    setNewMessage(e.target.value);
    if (resizeFrameRef.current !== null) cancelAnimationFrame(resizeFrameRef.current);
    resizeFrameRef.current = requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = '32px';
        textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 100) + 'px';
      }
      resizeFrameRef.current = null;
    });
  };

  const handlePickWorkspaceFile = () => vscode.postMessage({ type: 'pickWorkspaceFileForChat' });
  const handleOpenContextFile = (filePath: string) => {
    if (!filePath) return;
    vscode.postMessage({ type: 'openChatContextFile', filePath });
  };

  const handleFilePicked = (file: File | null, kind: 'image' | 'file') => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      if (!dataUrl) return;
      setPendingAttachment({ kind, name: file.name, mimeType: file.type || 'application/octet-stream', dataUrl });
      setNewMessage('');
    };
    reader.readAsDataURL(file);
  };

  const renderMessageContent = useCallback((message: ChatMessage) => {
    const contentText = message.content || '';
    const attachment = decodeAttachment(contentText);
    if (!attachment) {
      const isAiMessage = isAiAssistantChat && message.senderId === AI_ASSISTANT_ID;
      if (isAiMessage) {
        const isCurrentStreamingMsg = message.id === aiStreamingMessageIdRef.current;
        // Show thinking spinner while AI hasn't sent any text yet
        if (isAiThinking && isCurrentStreamingMsg && !contentText) {
          return <ThinkingIndicator />;
        }
        return (
          <div className="text-[15px] leading-relaxed">
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={aiMarkdownComponents}>
              {contentText}
            </ReactMarkdown>
          </div>
        );
      }
      return (
        <div className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
          {contentText}
          {message.senderId === currentUserId && (
            <span className="ml-1 inline-flex items-center text-vscode-link">
              {message.isRead ? <CheckCheck size={12} strokeWidth={2.2} /> : <Check size={12} strokeWidth={2.2} />}
            </span>
          )}
        </div>
      );
    }
    if (attachment.kind === 'image') {
      return (
        <div className="flex flex-col gap-1.5">
          <img src={attachment.dataUrl} alt={attachment.name} className="max-h-[220px] max-w-[220px] rounded-sm object-cover" />
          <div className="text-[11px] text-vscode-desc">{attachment.name}</div>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-1.5">
        <a href={attachment.dataUrl} download={attachment.name} className="text-[12px] font-semibold text-vscode-link underline">
          <span className="inline-flex items-center gap-1.5"><File size={14} strokeWidth={2.2} />{attachment.name}</span>
        </a>
      </div>
    );
  }, [currentUserId, isAiAssistantChat, otherUserName, aiMarkdownComponents, isAiThinking]);

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return 'Hôm nay';
    if (date.toDateString() === yesterday.toDateString()) return 'Hôm qua';
    return date.toLocaleDateString('vi-VN');
  };

  const getMessageTimestamp = (message: ChatMessage): number => {
    const value = message.createdAt || message.sentAt;
    if (!value) return Number.NaN;
    return new Date(value).getTime();
  };

  const groupedMessages = useMemo(() => {
    const grouped: { [key: string]: ChatMessage[] } = {};
    messages.forEach((msg) => {
      const dateKey = formatDate(msg.createdAt || msg.sentAt || new Date().toISOString());
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push(msg);
    });
    return grouped;
  }, [messages]);

  const headerName = chatType === MessageType.PRIVATE ? (otherUserName || 'Unknown') : (classroomName || 'Class Group');
  const headerInitial = headerName.charAt(0).toUpperCase();
  const groupedDateKeys = useMemo(() => Object.keys(groupedMessages), [groupedMessages]);

  const renderedMessages = useMemo(() => {
    if (loading) {
      return (
        <div className="flex h-full w-full items-center justify-center">
          <div className="text-[12px] text-vscode-desc">Đang tải tin nhắn...</div>
        </div>
      );
    }
    if (groupedDateKeys.length === 0) {
      return (
        <div className="flex h-full flex-col items-center justify-center text-vscode-desc">
          <div className="mb-3 text-3xl">💬</div>
          <div className="text-xs">Chưa có tin nhắn nào</div>
        </div>
      );
    }
    return groupedDateKeys.map((dateKey) => (
      <div key={dateKey}>
        <div className="my-2 flex justify-center">
          <span className="rounded-sm bg-vscode-iconBg px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-vscode-desc">
            {dateKey}
          </span>
        </div>
        {groupedMessages[dateKey].map((message, messageIndex) => {
          const isOwnMessage = message.senderId === currentUserId;
          const messagesInDay = groupedMessages[dateKey];
          const previousMessage = messageIndex > 0 ? messagesInDay[messageIndex - 1] : null;
          const currentTimestamp = getMessageTimestamp(message);
          const previousTimestamp = previousMessage ? getMessageTimestamp(previousMessage) : Number.NaN;
          const showMeta = !previousMessage || Number.isNaN(currentTimestamp) || Number.isNaN(previousTimestamp)
            ? true
            : (currentTimestamp - previousTimestamp) >= 10 * 60 * 1000;

          return (
            <div key={message.id} className={`group flex max-w-[85%] flex-col ${isOwnMessage ? 'ml-auto items-end' : 'items-start'} mb-3`}>
              {showMeta && (
                <div className="mb-1 flex items-center gap-2">
                  {!isOwnMessage && (
                    <span className="text-[11px] font-semibold text-vscode-fg">
                      {chatType === MessageType.CLASS_GROUP ? message.senderName : headerName}
                    </span>
                  )}
                  <span className="text-[10px] text-vscode-desc">
                    {formatTime(message.createdAt || message.sentAt || new Date().toISOString())}
                  </span>
                  {isOwnMessage && <span className="text-[11px] font-semibold text-vscode-link">You</span>}
                </div>
              )}
              <div
                className={`rounded-xl px-3 py-2 text-[15px] leading-relaxed shadow-sm max-w-full overflow-hidden ${isOwnMessage
                  ? 'bg-vscode-iconBg text-vscode-fg shadow-[0_2px_8px_rgba(0,0,0,0.15)] border border-[var(--vscode-panel-border)]'
                  : 'bg-vscode-iconBg text-vscode-fg shadow-[0_2px_8px_rgba(0,0,0,0.15)] border border-[var(--vscode-panel-border)]'
                  }`}
                title={formatTime(message.createdAt || message.sentAt || new Date().toISOString())}
              >
                {renderMessageContent(message)}
              </div>
            </div>
          );
        })}
      </div>
    ));
  }, [loading, groupedDateKeys, groupedMessages, currentUserId, chatType, headerName, renderMessageContent]);

  return (
    <div className={
      fullScreen
        ? 'mx-auto flex h-screen min-h-screen w-full max-w-[420px] flex-col overflow-hidden bg-vscode-bg shadow-[0_12px_30px_rgba(0,0,0,0.3)]'
        : 'flex h-[560px] w-[360px] flex-col overflow-hidden rounded-sm bg-vscode-bg shadow-[0_8px_24px_rgba(0,0,0,0.25)]'
    }>
      {/* Header */}
      <div className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between bg-vscode-bg px-3.5 shadow-[0_6px_18px_rgba(0,0,0,0.2)] border-b border-solid border-[var(--vscode-panel-border)]">
        <div className="flex items-center gap-1">
          <button
            onClick={onClose}
            className="-ml-1 flex h-8 w-8 items-center justify-center rounded-sm text-vscode-desc transition-colors hover:bg-vscode-hoverBg hover:text-vscode-fg"
            title="Quay lại"
          >
            <span className="text-[20px] leading-none">←</span>
          </button>
          <div className="relative">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-vscode-iconBg text-[12px] font-semibold text-vscode-fg">
              {headerInitial}
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-[var(--vscode-panel-border)] bg-green-500" />
          </div>
          <div className="text-[15px] font-semibold tracking-tight text-vscode-fg">{headerName}</div>
        </div>
        <button className="flex h-8 w-8 items-center justify-center rounded-sm text-vscode-desc transition-colors hover:bg-vscode-hoverBg hover:text-vscode-fg" title="Tùy chọn">
          <span className="text-[20px] leading-none">⋮</span>
        </button>
      </div>

      {/* Messages Area */}
      <div ref={messagesContainerRef} className="custom-scrollbar flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto bg-vscode-bg px-3 py-3 [scrollbar-color:var(--vscode-scrollbarSlider-background)_transparent] [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-[var(--vscode-scrollbarSlider-background)] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-[6px]">
        {renderedMessages}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      {isAiAssistantChat ? (
        <div className="shrink-0 bg-vscode-bg px-2.5 py-2.5 border-t border-solid border-[var(--vscode-panel-border)]">
          <div className="rounded-xl bg-vscode-iconBg px-2.5 py-2 border border-solid border-[var(--vscode-panel-border)]">
            {contextFiles.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {contextFiles.map((filePath, index) => (
                  <span
                    key={`${filePath}-${index}`}
                    className={`inline-flex max-w-full items-center gap-1 rounded-md px-2 py-1 text-[11px] border border-solid border-[var(--vscode-panel-border)] ${index === 0 && filePath === activeFilePath
                      ? 'bg-vscode-activeBg text-vscode-activeFg'
                      : 'bg-vscode-iconBg text-vscode-desc'
                      }`}
                    title={filePath}
                  >
                    <File size={12} />
                    <button
                      type="button"
                      onClick={() => handleOpenContextFile(filePath)}
                      className="max-w-[180px] truncate text-left underline-offset-2 hover:underline"
                      title={`Mo file: ${filePath}`}
                    >
                      {filePath}
                    </button>
                    <button
                      type="button"
                      onClick={(event) => { event.stopPropagation(); removeContextFile(filePath); }}
                      className="rounded p-0.5 text-vscode-desc transition hover:bg-vscode-hoverBg hover:text-vscode-fg"
                      title="Bo file khoi context"
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={newMessage}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              rows={1}
              className="min-h-[36px] max-h-[110px] w-full resize-none border-0 bg-transparent px-1 py-0 text-[14px] leading-[20px] text-vscode-fg placeholder:text-vscode-desc outline-none [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--vscode-scrollbarSlider-background)]"
              disabled={false}
              placeholder="Nhap tin nhan..."
            />
            <div className="-mt-2 flex items-center justify-between pt-0">
              <button
                type="button"
                onClick={handlePickWorkspaceFile}
                className="flex h-8 w-8 items-center justify-center rounded-md text-vscode-desc transition hover:bg-vscode-hoverBg hover:text-vscode-fg"
                title="Them file trong workspace"
              >
                <Plus size={17} />
              </button>
              <button
                onClick={handleSendMessage}
                className={`flex h-8 w-8 items-center justify-center rounded-md transition ${newMessage.trim() && !isAiResponding ? 'text-vscode-fg hover:bg-vscode-hoverBg' : 'cursor-not-allowed text-vscode-desc opacity-40'
                  }`}
                disabled={!newMessage.trim() || isAiResponding}
                title="Gui"
              >
                <Send size={18} strokeWidth={2.2} />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="relative flex shrink-0 items-center gap-1.5 bg-vscode-bg px-2.5 py-2.5 border-t border-solid border-[var(--vscode-panel-border)]">
          <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFilePicked(e.target.files?.[0] || null, 'image')} />
          <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => handleFilePicked(e.target.files?.[0] || null, 'file')} />
          <div className="flex items-center">
            <button
              className="flex h-9 w-9 items-center justify-center rounded-sm text-vscode-desc transition-colors duration-150 hover:bg-vscode-hoverBg hover:text-vscode-link disabled:opacity-40"
              onClick={() => imageInputRef.current?.click()}
              title="Gửi ảnh"
              disabled={!isConnected}
            >
              <ImagePlus size={19} strokeWidth={2.1} />
            </button>
            <button
              className="flex h-9 w-9 items-center justify-center rounded-sm text-vscode-desc transition-colors duration-150 hover:bg-vscode-hoverBg hover:text-vscode-link disabled:opacity-40"
              onClick={() => fileInputRef.current?.click()}
              title="Gửi file"
              disabled={!isConnected}
            >
              <Paperclip size={19} strokeWidth={2.1} />
            </button>
          </div>
          <textarea
            ref={textareaRef}
            value={newMessage}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            className="h-[40px] min-h-[40px] max-h-[160px] flex-1 resize-none rounded-sm border border-solid border-[var(--vscode-input-border)] bg-vscode-iconBg px-2.5 py-2 text-[14px] leading-[20px] text-vscode-fg placeholder:text-vscode-desc outline-none focus:border-[var(--vscode-focusBorder)] focus:ring-0"
            disabled={!isConnected}
            placeholder={pendingAttachment ? `Sẵn sàng gửi: ${pendingAttachment.name}` : 'Nhập tin nhắn...'}
          />
          <button
            onClick={handleSendMessage}
            disabled={!isConnected}
            className={`flex h-9 w-9 items-center justify-center rounded-sm p-0 transition-all duration-150 ${isConnected
              ? 'cursor-pointer text-vscode-link hover:bg-vscode-hoverBg'
              : 'cursor-not-allowed text-vscode-desc opacity-40'
              }`}
            title={(newMessage.trim() || pendingAttachment) ? 'Gửi' : 'Thả tim'}
          >
            {(newMessage.trim() || pendingAttachment) ? (
              <Send size={20} strokeWidth={2.4} />
            ) : (
              <ThumbsUp size={19} strokeWidth={2.4} />
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default ChatWindow;

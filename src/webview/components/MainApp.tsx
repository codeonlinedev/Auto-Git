import React, { useState, useEffect, useRef } from 'react';
import LoginPage from './auth/LoginPage';
import WelcomeScreen from './auth/WelcomeScreen';
import TeacherDashboard from './classroom/TeacherDashboard';
import StudentDashboard from './classroom/StudentDashboard';
import { ApiService } from '../../services/apiService';
import { getWebSocketService } from '../services/websocketService';

interface MainAppProps {
  vscode: any;
}

const MainApp: React.FC<MainAppProps> = ({ vscode }) => {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedRole, setSelectedRole] = useState<'TEACHER' | 'STUDENT' | null>(null);
  const hasCheckedLogin = useRef(false);
  const apiService = useRef(new ApiService()).current;
  const wsService = useRef(getWebSocketService()).current;
  const resolveUserId = (userLike: any): number => {
    const parsed = Number(userLike?.userId ?? userLike?.id);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;

      switch (message.type) {
        case 'loginSuccess':
          setUser(message.user);
          setLoading(false);
          setSelectedRole(null);
          // Set token for apiService
          if (message.token) {
            apiService.setToken(message.token);
            // Connect WebSocket
            if (message.user) {
              const resolvedUserId = resolveUserId(message.user);
              if (resolvedUserId > 0) {
                connectWebSocket(resolvedUserId, message.token);
              }
            }
          }
          break;
        case 'logout':
          setUser(null);
          setSelectedRole(null);
          setLoading(false);
          apiService.setToken(null);
          // Disconnect WebSocket
          wsService.disconnect();
          break;
        case 'restoreState':
          // Nhận state từ extension
          if (message.user) {
            setUser(message.user);
          }
          // Set token for apiService if available
          if (message.token) {
            apiService.setToken(message.token);
            // Connect WebSocket if user is logged in
            if (message.user) {
              const resolvedUserId = resolveUserId(message.user);
              if (resolvedUserId > 0) {
                connectWebSocket(resolvedUserId, message.token);
              }
            }
          }
          setLoading(false);
          break;
      }
    };

    window.addEventListener('message', handleMessage);

    // Chỉ gọi checkLoginStatus 1 lần duy nhất khi component mount
    if (!hasCheckedLogin.current) {
      hasCheckedLogin.current = true;
      vscode.postMessage({ type: 'checkLoginStatus' });
    }

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  const connectWebSocket = async (userId: number, token: string) => {
    try {
      // Connect WebSocket if not connected
      if (!wsService.isConnected()) {
        await wsService.connect(userId, token, () => {
        });
      }

      // ALWAYS set up global subscription (whether newly connected or already connected)
      wsService.subscribeToPrivateMessages(userId, (message) => {

        // Broadcast message to all components via window.postMessage
        window.postMessage({ type: 'websocketMessage', message }, '*');

        // Notify extension about new message
        vscode.postMessage({ type: 'newMessage', message });
      });

      wsService.subscribeToNotifications(userId, (notification) => {
        window.postMessage({ type: 'websocketNotification', notification }, '*');
      });
    } catch (error) {
    }
  };

  const handleSelectRole = (role: 'TEACHER' | 'STUDENT') => {
    setSelectedRole(role);
  };

  const handleBackToRoleSelection = () => {
    setSelectedRole(null);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#fafafa]">
        <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-[#e5e5e5] border-t-black" />
        <p className="mt-4 text-sm font-medium text-[#8e8e8e]">Đang tải...</p>
      </div>
    );
  }

  if (!user) {
    if (!selectedRole) {
      return <WelcomeScreen onSelectRole={(role) => handleSelectRole(role.toUpperCase() as 'TEACHER' | 'STUDENT')} />;
    }
    return (
      <LoginPage
        vscode={vscode}
        role={selectedRole}
        onBack={handleBackToRoleSelection}
      />
    );
  }

  return (
    <div className="relative flex min-h-screen">
      {/* Main Content */}
      <div className="min-h-screen flex-1">
        {user.role === 'TEACHER' ? (
          <TeacherDashboard vscode={vscode} user={user} />
        ) : (
          <StudentDashboard vscode={vscode} user={user} apiService={apiService} />
        )}
      </div>

    </div>
  );
};

export default MainApp;

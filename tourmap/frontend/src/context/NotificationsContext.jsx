// @refresh reset
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const NotificationsContext = createContext(null);
const STORAGE_KEY = 'tourmap_notifications';
const MAX_STORED  = 20;

function loadFromStorage() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}

export function NotificationsProvider({ children }) {
  const { token, isAuthenticated, user } = useAuth();
  const [notifications, setNotifications] = useState(loadFromStorage);
  const socketRef = useRef(null);
  const userRef   = useRef(user);

  // Mantém userRef atualizado sem recriar o socket
  useEffect(() => { userRef.current = user; }, [user]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // ── Persistência ────────────────────────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications.slice(0, MAX_STORED)));
  }, [notifications]);

  // ── Limpar ao deslogar ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) {
      setNotifications([]);
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [isAuthenticated]);

  // ── Helpers (definidos antes do socket para evitar stale closure) ────────────
  const addNotification = useCallback(({ type, message, data = {} }) => {
    setNotifications((prev) => [
      { id: `${Date.now()}-${Math.random()}`, type, message, data, read: false, createdAt: new Date().toISOString() },
      ...prev.slice(0, MAX_STORED - 1),
    ]);
  }, []);

  const markRead = useCallback((id) => {
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearAll = useCallback(() => setNotifications([]), []);

  // ── Conexão global Socket.IO para notificações ──────────────────────────────
  useEffect(() => {
    const SOCKET_URL = import.meta.env.DEV ? 'http://localhost:3001' : '/';
    const socket = io(SOCKET_URL, {
      path: '/socket.io',
      auth: token ? { token } : {},
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 3,
    });

    socket.on('alert:new', (data) => {
      const suffix = data.triggerType === 'rsvp'
        ? '— você confirmou presença'
        : '— você avaliou este lugar';
      addNotification({
        type:    'alert',
        message: `⚠️ Alerta em ${data.placeName || 'um lugar'} ${suffix}`,
        data,
      });
    });

    // Só notifica se quem postou NÃO for o próprio usuário logado
    socket.on('review:new', (data) => {
      if (data.review?.author?.id === userRef.current?.id) return;
      addNotification({
        type:    'review',
        message: `💬 Nova avaliação em "${data.placeName || 'um lugar que você acompanha'}"`,
        data,
      });
    });

    socketRef.current = socket;
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, addNotification]);

  // ── Gerenciamento de salas de lugar ─────────────────────────────────────────
  const joinPlace = useCallback((placeId) => {
    if (socketRef.current && placeId) {
      socketRef.current.emit('join:place', placeId);
    }
  }, []);

  const leavePlace = useCallback((placeId) => {
    if (socketRef.current && placeId) {
      socketRef.current.emit('leave:place', placeId);
    }
  }, []);

  return (
    <NotificationsContext.Provider
      value={{
        notifications: notifications.slice(0, 5),
        unreadCount,
        addNotification,
        markRead,
        markAllRead,
        clearAll,
        joinPlace,
        leavePlace,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications deve ser usado dentro de <NotificationsProvider>');
  return ctx;
}

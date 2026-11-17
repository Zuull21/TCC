import { useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

export function useSocket({
  token = null,
  onAlertUpdated,
  onReviewNew,
  onReviewUpdated,
  onReviewDeleted,
} = {}) {
  const socketRef        = useRef(null);
  const currentRoom      = useRef(null);
  const onAlertRef       = useRef(onAlertUpdated);
  const onReviewRef      = useRef(onReviewNew);
  const onReviewUpdRef   = useRef(onReviewUpdated);
  const onReviewDelRef   = useRef(onReviewDeleted);

  useEffect(() => { onAlertRef.current     = onAlertUpdated;  }, [onAlertUpdated]);
  useEffect(() => { onReviewRef.current    = onReviewNew;     }, [onReviewNew]);
  useEffect(() => { onReviewUpdRef.current = onReviewUpdated; }, [onReviewUpdated]);
  useEffect(() => { onReviewDelRef.current = onReviewDeleted; }, [onReviewDeleted]);

  useEffect(() => {
    const SOCKET_URL = import.meta.env.DEV ? 'http://localhost:3001' : '/';
    const socket = io(SOCKET_URL, {
      path: '/socket.io',
      auth: token ? { token } : {},
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });

    // Re-entra na sala após reconexão (servidor perde o estado das salas)
    socket.on('connect', () => {
      if (currentRoom.current) {
        socket.emit('join:place', currentRoom.current);
      }
    });

    socket.on('connect_error', (err) => {
      if (import.meta.env.DEV) console.warn('[Socket.IO] erro de conexão:', err.message);
    });

    socket.on('alert:updated',  (data) => { onAlertRef.current?.(data);     });
    socket.on('review:new',     (data) => { onReviewRef.current?.(data);    });
    socket.on('review:updated', (data) => { onReviewUpdRef.current?.(data); });
    socket.on('review:deleted', (data) => { onReviewDelRef.current?.(data); });

    socketRef.current = socket;
    return () => socket.disconnect();
  }, [token]);

  const joinPlace = useCallback((placeId) => {
    if (!socketRef.current || !placeId) return;
    if (currentRoom.current) {
      socketRef.current.emit('leave:place', currentRoom.current);
    }
    socketRef.current.emit('join:place', placeId);
    currentRoom.current = placeId;
  }, []);

  const leavePlace = useCallback((placeId) => {
    if (!socketRef.current) return;
    socketRef.current.emit('leave:place', placeId ?? currentRoom.current);
    currentRoom.current = null;
  }, []);

  return { joinPlace, leavePlace };
}

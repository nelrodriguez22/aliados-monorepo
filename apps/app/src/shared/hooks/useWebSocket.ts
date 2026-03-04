import { useEffect, useRef, useState } from 'react';
import { Client } from '@stomp/stompjs';
import type { StompSubscription } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { auth } from '@/shared/lib/firebase';
import { useStore } from '@/shared/store/useStore';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

/**
 * useWebSocket
 *
 * Se conecta cuando el store tiene user autenticado Y Firebase tiene currentUser.
 * Se desconecta cuando el store pierde auth.
 *
 * Usa user.uid como dependencia estable — no reacciona a cambios de
 * propiedades del user (como status), solo a cambios de identidad.
 */
export const useWebSocket = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<Client | null>(null);
  const subscriptionsRef = useRef<Map<string, StompSubscription>>(new Map());
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const queryClient = useQueryClient();

  // Usar uid como dependencia estable — evita reconexiones por cambios de status/datos
  const uid = useStore((s) => s.user?.uid ?? null);

  useEffect(() => {
    if (!uid) {
      // No autenticado → desconectar si había conexión
      clearHeartbeat();
      if (clientRef.current) {
        clientRef.current.deactivate();
        clientRef.current = null;
      }
      setIsConnected(false);
      return;
    }

    // Ya conectado → no reconectar
    if (clientRef.current?.connected) {
      return;
    }

    const connect = async () => {
      try {
        // Verificar que Firebase tenga un usuario real (no solo cache del store)
        const firebaseUser = auth.currentUser;
        if (!firebaseUser) return;

        const token = await firebaseUser.getIdToken();
        const wsUrl = `${import.meta.env.VITE_API_URL}/ws?token=${token}`;

        const client = new Client({
          // @ts-ignore - SockJS type mismatch
          webSocketFactory: () => new SockJS(wsUrl),

          connectHeaders: {
            Authorization: `Bearer ${token}`,
          },

          reconnectDelay: 5000,

          onConnect: () => {
            setIsConnected(true);
            setError(null);

            const notifSub = client.subscribe('/user/queue/notifications', (message) => {
              const data = JSON.parse(message.body);
              handleNotification(data);
            });

            subscriptionsRef.current.set('notifications', notifSub);
            startHeartbeat(client);
          },

          onDisconnect: () => {
            setIsConnected(false);
            clearHeartbeat();
          },

          onStompError: (frame) => {
            console.error('Error STOMP:', frame);
            setError(frame.headers['message'] || 'Error de conexión');
          },

          onWebSocketError: () => {
            // Silenciar errores de conexión esperados (ej: reconexión)
            setError('Error de conexión WebSocket');
          },
        });

        client.activate();
        clientRef.current = client;
      } catch (err) {
        console.error('Error al conectar WebSocket:', err);
        setError('Error al conectar');
      }
    };

    connect();

    return () => {
      clearHeartbeat();
      if (clientRef.current) {
        clientRef.current.deactivate();
        clientRef.current = null;
      }
    };
  }, [uid]);

  const handleNotification = (notification: any) => {
    const { tipo, trabajoId, mensaje } = notification;

    // Actualizar count de la campanita optimistamente
    queryClient.setQueryData(['notificaciones-unread'], (old: any) => ({
      count: (old?.count || 0) + 1,
    }));

    switch (tipo) {
      case 'NUEVO_TRABAJO':
        toast('🔔 ' + mensaje, { duration: 5000 });
        queryClient.invalidateQueries({ queryKey: ['trabajos-pendientes'] });
        break;

      case 'PROPUESTA_RECIBIDA':
        toast.success('📋 ' + mensaje, { duration: 6000 });
        queryClient.invalidateQueries({ queryKey: ['trabajos-cliente'] });
        queryClient.invalidateQueries({ queryKey: ['trabajo', String(trabajoId)] });
        break;

      case 'PROPUESTA_ACEPTADA':
        toast.success('✅ ' + mensaje, { duration: 5000 });
        queryClient.invalidateQueries({ queryKey: ['trabajos-pendientes'] });
        queryClient.invalidateQueries({ queryKey: ['trabajo-activo'] });
        queryClient.invalidateQueries({ queryKey: ['trabajos-en-cola'] });
        break;

      case 'PROPUESTA_RECHAZADA':
        toast('❌ ' + mensaje, { duration: 5000 });
        queryClient.invalidateQueries({ queryKey: ['trabajos-pendientes'] });
        break;

      case 'PROVEEDOR_ASIGNADO':
        toast.success('🚗 ' + mensaje, { duration: 5000 });
        queryClient.setQueryData(['trabajos-cliente'], (old: any[] | undefined) => {
          if (!old) return old;
          return old.map((t: any) => (t.id === trabajoId ? { ...t, estado: 'EN_CURSO' } : t));
        });
        queryClient.refetchQueries({ queryKey: ['trabajo', String(trabajoId)] });
        queryClient.refetchQueries({ queryKey: ['trabajos-cliente'] });
        break;

      case 'TRABAJO_COMPLETADO':
        toast.success('✅ ' + mensaje, { duration: 5000 });
        queryClient.setQueryData(['trabajos-cliente'], (old: any[] | undefined) => {
          if (!old) return old;
          return old.filter((t: any) => t.id !== trabajoId);
        });
        queryClient.refetchQueries({ queryKey: ['trabajo', String(trabajoId)] });
        queryClient.refetchQueries({ queryKey: ['trabajos-cliente-completados'] });
        break;

      case 'TRABAJO_EN_CURSO':
        toast.success('🚗 ' + mensaje, { duration: 5000 });
        queryClient.invalidateQueries({ queryKey: ['trabajos-cliente'] });
        queryClient.invalidateQueries({ queryKey: ['trabajo', String(trabajoId)] });
        break;

      case 'TRABAJO_COLA_ACTIVADO':
        toast.success('🔄 ' + mensaje, { duration: 5000 });
        queryClient.invalidateQueries({ queryKey: ['trabajo-activo'] });
        queryClient.invalidateQueries({ queryKey: ['trabajos-en-cola'] });
        break;

      case 'CALIFICACION_RECIBIDA':
        toast('⭐ ' + mensaje, { duration: 5000 });
        queryClient.invalidateQueries({ queryKey: ['trabajos-completados'] });
        queryClient.invalidateQueries({ queryKey: ['calificacion-promedio'] });
        break;

      case 'TRABAJO_COMPLETADO_PROVEEDOR':
        toast.success('✅ ' + mensaje, { duration: 5000 });
        queryClient.invalidateQueries({ queryKey: ['trabajo-activo'] });
        queryClient.invalidateQueries({ queryKey: ['trabajos-en-cola'] });
        queryClient.invalidateQueries({ queryKey: ['trabajos-completados'] });
        break;

      default:
        console.log('Notificación no manejada:', tipo);
    }
  };

  const startHeartbeat = (client: Client) => {
    clearHeartbeat();
    heartbeatRef.current = setInterval(() => {
      if (client.connected) {
        client.publish({
          destination: '/app/heartbeat',
          body: JSON.stringify({ timestamp: new Date().toISOString() }),
        });
      }
    }, 30000);
  };

  const clearHeartbeat = () => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  };

  const changeStatus = (status: 'ONLINE' | 'BUSY' | 'OFFLINE') => {
    if (clientRef.current?.connected) {
      clientRef.current.publish({
        destination: '/app/status',
        body: JSON.stringify({ status }),
      });
    }
  };

  return {
    isConnected,
    error,
    changeStatus,
  };
};

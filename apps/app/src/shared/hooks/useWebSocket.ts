import { useEffect, useRef, useState } from 'react';
import type { Client, StompSubscription } from '@stomp/stompjs';
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
        // El token NO va en la URL (quedaría en logs de servidor/proxy e historial).
        // La autenticación real se hace con el header Authorization del frame STOMP CONNECT
        // (ver WebSocketAuthInterceptor en el backend).
        const wsUrl = `${import.meta.env.VITE_API_URL}/ws`;

        // Carga diferida: sockjs + stomp solo se descargan al conectar
        // (usuario autenticado), no en el arranque de la app.
        const [{ Client }, { default: SockJS }] = await Promise.all([
          import('@stomp/stompjs'),
          import('sockjs-client'),
        ]);

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
            setError(frame.headers['message'] || 'Error de conexión');
          },

          onWebSocketError: () => {
            // Silenciar errores de conexión esperados (ej: reconexión)
            setError('Error de conexión WebSocket');
          },
        });

        client.activate();
        clientRef.current = client;
      } catch {
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
        // El backend pasó el proveedor a BUSY. Refrescamos el perfil para que el
        // store actualice user.status → isBusy, que habilita la query 'trabajo-activo'
        // (enabled: isBusy). Sin esto, invalidar 'trabajo-activo' es no-op porque RQ
        // no refetchea una query deshabilitada hasta recargar la página.
        queryClient.invalidateQueries({ queryKey: ['auth-profile'] });
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
        queryClient.invalidateQueries({ queryKey: ['trabajos-historial'] });
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

      // ── Mudanzas ──
      case 'NUEVA_MUDANZA':
        toast('🚚 ' + mensaje, { duration: 6000 });
        queryClient.invalidateQueries({ queryKey: ['mudanzas-pendientes-prov'] });
        break;

      case 'MUDANZA_ACEPTADA':
        toast.success('✅ ' + mensaje, { duration: 5000 });
        queryClient.invalidateQueries({ queryKey: ['mudanzas-cliente'] });
        queryClient.invalidateQueries({ queryKey: ['mudanza'] });
        break;

      case 'MUDANZA_CONTRAPROPUESTA':
        toast('📋 ' + mensaje, { duration: 6000 });
        queryClient.invalidateQueries({ queryKey: ['mudanzas-cliente'] });
        queryClient.invalidateQueries({ queryKey: ['mudanza'] });
        break;

      case 'MUDANZA_CONTRAPROPUESTA_ACEPTADA':
        toast.success('✅ ' + mensaje, { duration: 5000 });
        queryClient.invalidateQueries({ queryKey: ['mudanza-activa-prov'] });
        queryClient.invalidateQueries({ queryKey: ['mudanzas-pendientes-prov'] });
        queryClient.invalidateQueries({ queryKey: ['mudanza-prov'] });
        break;

      case 'MUDANZA_CONTRAPROPUESTA_RECHAZADA':
        toast('❌ ' + mensaje, { duration: 5000 });
        queryClient.invalidateQueries({ queryKey: ['mudanza-activa-prov'] });
        queryClient.invalidateQueries({ queryKey: ['mudanzas-pendientes-prov'] });
        queryClient.invalidateQueries({ queryKey: ['mudanza-prov'] });
        break;

      case 'MUDANZA_INICIADA':
        toast.success('🚚 ' + mensaje, { duration: 5000 });
        queryClient.invalidateQueries({ queryKey: ['mudanzas-cliente'] });
        queryClient.invalidateQueries({ queryKey: ['mudanza'] });
        break;

      case 'MUDANZA_FINALIZADA':
        toast.success('✅ ' + mensaje, { duration: 5000 });
        queryClient.invalidateQueries({ queryKey: ['mudanzas-cliente'] });
        queryClient.invalidateQueries({ queryKey: ['mudanza'] });
        break;

      case 'MUDANZA_COMPLETADA':
        toast.success('✅ ' + mensaje, { duration: 5000 });
        queryClient.invalidateQueries({ queryKey: ['mudanza-activa-prov'] });
        queryClient.invalidateQueries({ queryKey: ['mudanza-prov'] });
        break;

      default:
        break;
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

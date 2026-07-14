import { useCallback, useEffect, useRef, useState } from 'react';
import type { Client, StompSubscription } from '@stomp/stompjs';
import { auth } from '@/shared/lib/firebase';
import { useStore } from '@/shared/store/useStore';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

/** Un suscriptor registrado en el hook (independiente del estado de la conexión). */
interface Suscriptor {
  id: number;
  destino: string;
  handler: (payload: any) => void;
}

/**
 * Abre la suscripción STOMP real de un suscriptor y la guarda para poder cerrarla.
 *
 * El payload del frame viene como string: el handler siempre recibe el objeto ya
 * parseado (mismo contrato que tenía la suscripción hardcodeada de notificaciones).
 */
const aplicarSuscripcion = (
  client: Client,
  suscriptor: Suscriptor,
  stompSubs: Map<number, StompSubscription>,
) => {
  const sub = client.subscribe(suscriptor.destino, (message) => {
    suscriptor.handler(JSON.parse(message.body));
  });
  stompSubs.set(suscriptor.id, sub);
};

/**
 * useWebSocket
 *
 * Se conecta cuando el store tiene user autenticado Y Firebase tiene currentUser.
 * Se desconecta cuando el store pierde auth.
 *
 * Usa user.uid como dependencia estable — no reacciona a cambios de
 * propiedades del user (como status), solo a cambios de identidad.
 *
 * Expone subscribe(destino, handler) para que cualquier feature (notificaciones,
 * chat, …) se cuelgue de la MISMA conexión. Las notificaciones son un consumidor
 * más de esa API, no un caso especial.
 *
 * OJO: el hook abre una conexión propia. No llamarlo desde varios componentes —
 * se consume vía WebSocketProvider, que mantiene una sola instancia.
 */
export const useWebSocket = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<Client | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const queryClient = useQueryClient();

  // Registro de suscriptores. Es la fuente de verdad y NO depende de la conexión:
  // sobrevive a caídas y reconexiones del socket.
  const suscriptoresRef = useRef<Map<number, Suscriptor>>(new Map());
  // Suscripciones STOMP vivas (id de suscriptor → sub). OJO: esto NO se vacía de forma
  // confiable en onDisconnect. @stomp/stompjs sólo invoca onDisconnect cuando llega el
  // receipt de un DISCONNECT limpio; una caída real (wifi, restart del backend, laptop
  // suspendida) NUNCA lo dispara. La invalidación que de verdad importa es el clear()
  // incondicional de onConnect (más abajo) — por eso ese clear() no se puede sacar aunque
  // "parezca" redundante con el de acá.
  const stompSubsRef = useRef<Map<number, StompSubscription>>(new Map());
  const proximoIdRef = useRef(0);
  // handleNotification se recrea en cada render; lo leemos por ref para que la
  // suscripción a notificaciones se registre UNA sola vez y nunca quede stale.
  const handleNotificationRef = useRef<(notification: any) => void>(() => {});

  // Usar uid como dependencia estable — evita reconexiones por cambios de status/datos
  const uid = useStore((s) => s.user?.uid ?? null);

  /**
   * Suscribe un handler a un destino STOMP. Devuelve la función que desuscribe.
   *
   * Se puede llamar en cualquier momento, incluso con el socket todavía conectando
   * o reconectando: el suscriptor queda registrado y la suscripción real se abre en
   * el onConnect. Sin esto, un componente que monta durante la reconexión quedaría
   * mudo para siempre y sin ningún error.
   */
  const subscribe = useCallback((destino: string, handler: (payload: any) => void) => {
    const id = ++proximoIdRef.current;
    const suscriptor: Suscriptor = { id, destino, handler };
    suscriptoresRef.current.set(id, suscriptor);

    // Si ya hay conexión, la abrimos ahora; si no, queda pendiente para el onConnect.
    const client = clientRef.current;
    if (client?.connected) {
      aplicarSuscripcion(client, suscriptor, stompSubsRef.current);
    }

    return () => {
      suscriptoresRef.current.delete(id);
      const sub = stompSubsRef.current.get(id);
      stompSubsRef.current.delete(id);
      try {
        sub?.unsubscribe();
      } catch {
        // El socket pudo haberse caído antes de desuscribirse: la sub ya está muerta.
      }
    };
  }, []);

  useEffect(() => {
    if (!uid) {
      // No autenticado → desconectar si había conexión
      clearHeartbeat();
      if (clientRef.current) {
        clientRef.current.deactivate();
        clientRef.current = null;
      }
      // Las suscripciones STOMP mueren con el cliente. Los suscriptores (suscriptoresRef)
      // siguen registrados: si el usuario vuelve a loguearse, se re-aplican en el onConnect.
      stompSubsRef.current.clear();
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

            // (Re)aplicar TODOS los suscriptores registrados, no sólo los pendientes:
            // una reconexión invalida las suscripciones STOMP anteriores, así que las
            // que ya estaban activas también hay que volver a abrirlas.
            //
            // Este clear() es INCONDICIONAL a propósito y no se puede sacar ni
            // condicionar a "si veníamos de un onDisconnect": en una caída real ese
            // callback no corre (ver comentario en onDisconnect más abajo), así que este
            // es el único lugar del código donde se garantiza que stompSubsRef no arrastre
            // suscripciones muertas de la conexión anterior.
            stompSubsRef.current.clear();
            suscriptoresRef.current.forEach((suscriptor) => {
              aplicarSuscripcion(client, suscriptor, stompSubsRef.current);
            });

            startHeartbeat(client);
          },

          onDisconnect: () => {
            setIsConnected(false);
            clearHeartbeat();
            // OJO: este callback SOLO corre en una desconexión limpia (con receipt de
            // DISCONNECT). En una caída real (wifi, restart del backend, laptop
            // suspendida) @stomp/stompjs NUNCA llama a onDisconnect, así que este clear()
            // es apenas un extra para el caso prolijo. La limpieza que de verdad protege
            // contra suscripciones muertas es el clear() incondicional de onConnect: NO
            // depende de que este callback llegue a dispararse.
            stompSubsRef.current.clear();
          },

          onStompError: (frame) => {
            setError(frame.headers['message'] || 'Error de conexión');
          },

          onWebSocketError: () => {
            // Silenciar errores de conexión esperados (ej: reconexión)
            setError('Error de conexión WebSocket');
          },
        });

        // Publicar el cliente ANTES de activar: onConnect puede dispararse enseguida y
        // subscribe() necesita ver el cliente para no dejar suscripciones colgadas.
        clientRef.current = client;
        client.activate();
      } catch {
        setError('Error al conectar');
      }
    };

    connect();

    // El Map se crea una sola vez y nunca se reasigna; lo capturamos para el cleanup.
    const stompSubs = stompSubsRef.current;

    return () => {
      clearHeartbeat();
      if (clientRef.current) {
        clientRef.current.deactivate();
        clientRef.current = null;
      }
      stompSubs.clear();
    };
  }, [uid]);

  // Las notificaciones son un consumidor más de subscribe(): se registran una sola vez
  // (subscribe es estable) y el hook se encarga de aplicarlas al conectar y de
  // re-aplicarlas en cada reconexión. Antes esto era una suscripción hardcodeada
  // dentro del onConnect.
  useEffect(() => {
    return subscribe('/user/queue/notifications', (data) => {
      handleNotificationRef.current(data);
    });
  }, [subscribe]);

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

  // Mantener fresca la referencia que usa la suscripción a notificaciones.
  useEffect(() => {
    handleNotificationRef.current = handleNotification;
  });

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
    subscribe,
  };
};

import { createContext, useContext, type JSX, type ReactNode } from 'react';
import { useWebSocket } from '@/shared/hooks/useWebSocket';

interface WebSocketContextValue {
  /** true cuando el STOMP client está conectado y recibiendo push. */
  isConnected: boolean;
  changeStatus: (status: 'ONLINE' | 'BUSY' | 'OFFLINE') => void;
  /**
   * Suscribe un handler a un destino STOMP sobre la conexión compartida.
   * Devuelve la función que desuscribe. Se puede llamar aunque el socket todavía
   * no haya conectado: la suscripción queda pendiente y se aplica al conectar.
   */
  subscribe: (destino: string, handler: (payload: any) => void) => () => void;
}

const WebSocketContext = createContext<WebSocketContextValue>({
  isConnected: false,
  changeStatus: () => {},
  // Default fuera de un WebSocketProvider real: NO lanza (rompería el render), pero
  // tampoco puede fallar en silencio. Sin este warn, un componente que llame a
  // subscribe() fuera del provider "funciona" (no hay error) pero jamás va a
  // recibir un mensaje — el modo de falla más difícil de detectar que hay.
  subscribe: (destino: string) => {
    console.warn(
      `useWebSocketContext: subscribe('${destino}') se llamó fuera de un WebSocketProvider. ` +
        'No hay conexión real detrás del contexto default: este handler NUNCA va a recibir mensajes.',
    );
    return () => {};
  },
});

interface WebSocketProviderProps {
  children: ReactNode;
}

export function WebSocketProvider({ children }: WebSocketProviderProps): JSX.Element {
  // useWebSocket mantiene UNA sola conexión; el estado se comparte por contexto.
  // Por eso subscribe() también se expone acá: llamar a useWebSocket() desde otro
  // componente abriría un segundo socket.
  const { isConnected, changeStatus, subscribe } = useWebSocket();

  return (
    <WebSocketContext.Provider value={{ isConnected, changeStatus, subscribe }}>
      {children}
    </WebSocketContext.Provider>
  );
}

/**
 * Acceso al estado de la conexión WebSocket.
 *
 * Se usa para hacer el polling de React Query condicional: cuando el WS está
 * conectado los datos llegan por push, así que el refetchInterval baja a una
 * red de seguridad lenta; si el WS se cae, vuelve al intervalo rápido.
 */
export function useWebSocketContext(): WebSocketContextValue {
  return useContext(WebSocketContext);
}

import { createContext, useContext, type JSX, type ReactNode } from 'react';
import { useWebSocket } from '@/shared/hooks/useWebSocket';

interface WebSocketContextValue {
  /** true cuando el STOMP client está conectado y recibiendo push. */
  isConnected: boolean;
  changeStatus: (status: 'ONLINE' | 'BUSY' | 'OFFLINE') => void;
}

const WebSocketContext = createContext<WebSocketContextValue>({
  isConnected: false,
  changeStatus: () => {},
});

interface WebSocketProviderProps {
  children: ReactNode;
}

export function WebSocketProvider({ children }: WebSocketProviderProps): JSX.Element {
  // useWebSocket mantiene UNA sola conexión; el estado se comparte por contexto.
  const { isConnected, changeStatus } = useWebSocket();

  return (
    <WebSocketContext.Provider value={{ isConnected, changeStatus }}>
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

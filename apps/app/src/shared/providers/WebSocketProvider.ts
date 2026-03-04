import { type JSX, type ReactNode } from 'react';
import { useWebSocket } from '@/shared/hooks/useWebSocket';

interface WebSocketProviderProps {
  children: ReactNode;
}

export function WebSocketProvider({ children }: WebSocketProviderProps) {
  useWebSocket();

  return children as JSX.Element;
}

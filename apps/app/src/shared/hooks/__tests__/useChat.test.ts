// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useChat } from '../useChat';
import { ChatService } from '@/shared/services/ChatService';

vi.mock('@/shared/services/ChatService');

// useChat NO llama a useWebSocket() directo (abriría un segundo socket): consume
// subscribe() del WebSocketProvider, que comparte la única conexión real. Por eso
// acá se mockea el contexto, no el hook de bajo nivel.
let handlerSocket: ((m: any) => void) | null = null;
vi.mock('@/shared/providers/WebSocketProvider', () => ({
  useWebSocketContext: () => ({
    isConnected: true,
    changeStatus: vi.fn(),
    subscribe: (_destino: string, handler: (m: any) => void) => {
      handlerSocket = handler;
      return () => { handlerSocket = null; };
    },
  }),
}));

const mensajeServidor = {
  id: 1, conversacionId: 10, emisorId: 2, emisorNombre: 'Beto',
  tipo: 'TEXTO' as const, contenido: 'ya salgo', imagenUrl: null,
  creadoAt: '2026-07-12T10:00:00',
};

describe('useChat', () => {
  beforeEach(() => {
    // vi.mock('@/shared/services/ChatService') autogenera los vi.fn() UNA sola vez para
    // todo el archivo: sin este clear, los contadores de llamadas (toHaveBeenCalled) se
    // arrastran de un test a otro y "conversacionId null no rompe ni llama a la API" ve
    // llamadas de los tests anteriores.
    vi.clearAllMocks();
    vi.mocked(ChatService.listarMensajes).mockResolvedValue({
      content: [], number: 0, totalPages: 1, last: true,
    });
    vi.mocked(ChatService.marcarLeido).mockResolvedValue(undefined as any);
    handlerSocket = null;
  });

  it('un mensaje que llega por socket se agrega a la lista', async () => {
    const { result } = renderHook(() => useChat(10, 1));
    await waitFor(() => expect(result.current.cargando).toBe(false));

    act(() => { handlerSocket!(mensajeServidor); });

    expect(result.current.mensajes).toHaveLength(1);
    expect(result.current.mensajes[0].contenido).toBe('ya salgo');
  });

  it('el envío optimista muestra el mensaje antes de que el servidor confirme', async () => {
    let resolver: (m: any) => void = () => {};
    vi.mocked(ChatService.enviarTexto).mockReturnValue(
      new Promise((res) => { resolver = res; }) as any
    );

    const { result } = renderHook(() => useChat(10, 1));
    await waitFor(() => expect(result.current.cargando).toBe(false));

    act(() => { result.current.enviarTexto('hola'); });

    // Aparece YA, en estado 'enviando', sin esperar al servidor.
    expect(result.current.mensajes).toHaveLength(1);
    expect(result.current.mensajes[0].estadoEnvio).toBe('enviando');

    await act(async () => { resolver({ ...mensajeServidor, id: 5, contenido: 'hola' }); });

    // Confirmado: sin estadoEnvio, y con el id real del servidor.
    await waitFor(() => {
      expect(result.current.mensajes[0].estadoEnvio).toBeUndefined();
      expect(result.current.mensajes[0].id).toBe(5);
    });
  });

  // Si el rollback no se maneja con la misma seriedad que el éxito, el usuario cree que mandó
  // algo que nunca salió. En un log que es evidencia legal, eso no es un detalle de UX.
  it('si el envío falla, el mensaje queda marcado en error (no desaparece)', async () => {
    vi.mocked(ChatService.enviarTexto).mockRejectedValue(new Error('red caída'));

    const { result } = renderHook(() => useChat(10, 1));
    await waitFor(() => expect(result.current.cargando).toBe(false));

    await act(async () => { await result.current.enviarTexto('hola'); });

    await waitFor(() => {
      expect(result.current.mensajes).toHaveLength(1);
      expect(result.current.mensajes[0].estadoEnvio).toBe('error');
      expect(result.current.mensajes[0].contenido).toBe('hola');
    });
  });

  it('no duplica un mensaje propio que vuelve por el socket', async () => {
    vi.mocked(ChatService.enviarTexto).mockResolvedValue(
      { ...mensajeServidor, id: 5, contenido: 'hola' } as any
    );

    const { result } = renderHook(() => useChat(10, 1));
    await waitFor(() => expect(result.current.cargando).toBe(false));

    await act(async () => { await result.current.enviarTexto('hola'); });
    act(() => { handlerSocket!({ ...mensajeServidor, id: 5, contenido: 'hola' }); });

    expect(result.current.mensajes).toHaveLength(1);
  });

  it('conversacionId null no rompe ni llama a la API', () => {
    const { result } = renderHook(() => useChat(null, 1));
    expect(result.current.mensajes).toEqual([]);
    expect(ChatService.listarMensajes).not.toHaveBeenCalled();
  });
});

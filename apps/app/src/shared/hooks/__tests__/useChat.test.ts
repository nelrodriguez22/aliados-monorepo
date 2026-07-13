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

  it('el envío optimista muestra el mensaje antes de que el servidor confirme, con el emisorId real', async () => {
    let resolver: (m: any) => void = () => {};
    vi.mocked(ChatService.enviarTexto).mockReturnValue(
      new Promise((res) => { resolver = res; }) as any
    );

    // usuarioId (77) deliberadamente distinto de todos los ids del fixture (emisorId: 2), para
    // que una regresión que ponga emisorId fijo (p.ej. -1) en el mensaje optimista no pase
    // desapercibida: la burbuja decide "es mío" comparando emisorId con usuarioId.
    const { result } = renderHook(() => useChat(10, 77));
    await waitFor(() => expect(result.current.cargando).toBe(false));

    act(() => { result.current.enviarTexto('hola'); });

    // Aparece YA, en estado 'enviando', sin esperar al servidor.
    expect(result.current.mensajes).toHaveLength(1);
    expect(result.current.mensajes[0].estadoEnvio).toBe('enviando');
    expect(result.current.mensajes[0].emisorId).toBe(77);

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

  it('no duplica un mensaje propio que vuelve por el socket después de confirmado', async () => {
    vi.mocked(ChatService.enviarTexto).mockResolvedValue(
      { ...mensajeServidor, id: 5, contenido: 'hola' } as any
    );

    const { result } = renderHook(() => useChat(10, 1));
    await waitFor(() => expect(result.current.cargando).toBe(false));

    await act(async () => { await result.current.enviarTexto('hola'); });
    act(() => { handlerSocket!({ ...mensajeServidor, id: 5, contenido: 'hola' }); });

    expect(result.current.mensajes).toHaveLength(1);
  });

  // IMPORTANTE 3: el caso que sí importa no es el de arriba (backend hoy nunca le manda el eco
  // al propio emisor) sino este: el eco llega ANTES de que resuelva el POST, mientras el
  // mensaje optimista todavía tiene id -1. Sin filtrar por id del confirmado al reconciliar,
  // quedarían dos entradas con id 5 (la agregada por el socket + la reemplazada del POST).
  it('no duplica si el eco del socket llega antes de que resuelva el POST', async () => {
    let resolver: (m: any) => void = () => {};
    vi.mocked(ChatService.enviarTexto).mockReturnValue(
      new Promise((res) => { resolver = res; }) as any
    );

    const { result } = renderHook(() => useChat(10, 1));
    await waitFor(() => expect(result.current.cargando).toBe(false));

    act(() => { result.current.enviarTexto('hola'); });
    expect(result.current.mensajes).toHaveLength(1);

    // El eco llega primero: en ese momento el optimista todavía es id -1, así que el `some`
    // del handler de socket no matchea y el eco se agrega como una entrada aparte.
    act(() => { handlerSocket!({ ...mensajeServidor, id: 5, contenido: 'hola' }); });
    expect(result.current.mensajes).toHaveLength(2);

    // Recién ahora resuelve el POST con el mismo id que ya llegó por socket.
    await act(async () => { resolver({ ...mensajeServidor, id: 5, contenido: 'hola' }); });

    await waitFor(() => {
      expect(result.current.mensajes).toHaveLength(1);
      expect(result.current.mensajes[0].id).toBe(5);
      expect(result.current.mensajes[0].estadoEnvio).toBeUndefined();
    });
  });

  // IMPORTANTE 2: la paginación es por offset sobre un orden descendente por id. Si entre
  // pedir la página 0 y pedir la página 1 llega un mensaje nuevo por socket, el offset del
  // servidor se corre y `cargarMas` puede traer de nuevo un id que ya está en pantalla.
  it('cargarMas no duplica mensajes cuando el offset del servidor se corrió', async () => {
    vi.mocked(ChatService.listarMensajes).mockImplementation(
      (_conversacionId: number, page = 0) => {
        if (page === 0) {
          return Promise.resolve({
            content: [
              { ...mensajeServidor, id: 100 },
              { ...mensajeServidor, id: 99 },
              { ...mensajeServidor, id: 98 },
            ],
            number: 0, totalPages: 2, last: false,
          }) as any;
        }
        // "page=1" pedido después de que un mensaje nuevo (101) entró por socket: el offset
        // del servidor ya se corrió y esta página se solapa con la anterior (98 repetido).
        return Promise.resolve({
          content: [
            { ...mensajeServidor, id: 98 },
            { ...mensajeServidor, id: 97 },
            { ...mensajeServidor, id: 96 },
          ],
          number: 1, totalPages: 2, last: true,
        }) as any;
      }
    );

    const { result } = renderHook(() => useChat(10, 1));
    await waitFor(() => expect(result.current.cargando).toBe(false));
    expect(result.current.mensajes.map((m) => m.id)).toEqual([98, 99, 100]);

    act(() => { handlerSocket!({ ...mensajeServidor, id: 101 }); });
    expect(result.current.mensajes.map((m) => m.id)).toEqual([98, 99, 100, 101]);

    await act(async () => { await result.current.cargarMas(); });

    const ids = result.current.mensajes.map((m) => m.id);
    expect(ids).toEqual([96, 97, 98, 99, 100, 101]);
    expect(new Set(ids).size).toBe(ids.length); // sin ids duplicados
  });

  // MINOR 1: el efecto de marcarLeido dependía del array `mensajes` entero, así que cualquier
  // cambio (incluida la aparición de un mensaje optimista todavía sin confirmar) redisparaba
  // el POST aunque el último mensaje confirmado no hubiera cambiado.
  it('marcarLeido no se redispara cuando cambia mensajes pero no el último confirmado', async () => {
    vi.mocked(ChatService.listarMensajes).mockResolvedValue({
      content: [{ ...mensajeServidor, id: 1 }],
      number: 0, totalPages: 1, last: true,
    });
    let resolver: (m: any) => void = () => {};
    vi.mocked(ChatService.enviarTexto).mockReturnValue(
      new Promise((res) => { resolver = res; }) as any
    );

    const { result } = renderHook(() => useChat(10, 1));
    await waitFor(() => expect(result.current.cargando).toBe(false));
    await waitFor(() => expect(ChatService.marcarLeido).toHaveBeenCalledTimes(1));
    expect(ChatService.marcarLeido).toHaveBeenCalledWith(10, 1);

    // Aparece el mensaje optimista (estadoEnvio: 'enviando'): el último CONFIRMADO sigue
    // siendo el mismo, así que no debería haber un segundo llamado a marcarLeido.
    act(() => { result.current.enviarTexto('hola'); });
    expect(result.current.mensajes).toHaveLength(2);
    expect(ChatService.marcarLeido).toHaveBeenCalledTimes(1);

    // Al confirmarse si cambia el último confirmado, ahí sí corresponde un nuevo llamado.
    await act(async () => { resolver({ ...mensajeServidor, id: 5, contenido: 'hola' }); });
    await waitFor(() => expect(ChatService.marcarLeido).toHaveBeenCalledTimes(2));
    expect(ChatService.marcarLeido).toHaveBeenLastCalledWith(10, 5);
  });

  // MINOR 2: al saltar de una conversación a otra, los mensajes de la anterior no deben
  // quedar pintados bajo el header de la nueva mientras carga el historial nuevo.
  it('al cambiar de conversación limpia los mensajes de la anterior de inmediato', async () => {
    vi.mocked(ChatService.listarMensajes).mockResolvedValueOnce({
      content: [{ ...mensajeServidor, id: 1 }],
      number: 0, totalPages: 1, last: true,
    });

    const { result, rerender } = renderHook(
      ({ conversacionId }) => useChat(conversacionId, 1),
      { initialProps: { conversacionId: 10 } }
    );
    await waitFor(() => expect(result.current.cargando).toBe(false));
    expect(result.current.mensajes).toHaveLength(1);

    // El fetch de la conversación 20 queda pendiente para poder observar el estado
    // intermedio: mensajes ya debería estar vacío aunque el historial nuevo no llegó.
    let resolverNueva: (p: any) => void = () => {};
    vi.mocked(ChatService.listarMensajes).mockReturnValueOnce(
      new Promise((res) => { resolverNueva = res; }) as any
    );

    rerender({ conversacionId: 20 });

    expect(result.current.mensajes).toEqual([]);

    await act(async () => {
      resolverNueva({
        content: [{ ...mensajeServidor, id: 50, conversacionId: 20 }],
        number: 0, totalPages: 1, last: true,
      });
    });
    await waitFor(() => expect(result.current.mensajes).toHaveLength(1));
    expect(result.current.mensajes[0].id).toBe(50);
  });

  // MINOR 3: reintentar un mensaje que falló en el medio del hilo no debe hacerlo "saltar"
  // al final; tiene que reemplazarse en su misma posición.
  it('reintentar mantiene la posición del mensaje en el hilo', async () => {
    vi.mocked(ChatService.enviarTexto).mockImplementation(
      ((_conversacionId: number, contenido: string) => {
        if (contenido === 'primero') return Promise.reject(new Error('falló'));
        return Promise.resolve({ ...mensajeServidor, id: 2, contenido });
      }) as any
    );

    const { result } = renderHook(() => useChat(10, 1));
    await waitFor(() => expect(result.current.cargando).toBe(false));

    await act(async () => { await result.current.enviarTexto('primero'); });
    await act(async () => { await result.current.enviarTexto('segundo'); });

    expect(result.current.mensajes.map((m) => m.contenido)).toEqual(['primero', 'segundo']);
    expect(result.current.mensajes[0].estadoEnvio).toBe('error');

    const claveLocalFallido = result.current.mensajes[0].claveLocal!;
    vi.mocked(ChatService.enviarTexto).mockResolvedValue(
      { ...mensajeServidor, id: 1, contenido: 'primero' } as any
    );

    await act(async () => { await result.current.reintentar(claveLocalFallido); });

    await waitFor(() => {
      expect(result.current.mensajes.map((m) => m.contenido)).toEqual(['primero', 'segundo']);
      expect(result.current.mensajes[0].estadoEnvio).toBeUndefined();
      expect(result.current.mensajes[0].id).toBe(1);
    });
  });

  it('conversacionId null no rompe ni llama a la API', () => {
    const { result } = renderHook(() => useChat(null, 1));
    expect(result.current.mensajes).toEqual([]);
    expect(ChatService.listarMensajes).not.toHaveBeenCalled();
  });
});

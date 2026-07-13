// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor, cleanup } from '@testing-library/react';
import { useWebSocket } from '../useWebSocket';

/**
 * Mock del cliente STOMP: nos importa el CONTRATO de suscripción, no la red.
 *
 * El hook importa @stomp/stompjs de forma diferida (import() dentro de connect()),
 * así que guardamos los clientes creados para poder disparar onConnect a mano y
 * simular conexión / reconexión.
 */
type ClienteFalso = {
  config: any;
  connected: boolean;
  activate: ReturnType<typeof vi.fn>;
  deactivate: ReturnType<typeof vi.fn>;
  publish: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
};

const clientesCreados: ClienteFalso[] = [];
/** Todas las suscripciones STOMP hechas, en orden. */
const suscripciones: Array<{
  destino: string;
  callback: (msg: { body: string }) => void;
  unsubscribe: ReturnType<typeof vi.fn>;
}> = [];

vi.mock('@stomp/stompjs', () => ({
  Client: vi.fn().mockImplementation((config: any) => {
    const cliente: ClienteFalso = {
      config,
      connected: false,
      activate: vi.fn(),
      deactivate: vi.fn(),
      publish: vi.fn(),
      subscribe: vi.fn((destino: string, callback: (msg: { body: string }) => void) => {
        const sub = { destino, callback, unsubscribe: vi.fn() };
        suscripciones.push(sub);
        return sub;
      }),
    };
    clientesCreados.push(cliente);
    return cliente;
  }),
}));

vi.mock('sockjs-client', () => ({
  default: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('@/shared/lib/firebase', () => ({
  auth: {
    currentUser: { getIdToken: vi.fn().mockResolvedValue('token-falso') },
  },
}));

vi.mock('@/shared/store/useStore', () => ({
  useStore: (selector: (s: any) => unknown) => selector({ user: { uid: 'uid-de-prueba' } }),
}));

const queryClientFalso = {
  setQueryData: vi.fn(),
  invalidateQueries: vi.fn(),
  refetchQueries: vi.fn(),
};

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => queryClientFalso,
}));

vi.mock('react-hot-toast', () => {
  const toast: any = vi.fn();
  toast.success = vi.fn();
  toast.error = vi.fn();
  return { default: toast };
});

/** Espera a que el hook haya creado el cliente STOMP (connect() es async). */
const esperarCliente = async (): Promise<ClienteFalso> => {
  await waitFor(() => expect(clientesCreados.length).toBeGreaterThan(0));
  return clientesCreados[clientesCreados.length - 1];
};

/** Simula que el socket conectó: dispara el onConnect que registró el hook. */
const conectar = async (cliente: ClienteFalso) => {
  await act(async () => {
    cliente.connected = true;
    cliente.config.onConnect();
  });
};

/** Simula una caída del socket (el cliente STOMP reconecta solo con el mismo objeto). */
const desconectar = async (cliente: ClienteFalso) => {
  await act(async () => {
    cliente.connected = false;
    cliente.config.onDisconnect();
  });
};

const suscripcionesA = (destino: string) => suscripciones.filter((s) => s.destino === destino);
const ultimaSuscripcionA = (destino: string) => suscripcionesA(destino).at(-1);

describe('useWebSocket — API de suscripción genérica', () => {
  beforeEach(() => {
    clientesCreados.length = 0;
    suscripciones.length = 0;
    queryClientFalso.setQueryData.mockClear();
    queryClientFalso.invalidateQueries.mockClear();
    queryClientFalso.refetchQueries.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('expone subscribe() y entrega el payload ya parseado al handler', async () => {
    const { result } = renderHook(() => useWebSocket());
    const cliente = await esperarCliente();
    await conectar(cliente);

    const handler = vi.fn();
    act(() => {
      result.current.subscribe('/user/queue/chat', handler);
    });

    const sub = ultimaSuscripcionA('/user/queue/chat');
    expect(sub).toBeDefined();

    act(() => {
      sub!.callback({ body: JSON.stringify({ id: 1, contenido: 'hola' }) });
    });

    expect(handler).toHaveBeenCalledWith({ id: 1, contenido: 'hola' });
  });

  it('la función devuelta por subscribe() desuscribe', async () => {
    const { result } = renderHook(() => useWebSocket());
    const cliente = await esperarCliente();
    await conectar(cliente);

    let desuscribir: () => void = () => {};
    act(() => {
      desuscribir = result.current.subscribe('/user/queue/chat', vi.fn());
    });

    const sub = ultimaSuscripcionA('/user/queue/chat')!;

    act(() => desuscribir());

    expect(sub.unsubscribe).toHaveBeenCalled();
  });

  it('aplica al conectar las suscripciones pedidas ANTES de que el socket conecte', async () => {
    const { result } = renderHook(() => useWebSocket());
    const cliente = await esperarCliente();
    // Ojo: acá el socket todavía NO conectó (no disparamos onConnect).
    expect(cliente.connected).toBe(false);

    const handler = vi.fn();
    act(() => {
      result.current.subscribe('/user/queue/chat', handler);
    });

    // Todavía no puede haber suscripción STOMP: el socket no está conectado.
    expect(suscripcionesA('/user/queue/chat')).toHaveLength(0);

    await conectar(cliente);

    // Al conectar, la pendiente se aplica y el handler recibe los mensajes.
    const sub = ultimaSuscripcionA('/user/queue/chat');
    expect(sub).toBeDefined();

    act(() => {
      sub!.callback({ body: JSON.stringify({ id: 7 }) });
    });
    expect(handler).toHaveBeenCalledWith({ id: 7 });
  });

  it('re-aplica TODAS las suscripciones tras una reconexión', async () => {
    const { result } = renderHook(() => useWebSocket());
    const cliente = await esperarCliente();
    await conectar(cliente);

    const handler = vi.fn();
    act(() => {
      result.current.subscribe('/user/queue/chat', handler);
    });
    expect(suscripcionesA('/user/queue/chat')).toHaveLength(1);

    // Se cae el socket y el cliente STOMP reconecta solo → onConnect de nuevo.
    await desconectar(cliente);
    await conectar(cliente);

    // La suscripción vieja quedó invalidada: tiene que haberse re-suscrito.
    expect(suscripcionesA('/user/queue/chat')).toHaveLength(2);
    // Y las notificaciones también (no sólo las pendientes).
    expect(suscripcionesA('/user/queue/notifications')).toHaveLength(2);

    act(() => {
      ultimaSuscripcionA('/user/queue/chat')!.callback({ body: JSON.stringify({ id: 9 }) });
    });
    expect(handler).toHaveBeenCalledWith({ id: 9 });
  });

  it('no re-suscribe una suscripción ya desuscripta cuando reconecta', async () => {
    const { result } = renderHook(() => useWebSocket());
    const cliente = await esperarCliente();
    await conectar(cliente);

    let desuscribir: () => void = () => {};
    act(() => {
      desuscribir = result.current.subscribe('/user/queue/chat', vi.fn());
    });
    act(() => desuscribir());

    await desconectar(cliente);
    await conectar(cliente);

    expect(suscripcionesA('/user/queue/chat')).toHaveLength(1);
  });
});

describe('useWebSocket — las notificaciones siguen andando (consumidor de subscribe)', () => {
  beforeEach(() => {
    clientesCreados.length = 0;
    suscripciones.length = 0;
    queryClientFalso.setQueryData.mockClear();
    queryClientFalso.invalidateQueries.mockClear();
    queryClientFalso.refetchQueries.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('se suscribe a /user/queue/notifications al conectar, sin que nadie lo pida', async () => {
    renderHook(() => useWebSocket());
    const cliente = await esperarCliente();
    await conectar(cliente);

    expect(suscripcionesA('/user/queue/notifications')).toHaveLength(1);
  });

  it('procesa una notificación igual que antes (contador + invalidaciones)', async () => {
    renderHook(() => useWebSocket());
    const cliente = await esperarCliente();
    await conectar(cliente);

    const sub = ultimaSuscripcionA('/user/queue/notifications')!;

    act(() => {
      sub.callback({
        body: JSON.stringify({
          tipo: 'PROPUESTA_RECIBIDA',
          trabajoId: 42,
          mensaje: 'Te llegó una propuesta',
        }),
      });
    });

    // Contador optimista de la campanita
    expect(queryClientFalso.setQueryData).toHaveBeenCalledWith(
      ['notificaciones-unread'],
      expect.any(Function),
    );
    // Invalidaciones propias del tipo
    expect(queryClientFalso.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['trabajos-cliente'],
    });
    expect(queryClientFalso.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['trabajo', '42'],
    });
  });

  it('el heartbeat sigue publicando en /app/heartbeat tras conectar', async () => {
    vi.useFakeTimers();
    try {
      renderHook(() => useWebSocket());
      // waitFor no anda con fake timers → esperamos el microtask del connect() async.
      await vi.waitFor(() => expect(clientesCreados.length).toBeGreaterThan(0));
      const cliente = clientesCreados[0];

      act(() => {
        cliente.connected = true;
        cliente.config.onConnect();
      });

      act(() => {
        vi.advanceTimersByTime(30_000);
      });

      expect(cliente.publish).toHaveBeenCalledWith(
        expect.objectContaining({ destination: '/app/heartbeat' }),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

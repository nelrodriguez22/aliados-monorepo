// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor, cleanup } from '@testing-library/react';
import { StrictMode, createElement, type ReactNode } from 'react';
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

/**
 * Simula una caída REAL del socket (wifi, restart del backend, laptop suspendida) —
 * el cliente STOMP reconecta solo con el mismo objeto.
 *
 * OJO: a propósito NO dispara cliente.config.onDisconnect(). Según los typings de
 * @stomp/stompjs@7.3.0, ese callback sólo se invoca al recibir el receipt del frame
 * DISCONNECT ("the DISCONNECT receipt may not always be received. For handling such
 * cases, use Client#onWebSocketClose"). Una caída real nunca manda ese receipt, así
 * que en producción onDisconnect NO se dispara para este caso — sólo cambia
 * `connected` y, más tarde, el cliente reconecta solo y llama a onConnect.
 *
 * Si este helper llamara a onDisconnect, estaría probando un camino que no ocurre en
 * producción: el onDisconnect real del hook vacía stompSubsRef, así que para cuando
 * corriera onConnect el mapa ya estaría vacío y CUALQUIER suscriptor parecería
 * "pendiente" — ocultando una regresión donde onConnect dejara de reaplicar las
 * suscripciones que ya estaban activas (ver "re-aplica TODAS..." más abajo).
 */
const desconectar = async (cliente: ClienteFalso) => {
  await act(async () => {
    cliente.connected = false;
  });
};

/**
 * Simula una desconexión LIMPIA, con receipt de DISCONNECT — el único camino donde
 * @stomp/stompjs sí llama a onDisconnect. Se mantiene aparte de desconectar() de
 * arriba para no mezclar ambos caminos en el mismo test.
 */
const desconectarLimpio = async (cliente: ClienteFalso) => {
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

  it('re-aplica TODAS las suscripciones tras una reconexión (caída real, sin onDisconnect)', async () => {
    const { result } = renderHook(() => useWebSocket());
    const cliente = await esperarCliente();
    await conectar(cliente);

    const handler = vi.fn();
    act(() => {
      result.current.subscribe('/user/queue/chat', handler);
    });
    expect(suscripcionesA('/user/queue/chat')).toHaveLength(1);

    // Usamos desconectar() (caída real, NO dispara onDisconnect) y no
    // desconectarLimpio(): es el camino que de verdad importa proteger acá. Si
    // usáramos el disconnect limpio, onDisconnect ya habría vaciado stompSubsRef y
    // este test no distinguiría "reaplicar todas" de "reaplicar sólo las
    // pendientes" — las dos variantes se verían iguales con el mapa vacío.
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

  it('re-aplica también tras una desconexión LIMPIA (con receipt de DISCONNECT)', async () => {
    const { result } = renderHook(() => useWebSocket());
    const cliente = await esperarCliente();
    await conectar(cliente);

    const handler = vi.fn();
    act(() => {
      result.current.subscribe('/user/queue/chat', handler);
    });
    expect(suscripcionesA('/user/queue/chat')).toHaveLength(1);

    // Camino "prolijo": acá sí llega el receipt y onDisconnect se dispara.
    await desconectarLimpio(cliente);
    await conectar(cliente);

    expect(suscripcionesA('/user/queue/chat')).toHaveLength(2);
    expect(suscripcionesA('/user/queue/notifications')).toHaveLength(2);
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

  it('dos suscriptores al mismo destino reciben el mensaje cada uno; desuscribir uno no mata al otro', async () => {
    const { result } = renderHook(() => useWebSocket());
    const cliente = await esperarCliente();
    await conectar(cliente);

    const handlerA = vi.fn();
    const handlerB = vi.fn();
    let desuscribirA: () => void = () => {};
    act(() => {
      desuscribirA = result.current.subscribe('/user/queue/chat', handlerA);
    });
    act(() => {
      result.current.subscribe('/user/queue/chat', handlerB);
    });

    // El diseño es un Map indexado por id de suscriptor, no por destino: dos
    // suscriptores al mismo destino tienen que convivir como dos subs STOMP
    // independientes, no pisarse.
    const [subA, subB] = suscripcionesA('/user/queue/chat');
    expect(subA).toBeDefined();
    expect(subB).toBeDefined();

    act(() => {
      subA!.callback({ body: JSON.stringify({ id: 1 }) });
      subB!.callback({ body: JSON.stringify({ id: 1 }) });
    });
    expect(handlerA).toHaveBeenCalledWith({ id: 1 });
    expect(handlerB).toHaveBeenCalledWith({ id: 1 });

    // Desuscribir A no puede tocar la suscripción STOMP de B.
    act(() => desuscribirA());
    expect(subB!.unsubscribe).not.toHaveBeenCalled();

    act(() => {
      subB!.callback({ body: JSON.stringify({ id: 2 }) });
    });
    expect(handlerB).toHaveBeenCalledWith({ id: 2 });
    expect(handlerA).not.toHaveBeenCalledWith({ id: 2 });
  });

  it('desuscribirse ANTES de que el socket conecte evita que se aplique al conectar', async () => {
    const { result } = renderHook(() => useWebSocket());
    const cliente = await esperarCliente();
    expect(cliente.connected).toBe(false);

    const handler = vi.fn();
    let desuscribir: () => void = () => {};
    act(() => {
      desuscribir = result.current.subscribe('/user/queue/chat', handler);
    });
    act(() => desuscribir());

    await conectar(cliente);

    // El suscriptor se borró de suscriptoresRef antes de que existiera onConnect:
    // nunca se tiene que abrir una suscripción STOMP para este destino.
    expect(suscripcionesA('/user/queue/chat')).toHaveLength(0);
  });

  it('un doble mount de React StrictMode no deja suscripciones ni suscriptores duplicados', async () => {
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(StrictMode, null, children);

    const { result } = renderHook(() => useWebSocket(), { wrapper });

    // StrictMode invoca en desarrollo (setup → cleanup → setup) los efectos del hook,
    // incluido el que abre la conexión: puede llegar a crear más de un cliente STOMP
    // en el camino. Nos importa el que el hook realmente conserva al asentarse la
    // carrera, así que esperamos y tomamos el último.
    const cliente = await esperarCliente();
    await conectar(cliente);

    // La suscripción "hardcodeada" a notificaciones no puede duplicarse por el doble
    // efecto: en el cliente que el hook conserva tiene que quedar UNA sola.
    const llamadasNotif = cliente.subscribe.mock.calls.filter(
      ([destino]) => destino === '/user/queue/notifications',
    );
    expect(llamadasNotif).toHaveLength(1);

    const handler = vi.fn();
    act(() => {
      result.current.subscribe('/user/queue/chat', handler);
    });
    const llamadasChat = cliente.subscribe.mock.calls.filter(
      ([destino]) => destino === '/user/queue/chat',
    );
    expect(llamadasChat).toHaveLength(1);
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

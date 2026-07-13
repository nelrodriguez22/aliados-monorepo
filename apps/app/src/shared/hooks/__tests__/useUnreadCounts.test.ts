// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useUnreadCounts } from "../useUnreadCounts";
import { ChatService } from "@/shared/services/ChatService";

vi.mock("@/shared/services/ChatService");

// Mismo patrón que useChat.test.ts: useUnreadCounts consume subscribe() del
// WebSocketProvider (no useWebSocket() directo), así que acá se mockea el contexto.
let handlerSocket: ((m: any) => void) | null = null;
let unsubscribeMock = vi.fn();
vi.mock("@/shared/providers/WebSocketProvider", () => ({
  useWebSocketContext: () => ({
    isConnected: true,
    changeStatus: vi.fn(),
    subscribe: (_destino: string, handler: (m: any) => void) => {
      handlerSocket = handler;
      return unsubscribeMock;
    },
  }),
}));

describe("useUnreadCounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handlerSocket = null;
    unsubscribeMock = vi.fn();
    vi.mocked(ChatService.contarNoLeidos).mockImplementation(
      (conversacionId: number) => Promise.resolve({ count: conversacionId * 10 })
    );
  });

  // Este es EL test que protege contra el N+1 de red: con N conversaciones en el
  // dashboard, contarNoLeidos tiene que llamarse exactamente N veces (una por
  // conversación, desde el único efecto), nunca más.
  it("con N conversaciones, contarNoLeidos se llama exactamente N veces", async () => {
    const { result } = renderHook(() => useUnreadCounts([1, 2, 3]));

    await waitFor(() => expect(result.current).toEqual({ 1: 10, 2: 20, 3: 30 }));

    expect(ChatService.contarNoLeidos).toHaveBeenCalledTimes(3);
    expect(ChatService.contarNoLeidos).toHaveBeenCalledWith(1);
    expect(ChatService.contarNoLeidos).toHaveBeenCalledWith(2);
    expect(ChatService.contarNoLeidos).toHaveBeenCalledWith(3);
  });

  // El caso que de verdad importa: un dashboard que re-renderiza (ej. un estado de UI
  // ajeno cambia, o React Query devuelve la MISMA lista con una referencia de array
  // nueva) no puede volver a pedir los conteos. Si el efecto dependiera del array
  // `conversacionIds` en vez de una clave derivada del conjunto, este test fallaría.
  it("un re-render con el mismo conjunto de ids no vuelve a llamar a contarNoLeidos", async () => {
    const { result, rerender } = renderHook(
      ({ ids }) => useUnreadCounts(ids),
      { initialProps: { ids: [1, 2, 3] } }
    );
    await waitFor(() => expect(result.current).toEqual({ 1: 10, 2: 20, 3: 30 }));
    expect(ChatService.contarNoLeidos).toHaveBeenCalledTimes(3);

    // Mismo contenido, array con OTRA identidad — lo que produciría un .map() de JSX en
    // cada render del dashboard.
    rerender({ ids: [1, 2, 3].map((n) => n) });

    // No debe haber llamadas nuevas.
    expect(ChatService.contarNoLeidos).toHaveBeenCalledTimes(3);
  });

  // Si la lista de servicios SÍ cambia (una conversación nueva aparece), ahí corresponde
  // pedir de nuevo.
  it("si cambia el conjunto de ids, sí vuelve a pedir los conteos", async () => {
    const { result, rerender } = renderHook(
      ({ ids }) => useUnreadCounts(ids),
      { initialProps: { ids: [1, 2] } }
    );
    await waitFor(() => expect(result.current).toEqual({ 1: 10, 2: 20 }));
    expect(ChatService.contarNoLeidos).toHaveBeenCalledTimes(2);

    rerender({ ids: [1, 2, 4] });

    await waitFor(() => expect(result.current).toEqual({ 1: 10, 2: 20, 4: 40 }));
    expect(ChatService.contarNoLeidos).toHaveBeenCalledTimes(5);
  });

  it("un mensaje que llega por socket incrementa el contador de su conversación", async () => {
    const { result } = renderHook(() => useUnreadCounts([1, 2]));
    await waitFor(() => expect(result.current).toEqual({ 1: 10, 2: 20 }));

    act(() => {
      handlerSocket!({ conversacionId: 2 });
    });

    expect(result.current[2]).toBe(21);
    // No afecta al resto de las conversaciones.
    expect(result.current[1]).toBe(10);
  });

  // Una conversación que todavía no tenía contador (por ejemplo, la primera vez que
  // llega un mensaje antes de que resuelva el fetch inicial) arranca en 0 + 1.
  it("un mensaje de una conversación sin contador previo arranca en 1", () => {
    const { result } = renderHook(() => useUnreadCounts([1]));

    act(() => {
      handlerSocket!({ conversacionId: 99 });
    });

    expect(result.current[99]).toBe(1);
  });

  it("se desuscribe de /user/queue/chat al desmontar", () => {
    const { unmount } = renderHook(() => useUnreadCounts([1]));
    expect(unsubscribeMock).not.toHaveBeenCalled();

    unmount();

    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
  });

  it("lista vacía no llama a la API", () => {
    const { result } = renderHook(() => useUnreadCounts([]));
    expect(result.current).toEqual({});
    expect(ChatService.contarNoLeidos).not.toHaveBeenCalled();
  });
});

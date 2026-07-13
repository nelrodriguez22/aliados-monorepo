import { useCallback, useEffect, useRef, useState } from "react";
import { useWebSocketContext } from "@/shared/providers/WebSocketProvider";
import { ChatService, type Mensaje } from "@/shared/services/ChatService";

export interface MensajeUI extends Mensaje {
  // Ausente = confirmado por el servidor. Los optimistas llevan 'enviando' o 'error'.
  estadoEnvio?: "enviando" | "error";
  // Sólo en los optimistas: sirve para reconciliar la respuesta del POST con la burbuja pintada.
  claveLocal?: string;
}

export function useChat(conversacionId: number | null, usuarioId: number) {
  const [mensajes, setMensajes] = useState<MensajeUI[]>([]);
  const [cargando, setCargando] = useState(false);
  const [hayMas, setHayMas] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paginaRef = useRef(0);
  // OJO: NO usar useWebSocket() acá directo — abriría una segunda conexión. subscribe()
  // se consume del contexto, que comparte la única conexión real del WebSocketProvider.
  const { subscribe } = useWebSocketContext();

  // Historial inicial. La API devuelve descendente (más recientes primero); la UI los quiere
  // ascendentes (el más viejo arriba), así que se invierte.
  useEffect(() => {
    if (conversacionId == null) return;

    let cancelado = false;
    setCargando(true);
    paginaRef.current = 0;

    ChatService.listarMensajes(conversacionId, 0)
      .then((page) => {
        if (cancelado) return;
        setMensajes([...page.content].reverse());
        setHayMas(!page.last);
      })
      .catch(() => { if (!cancelado) setError("No pudimos cargar los mensajes"); })
      .finally(() => { if (!cancelado) setCargando(false); });

    return () => { cancelado = true; };
  }, [conversacionId]);

  // Tiempo real. El backend publica a /user/{firebaseUid}/queue/chat; el cliente STOMP resuelve
  // el prefijo /user, así que acá el destino es el relativo.
  useEffect(() => {
    if (conversacionId == null) return;

    return subscribe("/user/queue/chat", (mensaje: Mensaje) => {
      if (mensaje.conversacionId !== conversacionId) return;
      setMensajes((prev) =>
        // Puede ser un mensaje propio que vuelve por el socket: no duplicar.
        prev.some((m) => m.id === mensaje.id) ? prev : [...prev, mensaje]
      );
    });
  }, [conversacionId, subscribe]);

  // Marcar leídos: el último mensaje confirmado que hay en pantalla.
  useEffect(() => {
    if (conversacionId == null || mensajes.length === 0) return;
    const confirmados = mensajes.filter((m) => !m.estadoEnvio);
    if (confirmados.length === 0) return;
    const ultimo = confirmados[confirmados.length - 1];
    ChatService.marcarLeido(conversacionId, ultimo.id).catch(() => { /* no bloquea la UI */ });
  }, [conversacionId, mensajes]);

  const cargarMas = useCallback(async () => {
    if (conversacionId == null || !hayMas) return;
    const siguiente = paginaRef.current + 1;
    const page = await ChatService.listarMensajes(conversacionId, siguiente);
    paginaRef.current = siguiente;
    setMensajes((prev) => [...[...page.content].reverse(), ...prev]);
    setHayMas(!page.last);
  }, [conversacionId, hayMas]);

  const enviarOptimista = useCallback(
    async (
      borrador: Omit<MensajeUI, "id" | "conversacionId" | "creadoAt">,
      llamada: () => Promise<Mensaje>
    ) => {
      if (conversacionId == null) return;

      const claveLocal = `local-${Date.now()}-${Math.random()}`;
      const optimista: MensajeUI = {
        ...borrador,
        id: -1,
        conversacionId,
        creadoAt: new Date().toISOString(),
        estadoEnvio: "enviando",
        claveLocal,
      } as MensajeUI;

      setMensajes((prev) => [...prev, optimista]);

      try {
        const confirmado = await llamada();
        setMensajes((prev) =>
          prev.map((m) => (m.claveLocal === claveLocal ? { ...confirmado } : m))
        );
      } catch {
        // NO se borra: el usuario tiene que ver que su mensaje no salió, y poder reintentar.
        setMensajes((prev) =>
          prev.map((m) =>
            m.claveLocal === claveLocal ? { ...m, estadoEnvio: "error" as const } : m
          )
        );
      }
    },
    [conversacionId]
  );

  // emisorId real (no -1): la burbuja decide "es mío" comparando emisorId, sin heurísticas.
  const enviarTexto = useCallback(
    (contenido: string) =>
      enviarOptimista(
        { tipo: "TEXTO", contenido, imagenUrl: null, emisorId: usuarioId, emisorNombre: "" } as any,
        () => ChatService.enviarTexto(conversacionId!, contenido)
      ),
    [conversacionId, usuarioId, enviarOptimista]
  );

  const enviarImagen = useCallback(
    (imagenUrl: string) =>
      enviarOptimista(
        { tipo: "IMAGEN", contenido: null, imagenUrl, emisorId: usuarioId, emisorNombre: "" } as any,
        () => ChatService.enviarImagen(conversacionId!, imagenUrl)
      ),
    [conversacionId, usuarioId, enviarOptimista]
  );

  const reintentar = useCallback(
    (claveLocal: string) => {
      const fallido = mensajes.find((m) => m.claveLocal === claveLocal);
      if (!fallido) return;
      setMensajes((prev) => prev.filter((m) => m.claveLocal !== claveLocal));
      if (fallido.tipo === "TEXTO") enviarTexto(fallido.contenido!);
      else enviarImagen(fallido.imagenUrl!);
    },
    [mensajes, enviarTexto, enviarImagen]
  );

  return {
    mensajes,
    cargando,
    hayMas,
    error,
    cargarMas,
    enviarTexto,
    enviarImagen,
    reintentar,
  };
}

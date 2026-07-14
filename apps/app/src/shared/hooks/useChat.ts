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
  // Se incrementa desde `reintentarCarga` para forzar que el efecto de historial (que sólo
  // depende de `conversacionId`) vuelva a correr sin cambiar de conversación. Sin esto no hay
  // forma de reintentar un fetch fallido salvo cerrar y reabrir el chat.
  const [intentoCarga, setIntentoCarga] = useState(0);
  const paginaRef = useRef(0);
  // Espejo de `mensajes` accesible sin volver inestable la identidad de los callbacks que lo
  // necesitan (ver `reintentar`): un useCallback que dependiera de `mensajes` cambiaría de
  // identidad en cada mensaje nuevo.
  const mensajesRef = useRef<MensajeUI[]>([]);
  // OJO: NO usar useWebSocket() acá directo — abriría una segunda conexión. subscribe()
  // se consume del contexto, que comparte la única conexión real del WebSocketProvider.
  const { subscribe } = useWebSocketContext();

  useEffect(() => {
    mensajesRef.current = mensajes;
  }, [mensajes]);

  // Historial inicial. La API devuelve descendente (más recientes primero); la UI los quiere
  // ascendentes (el más viejo arriba), así que se invierte.
  useEffect(() => {
    if (conversacionId == null) {
      // Sin esto, al volver a "sin conversación seleccionada" quedarían pintados los
      // mensajes de la última conversación abierta.
      setMensajes([]);
      return;
    }

    let cancelado = false;
    setCargando(true);
    setError(null);
    // Limpiar acá (y no sólo cuando resuelve el fetch) evita que, al saltar de la
    // conversación A a la B, se vean las burbujas de A bajo el header de B mientras carga.
    setMensajes([]);
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
  }, [conversacionId, intentoCarga]);

  // Reintentar el historial inicial tras un fetch fallido. NO alcanza con "el usuario cierra y
  // reabre el chat": en modo LECTURA (disputa) la pantalla que existe justamente para mostrar
  // evidencia no puede depender de eso para volver a intentar.
  const reintentarCarga = useCallback(() => {
    setIntentoCarga((n) => n + 1);
  }, []);

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

  // Marcar leídos: el último mensaje confirmado que hay en pantalla. Depende del id de ese
  // mensaje (no del array completo) para no redisparar el POST en cada cambio de `mensajes`
  // que no mueva el último confirmado (por ejemplo, el propio mensaje optimista apareciendo).
  const confirmados = mensajes.filter((m) => !m.estadoEnvio);
  const ultimoConfirmadoId = confirmados.length > 0 ? confirmados[confirmados.length - 1].id : null;

  useEffect(() => {
    if (conversacionId == null || ultimoConfirmadoId == null) return;
    ChatService.marcarLeido(conversacionId, ultimoConfirmadoId).catch(() => { /* no bloquea la UI */ });
  }, [conversacionId, ultimoConfirmadoId]);

  // El log es inmutable y sólo crece por el frente (nunca se borra ni se edita un mensaje).
  // Por eso el offset del servidor sólo puede desplazarse hacia adelante cuando llegan
  // mensajes nuevos entre que se pidió una página y la siguiente: puede hacer que una página
  // ya vista se repita (duplicado), pero jamás que se salte un mensaje. Con esa garantía,
  // deduplicar por id al anteponer alcanza para tener una paginación correcta, sin necesidad
  // de migrar a paginación por cursor.
  const cargarMas = useCallback(async () => {
    if (conversacionId == null || !hayMas) return;
    const siguiente = paginaRef.current + 1;
    const page = await ChatService.listarMensajes(conversacionId, siguiente);
    paginaRef.current = siguiente;
    setMensajes((prev) => {
      const idsExistentes = new Set(prev.map((m) => m.id));
      const nuevos = [...page.content].reverse().filter((m) => !idsExistentes.has(m.id));
      return [...nuevos, ...prev];
    });
    setHayMas(!page.last);
  }, [conversacionId, hayMas]);

  const enviarOptimista = useCallback(
    async (
      borrador: Omit<MensajeUI, "id" | "conversacionId" | "creadoAt">,
      llamada: () => Promise<Mensaje>,
      // Presente sólo cuando es un reintento: reemplaza la burbuja fallida en su lugar en
      // vez de agregar una nueva al final (ver `reintentar`).
      claveLocalExistente?: string
    ) => {
      if (conversacionId == null) return;

      const claveLocal = claveLocalExistente ?? `local-${Date.now()}-${Math.random()}`;
      const optimista: MensajeUI = {
        ...borrador,
        id: -1,
        conversacionId,
        creadoAt: new Date().toISOString(),
        estadoEnvio: "enviando",
        claveLocal,
      };

      setMensajes((prev) =>
        claveLocalExistente
          ? prev.map((m) => (m.claveLocal === claveLocalExistente ? optimista : m))
          : [...prev, optimista]
      );

      try {
        const confirmado = await llamada();
        setMensajes((prev) => {
          // Si el eco del socket llegara antes de que resuelva este POST (hoy el backend no
          // lo hace: sólo publica al destinatario, nunca al emisor), ya habría una entrada
          // con `confirmado.id` en la lista. Sin este filtro quedarían dos entradas con el
          // mismo id al reemplazar la optimista. Es una bomba de tiempo: el día que se
          // agregue eco al emisor (por ejemplo para sincronizar entre dispositivos), este
          // filtro es lo que evita el duplicado.
          const sinEco = prev.filter((m) => m.claveLocal === claveLocal || m.id !== confirmado.id);
          return sinEco.map((m) => (m.claveLocal === claveLocal ? { ...confirmado } : m));
        });
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
    (contenido: string, claveLocalExistente?: string) =>
      enviarOptimista(
        { tipo: "TEXTO", contenido, imagenUrl: null, emisorId: usuarioId, emisorNombre: "", emisorFotoPerfil: null },
        () => ChatService.enviarTexto(conversacionId!, contenido),
        claveLocalExistente
      ),
    [conversacionId, usuarioId, enviarOptimista]
  );

  const enviarImagen = useCallback(
    (imagenUrl: string, claveLocalExistente?: string) =>
      enviarOptimista(
        { tipo: "IMAGEN", contenido: null, imagenUrl, emisorId: usuarioId, emisorNombre: "", emisorFotoPerfil: null },
        () => ChatService.enviarImagen(conversacionId!, imagenUrl),
        claveLocalExistente
      ),
    [conversacionId, usuarioId, enviarOptimista]
  );

  const reintentar = useCallback(
    (claveLocal: string) => {
      const fallido = mensajesRef.current.find((m) => m.claveLocal === claveLocal);
      if (!fallido) return;
      // Reemplaza en el lugar (vía claveLocalExistente en enviarOptimista): un mensaje que
      // falló en el medio del hilo no "salta" al final al reintentarlo.
      if (fallido.tipo === "TEXTO") enviarTexto(fallido.contenido!, claveLocal);
      else enviarImagen(fallido.imagenUrl!, claveLocal);
    },
    [enviarTexto, enviarImagen]
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
    reintentarCarga,
  };
}

import { useEffect, useState } from "react";
import { useWebSocketContext } from "@/shared/providers/WebSocketProvider";
import { ChatService } from "@/shared/services/ChatService";

/**
 * Contadores de mensajes no leídos por conversación, para los badges de los dashboards.
 *
 * ⚠️ Pensado para listados con muchos servicios: pide los conteos en UN SOLO efecto
 * (`Promise.all` sobre los `conversacionId` presentes), nunca desde el render de cada
 * tarjeta — eso sería un N+1 de red (una petición HTTP por fila, en cada render). No hay
 * endpoint batch en el backend, así que N llamadas en paralelo es lo correcto acá; lo que
 * hay que evitar es dispararlas por tarjeta o repetirlas en cada re-render.
 *
 * El efecto sólo se re-dispara cuando cambia el CONJUNTO de ids (se deriva a `clave` más
 * abajo), no cuando el dashboard re-renderiza con un array de contenido igual pero de
 * referencia distinta — el caso típico, ya que los `.map()` de JSX arman uno nuevo en
 * cada render.
 *
 * Se actualiza en vivo suscribiéndose a /user/queue/chat: cada mensaje entrante incrementa
 * el contador de su conversación sin esperar a un refetch ni a recargar la página.
 */
export function useUnreadCounts(conversacionIds: number[]): Record<number, number> {
  const [conteos, setConteos] = useState<Record<number, number>>({});
  const { subscribe } = useWebSocketContext();

  // Clave estable derivada del CONJUNTO de ids (orden y duplicados no importan): mientras
  // el conjunto no cambie, esta clave no cambia aunque `conversacionIds` sea un array
  // nuevo en cada render. Es lo que evita el re-disparo del efecto de abajo en un
  // re-render que no agregue ni quite conversaciones.
  const clave = Array.from(new Set(conversacionIds)).sort((a, b) => a - b).join(",");

  // Las queries fuente del dashboard (pendientes, en-cola, activo, mudanzas) resuelven en
  // momentos distintos, así que el conjunto de ids crece de a pasos durante la carga. Sin
  // esto, cada paso volvía a pedir el conjunto ENTERO (re-pidiendo conversaciones que ya se
  // habían consultado). Debounce corto: esperamos a que el set se estabilice y disparamos
  // una sola tanda. No cambia nada del comportamiento; los badges siguen actualizándose en
  // vivo por socket, y un cambio real de conversaciones más tarde igual re-dispara.
  const [claveEstable, setClaveEstable] = useState(clave);
  useEffect(() => {
    const t = setTimeout(() => setClaveEstable(clave), 250);
    return () => clearTimeout(t);
  }, [clave]);

  useEffect(() => {
    if (!claveEstable) {
      setConteos({});
      return;
    }

    let cancelado = false;
    const ids = claveEstable.split(",").map(Number);

    Promise.all(
      ids.map((id) => ChatService.contarNoLeidos(id).then((r) => [id, r.count] as const))
    )
      .then((pares) => {
        if (cancelado) return;
        // Math.max con lo que ya había: si mientras esta request estaba en vuelo llegó un
        // mensaje por socket que ya incrementó el contador local, esta respuesta (pedida
        // antes de ese mensaje) no puede pisarlo hacia abajo.
        setConteos((prev) => {
          const merged = { ...prev };
          for (const [id, count] of pares) {
            merged[id] = Math.max(merged[id] ?? 0, count);
          }
          return merged;
        });
      })
      .catch(() => {
        // Los badges son un extra visual: si falla el fetch, simplemente no se muestran;
        // no vale la pena romper el dashboard entero por esto.
      });

    return () => {
      cancelado = true;
    };
  }, [claveEstable]);

  useEffect(() => {
    return subscribe("/user/queue/chat", (m: { conversacionId: number }) => {
      setConteos((prev) => ({
        ...prev,
        [m.conversacionId]: (prev[m.conversacionId] ?? 0) + 1,
      }));
    });
  }, [subscribe]);

  return conteos;
}

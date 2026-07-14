import { Fragment, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Send, ImagePlus, Loader2, AlertTriangle } from "lucide-react";
import { Card } from "@/shared/components/ui/Card";
import { tw } from "@/shared/styles/design-system";
import { ROUTES } from "@/shared/constants/routes";
import { useChat } from "@/shared/hooks/useChat";
import { MensajeBubble } from "./MensajeBubble";
import { uploadToCloudinary } from "@/shared/lib/uploadToCloudinary";
import { esMismoDia, formatDiaRelativo } from "@/shared/lib/dayjs";
import type { ModoChat } from "@/shared/services/ChatService";

interface Props {
  conversacionId: number | null;
  // Viene del backend. ChatPanel lo obedece; no lo calcula.
  modo: ModoChat | null;
  usuarioId: number;
  titulo: string;
  // Opt-in: el chat estira hasta llenar el alto de su contenedor (que tiene que ser
  // flex column). Default false para que las pantallas que ya lo usan no cambien.
  expandido?: boolean;
}

export function ChatPanel({ conversacionId, modo, usuarioId, titulo, expandido = false }: Props) {
  const {
    mensajes,
    cargando,
    hayMas,
    error,
    cargarMas,
    enviarTexto,
    enviarImagen,
    reintentar,
    reintentarCarga,
  } = useChat(conversacionId, usuarioId);

  const [borrador, setBorrador] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const [errorUpload, setErrorUpload] = useState<string | null>(null);
  const finRef = useRef<HTMLDivElement>(null);

  // Autoscroll al último mensaje.
  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes.length]);

  // El backend garantiza que conversacionId y chatModo viajan juntos o ninguno de los
  // dos (ver ConversacionService): nunca hay conversación sin modo, ni modo sin
  // conversación. Chequear los dos acá codifica ese invariante EN el componente, en vez
  // de confiarlo a una aserción de no-nulo repetida en cada consumidor (MudanzaDetail,
  // ProviderMudanzaDetail, etc.) — si el backend rompiera esa garantía algún día, esto
  // se degrada a "no se muestra nada" en vez de a un crash de tipo en el consumidor.
  if (conversacionId == null || modo == null) return null;

  const soloLectura = modo === "LECTURA";

  const onEnviar = () => {
    const texto = borrador.trim();
    if (!texto) return;
    setBorrador("");
    enviarTexto(texto);
  };

  const onImagen = async (file: File) => {
    setSubiendo(true);
    setErrorUpload(null);
    try {
      // 'CHAT' fijo: una foto del chat es una foto del chat. ChatPanel no sabe (ni tiene
      // que saber) si la conversación cuelga de un trabajo o de una mudanza.
      const url = await uploadToCloudinary(file, "CHAT");
      await enviarImagen(url);
    } catch {
      // Falla local: no se persistió nada. El usuario puede reintentar eligiendo de nuevo.
      setErrorUpload("No pudimos subir la imagen. Probá de nuevo.");
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <Card className={expandido ? "flex h-full flex-col" : ""}>
      <div className={`mb-4 flex shrink-0 items-center justify-between border-b pb-4 ${tw.divider}`}>
        <h3 className={`text-sm font-semibold ${tw.text.primary}`}>{titulo}</h3>
        {soloLectura && (
          <span className={`text-xs ${tw.text.muted}`}>Conversación cerrada</span>
        )}
      </div>

      {/* Aviso de conducta. Sólo con el chat abierto: advertir sobre lo que enviás en una
          conversación que ya no admite mensajes no le sirve a nadie. */}
      {!soloLectura && (
        <p className={`mb-3 shrink-0 text-center text-[11px] leading-relaxed ${tw.text.muted}`}>
          Por favor, abstenerse de enviar contenido ilegal, ofensivo o no relevante. Cualquier uso
          inadecuado será reportado, investigado y podrá dar inicio a las acciones establecidas en
          nuestros{" "}
          <Link
            to={ROUTES.TERMS}
            target="_blank"
            className="font-medium underline hover:text-brand-600 dark:hover:text-dark-brand"
          >
            Términos y Condiciones de Uso
          </Link>
          .
        </p>
      )}

      {/* min-h-0 es obligatorio: un flex item trae min-height:auto, que le impide encogerse
          por debajo de su contenido y anula el overflow-y-auto (el chat crecería sin fin en
          vez de scrollear adentro). En mobile la grilla es de una sola columna: no hay alto
          sobrante que llenar, así que ahí sigue mandando el max-h-96 de siempre. */}
      <div
        className={
          "flex flex-col gap-2 overflow-y-auto pb-2 " +
          (expandido ? "max-h-96 lg:max-h-none lg:min-h-0 lg:flex-1" : "max-h-96")
        }
      >
        {hayMas && (
          <button
            onClick={cargarMas}
            className={`mx-auto text-xs ${tw.text.muted} hover:underline`}
          >
            Ver mensajes anteriores
          </button>
        )}

        {cargando && (
          <div className="flex justify-center py-4">
            <Loader2 className={`h-4 w-4 animate-spin ${tw.text.muted}`} />
          </div>
        )}

        {/* Error del historial ANTES que el vacío: un fetch fallido no es lo mismo que una
            conversación sin mensajes. En modo LECTURA (chat de un trabajo cerrado, revisado
            durante una disputa) confundirlos hace que la pantalla que existe para mostrar
            evidencia afirme positivamente que no hay evidencia. */}
        {!cargando && error && (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <p className={`text-xs ${tw.text.muted}`}>
              No pudimos cargar la conversación. Puede que falte algún mensaje.
            </p>
            <button
              onClick={reintentarCarga}
              className="text-xs font-medium text-brand-600 hover:underline dark:text-dark-brand"
            >
              Reintentar
            </button>
          </div>
        )}

        {!cargando && !error && mensajes.length === 0 && (
          <p className={`py-8 text-center text-xs ${tw.text.muted}`}>
            {soloLectura ? "No hubo mensajes." : "Todavía no hay mensajes. Escribí el primero."}
          </p>
        )}

        {mensajes.map((m, i) => {
          // Separador cuando cambia el día respecto del mensaje anterior. El primero de la
          // lista siempre lo lleva: sin él, la conversación empezaría sin fecha alguna.
          const anterior = mensajes[i - 1];
          const abreDia = !anterior || !esMismoDia(anterior.creadoAt, m.creadoAt);

          return (
            <Fragment key={m.claveLocal ?? m.id}>
              {abreDia && (
                <div className="my-2 flex items-center gap-3">
                  <div className={`h-px flex-1 ${tw.dividerLight} border-t`} />
                  <span className={`text-[11px] font-medium ${tw.text.muted}`}>
                    {formatDiaRelativo(m.creadoAt)}
                  </span>
                  <div className={`h-px flex-1 ${tw.dividerLight} border-t`} />
                </div>
              )}
              <MensajeBubble
                mensaje={m}
                esPropio={m.emisorId === usuarioId}
                onReintentar={reintentar}
              />
            </Fragment>
          );
        })}
        <div ref={finRef} />
      </div>

      {soloLectura ? (
        <div className={`shrink-0 border-t pt-4 ${tw.divider}`}>
          <p className={`text-center text-xs leading-relaxed ${tw.text.muted}`}>
            El servicio terminó. No podés enviar ni recibir mensajes.
            <br />
            La conversación queda guardada como registro.
          </p>
        </div>
      ) : (
        <div className={`shrink-0 border-t pt-4 ${tw.divider}`}>
          {errorUpload && <p className="mb-2 text-xs text-red-600">{errorUpload}</p>}

          <div className="flex gap-2">
            <label
              aria-label="Adjuntar imagen"
              className={`flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl
                border ${tw.divider} ${subiendo ? "opacity-40" : "hover:bg-slate-50"}`}
            >
              {subiendo ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ImagePlus className="h-4 w-4" />
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={subiendo}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onImagen(file);
                  e.target.value = "";
                }}
              />
            </label>

            <input
              type="text"
              value={borrador}
              onChange={(e) => setBorrador(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onEnviar(); }}
              placeholder="Escribí un mensaje..."
              aria-label="Mensaje"
              maxLength={2000}
              className={tw.input + " flex-1 text-sm"}
            />

            <button
              onClick={onEnviar}
              disabled={!borrador.trim()}
              aria-label="Enviar mensaje"
              className="flex h-10 w-10 items-center justify-center rounded-xl
                bg-brand-600 text-white transition dark:bg-dark-brand
                disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

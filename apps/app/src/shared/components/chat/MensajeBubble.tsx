import { useState } from "react";
import { AlertCircle, RotateCw } from "lucide-react";
import { tw } from "@/shared/styles/design-system";
import { ImageLightbox } from "@/shared/components/ui/ImageLightbox";
import { formatTime } from "@/shared/lib/dayjs";
import type { MensajeUI } from "@/shared/hooks/useChat";

interface Props {
  mensaje: MensajeUI;
  esPropio: boolean;
  onReintentar: (claveLocal: string) => void;
}

const iniciales = (nombre: string) =>
  nombre.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

// Burbuja de un mensaje individual. El contenido de texto se renderiza SIEMPRE como texto
// plano (React escapa por defecto): jamás usar dangerouslySetInnerHTML acá, aunque el
// mensaje venga de otro usuario y pueda contener HTML/markup malicioso.
export function MensajeBubble({ mensaje, esPropio, onReintentar }: Props) {
  const fallido = mensaje.estadoEnvio === "error";
  const enviando = mensaje.estadoEnvio === "enviando";
  const [verImagen, setVerImagen] = useState(false);

  return (
    <div className={`flex items-end gap-2 ${esPropio ? "justify-end" : "justify-start"}`}>
      {/* Avatar sólo del otro: en los propios sería ruido (ya sabés quién sos) y come ancho.
          Los mensajes optimistas son siempre propios, así que nunca les falta la foto acá. */}
      {!esPropio && (
        mensaje.emisorFotoPerfil ? (
          <img
            src={mensaje.emisorFotoPerfil}
            alt=""
            className="h-7 w-7 shrink-0 rounded-full object-cover"
            loading="lazy"
          />
        ) : (
          <div
            aria-hidden="true"
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold
              text-brand-600 dark:text-dark-brand ${tw.iconBg.brand}`}
          >
            {iniciales(mensaje.emisorNombre)}
          </div>
        )
      )}

      <div className="max-w-[75%]">
        <div
          className={`rounded-2xl px-3 py-2 text-sm transition
            ${esPropio
              ? "bg-brand-600 text-white dark:bg-dark-brand"
              : "bg-slate-100 text-slate-900 dark:bg-dark-border dark:text-slate-100"}
            ${enviando ? "opacity-50" : ""}
            ${fallido ? "ring-1 ring-red-500" : ""}`}
        >
          {mensaje.tipo === "IMAGEN" && mensaje.imagenUrl ? (
            <button
              onClick={() => setVerImagen(true)}
              aria-label="Ampliar imagen"
              className="block cursor-zoom-in"
            >
              <img
                src={mensaje.imagenUrl}
                alt="Imagen enviada en el chat"
                className="max-h-64 rounded-lg"
                loading="lazy"
              />
            </button>
          ) : (
            // React escapa el texto por defecto: no usar dangerouslySetInnerHTML acá jamás.
            <p className="whitespace-pre-wrap break-words">{mensaje.contenido}</p>
          )}
        </div>

        {/* Un mensaje fallido no tiene hora de envío que mostrar: nunca llegó al servidor.
            En su lugar manda el aviso de error de abajo. */}
        {!fallido && (
          <p className={`mt-0.5 text-[11px] ${tw.text.muted} ${esPropio ? "text-right" : ""}`}>
            {enviando ? "Enviando..." : formatTime(mensaje.creadoAt)}
          </p>
        )}

        {fallido && mensaje.claveLocal && (
          <button
            onClick={() => onReintentar(mensaje.claveLocal!)}
            aria-label="Reintentar envío del mensaje"
            className="mt-1 flex items-center gap-1 text-xs text-red-600 hover:underline"
          >
            <AlertCircle className="h-3 w-3" />
            No se envió.{" "}
            <span className="inline-flex items-center gap-0.5 font-medium">
              <RotateCw className="h-3 w-3" /> Reintentar
            </span>
          </button>
        )}
      </div>

      {verImagen && mensaje.imagenUrl && (
        <ImageLightbox
          src={mensaje.imagenUrl}
          alt="Imagen enviada en el chat"
          onClose={() => setVerImagen(false)}
        />
      )}
    </div>
  );
}

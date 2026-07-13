import { AlertCircle, RotateCw } from "lucide-react";
import type { MensajeUI } from "@/shared/hooks/useChat";

interface Props {
  mensaje: MensajeUI;
  esPropio: boolean;
  onReintentar: (claveLocal: string) => void;
}

// Burbuja de un mensaje individual. El contenido de texto se renderiza SIEMPRE como texto
// plano (React escapa por defecto): jamás usar dangerouslySetInnerHTML acá, aunque el
// mensaje venga de otro usuario y pueda contener HTML/markup malicioso.
export function MensajeBubble({ mensaje, esPropio, onReintentar }: Props) {
  const fallido = mensaje.estadoEnvio === "error";
  const enviando = mensaje.estadoEnvio === "enviando";

  return (
    <div className={`flex ${esPropio ? "justify-end" : "justify-start"}`}>
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
            <img
              src={mensaje.imagenUrl}
              alt="Imagen enviada en el chat"
              className="max-h-64 rounded-lg"
              loading="lazy"
            />
          ) : (
            // React escapa el texto por defecto: no usar dangerouslySetInnerHTML acá jamás.
            <p className="whitespace-pre-wrap break-words">{mensaje.contenido}</p>
          )}
        </div>

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
    </div>
  );
}

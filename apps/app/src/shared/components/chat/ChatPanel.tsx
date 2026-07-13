import { useEffect, useRef, useState } from "react";
import { Send, ImagePlus, Loader2 } from "lucide-react";
import { Card } from "@/shared/components/ui/Card";
import { tw } from "@/shared/styles/design-system";
import { useChat } from "@/shared/hooks/useChat";
import { MensajeBubble } from "./MensajeBubble";
import { uploadToCloudinary } from "@/shared/lib/uploadToCloudinary";
import type { ModoChat } from "@/shared/services/ChatService";

interface Props {
  conversacionId: number | null;
  // Viene del backend. ChatPanel lo obedece; no lo calcula.
  modo: ModoChat;
  usuarioId: number;
  titulo: string;
}

export function ChatPanel({ conversacionId, modo, usuarioId, titulo }: Props) {
  const { mensajes, cargando, hayMas, cargarMas, enviarTexto, enviarImagen, reintentar } =
    useChat(conversacionId, usuarioId);

  const [borrador, setBorrador] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const [errorUpload, setErrorUpload] = useState<string | null>(null);
  const finRef = useRef<HTMLDivElement>(null);

  // Autoscroll al último mensaje.
  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes.length]);

  // Sin conversación no hay con quién hablar: no se muestra nada.
  if (conversacionId == null) return null;

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
    <Card>
      <div className={`mb-4 flex items-center justify-between border-b pb-4 ${tw.divider}`}>
        <h3 className={`text-sm font-semibold ${tw.text.primary}`}>{titulo}</h3>
        {soloLectura && (
          <span className={`text-xs ${tw.text.muted}`}>Conversación cerrada</span>
        )}
      </div>

      <div className="flex max-h-96 flex-col gap-2 overflow-y-auto pb-2">
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

        {!cargando && mensajes.length === 0 && (
          <p className={`py-8 text-center text-xs ${tw.text.muted}`}>
            {soloLectura ? "No hubo mensajes." : "Todavía no hay mensajes. Escribí el primero."}
          </p>
        )}

        {mensajes.map((m) => (
          <MensajeBubble
            key={m.claveLocal ?? m.id}
            mensaje={m}
            esPropio={m.emisorId === usuarioId}
            onReintentar={reintentar}
          />
        ))}
        <div ref={finRef} />
      </div>

      {soloLectura ? (
        <div className={`border-t pt-4 ${tw.divider}`}>
          <p className={`text-center text-xs ${tw.text.muted}`}>
            El servicio se cerró. La conversación queda como registro y no admite mensajes nuevos.
          </p>
        </div>
      ) : (
        <div className={`border-t pt-4 ${tw.divider}`}>
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

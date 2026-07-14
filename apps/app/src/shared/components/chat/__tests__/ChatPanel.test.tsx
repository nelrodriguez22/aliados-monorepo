// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { ChatPanel } from "../ChatPanel";
import { useChat } from "@/shared/hooks/useChat";
import type { MensajeUI } from "@/shared/hooks/useChat";
import { uploadToCloudinary } from "@/shared/lib/uploadToCloudinary";

vi.mock("@/shared/hooks/useChat");
vi.mock("@/shared/lib/uploadToCloudinary");

// ChatPanel es el componente: acá se mockea useChat entero para no depender de su
// implementación real (eso ya lo cubre useChat.test.ts).
const useChatMock = vi.mocked(useChat);
const uploadToCloudinaryMock = vi.mocked(uploadToCloudinary);

function mockUseChat(overrides: Partial<ReturnType<typeof useChat>> = {}) {
  useChatMock.mockReturnValue({
    mensajes: [],
    cargando: false,
    hayMas: false,
    error: null,
    cargarMas: vi.fn(),
    enviarTexto: vi.fn(),
    enviarImagen: vi.fn(),
    reintentar: vi.fn(),
    reintentarCarga: vi.fn(),
    ...overrides,
  });
}

const mensajeAjeno: MensajeUI = {
  id: 1,
  conversacionId: 10,
  emisorId: 2,
  emisorNombre: "Beto",
  tipo: "TEXTO",
  contenido: "hola, ya salgo",
  imagenUrl: null,
  creadoAt: "2026-07-12T10:00:00",
};

const mensajePropio: MensajeUI = {
  ...mensajeAjeno,
  id: 2,
  emisorId: 1,
  emisorNombre: "Yo",
  contenido: "genial, te espero",
};

describe("ChatPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // El proyecto corre vitest con `globals: false`: @testing-library/react sólo registra su
  // afterEach(cleanup) automático cuando detecta un `afterEach` global, así que acá hay que
  // desmontar a mano o el DOM de un test queda pisado sobre el del siguiente.
  afterEach(() => {
    cleanup();
  });

  it("conversacionId null no renderiza nada", () => {
    mockUseChat();
    const { container } = render(
      <ChatPanel
        conversacionId={null}
        modo="ESCRITURA"
        usuarioId={1}
        titulo="Chat"
      />
    );
    expect(container.firstChild).toBeNull();
  });

  // El backend garantiza que conversacionId y chatModo viajan juntos o ninguno de los dos.
  // Este caso (conversacionId presente pero modo null) no debería darse en producción, pero
  // si el invariante se rompiera, ChatPanel tiene que fallar cerrado (no renderizar) en vez
  // de reventar tratando de leer `modo === "LECTURA"` sobre null.
  it("modo null con conversacionId no nulo tampoco renderiza nada", () => {
    mockUseChat();
    const { container } = render(
      <ChatPanel
        conversacionId={10}
        modo={null}
        usuarioId={1}
        titulo="Chat"
      />
    );
    expect(container.firstChild).toBeNull();
  });

  // XSS: un mensaje con HTML/markup en el contenido tiene que verse como TEXTO, no
  // ejecutarse ni insertarse como markup. Si esto falla, es un dangerouslySetInnerHTML
  // colado en la burbuja.
  it("un mensaje con HTML en el contenido se renderiza como texto, no como markup", () => {
    const payload = '<img src=x onerror="window.__xss = true">';
    mockUseChat({ mensajes: [{ ...mensajeAjeno, contenido: payload }] });

    render(
      <ChatPanel
        conversacionId={10}
        modo="ESCRITURA"
        usuarioId={1}
        titulo="Chat"
      />
    );

    // El texto literal aparece en el DOM (como contenido de texto, no como markup)...
    expect(screen.getByText(payload).textContent).toBe(payload);
    // ...pero no se creó ningún <img> a partir de ese contenido (no hay imágenes en este
    // mensaje de tipo TEXTO) ni se ejecutó el onerror.
    expect(document.querySelector("img")).toBeNull();
    expect((window as any).__xss).toBeUndefined();
  });

  it("un mensaje con estadoEnvio 'error' muestra el botón de reintentar y el texto sigue visible", () => {
    const reintentar = vi.fn();
    mockUseChat({
      mensajes: [
        { ...mensajePropio, estadoEnvio: "error", claveLocal: "local-1" },
      ],
      reintentar,
    });

    render(
      <ChatPanel
        conversacionId={10}
        modo="ESCRITURA"
        usuarioId={1}
        titulo="Chat"
      />
    );

    expect(screen.getByText("genial, te espero")).not.toBeNull();
    expect(screen.getByRole("button", { name: /reintentar/i })).not.toBeNull();
  });

  // IMPORTANTE: antes de este fix, useChat exponía `error` pero ChatPanel nunca lo
  // consumía, así que un fetch fallido del historial (500, timeout, red caída) se veía
  // IDÉNTICO a una conversación vacía: "No hubo mensajes." / "Escribí el primero." — en
  // modo LECTURA eso es la pantalla de evidencia de una disputa afirmando que no hay
  // evidencia. El estado de error tiene que ser explícito y distinto del vacío.
  it("si falla el fetch del historial, muestra un error explícito (no 'No hubo mensajes') en modo LECTURA", () => {
    mockUseChat({ mensajes: [], error: "No pudimos cargar los mensajes" });

    render(
      <ChatPanel
        conversacionId={10}
        modo="LECTURA"
        usuarioId={1}
        titulo="Chat"
      />
    );

    expect(screen.queryByText("No hubo mensajes.")).toBeNull();
    expect(screen.getByText(/no pudimos cargar la conversación/i)).not.toBeNull();
    expect(screen.getByRole("button", { name: /reintentar/i })).not.toBeNull();
  });

  it("si falla el fetch del historial, tampoco invita a 'escribir el primero' en modo ESCRITURA", () => {
    mockUseChat({ mensajes: [], error: "No pudimos cargar los mensajes" });

    render(
      <ChatPanel
        conversacionId={10}
        modo="ESCRITURA"
        usuarioId={1}
        titulo="Chat"
      />
    );

    expect(screen.queryByText(/todavía no hay mensajes/i)).toBeNull();
    expect(screen.getByText(/no pudimos cargar la conversación/i)).not.toBeNull();
  });

  it("el botón de reintentar del historial llama a reintentarCarga", () => {
    const reintentarCarga = vi.fn();
    mockUseChat({ mensajes: [], error: "No pudimos cargar los mensajes", reintentarCarga });

    render(
      <ChatPanel
        conversacionId={10}
        modo="LECTURA"
        usuarioId={1}
        titulo="Chat"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /reintentar/i }));
    expect(reintentarCarga).toHaveBeenCalledTimes(1);
  });

  it("modo LECTURA no muestra input ni botón de enviar, pero los mensajes sí se ven", () => {
    mockUseChat({ mensajes: [mensajeAjeno, mensajePropio] });

    render(
      <ChatPanel
        conversacionId={10}
        modo="LECTURA"
        usuarioId={1}
        titulo="Chat"
      />
    );

    expect(screen.queryByLabelText("Mensaje")).toBeNull();
    expect(screen.queryByLabelText("Enviar mensaje")).toBeNull();
    expect(screen.getByText("hola, ya salgo")).not.toBeNull();
    expect(screen.getByText("genial, te espero")).not.toBeNull();
    expect(screen.getByText(/se cerró/i)).not.toBeNull();
  });

  it("distingue mensajes propios de ajenos por emisorId vs usuarioId", () => {
    mockUseChat({ mensajes: [mensajeAjeno, mensajePropio] });

    render(
      <ChatPanel
        conversacionId={10}
        modo="ESCRITURA"
        usuarioId={1}
        titulo="Chat"
      />
    );

    const ajeno = screen.getByText("hola, ya salgo");
    const propio = screen.getByText("genial, te espero");

    // El ajeno se alinea a la izquierda (justify-start), el propio a la derecha (justify-end).
    expect(ajeno.closest(".flex")?.className).toContain("justify-start");
    expect(propio.closest(".flex")?.className).toContain("justify-end");
  });

  it("en modo ESCRITURA hay input y botón de enviar con aria-label", () => {
    mockUseChat();

    render(
      <ChatPanel
        conversacionId={10}
        modo="ESCRITURA"
        usuarioId={1}
        titulo="Chat"
      />
    );

    expect(screen.getByLabelText("Mensaje")).not.toBeNull();
    expect(screen.getByLabelText("Enviar mensaje")).not.toBeNull();
    expect(screen.getByLabelText("Adjuntar imagen")).not.toBeNull();
  });

  // Task 11 pendiente: si uploadToCloudinary falla, el usuario tiene que enterarse (mensaje de
  // error) y poder reintentar (el input de archivo no puede quedar `disabled` para siempre).
  it("si falla la subida de la imagen, muestra el error y libera el input para reintentar", async () => {
    const enviarImagen = vi.fn();
    uploadToCloudinaryMock.mockRejectedValue(new Error("network error"));
    mockUseChat({ enviarImagen });

    render(
      <ChatPanel
        conversacionId={10}
        modo="ESCRITURA"
        usuarioId={1}
        titulo="Chat"
      />
    );

    const input = screen.getByLabelText("Adjuntar imagen").querySelector(
      "input[type='file']"
    ) as HTMLInputElement;
    const file = new File(["contenido"], "foto.jpg", { type: "image/jpeg" });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("No pudimos subir la imagen. Probá de nuevo.")).not.toBeNull();
    });

    // No se llegó a persistir ningún mensaje: la falla fue local, antes de enviarImagen.
    expect(enviarImagen).not.toHaveBeenCalled();
    // El estado de "subiendo" se limpió: el input vuelve a estar habilitado (se puede reintentar).
    expect(input.disabled).toBe(false);
  });
});

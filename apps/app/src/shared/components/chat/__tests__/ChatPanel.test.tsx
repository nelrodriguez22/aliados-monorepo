// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ChatPanel } from "../ChatPanel";
import { useChat } from "@/shared/hooks/useChat";
import type { MensajeUI } from "@/shared/hooks/useChat";

vi.mock("@/shared/hooks/useChat");

// ChatPanel es el componente: acá se mockea useChat entero para no depender de su
// implementación real (eso ya lo cubre useChat.test.ts).
const useChatMock = vi.mocked(useChat);

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
        tipoUpload="TRABAJO"
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
        tipoUpload="TRABAJO"
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
        tipoUpload="TRABAJO"
      />
    );

    expect(screen.getByText("genial, te espero")).not.toBeNull();
    expect(screen.getByRole("button", { name: /reintentar/i })).not.toBeNull();
  });

  it("modo LECTURA no muestra input ni botón de enviar, pero los mensajes sí se ven", () => {
    mockUseChat({ mensajes: [mensajeAjeno, mensajePropio] });

    render(
      <ChatPanel
        conversacionId={10}
        modo="LECTURA"
        usuarioId={1}
        titulo="Chat"
        tipoUpload="TRABAJO"
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
        tipoUpload="TRABAJO"
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
        tipoUpload="TRABAJO"
      />
    );

    expect(screen.getByLabelText("Mensaje")).not.toBeNull();
    expect(screen.getByLabelText("Enviar mensaje")).not.toBeNull();
    expect(screen.getByLabelText("Adjuntar imagen")).not.toBeNull();
  });
});

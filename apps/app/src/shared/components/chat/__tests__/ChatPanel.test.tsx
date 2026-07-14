// @vitest-environment happy-dom
import type { ReactElement } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render as renderRTL, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ChatPanel } from "../ChatPanel";
import { useChat } from "@/shared/hooks/useChat";
import type { MensajeUI } from "@/shared/hooks/useChat";
import { uploadToCloudinary } from "@/shared/lib/uploadToCloudinary";

// Firebase se inicializa al importar la cadena de ChatPanel. En CI no hay VITE_FIREBASE_API_KEY,
// así que sin este mock el import real tira `auth/invalid-api-key` y tumba la suite entera.
vi.mock("@/shared/lib/firebase", () => ({
  auth: { currentUser: { getIdToken: vi.fn().mockResolvedValue("token-falso") } },
  getMessagingInstance: vi.fn().mockResolvedValue(null),
  default: {},
}));

vi.mock("@/shared/hooks/useChat");
vi.mock("@/shared/lib/uploadToCloudinary");

// ChatPanel es el componente: acá se mockea useChat entero para no depender de su
// implementación real (eso ya lo cubre useChat.test.ts).
const useChatMock = vi.mocked(useChat);
const uploadToCloudinaryMock = vi.mocked(uploadToCloudinary);

// El aviso de conducta del chat linkea a los Términos con <Link>, que sin un Router arriba
// tira "Cannot destructure property 'basename'". Todos los tests montan por acá.
const render = (ui: ReactElement) => renderRTL(<MemoryRouter>{ui}</MemoryRouter>);

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
  emisorFotoPerfil: null,
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
    expect(screen.getByText(/no podés enviar ni recibir mensajes/i)).not.toBeNull();
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

  it("muestra el aviso de conducta con el chat abierto, y no cuando ya está cerrado", () => {
    mockUseChat({ mensajes: [mensajeAjeno] });

    const { unmount } = render(
      <ChatPanel conversacionId={10} modo="ESCRITURA" usuarioId={1} titulo="Chat" />
    );
    expect(screen.getByText(/contenido ilegal, ofensivo o no relevante/i)).not.toBeNull();
    // El aviso deja leer el contrato que amenaza con hacer cumplir.
    expect(screen.getByRole("link", { name: /términos y condiciones/i })).not.toBeNull();
    unmount();

    // Cerrado no se puede enviar nada: advertir sobre lo que enviás sería ruido.
    mockUseChat({ mensajes: [mensajeAjeno] });
    render(<ChatPanel conversacionId={10} modo="LECTURA" usuarioId={1} titulo="Chat" />);
    expect(screen.queryByText(/contenido ilegal, ofensivo o no relevante/i)).toBeNull();
  });

  it("cada mensaje muestra su hora", () => {
    mockUseChat({ mensajes: [mensajeAjeno, mensajePropio] });

    render(<ChatPanel conversacionId={10} modo="ESCRITURA" usuarioId={1} titulo="Chat" />);

    // La hora exacta depende del huso del runner (CI corre en UTC, acá es Buenos Aires),
    // así que se afirma el formato y la cantidad, no un valor puntual.
    expect(screen.getAllByText(/^\d{2}:\d{2}$/)).toHaveLength(2);
  });

  it("separa los mensajes por día: un encabezado por jornada, no uno por mensaje", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-20T12:00:00Z"));

    const lunes12a: MensajeUI = { ...mensajeAjeno, id: 1, creadoAt: "2026-07-12T12:00:00" };
    const lunes12b: MensajeUI = { ...mensajeAjeno, id: 2, creadoAt: "2026-07-12T15:30:00" };
    const martes13: MensajeUI = { ...mensajeAjeno, id: 3, creadoAt: "2026-07-13T09:00:00" };
    mockUseChat({ mensajes: [lunes12a, lunes12b, martes13] });

    render(<ChatPanel conversacionId={10} modo="ESCRITURA" usuarioId={1} titulo="Chat" />);

    // Dos mensajes del 12 comparten un solo encabezado; el del 13 abre el suyo.
    expect(screen.getAllByText("12 de julio")).toHaveLength(1);
    expect(screen.getAllByText("13 de julio")).toHaveLength(1);

    vi.useRealTimers();
  });

  it("el avatar acompaña sólo a los mensajes del otro, y cae a las iniciales sin foto", () => {
    const conFoto: MensajeUI = {
      ...mensajeAjeno,
      emisorNombre: "Beto Alonso",
      emisorFotoPerfil: "https://res.cloudinary.com/demo/beto.jpg",
    };
    mockUseChat({ mensajes: [conFoto, mensajePropio] });

    const { container, unmount } = render(
      <ChatPanel conversacionId={10} modo="ESCRITURA" usuarioId={1} titulo="Chat" />
    );

    // Un solo avatar: el del ajeno. El propio (emisorId === usuarioId) no lleva.
    const avatares = container.querySelectorAll('img[src="https://res.cloudinary.com/demo/beto.jpg"]');
    expect(avatares).toHaveLength(1);
    unmount();

    // Sin foto de perfil, las iniciales del emisor hacen de avatar.
    mockUseChat({ mensajes: [{ ...mensajeAjeno, emisorNombre: "Beto Alonso" }] });
    render(<ChatPanel conversacionId={10} modo="ESCRITURA" usuarioId={1} titulo="Chat" />);
    expect(screen.getByText("BA")).not.toBeNull();
  });
});

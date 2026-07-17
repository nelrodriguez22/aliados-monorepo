// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { JobTracking } from "../JobTracking";
import { useTrabajo } from "@/shared/hooks/useTrabajo";
import { useStore } from "@/shared/store/useStore";

/**
 * Regresión del chat invisible en PRESUPUESTADO: el backend habilita chat en
 * ESCRITURA para ese estado (ConversacionService.TRABAJO_ESCRITURA) y el
 * dashboard muestra el badge de no-leídos, pero el early return de la vista
 * de presupuesto en JobTracking no montaba el ChatPanel → los mensajes eran
 * inaccesibles justo cuando el cliente decide aceptar o rechazar.
 */
const navigate = vi.fn();
vi.mock("react-router-dom", async (original) => ({
  ...(await original<typeof import("react-router-dom")>()),
  useParams: () => ({ jobId: "32" }),
  useNavigate: () => navigate,
}));

// Acá se testea la pantalla, no el chat (que arrastra firebase y sockets).
vi.mock("@/shared/components/chat/ChatPanel", () => ({
  ChatPanel: () => <div data-testid="chat" />,
}));

vi.mock("@/shared/hooks/useTrabajo");
vi.mock("@/shared/store/useStore");

const useTrabajoMock = vi.mocked(useTrabajo);
const useStoreMock = vi.mocked(useStore);

const trabajoPresupuestado = {
  id: 32,
  estado: "PRESUPUESTADO",
  oficio: { id: 1, nombre: "Electricista" },
  montoPresupuesto: 100000,
  tarifaVisita: 15000,
  notaResumen: "Cambio de térmica",
  conversacionId: 5,
  chatModo: "ESCRITURA",
};

function mockTrabajo(overrides: Record<string, unknown> = {}) {
  useTrabajoMock.mockReturnValue({
    data: { ...trabajoPresupuestado, ...overrides },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useTrabajo>);
}

function renderPantalla() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <JobTracking />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("JobTracking — vista de presupuesto", () => {
  beforeEach(() => {
    useStoreMock.mockReturnValue({ user: { id: 10, uid: "cli", role: "CLIENT" } } as unknown as ReturnType<typeof useStore>);
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("muestra el chat junto al presupuesto cuando hay conversación", () => {
    mockTrabajo();
    renderPantalla();

    // La decisión sigue siendo la protagonista…
    expect(screen.getByText(/Aceptar y pagar/)).not.toBeNull();
    // …pero el chat tiene que estar accesible: es donde el proveedor aclara el presupuesto.
    expect(screen.getByTestId("chat")).not.toBeNull();
  });

  it("sin conversación no monta el chat y la vista sigue funcionando", () => {
    mockTrabajo({ conversacionId: null, chatModo: null });
    renderPantalla();

    expect(screen.getByText(/Aceptar y pagar/)).not.toBeNull();
    expect(screen.queryByTestId("chat")).toBeNull();
  });
});

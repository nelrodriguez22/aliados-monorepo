// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ActiveJob } from "../ActiveJob";
import { useTrabajo } from "@/shared/hooks/useTrabajo";
import { useStore } from "@/shared/store/useStore";

// El automock de useTrabajo carga el módulo real para inferir su forma, y con él viaja
// apiClient → firebase.ts → getAuth(). En CI no hay VITE_FIREBASE_API_KEY: sin este mock,
// el import tira auth/invalid-api-key y tumba la suite entera (mismo motivo que en
// ChatPanel.test.tsx). Local pasa igual porque el .env tiene la key: engaña.
vi.mock("@/shared/lib/firebase", () => ({
  auth: { currentUser: { getIdToken: vi.fn().mockResolvedValue("token-falso") } },
  getMessagingInstance: vi.fn().mockResolvedValue(null),
  default: {},
}));

const navigate = vi.fn();
vi.mock("react-router-dom", async (original) => ({
  ...(await original<typeof import("react-router-dom")>()),
  useParams: () => ({ id: "32" }),
  useNavigate: () => navigate,
}));

// El chat arrastra firebase y sockets: acá se testea la pantalla, no el chat.
vi.mock("@/shared/components/chat/ChatPanel", () => ({
  ChatPanel: () => <div data-testid="chat" />,
}));

vi.mock("@/shared/hooks/useTrabajo");
vi.mock("@/shared/store/useStore");

const useTrabajoMock = vi.mocked(useTrabajo);
const useStoreMock = vi.mocked(useStore);

const trabajoBase = {
  id: 32,
  estado: "EN_CURSO",
  clienteNombre: "Ana",
  direccion: "Jujuy 1942",
  descripcion: "Se cortó la luz",
  fotos: null,
  latitudCliente: -32.9,
  longitudCliente: -60.6,
  acceptedAt: "2026-07-12T21:45:00",
  tiempoEstimadoMinutos: 60,
  conversacionId: 5,
  chatModo: "ESCRITURA",
  montoPresupuesto: null,
};

function mockTrabajo(overrides: Record<string, unknown> = {}) {
  useTrabajoMock.mockReturnValue({
    data: { ...trabajoBase, ...overrides },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useTrabajo>);
}

const renderPantalla = () =>
  render(<MemoryRouter><ActiveJob /></MemoryRouter>);

describe("ActiveJob — botón de presupuesto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStoreMock.mockReturnValue({ user: { id: 7 } } as unknown as ReturnType<typeof useStore>);
  });

  afterEach(() => cleanup());

  it("con el trabajo EN_CURSO, el botón lleva al formulario de presupuesto", () => {
    mockTrabajo({ estado: "EN_CURSO" });
    renderPantalla();

    const boton = screen.getByRole("button", { name: "Enviar presupuesto" }) as HTMLButtonElement;
    expect(boton.disabled).toBe(false);

    fireEvent.click(boton);
    expect(navigate).toHaveBeenCalledWith("/proveedor/presupuesto/32");
  });

  // Antes, el botón seguía activo con el presupuesto ya enviado: te dejaba entrar al
  // formulario para recién ahí rebotarte con un toast. La regla ("sólo EN_CURSO puede
  // presupuestar") ahora se aplica acá, antes de navegar a ningún lado.
  it("con el presupuesto ya enviado, el botón queda inerte y muestra el monto", () => {
    mockTrabajo({ estado: "PRESUPUESTADO", montoPresupuesto: 120000 });
    renderPantalla();

    const boton = screen.getByRole("button", { name: "Presupuesto enviado" }) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Enviar presupuesto" })).toBeNull();

    fireEvent.click(boton);
    expect(navigate).not.toHaveBeenCalled();

    // El monto cotizado se ve sin tener que ir a buscarlo a otra pantalla.
    expect(screen.getByText("$120.000")).not.toBeNull();
    // Y el encabezado deja de afirmar que el trabajo sigue en curso.
    expect(screen.getByText("Presupuesto enviado", { selector: "h1" })).not.toBeNull();
    expect(screen.queryByText("En curso")).toBeNull();
  });
});

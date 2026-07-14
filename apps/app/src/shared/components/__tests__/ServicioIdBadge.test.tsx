// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { ServicioIdBadge } from "../ServicioIdBadge";

const writeText = vi.fn().mockResolvedValue(undefined);

describe("ServicioIdBadge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // navigator.clipboard es getter-only en happy-dom: Object.assign no lo pisa.
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
  });

  afterEach(() => cleanup());

  it("no renderiza nada sin id", () => {
    const { container } = render(<ServicioIdBadge tipo="TRABAJO" id={null} />);
    expect(container.innerHTML).toBe("");
  });

  // Antes el código era un <span> inerte: sólo copiaba el ícono de al lado, y el número
  // —que es lo que el usuario ve y quiere agarrar— no hacía nada al clickearlo.
  it("al hacer click en el código lo copia al portapapeles", async () => {
    render(<ServicioIdBadge tipo="TRABAJO" id={32} />);

    fireEvent.click(screen.getByText("#T-32"));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("#T-32"));
  });

  it("el código y el ícono son un solo control, no dos botones con la misma acción", () => {
    render(<ServicioIdBadge tipo="MUDANZA" id={45} />);

    const botones = screen.getAllByRole("button", { name: "Copiar #M-45" });
    expect(botones).toHaveLength(1);
    // El código vive DENTRO de ese único botón: por eso clickearlo copia.
    expect(botones[0].textContent).toContain("#M-45");
  });

  it("tras copiar muestra el check de confirmación", async () => {
    const { container } = render(<ServicioIdBadge tipo="TRABAJO" id={7} />);

    expect(container.querySelector(".text-green-500")).toBeNull();
    fireEvent.click(screen.getByText("#T-7"));

    await waitFor(() => {
      expect(container.querySelector(".text-green-500")).not.toBeNull();
    });
  });

  // Sin portapapeles (contexto inseguro, http://) no puede explotar: el número sigue
  // visible en pantalla para copiarlo a mano.
  it("si el portapapeles falla, no rompe ni muestra el check", async () => {
    writeText.mockRejectedValueOnce(new Error("not allowed"));
    const { container } = render(<ServicioIdBadge tipo="TRABAJO" id={9} />);

    fireEvent.click(screen.getByText("#T-9"));

    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(container.querySelector(".text-green-500")).toBeNull();
    expect(screen.getByText("#T-9")).not.toBeNull();
  });
});

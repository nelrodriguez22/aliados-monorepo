// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { PWAUpdateBanner } from "../PWAUpdateBanner";
import { usePWAUpdate } from "../PWAUpdateProvider";

vi.mock("../PWAUpdateProvider", () => ({ usePWAUpdate: vi.fn() }));
const usePWAUpdateMock = vi.mocked(usePWAUpdate);

const estado = (over: Partial<ReturnType<typeof usePWAUpdate>> = {}) => {
  const value = { needRefresh: true, actualizando: false, reload: vi.fn(), ...over };
  usePWAUpdateMock.mockReturnValue(value);
  return value;
};

describe("PWAUpdateBanner", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("sin versión nueva no muestra nada", () => {
    estado({ needRefresh: false });
    const { container } = render(<PWAUpdateBanner />);
    expect(container.innerHTML).toBe("");
  });

  it("al clickear Recargar dispara la actualización", () => {
    const { reload } = estado();
    render(<PWAUpdateBanner />);

    fireEvent.click(screen.getByRole("button", { name: "Recargar" }));

    expect(reload).toHaveBeenCalledTimes(1);
  });

  // El bug reportado: hacés click y "no pasa nada", sin error. Un click que nunca llegó al
  // botón y uno que llegó pero se colgó se veían IGUAL. Con el feedback ya no.
  it("mientras actualiza avisa que está trabajando y no se puede volver a clickear", () => {
    estado({ actualizando: true });
    render(<PWAUpdateBanner />);

    const boton = screen.getByRole("button", { name: "Actualizando..." }) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
    expect(boton.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByText(/actualizando a la última versión/i)).not.toBeNull();
    // Y ya no invita a hacer algo que ya está en curso.
    expect(screen.queryByRole("button", { name: "Recargar" })).toBeNull();
  });

  it("estando deshabilitado, un segundo click no vuelve a disparar la actualización", () => {
    const { reload } = estado({ actualizando: true });
    render(<PWAUpdateBanner />);

    fireEvent.click(screen.getByRole("button", { name: "Actualizando..." }));

    expect(reload).not.toHaveBeenCalled();
  });
});

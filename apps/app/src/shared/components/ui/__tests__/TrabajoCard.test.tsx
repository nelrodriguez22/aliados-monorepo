// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { TrabajoCard } from "../TrabajoCard";

/**
 * TrabajoCard vivía dentro de ProviderDashboard, atada a `trabajo.clienteNombre`. El cliente,
 * que necesitaba mostrar el PROVEEDOR, no podía usarla y la reimplementaba a mano. Estos tests
 * fijan lo que la vuelve compartible: recibe titulo/subtitulo, y el contenido variable entra
 * por slots — sin ninguna prop del tipo `esProveedor`.
 */
describe("TrabajoCard", () => {
  afterEach(() => cleanup());

  it("muestra el protagonista que le pasen, sea el cliente o el proveedor", () => {
    const { unmount } = render(
      <TrabajoCard titulo="Ana Gómez" subtitulo="Electricista" badgeContent={null} />
    );
    expect(screen.getByText("Ana Gómez")).not.toBeNull();
    unmount();

    render(<TrabajoCard titulo="Beto Alonso" subtitulo="Plomero" badgeContent={null} />);
    expect(screen.getByText("Beto Alonso")).not.toBeNull();
  });

  it("sólo muestra la dirección si se la pasan (al cliente no le sirve la propia)", () => {
    const { unmount } = render(
      <TrabajoCard titulo="Ana" subtitulo="Electricista" badgeContent={null} direccion="Jujuy 1942" />
    );
    expect(screen.getByText("Jujuy 1942")).not.toBeNull();
    unmount();

    const { container } = render(
      <TrabajoCard titulo="Ana" subtitulo="Electricista" badgeContent={null} />
    );
    expect(container.textContent).not.toContain("Jujuy");
  });

  // El proveedor pone un botón "Ver detalle" donde el cliente pone el tiempo estimado.
  it("el botón de acción reemplaza al tiempo en la esquina", () => {
    const { unmount } = render(
      <TrabajoCard titulo="Ana" subtitulo="Electricista" badgeContent={null} tiempoEstimadoMinutos={30} />
    );
    expect(screen.getByText(/30 min/)).not.toBeNull();
    unmount();

    render(
      <TrabajoCard
        titulo="Ana"
        subtitulo="Electricista"
        badgeContent={null}
        tiempoEstimadoMinutos={30}
        actionContent={<button>Ver detalle</button>}
      />
    );
    // Con acción, el tiempo ya no está arriba (baja junto a la dirección, si la hay).
    expect(screen.getByRole("button", { name: "Ver detalle" })).not.toBeNull();
    expect(screen.queryByText(/30 min/)).toBeNull();
  });

  it("es clickeable sólo cuando le dan un onClick", () => {
    const onClick = vi.fn();
    render(
      <TrabajoCard titulo="Ana" subtitulo="Electricista" badgeContent={null} onClick={onClick} />
    );

    fireEvent.click(screen.getByText("Ana"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("el contador de no leídos no aparece cuando está en cero", () => {
    const { container, unmount } = render(
      <TrabajoCard titulo="Ana" subtitulo="Electricista" badgeContent={null} unreadCount={0} />
    );
    expect(container.textContent).not.toContain("3");
    unmount();

    render(<TrabajoCard titulo="Ana" subtitulo="Electricista" badgeContent={null} unreadCount={3} />);
    expect(screen.getByText("3")).not.toBeNull();
  });
});

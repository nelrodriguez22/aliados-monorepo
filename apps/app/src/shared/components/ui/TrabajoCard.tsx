import type { ReactNode } from "react";
import { Clock, MapPin } from "lucide-react";
import { Card } from "@/shared/components/ui/Card";
import { UnreadBadge } from "@/shared/components/chat/UnreadBadge";
import { tw } from "@/shared/styles/design-system";

interface Props {
  /** Con quién es el trabajo: el cliente para el proveedor, el proveedor para el cliente. */
  titulo: string;
  subtitulo: string;
  /** Avatar: iniciales del otro (proveedor) o el ícono del oficio (cliente). */
  left?: ReactNode;
  /** Badge de estado, arriba a la derecha. */
  badgeContent: ReactNode;
  /** Botón de acción. Si existe, reemplaza al tiempo en la esquina y éste baja junto a la dirección. */
  actionContent?: ReactNode;
  /** Sólo el proveedor la muestra: al cliente no le sirve su propia dirección. */
  direccion?: string | null;
  tiempoEstimadoMinutos?: number | null;
  unreadCount?: number;
  onClick?: () => void;
  /** Clases extra para el contenedor (ej. un borde de color que distinga la card activa). */
  className?: string;
}

/**
 * La fila de un trabajo en cualquiera de los dos dashboards.
 *
 * Vivía dentro de ProviderDashboard, atada a `trabajo.clienteNombre`, así que el cliente no
 * podía usarla aunque su card fuera estructuralmente idéntica: la reimplementaba a mano.
 * Ahora recibe `titulo`/`subtitulo` en vez de un objeto `trabajo`, y las dos la comparten.
 *
 * Comparten el ESQUELETO, no el contenido: el proveedor pone un botón "Ver detalle" donde el
 * cliente pone el tiempo estimado, y sólo el proveedor muestra la dirección. Para eso están
 * los slots (`left`, `badgeContent`, `actionContent`) y no una prop `esProveedor`.
 */
export function TrabajoCard({
  titulo,
  subtitulo,
  left,
  badgeContent,
  actionContent,
  direccion,
  tiempoEstimadoMinutos,
  unreadCount,
  onClick,
  className = "",
}: Props) {
  return (
    <Card hover={!!onClick} onClick={onClick} className={className}>
      {/* Fila principal: avatar | nombre + oficio | badge + tiempo */}
      <div className="flex items-center gap-2 min-[375px]:gap-3">
        {left}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold truncate ${tw.text.primary}`}>{titulo}</p>
          <p className={`mt-0.5 text-xs truncate ${tw.text.secondary}`}>{subtitulo}</p>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1">
          <div className="flex items-center">
            {badgeContent}
            <UnreadBadge count={unreadCount ?? 0} />
          </div>
          {!actionContent && tiempoEstimadoMinutos ? (
            <span className={`flex items-center gap-1 text-xs ${tw.text.secondary}`}>
              <Clock className={`h-3 w-3 ${tw.text.faint}`} />
              {tiempoEstimadoMinutos} min
            </span>
          ) : null}
          {actionContent}
        </div>
      </div>

      {/* Dirección — fila propia debajo, separada */}
      {direccion && (
        <div className={`mt-2.5 flex items-center gap-1.5 pt-2.5 border-t text-xs ${tw.text.faint} ${tw.dividerLight}`}>
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="min-w-0 truncate">{direccion}</span>
          {actionContent && tiempoEstimadoMinutos ? (
            <>
              <span className="shrink-0">·</span>
              <Clock className="h-3 w-3 shrink-0" />
              <span className="shrink-0">{tiempoEstimadoMinutos} min</span>
            </>
          ) : null}
        </div>
      )}
    </Card>
  );
}

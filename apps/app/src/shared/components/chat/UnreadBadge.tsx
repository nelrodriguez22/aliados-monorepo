interface Props {
  count: number;
}

/**
 * Badge de mensajes sin leer para las tarjetas de servicio de los dashboards.
 * No renderiza nada si el contador es 0 (o negativo) — el llamador decide si además
 * hay `conversacionId`, esto sólo se ocupa del conteo.
 */
export function UnreadBadge({ count }: Props) {
  if (count <= 0) return null;

  return (
    <span
      className="ml-2 inline-flex h-5 min-w-[1.25rem] items-center justify-center
        rounded-full bg-red-500 px-1.5 text-xs font-semibold text-white"
      aria-label={`${count} mensajes sin leer`}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

import { tw } from "@/shared/styles/design-system";

interface Props {
  name: string;
  /** Clase de fondo (tw.iconBg.*). Por defecto, el gris neutro. */
  bg?: string;
  /** Clase de color del texto. */
  color?: string;
}

/** Avatar de iniciales, del mismo tamaño que el ícono de oficio en TrabajoCard. */
export function Initials({ name, bg = tw.iconBg.slate, color = tw.text.secondary }: Props) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className={`flex h-9 w-9 min-[375px]:h-11 min-[375px]:w-11 shrink-0 items-center justify-center
        rounded-xl font-semibold text-xs min-[375px]:text-sm ${bg} ${color}`}
    >
      {initials}
    </div>
  );
}

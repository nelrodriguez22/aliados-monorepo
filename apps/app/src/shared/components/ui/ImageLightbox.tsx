import { useEffect, useRef, useState } from "react";
import { X, ZoomIn, ZoomOut } from "lucide-react";

interface Props {
  src: string;
  alt?: string;
  onClose: () => void;
}

const ESCALA_MIN = 1;
const ESCALA_MAX = 4;
const PASO_BOTON = 0.5;

const acotar = (v: number) => Math.min(ESCALA_MAX, Math.max(ESCALA_MIN, v));

const distanciaEntre = (t: TouchList) =>
  Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

/**
 * Visor de imagen a pantalla completa con zoom (rueda del mouse, pinch, doble click) y
 * arrastre cuando la imagen está ampliada. Lo usan las fotos del problema y el chat.
 */
export function ImageLightbox({ src, alt = "Imagen ampliada", onClose }: Props) {
  const [escala, setEscala] = useState(ESCALA_MIN);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  // El punto de origen del arrastre vive en un ref (nadie lo pinta), pero el "estoy
  // arrastrando" es estado: el cursor y la transición lo leen en el render, y mutar un ref
  // no dispara re-render — el cursor quedaría pegado en `grab` mientras arrastrás.
  const [arrastrando, setArrastrando] = useState(false);

  const arrastreDesde = useRef<{ x: number; y: number } | null>(null);
  const pinchInicial = useRef<{ distancia: number; escala: number } | null>(null);

  const soltar = () => {
    arrastreDesde.current = null;
    pinchInicial.current = null;
    setArrastrando(false);
  };

  // Escape cierra, y el body no scrollea detrás del visor mientras está abierto.
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", alTeclear);
    return () => {
      window.removeEventListener("keydown", alTeclear);
      document.body.style.overflow = overflowPrevio;
    };
  }, [onClose]);

  // Al volver a 1x la imagen se recentra: si no, queda desplazada fuera de vista y el
  // usuario no tiene forma de traerla de vuelta (a 1x el arrastre está deshabilitado).
  const aplicarEscala = (valor: number) => {
    const nueva = acotar(valor);
    setEscala(nueva);
    if (nueva === ESCALA_MIN) setOffset({ x: 0, y: 0 });
  };

  const ampliada = escala > ESCALA_MIN;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      className="fixed inset-0 z-50 flex items-center justify-center overscroll-contain bg-black/85 p-4"
      onClick={onClose}
      onWheel={(e) => aplicarEscala(escala - e.deltaY * 0.003)}
    >
      <div className="absolute top-4 right-4 flex gap-2" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => aplicarEscala(escala - PASO_BOTON)}
          disabled={escala <= ESCALA_MIN}
          aria-label="Alejar"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-30"
        >
          <ZoomOut className="h-5 w-5" />
        </button>
        <button
          onClick={() => aplicarEscala(escala + PASO_BOTON)}
          disabled={escala >= ESCALA_MAX}
          aria-label="Acercar"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-30"
        >
          <ZoomIn className="h-5 w-5" />
        </button>
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <img
        src={src}
        alt={alt}
        draggable={false}
        className="max-h-[90vh] max-w-full select-none rounded-xl object-contain"
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${escala})`,
          cursor: ampliada ? (arrastrando ? "grabbing" : "grab") : "zoom-in",
          transition: arrastrando ? "none" : "transform 120ms ease-out",
        }}
        // El click en la imagen no cierra (eso es tarea del fondo); el doble click alterna
        // entre 1x y 2x, que es el gesto que la gente prueba primero.
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={() => aplicarEscala(ampliada ? ESCALA_MIN : 2)}
        onMouseDown={(e) => {
          if (!ampliada) return;
          e.preventDefault();
          arrastreDesde.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
          setArrastrando(true);
        }}
        onMouseMove={(e) => {
          if (!arrastreDesde.current) return;
          setOffset({
            x: e.clientX - arrastreDesde.current.x,
            y: e.clientY - arrastreDesde.current.y,
          });
        }}
        onMouseUp={soltar}
        onMouseLeave={soltar}
        onTouchStart={(e) => {
          if (e.touches.length === 2) {
            pinchInicial.current = { distancia: distanciaEntre(e.touches), escala };
          } else if (e.touches.length === 1 && ampliada) {
            arrastreDesde.current = {
              x: e.touches[0].clientX - offset.x,
              y: e.touches[0].clientY - offset.y,
            };
            setArrastrando(true);
          }
        }}
        onTouchMove={(e) => {
          if (e.touches.length === 2 && pinchInicial.current) {
            const ratio = distanciaEntre(e.touches) / pinchInicial.current.distancia;
            aplicarEscala(pinchInicial.current.escala * ratio);
          } else if (e.touches.length === 1 && arrastreDesde.current) {
            setOffset({
              x: e.touches[0].clientX - arrastreDesde.current.x,
              y: e.touches[0].clientY - arrastreDesde.current.y,
            });
          }
        }}
        onTouchEnd={soltar}
      />
    </div>
  );
}

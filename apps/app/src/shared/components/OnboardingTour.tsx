import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { X } from 'lucide-react';
import {
  availableSteps,
  markTourSeen,
  shouldShowTour,
  type TourStep,
} from '@/shared/lib/onboarding';

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface Props {
  storageKey: string;
  steps: TourStep[];
  ready: boolean;
}

const POPOVER_WIDTH = 320;

export function OnboardingTour({ storageKey, steps, ready }: Props) {
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const [dontShow, setDontShow] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const [visible, setVisible] = useState<TourStep[]>([]);
  const startedRef = useRef(false);

  // Arranque: una sola vez por montaje, cuando ready y corresponde mostrar.
  useEffect(() => {
    if (!ready || startedRef.current) return;
    if (!shouldShowTour(storageKey, window.localStorage)) return;
    const avail = availableSteps(steps, document);
    if (avail.length === 0) return;
    startedRef.current = true;
    setVisible(avail);
    setIndex(0);
    setActive(true);
  }, [ready, steps, storageKey]);

  const measure = useCallback(() => {
    const step = visible[index];
    if (!step) return;
    const el = document.querySelector(step.selector);
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [visible, index]);

  // Scroll al ancla del paso actual, medir, y remedir en resize/scroll.
  useEffect(() => {
    if (!active) return;
    const step = visible[index];
    const el = step ? document.querySelector(step.selector) : null;
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const t = setTimeout(measure, 320);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [active, index, visible, measure]);

  const finish = useCallback(
    (seen: boolean) => {
      if (seen) markTourSeen(storageKey, window.localStorage);
      setActive(false);
    },
    [storageKey],
  );

  // Esc cierra (guarda solo si el checkbox está tildado).
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish(dontShow);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, dontShow, finish]);

  if (!active) return null;

  const isLast = index === visible.length - 1;
  const step = visible[index];

  const close = () => finish(dontShow);
  const next = () => (isLast ? finish(true) : setIndex((i) => i + 1));
  const prev = () => setIndex((i) => Math.max(0, i - 1));

  // Popover: debajo del ancla si está en la mitad superior; si no, arriba.
  // Para "arriba" usamos `bottom` y así no hace falta medir la altura del popover.
  let popoverStyle: CSSProperties;
  if (rect) {
    const center = rect.left + rect.width / 2;
    const left = Math.min(
      Math.max(center - POPOVER_WIDTH / 2, 12),
      window.innerWidth - POPOVER_WIDTH - 12,
    );
    const below = rect.top + rect.height < window.innerHeight * 0.6;
    // min 72px en el caso "below" para no quedar tapado por el header fijo (h-16 = 64px)
    // cuando el ancla está arriba de todo (ej. el toggle del proveedor en el header).
    popoverStyle = below
      ? { top: Math.max(rect.top + rect.height + 12, 72), left }
      : { bottom: window.innerHeight - rect.top + 12, left };
  } else {
    popoverStyle = {
      bottom: 24,
      left: Math.max((window.innerWidth - POPOVER_WIDTH) / 2, 12),
    };
  }

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true">
      <div className="absolute inset-0" onClick={close} />

      {rect && (
        <div
          className="pointer-events-none absolute rounded-xl ring-2 ring-brand-500 transition-all dark:ring-dark-brand"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)',
          }}
        />
      )}

      <div
        className="absolute w-80 max-w-[calc(100vw-24px)] rounded-2xl bg-white p-4 shadow-2xl dark:bg-dark-surface"
        style={popoverStyle}
      >
        <button
          type="button"
          onClick={close}
          aria-label="Cerrar"
          className="absolute right-3 top-3 cursor-pointer text-slate-400 transition hover:text-slate-600 dark:text-dark-text-secondary dark:hover:text-dark-text"
        >
          <X className="h-4 w-4" />
        </button>

        <h3 className="pr-6 text-base font-semibold text-slate-900 dark:text-dark-text">
          {step.title}
        </h3>
        <p className="mt-1 text-sm text-slate-500 dark:text-dark-text-secondary">
          {step.description}
        </p>

        <div className="mt-3 flex items-center justify-center gap-1.5">
          {visible.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === index
                  ? 'w-4 bg-brand-600 dark:bg-dark-brand'
                  : 'w-1.5 bg-slate-300 dark:bg-dark-border'
              }`}
            />
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={prev}
            disabled={index === 0}
            className="cursor-pointer rounded-full px-3 py-1.5 text-sm font-medium text-slate-500 transition hover:bg-slate-100 disabled:invisible dark:text-dark-text-secondary dark:hover:bg-dark-elevated"
          >
            Anterior
          </button>
          <button
            type="button"
            onClick={next}
            className="cursor-pointer rounded-full bg-brand-600 px-5 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-500 dark:bg-dark-brand dark:hover:bg-dark-brand-hover"
          >
            {isLast ? 'Listo' : 'Siguiente'}
          </button>
        </div>

        <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-slate-400 dark:text-dark-text-secondary">
          <input
            type="checkbox"
            checked={dontShow}
            onChange={(e) => setDontShow(e.target.checked)}
            className="h-3.5 w-3.5 cursor-pointer accent-brand-600 dark:accent-dark-brand"
          />
          No volver a mostrar
        </label>
      </div>
    </div>
  );
}

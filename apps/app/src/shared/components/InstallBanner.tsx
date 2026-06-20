import { useState } from "react";
import { createPortal } from "react-dom";
import { Download, X, Share, SquarePlus } from "lucide-react";
import { useInstallPWA } from "@/shared/hooks/useInstallPwa";
import icono from "@/assets/icono.png";

const DISMISS_KEY = "aliados-install-banner-dismissed";

// Política de "snooze": al cerrar el banner, no se vuelve a mostrar por 1 día.
const SNOOZE_MS = 24 * 60 * 60 * 1000; // 1 día

function isSnoozed(): boolean {
  const t = localStorage.getItem(DISMISS_KEY);
  if (!t) return false;
  return Date.now() - Number(t) < SNOOZE_MS;
}

function snooze(): void {
  localStorage.setItem(DISMISS_KEY, String(Date.now()));
}

export function InstallBanner() {
  const { isInstallable, isIOS, isStandalone, install } = useInstallPWA();
  const [hidden, setHidden] = useState(() => isSnoozed());
  const [iosHelp, setIosHelp] = useState(false);

  // No mostrar si: ya está instalada, el usuario lo cerró, o no hay forma de
  // instalar (ni prompt de Android ni iOS).
  if (isStandalone || hidden || (!isInstallable && !isIOS)) return null;

  const handleDismiss = () => {
    snooze();
    setHidden(true);
  };

  const handleInstall = () => {
    if (isInstallable) install();      // Android/Chrome: prompt nativo
    else setIosHelp(true);             // iOS: instrucciones manuales
  };

  return (
    <>
      {/* Banner — solo mobile (sm:hidden), fijo abajo para no tapar el header */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-40 px-3 pb-3 pt-2">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 dark:border-dark-border bg-white/95 dark:bg-dark-surface/95 backdrop-blur-xl px-4 py-3 shadow-lg">
          <img src={icono} alt="" className="h-9 w-9 shrink-0 rounded-xl" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900 dark:text-dark-text">Instalá Aliados</p>
            <p className="text-xs text-slate-500 dark:text-dark-text-secondary truncate">
              Accedé más rápido desde tu pantalla de inicio
            </p>
          </div>
          <button
            onClick={handleInstall}
            className="shrink-0 flex items-center gap-1.5 cursor-pointer rounded-full bg-brand-600 dark:bg-dark-brand px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-500 dark:hover:bg-dark-brand-hover"
          >
            <Download className="h-3.5 w-3.5" />
            Instalar
          </button>
          <button
            onClick={handleDismiss}
            aria-label="Cerrar"
            className="shrink-0 flex h-7 w-7 items-center justify-center rounded-full cursor-pointer text-slate-400 dark:text-dark-text-secondary transition hover:bg-slate-100 dark:hover:bg-dark-elevated"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Modal de instrucciones para iOS */}
      {iosHelp && createPortal(
        <div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setIosHelp(false)}
        >
          <div
            className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center gap-3">
              <img src={icono} alt="Aliados" className="h-10 w-10 rounded-xl" />
              <div className="flex-1">
                <h2 className="text-base font-bold text-slate-900 dark:text-dark-text">Instalar en tu iPhone</h2>
                <p className="text-xs text-slate-500 dark:text-dark-text-secondary">Seguí estos 2 pasos en Safari</p>
              </div>
              <button
                onClick={() => setIosHelp(false)}
                aria-label="Cerrar"
                className="flex h-8 w-8 items-center justify-center rounded-full cursor-pointer text-slate-400 dark:text-dark-text-secondary transition hover:bg-slate-100 dark:hover:bg-dark-elevated"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <ol className="space-y-3">
              <li className="flex items-center gap-3 rounded-xl bg-slate-50 dark:bg-dark-elevated p-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 dark:bg-dark-brand text-xs font-bold text-white">1</span>
                <p className="flex-1 text-sm text-slate-700 dark:text-dark-text">
                  Tocá el botón <span className="font-semibold">Compartir</span>
                </p>
                <Share className="h-5 w-5 shrink-0 text-brand-600 dark:text-dark-brand" />
              </li>
              <li className="flex items-center gap-3 rounded-xl bg-slate-50 dark:bg-dark-elevated p-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 dark:bg-dark-brand text-xs font-bold text-white">2</span>
                <p className="flex-1 text-sm text-slate-700 dark:text-dark-text">
                  Elegí <span className="font-semibold">Agregar a inicio</span>
                </p>
                <SquarePlus className="h-5 w-5 shrink-0 text-brand-600 dark:text-dark-brand" />
              </li>
            </ol>

            <button
              onClick={() => { snooze(); setIosHelp(false); setHidden(true); }}
              className="mt-5 w-full cursor-pointer rounded-xl bg-brand-600 dark:bg-dark-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500 dark:hover:bg-dark-brand-hover"
            >
              Entendido
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

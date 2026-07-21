import { useEffect, useState } from 'react';
import { tw } from '@/shared/styles/design-system';
import { applyAnalyticsConsent } from '../analytics/gtag';
import { shouldLoadAnalytics } from './consentStore';
import { useCookieConsent } from './useCookieConsent';
import { onOpenCookieSettings } from './cookieSettingsBus';
import { ROUTES } from '@/shared/constants/routes';

/**
 * Banner de consentimiento de cookies. Se monta una vez (en App) y queda montado siempre:
 * aunque esté oculto, corre el efecto que carga Google Analytics cuando hay consentimiento.
 *
 * Opt-in real: GA no se carga hasta que el usuario acepta. Sin decisión guardada, el banner
 * reaparece en cada carga.
 */
export function CookieConsentBanner() {
  const { decided, analyticsEnabled, acceptAll, rejectAll, save } = useCookieConsent();

  const [open, setOpen] = useState(!decided);
  const [view, setView] = useState<'banner' | 'config'>('banner');
  const [analyticsPref, setAnalyticsPref] = useState(false);

  // Aplica el consentimiento de analíticas de forma inmediata: carga GA al aceptar y lo
  // corta en caliente al revocar (sin recargar). Corre en cada carga con la decisión guardada.
  useEffect(() => {
    applyAnalyticsConsent(analyticsEnabled);
  }, [analyticsEnabled]);

  // Reapertura desde el Footer: mostramos directo la configuración, reflejando lo ya elegido.
  useEffect(() => {
    return onOpenCookieSettings(() => {
      setAnalyticsPref(shouldLoadAnalytics());
      setView('config');
      setOpen(true);
    });
  }, []);

  if (!open) return null;

  const abrirConfig = () => {
    setAnalyticsPref(analyticsEnabled);
    setView('config');
  };

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Consentimiento de cookies"
      className="fixed inset-x-0 bottom-0 z-[60] px-3 pb-3 sm:px-4 sm:pb-4"
    >
      <div className={`${tw.card} mx-auto max-w-2xl shadow-lg`}>
        {view === 'banner' ? (
          <div className="flex flex-col gap-3">
            <div>
              <p className={`text-sm font-semibold ${tw.text.primary}`}>🍪 Usamos cookies</p>
              <p className={`mt-1 text-sm ${tw.text.secondary}`}>
                Usamos cookies esenciales para que la app funcione y, con tu permiso, cookies
                analíticas para entender el uso de forma anónima. Podés elegir qué aceptar.{' '}
                <a
                  href={ROUTES.PRIVACY}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`font-semibold underline ${tw.text.brand}`}
                >
                  Política de Privacidad
                </a>
                .
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button type="button" className={tw.btn.secondary} onClick={abrirConfig}>
                Configuración
              </button>
              <button
                type="button"
                className={tw.btn.primary}
                onClick={() => {
                  acceptAll();
                  setOpen(false);
                }}
              >
                Aceptar todo
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className={`text-sm font-semibold ${tw.text.primary}`}>
              Configuración de cookies
            </p>

            <ConsentRow
              label="Esenciales"
              descripcion="Necesarias para iniciar sesión y usar la app. No se pueden desactivar."
              checked
              disabled
            />
            <ConsentRow
              label="Analíticas"
              descripcion="Google Analytics, de forma anónima. Nos ayuda a mejorar la app."
              checked={analyticsPref}
              onChange={() => setAnalyticsPref((v) => !v)}
            />

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className={tw.btn.outline}
                onClick={() => {
                  rejectAll();
                  setOpen(false);
                }}
              >
                Rechazar todo
              </button>
              <button
                type="button"
                className={tw.btn.primary}
                onClick={() => {
                  save({ analytics: analyticsPref });
                  setOpen(false);
                }}
              >
                Guardar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface ConsentRowProps {
  label: string;
  descripcion: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: () => void;
}

function ConsentRow({ label, descripcion, checked, disabled, onChange }: ConsentRowProps) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className={`text-sm font-medium ${tw.text.primary}`}>{label}</p>
        <p className={`text-xs ${tw.text.secondary}`}>{descripcion}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-label={label}
        aria-checked={checked}
        aria-disabled={disabled || undefined}
        onClick={disabled ? undefined : onChange}
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
          checked ? 'bg-brand-600 dark:bg-dark-brand' : 'bg-slate-300 dark:bg-dark-border-strong'
        } ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}

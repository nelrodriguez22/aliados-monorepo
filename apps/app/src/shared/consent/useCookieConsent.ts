import { useCallback, useState } from 'react';
import {
  writeConsent,
  hasDecision,
  shouldLoadAnalytics,
} from './consentStore';

/**
 * Fuente de verdad para React del consentimiento de cookies. Envuelve `consentStore`
 * (localStorage) y fuerza un re-render tras cada cambio para que los efectos que
 * dependen del consentimiento (cargar GA) reaccionen.
 */
export function useCookieConsent() {
  // Sólo se usa para re-leer localStorage tras escribir: no guardamos el estado en React
  // para no duplicar la fuente de verdad.
  const [, bump] = useState(0);
  const refresh = useCallback(() => bump((v) => v + 1), []);

  const acceptAll = useCallback(() => {
    writeConsent({ analytics: true });
    refresh();
  }, [refresh]);

  const rejectAll = useCallback(() => {
    writeConsent({ analytics: false });
    refresh();
  }, [refresh]);

  const save = useCallback(
    (prefs: { analytics: boolean }) => {
      writeConsent(prefs);
      refresh();
    },
    [refresh],
  );

  return {
    /** ¿El usuario ya decidió? Si no, hay que mostrar el banner. */
    decided: hasDecision(),
    /** ¿Analíticas consentidas? Gatilla la carga de GA. */
    analyticsEnabled: shouldLoadAnalytics(),
    acceptAll,
    rejectAll,
    save,
  };
}

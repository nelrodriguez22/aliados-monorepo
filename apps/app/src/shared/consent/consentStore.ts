// Estado de consentimiento de cookies — capa pura (sin React), única responsable de
// leer/escribir localStorage. Se aísla acá para poder testearla directo y para que la
// decisión "¿cargar Google Analytics?" tenga un solo dueño.
//
// Se usa localStorage y NO una cookie propia: así el estado no viaja en cada request
// (coherente con sentry.send-default-pii=false). La clave es versionada para poder
// re-preguntar si a futuro cambian las categorías, sin arrastrar decisiones viejas.

export const CONSENT_KEY = 'aliados_cookie_consent_v1';

export interface ConsentState {
  /** Analíticas (Google Analytics). Esenciales van siempre implícitas y no se guardan. */
  analytics: boolean;
  /** Momento de la decisión, para auditoría/depuración. */
  ts: number;
}

/**
 * Devuelve la decisión guardada, o null si no hay ninguna o el dato está corrupto.
 * Nunca lanza: un localStorage con basura se trata como "sin decisión".
 */
export function readConsent(): ConsentState | null {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.analytics !== 'boolean') return null;
    return { analytics: parsed.analytics, ts: typeof parsed.ts === 'number' ? parsed.ts : 0 };
  } catch {
    return null;
  }
}

/** Persiste la decisión sellando el momento. */
export function writeConsent(prefs: { analytics: boolean }): void {
  const state: ConsentState = { analytics: prefs.analytics, ts: Date.now() };
  localStorage.setItem(CONSENT_KEY, JSON.stringify(state));
}

/** Borra la decisión (vuelve a "sin decisión" → el banner reaparece). */
export function clearConsent(): void {
  localStorage.removeItem(CONSENT_KEY);
}

/** ¿El usuario ya eligió (aceptó o rechazó)? Si no, hay que mostrar el banner. */
export function hasDecision(): boolean {
  return readConsent() !== null;
}

/** ¿Se debe cargar Google Analytics? Solo con consentimiento explícito de analíticas. */
export function shouldLoadAnalytics(): boolean {
  return readConsent()?.analytics === true;
}

// Canal mínimo para reabrir el panel de configuración de cookies desde cualquier parte
// (ej. el link "Cookies" del Footer) sin acoplar esos componentes al estado del banner ni
// meter esto en un store global. Se apoya en un CustomEvent de window.

const OPEN_EVENT = 'aliados:open-cookie-settings';

/** Reabre el panel de configuración de cookies. */
export function openCookieSettings(): void {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT));
}

/** Suscribe al pedido de reapertura. Devuelve la función para desuscribirse. */
export function onOpenCookieSettings(handler: () => void): () => void {
  window.addEventListener(OPEN_EVENT, handler);
  return () => window.removeEventListener(OPEN_EVENT, handler);
}

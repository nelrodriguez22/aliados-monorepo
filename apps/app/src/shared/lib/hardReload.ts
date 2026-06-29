/**
 * Limpia el SW + todas las cachés y recarga. Garantiza bajar el bundle nuevo sin
 * depender de que haya un SW "waiting": `updateServiceWorker(true)` no recarga si en
 * ese momento no hay un worker en espera (falla en silencio). Esto siempre funciona.
 */
export async function hardReload(): Promise<void> {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    // best-effort
  } finally {
    location.reload();
  }
}

/// <reference types="vite-plugin-pwa/react" />
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { hardReload } from '@/shared/lib/hardReload';

// Cada cuánto una pestaña ya abierta re-chequea si hay un deploy nuevo.
const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;

// Si el SW en espera no toma el control en este plazo, se cae a la opción nuclear.
const RESCATE_MS = 4000;

interface PWAUpdateContextValue {
  /** true cuando hay un SW nuevo en espera → se muestra el banner "Recargar". */
  needRefresh: boolean;
  /** true entre el click y la recarga: el banner lo usa para dar feedback. */
  actualizando: boolean;
  /** Activa el SW nuevo y recarga a la versión nueva. */
  reload: () => void;
}

const PWAUpdateContext = createContext<PWAUpdateContextValue>({
  needRefresh: false,
  actualizando: false,
  reload: () => {},
});

/**
 * Registra el SW (registerType: 'prompt') una sola vez y expone el estado de
 * actualización. El aviso visual lo pinta <PWAUpdateBanner/> dentro del layout
 * (mismo lugar que el banner de mantenimiento). Además chequea updates al volver
 * el foco (visibilitychange + window.focus) y cada 5 min, para que las pestañas
 * abiertas mucho tiempo detecten deploys sin depender de una recarga completa.
 */
export function PWAUpdateProvider({ children }: { children: ReactNode }) {
  const [actualizando, setActualizando] = useState(false);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      const check = () => registration.update().catch(() => {});
      setInterval(check, UPDATE_CHECK_INTERVAL_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
      window.addEventListener('focus', check);
    },
  });

  /**
   * El banner sólo aparece cuando hay un SW en espera, y ese SW YA tiene el bundle nuevo
   * precacheado: activarlo (skipWaiting) y recargar cuando toma el control es prácticamente
   * instantáneo. Antes se llamaba directo a hardReload(), que desregistra el SW y borra todas
   * las cachés — o sea que tiraba justo el bundle que acababa de descargar y obligaba a bajar
   * la app entera de nuevo.
   *
   * hardReload queda como RESCATE, no como camino principal: si el worker en espera no toma el
   * control (o no había ninguno, que es el caso que el código viejo temía), a los pocos
   * segundos se recurre a la opción nuclear. Sin ese rescate, updateServiceWorker(true) puede
   * no recargar nunca y el usuario se queda mirando un botón que no hace nada.
   */
  const reload = useCallback(() => {
    setActualizando(true);

    const rescate = window.setTimeout(() => { void hardReload(); }, RESCATE_MS);

    void updateServiceWorker(true).catch(() => {
      window.clearTimeout(rescate);
      void hardReload();
    });
  }, [updateServiceWorker]);

  return (
    <PWAUpdateContext.Provider value={{ needRefresh, actualizando, reload }}>
      {children}
    </PWAUpdateContext.Provider>
  );
}

export function usePWAUpdate(): PWAUpdateContextValue {
  return useContext(PWAUpdateContext);
}

/// <reference types="vite-plugin-pwa/react" />
import { createContext, useContext, type ReactNode } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

// Cada cuánto una pestaña ya abierta re-chequea si hay un deploy nuevo.
const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;

interface PWAUpdateContextValue {
  /** true cuando hay un SW nuevo en espera → se muestra el banner "Recargar". */
  needRefresh: boolean;
  /** Activa el SW nuevo y recarga a la versión nueva. */
  reload: () => void;
}

const PWAUpdateContext = createContext<PWAUpdateContextValue>({
  needRefresh: false,
  reload: () => {},
});

/**
 * Registra el SW (registerType: 'prompt') una sola vez y expone el estado de
 * actualización. El aviso visual lo pinta <PWAUpdateBanner/> dentro del layout
 * (mismo lugar que el banner de mantenimiento). Además chequea updates al volver
 * el foco y cada 30 min, para que las pestañas abiertas mucho tiempo detecten
 * deploys sin depender de una recarga completa.
 */
export function PWAUpdateProvider({ children }: { children: ReactNode }) {
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
    },
  });

  return (
    <PWAUpdateContext.Provider value={{ needRefresh, reload: () => updateServiceWorker(true) }}>
      {children}
    </PWAUpdateContext.Provider>
  );
}

export function usePWAUpdate(): PWAUpdateContextValue {
  return useContext(PWAUpdateContext);
}

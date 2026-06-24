import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { trackPageView } from './gtag';

/**
 * Dispara un page_view de GA en cada cambio de ruta (incluida la carga inicial).
 * Debe usarse dentro de <BrowserRouter>. No-op fuera de producción.
 */
export function useAnalytics(): void {
  const location = useLocation();

  useEffect(() => {
    trackPageView(location.pathname + location.search);
  }, [location.pathname, location.search]);
}

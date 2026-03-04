import { useEffect } from 'react';
import { useStore } from '@/shared/store/useStore';

/**
 * Sincroniza la clase `dark` en <html> con el theme del store de Zustand.
 * También respeta la preferencia del sistema operativo si no hay preferencia guardada.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useStore((state) => state.theme);
  const setTheme = useStore((state) => state.setTheme);

  // Detectar preferencia del sistema en el primer render
  useEffect(() => {
    const stored = useStore.getState().theme;
    if (!stored) {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setTheme(prefersDark ? 'dark' : 'light');
    }
  }, [setTheme]);

  // Sincronizar la clase en <html>
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  return <>{children}</>;
}

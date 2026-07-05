import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Store } from '@/shared/types/interfaces';
import { setSentryUser, clearSentryUser } from '@/shared/lib/sentry';

export const useStore = create<Store>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      theme: 'light',

      login: (user) => {
        set({ user, isAuthenticated: true });
        setSentryUser(user);
      },

      logout: () => {
        set({ user: null, isAuthenticated: false });
        localStorage.removeItem('aliados-storage');
        sessionStorage.removeItem('auto-online-hecho');
        clearSentryUser();
        // Borra cualquier cache de API por-usuario al cerrar sesión, para que el
        // próximo usuario en el mismo dispositivo no pueda ver datos del anterior.
        if (typeof caches !== 'undefined') {
          caches.delete('api-cache').catch(() => {});
        }
      },

      setTheme: (theme) => {
        set({ theme });
        // Guardar sin encriptar para que index.html pueda leerlo antes de React
        localStorage.setItem('aliados-theme', theme);
      },

      updateUserStatus: (status: 'ONLINE' | 'OFFLINE' | 'BUSY') =>
        set((state) => ({
          user: state.user ? { ...state.user, status } : null,
        })),
    }),
    {
      name: 'aliados-storage',
      storage: createJSONStorage(() => localStorage),
      // SEC-5: NO persistimos `user` (PII: nombre, email, rol) en localStorage. La sesión
      // la sostiene Firebase Auth (IndexedDB) y el perfil se rehidrata del backend vía
      // useProfile en cada carga (que llama login()). Solo persistimos flags no sensibles:
      // isAuthenticated (para el gate de limpieza del AuthProvider) y theme (UX).
      // Antes se "cifraba" con AES usando una clave embebida en el bundle: seguridad
      // decorativa (la clave viajaba con el dato). Se eliminó por engañosa.
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        theme: state.theme,
      }),
    }
  )
);

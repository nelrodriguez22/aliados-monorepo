import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AES from 'crypto-js/aes';
import encUtf8 from 'crypto-js/enc-utf8';
import type { Store } from '@/shared/types/interfaces';
import { setSentryUser, clearSentryUser } from '@/shared/lib/sentry';

const ENCRYPTION_KEY = import.meta.env.VITE_STORAGE_KEY || 'aliados-key';

const encryptedStorage = {
  getItem: (name: string) => {
    const value = localStorage.getItem(name);
    if (!value) return null;
    try {
      const bytes = AES.decrypt(value, ENCRYPTION_KEY);
      return bytes.toString(encUtf8);
    } catch {
      return null;
    }
  },
  setItem: (name: string, value: string) => {
    const encrypted = AES.encrypt(value, ENCRYPTION_KEY).toString();
    localStorage.setItem(name, encrypted);
  },
  removeItem: (name: string) => {
    localStorage.removeItem(name);
  },
};

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
      storage: createJSONStorage(() => encryptedStorage),
      partialize: (state) => ({
        user: state.user ? { ...state.user, status: 'OFFLINE' as const } : null,
        isAuthenticated: state.isAuthenticated,
        theme: state.theme,
      }),
      // Tras un reload el user se rehidrata sin pasar por login(): re-seteamos el
      // contexto de Sentry para que los errores post-reload tengan id + rol.
      onRehydrateStorage: () => (state) => {
        if (state?.user) setSentryUser(state.user);
      },
    }
  )
);

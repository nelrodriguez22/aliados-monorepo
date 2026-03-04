import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import CryptoJS from 'crypto-js';
import type { Store } from '@/shared/types/interfaces';

const ENCRYPTION_KEY = import.meta.env.VITE_STORAGE_KEY || 'aliados-key';

const encryptedStorage = {
  getItem: (name: string) => {
    const value = localStorage.getItem(name);
    if (!value) return null;
    try {
      const bytes = CryptoJS.AES.decrypt(value, ENCRYPTION_KEY);
      return bytes.toString(CryptoJS.enc.Utf8);
    } catch {
      return null;
    }
  },
  setItem: (name: string, value: string) => {
    const encrypted = CryptoJS.AES.encrypt(value, ENCRYPTION_KEY).toString();
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

      login: (user) => set({ user, isAuthenticated: true }),

      logout: () => {
        set({ user: null, isAuthenticated: false });
        localStorage.removeItem('aliados-storage');
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
    }
  )
);

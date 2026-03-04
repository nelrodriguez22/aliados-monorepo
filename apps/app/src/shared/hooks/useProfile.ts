import { useQuery } from '@tanstack/react-query';
import { type User as FirebaseUser, signOut } from 'firebase/auth';
import { auth } from '@/shared/lib/firebase';
import { useStore } from '@/shared/store/useStore';
import type { User } from '@/shared/types/interfaces';

const API_URL = import.meta.env.VITE_API_URL;

/**
 * Capa 2: Carga el perfil del backend cuando hay firebaseUser con email verificado.
 *
 * - enabled: solo corre cuando hay firebaseUser con email verificado
 * - queryKey incluye uid: cuando el user cambia, React Query re-ejecuta
 * - Sincroniza el store con los datos reales del backend
 * - Si el backend devuelve 401/403, hace signOut + logout del store
 */
export function useProfile(firebaseUser: FirebaseUser | null) {
  const login = useStore((s) => s.login);
  const logout = useStore((s) => s.logout);

  const uid = firebaseUser?.uid ?? null;
  const emailVerified = firebaseUser?.emailVerified ?? false;

  const query = useQuery<User>({
    // uid en la key → nueva query cuando cambia el usuario
    queryKey: ['auth-profile', uid],

    queryFn: async (): Promise<User> => {
      if (!firebaseUser) throw new Error('No firebase user');

      const token = await firebaseUser.getIdToken();
      const response = await fetch(`${API_URL}/api/users/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 401 || response.status === 403) {
        await signOut(auth);
        logout();
        throw new Error('Unauthorized');
      }

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const data = await response.json();

      const user: User = {
        uid: firebaseUser.uid,
        name: data.nombre,
        email: data.email,
        role: data.role,
        status: data.status || 'OFFLINE',
        telefono: data.telefono ?? null,
        fotoPerfil: data.fotoPerfil ?? null,
        localidad: data.localidad ?? null,
        oficio: data.oficio ?? null,
        promedioCalificacion: data.promedioCalificacion ?? 0,
        cantidadCalificaciones: data.cantidadCalificaciones ?? 0,
        totalTrabajosCompletados: data.totalTrabajosCompletados ?? 0,
      };

      // Sincronizar store con la verdad del backend
      login(user);

      return user;
    },

    // Solo ejecutar si hay firebaseUser con email verificado
    enabled: !!firebaseUser && emailVerified,

    staleTime: 1000 * 60 * 5, // 5 minutos
    refetchOnWindowFocus: false,

    // Reintentar solo en errores de red, no en 401/403
    retry: (failureCount, error) => {
      if (error.message === 'Unauthorized') return false;
      return failureCount < 2;
    },
  });

  return query;
}

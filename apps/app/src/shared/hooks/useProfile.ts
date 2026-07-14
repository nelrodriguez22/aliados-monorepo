import { useQuery } from '@tanstack/react-query';
import { type User as FirebaseUser, signOut } from 'firebase/auth';
import { auth } from '@/shared/lib/firebase';
import { useStore } from '@/shared/store/useStore';
import type { User } from '@/shared/types/interfaces';
import { fetchProfile, ProfileError } from '@/shared/lib/fetchProfile';

const API_URL = import.meta.env.VITE_API_URL;
const PROFILE_TIMEOUT_MS = 5000;

/**
 * Capa 2: Carga el perfil del backend cuando hay firebaseUser con email verificado.
 * - enabled: solo corre con firebaseUser + email verificado
 * - 401/403 → signOut + logout; 404 → not-registered (onboarding); timeout/server → recuperable
 * - 1 reintento para errores recuperables (peor caso ~10s a la pantalla de fallo)
 */
export function useProfile(firebaseUser: FirebaseUser | null) {
  const login = useStore((s) => s.login);
  const logout = useStore((s) => s.logout);

  const uid = firebaseUser?.uid ?? null;
  const emailVerified = firebaseUser?.emailVerified ?? false;

  const query = useQuery<User>({
    queryKey: ['auth-profile', uid],

    queryFn: async (): Promise<User> => {
      if (!firebaseUser) throw new Error('No firebase user');

      const token = await firebaseUser.getIdToken();

      let data: any;
      try {
        data = await fetchProfile(API_URL, token, PROFILE_TIMEOUT_MS);
      } catch (err) {
        // 401/403 → la sesión ya no vale: cerramos en Firebase y en el store.
        if (err instanceof ProfileError && err.kind === 'unauthorized') {
          await signOut(auth);
          logout();
        }
        throw err;
      }

      const user: User = {
        uid: firebaseUser.uid,
        id: data.id,
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
        codigo: data.codigo ?? null,
      };

      // Sincronizar store con la verdad del backend
      login(user);

      return user;
    },

    enabled: !!firebaseUser && emailVerified,
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,

    // No reintentar unauthorized (401/403) ni not-registered (404).
    // Recuperables (timeout/server): 1 reintento → 2 intentos en total.
    retry: (failureCount, error) => {
      if (
        error instanceof ProfileError &&
        (error.kind === 'unauthorized' || error.kind === 'not-registered')
      ) {
        return false;
      }
      return failureCount < 1;
    },
  });

  const isNewUser =
    query.error instanceof ProfileError && query.error.kind === 'not-registered';

  return { ...query, isNewUser };
}

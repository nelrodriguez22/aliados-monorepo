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

      // El refresh del token puede fallar (red, refresh-token en tránsito). No es motivo
      // para desloguear: lo tratamos como recuperable (server) → AuthErrorScreen con reintento.
      const getToken = async (forceRefresh = false): Promise<string> => {
        try {
          return await firebaseUser.getIdToken(forceRefresh);
        } catch {
          throw new ProfileError('server', 'No se pudo refrescar el token');
        }
      };

      let data: any;
      try {
        data = await fetchProfile(API_URL, await getToken(), PROFILE_TIMEOUT_MS);
      } catch (err) {
        // Un 401 puede ser un token cacheado viejo o un rechazo transitorio del backend
        // (ej. cold start). Antes de dar la sesión por inválida, forzamos un token fresco y
        // reintentamos UNA vez. Solo si el token fresco TAMBIÉN es rechazado, cerramos sesión.
        if (err instanceof ProfileError && err.kind === 'unauthorized') {
          try {
            data = await fetchProfile(API_URL, await getToken(true), PROFILE_TIMEOUT_MS);
          } catch (retryErr) {
            if (retryErr instanceof ProfileError && retryErr.kind === 'unauthorized') {
              // Token fresco también rechazado → la sesión ya no vale: cerramos en Firebase y store.
              await signOut(auth);
              logout();
            }
            throw retryErr;
          }
        } else {
          throw err;
        }
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

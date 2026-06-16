import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/apiClient';

/**
 * Detalle de un trabajo por id.
 *
 * Key canónica ['trabajo', id] → la misma que invalida el WebSocket, así que
 * todos los consumidores comparten cache y se refrescan ante eventos push.
 * Acepta overrides de opciones (staleTime, refetchOnMount, etc.) por sitio.
 */
export function useTrabajo<T = any>(
  id: string | undefined,
  options?: Omit<UseQueryOptions<T>, 'queryKey' | 'queryFn'>,
) {
  return useQuery<T>({
    queryKey: ['trabajo', id],
    queryFn: () => apiClient.get<T>(`/api/trabajos/${id}`),
    enabled: !!id,
    ...options,
  });
}

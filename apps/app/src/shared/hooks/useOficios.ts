import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/apiClient';
import type { Oficio } from '@/shared/types/interfaces';

/**
 * Lista de oficios (catálogo casi estático, endpoint público sin auth).
 *
 * Key canónica ['oficios'] → React Query deduplica entre todos los
 * consumidores. staleTime largo porque cambia muy rara vez.
 */
export function useOficios(
  options?: Omit<UseQueryOptions<Oficio[]>, 'queryKey' | 'queryFn'>,
) {
  return useQuery<Oficio[]>({
    queryKey: ['oficios'],
    queryFn: () => apiClient.get<Oficio[]>('/api/oficios', false),
    staleTime: 1000 * 60 * 60, // 1h
    ...options,
  });
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/apiClient';
import toast from 'react-hot-toast';

export interface Favorito {
  proveedorId: number;
  nombre: string;
  oficioId: number | null;
  oficioNombre: string | null;
  promedioCalificacion: number;
  cantidadCalificaciones: number;
  disponibilidad: 'ONLINE' | 'BUSY' | 'OFFLINE';
  codigoProveedor: string | null;
}

export function useFavoritos() {
  const qc = useQueryClient();
  const { data: favoritos = [], isLoading } = useQuery<Favorito[]>({
    queryKey: ['favoritos'],
    queryFn: () => apiClient.get('/api/favoritos'),
  });

  const esFavorito = (proveedorId: number) =>
    favoritos.some((f) => f.proveedorId === proveedorId);

  const toggle = useMutation({
    mutationFn: async ({ proveedorId, yaEs }: { proveedorId: number; yaEs: boolean }) => {
      if (yaEs) return apiClient.delete(`/api/favoritos/${proveedorId}`);
      return apiClient.post('/api/favoritos', { proveedorId });
    },
    onSuccess: (_data, { yaEs }) => {
      qc.invalidateQueries({ queryKey: ['favoritos'] });
      toast.success(yaEs ? 'Quitado de favoritos' : 'Agregado a favoritos');
    },
    onError: (e: Error) => toast.error(e.message || 'No se pudo actualizar favoritos'),
  });

  return { favoritos, isLoading, esFavorito, toggle };
}

import { getToken } from "@/shared/lib/getToken";

const API_URL = import.meta.env.VITE_API_URL;

export const TrabajoService = {
  async rechazarTrabajo(trabajoId: string) {
    const token = await getToken();
    const res = await fetch(`${API_URL}/api/trabajos/${trabajoId}/rechazar`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Error al rechazar el trabajo');
    return res.json();
  },

  async completarTrabajo(trabajoId: string) {
    const token = await getToken();
    const res = await fetch(`${API_URL}/api/trabajos/${trabajoId}/completar`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Error al completar el trabajo');
    return res.json();
  },
};

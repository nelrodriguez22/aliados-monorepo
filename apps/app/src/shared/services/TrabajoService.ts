import { apiClient } from "@/shared/lib/apiClient";

export const TrabajoService = {
  rechazarTrabajo: (trabajoId: string) =>
    apiClient.patch(`/api/trabajos/${trabajoId}/rechazar`),

  completarTrabajo: (trabajoId: string) =>
    apiClient.patch(`/api/trabajos/${trabajoId}/completar`),
};

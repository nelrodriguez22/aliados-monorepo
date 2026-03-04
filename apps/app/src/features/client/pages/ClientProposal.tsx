import { useParams, useNavigate } from "react-router-dom";
import { Card } from "@/shared/components/ui/Card";
import { Button } from "@/shared/components/ui/Button";
import { Badge } from "@/shared/components/ui/Badge";
import { tw } from "@/shared/styles/design-system";
import { ROUTES } from "@/shared/constants/routes";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getToken } from "@/shared/lib/getToken";
import { Clock, DollarSign, MapPin, Briefcase, Star, Loader2, Info } from "lucide-react";
import toast from "react-hot-toast";

export function ClientProposal() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate    = useNavigate();
  const queryClient = useQueryClient();

  const { data: trabajo, isLoading } = useQuery({
    queryKey: ['trabajo', jobId],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/trabajos/${jobId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Error al cargar trabajo');
      return res.json();
    },
    staleTime: 0,
    gcTime: 0,
  });

  const aceptarMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/trabajos/${jobId}/aceptar-propuesta`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['trabajos-cliente'] });
      toast.success('Propuesta aceptada. El profesional está en camino.');
      navigate(ROUTES.CLIENT.TRACKING(data.id));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rechazarMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/trabajos/${jobId}/rechazar-propuesta`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trabajos-cliente'] });
      toast.success('Propuesta rechazada. Buscando otro profesional...');
      navigate(ROUTES.CLIENT.DASHBOARD);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const formatTiempo = (minutos: number) => {
    if (minutos < 60) return `${minutos} min`;
    const h = Math.floor(minutos / 60);
    const m = minutos % 60;
    return m === 0 ? `${h}h` : `${h}h ${m}min`;
  };

  if (isLoading) {
    return (
      <div className={`flex h-64 items-center justify-center ${tw.pageBg}`}>
        <Loader2 className="h-7 w-7 animate-spin text-brand-600 dark:text-dark-brand" />
      </div>
    );
  }

  if (!trabajo) {
    return <div className={tw.container}><p className={`text-center ${tw.text.secondary}`}>Trabajo no encontrado</p></div>;
  }

  // Estado inválido
  if (trabajo.estado !== 'PROPUESTO') {
    return (
      <div className={tw.pageBg}>
        <div className={tw.container}>
          <div className="mx-auto max-w-sm">
            <Card>
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tw.iconBg.slate}`}>
                  <Info className={`h-5 w-5 ${tw.text.faint}`} />
                </div>
                <div>
                  <h3 className={`text-sm font-semibold ${tw.text.primary}`}>
                    Esta propuesta ya no está disponible
                  </h3>
                  <p className={`text-xs mt-0.5 ${tw.text.secondary}`}>
                    El estado del trabajo cambió
                  </p>
                </div>
                <Button onClick={() => navigate(ROUTES.CLIENT.DASHBOARD)}>
                  Volver al Dashboard
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  const initials = (name: string) =>
    name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className={tw.pageBg}>
      <div className={tw.container}>
        <div className="mx-auto max-w-md">

          {/* Header */}
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className={`text-2xl font-bold ${tw.text.primary}`}>Propuesta recibida</h1>
              <div className="mt-1.5">
                <Badge variant="info">Pendiente de respuesta</Badge>
              </div>
            </div>
            <Button variant="outline" onClick={() => navigate(ROUTES.CLIENT.DASHBOARD)}>← Volver</Button>
          </div>

          <div className="space-y-3">

            {/* Servicio */}
            <Card>
              <h3 className={`mb-3 text-xs font-semibold uppercase tracking-wider ${tw.text.muted}`}>
                Tu solicitud
              </h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tw.iconBg.slate}`}>
                    <Briefcase className={`h-4 w-4 ${tw.text.faint}`} />
                  </div>
                  <span className={`text-sm ${tw.text.primary}`}>{trabajo.oficio.nombre}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tw.iconBg.green} text-green-600 dark:text-green-400`}>
                    <MapPin className="h-4 w-4" />
                  </div>
                  <span className={`text-sm ${tw.text.secondary}`}>{trabajo.direccion}</span>
                </div>
              </div>
            </Card>

            {/* Profesional */}
            <Card>
              <h3 className={`mb-3 text-xs font-semibold uppercase tracking-wider ${tw.text.muted}`}>
                Profesional asignado
              </h3>
              <div className="flex items-center gap-3">
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tw.iconBg.brand} text-brand-600 dark:text-dark-brand font-semibold`}>
                  {trabajo.proveedorNombre ? initials(trabajo.proveedorNombre) : '?'}
                </div>
                <div>
                  <p className={`text-sm font-semibold ${tw.text.primary}`}>{trabajo.proveedorNombre}</p>
                  {trabajo.proveedorPromedioCalificacion > 0 && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
                      <span className={`text-xs font-medium ${tw.text.secondary}`}>
                        {trabajo.proveedorPromedioCalificacion.toFixed(1)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </Card>

            {/* Tiempo + tarifa */}
            <div className="grid grid-cols-2 gap-3">
              <Card>
                <div className="flex items-center gap-3">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tw.iconBg.brand} text-brand-600 dark:text-dark-brand`}>
                    <Clock className="h-4 w-4" />
                  </div>
                  <div>
                    <p className={`text-xs ${tw.text.muted}`}>Llega en</p>
                    <p className={`text-base font-bold ${tw.text.primary}`}>
                      {formatTiempo(trabajo.tiempoEstimadoMinutos)}
                    </p>
                  </div>
                </div>
              </Card>
              <Card>
                <div className="flex items-center gap-3">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tw.iconBg.green} text-green-600 dark:text-green-400`}>
                    <DollarSign className="h-4 w-4" />
                  </div>
                  <div>
                    <p className={`text-xs ${tw.text.muted}`}>Tarifa visita</p>
                    <p className={`text-base font-bold ${tw.text.primary}`}>
                      ${trabajo.tarifaVisita?.toLocaleString('es-AR') || '15.000'}
                    </p>
                  </div>
                </div>
              </Card>
            </div>

            {/* Acciones */}
            <div className="space-y-2 pt-1">
              <Button
                variant="success" fullWidth
                onClick={() => aceptarMutation.mutate()}
                disabled={aceptarMutation.isPending}
              >
                {aceptarMutation.isPending ? 'Aceptando...' : 'Aceptar propuesta'}
              </Button>
              <Button
                variant="error" fullWidth
                onClick={() => rechazarMutation.mutate()}
                disabled={rechazarMutation.isPending}
              >
                {rechazarMutation.isPending ? 'Rechazando...' : 'Rechazar y buscar otro'}
              </Button>
            </div>

            <p className={`text-center text-xs ${tw.text.muted}`}>
              Al aceptar, el profesional comenzará a dirigirse a tu ubicación.
            </p>

          </div>
        </div>
      </div>
    </div>
  );
}

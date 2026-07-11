import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card } from "@/shared/components/ui/Card";
import { Button } from "@/shared/components/ui/Button";
import { Badge } from "@/shared/components/ui/Badge";
import { ServicioIdBadge } from "@/shared/components/ServicioIdBadge";
import { tw } from "@/shared/styles/design-system";
import { ROUTES } from "@/shared/constants/routes";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTrabajo } from "@/shared/hooks/useTrabajo";
import { apiClient } from "@/shared/lib/apiClient";
import { Clock, DollarSign, MapPin, Briefcase, Star, Loader2 } from "lucide-react";
import toast from "react-hot-toast";

export function ClientProposal() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate    = useNavigate();
  const queryClient = useQueryClient();

  const { data: trabajo, isLoading } = useTrabajo(jobId, {
    staleTime: 0,
    gcTime: 0,
  });

  const aceptarMutation = useMutation({
    mutationFn: () => apiClient.patch(`/api/trabajos/${jobId}/aceptar-propuesta`),
    onSuccess: (data) => {
      // Sembramos el detalle del trabajo (key compartida ['trabajo', id]) con la
      // respuesta —ya en EN_CURSO/EN_COLA— para que JobTracking NO lea el cache
      // stale en 'PROPUESTO' y rebote de vuelta a /propuesta (su useEffect redirige
      // a PROPOSAL si estado === 'PROPUESTO'). Sin esto, aceptar mostraba el cartel
      // "Esta propuesta ya no está disponible".
      queryClient.setQueryData(['trabajo', jobId], data);
      queryClient.invalidateQueries({ queryKey: ['trabajos-cliente'] });
      toast.success('Propuesta aceptada. El profesional está en camino.');
      // replace: saca la propuesta consumida del historial → apretar "atrás" desde
      // el seguimiento no vuelve a esta página.
      navigate(ROUTES.CLIENT.TRACKING(jobId), { replace: true });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rechazarMutation = useMutation({
    mutationFn: () => apiClient.patch(`/api/trabajos/${jobId}/rechazar-propuesta`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trabajos-cliente'] });
      toast.success('Propuesta rechazada. Buscando otro profesional...');
      navigate(ROUTES.CLIENT.DASHBOARD);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Si el trabajo ya no está en PROPUESTO (tras aceptar y apretar "atrás", una
  // notificación vieja o un link directo), redirigimos al lugar correcto en vez de
  // mostrar un cartel muerto — mismo criterio que JobTracking.
  useEffect(() => {
    if (!trabajo || trabajo.estado === 'PROPUESTO') return;
    if (trabajo.estado === 'COMPLETADO') {
      navigate(ROUTES.CLIENT.COMPLETED(trabajo.id), { replace: true });
    } else if (trabajo.estado === 'CANCELADO') {
      navigate(ROUTES.CLIENT.DASHBOARD, { replace: true });
    } else {
      // EN_CURSO / EN_COLA / PENDIENTE → seguimiento
      navigate(ROUTES.CLIENT.TRACKING(trabajo.id), { replace: true });
    }
  }, [trabajo?.estado]);

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

  // Estado ya no PROPUESTO: el useEffect de arriba redirige al lugar correcto;
  // mientras tanto mostramos un loader (sin cartel muerto).
  if (trabajo.estado !== 'PROPUESTO') {
    return (
      <div className={`flex h-64 items-center justify-center ${tw.pageBg}`}>
        <Loader2 className="h-7 w-7 animate-spin text-brand-600 dark:text-dark-brand" />
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
          <div className="mb-6 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-2">
                <h1 className={`text-xl min-[375px]:text-2xl font-bold ${tw.text.primary}`}>Propuesta recibida</h1>
                <ServicioIdBadge tipo="TRABAJO" id={trabajo.id} />
              </div>
              <div className="mt-1.5">
                <Badge variant="info">Pendiente de respuesta</Badge>
              </div>
            </div>
            <Button variant="outline" onClick={() => navigate(ROUTES.CLIENT.DASHBOARD)} className="shrink-0 text-xs min-[375px]:text-sm px-3 min-[375px]:px-4 py-1.5 min-[375px]:py-2">
              ← Volver
            </Button>
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

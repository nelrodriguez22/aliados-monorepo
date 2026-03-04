import { useParams, useNavigate } from "react-router-dom";
import { Card } from "@/shared/components/ui/Card";
import { Button } from "@/shared/components/ui/Button";
import { tw } from "@/shared/styles/design-system";
import { ROUTES } from "@/shared/constants/routes";
import { useQuery } from "@tanstack/react-query";
import { getToken } from "@/shared/lib/getToken";
import { Loader2, CheckCircle, Clock, Star } from "lucide-react";
import { formatDateTime } from "@/shared/lib/dayjs";

export function ProviderCompletedJob() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate  = useNavigate();

  const { data: trabajo, isLoading: loadingTrabajo } = useQuery({
    queryKey: ['trabajo', jobId],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/trabajos/${jobId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error();
      return res.json();
    },
  });

  const { data: calificacion, isLoading: loadingCal } = useQuery({
    queryKey: ['calificacion-detalle', jobId],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/api/calificaciones/trabajo/${jobId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!trabajo && trabajo.calificado,
  });

  if (loadingTrabajo || (trabajo?.calificado && loadingCal)) {
    return (
      <div className={`flex h-screen items-center justify-center ${tw.pageBg}`}>
        <Loader2 className="h-7 w-7 animate-spin text-brand-600 dark:text-dark-brand" />
      </div>
    );
  }
  if (!trabajo) {
    return <div className={tw.container}><p className={`text-center ${tw.text.secondary}`}>Trabajo no encontrado</p></div>;
  }

  const rows: { label: string; value: string }[] = [
    { label: 'Servicio',    value: trabajo.oficio.nombre },
    { label: 'Cliente',     value: trabajo.clienteNombre },
    { label: 'Dirección',   value: trabajo.direccion },
    { label: 'Descripción', value: trabajo.descripcion },
    { label: 'Creado',      value: trabajo.createdAt  ? formatDateTime(trabajo.createdAt)  : '—' },
    { label: 'Aceptado',    value: trabajo.acceptedAt ? formatDateTime(trabajo.acceptedAt) : '—' },
    { label: 'Completado',  value: trabajo.completedAt ? formatDateTime(trabajo.completedAt) : '—' },
  ];

  return (
    <div className={tw.pageBg}>
      <div className={tw.container}>
        <div className="mx-auto max-w-2xl">

          <div className="mb-6 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className={`text-xl min-[375px]:text-2xl font-bold ${tw.text.primary}`}>Trabajo completado</h1>
              {trabajo.completedAt && (
                <p className={`mt-0.5 text-sm ${tw.text.secondary}`}>{formatDateTime(trabajo.completedAt)}</p>
              )}
            </div>
            <Button variant="outline" onClick={() => navigate(ROUTES.PROVIDER.DASHBOARD)} className="shrink-0 text-xs min-[375px]:text-sm px-3 min-[375px]:px-4 py-1.5 min-[375px]:py-2">
              ← Volver
            </Button>
          </div>

          {/* Banner éxito */}
          <div className={`mb-4 flex items-center gap-4 rounded-2xl border p-5
            bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-900/30`}>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400">
              <CheckCircle className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-green-800 dark:text-green-300">Servicio finalizado con éxito</p>
              <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">{trabajo.oficio.nombre} · {trabajo.clienteNombre}</p>
            </div>
          </div>

          {/* Resumen */}
          <Card className="mb-4">
            <h2 className={`mb-4 text-xs font-semibold uppercase tracking-wider ${tw.text.muted}`}>
              Resumen del servicio
            </h2>
            <div className="space-y-0">
              {rows.map(({ label, value }) => (
                <div key={label} className={`flex items-start justify-between gap-4 py-3 border-b last:border-0 ${tw.dividerLight}`}>
                  <span className={`text-sm shrink-0 ${tw.text.muted}`}>{label}</span>
                  <span className={`text-sm font-medium text-right ${tw.text.primary}`}>{value}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Calificación */}
          <Card>
            {trabajo.calificado && calificacion ? (
              <>
                <h3 className={`mb-4 text-xs font-semibold uppercase tracking-wider ${tw.text.muted}`}>
                  Calificación del cliente
                </h3>
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex gap-0.5">
                    {[1,2,3,4,5].map((s) => (
                      <Star key={s} className={`h-5 w-5 ${s <= calificacion.estrellas ? 'text-amber-400 fill-amber-400' : 'text-slate-200 dark:text-dark-border'}`} />
                    ))}
                  </div>
                  <span className="text-lg font-bold text-amber-500">{calificacion.estrellas}.0</span>
                </div>
                {calificacion.comentario && (
                  <div className={`rounded-xl p-4 ${tw.iconBg.slate}`}>
                    <p className={`text-xs font-medium mb-1.5 ${tw.text.muted}`}>Comentario</p>
                    <p className={`text-sm italic ${tw.text.secondary}`}>"{calificacion.comentario}"</p>
                  </div>
                )}
                {calificacion.createdAt && (
                  <p className={`mt-3 text-xs ${tw.text.faint}`}>
                    Calificado el {new Date(calificacion.createdAt).toLocaleDateString('es-AR')}
                  </p>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tw.iconBg.amber}`}>
                  <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <h3 className={`text-sm font-semibold ${tw.text.primary}`}>Pendiente de calificación</h3>
                  <p className={`text-xs mt-0.5 ${tw.text.secondary}`}>El cliente aún no calificó este servicio</p>
                </div>
              </div>
            )}
          </Card>

        </div>
      </div>
    </div>
  );
}

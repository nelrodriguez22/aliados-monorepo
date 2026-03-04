import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card } from "@/shared/components/ui/Card";
import { Button } from "@/shared/components/ui/Button";
import { Badge } from "@/shared/components/ui/Badge";
import { tw } from "@/shared/styles/design-system";
import { ROUTES } from "@/shared/constants/routes";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getToken } from "@/shared/lib/getToken";
import { Loader2, Clock, Users, CheckCircle, MapPin, FileText, Send } from "lucide-react";
import toast from "react-hot-toast";

export function JobTracking() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [motivoCancelacion, setMotivoCancelacion] = useState("");
  const [showCancelar, setShowCancelar] = useState(false);

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
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });

  const cancelarMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/trabajos/${jobId}/cancelar`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ motivo: motivoCancelacion }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trabajos-cliente'] });
      toast.success('Solicitud cancelada');
      navigate(ROUTES.CLIENT.DASHBOARD);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  useEffect(() => {
    if (trabajo?.estado === 'COMPLETADO') {
      queryClient.refetchQueries({ queryKey: ['trabajos-cliente'] });
      navigate(ROUTES.CLIENT.COMPLETED(trabajo.id), { replace: true });
    }
    if (trabajo?.estado === 'PROPUESTO') {
      navigate(ROUTES.CLIENT.PROPOSAL(trabajo.id), { replace: true });
    }
  }, [trabajo?.estado]);

  const Loading = () => (
    <div className={`flex h-screen items-center justify-center ${tw.pageBg}`}>
      <Loader2 className="h-7 w-7 animate-spin text-brand-600 dark:text-dark-brand" />
    </div>
  );

  if (isLoading || !trabajo || trabajo.estado === 'COMPLETADO') return <Loading />;

  const isPendiente = trabajo.estado === 'PENDIENTE';
  const enCurso    = trabajo.estado === 'EN_CURSO';
  const enCola     = trabajo.estado === 'EN_COLA';

  const steps = [
    { id: 1, label: "Solicitud creada",                                              completed: true },
    { id: 2, label: enCola ? "En cola — esperando turno" : "Profesional en camino", completed: enCurso || enCola },
    { id: 3, label: "Servicio completado",                                            completed: false },
  ];

  const getInitials = (name: string) =>
    name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const formatTiempo = (minutos: number) => {
    if (minutos < 60) return `${minutos} min`;
    const h = Math.floor(minutos / 60);
    const m = minutos % 60;
    return m === 0 ? `${h}h` : `${h}h ${m}min`;
  };

  const getTitle = () => {
    if (isPendiente) return { title: 'Buscando profesional', subtitle: 'Estamos notificando a los mejores de tu zona' };
    if (enCola)      return { title: 'Profesional asignado', subtitle: 'En cola — serás atendido a continuación' };
    return { title: 'Profesional en camino', subtitle: 'Tu aliado está en ruta a tu ubicación' };
  };
  const { title, subtitle } = getTitle();

  // ── Detalles del servicio ──
  const DetallesServicio = () => (
    <Card>
      <h3 className={`mb-4 text-sm font-semibold uppercase tracking-wider ${tw.text.muted}`}>
        Detalles del servicio
      </h3>
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${tw.iconBg.brand} text-brand-600 dark:text-dark-brand`}>
            <FileText className="h-3.5 w-3.5" />
          </div>
          <div>
            <p className={`text-xs ${tw.text.muted}`}>Servicio</p>
            <p className={`text-sm font-medium ${tw.text.primary}`}>{trabajo.oficio.nombre}</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${tw.iconBg.slate}`}>
            <FileText className="h-3.5 w-3.5 text-slate-500 dark:text-dark-text-secondary" />
          </div>
          <div>
            <p className={`text-xs ${tw.text.muted}`}>Descripción</p>
            <p className={`text-sm ${tw.text.primary}`}>{trabajo.descripcion}</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${tw.iconBg.green} text-green-600 dark:text-green-400`}>
            <MapPin className="h-3.5 w-3.5" />
          </div>
          <div>
            <p className={`text-xs ${tw.text.muted}`}>Dirección</p>
            <p className={`text-sm ${tw.text.primary}`}>{trabajo.direccion}</p>
          </div>
        </div>
        {trabajo.tarifaVisita && (
          <div className={`border-t pt-3 ${tw.dividerLight}`}>
            <p className={`text-xs ${tw.text.muted}`}>Tarifa de visita</p>
            <p className={`text-base font-semibold ${tw.text.primary}`}>
              ${trabajo.tarifaVisita.toLocaleString('es-AR')}
            </p>
          </div>
        )}
      </div>
    </Card>
  );

  // ── Card del proveedor ──
  // Avatar + info en fila, tiempo en fila separada abajo
  const ProveedorCard = ({ size = 'md' }: { size?: 'md' | 'lg' }) => (
    <Card>
      <div className="flex flex-col gap-3">
        {/* Fila: avatar + info */}
        <div className="flex items-center gap-3">
          <div className={`flex shrink-0 items-center justify-center rounded-full font-bold text-brand-600 dark:text-dark-brand ${tw.iconBg.brand}
            ${size === 'lg'
              ? 'h-12 w-12 min-[425px]:h-16 min-[425px]:w-16 text-base min-[425px]:text-xl'
              : 'h-10 w-10 min-[425px]:h-12 min-[425px]:w-12 text-sm min-[425px]:text-base'
            }`}>
            {getInitials(trabajo.proveedorNombre)}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className={`font-bold truncate ${size === 'lg' ? 'text-base min-[425px]:text-xl' : 'text-sm min-[425px]:text-base'} ${tw.text.primary}`}>
              {trabajo.proveedorNombre}
            </h2>
            <p className={`text-xs min-[375px]:text-sm ${tw.text.secondary}`}>{trabajo.oficio.nombre}</p>
            {trabajo.proveedorPromedioCalificacion > 0 && (
              <div className="mt-1 flex items-center gap-0.5">
                {[1,2,3,4,5].map((s) => (
                  <span key={s} className={`text-xs ${s <= Math.round(trabajo.proveedorPromedioCalificacion) ? 'text-amber-400' : 'text-slate-200 dark:text-dark-border'}`}>★</span>
                ))}
                <span className={`text-xs ml-0.5 ${tw.text.muted}`}>({trabajo.proveedorPromedioCalificacion.toFixed(1)})</span>
              </div>
            )}
          </div>
        </div>

        {/* Tiempo estimado — fila separada, alineada a la derecha */}
        {trabajo.tiempoEstimadoMinutos > 0 && (
          <div className={`flex items-center justify-end gap-1.5 border-t pt-3 ${tw.dividerLight}`}>
            <Clock className={`h-3.5 w-3.5 ${tw.text.muted}`} />
            <span className={`text-xs ${tw.text.muted}`}>Tiempo est.</span>
            <p className={`font-bold ml-1 ${size === 'lg' ? 'text-xl min-[425px]:text-2xl' : 'text-base min-[425px]:text-lg'} text-brand-600 dark:text-dark-brand`}>
              {formatTiempo(trabajo.tiempoEstimadoMinutos)}
            </p>
            {enCola && <p className={`text-xs ${tw.text.muted}`}>al ser tu turno</p>}
          </div>
        )}
      </div>
    </Card>
  );

  return (
    <div className={tw.pageBg}>
      <div className={tw.container}>
        <div className="mx-auto max-w-5xl">

          {/* Header */}
          <div className="mb-6 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className={`text-xl min-[375px]:text-2xl font-bold truncate ${tw.text.primary}`}>{title}</h1>
              <p className={`mt-0.5 text-xs min-[375px]:text-sm ${tw.text.secondary}`}>{subtitle}</p>
            </div>
            <Button
              variant="outline"
              onClick={() => navigate(ROUTES.CLIENT.DASHBOARD)}
              className="shrink-0 text-xs min-[375px]:text-sm px-3 min-[375px]:px-4 py-1.5 min-[375px]:py-2"
            >
              ← Volver
            </Button>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">

              {/* PENDIENTE */}
              {isPendiente && (
                <Card>
                  <div className="flex flex-col items-center gap-4 py-8 text-center">
                    <div className={`flex h-14 w-14 min-[375px]:h-16 min-[375px]:w-16 items-center justify-center rounded-2xl ${tw.iconBg.brand}`}>
                      <Loader2 className="h-7 w-7 min-[375px]:h-8 min-[375px]:w-8 animate-spin text-brand-600 dark:text-dark-brand" />
                    </div>
                    <div>
                      <h3 className={`mb-1 text-base min-[375px]:text-lg font-semibold ${tw.text.primary}`}>
                        Buscando profesional disponible
                      </h3>
                      <p className={`text-xs min-[375px]:text-sm ${tw.text.secondary}`}>
                        Notificando a los mejores {trabajo.oficio.nombre}s de tu zona
                      </p>
                    </div>
                    <Badge variant="warning" showPulse>Buscando proveedor</Badge>

                    {!showCancelar ? (
                      <button
                        onClick={() => setShowCancelar(true)}
                        className="text-xs font-medium text-red-500 hover:text-red-600 dark:text-red-400 cursor-pointer transition"
                      >
                        Cancelar solicitud
                      </button>
                    ) : (
                      <div className="w-full space-y-3">
                        <select
                          value={motivoCancelacion}
                          onChange={(e) => setMotivoCancelacion(e.target.value)}
                          className={tw.select}
                        >
                          <option value="">Seleccioná un motivo</option>
                          <option value="Ya no necesito el servicio">Ya no necesito el servicio</option>
                          <option value="Encontré otro profesional">Encontré otro profesional</option>
                          <option value="Demora en encontrar profesional">Demora en encontrar profesional</option>
                          <option value="Error al crear la solicitud">Error al crear la solicitud</option>
                          <option value="Otro">Otro</option>
                        </select>
                        <div className="flex gap-2 justify-center">
                          <button
                            onClick={() => setShowCancelar(false)}
                            className={`rounded-xl border px-4 py-2 text-sm font-medium cursor-pointer transition ${tw.text.secondary} border-slate-200 dark:border-dark-border hover:bg-slate-50 dark:hover:bg-dark-elevated`}
                          >
                            Volver
                          </button>
                          <button
                            onClick={() => cancelarMutation.mutate()}
                            disabled={cancelarMutation.isPending || !motivoCancelacion}
                            className="rounded-xl bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 cursor-pointer transition disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {cancelarMutation.isPending ? 'Cancelando...' : 'Confirmar'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </Card>
              )}

              {/* EN COLA */}
              {enCola && trabajo.proveedorNombre && (
                <>
                  <Card className={tw.queueCard}>
                    <div className="flex items-center gap-3">
                      <div className={`flex h-10 w-10 min-[375px]:h-12 min-[375px]:w-12 shrink-0 items-center justify-center rounded-xl ${tw.iconBg.amber} text-amber-600 dark:text-amber-400`}>
                        <Users className="h-4 w-4 min-[375px]:h-5 min-[375px]:w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className={`font-semibold text-sm ${tw.text.primary}`}>
                          Tu profesional está atendiendo otro servicio
                        </h3>
                        <p className={`text-xs mt-0.5 ${tw.text.secondary}`}>
                          Serás atendido a continuación
                        </p>
                      </div>
                      <div className="shrink-0">
                        <Badge variant="queue" showPulse>En cola</Badge>
                      </div>
                    </div>
                  </Card>
                  <ProveedorCard />
                  <DetallesServicio />
                </>
              )}

              {/* EN CURSO */}
              {enCurso && trabajo.proveedorNombre && (
                <>
                  <Card>
                    <div className="mb-3 flex items-center justify-between">
                      <Badge variant="info" showPulse>En camino</Badge>
                      <span className={`text-xs font-medium ${tw.text.secondary}`}>
                        En ruta a tu ubicación
                      </span>
                    </div>
                    <ProveedorCard size="lg" />
                  </Card>
                  <DetallesServicio />
                </>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-4 lg:col-span-1">

              {/* Progreso */}
              <Card>
                <h3 className={`mb-4 text-sm font-semibold uppercase tracking-wider ${tw.text.muted}`}>
                  Progreso
                </h3>
                <div className="space-y-3">
                  {steps.map((step, i) => (
                    <div key={step.id}>
                      <div className="flex items-center gap-3">
                        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors
                          ${step.completed
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                            : 'bg-slate-100 dark:bg-dark-elevated text-slate-400 dark:text-dark-text-secondary'
                          }`}
                        >
                          {step.completed
                            ? <CheckCircle className="h-4 w-4" />
                            : <span className="text-xs font-semibold">{step.id}</span>
                          }
                        </div>
                        <p className={`text-sm ${step.completed ? tw.text.primary : tw.text.faint}`}>
                          {step.label}
                        </p>
                      </div>
                      {i < steps.length - 1 && (
                        <div className={`ml-3.5 mt-1 mb-1 h-4 w-px ${step.completed ? 'bg-green-200 dark:bg-green-900/50' : 'bg-slate-100 dark:bg-dark-border'}`} />
                      )}
                    </div>
                  ))}
                </div>
              </Card>

              {/* Chat */}
              {enCurso && trabajo.proveedorNombre && (
                <Card>
                  <div className={`mb-4 flex items-center justify-between border-b pb-4 ${tw.divider}`}>
                    <h3 className={`text-sm font-semibold ${tw.text.primary}`}>
                      Chat con tu aliado
                    </h3>
                  </div>
                  <div className="flex items-center justify-center py-8 text-center">
                    <p className={`text-xs ${tw.text.muted}`}>Disponible próximamente</p>
                  </div>
                  <div className={`flex gap-2 border-t pt-4 ${tw.divider}`}>
                    <input
                      type="text"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Escribe un mensaje..."
                      disabled
                      className={tw.input + " flex-1 disabled:opacity-40 disabled:cursor-not-allowed text-sm"}
                    />
                    <button
                      disabled
                      className={`flex h-10 w-10 items-center justify-center rounded-xl transition
                        bg-brand-600 dark:bg-dark-brand text-white
                        disabled:opacity-40 disabled:cursor-not-allowed`}
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </div>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

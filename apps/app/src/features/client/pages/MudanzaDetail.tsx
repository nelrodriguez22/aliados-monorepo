import { useParams, useNavigate } from "react-router-dom";
import { Card } from "@/shared/components/ui/Card";
import { Button } from "@/shared/components/ui/Button";
import { ErrorState } from "@/shared/components/ui/ErrorState";
import { tw } from "@/shared/styles/design-system";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/shared/lib/apiClient";
import { useWebSocketContext } from "@/shared/providers/WebSocketProvider";
import { ArrowLeft, Clock, Truck, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { ROUTES } from "@/shared/constants/routes";
import { useEffect, useState } from "react";

interface MudanzaDetail {
  id: number;
  clienteId: number;
  clienteNombre: string;
  proveedorId: number | null;
  proveedorNombre: string | null;
  tierId: number;
  tierNombre: string;
  tierEmoji: string;
  tierOriginalId: number | null;
  tierOriginalNombre: string | null;
  estado: string;
  direccionOrigen: string;
  direccionDestino: string;
  pisos: number;
  tieneAscensor: boolean;
  cantidadAmbientes: number;
  fechaDeseada: string;
  fechaConfirmada: string | null;
  fechaOriginal: string | null;
  turno: string | null;
  fotos: string;
  notasCliente: string | null;
  montoBase: number;
  montoFinal: number | null;
  montoExtra: number | null;
  comisionPorcentaje: number;
  comisionMonto: number | null;
  montoProveedor: number | null;
  motivoContrapropuesta: string | null;
  iniciadoAt: string | null;
  finalizadoAt: string | null;
  duracionRealMinutos: number | null;
  bloquesExtra: number | null;
  createdAt: string;
  reservadoAt: string | null;
  acceptedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  motivoCancelacion: string | null;
}

const ESTADO_CONFIG: Record<string, { label: string; badge: string; icon: any }> = {
  PENDIENTE:           { label: "Pendiente",         badge: tw.badge.neutral,  icon: Clock },
  RESERVADO:           { label: "Reservado",         badge: tw.badge.info,     icon: Clock },
  CONTRAPROPUESTO:     { label: "Cambio sugerido",   badge: tw.badge.warning,  icon: AlertCircle },
  ACEPTADO:            { label: "Confirmada",        badge: tw.badge.success,  icon: CheckCircle },
  EN_CURSO:            { label: "En curso",          badge: tw.badge.info,     icon: Truck },
  FINALIZADO:          { label: "Finalizada",        badge: tw.badge.success,  icon: CheckCircle },
  PENDIENTE_PAGO_EXTRA:{ label: "Pago extra pendiente", badge: tw.badge.warning, icon: AlertCircle },
  COMPLETADO:          { label: "Completada",        badge: tw.badge.success,  icon: CheckCircle },
  CANCELADO:           { label: "Cancelada",         badge: tw.badge.error,    icon: AlertCircle },
};

const formatPrice = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);

const formatFecha = (fecha: string) => {
  const d = new Date(fecha + "T12:00:00");
  const dias = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const dia = dias[d.getDay()];
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(2);
  return `${dia} ${dd}/${mm}/${yy}`;
};

export function MudanzaDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // Con WS conectado los cambios de estado llegan por push → poll lento de respaldo.
  const { isConnected: wsConnected } = useWebSocketContext();

  // Timer para EN_CURSO
  const [elapsed, setElapsed] = useState(0);

  const { data: mudanza, isLoading, isError, error, refetch } = useQuery<MudanzaDetail>({
    queryKey: ["mudanza", id],
    queryFn: () => apiClient.get<MudanzaDetail>(`/api/mudanzas/${id}`),
    refetchInterval: wsConnected ? 30000 : 5000,
  });

  // Cronómetro visual
  useEffect(() => {
    if (!mudanza || mudanza.estado !== "EN_CURSO" || !mudanza.iniciadoAt) return;
    const start = new Date(mudanza.iniciadoAt).getTime();
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [mudanza?.estado, mudanza?.iniciadoAt]);

  const formatElapsed = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // Mutations
  const aceptarContrapropuesta = useMutation({
    mutationFn: () => apiClient.patch(`/api/mudanzas/${id}/aceptar-contrapropuesta`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mudanza", id] });
      toast.success("Contrapropuesta aceptada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rechazarContrapropuesta = useMutation({
    mutationFn: () => apiClient.patch(`/api/mudanzas/${id}/rechazar-contrapropuesta`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mudanza", id] });
      toast.success("Mudanza cancelada. Se te reembolsará el monto.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pagarExtra = useMutation({
    mutationFn: () => apiClient.patch(`/api/mudanzas/${id}/pagar-extra`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mudanza", id] });
      toast.success("Pago extra realizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const completarMudanza = useMutation({
    mutationFn: () => apiClient.patch(`/api/mudanzas/${id}/completar`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mudanza", id] });
      queryClient.invalidateQueries({ queryKey: ["mudanzas-cliente"] });
      toast.success("Mudanza completada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isError) {
    return (
      <ErrorState
        title="No pudimos cargar la mudanza"
        message={(error as Error)?.message || 'Ocurrió un error al obtener los datos de la mudanza.'}
        onRetry={() => refetch()}
        onBack={() => navigate(-1)}
      />
    );
  }

  if (isLoading || !mudanza) {
    return (
      <div className={tw.pageBg}>
        <div className={tw.container}>
          <div className="flex justify-center py-20">
            <Loader2 className={`h-7 w-7 animate-spin ${tw.text.brand}`} />
          </div>
        </div>
      </div>
    );
  }

  const estado = ESTADO_CONFIG[mudanza.estado] || ESTADO_CONFIG.PENDIENTE;
  const EstadoIcon = estado.icon;

  return (
    <div className={tw.pageBg}>
      <div className={tw.container}>
        <div className="mx-auto max-w-3xl">

          {/* Header */}
          <div className="mb-6 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">{mudanza.tierEmoji}</span>
                <h1 className={`text-xl min-[375px]:text-2xl font-bold ${tw.text.primary}`}>
                  Mudanza {mudanza.tierNombre}
                </h1>
              </div>
              <div className={estado.badge}>
                <EstadoIcon className="h-3 w-3" />
                {estado.label}
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => navigate(ROUTES.CLIENT.DASHBOARD)}
              className="shrink-0 text-xs min-[375px]:text-sm px-3 py-1.5"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* ═══ Cronómetro EN_CURSO ═══ */}
          {mudanza.estado === "EN_CURSO" && (
            <Card className="mb-4 text-center">
              <p className={`text-xs font-medium mb-1 ${tw.text.muted}`}>Tiempo transcurrido</p>
              <p className={`text-4xl font-mono font-bold ${tw.text.brand}`}>
                {formatElapsed(elapsed)}
              </p>
              <p className={`text-xs mt-1 ${tw.text.secondary}`}>
                Fletes Bay está trabajando en tu mudanza
              </p>
            </Card>
          )}

          {/* ═══ Contrapropuesta ═══ */}
          {mudanza.estado === "CONTRAPROPUESTO" && (
            <Card className={`mb-4 ${tw.proposalCard}`}>
              <div className="flex items-start gap-3 mb-3">
                <AlertCircle className="h-5 w-5 shrink-0 text-brand-600 dark:text-dark-brand mt-0.5" />
                <div>
                  <h3 className={`text-sm font-semibold ${tw.text.primary}`}>Cambios sugeridos por Fletes Bay</h3>
                  <div className={`text-xs mt-2 space-y-1 ${tw.text.secondary}`}>
                    {mudanza.tierOriginalNombre && (
                      <p>Plan: <span className="line-through">{mudanza.tierOriginalNombre}</span> → <span className="font-semibold">{mudanza.tierEmoji} {mudanza.tierNombre}</span> ({formatPrice(mudanza.montoBase)})</p>
                    )}
                    {mudanza.fechaOriginal && (
                      <p>Fecha: <span className="line-through">{formatFecha(mudanza.fechaOriginal)}</span> → <span className="font-semibold">{formatFecha(mudanza.fechaDeseada)}</span></p>
                    )}
                  </div>
                  {mudanza.motivoContrapropuesta && (
                    <p className={`text-xs mt-2 italic ${tw.text.muted}`}>
                      "{mudanza.motivoContrapropuesta}"
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  fullWidth
                  onClick={() => aceptarContrapropuesta.mutate()}
                  disabled={aceptarContrapropuesta.isPending}
                >
                  {aceptarContrapropuesta.isPending ? "..." : "Aceptar cambios"}
                </Button>
                <Button
                  variant="outline"
                  fullWidth
                  onClick={() => rechazarContrapropuesta.mutate()}
                  disabled={rechazarContrapropuesta.isPending}
                >
                  {rechazarContrapropuesta.isPending ? "..." : "Rechazar y cancelar"}
                </Button>
              </div>
            </Card>
          )}

          {/* ═══ Pago extra ═══ */}
          {mudanza.estado === "PENDIENTE_PAGO_EXTRA" && mudanza.montoExtra && (
            <Card className="mb-4 border-2 border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-900/15">
              <div className="text-center mb-3">
                <p className={`text-sm font-semibold ${tw.text.primary}`}>Tiempo extra</p>
                <p className={`text-xs ${tw.text.secondary}`}>
                  Tu mudanza duró {mudanza.duracionRealMinutos} min de servicio
                  ({mudanza.bloquesExtra} bloque{mudanza.bloquesExtra && mudanza.bloquesExtra > 1 ? "s" : ""} de 30 min extra)
                </p>
              </div>
              <div className="flex items-center justify-between mb-3 px-2">
                <span className={`text-sm ${tw.text.secondary}`}>Base</span>
                <span className={`text-sm font-medium ${tw.text.primary}`}>{formatPrice(mudanza.montoBase)}</span>
              </div>
              <div className="flex items-center justify-between mb-3 px-2">
                <span className={`text-sm ${tw.text.secondary}`}>Extra</span>
                <span className="text-sm font-medium text-amber-600 dark:text-amber-400">+{formatPrice(mudanza.montoExtra)}</span>
              </div>
              <div className={`border-t ${tw.dividerLight} my-2`} />
              <div className="flex items-center justify-between mb-4 px-2">
                <span className={`text-sm font-semibold ${tw.text.primary}`}>Total</span>
                <span className={`text-lg font-bold ${tw.text.brand}`}>{formatPrice(mudanza.montoFinal!)}</span>
              </div>
              <Button
                fullWidth
                onClick={() => pagarExtra.mutate()}
                disabled={pagarExtra.isPending}
              >
                {pagarExtra.isPending ? "Procesando..." : `Pagar extra ${formatPrice(mudanza.montoExtra)}`}
              </Button>
            </Card>
          )}

          {/* ═══ Finalizada — confirmar y cerrar ═══ */}
          {mudanza.estado === "FINALIZADO" && (
            <Card className="mb-4 text-center">
              <CheckCircle className="h-10 w-10 mx-auto text-green-500 mb-2" />
              <h3 className={`text-base font-semibold mb-1 ${tw.text.primary}`}>Mudanza finalizada</h3>
              <p className={`text-sm mb-1 ${tw.text.secondary}`}>
                Costo total: <span className="font-bold">{formatPrice(mudanza.montoFinal!)}</span>
              </p>
              <p className={`text-xs mb-4 ${tw.text.muted}`}>
                Duración: {mudanza.duracionRealMinutos} min de servicio
              </p>
              <Button
                fullWidth
                onClick={() => completarMudanza.mutate()}
                disabled={completarMudanza.isPending}
              >
                {completarMudanza.isPending ? "..." : "Confirmar y cerrar"}
              </Button>
            </Card>
          )}

          {/* ═══ Info general ═══ */}
          <Card>
            <h3 className={`text-sm font-semibold mb-3 ${tw.text.primary}`}>Detalles</h3>
            <div className="space-y-3">
              {/* Fecha */}
              <div>
                <p className={`text-xs ${tw.text.muted}`}>Fecha</p>
                <p className={`text-sm font-medium ${tw.text.primary}`}>
                  {mudanza.fechaConfirmada
                    ? formatFecha(mudanza.fechaConfirmada)
                    : formatFecha(mudanza.fechaDeseada) + " (solicitada)"
                  }
                  {mudanza.turno && ` — ${mudanza.turno === "PRIMERO" ? "1° turno (6:30hs)" : "2° turno (~11:00hs)"}`}
                </p>
              </div>

              <div className={`border-t ${tw.dividerLight}`} />

              {/* Origen */}
              <div className="flex items-start gap-2">
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 text-[10px] font-bold mt-0.5">A</div>
                <div className="min-w-0">
                  <p className={`text-xs ${tw.text.muted}`}>Origen</p>
                  <p className={`text-sm font-medium break-words ${tw.text.primary}`}>{mudanza.direccionOrigen}</p>
                </div>
              </div>
              {/* Destino */}
              <div className="flex items-start gap-2">
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 dark:bg-dark-brand/20 text-brand-600 dark:text-dark-brand text-[10px] font-bold mt-0.5">B</div>
                <div className="min-w-0">
                  <p className={`text-xs ${tw.text.muted}`}>Destino</p>
                  <p className={`text-sm font-medium break-words ${tw.text.primary}`}>{mudanza.direccionDestino}</p>
                </div>
              </div>

              <div className={`border-t ${tw.dividerLight}`} />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className={`text-xs ${tw.text.muted}`}>Ambientes</p>
                  <p className={`text-sm font-medium ${tw.text.primary}`}>{mudanza.cantidadAmbientes}</p>
                </div>
                <div>
                  <p className={`text-xs ${tw.text.muted}`}>Pisos</p>
                  <p className={`text-sm font-medium ${tw.text.primary}`}>{mudanza.pisos === 0 ? "PB" : `${mudanza.pisos}`}</p>
                </div>
                <div>
                  <p className={`text-xs ${tw.text.muted}`}>Ascensor</p>
                  <p className={`text-sm font-medium ${tw.text.primary}`}>{mudanza.tieneAscensor ? "Sí" : "No"}</p>
                </div>
                <div>
                  <p className={`text-xs ${tw.text.muted}`}>Monto base</p>
                  <p className={`text-sm font-medium ${tw.text.primary}`}>{formatPrice(mudanza.montoBase)}</p>
                </div>
                {mudanza.montoFinal && (
                  <div>
                    <p className={`text-xs ${tw.text.muted}`}>Monto final</p>
                    <p className={`text-sm font-bold ${tw.text.brand}`}>{formatPrice(mudanza.montoFinal)}</p>
                  </div>
                )}
              </div>

              {mudanza.proveedorNombre && (
                <>
                  <div className={`border-t ${tw.dividerLight}`} />
                  <div className="flex items-center gap-2">
                    <Truck className={`h-4 w-4 ${tw.text.brand}`} />
                    <div>
                      <p className={`text-xs ${tw.text.muted}`}>Proveedor</p>
                      <p className={`text-sm font-medium ${tw.text.primary}`}>{mudanza.proveedorNombre}</p>
                    </div>
                  </div>
                </>
              )}

              {mudanza.notasCliente && (
                <>
                  <div className={`border-t ${tw.dividerLight}`} />
                  <div>
                    <p className={`text-xs ${tw.text.muted}`}>Notas</p>
                    <p className={`text-sm ${tw.text.secondary}`}>{mudanza.notasCliente}</p>
                  </div>
                </>
              )}
            </div>
          </Card>

        </div>
      </div>
    </div>
  );
}

import { useParams, useNavigate } from "react-router-dom";
import { Card } from "@/shared/components/ui/Card";
import { Button } from "@/shared/components/ui/Button";
import { tw } from "@/shared/styles/design-system";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/shared/lib/apiClient";
import { useWebSocketContext } from "@/shared/providers/WebSocketProvider";
import { ArrowLeft,Truck,Loader2, Play, Square, Image } from "lucide-react";
import toast from "react-hot-toast";
import { ROUTES } from "@/shared/constants/routes";
import { useState, useEffect } from "react";

interface MudanzaDetail {
  id: number;
  clienteNombre: string;
  proveedorId: number | null;
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
  acceptedAt: string | null;
  completedAt: string | null;
}

interface Tier {
  id: number;
  nombre: string;
  emoji: string;
  precioBase: number;
}

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

export function ProviderMudanzaDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // Con WS conectado los cambios de estado llegan por push → poll lento de respaldo.
  const { isConnected: wsConnected } = useWebSocketContext();

  const [elapsed, setElapsed] = useState(0);
  const [showContrapropuesta, setShowContrapropuesta] = useState(false);
  const [tierSugeridoId, setTierSugeridoId] = useState<number | null>(null);
  const [fechaSugerida, setFechaSugerida] = useState("");
  const [motivo, setMotivo] = useState("");
  const [turnoSeleccionado, setTurnoSeleccionado] = useState("");

  const { data: mudanza, isLoading } = useQuery<MudanzaDetail>({
    queryKey: ["mudanza-prov", id],
    queryFn: () => apiClient.get<MudanzaDetail>(`/api/mudanzas/${id}`),
    refetchInterval: wsConnected ? 30000 : 5000,
  });

  const { data: tiers = [] } = useQuery<Tier[]>({
    queryKey: ["mudanza-tiers"],
    queryFn: () => apiClient.get<Tier[]>('/api/mudanzas/tiers', false),
  });

  // Cronómetro
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
  const aceptar = useMutation({
    mutationFn: async () => {
      if (!turnoSeleccionado) throw new Error("Seleccioná un turno");
      return apiClient.patch(`/api/mudanzas/${id}/aceptar`, { turno: turnoSeleccionado });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mudanza-prov", id] });
      toast.success("Mudanza aceptada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const contraproponer = useMutation({
    mutationFn: async () => {
      if (!tierSugeridoId && !fechaSugerida) throw new Error("Sugerí un cambio de plan, fecha, o ambos");
      if (!turnoSeleccionado) throw new Error("Seleccioná un turno");
      return apiClient.patch(`/api/mudanzas/${id}/contraproponer`, {
        tierSugeridoId: tierSugeridoId || null,
        fechaSugerida: fechaSugerida || null,
        turno: turnoSeleccionado,
        motivo,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mudanza-prov", id] });
      setShowContrapropuesta(false);
      toast.success("Contrapropuesta enviada al cliente");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const iniciar = useMutation({
    mutationFn: () => apiClient.patch(`/api/mudanzas/${id}/iniciar`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mudanza-prov", id] });
      toast.success("Mudanza iniciada. Cronómetro activado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const finalizar = useMutation({
    mutationFn: () => apiClient.patch(`/api/mudanzas/${id}/finalizar`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mudanza-prov", id] });
      toast.success("Mudanza finalizada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

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

  const fotos: string[] = (() => {
    try { return JSON.parse(mudanza.fotos); } catch { return []; }
  })();

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
              <p className={`text-sm ${tw.text.secondary}`}>Cliente: {mudanza.clienteNombre}</p>
            </div>
            <Button
              variant="outline"
              onClick={() => navigate(ROUTES.PROVIDER.DASHBOARD)}
              className="shrink-0 text-xs px-3 py-1.5"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* ═══ Cronómetro EN_CURSO ═══ */}
          {mudanza.estado === "EN_CURSO" && (
            <Card className="mb-4 text-center">
              <p className={`text-xs font-medium mb-1 ${tw.text.muted}`}>Cronómetro</p>
              <p className={`text-5xl font-mono font-bold ${tw.text.brand}`}>
                {formatElapsed(elapsed)}
              </p>
              <p className={`text-xs mt-2 ${tw.text.secondary}`}>
                Presioná "Finalizar" cuando termines
              </p>
              <Button
                variant="danger"
                fullWidth
                className="mt-4"
                onClick={() => finalizar.mutate()}
                disabled={finalizar.isPending}
              >
                <span className="flex items-center justify-center gap-2">
                  <Square className="h-4 w-4" />
                  {finalizar.isPending ? "Finalizando..." : "Finalizar Trabajo"}
                </span>
              </Button>
            </Card>
          )}

          {/* ═══ Acciones RESERVADO ═══ */}
          {mudanza.estado === "RESERVADO" && (
            <Card className="mb-4">
              <h3 className={`text-sm font-semibold mb-3 ${tw.text.primary}`}>Acciones</h3>

              {/* Select de turno — siempre visible */}
              <div className="mb-3">
                <label className={tw.label}>Fecha solicitada</label>
                <p className={`text-sm font-medium mb-3 ${tw.text.primary}`}>{formatFecha(mudanza.fechaDeseada)}</p>
                <label className={tw.label}>Asignar turno</label>
                <select
                  value={turnoSeleccionado}
                  onChange={(e) => setTurnoSeleccionado(e.target.value)}
                  className={tw.select}
                >
                  <option value="" disabled>Elegí un turno</option>
                  <option value="PRIMERO">1° turno (6:30hs)</option>
                  <option value="SEGUNDO">2° turno (~11:00hs)</option>
                </select>
              </div>

              {!showContrapropuesta ? (
                <div className="space-y-2">
                  <Button fullWidth onClick={() => aceptar.mutate()} disabled={aceptar.isPending}>
                    {aceptar.isPending ? "..." : `Aceptar - Plan ${mudanza.tierEmoji} ${mudanza.tierNombre}`}
                  </Button>
                  <Button variant="outline" fullWidth onClick={() => setShowContrapropuesta(true)}>
                    Sugerir otro plan
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className={tw.label}>Sugerir plan <span className={tw.text.faint}>(opcional)</span></label>
                    <select
                      value={tierSugeridoId || ""}
                      onChange={(e) => setTierSugeridoId(e.target.value ? Number(e.target.value) : null)}
                      className={tw.select}
                    >
                      <option value="">Mantener plan actual</option>
                      {tiers.filter((t) => t.id !== mudanza.tierId).map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.emoji} {t.nombre} - {formatPrice(t.precioBase)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={tw.label}>Sugerir otra fecha <span className={tw.text.faint}>(opcional)</span></label>
                    <input
                      type="date"
                      value={fechaSugerida}
                      onChange={(e) => setFechaSugerida(e.target.value)}
                      min={new Date(Date.now() + 86400000).toISOString().split("T")[0]}
                      className={tw.input}
                    />
                    <p className={`mt-1 text-xs ${tw.text.muted}`}>Fecha solicitada: {formatFecha(mudanza.fechaDeseada)}</p>
                  </div>
                  <div>
                    <label className={tw.label}>Motivo</label>
                    <textarea
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      placeholder="Ej: El volumen requiere un camión más grande..."
                      className={tw.textarea + " min-h-20"}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      fullWidth
                      onClick={() => contraproponer.mutate()}
                      disabled={contraproponer.isPending || (!tierSugeridoId && !fechaSugerida) || !motivo.trim() || !turnoSeleccionado}
                    >
                      {contraproponer.isPending ? "..." : "Enviar sugerencia"}
                    </Button>
                    <Button variant="outline" onClick={() => setShowContrapropuesta(false)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* ═══ Acciones ACEPTADO ═══ */}
          {mudanza.estado === "ACEPTADO" && (
            <Card className="mb-4 text-center">
              <Truck className={`h-10 w-10 mx-auto mb-2 ${tw.text.brand}`} />
              <h3 className={`text-base font-semibold mb-1 ${tw.text.primary}`}>Mudanza confirmada</h3>
              <p className={`text-xs mb-4 ${tw.text.secondary}`}>Presioná iniciar cuando llegues al domicilio</p>
              <Button
                fullWidth
                variant="success"
                onClick={() => iniciar.mutate()}
                disabled={iniciar.isPending}
              >
                <span className="flex items-center justify-center gap-2">
                  <Play className="h-4 w-4" />
                  {iniciar.isPending ? "Iniciando..." : "Iniciar Trabajo"}
                </span>
              </Button>
            </Card>
          )}

          {/* ═══ Resumen FINALIZADO / COMPLETADO ═══ */}
          {(mudanza.estado === "FINALIZADO" || mudanza.estado === "COMPLETADO" || mudanza.estado === "PENDIENTE_PAGO_EXTRA") && mudanza.montoFinal && (
            <Card className="mb-4">
              <h3 className={`text-sm font-semibold mb-3 ${tw.text.primary}`}>Liquidación</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className={`text-sm ${tw.text.secondary}`}>Monto base</span>
                  <span className={`text-sm ${tw.text.primary}`}>{formatPrice(mudanza.montoBase)}</span>
                </div>
                {mudanza.montoExtra && mudanza.montoExtra > 0 && (
                  <div className="flex justify-between">
                    <span className={`text-sm ${tw.text.secondary}`}>Extra ({mudanza.bloquesExtra} bloques)</span>
                    <span className="text-sm text-amber-600 dark:text-amber-400">+{formatPrice(mudanza.montoExtra)}</span>
                  </div>
                )}
                <div className={`border-t ${tw.dividerLight} my-1`} />
                <div className="flex justify-between">
                  <span className={`text-sm font-medium ${tw.text.primary}`}>Total</span>
                  <span className={`text-sm font-bold ${tw.text.primary}`}>{formatPrice(mudanza.montoFinal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className={`text-sm ${tw.text.secondary}`}>Comisión ({mudanza.comisionPorcentaje}%)</span>
                  <span className="text-sm text-red-500">-{formatPrice(mudanza.comisionMonto!)}</span>
                </div>
                <div className={`border-t ${tw.dividerLight} my-1`} />
                <div className="flex justify-between">
                  <span className={`text-sm font-semibold ${tw.text.primary}`}>Tu ganancia</span>
                  <span className={`text-base font-bold text-green-600 dark:text-green-400`}>{formatPrice(mudanza.montoProveedor!)}</span>
                </div>
              </div>
            </Card>
          )}

          {/* ═══ Detalles ═══ */}
          <Card className="mb-4">
            <h3 className={`text-sm font-semibold mb-3 ${tw.text.primary}`}>Detalles de la mudanza</h3>
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 text-[10px] font-bold mt-0.5">A</div>
                <div className="min-w-0">
                  <p className={`text-xs ${tw.text.muted}`}>Origen</p>
                  <p className={`text-sm font-medium break-words ${tw.text.primary}`}>{mudanza.direccionOrigen}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 dark:bg-dark-brand/20 text-brand-600 dark:text-dark-brand text-[10px] font-bold mt-0.5">B</div>
                <div className="min-w-0">
                  <p className={`text-xs ${tw.text.muted}`}>Destino</p>
                  <p className={`text-sm font-medium break-words ${tw.text.primary}`}>{mudanza.direccionDestino}</p>
                </div>
              </div>
              <div className={`border-t ${tw.dividerLight}`} />
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className={`text-xs ${tw.text.muted}`}>Fecha</p>
                  <p className={`text-sm font-medium ${tw.text.primary}`}>
                    {mudanza.fechaConfirmada
                      ? formatFecha(mudanza.fechaConfirmada)
                      : formatFecha(mudanza.fechaDeseada)
                    }
                  </p>
                </div>
                {mudanza.turno && (
                  <div>
                    <p className={`text-xs ${tw.text.muted}`}>Turno</p>
                    <p className={`text-sm font-medium ${tw.text.primary}`}>{mudanza.turno === "PRIMERO" ? "1° (6:30hs)" : "2° (~11hs)"}</p>
                  </div>
                )}
                <div>
                  <p className={`text-xs ${tw.text.muted}`}>Ambientes</p>
                  <p className={`text-sm font-medium ${tw.text.primary}`}>{mudanza.cantidadAmbientes}</p>
                </div>
                <div>
                  <p className={`text-xs ${tw.text.muted}`}>Pisos</p>
                  <p className={`text-sm font-medium ${tw.text.primary}`}>{mudanza.pisos === 0 ? "PB" : mudanza.pisos}</p>
                </div>
                <div>
                  <p className={`text-xs ${tw.text.muted}`}>Ascensor</p>
                  <p className={`text-sm font-medium ${tw.text.primary}`}>{mudanza.tieneAscensor ? "Sí" : "No"}</p>
                </div>
                <div>
                  <p className={`text-xs ${tw.text.muted}`}>Monto</p>
                  <p className={`text-sm font-bold ${tw.text.brand}`}>{formatPrice(mudanza.montoBase)}</p>
                </div>
              </div>
              {mudanza.notasCliente && (
                <>
                  <div className={`border-t ${tw.dividerLight}`} />
                  <div>
                    <p className={`text-xs ${tw.text.muted}`}>Notas del cliente</p>
                    <p className={`text-sm ${tw.text.secondary}`}>{mudanza.notasCliente}</p>
                  </div>
                </>
              )}
            </div>
          </Card>

          {/* ═══ Fotos ═══ */}
          {fotos.length > 0 && (
            <Card>
              <div className="flex items-center gap-2 mb-3">
                <Image className={`h-4 w-4 ${tw.text.brand}`} />
                <h3 className={`text-sm font-semibold ${tw.text.primary}`}>Fotos del cliente</h3>
              </div>
              <div className="grid grid-cols-3 min-[425px]:grid-cols-5 gap-2">
                {fotos.map((foto, i) => (
                  <img key={i} src={foto} alt={`Foto ${i + 1}`} className="aspect-square rounded-xl object-cover w-full" />
                ))}
              </div>
            </Card>
          )}

        </div>
      </div>
    </div>
  );
}

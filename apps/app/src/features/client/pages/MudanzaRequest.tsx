import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/shared/components/ui/Card";
import { Button } from "@/shared/components/ui/Button";
import { tw } from "@/shared/styles/design-system";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getToken } from "@/shared/lib/getToken";
import { useGeocode } from "@/shared/hooks/useGeocode";
import { MapPin, Loader2, Plus, X, CheckCircle, ArrowLeft, ArrowRight, Truck, Building2, Camera, Calendar, Home } from "lucide-react";
import toast from "react-hot-toast";
import { ROUTES } from "@/shared/constants/routes";

interface Tier {
  id: number;
  nombre: string;
  emoji: string;
  precioBase: number;
  minutosIncluidos: number;
  precioBloque30Min: number;
  descripcion: string;
  descripcionCompleta: string;
  orden: number;
}

const TIER_COLORS: Record<string, { border: string; bg: string; accent: string }> = {
  DIAMANTE: {
    border: "border-purple-300 dark:border-purple-500/40",
    bg: "bg-purple-50 dark:bg-purple-900/15",
    accent: "text-purple-600 dark:text-purple-400",
  },
  ORO: {
    border: "border-yellow-300 dark:border-yellow-500/40",
    bg: "bg-yellow-50 dark:bg-yellow-900/15",
    accent: "text-yellow-600 dark:text-yellow-400",
  },
  PLATA: {
    border: "border-slate-300 dark:border-slate-500/40",
    bg: "bg-slate-50 dark:bg-slate-800/30",
    accent: "text-slate-600 dark:text-slate-400",
  },
  BRONCE: {
    border: "border-orange-300 dark:border-orange-500/40",
    bg: "bg-orange-50 dark:bg-orange-900/15",
    accent: "text-orange-600 dark:text-orange-400",
  },
};

export function MudanzaRequest() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Steps: 1 = datos, 2 = tiers, 3 = resumen
  const [step, setStep] = useState(1);

  // Form data
  const [imagenes, setImagenes] = useState<string[]>([]);
  const [pisos, setPisos] = useState(0);
  const [tieneAscensor, setTieneAscensor] = useState(false);
  const [notas, setNotas] = useState("");
  const [selectedTier, setSelectedTier] = useState<Tier | null>(null);
  const [cantidadAmbientes, setCantidadAmbientes] = useState(1);
  const [fechaDeseada, setFechaDeseada] = useState("");

  // Geocode para origen y destino
  const origen = useGeocode();
  const destino = useGeocode();

  // Fetch tiers
  const { data: tiers = [], isLoading: loadingTiers } = useQuery<Tier[]>({
    queryKey: ["mudanza-tiers"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/mudanzas/tiers`);
      if (!res.ok) throw new Error("Error al cargar planes");
      return res.json();
    },
  });

  // Crear + reservar en un solo flow
  const crearMudanzaMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTier) throw new Error("Seleccioná un plan");
      if (!origen.coords) throw new Error("Confirmá la dirección de origen");
      if (!destino.coords) throw new Error("Confirmá la dirección de destino");
      if (imagenes.length === 0) throw new Error("Subí al menos una foto");
      if (!fechaDeseada) throw new Error("Seleccioná una fecha");
      if (fechaDeseada <= new Date().toISOString().split("T")[0]) throw new Error("La fecha debe ser posterior a hoy");

      const token = await getToken();

      // 1. Crear mudanza
      const resCrear = await fetch(`${import.meta.env.VITE_API_URL}/api/mudanzas`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          tierId: selectedTier.id,
          direccionOrigen: origen.direccion,
          latitudOrigen: origen.coords.lat,
          longitudOrigen: origen.coords.lng,
          direccionDestino: destino.direccion,
          latitudDestino: destino.coords.lat,
          longitudDestino: destino.coords.lng,
          pisos,
          tieneAscensor,
          cantidadAmbientes,
          fechaDeseada,
          fotos: JSON.stringify(imagenes),
          notasCliente: notas || null,
        }),
      });
      if (!resCrear.ok) throw new Error(await resCrear.text());
      const mudanza = await resCrear.json();

      // 2. Reservar (simula pago)
      const resReservar = await fetch(
        `${import.meta.env.VITE_API_URL}/api/mudanzas/${mudanza.id}/reservar`,
        {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (!resReservar.ok) throw new Error(await resReservar.text());
      return resReservar.json();
    },
    onSuccess: (mudanza) => {
      queryClient.invalidateQueries({ queryKey: ["mudanzas-cliente"] });
      toast.success("Mudanza reservada. Esperando confirmación de Fletes Bay...");
      navigate(ROUTES.CLIENT.MUDANZA_DETAIL(mudanza.id));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Image handling
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    if (imagenes.length + files.length > 5) {
      toast.error("Máximo 5 fotos");
      return;
    }
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => setImagenes((prev) => [...prev, reader.result as string]);
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) =>
    setImagenes((prev) => prev.filter((_, i) => i !== index));

  // Validaciones por step
  const hoy = new Date().toISOString().split("T")[0];
  const canGoToStep2 =
    origen.coords && destino.coords && imagenes.length > 0 && fechaDeseada && fechaDeseada > hoy;

  const handleGoToStep2 = () => {
    if (!fechaDeseada) { toast.error("Seleccioná una fecha"); return; }
    if (fechaDeseada <= hoy) { toast.error("La fecha debe ser posterior a hoy"); return; }
    if (!origen.coords) { toast.error("Confirmá la dirección de origen"); return; }
    if (!destino.coords) { toast.error("Confirmá la dirección de destino"); return; }
    if (imagenes.length === 0) { toast.error("Subí al menos una foto"); return; }
    setStep(2);
  };

  const canGoToStep3 = selectedTier !== null;

  const formatFecha = (fecha: string) => {
    const d = new Date(fecha + "T12:00:00");
    const dias = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    const dia = dias[d.getDay()];
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yy = String(d.getFullYear()).slice(2);
    return `${dia} ${dd}/${mm}/${yy}`;
  };

  const formatPrice = (n: number) =>
    new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);

  // ════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════

  return (
    <div className={tw.pageBg}>
      <div className={tw.container}>
        <div className="mx-auto max-w-3xl">

          {/* Header */}
          <div className="mb-6 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Truck className={`h-5 w-5 ${tw.text.brand}`} />
                <h1 className={`text-xl min-[375px]:text-2xl font-bold ${tw.text.primary}`}>
                  Solicitar Mudanza
                </h1>
              </div>
              <p className={`text-xs min-[375px]:text-sm ${tw.text.secondary}`}>
                {step === 1 && "Completá los datos de tu mudanza"}
                {step === 2 && "Elegí el plan que mejor se adapte"}
                {step === 3 && "Revisá y confirmá tu solicitud"}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => (step > 1 ? setStep(step - 1) : navigate(ROUTES.CLIENT.DASHBOARD))}
              className="shrink-0 text-xs min-[375px]:text-sm px-3 min-[375px]:px-4 py-1.5 min-[375px]:py-2"
            >
              <span className="flex items-center gap-1">
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Volver</span>
              </span>
            </Button>
          </div>

          {/* Progress */}
          <div className="mb-6 flex items-center gap-2">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex-1">
                <div
                  className={`h-1.5 rounded-full transition-all ${
                    s <= step
                      ? "bg-brand-600 dark:bg-dark-brand"
                      : "bg-slate-200 dark:bg-dark-border"
                  }`}
                />
                <p className={`mt-1 text-[10px] font-medium ${
                  s <= step ? tw.text.brand : tw.text.muted
                }`}>
                  {s === 1 && "Datos"}
                  {s === 2 && "Plan"}
                  {s === 3 && "Confirmar"}
                </p>
              </div>
            ))}
          </div>

          {/* ═══════ STEP 1: Datos ═══════ */}
          {step === 1 && (
            <div className="space-y-4">
              {/* Fecha */}
              <Card>
                <div className="flex items-center gap-2 mb-3">
                  <Calendar className={`h-4 w-4 ${tw.text.brand}`} />
                  <h3 className={`text-sm font-semibold ${tw.text.primary}`}>Fecha deseada <span className={tw.text.faint}>(obligatorio)</span></h3>
                </div>
                <input
                  type="date"
                  value={fechaDeseada}
                  onChange={(e) => setFechaDeseada(e.target.value)}
                  min={new Date(Date.now() + 86400000).toISOString().split("T")[0]}
                  className={tw.input}
                />
                <p className={`mt-1.5 text-xs ${tw.text.muted}`}>Fletes Bay opera de lunes a domingo</p>
              </Card>

              {/* Origen */}
              <Card>
                <div className="flex items-center gap-2 mb-3">
                  <div className={`flex h-6 w-6 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 text-xs font-bold`}>A</div>
                  <h3 className={`text-sm font-semibold ${tw.text.primary}`}>Dirección de origen <span className={tw.text.faint}>(obligatorio)</span></h3>
                </div>
                <AddressInput geo={origen} placeholder="Dirección donde están tus cosas" />
              </Card>

              {/* Destino */}
              <Card>
                <div className="flex items-center gap-2 mb-3">
                  <div className={`flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 dark:bg-dark-brand/20 text-brand-600 dark:text-dark-brand text-xs font-bold`}>B</div>
                  <h3 className={`text-sm font-semibold ${tw.text.primary}`}>Dirección de destino <span className={tw.text.faint}>(obligatorio)</span></h3>
                </div>
                <AddressInput geo={destino} placeholder="Dirección a donde te mudás" />
              </Card>

              {/* Accesibilidad y ambientes */}
              <Card>
                <h3 className={`text-sm font-semibold mb-3 ${tw.text.primary}`}>Accesibilidad</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className={tw.label}>
                      <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> Pisos escalera</span>
                    </label>
                    <select value={pisos} onChange={(e) => setPisos(Number(e.target.value))} className={tw.select}>
                      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                        <option key={n} value={n}>{n === 0 ? "PB" : n}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={tw.label}>
                      <span className="flex items-center gap-1"><Building2 className="h-3 w-3" /> Ascensor</span>
                    </label>
                    <select value={tieneAscensor ? "si" : "no"} onChange={(e) => setTieneAscensor(e.target.value === "si")} className={tw.select}>
                      <option value="no">No</option>
                      <option value="si">Sí</option>
                    </select>
                  </div>
                  <div>
                    <label className={tw.label}>
                      <span className="flex items-center gap-1"><Home className="h-3 w-3" /> Ambientes</span>
                    </label>
                    <select value={cantidadAmbientes} onChange={(e) => setCantidadAmbientes(Number(e.target.value))} className={tw.select}>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </Card>

              {/* Fotos */}
              <Card>
                <div className="flex items-center gap-2 mb-1">
                  <Camera className={`h-4 w-4 ${tw.text.brand}`} />
                  <h3 className={`text-sm font-semibold ${tw.text.primary}`}>Fotos de los ambientes y muebles <span className={tw.text.faint}>(obligatorio)</span></h3>
                </div>
                <p className={`text-xs mb-3 ${tw.text.secondary}`}>
                  Se usan para estimar el volumen de la mudanza.
                </p>
                <div className="grid grid-cols-3 min-[425px]:grid-cols-5 gap-2">
                  {imagenes.map((img, index) => (
                    <div key={index} className="relative aspect-square">
                      <img src={img} alt={`Foto ${index + 1}`} className="h-full w-full rounded-xl object-cover" />
                      <button
                        onClick={() => removeImage(index)}
                        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600 transition cursor-pointer"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  {imagenes.length < 5 && (
                    <label className="aspect-square cursor-pointer">
                      <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" multiple />
                      <div className={`flex h-full w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed transition
                        border-slate-200 dark:border-dark-border
                        hover:border-brand-400 dark:hover:border-dark-brand
                        hover:bg-brand-50 dark:hover:bg-dark-elevated`}>
                        <Plus className={`h-5 w-5 ${tw.text.faint}`} />
                        <span className={`text-[10px] ${tw.text.muted}`}>Agregar</span>
                      </div>
                    </label>
                  )}
                </div>
                <p className={`mt-1.5 text-xs ${tw.text.muted}`}>Máximo 5 fotos</p>
              </Card>

              {/* Notas */}
              <Card>
                <label className={tw.label}>Notas adicionales <span className={tw.text.faint}>(opcional)</span></label>
                <textarea
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  placeholder="Ej: Hay un piano, muebles frágiles, objetos pesados..."
                  className={tw.textarea + " min-h-20"}
                />
              </Card>

              <Button
                fullWidth
                onClick={handleGoToStep2}
              >
                <span className="flex items-center justify-center gap-2">
                  Elegir plan <ArrowRight className="h-4 w-4" />
                </span>
              </Button>
            </div>
          )}

          {/* ═══════ STEP 2: Tiers ═══════ */}
          {step === 2 && (
            <div className="space-y-3">
              {loadingTiers ? (
                <div className="flex justify-center py-12">
                  <Loader2 className={`h-6 w-6 animate-spin ${tw.text.brand}`} />
                </div>
              ) : (
                tiers.map((tier) => {
                  const colors = TIER_COLORS[tier.nombre] || TIER_COLORS.PLATA;
                  const selected = selectedTier?.id === tier.id;

                  return (
                    <div
                      key={tier.id}
                      onClick={() => setSelectedTier(tier)}
                      className={`cursor-pointer rounded-2xl border-2 p-4 sm:p-5 transition-all ${
                        selected
                          ? `${colors.border} ${colors.bg} ring-2 ring-offset-1 ring-brand-500/30 dark:ring-dark-brand/30 dark:ring-offset-dark-bg`
                          : `border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface hover:${colors.border}`
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xl">{tier.emoji}</span>
                            <h3 className={`text-base font-bold ${tw.text.primary}`}>{tier.nombre}</h3>
                            {selected && <CheckCircle className="h-4 w-4 text-green-500" />}
                          </div>
                          <p className={`text-sm ${tw.text.secondary}`}>{tier.descripcion}</p>
                          <p className={`text-xs mt-2 leading-relaxed ${tw.text.muted}`}>{tier.descripcionCompleta}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-lg font-bold ${colors.accent}`}>{formatPrice(tier.precioBase)}</p>
                          <p className={`text-[10px] ${tw.text.muted}`}>
                            Mín. {tier.minutosIncluidos / 60}h
                          </p>
                          <p className={`text-[10px] ${tw.text.muted}`}>
                            +{formatPrice(tier.precioBloque30Min)}/30min extra
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}

              <Button
                fullWidth
                onClick={() => setStep(3)}
                disabled={!canGoToStep3}
              >
                <span className="flex items-center justify-center gap-2">
                  Ver resumen <ArrowRight className="h-4 w-4" />
                </span>
              </Button>
            </div>
          )}

          {/* ═══════ STEP 3: Resumen + Pagar ═══════ */}
          {step === 3 && selectedTier && (
            <div className="space-y-4">
              <Card>
                <h3 className={`text-sm font-semibold mb-3 ${tw.text.primary}`}>Resumen de tu mudanza</h3>

                <div className="space-y-3">
                  {/* Plan */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{selectedTier.emoji}</span>
                      <div>
                        <p className={`text-sm font-semibold ${tw.text.primary}`}>Plan {selectedTier.nombre}</p>
                        <p className={`text-xs ${tw.text.muted}`}>{selectedTier.descripcion}</p>
                      </div>
                    </div>
                    <p className={`text-base font-bold ${tw.text.brand}`}>{formatPrice(selectedTier.precioBase)}</p>
                  </div>

                  <div className={`border-t ${tw.dividerLight}`} />

                  {/* Fecha */}
                  <div>
                    <p className={`text-xs ${tw.text.muted}`}>Fecha</p>
                    <p className={`text-sm font-medium ${tw.text.primary}`}>{formatFecha(fechaDeseada)}</p>
                  </div>

                  <div className={`border-t ${tw.dividerLight}`} />

                  {/* Origen */}
                  <div className="flex items-start gap-2">
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 text-[10px] font-bold mt-0.5">A</div>
                    <div className="min-w-0">
                      <p className={`text-xs ${tw.text.muted}`}>Origen</p>
                      <p className={`text-sm font-medium ${tw.text.primary} break-words`}>{origen.direccion}</p>
                    </div>
                  </div>

                  {/* Destino */}
                  <div className="flex items-start gap-2">
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 dark:bg-dark-brand/20 text-brand-600 dark:text-dark-brand text-[10px] font-bold mt-0.5">B</div>
                    <div className="min-w-0">
                      <p className={`text-xs ${tw.text.muted}`}>Destino</p>
                      <p className={`text-sm font-medium ${tw.text.primary} break-words`}>{destino.direccion}</p>
                    </div>
                  </div>

                  <div className={`border-t ${tw.dividerLight}`} />

                  {/* Detalles */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className={`text-xs ${tw.text.muted}`}>Ambientes</p>
                      <p className={`text-sm font-medium ${tw.text.primary}`}>{cantidadAmbientes}</p>
                    </div>
                    <div>
                      <p className={`text-xs ${tw.text.muted}`}>Pisos escalera</p>
                      <p className={`text-sm font-medium ${tw.text.primary}`}>{pisos === 0 ? "PB" : `${pisos} piso${pisos > 1 ? "s" : ""}`}</p>
                    </div>
                    <div>
                      <p className={`text-xs ${tw.text.muted}`}>Ascensor</p>
                      <p className={`text-sm font-medium ${tw.text.primary}`}>{tieneAscensor ? "Sí" : "No"}</p>
                    </div>
                    <div>
                      <p className={`text-xs ${tw.text.muted}`}>Fotos</p>
                      <p className={`text-sm font-medium ${tw.text.primary}`}>{imagenes.length} foto{imagenes.length > 1 ? "s" : ""}</p>
                    </div>
                    <div>
                      <p className={`text-xs ${tw.text.muted}`}>Tiempo incluido</p>
                      <p className={`text-sm font-medium ${tw.text.primary}`}>{selectedTier.minutosIncluidos / 60} horas</p>
                    </div>
                  </div>

                  {notas && (
                    <>
                      <div className={`border-t ${tw.dividerLight}`} />
                      <div>
                        <p className={`text-xs ${tw.text.muted}`}>Notas</p>
                        <p className={`text-sm ${tw.text.secondary}`}>{notas}</p>
                      </div>
                    </>
                  )}
                </div>
              </Card>

              {/* Info box */}
              <div className={`rounded-xl p-3 ${tw.infoBox}`}>
                <p className={`${tw.text.secondary}`}>Importante!</p>
                <p className={`text-xs leading-relaxed ${tw.text.secondary}`}>
                  Al confirmar, aceptás que si la mudanza excede las {selectedTier.minutosIncluidos / 60} horas incluidas,
                  se cobrarán bloques de 30 minutos a {formatPrice(selectedTier.precioBloque30Min)} cada uno.
                </p>
              </div>

              <Button
                fullWidth
                onClick={() => crearMudanzaMutation.mutate()}
                disabled={crearMudanzaMutation.isPending}
              >
                {crearMudanzaMutation.isPending
                  ? "Procesando..."
                  : `Pagar ${formatPrice(selectedTier.precioBase)}`
                }
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// Componente reutilizable para dirección
// ═══════════════════════════════════════════

function AddressInput({ geo, placeholder }: { geo: ReturnType<typeof useGeocode>; placeholder: string }) {
  return (
    <div>
      <div className="flex flex-col gap-2 min-[375px]:flex-row">
        <input
          type="text"
          value={geo.direccion}
          onChange={(e) => geo.handleDireccionChange(e.target.value)}
          onFocus={() => geo.sugerencias.length > 0 && geo.setShowSugerencias(true)}
          onBlur={() => setTimeout(() => geo.setShowSugerencias(false), 200)}
          placeholder={placeholder}
          className={tw.input + " flex-1 min-w-0"}
        />
        <Button
          onClick={() => geo.obtenerUbicacionGPS()}
          disabled={geo.gettingLocation}
          className="shrink-0 w-full min-[375px]:w-auto"
        >
          <span className="flex items-center justify-center gap-1.5">
            {geo.gettingLocation ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
            <span className="min-[375px]:hidden">Usar GPS</span>
          </span>
        </Button>
      </div>

      {/* Sugerencias */}
      {geo.showSugerencias && geo.sugerencias.length > 0 && (
        <div className={`relative z-10 mt-1 w-full ${tw.dropdown}`}>
          {geo.sugerencias.map((s: any, i: number) => (
            <button
              key={i}
              onMouseDown={() => geo.seleccionarSugerencia(s)}
              className={`flex w-full items-start gap-2 px-4 py-3 text-left text-sm transition cursor-pointer border-b last:border-0 ${tw.dividerLight} hover:bg-slate-50 dark:hover:bg-dark-elevated`}
            >
              <MapPin className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${tw.text.faint}`} />
              <span className={`text-sm ${tw.text.secondary}`}>{s.description}</span>
            </button>
          ))}
        </div>
      )}

      {/* GPS confirmado */}
      {geo.coords && (
        <div className="mt-1.5 flex items-center gap-1 text-green-600 dark:text-green-400">
          <CheckCircle className="h-3 w-3" />
          <span className="text-xs font-medium">Ubicación confirmada</span>
        </div>
      )}
    </div>
  );
}

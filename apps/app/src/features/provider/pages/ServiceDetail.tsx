import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card } from "@/shared/components/ui/Card";
import { Button } from "@/shared/components/ui/Button";
import { Badge } from "@/shared/components/ui/Badge";
import { tw } from "@/shared/styles/design-system";
import { ROUTES } from "@/shared/constants/routes";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getToken } from "@/shared/lib/getToken";
import { useGeocode } from "@/shared/hooks/useGeocode";
import { MapPin, Clock, DollarSign, FileText, X, Loader2, User, CheckCircle } from "lucide-react";
import toast from "react-hot-toast";

const TIEMPOS_ESTIMADOS = [
  { value: 30,  label: "30 minutos"     },
  { value: 60,  label: "1 hora"         },
  { value: 90,  label: "1h 30 min"      },
  { value: 120, label: "2 horas"        },
  { value: 150, label: "2h 30 min"      },
  { value: 180, label: "3 horas"        },
];

export function ServiceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [tiempoEstimado, setTiempoEstimado] = useState<number | null>(null);
  const [showLocationInput, setShowLocationInput] = useState(false);
  const geo = useGeocode();

  const { data: trabajo, isLoading } = useQuery({
    queryKey: ['trabajo', id],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/trabajos/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Error al cargar trabajo');
      return res.json();
    },
  });

  const handleObtenerGPS = async () => {
    const result = await geo.obtenerUbicacionGPS();
    if (result) setShowLocationInput(false);
    else setShowLocationInput(true);
  };

  const proponerMutation = useMutation({
    mutationFn: async () => {
      if (!tiempoEstimado) throw new Error('Seleccioná un tiempo estimado de llegada');
      const token = await getToken();
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/trabajos/${id}/proponer`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          tiempoEstimadoMinutos: tiempoEstimado,
          latitud: geo.coords?.lat ?? null,
          longitud: geo.coords?.lng ?? null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trabajos-pendientes'] });
      toast.success('Propuesta enviada al cliente');
      navigate(ROUTES.PROVIDER.DASHBOARD);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rechazarMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/trabajos/${id}/rechazar`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trabajos-pendientes'] });
      toast.success('Trabajo rechazado');
      navigate(ROUTES.PROVIDER.DASHBOARD);
    },
    onError: () => toast.error('Error al rechazar el trabajo'),
  });

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

  let fotos: string[] = [];
  if (trabajo.fotos) {
    try { fotos = JSON.parse(trabajo.fotos); }
    catch { fotos = Array.isArray(trabajo.fotos) ? trabajo.fotos : [trabajo.fotos]; }
  }

  return (
    <div className={tw.pageBg}>
      <div className={tw.container}>

        {/* Lightbox */}
        {selectedImage && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
            onClick={() => setSelectedImage(null)}
          >
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute top-4 right-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition"
            >
              <X className="h-5 w-5 text-white" />
            </button>
            <img
              src={selectedImage} alt="Foto ampliada"
              className="max-w-full max-h-[90vh] object-contain rounded-xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}

        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className={`text-2xl font-bold ${tw.text.primary}`}>Detalle del trabajo</h1>
            <div className="mt-1.5">
              <Badge variant="warning">Pendiente de respuesta</Badge>
            </div>
          </div>
          <Button variant="outline" onClick={() => navigate(ROUTES.PROVIDER.DASHBOARD)}>← Volver</Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">

          {/* Info principal */}
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <h3 className={`mb-4 text-xs font-semibold uppercase tracking-wider ${tw.text.muted}`}>
                Información del cliente
              </h3>
              <div className="space-y-4">

                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tw.iconBg.brand} text-brand-600 dark:text-dark-brand`}>
                    <User className="h-4 w-4" />
                  </div>
                  <div>
                    <p className={`text-xs ${tw.text.muted}`}>Cliente</p>
                    <p className={`text-sm font-semibold ${tw.text.primary}`}>{trabajo.clienteNombre}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tw.iconBg.slate}`}>
                    <FileText className={`h-4 w-4 ${tw.text.faint}`} />
                  </div>
                  <div>
                    <p className={`text-xs ${tw.text.muted}`}>Servicio · {trabajo.oficio.nombre}</p>
                    <p className={`text-sm ${tw.text.primary}`}>{trabajo.descripcion}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tw.iconBg.green} text-green-600 dark:text-green-400`}>
                    <MapPin className="h-4 w-4" />
                  </div>
                  <div>
                    <p className={`text-xs ${tw.text.muted}`}>Dirección</p>
                    <p className={`text-sm ${tw.text.primary}`}>{trabajo.direccion}</p>
                  </div>
                </div>

              </div>
            </Card>

            {fotos.length > 0 && (
              <Card>
                <h3 className={`mb-3 text-xs font-semibold uppercase tracking-wider ${tw.text.muted}`}>
                  Fotos del problema ({fotos.length})
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  {fotos.map((url: string, i: number) => (
                    <button
                      key={i}
                      onClick={() => setSelectedImage(url)}
                      className="group relative aspect-square overflow-hidden rounded-xl cursor-pointer"
                    >
                      <img src={url} alt={`Foto ${i + 1}`} className="h-full w-full object-cover transition group-hover:scale-105" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition flex items-center justify-center">
                        <span className="text-white text-xs font-medium opacity-0 group-hover:opacity-100 transition">Ver ampliada</span>
                      </div>
                    </button>
                  ))}
                </div>
              </Card>
            )}
          </div>

          {/* Sidebar acciones */}
          <div className="space-y-4">

            {/* Tiempo estimado */}
            <Card>
              <div className="mb-3 flex items-center gap-3">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tw.iconBg.brand} text-brand-600 dark:text-dark-brand`}>
                  <Clock className="h-4 w-4" />
                </div>
                <div>
                  <p className={`text-sm font-semibold ${tw.text.primary}`}>Tiempo de llegada</p>
                  <p className={`text-xs ${tw.text.muted}`}>¿En cuánto podés llegar?</p>
                </div>
              </div>
              <select
                value={tiempoEstimado ?? ""}
                onChange={(e) => setTiempoEstimado(e.target.value ? Number(e.target.value) : null)}
                className={tw.select}
              >
                <option value="">Seleccionar tiempo...</option>
                {TIEMPOS_ESTIMADOS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </Card>

            {/* Tarifa */}
            <Card>
              <div className="flex items-center gap-3">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tw.iconBg.green} text-green-600 dark:text-green-400`}>
                  <DollarSign className="h-4 w-4" />
                </div>
                <div>
                  <p className={`text-xs ${tw.text.muted}`}>Tarifa de visita</p>
                  <p className="text-xl font-bold text-green-600 dark:text-green-400">$15.000</p>
                </div>
              </div>
            </Card>

            {/* Ubicación */}
            <Card>
              <h3 className={`mb-3 text-sm font-semibold ${tw.text.primary}`}>
                Tu ubicación{' '}
                <span className={`text-xs font-normal ${tw.text.faint}`}>(opcional)</span>
              </h3>

              {geo.coords ? (
                <div className="space-y-2">
                  <div className={`flex items-start gap-2 rounded-xl p-3 ${tw.iconBg.green}`}>
                    <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
                    <div>
                      <p className="text-xs font-medium text-green-800 dark:text-green-300">Ubicación confirmada</p>
                      {geo.direccion && <p className="mt-0.5 text-xs text-green-700 dark:text-green-400">{geo.direccion}</p>}
                    </div>
                  </div>
                  <button
                    onClick={() => { geo.reset(); setShowLocationInput(false); }}
                    className={`w-full text-center text-xs cursor-pointer transition ${tw.text.secondary} hover:${tw.text.primary}`}
                  >
                    Cambiar ubicación
                  </button>
                </div>
              ) : !showLocationInput ? (
                <div className="space-y-2">
                  <Button fullWidth variant="outline" onClick={handleObtenerGPS} disabled={geo.gettingLocation}>
                    {geo.gettingLocation
                      ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Obteniendo...</>
                      : <><MapPin className="mr-2 h-4 w-4" />Usar GPS</>
                    }
                  </Button>
                  <button
                    onClick={() => setShowLocationInput(true)}
                    className={`w-full text-center text-xs cursor-pointer transition ${tw.text.brand} hover:opacity-70`}
                  >
                    Ingresar dirección manualmente
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="relative">
                    <input
                      type="text"
                      value={geo.direccion}
                      onChange={(e) => geo.handleDireccionChange(e.target.value)}
                      onFocus={() => geo.sugerencias.length > 0 && geo.setShowSugerencias(true)}
                      onBlur={() => setTimeout(() => geo.setShowSugerencias(false), 200)}
                      placeholder="San Martín 1234, Rosario"
                      className={tw.input + " text-sm"}
                    />
                    {geo.showSugerencias && geo.sugerencias.length > 0 && (
                      <div className={`absolute z-10 mt-1 w-full ${tw.dropdown}`}>
                        {geo.sugerencias.map((s: any, i: number) => (
                          <button
                            key={i}
                            onMouseDown={() => geo.seleccionarSugerencia(s)}
                            className={`flex w-full items-start gap-2 px-4 py-3 text-left text-xs transition cursor-pointer border-b last:border-0 ${tw.dividerLight} hover:bg-slate-50 dark:hover:bg-dark-elevated`}
                          >
                            <MapPin className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${tw.text.faint}`} />
                            <span className={tw.text.secondary}>{s.description}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button fullWidth onClick={() => geo.geocodificarDireccion().then(r => r && setShowLocationInput(false))} disabled={geo.gettingLocation}>
                      {geo.gettingLocation ? 'Buscando...' : 'Confirmar'}
                    </Button>
                    <Button variant="outline" onClick={() => setShowLocationInput(false)}>Cancelar</Button>
                  </div>
                </div>
              )}
            </Card>

            {/* Acciones */}
            <div className="space-y-2">
              <Button
                variant="success" fullWidth
                onClick={() => proponerMutation.mutate()}
                disabled={proponerMutation.isPending || !tiempoEstimado}
              >
                {proponerMutation.isPending ? 'Enviando propuesta...' : 'Proponer trabajo'}
              </Button>
              <Button
                variant="error" fullWidth
                onClick={() => rechazarMutation.mutate()}
                disabled={rechazarMutation.isPending}
              >
                {rechazarMutation.isPending ? 'Rechazando...' : 'Rechazar'}
              </Button>
            </div>

            <p className={`text-center text-xs ${tw.text.muted}`}>
              {tiempoEstimado
                ? 'El cliente recibirá tu propuesta y podrá aceptar o rechazar.'
                : 'Seleccioná un tiempo estimado para enviar la propuesta.'
              }
            </p>

          </div>
        </div>
      </div>
    </div>
  );
}

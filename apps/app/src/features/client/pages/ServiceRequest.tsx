import { useState, type JSX } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card } from "@/shared/components/ui/Card";
import { Button } from "@/shared/components/ui/Button";
import { tw } from "@/shared/styles/design-system";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getToken } from "@/shared/lib/getToken";
import { useGeocode } from "@/shared/hooks/useGeocode";
import { MapPin, Loader2, Plus, X, CheckCircle } from "lucide-react";
import toast from "react-hot-toast";
import { ROUTES } from "@/shared/constants/routes";

// ── SVG icons por oficio ──
const OFICIO_ICONS: Record<number, JSX.Element> = {
  1: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2L4.5 13.5H12L11 22L19.5 10.5H12L13 2Z" />
    </svg>
  ),
  2: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
    </svg>
  ),
  3: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  ),
  4: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2c0 6-6 8-6 13a6 6 0 0012 0c0-5-6-7-6-13z" />
      <path d="M9 17.5c0 1.5 1.5 2.5 3 2.5s3-1 3-2.5" />
    </svg>
  ),
};

const IconoGenerico = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
  </svg>
);

export function ServiceRequest() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const oficioIdParam = searchParams.get('oficioId');
  const queryClient = useQueryClient();

  const [selectedOficio, setSelectedOficio] = useState<number | null>(
    oficioIdParam ? Number(oficioIdParam) : null
  );
  const [description, setDescription] = useState("");
  const [imagenes, setImagenes] = useState<string[]>([]);

  const geo = useGeocode();

  const { data: oficios = [] } = useQuery({
    queryKey: ['oficios'],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/oficios`);
      if (!res.ok) throw new Error('Error al cargar oficios');
      return res.json();
    },
  });

  const crearTrabajoMutation = useMutation({
    mutationFn: async () => {
      if (!selectedOficio || !description.trim() || !geo.direccion.trim()) {
        throw new Error('Completá todos los campos requeridos');
      }
      let finalCoords = geo.coords;
      if (!finalCoords && geo.direccion.trim()) {
        const result = await geo.geocodificarDireccion();
        if (!result) throw new Error('No se pudo geocodificar la dirección');
        finalCoords = result;
      }
      if (!finalCoords) throw new Error('No se pudo determinar la ubicación');

      const token = await getToken();
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/trabajos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          oficioId: selectedOficio,
          descripcion: description,
          direccion: geo.direccion,
          latitudCliente: finalCoords.lat,
          longitudCliente: finalCoords.lng,
          fotos: imagenes.length > 0 ? JSON.stringify(imagenes) : null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (trabajo) => {
      queryClient.invalidateQueries({ queryKey: ['trabajos-cliente'] });
      toast.success('Solicitud enviada. Buscando proveedor disponible...');
      navigate(ROUTES.CLIENT.TRACKING(trabajo.id));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    if (imagenes.length + files.length > 3) { toast.error('Máximo 3 fotos permitidas'); return; }
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => setImagenes((prev) => [...prev, reader.result as string]);
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) =>
    setImagenes((prev) => prev.filter((_, i) => i !== index));

  const oficiSelected = oficios.find((o: any) => o.id === selectedOficio);

  return (
    <div className={tw.pageBg}>
      <div className={tw.container}>
        <div className="mx-auto max-w-5xl">

          {/* Header */}
          <div className="mb-6 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className={`text-xl min-[375px]:text-2xl font-bold ${tw.text.primary}`}>Solicitar servicio</h1>
              <p className={`mt-0.5 text-xs min-[375px]:text-sm ${tw.text.secondary}`}>
                Completá los datos y te conectamos con un profesional
              </p>
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

            {/* Resumen — en mobile va DEBAJO del formulario via order */}
            <Card className="lg:col-span-1 h-fit order-2 lg:order-1">
              <h2 className={`mb-3 text-xs font-semibold uppercase tracking-wider ${tw.text.muted}`}>
                Resumen
              </h2>
              <div className="space-y-3">

                {/* Servicio */}
                <div className="flex items-center gap-3">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tw.iconBg.brand} text-brand-600 dark:text-dark-brand`}>
                    {OFICIO_ICONS[selectedOficio ?? 0] ?? <IconoGenerico />}
                  </div>
                  <div className="min-w-0">
                    <p className={`text-xs ${tw.text.muted}`}>Servicio</p>
                    <p className={`text-sm font-semibold truncate ${tw.text.primary}`}>
                      {oficiSelected?.nombre || 'Sin seleccionar'}
                    </p>
                  </div>
                </div>

                <div className={`border-t ${tw.dividerLight}`} />

                {/* Ubicación */}
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tw.iconBg.green} text-green-600 dark:text-green-400`}>
                    <MapPin className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs ${tw.text.muted}`}>Ubicación</p>
                    {geo.direccion ? (
                      <>
                        {/* Mostramos la dirección en 2 líneas controladas, no truncate */}
                        <p className={`text-sm font-semibold leading-snug wrap-break-word ${tw.text.primary}`}>
                          {geo.direccion}
                        </p>
                        {geo.coords && (
                          <div className="mt-1 flex items-center gap-1 text-green-600 dark:text-green-400">
                            <CheckCircle className="h-3 w-3 shrink-0" />
                            <span className="text-xs font-medium">GPS confirmado</span>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className={`text-sm font-semibold ${tw.text.faint}`}>Sin dirección</p>
                    )}
                  </div>
                </div>
              </div>
            </Card>

            {/* Formulario — en mobile va PRIMERO */}
            <Card className="lg:col-span-2 order-1 lg:order-2">
              <div className="mb-5">
                <h2 className={`mb-1 text-base min-[375px]:text-lg font-semibold ${tw.text.primary}`}>
                  Detalles del servicio
                </h2>
                <p className={`text-xs min-[375px]:text-sm ${tw.text.secondary}`}>
                  Completá la información para solicitar un profesional
                </p>
              </div>

              {/* Tipo de servicio */}
              <div className="mb-4">
                <label className={tw.label}>Tipo de servicio *</label>
                <select
                  value={selectedOficio ?? ""}
                  onChange={(e) => setSelectedOficio(Number(e.target.value))}
                  className={tw.select}
                >
                  <option value="" disabled>Seleccioná un servicio</option>
                  {oficios.map((oficio: any) => (
                    <option key={oficio.id} value={oficio.id}>{oficio.nombre}</option>
                  ))}
                </select>
              </div>

              {/* Dirección */}
              <div className="mb-4">
                <label className={tw.label}>Dirección *</label>
                <div className="relative">
                  {/* Input en fila propia, botón GPS abajo en mob s — fila en mob m+ */}
                  <div className="flex flex-col gap-2 min-[375px]:flex-row">
                    <input
                      type="text"
                      value={geo.direccion}
                      onChange={(e) => geo.handleDireccionChange(e.target.value)}
                      onFocus={() => geo.sugerencias.length > 0 && geo.setShowSugerencias(true)}
                      onBlur={() => setTimeout(() => geo.setShowSugerencias(false), 200)}
                      placeholder="Bv. Oroño 1234, Rosario"
                      className={tw.input + " flex-1 min-w-0"}
                    />
                    <Button
                      onClick={() => geo.obtenerUbicacionGPS()}
                      disabled={geo.gettingLocation}
                      className="shrink-0 w-full min-[375px]:w-auto"
                    >
                      <span className="flex items-center justify-center gap-1.5">
                        {geo.gettingLocation
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <MapPin className="h-4 w-4" />
                        }
                        <span className="min-[375px]:hidden">Usar GPS</span>
                      </span>
                    </Button>
                  </div>

                  {geo.showSugerencias && geo.sugerencias.length > 0 && (
                    <div className={`absolute z-10 mt-1 w-full ${tw.dropdown}`}>
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
                </div>
                {geo.coords && (
                  <div className="mt-1.5 flex items-center gap-1 text-green-600 dark:text-green-400">
                    <CheckCircle className="h-3 w-3" />
                    <span className="text-xs font-medium">Ubicación confirmada</span>
                  </div>
                )}
              </div>

              {/* Descripción */}
              <div className="mb-5">
                <label className={tw.label}>Descripción del problema *</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describí el problema con el mayor detalle posible..."
                  className={tw.textarea + " min-h-32"}
                />
              </div>

              {/* Fotos */}
              <div className="mb-5">
                <label className={tw.label}>
                  Fotos del problema <span className={tw.text.faint}>(opcional)</span>
                </label>
                <div className="grid grid-cols-3 gap-2 min-[375px]:gap-3">
                  {imagenes.map((img, index) => (
                    <div key={index} className="relative aspect-square">
                      <img
                        src={img}
                        alt={`Foto ${index + 1}`}
                        className="h-full w-full rounded-xl object-cover"
                      />
                      <button
                        onClick={() => removeImage(index)}
                        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600 transition cursor-pointer"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  {imagenes.length < 3 && (
                    <label className="aspect-square cursor-pointer">
                      <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" multiple />
                      <div className={`flex h-full w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed transition
                        border-slate-200 dark:border-dark-border
                        hover:border-brand-400 dark:hover:border-dark-brand
                        hover:bg-brand-50 dark:hover:bg-dark-elevated`}>
                        <Plus className={`h-5 w-5 min-[375px]:h-6 min-[375px]:w-6 ${tw.text.faint}`} />
                        <span className={`text-xs ${tw.text.muted}`}>Agregar</span>
                      </div>
                    </label>
                  )}
                </div>
                <p className={`mt-1.5 text-xs ${tw.text.muted}`}>Máximo 3 fotos</p>
              </div>

              <Button
                fullWidth
                onClick={() => crearTrabajoMutation.mutate()}
                disabled={crearTrabajoMutation.isPending || !selectedOficio || !description.trim() || !geo.direccion.trim()}
              >
                {crearTrabajoMutation.isPending ? 'Enviando...' : 'Solicitar servicio'}
              </Button>
            </Card>

          </div>
        </div>
      </div>
    </div>
  );
}

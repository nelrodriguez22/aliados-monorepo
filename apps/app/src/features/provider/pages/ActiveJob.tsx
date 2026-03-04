import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getToken } from "@/shared/lib/getToken";
import { Card } from "@/shared/components/ui/Card";
import { Button } from "@/shared/components/ui/Button";
import { Badge } from "@/shared/components/ui/Badge";
import { tw } from "@/shared/styles/design-system";
import { ROUTES } from "@/shared/constants/routes";
import { MapPin, Clock, User, X, Loader2, FileText, Navigation } from "lucide-react";
import toast from "react-hot-toast";
import { formatTime } from "@/shared/lib/dayjs";
import { useStore } from "@/shared/store/useStore";

export function ActiveJob() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const updateUserStatus = useStore((state) => state.updateUserStatus);

  const { data: trabajo, isLoading } = useQuery({
    queryKey: ['trabajo', id],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/trabajos/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Error al cargar el trabajo');
      return res.json();
    },
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });

  const completarMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/trabajos/${id}/completar`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Error al completar trabajo');
      return res.json();
    },
    onSuccess: async () => {
      queryClient.setQueryData(['trabajo-activo'], null);
      queryClient.removeQueries({ queryKey: ['trabajo-activo'] });
      queryClient.invalidateQueries({ queryKey: ['trabajos-completados'] });
      queryClient.invalidateQueries({ queryKey: ['trabajos-en-cola'] });
      try {
        const token = await getToken();
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/users/me`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) { const d = await res.json(); updateUserStatus(d.status || 'ONLINE'); }
      } catch { /* WebSocket lo actualizará */ }
      navigate(ROUTES.PROVIDER.DASHBOARD);
    },
    onError: () => toast.error('Error al completar el trabajo'),
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
            <h1 className={`text-2xl font-bold ${tw.text.primary}`}>Trabajo en curso</h1>
            <div className="mt-1.5">
              <Badge variant="info" showPulse>En curso</Badge>
            </div>
          </div>
          <Button variant="outline" onClick={() => navigate(ROUTES.PROVIDER.DASHBOARD)}>← Volver</Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">

            {/* Info trabajo */}
            <Card>
              <h3 className={`mb-4 text-xs font-semibold uppercase tracking-wider ${tw.text.muted}`}>
                Información del servicio
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
                  <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tw.iconBg.green} text-green-600 dark:text-green-400`}>
                    <MapPin className="h-4 w-4" />
                  </div>
                  <div>
                    <p className={`text-xs ${tw.text.muted}`}>Dirección</p>
                    <p className={`text-sm ${tw.text.primary}`}>{trabajo.direccion}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tw.iconBg.slate}`}>
                    <FileText className={`h-4 w-4 ${tw.text.faint}`} />
                  </div>
                  <div>
                    <p className={`text-xs ${tw.text.muted}`}>Descripción</p>
                    <p className={`text-sm ${tw.text.primary}`}>{trabajo.descripcion}</p>
                  </div>
                </div>

              </div>
            </Card>

            {/* Fotos */}
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
                        <span className="text-xs text-white font-medium opacity-0 group-hover:opacity-100 transition">Ver</span>
                      </div>
                    </button>
                  ))}
                </div>
              </Card>
            )}

            {/* Mapa */}
            <Card>
              <div className="mb-4 flex items-center justify-between">
                <h3 className={`text-sm font-semibold ${tw.text.primary}`}>Ubicación del cliente</h3>
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${trabajo.latitudCliente},${trabajo.longitudCliente}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="primary" className="text-xs gap-1.5">
                    <Navigation className="h-3.5 w-3.5" />
                    Navegar
                  </Button>
                </a>
              </div>
              <div className="aspect-video overflow-hidden rounded-xl bg-slate-100 dark:bg-dark-elevated">
                <iframe
                  width="100%" height="100%"
                  style={{ border: 0 }}
                  loading="lazy"
                  src={`https://www.google.com/maps?q=${trabajo.latitudCliente},${trabajo.longitudCliente}&output=embed`}
                  title="Ubicación del cliente"
                />
              </div>
            </Card>

          </div>

          {/* Sidebar */}
          <div className="space-y-4">

            {/* Tiempo */}
            <Card>
              <h3 className={`mb-4 text-xs font-semibold uppercase tracking-wider ${tw.text.muted}`}>
                Tiempo del servicio
              </h3>
              <div className="space-y-3">
                {trabajo.acceptedAt && (
                  <div className="flex items-center gap-3">
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tw.iconBg.brand} text-brand-600 dark:text-dark-brand`}>
                      <Clock className="h-4 w-4" />
                    </div>
                    <div>
                      <p className={`text-xs ${tw.text.muted}`}>Aceptado a las</p>
                      <p className={`text-sm font-semibold ${tw.text.primary}`}>{formatTime(trabajo.acceptedAt)}</p>
                    </div>
                  </div>
                )}
                {trabajo.tiempoEstimadoMinutos && (
                  <div className="flex items-center gap-3">
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tw.iconBg.green} text-green-600 dark:text-green-400`}>
                      <MapPin className="h-4 w-4" />
                    </div>
                    <div>
                      <p className={`text-xs ${tw.text.muted}`}>Tiempo estimado de arribo</p>
                      <p className="text-sm font-semibold text-green-600 dark:text-green-400">
                        ~{trabajo.tiempoEstimadoMinutos} min
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </Card>

            {/* Notas */}
            <Card>
              <label className={tw.label}>Notas del trabajo</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={tw.textarea + " min-h-24 text-sm mt-1.5"}
                placeholder="Anotá detalles sobre el trabajo realizado..."
              />
            </Card>

            {/* Completar */}
            <Card>
              <p className={`text-xs mb-3 ${tw.text.secondary}`}>
                Una vez finalizado el servicio, marcá el trabajo como completado.
              </p>
              <Button
                fullWidth variant="success"
                onClick={() => completarMutation.mutate()}
                disabled={completarMutation.isPending}
              >
                {completarMutation.isPending ? 'Completando...' : 'Marcar como completado'}
              </Button>
            </Card>

          </div>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTrabajo } from "@/shared/hooks/useTrabajo";
import { Card } from "@/shared/components/ui/Card";
import { Button } from "@/shared/components/ui/Button";
import { ErrorState } from "@/shared/components/ui/ErrorState";
import { Badge } from "@/shared/components/ui/Badge";
import { ServicioIdBadge } from "@/shared/components/ServicioIdBadge";
import { ChatPanel } from "@/shared/components/chat/ChatPanel";
import { ImageLightbox } from "@/shared/components/ui/ImageLightbox";
import { tw } from "@/shared/styles/design-system";
import { ROUTES } from "@/shared/constants/routes";
import { useStore } from "@/shared/store/useStore";
import { MapPin, Clock, User, Loader2, FileText, Navigation } from "lucide-react";
import { formatTime } from "@/shared/lib/dayjs";

export function ActiveJob() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useStore();
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const { data: trabajo, isLoading, isError, error, refetch } = useTrabajo(id, {
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });

  if (isLoading || !user) {
    return (
      <div className={`flex h-64 items-center justify-center ${tw.pageBg}`}>
        <Loader2 className="h-7 w-7 animate-spin text-brand-600 dark:text-dark-brand" />
      </div>
    );
  }
  if (isError) {
    return (
      <ErrorState
        title="No pudimos cargar el trabajo"
        message={(error as Error)?.message || 'Ocurrió un error al obtener el trabajo.'}
        onRetry={() => refetch()}
        onBack={() => navigate(ROUTES.PROVIDER.DASHBOARD)}
        backLabel="Volver al inicio"
      />
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

  // Misma regla que el backend (PATCH /presupuestar rechaza lo que no esté EN_CURSO) y que
  // PresupuestoTrabajo. Acá se aplica ANTES: si el presupuesto ya salió, el botón no lleva a
  // un formulario que sólo va a rebotar con un toast.
  const puedePresupuestar = trabajo.estado === "EN_CURSO";

  return (
    <div className={tw.pageBg}>
      <div className={tw.containerWide}>

        {selectedImage && (
          <ImageLightbox
            src={selectedImage}
            alt="Foto del problema"
            onClose={() => setSelectedImage(null)}
          />
        )}

        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <div className="flex flex-wrap items-baseline gap-2">
              <h1 className={`text-2xl font-bold ${tw.text.primary}`}>
                {puedePresupuestar ? "Trabajo en curso" : "Presupuesto enviado"}
              </h1>
              <ServicioIdBadge tipo="TRABAJO" id={trabajo.id} />
            </div>
            <div className="mt-1.5">
              {puedePresupuestar
                ? <Badge variant="info" showPulse>En curso</Badge>
                : <Badge variant="success">Esperando al cliente</Badge>}
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

                {/* Los dos tiempos son opcionales: sin ninguno, el separador tampoco va. */}
                {(trabajo.acceptedAt || trabajo.tiempoEstimadoMinutos) && (
                  <div className={`space-y-4 border-t pt-4 ${tw.divider}`}>

                    {trabajo.acceptedAt && (
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tw.iconBg.brand} text-brand-600 dark:text-dark-brand`}>
                          <Clock className="h-4 w-4" />
                        </div>
                        <div>
                          <p className={`text-xs ${tw.text.muted}`}>Aceptado a las</p>
                          <p className={`text-sm font-semibold ${tw.text.primary}`}>{formatTime(trabajo.acceptedAt)}</p>
                        </div>
                      </div>
                    )}

                    {trabajo.tiempoEstimadoMinutos && (
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tw.iconBg.green} text-green-600 dark:text-green-400`}>
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
                )}

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
                <Button variant="primary" className="text-xs px-3 py-1.5">
                  <span className="flex items-center gap-1.5">
                    <Navigation className="h-3.5 w-3.5 shrink-0" />
                    Navegar
                  </span>
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

            {/* Presupuesto */}
            <Card>
              {puedePresupuestar ? (
                <>
                  <p className={`text-xs mb-3 ${tw.text.secondary}`}>
                    Cuando termines de revisar, enviá el presupuesto al cliente.
                  </p>
                  <Button
                    onClick={() => navigate(ROUTES.PROVIDER.PRESUPUESTO(id!))}
                    className="w-full"
                  >
                    Enviar presupuesto
                  </Button>
                </>
              ) : (
                <>
                  <p className={`text-xs ${tw.text.muted}`}>Presupuesto enviado</p>
                  {trabajo.montoPresupuesto != null && (
                    <p className={`mt-0.5 text-2xl font-bold ${tw.text.primary}`}>
                      ${Number(trabajo.montoPresupuesto).toLocaleString("es-AR")}
                    </p>
                  )}
                  <p className={`mt-2 mb-3 text-xs ${tw.text.secondary}`}>
                    Esperando la respuesta del cliente.
                  </p>
                  <Button disabled className="w-full">
                    Presupuesto enviado
                  </Button>
                </>
              )}
            </Card>

          </div>

          {/* Sidebar: solo el chat, exactamente del alto de la columna izquierda.
              En lg el chat va `absolute inset-0`: así NO aporta altura a la fila del grid
              (si no, muchos mensajes la estiran y el chat se pasa de largo del presupuesto).
              La fila la define la columna izquierda y el chat se ajusta a esa caja. */}
          <div className="relative flex flex-col">
            <div className="flex-1 min-h-0 lg:absolute lg:inset-0">
              <ChatPanel
                conversacionId={trabajo.conversacionId ?? null}
                modo={trabajo.chatModo}
                usuarioId={user.id}
                titulo="Chat con el cliente"
                expandido
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/shared/components/ui/Card";
import { Button } from "@/shared/components/ui/Button";
import { tw } from "@/shared/styles/design-system";
import { ROUTES } from "@/shared/constants/routes";
import { getToken } from "@/shared/lib/getToken";
import { Loader2, CheckCircle, Star } from "lucide-react";
import { formatDateTime } from "@/shared/lib/dayjs";
import toast from "react-hot-toast";

export function JobCompleted() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate    = useNavigate();
  const queryClient = useQueryClient();
  const [rating, setRating]   = useState(0);
  const [hover, setHover]     = useState(0);
  const [review, setReview]   = useState("");

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
  });

  const calificarMutation = useMutation({
    mutationFn: async () => {
      if (rating === 0) throw new Error('Seleccioná al menos una estrella');
      const token = await getToken();
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/api/calificaciones/trabajo/${jobId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ estrellas: rating, comentario: review.trim() || null }),
        }
      );
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trabajo', jobId] });
      queryClient.invalidateQueries({ queryKey: ['trabajos-cliente'] });
      toast.success('¡Gracias por tu calificación!');
      navigate(ROUTES.CLIENT.DASHBOARD);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading) {
    return (
      <div className={`flex h-screen items-center justify-center ${tw.pageBg}`}>
        <Loader2 className="h-7 w-7 animate-spin text-brand-600 dark:text-dark-brand" />
      </div>
    );
  }

  if (!trabajo) {
    return <div className={tw.container}><p className={`text-center ${tw.text.secondary}`}>Trabajo no encontrado</p></div>;
  }

  const initials = (name: string) =>
    name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  const STAR_LABELS = ['', 'Muy malo', 'Malo', 'Regular', 'Bueno', 'Excelente'];
  const activeRating = hover || rating;

  const rows = [
    { label: 'Servicio',     value: trabajo.oficio.nombre },
    { label: 'Profesional',  value: trabajo.proveedorNombre },
    { label: 'Dirección',    value: trabajo.direccion },
    { label: 'Completado',   value: trabajo.completedAt ? formatDateTime(trabajo.completedAt) : '—' },
  ];

  return (
    <div className={tw.pageBg}>
      <div className={tw.container}>
        <div className="mx-auto max-w-lg">

          {/* Header */}
          <div className="mb-6 flex justify-end">
            <Button variant="outline" onClick={() => navigate(ROUTES.CLIENT.DASHBOARD)}>
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
              <p className="text-sm font-semibold text-green-800 dark:text-green-300">
                ¡Trabajo terminado!
              </p>
              <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">
                El servicio se completó exitosamente
              </p>
            </div>
          </div>

          {/* Resumen */}
          <Card className="mb-4">
            <h2 className={`mb-4 text-xs font-semibold uppercase tracking-wider ${tw.text.muted}`}>
              Resumen del servicio
            </h2>
            <div>
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
            {trabajo.calificado ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tw.iconBg.amber}`}>
                  <Star className="h-5 w-5 text-amber-600 dark:text-amber-400 fill-amber-400" />
                </div>
                <div>
                  <h3 className={`text-sm font-semibold ${tw.text.primary}`}>Ya calificaste este servicio</h3>
                  <p className={`text-xs mt-0.5 ${tw.text.secondary}`}>¡Gracias por tu feedback!</p>
                </div>
              </div>
            ) : (
              <>
                <h3 className={`mb-5 text-xs font-semibold uppercase tracking-wider ${tw.text.muted}`}>
                  Calificá al profesional
                </h3>

                {/* Proveedor */}
                <div className="mb-5 flex items-center gap-3">
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tw.iconBg.brand} text-brand-600 dark:text-dark-brand font-semibold text-sm`}>
                    {trabajo.proveedorNombre ? initials(trabajo.proveedorNombre) : '?'}
                  </div>
                  <div>
                    <p className={`text-sm font-semibold ${tw.text.primary}`}>{trabajo.proveedorNombre}</p>
                    <p className={`text-xs ${tw.text.secondary}`}>{trabajo.oficio.nombre}</p>
                  </div>
                </div>

                {/* Estrellas */}
                <div className="mb-5">
                  <div className="flex items-center gap-1 mb-1.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        onClick={() => setRating(star)}
                        onMouseEnter={() => setHover(star)}
                        onMouseLeave={() => setHover(0)}
                        className="cursor-pointer transition-transform hover:scale-110 active:scale-95 p-0.5"
                      >
                        <Star
                          className={`h-8 w-8 transition-colors ${
                            star <= activeRating
                              ? 'text-amber-400 fill-amber-400'
                              : 'text-slate-200 dark:text-dark-border'
                          }`}
                        />
                      </button>
                    ))}
                    {activeRating > 0 && (
                      <span className={`ml-2 text-sm font-medium text-amber-600 dark:text-amber-400`}>
                        {STAR_LABELS[activeRating]}
                      </span>
                    )}
                  </div>
                </div>

                {/* Comentario */}
                <div className="mb-4">
                  <label className={tw.label}>Comentario <span className={tw.text.faint}>(opcional)</span></label>
                  <textarea
                    value={review}
                    onChange={(e) => setReview(e.target.value)}
                    placeholder="Contanos cómo fue tu experiencia..."
                    className={tw.textarea + " min-h-24 mt-1.5"}
                  />
                </div>

                <Button
                  variant="success" fullWidth
                  onClick={() => calificarMutation.mutate()}
                  disabled={calificarMutation.isPending || rating === 0}
                >
                  {calificarMutation.isPending ? 'Enviando...' : 'Enviar calificación'}
                </Button>

                {rating === 0 && (
                  <p className={`mt-2 text-center text-xs ${tw.text.faint}`}>
                    Seleccioná al menos una estrella para continuar
                  </p>
                )}
              </>
            )}
          </Card>

        </div>
      </div>
    </div>
  );
}

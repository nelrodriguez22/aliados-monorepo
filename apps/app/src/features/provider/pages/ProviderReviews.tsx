import { useNavigate } from "react-router-dom";
import { Card } from "@/shared/components/ui/Card";
import { Button } from "@/shared/components/ui/Button";
import { tw } from "@/shared/styles/design-system";
import { ROUTES } from "@/shared/constants/routes";
import { useQuery } from "@tanstack/react-query";
import { getToken } from "@/shared/lib/getToken";
import { Loader2, Star } from "lucide-react";
import { formatDateTime } from "@/shared/lib/dayjs";

export function ProviderReviews() {
  const navigate = useNavigate();

  const { data: promedio, isLoading: loadingPromedio } = useQuery({
    queryKey: ['calificacion-promedio'],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/calificaciones/proveedor/promedio`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error();
      return res.json();
    },
  });

  const { data: resenas = [], isLoading: loadingResenas } = useQuery({
    queryKey: ['calificaciones-proveedor'],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/calificaciones/proveedor/todas`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error();
      return res.json();
    },
  });

  if (loadingPromedio || loadingResenas) {
    return (
      <div className={`flex h-screen items-center justify-center ${tw.pageBg}`}>
        <Loader2 className="h-7 w-7 animate-spin text-brand-600 dark:text-dark-brand" />
      </div>
    );
  }

  const promedioVal = Number(promedio?.promedio || 0);
  const total       = promedio?.total || 0;

  return (
    <div className={tw.pageBg}>
      <div className={tw.container}>
        <div className="mx-auto max-w-2xl">

          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className={`text-2xl font-bold ${tw.text.primary}`}>Mis reseñas</h1>
              <p className={`mt-0.5 text-sm ${tw.text.secondary}`}>
                {total} reseña{total !== 1 ? 's' : ''} de clientes
              </p>
            </div>
            <Button variant="outline" onClick={() => navigate(ROUTES.PROVIDER.DASHBOARD)}>← Volver</Button>
          </div>

          {/* Resumen */}
          <Card className="mb-4">
            <div className="flex items-center gap-8">
              {/* Score */}
              <div className="text-center shrink-0">
                <p className={`text-5xl font-bold ${tw.text.primary}`}>
                  {promedioVal > 0 ? promedioVal.toFixed(1) : '—'}
                </p>
                <div className="mt-1.5 flex justify-center gap-0.5">
                  {[1,2,3,4,5].map((s) => (
                    <Star key={s} className={`h-4 w-4 ${s <= Math.round(promedioVal) ? 'text-amber-400 fill-amber-400' : 'text-slate-200 dark:text-dark-border'}`} />
                  ))}
                </div>
                <p className={`mt-1 text-xs ${tw.text.muted}`}>{total} reseña{total !== 1 ? 's' : ''}</p>
              </div>

              {/* Barras */}
              <div className="flex-1 space-y-2">
                {[5,4,3,2,1].map((stars) => {
                  const count = resenas.filter((r: any) => r.estrellas === stars).length;
                  const pct   = resenas.length > 0 ? (count / resenas.length) * 100 : 0;
                  return (
                    <div key={stars} className="flex items-center gap-3">
                      <span className={`w-8 text-right text-xs ${tw.text.secondary}`}>{stars}</span>
                      <Star className="h-3 w-3 text-amber-400 fill-amber-400 shrink-0" />
                      <div className={`flex-1 h-2 rounded-full overflow-hidden ${tw.iconBg.slate}`}>
                        <div
                          className="h-full rounded-full bg-amber-400 transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className={`w-6 text-right text-xs ${tw.text.muted}`}>{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>

          {/* Lista */}
          {resenas.length === 0 ? (
            <Card>
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tw.iconBg.slate}`}>
                  <Star className={`h-5 w-5 ${tw.text.faint}`} />
                </div>
                <div>
                  <h3 className={`text-sm font-semibold ${tw.text.primary}`}>Sin reseñas aún</h3>
                  <p className={`text-xs mt-0.5 ${tw.text.secondary}`}>Aparecerán cuando los clientes califiquen tus servicios</p>
                </div>
              </div>
            </Card>
          ) : (
            <div className="space-y-3">
              {resenas.map((resena: any) => (
                <Card key={resena.id}>
                  <div className="flex items-start gap-4">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tw.iconBg.brand} text-brand-600 dark:text-dark-brand text-sm font-semibold`}>
                      {resena.clienteNombre?.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase() || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <p className={`text-sm font-semibold truncate ${tw.text.primary}`}>{resena.clienteNombre}</p>
                        <span className={`text-xs shrink-0 ${tw.text.muted}`}>{formatDateTime(resena.createdAt)}</span>
                      </div>
                      <div className="mb-2 flex gap-0.5">
                        {[1,2,3,4,5].map((s) => (
                          <Star key={s} className={`h-3.5 w-3.5 ${s <= resena.estrellas ? 'text-amber-400 fill-amber-400' : 'text-slate-200 dark:text-dark-border'}`} />
                        ))}
                      </div>
                      {resena.comentario && (
                        <p className={`text-sm ${tw.text.secondary}`}>{resena.comentario}</p>
                      )}
                      <p className={`mt-1.5 text-xs ${tw.text.faint}`}>{resena.oficioNombre}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

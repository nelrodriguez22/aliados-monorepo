import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Initials } from '@/shared/components/ui/Initials';
import { EmptyState } from '@/shared/components/ui/EmptyState';
import { SkeletonCard } from '@/shared/components/ui/SkeletonCard';
import { tw } from '@/shared/styles/design-system';
import { ROUTES } from '@/shared/constants/routes';
import { useFavoritos, type Favorito } from '@/shared/hooks/useFavoritos';
import { Star, Heart, Users } from 'lucide-react';

export function Favoritos() {
  const navigate = useNavigate();
  const { favoritos, isLoading, toggle } = useFavoritos();
  const [confirmandoId, setConfirmandoId] = useState<number | null>(null);

  const dispo = (d: string) =>
    d === 'ONLINE' ? { txt: 'Disponible', cls: 'text-green-600 dark:text-green-400' }
    : d === 'BUSY' ? { txt: 'Ocupado', cls: 'text-amber-600 dark:text-amber-400' }
    : { txt: 'Desconectado', cls: tw.text.muted };

  // Agrupamos por oficio: un cliente puede tener varios favoritos, de uno o más oficios.
  const grupos = favoritos.reduce<Record<string, Favorito[]>>((acc, f) => {
    const key = f.oficioNombre ?? 'Otros';
    (acc[key] ??= []).push(f);
    return acc;
  }, {});
  const oficios = Object.keys(grupos).sort();

  const renderCard = (f: Favorito) => {
    const d = dispo(f.disponibilidad);
    return (
      <Card key={f.proveedorId}>
        <div className="flex items-center gap-3">
          <Initials name={f.nombre} bg={tw.iconBg.brand} color="text-brand-600 dark:text-dark-brand" />
          <div className="min-w-0 flex-1">
            <p className={`truncate text-sm font-semibold ${tw.text.primary}`}>{f.nombre}</p>
            <p className={`mt-0.5 flex items-center gap-1 text-xs ${tw.text.muted}`}>
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              {f.promedioCalificacion.toFixed(1)} · {f.cantidadCalificaciones} · <span className={d.cls}>{d.txt}</span>
            </p>
          </div>
          <button
            aria-label="Quitar de favoritos"
            onClick={() => setConfirmandoId(f.proveedorId)}
            className="shrink-0 p-1"
          >
            <Heart className="h-5 w-5 fill-red-500 text-red-500" />
          </button>
        </div>
        {confirmandoId === f.proveedorId ? (
          <div className={`mt-3 flex flex-col gap-2 rounded-xl border p-3 ${tw.dividerLight}`}>
            <span className={`text-sm ${tw.text.secondary}`}>
              ¿Quitar a <span className="font-semibold">{f.nombre}</span> de favoritos?
            </span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setConfirmandoId(null)}>Cancelar</Button>
              <Button
                variant="danger"
                onClick={() => { toggle.mutate({ proveedorId: f.proveedorId, yaEs: true }); setConfirmandoId(null); }}
              >
                Sí, quitar
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-3">
            <Button
              variant="primary"
              fullWidth
              onClick={() =>
                navigate(`${ROUTES.CLIENT.SERVICE_REQUEST}?oficioId=${f.oficioId}&proveedorDirectoId=${f.proveedorId}`)
              }
            >
              Pedir servicio
            </Button>
          </div>
        )}
      </Card>
    );
  };

  return (
    <div className={tw.pageBg}>
      <div className={tw.containerWide}>
        <div className="mb-6 flex items-center justify-between">
          <h1 className={`text-2xl font-bold ${tw.text.primary}`}>Tus favoritos</h1>
          <Button variant="outline" onClick={() => navigate(ROUTES.CLIENT.DASHBOARD)}>← Volver</Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2"><SkeletonCard /><SkeletonCard /></div>
        ) : favoritos.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Todavía no tenés favoritos"
            desc="Marcá con el corazón a un profesional después de completar un trabajo con él."
          />
        ) : (
          <div className="space-y-8">
            {oficios.map((oficio) => (
              <section key={oficio}>
                <h2 className={`mb-3 text-xs min-[375px]:text-sm font-semibold uppercase tracking-wider ${tw.text.muted}`}>
                  {oficio}
                </h2>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {grupos[oficio].map(renderCard)}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

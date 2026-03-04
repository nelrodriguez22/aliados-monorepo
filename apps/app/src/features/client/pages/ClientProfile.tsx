import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/shared/components/ui/Card";
import { Button } from "@/shared/components/ui/Button";
import { tw } from "@/shared/styles/design-system";
import { User as UserIcon, Phone, Mail, MapPin, Briefcase, Shield, Star, CheckCircle } from "lucide-react";
import { ROUTES } from "@/shared/constants/routes";
import { useStore } from "@/shared/store/useStore";
import { useMutation } from "@tanstack/react-query";
import { getToken } from "@/shared/lib/getToken";
import toast from "react-hot-toast";

export function ClientProfile() {
  const navigate = useNavigate();
  const { user, login } = useStore();
  const [isEditing, setIsEditing] = useState(false);
  const isProvider = user?.role === 'PROVIDER';

  const [formData, setFormData] = useState({
    nombre:    user?.name      || "",
    telefono:  user?.telefono  || "",
    localidad: user?.localidad || "",
  });

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const token = await getToken();
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/users/me`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Error al actualizar perfil');
      return res.json();
    },
    onSuccess: (data) => {
      login({ ...user!, name: data.nombre, telefono: data.telefono, localidad: data.localidad });
      setIsEditing(false);
      toast.success('Perfil actualizado');
    },
    onError: () => toast.error('Error al actualizar perfil'),
  });

  const handleCancel = () => {
    setFormData({ nombre: user?.name || "", telefono: user?.telefono || "", localidad: user?.localidad || "" });
    setIsEditing(false);
  };

  const dashboardRoute = isProvider ? ROUTES.PROVIDER.DASHBOARD : ROUTES.CLIENT.DASHBOARD;

  // ── Field row helper ──
  const Field = ({
    icon: Icon,
    label,
    value,
    editContent,
    hint,
  }: {
    icon: React.ElementType;
    label: string;
    value?: string | null;
    editContent?: React.ReactNode;
    hint?: string;
  }) => (
    <div className={`flex items-start gap-4 py-4 border-b last:border-0 ${tw.dividerLight}`}>
      <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tw.iconBg.slate}`}>
        <Icon className={`h-4 w-4 ${tw.text.muted}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-medium mb-1 ${tw.text.muted}`}>{label}</p>
        {isEditing && editContent ? editContent : (
          <p className={`text-sm font-medium ${tw.text.primary}`}>{value ?? 'No especificado'}</p>
        )}
        {hint && <p className={`text-xs mt-1 ${tw.text.faint}`}>{hint}</p>}
      </div>
    </div>
  );

  return (
    <div className={tw.pageBg}>
      <div className={tw.container}>
        <div className="mx-auto max-w-2xl">

          {/* Header */}
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className={`text-2xl font-bold ${tw.text.primary}`}>Mi perfil</h1>
              <p className={`mt-0.5 text-sm ${tw.text.secondary}`}>
                Administrá tu información personal
              </p>
            </div>
            <Button variant="outline" onClick={() => navigate(dashboardRoute)}>← Volver</Button>
          </div>

          <div className="space-y-4">

            {/* Avatar + acciones */}
            <Card>
              <div className="flex items-center gap-5">
                <div className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl ${tw.iconBg.brand}`}>
                  {user?.fotoPerfil ? (
                    <img src={user.fotoPerfil} alt="Avatar" className="h-full w-full rounded-2xl object-cover" />
                  ) : (
                    <span className="text-2xl font-bold text-brand-600 dark:text-dark-brand">
                      {user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className={`text-lg font-bold truncate ${tw.text.primary}`}>{user?.name}</h2>
                  <p className={`text-sm truncate ${tw.text.secondary}`}>{user?.email}</p>
                  <div className="mt-2">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium
                      ${isProvider
                        ? 'bg-brand-100 text-brand-700 dark:bg-dark-brand/15 dark:text-dark-brand'
                        : 'bg-slate-100 text-slate-600 dark:bg-dark-elevated dark:text-dark-text-secondary'
                      }`}>
                      <Shield className="h-3 w-3" />
                      {isProvider ? 'Profesional' : 'Cliente'}
                    </span>
                  </div>
                </div>
                <div className="shrink-0">
                  {!isEditing ? (
                    <Button variant="outline" onClick={() => setIsEditing(true)}>Editar</Button>
                  ) : (
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={handleCancel}>Cancelar</Button>
                      <Button onClick={() => updateMutation.mutate(formData)} disabled={updateMutation.isPending}>
                        {updateMutation.isPending ? 'Guardando...' : 'Guardar'}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </Card>

            {/* Información */}
            <Card>
              <h3 className={`mb-2 text-xs font-semibold uppercase tracking-wider ${tw.text.muted}`}>
                Información personal
              </h3>

              <Field
                icon={UserIcon}
                label="Nombre completo"
                value={user?.name}
                editContent={
                  <input
                    type="text"
                    value={formData.nombre}
                    onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                    className={tw.input}
                  />
                }
              />
              <Field
                icon={Mail}
                label="Email"
                value={user?.email}
                hint="El email no se puede modificar"
              />
              <Field
                icon={Phone}
                label="Teléfono"
                value={user?.telefono}
                editContent={
                  <input
                    type="tel"
                    value={formData.telefono}
                    onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                    placeholder="+54 9 341 123-4567"
                    className={tw.input}
                  />
                }
              />

              {isProvider && (
                <>
                  <Field
                    icon={MapPin}
                    label="Localidad"
                    value={user?.localidad}
                    editContent={
                      <input
                        type="text"
                        value={formData.localidad}
                        onChange={(e) => setFormData({ ...formData, localidad: e.target.value })}
                        placeholder="Rosario"
                        className={tw.input}
                      />
                    }
                  />
                  <Field
                    icon={Briefcase}
                    label="Oficio"
                    value={user?.oficio?.nombre || 'No asignado'}
                    hint="Para cambiar tu oficio, contactá a soporte"
                  />
                </>
              )}
            </Card>

            {/* Estadísticas del proveedor */}
            {isProvider && (
              <Card>
                <h3 className={`mb-4 text-xs font-semibold uppercase tracking-wider ${tw.text.muted}`}>
                  Estadísticas
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className={tw.statBg.amber}>
                    <div className={`flex items-center gap-2 text-amber-600 dark:text-amber-400 mb-2`}>
                      <Star className="h-4 w-4" />
                      <span className="text-xs font-medium">Calificación</span>
                    </div>
                    <p className={`text-3xl font-bold ${tw.text.primary}`}>
                      {(user?.promedioCalificacion ?? 0) > 0 ? user?.promedioCalificacion?.toFixed(1) : '—'}
                    </p>
                    <p className={`text-xs mt-1 ${tw.text.secondary}`}>
                      {user?.cantidadCalificaciones || 0} reseñas
                    </p>
                  </div>
                  <div className={tw.statBg.green}>
                    <div className="flex items-center gap-2 text-green-600 dark:text-green-400 mb-2">
                      <CheckCircle className="h-4 w-4" />
                      <span className="text-xs font-medium">Trabajos completados</span>
                    </div>
                    <p className={`text-3xl font-bold ${tw.text.primary}`}>
                      {user?.totalTrabajosCompletados || 0}
                    </p>
                    <p className={`text-xs mt-1 ${tw.text.secondary}`}>servicios realizados</p>
                  </div>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

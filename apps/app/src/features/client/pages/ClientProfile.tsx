import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/shared/components/ui/Card";
import { Button } from "@/shared/components/ui/Button";
import { tw } from "@/shared/styles/design-system";
import { User as UserIcon, Phone, Mail, MapPin, Briefcase, Shield, Star, CheckCircle, Camera, Loader2 } from "lucide-react";
import { ROUTES } from "@/shared/constants/routes";
import { useStore } from "@/shared/store/useStore";
import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/shared/lib/apiClient";
import { uploadToCloudinary } from "@/shared/lib/uploadToCloudinary";
import toast from "react-hot-toast";

export function ClientProfile() {
  const navigate = useNavigate();
  const { user, login } = useStore();
  const [isEditing, setIsEditing] = useState(false);
  const isProvider = user?.role === 'PROVIDER';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const url = await uploadToCloudinary(file, 'AVATAR');
      await apiClient.put('/api/users/me', { fotoPerfil: url });
      login({ ...user!, fotoPerfil: url });
      toast.success('Foto actualizada');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo actualizar la foto.');
    } finally {
      setUploadingAvatar(false);
      e.target.value = '';
    }
  };

  const [formData, setFormData] = useState({
    nombre: user?.name || "",
    telefono: user?.telefono || "",
    localidad: user?.localidad || "",
  });

  const updateMutation = useMutation({
    mutationFn: (data: typeof formData) => apiClient.put('/api/users/me', data),
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
          <div className="mb-8 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className={`text-xl min-[375px]:text-2xl font-bold ${tw.text.primary}`}>Mi perfil</h1>
              <p className={`mt-0.5 text-sm ${tw.text.secondary}`}>
                Administrá tu información personal
              </p>
            </div>
            <Button variant="outline" onClick={() => navigate(dashboardRoute)} className="shrink-0 text-xs min-[375px]:text-sm px-3 min-[375px]:px-4">
              ← Volver
            </Button>
          </div>

          <div className="space-y-4">

            {/* Avatar + acciones */}
            <Card>
              <div className="flex flex-col ">
                {/* Fila superior: botón a la derecha */}
                <div className="flex justify-end">
                  {!isEditing ? (
                    <Button variant="outline" onClick={() => setIsEditing(true)} className="text-xs min-[375px]:text-sm px-3 min-[375px]:px-4 py-1.5 min-[375px]:py-2">
                      Editar
                    </Button>
                  ) : (
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={handleCancel} className="text-xs min-[375px]:text-sm px-3 min-[375px]:px-4 py-1.5 min-[375px]:py-2">
                        Cancelar
                      </Button>
                      <Button onClick={() => updateMutation.mutate(formData)} disabled={updateMutation.isPending} className="text-xs min-[375px]:text-sm px-3 min-[375px]:px-4 py-1.5 min-[375px]:py-2">
                        {updateMutation.isPending ? 'Guardando...' : 'Guardar'}
                      </Button>
                    </div>
                  )}
                </div>

                {/* Fila inferior: avatar + info */}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingAvatar}
                    aria-label="Cambiar foto de perfil"
                    className={`group relative h-12 w-12 min-[375px]:h-16 min-[375px]:w-16 shrink-0 rounded-2xl cursor-pointer disabled:cursor-not-allowed ${tw.iconBg.brand}`}
                  >
                    <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-2xl">
                      {user?.fotoPerfil ? (
                        <img src={user.fotoPerfil} alt="Avatar" className="h-full w-full rounded-2xl object-cover" />
                      ) : (
                        <span className="text-base min-[375px]:text-xl font-bold text-brand-600 dark:text-dark-brand">
                          {user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                        </span>
                      )}
                    </div>

                    {/* Oscurecido al pasar el mouse: indica que toda la foto es editable */}
                    <div className="absolute inset-0 rounded-2xl bg-black/0 transition group-hover:bg-black/25" />

                    {/* Badge cámara siempre visible (afford. de editar) */}
                    <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-white shadow-md ring-2 ring-white dark:ring-dark-surface group-hover:bg-brand-700">
                      <Camera className="h-3 w-3" />
                    </span>

                    {/* Spinner mientras sube */}
                    {uploadingAvatar && (
                      <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/45">
                        <Loader2 className="h-5 w-5 min-[375px]:h-6 min-[375px]:w-6 animate-spin text-white" />
                      </div>
                    )}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarChange}
                  />
                  <div className="flex-1 min-w-0">
                    <h2 className={`text-base min-[375px]:text-lg font-bold truncate ${tw.text.primary}`}>{user?.name}</h2>
                    <p className={`text-xs min-[375px]:text-sm truncate ${tw.text.secondary}`}>{user?.email}</p>
                    <div className="mt-1.5">
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

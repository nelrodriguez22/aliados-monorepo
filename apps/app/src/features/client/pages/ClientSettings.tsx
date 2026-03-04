import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/shared/components/ui/Card";
import { Button } from "@/shared/components/ui/Button";
import { tw } from "@/shared/styles/design-system";
import { Bell, Lock, Moon, Sun, Mail, MessageSquare, KeyRound } from "lucide-react";
import { ROUTES } from "@/shared/constants/routes";
import { useStore } from "@/shared/store/useStore";
import { usePushNotifications } from "@/shared/hooks/usePushNotifications";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/shared/lib/firebase";
import toast from "react-hot-toast";

// ── Toggle switch reutilizable ──
function Toggle({
  enabled,
  onChange,
  disabled = false,
}: {
  enabled: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      className={`
        relative flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-none p-0
        transition-colors duration-200
        ${enabled ? 'bg-brand-600 dark:bg-dark-brand' : 'bg-slate-200 dark:bg-dark-elevated'}
        ${disabled ? 'cursor-not-allowed opacity-40' : ''}
      `}
    >
      <span className={`
        absolute top-[3px] left-[3px]
        h-[18px] w-[18px] rounded-full bg-white
        shadow-[0_1px_3px_rgba(0,0,0,0.15)]
        transition-transform duration-200
        ${enabled ? 'translate-x-5' : 'translate-x-0'}
      `} />
    </button>
  );
}

// ── Setting row ──
function SettingRow({
  icon: Icon,
  iconBg,
  iconColor,
  title,
  description,
  action,
  disabled = false,
  soon = false,
}: {
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
  action: React.ReactNode;
  disabled?: boolean;
  soon?: boolean;
}) {
  return (
    <div className={`flex items-center gap-4 py-4 border-b last:border-0 ${tw.dividerLight} ${disabled ? 'opacity-50' : ''}`}>
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
        <Icon className={`h-4 w-4 ${iconColor}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={`text-sm font-medium ${tw.text.primary}`}>{title}</p>
          {soon && (
            <span className={`text-xs ${tw.text.faint}`}>· Próximamente</span>
          )}
        </div>
        <p className={`text-xs mt-0.5 ${tw.text.secondary}`}>{description}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

export function ClientSettings() {
  const navigate   = useNavigate();
  const { user }   = useStore();
  const theme      = useStore((state) => state.theme);
  const setTheme   = useStore((state) => state.setTheme);
  const { isSupported, permission, requestPermission } = usePushNotifications();
  const [sendingReset, setSendingReset] = useState(false);

  const isProvider     = user?.role === 'PROVIDER';
  const dashboardRoute = isProvider ? ROUTES.PROVIDER.DASHBOARD : ROUTES.CLIENT.DASHBOARD;
  const isDark         = theme === 'dark';
  const pushEnabled    = permission === 'granted';
  const pushDenied     = permission === 'denied';

  const handleTogglePush = async () => {
    if (pushDenied) {
      toast.error('Notificaciones bloqueadas. Habilitá los permisos desde la configuración del navegador.');
      return;
    }
    if (!pushEnabled) {
      const granted = await requestPermission();
      if (granted) toast.success('Notificaciones activadas');
    } else {
      toast('Para desactivarlas, hacelo desde la configuración del navegador.', { duration: 4000 });
    }
  };

  const handlePasswordReset = async () => {
    if (!user?.email) return;
    setSendingReset(true);
    try {
      await sendPasswordResetEmail(auth, user.email);
      toast.success('Email enviado para restablecer tu contraseña');
    } catch {
      toast.error('Error al enviar email');
    } finally {
      setSendingReset(false);
    }
  };

  return (
    <div className={tw.pageBg}>
      <div className={tw.container}>
        <div className="mx-auto max-w-2xl">

          {/* Header */}
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className={`text-2xl font-bold ${tw.text.primary}`}>Configuración</h1>
              <p className={`mt-0.5 text-sm ${tw.text.secondary}`}>
                Personalizá tu experiencia
              </p>
            </div>
            <Button variant="outline" onClick={() => navigate(dashboardRoute)}>← Volver</Button>
          </div>

          <div className="space-y-4">

            {/* Apariencia */}
            <Card>
              <h3 className={`mb-2 text-xs font-semibold uppercase tracking-wider ${tw.text.muted}`}>
                Apariencia
              </h3>
              <SettingRow
                icon={isDark ? Moon : Sun}
                iconBg={isDark ? 'bg-brand-100 dark:bg-dark-brand/15' : 'bg-amber-50'}
                iconColor={isDark ? 'text-brand-600 dark:text-dark-brand' : 'text-amber-500'}
                title="Modo oscuro"
                description={isDark ? 'Tema oscuro activado' : 'Tema claro activado'}
                action={
                  <Toggle
                    enabled={isDark}
                    onChange={() => setTheme(isDark ? 'light' : 'dark')}
                  />
                }
              />
            </Card>

            {/* Notificaciones */}
            <Card>
              <h3 className={`mb-2 text-xs font-semibold uppercase tracking-wider ${tw.text.muted}`}>
                Notificaciones
              </h3>
              <SettingRow
                icon={Bell}
                iconBg={tw.iconBg.brand}
                iconColor="text-brand-600 dark:text-dark-brand"
                title="Notificaciones push"
                description={
                  pushDenied
                    ? 'Bloqueadas — habilitá desde el navegador'
                    : pushEnabled
                    ? 'Activadas'
                    : 'Recibí alertas en tiempo real'
                }
                action={
                  isSupported ? (
                    <Toggle
                      enabled={pushEnabled}
                      onChange={handleTogglePush}
                      disabled={pushDenied}
                    />
                  ) : null
                }
              />
              <SettingRow
                icon={Mail}
                iconBg={tw.iconBg.slate}
                iconColor={`${tw.text.faint}`}
                title="Notificaciones por email"
                description="Resúmenes y actualizaciones por correo"
                action={<Toggle enabled={false} onChange={() => {}} disabled />}
                disabled
                soon
              />
              <SettingRow
                icon={MessageSquare}
                iconBg={tw.iconBg.slate}
                iconColor={`${tw.text.faint}`}
                title="Notificaciones por SMS"
                description="Alertas directas a tu celular"
                action={<Toggle enabled={false} onChange={() => {}} disabled />}
                disabled
                soon
              />
            </Card>

            {/* Seguridad */}
            <Card>
              <h3 className={`mb-2 text-xs font-semibold uppercase tracking-wider ${tw.text.muted}`}>
                Seguridad
              </h3>
              <SettingRow
                icon={Lock}
                iconBg={tw.iconBg.red}
                iconColor="text-red-500 dark:text-red-400"
                title="Cambiar contraseña"
                description="Te enviaremos un email para restablecerla"
                action={
                  <Button variant="outline" onClick={handlePasswordReset} disabled={sendingReset}>
                    {sendingReset ? 'Enviando...' : 'Cambiar'}
                  </Button>
                }
              />
              <SettingRow
                icon={KeyRound}
                iconBg={tw.iconBg.slate}
                iconColor={`${tw.text.faint}`}
                title="Autenticación de dos factores"
                description="Protección adicional para tu cuenta"
                action={<Toggle enabled={false} onChange={() => {}} disabled />}
                disabled
                soon
              />
            </Card>

          </div>
        </div>
      </div>
    </div>
  );
}

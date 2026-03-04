import { useActionState, useState, useEffect } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import {
  createUserWithEmailAndPassword,
  updateProfile,
  sendEmailVerification,
  signOut,
} from "firebase/auth";
import { auth } from "@/shared/lib/firebase";
import { useStore } from "@/shared/store/useStore";
import {
  User, Briefcase, Mail, Lock, Phone,
  Eye, EyeOff, ChevronDown, MapPin, ArrowRight,
} from "lucide-react";
import icono from "@/assets/icono.png";
import { ROUTES } from "@/shared/constants/routes";
import { tw } from "@/shared/styles/design-system";
import toast from "react-hot-toast";

type UserRole     = "CLIENT" | "PROVIDER";
type RegisterState = { fieldErrors?: Record<string, string> } | null;
type Oficio        = { id: number; nombre: string; icono: string };

const handleFirebaseError = (code: string) => {
  switch (code) {
    case 'auth/email-already-in-use': return 'Ya existe una cuenta con ese email';
    case 'auth/invalid-email':        return 'El email no es válido';
    case 'auth/weak-password':        return 'La contraseña debe tener al menos 6 caracteres';
    default:                          return 'Ocurrió un error. Intentá de nuevo';
  }
};

// ── Input con ícono izquierdo ──
function InputField({
  icon: Icon,
  name,
  type = 'text',
  placeholder,
  error,
  right,
  disabled,
  value,
  readOnly,
}: {
  icon: React.ElementType;
  name: string;
  type?: string;
  placeholder?: string;
  error?: string;
  right?: React.ReactNode;
  disabled?: boolean;
  value?: string;
  readOnly?: boolean;
}) {
  return (
    <div>
      <div className="relative">
        <Icon className={`absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 pointer-events-none ${tw.text.faint}`} />
        <input
          name={name}
          type={type}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={readOnly}
          defaultValue={value}
          className={`
            ${tw.input} pl-10 ${right ? 'pr-10' : ''}
            ${error ? 'border-red-300 focus:ring-red-400' : ''}
            ${disabled || readOnly ? 'cursor-not-allowed opacity-60 bg-slate-50 dark:bg-dark-elevated' : ''}
          `}
        />
        {right && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">{right}</div>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}

export function Register() {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useStore();
  const [step, setStep]                   = useState<"role" | "form">("role");
  const [selectedRole, setSelectedRole]   = useState<UserRole | null>(null);
  const [showPassword, setShowPassword]   = useState(false);
  const [showConfirm, setShowConfirm]     = useState(false);
  const [oficios, setOficios]             = useState<Oficio[]>([]);
  const [selectedOficio, setSelectedOficio] = useState<number | null>(null);

  useEffect(() => {
    if (selectedRole === "PROVIDER") {
      fetch(`${import.meta.env.VITE_API_URL}/api/oficios`)
        .then((r) => r.json())
        .then(setOficios)
        .catch(() => toast.error('Error al cargar los oficios'));
    }
  }, [selectedRole]);

  const [state, submitAction, isPending] = useActionState(
    async (_prev: RegisterState, formData: FormData): Promise<RegisterState> => {
      const name            = formData.get("name") as string;
      const email           = formData.get("email") as string;
      const phone           = formData.get("phone") as string;
      const password        = formData.get("password") as string;
      const confirmPassword = formData.get("confirmPassword") as string;
      const matricula       = selectedRole === "PROVIDER" ? formData.get("matricula") as string : null;

      const fieldErrors: Record<string, string> = {};
      if (!name.trim())     fieldErrors.name = "El nombre es requerido";
      if (!email.trim())    fieldErrors.email = "El email es requerido";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fieldErrors.email = "Email inválido";
      if (!phone.trim())    fieldErrors.phone = "El teléfono es requerido";
      if (!password)        fieldErrors.password = "La contraseña es requerida";
      else if (password.length < 6) fieldErrors.password = "Mínimo 6 caracteres";
      if (!confirmPassword) fieldErrors.confirmPassword = "Confirmá tu contraseña";
      else if (password !== confirmPassword) fieldErrors.confirmPassword = "Las contraseñas no coinciden";
      if (selectedRole === "PROVIDER" && !selectedOficio) fieldErrors.oficio = "Seleccioná tu oficio";
      if (selectedRole === "PROVIDER" && !matricula?.trim()) fieldErrors.matricula = "El número de matrícula es requerido";
      if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

      try {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(cred.user, { displayName: name });
        await sendEmailVerification(cred.user);

        const token = await cred.user.getIdToken();
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/users/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            firebaseUid: cred.user.uid,
            email: cred.user.email,
            nombre: name,
            telefono: phone,
            role: selectedRole,
            oficioId: selectedOficio,
            matricula,
            localidad: "Rosario",
          }),
        });
        if (!res.ok) throw new Error(await res.text());

        await signOut(auth);
        toast.success('¡Cuenta creada! Revisá tu email para verificarla.');
        navigate(ROUTES.LOGIN);
        return null;
      } catch (err: any) {
        toast.error(handleFirebaseError(err.code));
        return null;
      }
    },
    null,
  );

  if (isAuthenticated && user) {
    if (user.role === 'PROVIDER') return <Navigate to={ROUTES.PROVIDER.DASHBOARD} replace />;
    if (user.role === 'ADMIN')    return <Navigate to={`/${ROUTES.ADMIN}`} replace />;
    return <Navigate to={ROUTES.CLIENT.DASHBOARD} replace />;
  }

  const e = state?.fieldErrors ?? {};

  return (
    <section className="flex flex-1 w-full items-center justify-center bg-slate-50 dark:bg-dark-bg px-4 py-12">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <img src={icono} alt="Aliados" className="h-10 w-auto" />
          <div className="text-center">
            <h1 className={`text-2xl font-bold ${tw.text.primary}`}>Únete a Aliados</h1>
            <p className={`mt-1 text-sm ${tw.text.secondary}`}>
              {step === 'role' ? '¿Cómo querés usar la plataforma?' : 'Completá tus datos para continuar'}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface p-8 shadow-sm">

          {/* ── STEP 1: Rol ── */}
          {step === "role" && (
            <div className="space-y-3">
              {([
                {
                  role: 'CLIENT' as UserRole,
                  icon: User,
                  iconBg: tw.iconBg.brand,
                  iconColor: 'text-brand-600 dark:text-dark-brand',
                  title: 'Soy Cliente',
                  desc: 'Necesito contratar profesionales para el hogar',
                },
                {
                  role: 'PROVIDER' as UserRole,
                  icon: Briefcase,
                  iconBg: tw.iconBg.green,
                  iconColor: 'text-green-600 dark:text-green-400',
                  title: 'Soy Profesional',
                  desc: 'Quiero ofrecer mis servicios y conseguir clientes',
                },
              ]).map(({ role, icon: Icon, iconBg, iconColor, title, desc }) => (
                <button
                  key={role}
                  onClick={() => { setSelectedRole(role); setStep("form"); }}
                  className={`group w-full flex items-center gap-4 rounded-xl border-2 p-5 text-left transition cursor-pointer
                    border-slate-200 dark:border-dark-border
                    hover:border-brand-400 dark:hover:border-dark-brand
                    hover:bg-slate-50 dark:hover:bg-dark-elevated`}
                >
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
                    <Icon className={`h-5 w-5 ${iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${tw.text.primary}`}>{title}</p>
                    <p className={`text-xs mt-0.5 ${tw.text.secondary}`}>{desc}</p>
                  </div>
                  <ArrowRight className={`h-4 w-4 shrink-0 transition ${tw.text.faint} group-hover:text-brand-500 group-hover:translate-x-0.5`} />
                </button>
              ))}
            </div>
          )}

          {/* ── STEP 2: Form ── */}
          {step === "form" && selectedRole && (
            <>
              {/* Role badge */}
              <div className={`mb-5 flex items-center gap-3 rounded-xl p-3 ${tw.iconBg.slate}`}>
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg
                  ${selectedRole === 'CLIENT' ? tw.iconBg.brand : tw.iconBg.green}`}>
                  {selectedRole === 'CLIENT'
                    ? <User className="h-4 w-4 text-brand-600 dark:text-dark-brand" />
                    : <Briefcase className="h-4 w-4 text-green-600 dark:text-green-400" />
                  }
                </div>
                <p className={`flex-1 text-sm ${tw.text.secondary}`}>
                  Registrándote como{' '}
                  <span className={`font-semibold ${tw.text.primary}`}>
                    {selectedRole === 'CLIENT' ? 'Cliente' : 'Profesional'}
                  </span>
                </p>
                <button
                  onClick={() => { setStep("role"); setSelectedRole(null); setSelectedOficio(null); }}
                  className={`text-xs font-medium cursor-pointer transition ${tw.text.brand} hover:opacity-70`}
                >
                  Cambiar
                </button>
              </div>

              <form action={submitAction} className="space-y-3">

                <div>
                  <label className={tw.label}>Nombre completo</label>
                  <InputField icon={User} name="name" placeholder="Juan Pérez" error={e.name} />
                </div>

                <div>
                  <label className={tw.label}>Email</label>
                  <InputField icon={Mail} name="email" type="email" placeholder="juan@ejemplo.com" error={e.email} />
                </div>

                <div>
                  <label className={tw.label}>Teléfono</label>
                  <InputField icon={Phone} name="phone" type="tel" placeholder="+54 9 341 123-4567" error={e.phone} />
                </div>

                {selectedRole === "PROVIDER" && (
                  <>
                    <div>
                      <label className={tw.label}>Oficio</label>
                      <div className="relative">
                        <ChevronDown className={`absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 pointer-events-none ${tw.text.faint}`} />
                        <select
                          value={selectedOficio ?? ""}
                          onChange={(e) => setSelectedOficio(Number(e.target.value))}
                          className={`${tw.select} ${e.oficio ? 'border-red-300' : ''}`}
                        >
                          <option value="" disabled>Seleccioná tu oficio</option>
                          {oficios.map((o) => (
                            <option key={o.id} value={o.id}>{o.nombre}</option>
                          ))}
                        </select>
                      </div>
                      {e.oficio && <p className="mt-1 text-xs text-red-500">{e.oficio}</p>}
                    </div>

                    <div>
                      <label className={tw.label}>Número de matrícula</label>
                      <InputField icon={Briefcase} name="matricula" placeholder="Ej: 12345" error={e.matricula} />
                    </div>
                  </>
                )}

                {/* Zona */}
                <div>
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <label className={tw.label + ' mb-0'}>Zona de servicio</label>
                    {selectedRole === "PROVIDER" && (
                      <div className="group relative">
                        <span className={`flex h-4 w-4 cursor-help items-center justify-center rounded-full text-xs
                          bg-slate-200 dark:bg-dark-elevated ${tw.text.faint}`}>?</span>
                        <div className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 hidden group-hover:block
                          w-60 rounded-xl bg-slate-800 px-3 py-2 text-xs text-white shadow-lg z-10">
                          Esta es la zona donde ofrecerás tus servicios, no necesariamente donde vivís.
                          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
                        </div>
                      </div>
                    )}
                  </div>
                  <InputField icon={MapPin} name="localidad" value="Rosario" readOnly />
                  <p className={`mt-1.5 text-xs text-amber-600 dark:text-amber-400`}>
                    Por el momento solo disponible en Rosario, Santa Fe.
                  </p>
                </div>

                {/* Contraseña */}
                <div>
                  <label className={tw.label}>Contraseña</label>
                  <InputField
                    icon={Lock} name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Mínimo 6 caracteres"
                    error={e.password}
                    right={
                      <button type="button" onClick={() => setShowPassword(!showPassword)}
                        className={`cursor-pointer transition ${tw.text.faint} hover:text-slate-600 dark:hover:text-dark-text`}>
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    }
                  />
                </div>

                <div>
                  <label className={tw.label}>Confirmar contraseña</label>
                  <InputField
                    icon={Lock} name="confirmPassword"
                    type={showConfirm ? "text" : "password"}
                    placeholder="Repetí tu contraseña"
                    error={e.confirmPassword}
                    right={
                      <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                        className={`cursor-pointer transition ${tw.text.faint} hover:text-slate-600 dark:hover:text-dark-text`}>
                        {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    }
                  />
                </div>

                {/* T&C */}
                <div className={`flex items-start gap-3 rounded-xl p-3 ${tw.iconBg.slate}`}>
                  <input
                    type="checkbox" required
                    className="mt-0.5 h-4 w-4 cursor-pointer rounded border-slate-300 text-brand-600 focus:ring-2 focus:ring-brand-500"
                  />
                  <span className={`text-xs ${tw.text.secondary}`}>
                    Acepto los{' '}
                    <button type="button" className={`cursor-pointer font-semibold ${tw.text.brand}`}>Términos y Condiciones</button>
                    {' '}y la{' '}
                    <button type="button" className={`cursor-pointer font-semibold ${tw.text.brand}`}>Política de Privacidad</button>
                  </span>
                </div>

                <button
                  type="submit" disabled={isPending}
                  className="mt-1 w-full cursor-pointer rounded-xl bg-brand-600 dark:bg-dark-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500 dark:hover:bg-dark-brand-hover disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isPending ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Creando cuenta...
                    </span>
                  ) : 'Crear cuenta'}
                </button>
              </form>
            </>
          )}
        </div>

        {/* Footer */}
        <p className={`mt-6 text-center text-sm ${tw.text.secondary}`}>
          ¿Ya tenés cuenta?{' '}
          <button
            onClick={() => navigate(ROUTES.LOGIN)}
            className={`cursor-pointer font-semibold transition ${tw.text.brand} hover:opacity-70`}
          >
            Iniciar sesión
          </button>
        </p>

      </div>
    </section>
  );
}

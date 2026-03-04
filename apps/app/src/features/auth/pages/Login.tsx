import { useActionState, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import {
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { auth } from '@/shared/lib/firebase';
import { useStore } from '@/shared/store/useStore';
import { ROUTES } from '@/shared/constants/routes';
import icono from '@/assets/icono.png';
import toast from 'react-hot-toast';
import { Eye, EyeOff, Mail, Lock } from 'lucide-react';
import { tw } from '@/shared/styles/design-system';

type LoginState = null;

const handleFirebaseError = (code: string) => {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'Email o contraseña incorrectos';
    case 'auth/too-many-requests':
      return 'Demasiados intentos. Intentá más tarde';
    case 'auth/user-disabled':
      return 'Tu cuenta fue deshabilitada';
    default:
      return 'Ocurrió un error. Intentá de nuevo';
  }
};

// ── Google icon ──
const GoogleIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

export function Login() {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useStore();
  const [showPassword, setShowPassword] = useState(false);

  const [, submitAction, isPending] = useActionState(
    async (_prevState: LoginState, formData: FormData) => {
      const email    = formData.get('email') as string;
      const password = formData.get('password') as string;
      try {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        if (!cred.user.emailVerified) {
          await signOut(auth);
          toast.error('Verificá tu email antes de ingresar.');
          return null;
        }
        toast.success('¡Bienvenido de vuelta!');
        return null;
      } catch (err: any) {
        toast.error(handleFirebaseError(err.code));
        return null;
      }
    },
    null,
  );

  const handleGoogleLogin = async () => {
    try {
      const cred = await signInWithPopup(auth, new GoogleAuthProvider());
      if (!cred.user.emailVerified) {
        await signOut(auth);
        toast.error('Verificá tu email antes de ingresar.');
        return;
      }
      toast.success('¡Bienvenido de vuelta!');
    } catch (err: any) {
      if (err.code !== 'auth/popup-closed-by-user')
        toast.error(handleFirebaseError(err.code));
    }
  };

  if (isAuthenticated && user) {
    if (user.role === 'PROVIDER') return <Navigate to={ROUTES.PROVIDER.DASHBOARD} replace />;
    if (user.role === 'ADMIN')    return <Navigate to={`/${ROUTES.ADMIN}`} replace />;
    return <Navigate to={ROUTES.CLIENT.DASHBOARD} replace />;
  }

  return (
    <section className="flex flex-1 w-full items-center justify-center bg-slate-50 dark:bg-dark-bg px-4 py-12">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <img src={icono} alt="Aliados" className="h-10 w-auto" />
          <div className="text-center">
            <h1 className={`text-2xl font-bold ${tw.text.primary}`}>Iniciar sesión</h1>
            <p className={`mt-1 text-sm ${tw.text.secondary}`}>Bienvenido de vuelta a Aliados</p>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface p-8 shadow-sm">

          <form action={submitAction} className="space-y-4">

            {/* Email */}
            <div>
              <label htmlFor="email" className={tw.label}>Email</label>
              <div className="relative">
                <Mail className={`absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${tw.text.faint}`} />
                <input
                  id="email" name="email" type="email"
                  placeholder="tu@email.com"
                  className={tw.input + ' pl-10'}
                  required
                />
              </div>
            </div>

            {/* Contraseña */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="password" className={tw.label + ' mb-0'}>Contraseña</label>
                <button
                  type="button"
                  tabIndex={-1}
                  className={`text-xs font-medium cursor-pointer transition ${tw.text.brand} hover:opacity-70`}
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
              <div className="relative">
                <Lock className={`absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${tw.text.faint}`} />
                <input
                  id="password" name="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  className={tw.input + ' pl-10 pr-10'}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className={`absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer transition ${tw.text.faint} hover:text-slate-600 dark:hover:text-dark-text`}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isPending}
              className="mt-2 w-full cursor-pointer rounded-xl bg-brand-600 dark:bg-dark-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500 dark:hover:bg-dark-brand-hover disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Verificando...
                </span>
              ) : 'Iniciar sesión'}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-5">
            <div className={`absolute inset-0 flex items-center`}>
              <div className={`w-full border-t ${tw.dividerLight}`} />
            </div>
            <div className="relative flex justify-center">
              <span className={`px-3 bg-white dark:bg-dark-surface text-xs ${tw.text.faint}`}>
                o continuar con
              </span>
            </div>
          </div>

          {/* Google */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={isPending}
            className={`w-full flex items-center justify-center gap-2.5 rounded-xl border py-2.5 text-sm font-medium cursor-pointer transition
              border-slate-200 dark:border-dark-border
              ${tw.text.secondary}
              hover:bg-slate-50 dark:hover:bg-dark-elevated
              disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <GoogleIcon />
            Google
          </button>
        </div>

        {/* Footer */}
        <p className={`mt-6 text-center text-sm ${tw.text.secondary}`}>
          ¿No tenés cuenta?{' '}
          <button
            type="button"
            onClick={() => navigate(ROUTES.REGISTER)}
            className={`cursor-pointer font-semibold transition ${tw.text.brand} hover:opacity-70`}
          >
            Crear cuenta
          </button>
        </p>

      </div>
    </section>
  );
}

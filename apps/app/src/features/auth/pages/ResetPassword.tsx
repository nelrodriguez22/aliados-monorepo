import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { verifyPasswordResetCode, confirmPasswordReset } from "firebase/auth";
import { auth } from "@/shared/lib/firebase";
import { KeyRound, CheckCircle, XCircle, Loader2, Eye, EyeOff } from "lucide-react";
import { ROUTES } from "@/shared/constants/routes";
import { tw } from "@/shared/styles/design-system";
import logo from "@/assets/logocontexto.png";

type State = "loading" | "form" | "success" | "invalid";

export function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<State>("loading");
  const [email, setEmail] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const oobCode = searchParams.get("oobCode");
  const mode = searchParams.get("mode");

  useEffect(() => {
    if (!oobCode || mode !== "resetPassword") {
      setState("invalid");
      return;
    }
    verifyPasswordResetCode(auth, oobCode)
      .then((mail) => { setEmail(mail); setState("form"); })
      .catch(() => setState("invalid"));
  }, [oobCode, mode]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const password = form.get("password") as string;
    const confirm = form.get("confirmPassword") as string;

    if (!password || password.length < 6) { setError("La contraseña debe tener al menos 6 caracteres"); return; }
    if (password !== confirm) { setError("Las contraseñas no coinciden"); return; }
    if (!oobCode) { setState("invalid"); return; }

    setSaving(true);
    try {
      await confirmPasswordReset(auth, oobCode, password);
      setState("success");
    } catch {
      setError("El enlace expiró o ya fue usado. Pedí uno nuevo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flex flex-1 w-full items-center justify-center bg-slate-50 dark:bg-dark-bg px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <img src={logo} alt="Aliados" className="h-12 w-auto" />
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface p-8 shadow-sm text-center">
          {state === "loading" && (
            <>
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-dark-elevated">
                <Loader2 className={`h-8 w-8 animate-spin ${tw.text.faint}`} />
              </div>
              <h1 className={`text-xl font-bold ${tw.text.primary}`}>Validando enlace...</h1>
            </>
          )}

          {state === "form" && (
            <>
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 dark:bg-dark-brand/20">
                <KeyRound className="h-8 w-8 text-brand-600 dark:text-dark-brand" />
              </div>
              <h1 className={`text-xl font-bold ${tw.text.primary}`}>Nueva contraseña</h1>
              {email && (
                <p className={`mt-2 text-sm ${tw.text.secondary}`}>
                  Para <span className={`font-semibold ${tw.text.primary}`}>{email}</span>
                </p>
              )}
              <form onSubmit={handleSubmit} className="mt-6 text-left">
                <label htmlFor="password" className={tw.label}>Contraseña nueva</label>
                <div className="relative">
                  <input
                    id="password" name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••" required
                    className={tw.input + " pr-10"}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className={`absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer ${tw.text.faint}`}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <label htmlFor="confirmPassword" className={tw.label + " mt-4"}>Repetí la contraseña</label>
                <input
                  id="confirmPassword" name="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••" required
                  className={tw.input}
                />
                {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
                <button
                  type="submit" disabled={saving}
                  className="mt-4 w-full cursor-pointer rounded-xl bg-brand-600 dark:bg-dark-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500 dark:hover:bg-dark-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? "Guardando..." : "Cambiar contraseña"}
                </button>
              </form>
            </>
          )}

          {state === "success" && (
            <>
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <h1 className={`text-xl font-bold ${tw.text.primary}`}>¡Contraseña actualizada!</h1>
              <p className={`mt-3 text-sm leading-relaxed ${tw.text.secondary}`}>
                Ya podés iniciar sesión con tu nueva contraseña.
              </p>
              <button
                onClick={() => navigate(ROUTES.LOGIN)}
                className="mt-6 w-full cursor-pointer rounded-xl bg-brand-600 dark:bg-dark-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500 dark:hover:bg-dark-brand-hover"
              >
                Iniciar sesión
              </button>
            </>
          )}

          {state === "invalid" && (
            <>
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
                <XCircle className="h-8 w-8 text-amber-600 dark:text-amber-400" />
              </div>
              <h1 className={`text-xl font-bold ${tw.text.primary}`}>Enlace inválido o expirado</h1>
              <p className={`mt-3 text-sm leading-relaxed ${tw.text.secondary}`}>
                Este enlace no es válido o ya venció. Pedí uno nuevo desde "¿Olvidaste tu contraseña?".
              </p>
              <button
                onClick={() => navigate(ROUTES.RECOVER_PASSWORD)}
                className="mt-6 w-full cursor-pointer rounded-xl bg-brand-600 dark:bg-dark-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500 dark:hover:bg-dark-brand-hover"
              >
                Pedir un enlace nuevo
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

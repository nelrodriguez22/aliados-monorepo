import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { applyActionCode, signOut } from "firebase/auth";
import { auth } from "@/shared/lib/firebase";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { ROUTES } from "@/shared/constants/routes";
import { tw } from "@/shared/styles/design-system";
import logo from "@/assets/logocontexto.png";

type VerificationState = "loading" | "success" | "error" | "no-code";

export function VerificationSuccess() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<VerificationState>("loading");

  useEffect(() => {
    const oobCode = searchParams.get("oobCode");
    const mode = searchParams.get("mode");

    if (!oobCode || mode !== "verifyEmail") {
      setState("no-code");
      return;
    }

    applyActionCode(auth, oobCode)
      .then(() => {
        setState("success");
        // Limpiar sesión residual para que el usuario haga login fresco
        return signOut(auth);
      })
      .catch(() => {
        setState("error");
      });
  }, [searchParams]);

  return (
    <section className="flex flex-1 w-full items-center justify-center bg-slate-50 dark:bg-dark-bg px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <img src={logo} alt="Aliados" className="h-12 w-auto" />
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface p-8 shadow-sm text-center">

          {/* Loading */}
          {state === "loading" && (
            <>
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-dark-elevated">
                <Loader2 className={`h-8 w-8 animate-spin ${tw.text.faint}`} />
              </div>
              <h1 className={`text-xl font-bold ${tw.text.primary}`}>Verificando...</h1>
              <p className={`mt-3 text-sm leading-relaxed ${tw.text.secondary}`}>
                Estamos confirmando tu dirección de email.
              </p>
            </>
          )}

          {/* Success */}
          {state === "success" && (
            <>
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <h1 className={`text-xl font-bold ${tw.text.primary}`}>¡Email verificado!</h1>
              <p className={`mt-3 text-sm leading-relaxed ${tw.text.secondary}`}>
                Tu cuenta fue verificada correctamente. Ya podés iniciar sesión y empezar a usar Aliados.
              </p>
              <button
                onClick={() => navigate(ROUTES.LOGIN)}
                className="mt-6 w-full cursor-pointer rounded-xl bg-brand-600 dark:bg-dark-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500 dark:hover:bg-dark-brand-hover"
              >
                Iniciar sesión
              </button>
            </>
          )}

          {/* Error */}
          {state === "error" && (
            <>
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                <XCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
              </div>
              <h1 className={`text-xl font-bold ${tw.text.primary}`}>Error de verificación</h1>
              <p className={`mt-3 text-sm leading-relaxed ${tw.text.secondary}`}>
                El enlace es inválido o ya fue utilizado. Intentá iniciar sesión — si tu email ya está verificado, vas a poder acceder sin problemas.
              </p>
              <button
                onClick={() => navigate(ROUTES.LOGIN)}
                className="mt-6 w-full cursor-pointer rounded-xl bg-brand-600 dark:bg-dark-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500 dark:hover:bg-dark-brand-hover"
              >
                Ir al login
              </button>
            </>
          )}

          {/* No code */}
          {state === "no-code" && (
            <>
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
                <XCircle className="h-8 w-8 text-amber-600 dark:text-amber-400" />
              </div>
              <h1 className={`text-xl font-bold ${tw.text.primary}`}>Enlace inválido</h1>
              <p className={`mt-3 text-sm leading-relaxed ${tw.text.secondary}`}>
                Este enlace no contiene un código de verificación válido. Asegurate de usar el enlace completo que recibiste por email.
              </p>
              <button
                onClick={() => navigate(ROUTES.LOGIN)}
                className="mt-6 w-full cursor-pointer rounded-xl bg-brand-600 dark:bg-dark-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500 dark:hover:bg-dark-brand-hover"
              >
                Ir al login
              </button>
            </>
          )}

        </div>
      </div>
    </section>
  );
}

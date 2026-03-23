import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "@/shared/lib/firebase";
import { CheckCircle } from "lucide-react";
import { ROUTES } from "@/shared/constants/routes";
import { tw } from "@/shared/styles/design-system";
import logo from "@/assets/logocontexto.png";

export function VerificationSuccess() {
  const navigate = useNavigate();

  // Limpiar cualquier sesión residual de Firebase
  useEffect(() => {
    signOut(auth).catch(() => {});
  }, []);

  return (
    <section className="flex flex-1 w-full items-center justify-center bg-slate-50 dark:bg-dark-bg px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <img src={logo} alt="Aliados" className="h-12 w-auto" />
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface p-8 shadow-sm text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
            <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
          </div>

          <h1 className={`text-xl font-bold ${tw.text.primary}`}>
            ¡Email verificado!
          </h1>

          <p className={`mt-3 text-sm leading-relaxed ${tw.text.secondary}`}>
            Tu cuenta fue verificada correctamente. Ya podés iniciar sesión y empezar a usar Aliados.
          </p>

          <button
            onClick={() => navigate(ROUTES.LOGIN)}
            className="mt-6 w-full cursor-pointer rounded-xl bg-brand-600 dark:bg-dark-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500 dark:hover:bg-dark-brand-hover"
          >
            Iniciar sesión
          </button>
        </div>
      </div>
    </section>
  );
}

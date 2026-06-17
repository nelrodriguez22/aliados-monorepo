import { useLocation, useNavigate } from "react-router-dom";
import { MailCheck, AlertTriangle } from "lucide-react";
import { ROUTES } from "@/shared/constants/routes";
import { tw } from "@/shared/styles/design-system";
import logo from "@/assets/logocontexto.png";

type CheckEmailState = { email?: string } | null;

export function CheckEmail() {
  const navigate = useNavigate();
  // El email viaja en el state de navegación desde Register. Si la página se
  // recarga o se entra por URL directa ese state se pierde → mostramos un
  // texto genérico, sin romper la pantalla ni expulsar al usuario.
  const { email } = (useLocation().state as CheckEmailState) ?? {};

  return (
    <section className="flex flex-1 w-full items-center justify-center bg-slate-50 dark:bg-dark-bg px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <img src={logo} alt="Aliados" className="h-12 w-auto" />
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface p-8 shadow-sm text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 dark:bg-dark-brand/20">
            <MailCheck className="h-8 w-8 text-brand-600 dark:text-dark-brand" />
          </div>

          <h1 className={`text-xl font-bold ${tw.text.primary}`}>¡Revisá tu correo!</h1>

          <p className={`mt-3 text-sm leading-relaxed ${tw.text.secondary}`}>
            Te enviamos un enlace de verificación
            {email ? (
              <>
                {" "}a <span className={`font-semibold ${tw.text.primary}`}>{email}</span>.
              </>
            ) : (
              <> a tu dirección de correo.</>
            )}{" "}
            Hacé click en él para activar tu cuenta y poder iniciar sesión.
          </p>

          {/* Aviso de spam — el punto clave: que efectivamente miren ahí */}
          <div className="mt-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-left dark:border-amber-900/40 dark:bg-amber-900/15">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-sm leading-relaxed text-amber-800 dark:text-amber-200">
              <strong>¿No lo ves en unos minutos?</strong> Revisá tu carpeta de{" "}
              <strong>spam</strong> o <strong>correo no deseado</strong>. A veces el
              primer correo llega ahí — si lo encontrás, marcalo como “No es spam”
              para recibir los próximos en tu bandeja de entrada.
            </p>
          </div>

          <button
            onClick={() => navigate(ROUTES.LOGIN)}
            className="mt-6 w-full cursor-pointer rounded-xl bg-brand-600 dark:bg-dark-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500 dark:hover:bg-dark-brand-hover"
          >
            Ir a iniciar sesión
          </button>

          <p className={`mt-4 text-xs ${tw.text.faint}`}>
            El enlace expira en 24 horas.
          </p>
        </div>
      </div>
    </section>
  );
}

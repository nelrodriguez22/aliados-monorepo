import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { MailCheck, AlertTriangle } from "lucide-react";
import { ROUTES } from "@/shared/constants/routes";
import { tw } from "@/shared/styles/design-system";
import { apiClient, ApiError } from "@/shared/lib/apiClient";
import toast from "react-hot-toast";
import logo from "@/assets/logocontexto.png";

type CheckEmailState = { email?: string } | null;

// Segundos de cooldown del botón. Coincide con el backstop del backend (60s).
const RESEND_COOLDOWN_SECONDS = 60;

export function CheckEmail() {
  const navigate = useNavigate();
  // El email viaja en el state de navegación desde Register. Si la página se
  // recarga o se entra por URL directa ese state se pierde → mostramos un
  // texto genérico y ocultamos el botón de reenviar (no sabemos a quién).
  const { email } = (useLocation().state as CheckEmailState) ?? {};

  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Cuenta regresiva del cooldown: descuenta 1 por segundo hasta llegar a 0.
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((s) => s - 1), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  // Reenvía el email. Decisión de UX: el cooldown arranca SOLO si la request salió
  // bien — así un error de red transitorio deja reintentar enseguida (el backend
  // igual tiene su propio backstop de 60s contra abuso). Si preferís bloquear el
  // botón pase lo que pase, mové `setCooldown(...)` arriba del try.
  async function handleResend() {
    if (!email) return;
    setSending(true);
    try {
      await apiClient.post("/api/users/resend-verification", { email }, false);
      setCooldown(RESEND_COOLDOWN_SECONDS);
      toast.success("Te reenviamos el enlace. Revisá tu correo (y la carpeta de spam).");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "No pudimos reenviar el correo. Intentá de nuevo.";
      toast.error(msg);
    } finally {
      setSending(false);
    }
  }

  const resendDisabled = sending || cooldown > 0;

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

          {/* Reenviar: solo si tenemos el email (si no, no sabemos a quién reenviar) */}
          {email && (
            <button
              onClick={handleResend}
              disabled={resendDisabled}
              className="mt-6 w-full cursor-pointer rounded-xl border border-slate-300 dark:border-dark-border-strong bg-white dark:bg-dark-surface px-4 py-2.5 text-sm font-semibold text-slate-700 dark:text-dark-text transition hover:border-brand-600 hover:text-brand-600 dark:hover:border-dark-brand dark:hover:text-dark-brand disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-slate-300 disabled:hover:text-slate-700"
            >
              {sending
                ? "Enviando..."
                : cooldown > 0
                ? `Reenviar en ${cooldown}s`
                : "Reenviar email"}
            </button>
          )}

          <button
            onClick={() => navigate(ROUTES.LOGIN)}
            className="mt-3 w-full cursor-pointer rounded-xl bg-brand-600 dark:bg-dark-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500 dark:hover:bg-dark-brand-hover"
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

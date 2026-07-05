import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, MailCheck } from "lucide-react";
import { ROUTES } from "@/shared/constants/routes";
import { tw } from "@/shared/styles/design-system";
import { apiClient, ApiError } from "@/shared/lib/apiClient";
import toast from "react-hot-toast";
import logo from "@/assets/logocontexto.png";

export function RecoverPassword() {
  const navigate = useNavigate();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = (new FormData(e.currentTarget).get("email") as string)?.trim();
    if (!email) return;
    setSending(true);
    try {
      // El endpoint es anti-enumeración: responde genérico exista o no el email.
      await apiClient.post("/api/users/forgot-password", { email }, false);
      setSent(true);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "No pudimos procesar el pedido. Intentá de nuevo.";
      toast.error(msg);
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="flex flex-1 w-full items-center justify-center bg-slate-50 dark:bg-dark-bg px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <img src={logo} alt="Aliados" className="h-12 w-auto" />
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface p-8 shadow-sm text-center">
          {sent ? (
            <>
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 dark:bg-dark-brand/20">
                <MailCheck className="h-8 w-8 text-brand-600 dark:text-dark-brand" />
              </div>
              <h1 className={`text-xl font-bold ${tw.text.primary}`}>Revisá tu correo</h1>
              <p className={`mt-3 text-sm leading-relaxed ${tw.text.secondary}`}>
                Si el email está registrado, te enviamos un enlace para restablecer tu contraseña.
                Revisá también la carpeta de spam.
              </p>
              <button
                onClick={() => navigate(ROUTES.LOGIN)}
                className="mt-6 w-full cursor-pointer rounded-xl bg-brand-600 dark:bg-dark-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500 dark:hover:bg-dark-brand-hover"
              >
                Volver a iniciar sesión
              </button>
            </>
          ) : (
            <>
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 dark:bg-dark-brand/20">
                <KeyRound className="h-8 w-8 text-brand-600 dark:text-dark-brand" />
              </div>
              <h1 className={`text-xl font-bold ${tw.text.primary}`}>¿Olvidaste tu contraseña?</h1>
              <p className={`mt-3 text-sm leading-relaxed ${tw.text.secondary}`}>
                Ingresá tu email y te enviamos un enlace para elegir una nueva.
              </p>
              <form onSubmit={handleSubmit} className="mt-6 text-left">
                <label htmlFor="email" className={tw.label}>Email</label>
                <input
                  id="email" name="email" type="email" required
                  placeholder="tu@email.com"
                  className={tw.input}
                />
                <button
                  type="submit"
                  disabled={sending}
                  className="mt-4 w-full cursor-pointer rounded-xl bg-brand-600 dark:bg-dark-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500 dark:hover:bg-dark-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {sending ? "Enviando..." : "Enviar enlace"}
                </button>
              </form>
              <button
                onClick={() => navigate(ROUTES.LOGIN)}
                className={`mt-4 text-xs font-medium cursor-pointer transition ${tw.text.brand} hover:opacity-70`}
              >
                Volver a iniciar sesión
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

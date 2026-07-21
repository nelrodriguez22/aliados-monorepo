import { Link } from "react-router-dom";
import { tw } from "@/shared/styles/design-system";
import { ROUTES } from "@/shared/constants/routes";
import { openCookieSettings } from "@/shared/consent/cookieSettingsBus";

export function Footer() {
  const linkClass = "cursor-pointer transition hover:text-brand-600 dark:hover:text-dark-brand";
  return (
    <footer className={`border-t px-4 sm:px-8 py-4 sm:py-5 flex flex-col sm:flex-row items-center justify-between gap-3
      border-slate-200/70 dark:border-dark-border bg-white/80 dark:bg-dark-surface/80 backdrop-blur-xl`}>
      <p className={`text-xs text-center sm:text-left ${tw.text.muted}`}>
        © 2026 Aliados. Todos los derechos reservados.
      </p>
      <div className={`flex gap-5 text-xs font-medium ${tw.text.muted}`}>
        <a href="mailto:aliados@convivirtech.com.ar?subject=Consulta%20desde%20Aliados" className={linkClass}>
          Contacto
        </a>
        <Link to={ROUTES.TERMS} className={linkClass}>Términos</Link>
        <Link to={ROUTES.PRIVACY} className={linkClass}>Privacidad</Link>
        <button type="button" onClick={openCookieSettings} className={linkClass}>Cookies</button>
      </div>
    </footer>
  );
}

import { tw } from "@/shared/styles/design-system";

export function Footer() {
  return (
    <footer className={`border-t px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-4
      ${tw.dividerLight} bg-white/80 dark:bg-dark-surface/80 backdrop-blur-xl`}>
      <p className={`text-xs ${tw.text.faint}`}>
        © 2026 Aliados. Todos los derechos reservados.
      </p>
      <div className={`flex gap-5 text-xs font-medium ${tw.text.faint}`}>
        {['Contacto', 'Términos', 'Privacidad'].map((label) => (
          <a
            key={label}
            href="#"
            className={`cursor-pointer transition hover:text-brand-600 dark:hover:text-dark-brand`}
          >
            {label}
          </a>
        ))}
      </div>
    </footer>
  );
}

import { useNavigate } from "react-router-dom";
import { Button } from "@/shared/components/ui/Button";
import { tw } from "@/shared/styles/design-system";
import { ROUTES } from "@/shared/constants/routes";

// Chrome común de las páginas legales (Términos / Privacidad): botón volver,
// título, subtítulo y fecha de vigencia. El contenido va como children usando
// los helpers de prosa de abajo para mantener estilos consistentes.
export function LegalLayout({ title, subtitle, vigencia, children }: {
  title: string;
  subtitle?: string;
  vigencia?: string;
  children: React.ReactNode;
}) {
  const navigate = useNavigate();

  // Si hay historial (llegó desde el footer) vuelve atrás; si se abrió directo
  // (ej. pestaña nueva desde el registro) cae al home.
  const handleBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate(ROUTES.HOME);
  };

  return (
    <div className={tw.pageBg}>
      <div className={tw.container}>
        <div className="mx-auto max-w-2xl">
          <div className="mb-6 flex justify-end">
            <Button variant="outline" onClick={handleBack}>← Volver</Button>
          </div>
          <h1 className={`text-2xl font-bold ${tw.text.primary}`}>{title}</h1>
          {subtitle && <p className={`mt-1 text-sm ${tw.text.secondary}`}>{subtitle}</p>}
          {vigencia && <p className={`mt-0.5 text-xs ${tw.text.muted}`}>{vigencia}</p>}
          <div className="mt-6 pb-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

// ── Helpers de prosa (nivel de módulo, para no romper react-hooks/static-components) ──
export const H2 = ({ children }: { children: React.ReactNode }) => (
  <h2 className={`mt-7 mb-1 text-base font-semibold ${tw.text.primary}`}>{children}</h2>
);

export const H3 = ({ children }: { children: React.ReactNode }) => (
  <h3 className={`mt-4 mb-1 text-sm font-semibold ${tw.text.primary}`}>{children}</h3>
);

export const P = ({ children, className = tw.text.secondary }: { children: React.ReactNode; className?: string }) => (
  <p className={`mt-2 text-sm leading-relaxed ${className}`}>{children}</p>
);

export const UL = ({ children }: { children: React.ReactNode }) => (
  <ul className={`mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed ${tw.text.secondary}`}>{children}</ul>
);

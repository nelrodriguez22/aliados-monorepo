import { AlertCircle } from "lucide-react";
import { Button } from "@/shared/components/ui/Button";
import { tw } from "@/shared/styles/design-system";

type ErrorStateProps = {
  title?: string;
  message?: string;
  onRetry?: () => void;
  onBack?: () => void;
  backLabel?: string;
  /** Versión chica para embeber dentro de una card/sección (ej. dashboard admin). */
  compact?: boolean;
};

/**
 * Estado de error reutilizable para pantallas que cargan datos con React Query.
 * Evita el "loading eterno" cuando una query falla: se muestra en `isError`
 * en vez de caer en el guard de carga. Con `compact` sirve para errores por
 * sección (cada query/endpoint falla de forma independiente).
 */
export function ErrorState({
  title = "No pudimos cargar la información",
  message = "Ocurrió un error al obtener los datos.",
  onRetry,
  onBack,
  backLabel = "Volver",
  compact = false,
}: ErrorStateProps) {
  if (compact) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
        <AlertCircle className="h-6 w-6 text-red-500" />
        <p className={`text-sm ${tw.text.secondary}`}>{message}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="text-xs font-semibold text-brand-600 dark:text-dark-brand hover:underline cursor-pointer"
          >
            Reintentar
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center ${tw.pageBg}`}>
      <AlertCircle className="h-10 w-10 text-red-500" />
      <div>
        <h2 className={`text-lg font-semibold ${tw.text.primary}`}>{title}</h2>
        <p className={`mt-1 text-sm ${tw.text.secondary}`}>{message}</p>
      </div>
      {(onBack || onRetry) && (
        <div className="flex gap-3">
          {onBack && <Button variant="secondary" onClick={onBack}>{backLabel}</Button>}
          {onRetry && <Button onClick={onRetry}>Reintentar</Button>}
        </div>
      )}
    </div>
  );
}

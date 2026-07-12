import { ShieldCheck } from 'lucide-react';

interface Props {
  codigo: string | null | undefined;
  className?: string;
}

// Código identificatorio del proveedor, para que el cliente valide a la persona
// que llega al domicilio. Discreto, no compite con el nombre del proveedor.
export function CodigoProveedorChip({ codigo, className = '' }: Props) {
  if (!codigo) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 dark:bg-dark-surface ${className}`}
    >
      <ShieldCheck className="h-3 w-3 text-brand-600 dark:text-dark-brand" />
      <span className="font-mono text-xs text-slate-600 dark:text-slate-300">ID: {codigo}</span>
    </span>
  );
}

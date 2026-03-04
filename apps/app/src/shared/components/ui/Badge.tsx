import { tw } from '@/shared/styles/design-system';

interface BadgeProps {
  variant: 'success' | 'warning' | 'queue' | 'info' | 'neutral' | 'error';
  children: React.ReactNode;
  className?: string;
  showPulse?: boolean;
}

export function Badge({ variant, children, className = '', showPulse = false }: BadgeProps) {
  return (
    <span className={`${tw.badge[variant]} ${className} inline-flex items-center gap-1.5`}>
      {children}
      {showPulse && (
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-slate-400 opacity-60"></span>
          <span className="relative inline-flex h-2 w-2 rounded-full bg-slate-500 dark:bg-slate-400"></span>
        </span>
      )}
    </span>
  );
}

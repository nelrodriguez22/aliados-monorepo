import type { ReactNode } from 'react';

interface TooltipProps {
  text: string;
  children: ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  /** Para descripciones largas: envuelve el texto en un bloque en vez de una sola línea. */
  multiline?: boolean;
}

const positionClasses = {
  top:    'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left:   'right-full top-1/2 -translate-y-1/2 mr-2',
  right:  'left-full top-1/2 -translate-y-1/2 ml-2',
};

export const Tooltip = ({ text, children, position = 'top', multiline = false }: TooltipProps) => (
  <div className="group relative inline-flex">
    {children}
    <span
      role="tooltip"
      className={`pointer-events-none absolute z-50 rounded-lg bg-slate-900 dark:bg-slate-700 px-2.5 py-1.5 text-xs text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 ${positionClasses[position]} ${multiline ? 'w-64 whitespace-normal text-left leading-snug' : 'whitespace-nowrap'}`}
    >
      {text}
    </span>
  </div>
);

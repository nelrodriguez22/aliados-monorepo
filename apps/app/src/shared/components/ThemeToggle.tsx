import { useStore } from '@/shared/store/useStore';
import { Sun, Moon } from 'lucide-react';

export function ThemeToggle() {
  const theme = useStore((state) => state.theme);
  const setTheme = useStore((state) => state.setTheme);
  const isDark = theme === 'dark';

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label="Cambiar tema"
      className={`
        relative flex h-7 w-13 shrink-0 cursor-pointer items-center rounded-full border-none p-0
        transition-colors duration-300
        ${isDark ? 'bg-brand-500 dark:bg-dark-brand' : 'bg-slate-200'}
      `}
    >
      {/* Thumb */}
      <span
        className={`
          absolute top-0.75 left-0.75
          flex h-5.5 w-5.5 items-center justify-center
          rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.15)]
          transition-transform duration-300
          ${isDark
            ? 'translate-x-6 text-slate-400'
            : 'translate-x-0 text-amber-500'
          }
        `}
        style={{ transitionTimingFunction: 'cubic-bezier(0.34,1.56,0.64,1)' }}
      >
        {isDark
          ? <Moon size={11} fill="currentColor" stroke="none" />
          : <Sun size={12} />
        }
      </span>
    </button>
  );
}

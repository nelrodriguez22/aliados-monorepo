export const colors = {
  primary: {
    50:  '#e6f0f5',
    100: '#b3d4e3',
    500: '#0a6490',
    600: '#054060',
    700: '#043350',
  },
  success: {
    100: '#dcfce7',
    500: '#22c55e',
    600: '#16a34a',
  },
  slate: {
    600: '#475569',
    900: '#0f172a',
  },
  dark: {
    bg:            '#0f1117',
    surface:       '#161b27',
    elevated:      '#1e2535',
    border:        '#1e2535',
    borderStrong:  '#2a3347',
    text:          '#e8eaf0',
    textSecondary: '#7a8499',
    brand:         '#1a8abf',
    brandHover:    '#1e9fd6',
  },
};

const d = (light: string, dark: string) =>
  `${light} dark:${dark.split(' ').join(' dark:')}`;

export const tw = {
  // ── Cards — landing reference ──
  card: d(
    'bg-white rounded-2xl border border-slate-200 p-6',
    'bg-dark-surface border-dark-border'
  ),
  cardHover: d(
    'bg-white rounded-2xl border border-slate-200 p-6 cursor-pointer transition-all duration-150 hover:border-slate-300 hover:shadow-[0_4px_24px_rgba(0,0,0,0.06)]',
    'bg-dark-surface border-dark-border cursor-pointer transition-all duration-150 hover:border-dark-border-strong hover:shadow-none hover:bg-dark-elevated'
  ),

  // ── Buttons ──
  btn: {
    primary: d(
      'cursor-pointer rounded-full bg-brand-600 px-6 py-2.5 font-semibold text-sm text-white transition-all hover:bg-brand-500 hover:-translate-y-px active:scale-95',
      'bg-dark-brand hover:bg-dark-brand-hover'
    ),
    secondary: d(
      'cursor-pointer rounded-full border border-slate-300 bg-white px-6 py-2.5 font-semibold text-sm text-slate-700 transition-all hover:border-brand-600 hover:text-brand-600 active:scale-95',
      'bg-dark-surface border-dark-border-strong text-dark-text hover:border-dark-brand hover:text-dark-brand'
    ),
    success: d(
      'cursor-pointer rounded-full bg-green-600 px-6 py-2.5 font-semibold text-sm text-white transition-all hover:bg-green-500 active:scale-95',
      'bg-green-700 hover:bg-green-600'
    ),
    danger: d(
      'cursor-pointer rounded-full bg-red-500 px-6 py-2.5 font-semibold text-sm text-white transition-all hover:bg-red-400 active:scale-95',
      'bg-red-600 hover:bg-red-500'
    ),
    outline: d(
      'cursor-pointer rounded-full border border-slate-300 bg-transparent px-6 py-2.5 font-medium text-sm text-slate-600 transition-all hover:border-slate-400 hover:bg-slate-50 active:scale-95',
      'border-dark-border-strong text-dark-text-secondary hover:bg-dark-elevated hover:text-dark-text'
    ),
  },

  // ── Badges — semantic mapping ──
  badge: {
    // Completado
    success: d(
      'inline-flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700',
      'bg-green-900/20 text-green-400'
    ),
    // En espera / pendiente de calificación
    warning: d(
      'inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700',
      'bg-amber-900/20 text-amber-400'
    ),
    // En cola — espera activa con otro trabajo en curso
    queue: d(
      'inline-flex items-center gap-1 rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-700',
      'bg-orange-900/20 text-orange-400'
    ),
    // En curso / asignado / propuesta recibida
    info: d(
      'inline-flex items-center gap-1 rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-700',
      'bg-dark-brand/15 text-dark-brand'
    ),
    // Estados genéricos
    neutral: d(
      'inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600',
      'bg-dark-elevated text-dark-text-secondary'
    ),
    // Cancelado / error
    error: d(
      'inline-flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700',
      'bg-red-900/20 text-red-400'
    ),
  },

  // ── Inputs ──
  input: d(
    'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm transition-all placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20',
    'bg-dark-surface border-dark-border text-dark-text placeholder:text-dark-text-secondary focus:border-dark-brand focus:ring-dark-brand/20'
  ),
  select: d(
    'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm transition-all focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 cursor-pointer',
    'bg-dark-surface border-dark-border text-dark-text focus:border-dark-brand focus:ring-dark-brand/20'
  ),
  textarea: d(
    'w-full resize-none rounded-xl border border-slate-200 bg-white p-4 text-sm transition-all placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20',
    'bg-dark-surface border-dark-border text-dark-text placeholder:text-dark-text-secondary focus:border-dark-brand focus:ring-dark-brand/20'
  ),

  // ── Layout ──
  header: d(
    'border-b border-slate-200/80 bg-white/85 backdrop-blur-md',
    'border-dark-border bg-dark-bg/85 backdrop-blur-md'
  ),
  navLink: d(
    'cursor-pointer text-sm font-medium text-slate-500 transition-colors hover:text-slate-900',
    'text-dark-text-secondary hover:text-dark-text'
  ),
  container: 'mx-auto w-full max-w-[min(55%,800px)] py-6 lg:py-8',
  section:   d('bg-white',          'bg-dark-bg'),
  pageBg:    d('flex-1 bg-slate-50', 'bg-dark-bg'),

  // ── Text ──
  text: {
    primary:   d('text-slate-900', 'text-dark-text'),
    secondary: d('text-slate-500', 'text-dark-text-secondary'),
    muted:     d('text-slate-400', 'text-dark-text-secondary'),
    faint:     d('text-slate-300', 'text-dark-text-secondary/60'),
    brand:     d('text-brand-600', 'text-dark-brand'),
  },
  label: d(
    'block text-xs font-medium text-slate-500 mb-1',
    'text-dark-text-secondary'
  ),

  // ── Dropdowns ──
  dropdown: d(
    'rounded-xl border border-slate-200 bg-white shadow-lg shadow-slate-200/50',
    'border-dark-border bg-dark-surface shadow-2xl'
  ),
  dropdownItem: d(
    'flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50',
    'text-dark-text hover:bg-dark-elevated'
  ),
  dropdownHeader: d('border-b border-slate-100 p-4',  'border-dark-border'),
  dropdownFooter: d('border-t border-slate-100 py-2', 'border-dark-border'),

  // ── Dividers ──
  divider:      d('border-slate-200', 'border-dark-border'),
  dividerLight: d('border-slate-100', 'border-dark-border/50'),

  // ── Icon containers ──
  iconBg: {
    brand: d('bg-brand-50',  'bg-dark-brand/10'),
    green: d('bg-green-50',  'bg-green-900/20'),
    red:   d('bg-red-50',    'bg-red-900/20'),
    amber: d('bg-amber-50',  'bg-amber-900/20'),
    slate: d('bg-slate-100', 'bg-dark-elevated'),
  },

  // ── Stat cards ──
  statBg: {
    amber: d('rounded-xl bg-amber-50 p-4', 'bg-amber-900/10 rounded-xl p-4'),
    green: d('rounded-xl bg-green-50 p-4', 'bg-green-900/10 rounded-xl p-4'),
  },

  // ── Empty state ──
  emptyState: d(
    'flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 py-16 text-center',
    'border-dark-border'
  ),

  // ── Skeleton ──
  skeleton: d('animate-pulse rounded-xl bg-slate-100', 'bg-dark-elevated'),

  // ── Auth ──
  authCard: d(
    'rounded-2xl border border-slate-200 bg-white p-8 shadow-sm',
    'bg-dark-surface border-dark-border'
  ),
  authBg: d(
    'flex w-full flex-1 items-center justify-center bg-slate-50 px-4 py-12',
    'bg-dark-bg'
  ),

  // ── Toggle ──
  toggleContainer: d(
    'flex items-center rounded-full border border-slate-200 bg-white shadow-sm',
    'bg-dark-surface border-dark-border'
  ),

  // ── Banners ──
  successBanner: d(
    'rounded-2xl bg-green-50 p-8 text-center',
    'rounded-2xl border border-dark-border bg-dark-surface p-8 text-center'
  ),

  // ── Special cards ──
  proposalCard: d(
    'border-2 border-brand-200 bg-brand-50/50',
    'border-dark-brand/25 bg-dark-brand/5'
  ),
  queueCard: d(
    'border-2 border-orange-200 bg-orange-50/50',
    'border-orange-500/25 bg-orange-900/10'
  ),

  // ── Info box ──
  infoBox: d('bg-brand-50', 'bg-dark-brand/8'),

  // ── Checkbox area ──
  checkboxArea: d(
    'rounded-xl bg-slate-50 p-4',
    'rounded-xl bg-dark-elevated/50 p-4'
  ),
};

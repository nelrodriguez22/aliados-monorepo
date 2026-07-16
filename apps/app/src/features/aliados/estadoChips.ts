// Colores de chip por estado, compartidos entre la lista de servicios y el
// timeline de eventos. PENDIENTE_PAGO y PAGADO existen solo en el eje de pago
// del timeline (CAMBIO_ESTADO_PAGO): siguen el mismo esquema visual que
// PENDIENTE_PAGO_EXTRA y COMPLETADO respectivamente.
export const ESTADO_CHIP: Record<string, string> = {
  PENDIENTE: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400',
  PROPUESTO: 'bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-dark-brand',
  RESERVADO: 'bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-400',
  CONTRAPROPUESTO: 'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400',
  ACEPTADO: 'bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-400',
  EN_CURSO: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400',
  PRESUPUESTADO: 'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400',
  EN_COLA: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  FINALIZADO: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400',
  PENDIENTE_PAGO_EXTRA: 'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400',
  COMPLETADO: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400',
  CANCELADO: 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400',
  // Eje de pago (solo timeline)
  PENDIENTE_PAGO: 'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400',
  PAGADO: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400',
};

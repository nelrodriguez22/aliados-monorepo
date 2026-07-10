export type TipoServicio = 'TRABAJO' | 'MUDANZA';

const PREFIJO: Record<TipoServicio, string> = { TRABAJO: 'T', MUDANZA: 'M' };

export function formatServicioId(tipo: TipoServicio, id: number): string {
  return `#${PREFIJO[tipo]}-${id}`;
}

// Tolerante: mayúsculas/minúsculas, con/sin #, con/sin guión.
// Número pelado → tipo null (el caller busca en ambos tipos).
// Espejo documentado en frontend de la gramática parseQ del backend
// (ServicioAdminService.parseQ). Hoy solo lo usan los tests: el panel admin
// manda el q crudo y el backend re-implementa el parseo; se mantiene acá
// para validación client-side cuando haya un consumidor de producto.
export function parseServicioId(
  input: string,
): { tipo: TipoServicio | null; id: number } | null {
  const s = input.trim().toUpperCase().replace(/^#/, '');
  const conPrefijo = /^([TM])-?(\d+)$/.exec(s);
  if (conPrefijo) {
    return { tipo: conPrefijo[1] === 'T' ? 'TRABAJO' : 'MUDANZA', id: Number(conPrefijo[2]) };
  }
  if (/^\d+$/.test(s)) return { tipo: null, id: Number(s) };
  return null;
}

export interface FeatureFlag {
  key: string;
  enabled: boolean;
  value: string | null;
  valueType: 'BOOLEAN' | 'NUMBER' | 'STRING' | 'JSON';
  description: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

/** Valida un valor contra su tipo. Devuelve el mensaje de error o null si es válido. */
export function validateFlagValue(valueType: string, value: string): string | null {
  switch (valueType) {
    case 'NUMBER':
      return Number.isNaN(Number(value)) || value.trim() === ''
        ? 'El valor debe ser un número'
        : null;
    case 'BOOLEAN':
      return value === 'true' || value === 'false'
        ? null
        : "El valor debe ser 'true' o 'false'";
    case 'JSON':
      try {
        JSON.parse(value);
        return null;
      } catch {
        return 'El valor debe ser JSON válido';
      }
    default:
      return null; // STRING / desconocido
  }
}

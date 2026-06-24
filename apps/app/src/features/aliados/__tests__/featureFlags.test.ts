import { describe, it, expect } from 'vitest';
import { validateFlagValue } from '../featureFlags';

describe('validateFlagValue', () => {
  it('NUMBER válido devuelve null', () => {
    expect(validateFlagValue('NUMBER', '180')).toBeNull();
    expect(validateFlagValue('NUMBER', '1.5')).toBeNull();
  });

  it('NUMBER inválido devuelve mensaje', () => {
    expect(validateFlagValue('NUMBER', 'abc')).toMatch(/número/i);
  });

  it('BOOLEAN sólo acepta true/false', () => {
    expect(validateFlagValue('BOOLEAN', 'true')).toBeNull();
    expect(validateFlagValue('BOOLEAN', 'false')).toBeNull();
    expect(validateFlagValue('BOOLEAN', 'si')).toMatch(/true|false/i);
  });

  it('JSON inválido devuelve mensaje', () => {
    expect(validateFlagValue('JSON', '{bad')).toMatch(/json/i);
    expect(validateFlagValue('JSON', '{"a":1}')).toBeNull();
  });

  it('STRING acepta cualquier cosa', () => {
    expect(validateFlagValue('STRING', 'lo que sea')).toBeNull();
  });
});

import { describe, it, expect } from 'vitest';
import { formatServicioId, parseServicioId } from '@/shared/lib/servicioId';

describe('formatServicioId', () => {
  it('formatea trabajo como #T-<id>', () => {
    expect(formatServicioId('TRABAJO', 123)).toBe('#T-123');
  });
  it('formatea mudanza como #M-<id>', () => {
    expect(formatServicioId('MUDANZA', 45)).toBe('#M-45');
  });
});

describe('parseServicioId', () => {
  it('parsea #T-123 con prefijo de trabajo', () => {
    expect(parseServicioId('#T-123')).toEqual({ tipo: 'TRABAJO', id: 123 });
  });
  it('parsea #M-45 con prefijo de mudanza', () => {
    expect(parseServicioId('#M-45')).toEqual({ tipo: 'MUDANZA', id: 45 });
  });
  it('tolera minúsculas', () => {
    expect(parseServicioId('t-123')).toEqual({ tipo: 'TRABAJO', id: 123 });
  });
  it('tolera sin #', () => {
    expect(parseServicioId('M-45')).toEqual({ tipo: 'MUDANZA', id: 45 });
  });
  it('tolera sin guión', () => {
    expect(parseServicioId('T123')).toEqual({ tipo: 'TRABAJO', id: 123 });
  });
  it('tolera espacios alrededor', () => {
    expect(parseServicioId('  #T-7  ')).toEqual({ tipo: 'TRABAJO', id: 7 });
  });
  it('número pelado devuelve tipo null (busca en ambos)', () => {
    expect(parseServicioId('123')).toEqual({ tipo: null, id: 123 });
  });
  it('número pelado con # devuelve tipo null', () => {
    expect(parseServicioId('#123')).toEqual({ tipo: null, id: 123 });
  });
  it('texto no parseable devuelve null', () => {
    expect(parseServicioId('abc')).toBeNull();
  });
  it('string vacío devuelve null', () => {
    expect(parseServicioId('')).toBeNull();
  });
  it('prefijo sin número devuelve null', () => {
    expect(parseServicioId('T-')).toBeNull();
  });
});

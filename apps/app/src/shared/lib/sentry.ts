import * as Sentry from '@sentry/react';
import type { User } from '@/shared/types/interfaces';

// Contexto de usuario para Sentry. A propósito mandamos SOLO id + rol: nada de
// email/nombre/teléfono, para no meter PII en los reportes de error. Si Sentry no
// está inicializado (dev sin DSN), setUser es un no-op, así que es seguro llamarlo.

export function setSentryUser(user: User): void {
  Sentry.setUser({ id: user.uid, role: user.role });
}

export function clearSentryUser(): void {
  Sentry.setUser(null);
}

import { useEffect } from 'react';
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from 'react-router-dom';
import * as Sentry from '@sentry/react';

// Sentry debe inicializarse ANTES que cualquier otro código → este archivo se importa
// primero en main.tsx. Solo inicializa si hay DSN: en dev (sin VITE_SENTRY_DSN) queda
// totalmente apagado, cero overhead. El DSN es público (no es secreto).
const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;

if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_APP_VERSION as string | undefined,

    integrations: [
      // Tracing de navegación con React Router v7 (modo <Routes> / componentes).
      Sentry.reactRouterV7BrowserTracingIntegration({
        useEffect,
        useLocation,
        useNavigationType,
        createRoutesFromChildren,
        matchRoutes,
      }),
      // Session Replay: graba la sesión alrededor de un error (texto/medios enmascarados).
      Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
    ],

    // Tracing: muestreo. En prod conviene bajo (0.1–0.2) para no gastar cuota.
    tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? 0.2),
    // Propaga el trace al backend (front→back distribuido) solo a nuestros dominios.
    tracePropagationTargets: [
      /^https:\/\/aliados-web-backend-prd\.up\.railway\.app/,
      /^https:\/\/api\.aliados-app\.convivirtech\.com\.ar/,
    ],

    // Session Replay: 10% de sesiones normales, 100% de las que tienen error.
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });
}

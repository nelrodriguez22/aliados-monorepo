import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { htmlReport } from 'https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';

// ──────────────────────────────────────────────────────────────────────────
// Load test READ-ONLY del dashboard del cliente (el tráfico recurrente del polling).
// No crea datos: solo hace GETs. Mide latencia (p50/p95/p99) y tasa de error
// bajo concurrencia.
//
// Uso (ver loadtest/README.md):
//   BASE_URL=... FB_API_KEY=... TEST_EMAIL=... TEST_PASSWORD=... k6 run loadtest/dashboard.js
// ──────────────────────────────────────────────────────────────────────────

const BASE      = __ENV.BASE_URL;
const API_KEY   = __ENV.FB_API_KEY;
const EMAIL     = __ENV.TEST_EMAIL;
const PASSWORD  = __ENV.TEST_PASSWORD;
const SLEEP     = Number(__ENV.SLEEP || 5); // "think time" entre iteraciones (seg)

if (!BASE || !API_KEY || !EMAIL || !PASSWORD) {
  throw new Error('Faltan env vars: BASE_URL, FB_API_KEY, TEST_EMAIL, TEST_PASSWORD');
}

export const options = {
  // Rampa de carga. Override con STAGES='[{"duration":"2m","target":100}]'
  stages: __ENV.STAGES ? JSON.parse(__ENV.STAGES) : [
    { duration: '30s', target: 10 },  // calentamiento
    { duration: '1m',  target: 30 },
    { duration: '1m',  target: 50 },  // pico
    { duration: '30s', target: 0  },  // bajada
  ],
  thresholds: {
    http_req_failed:   ['rate<0.01'],              // <1% de errores
    http_req_duration: ['p(95)<800', 'p(99)<1500'], // objetivos de latencia (ms)
  },
};

// Login UNA vez (Firebase REST). El idToken se comparte entre todos los VUs:
// suficiente para un baseline read-heavy. ⚠️ El token expira en 1h → tests < ~50min.
export function setup() {
  const res = http.post(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
    JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  check(res, { 'login 200': (r) => r.status === 200 });
  const idToken = res.json('idToken');
  if (!idToken) throw new Error('Login falló (revisá API_KEY/credenciales): ' + res.body);
  return { token: idToken };
}

export default function (data) {
  const headers = { Authorization: `Bearer ${data.token}` };
  const mk = (name) => ({ headers, tags: { name } }); // tag → métricas por endpoint

  group('dashboard cliente', () => {
    const res = http.batch({
      trabajos:   { method: 'GET', url: `${BASE}/api/trabajos/cliente`,                         params: mk('trabajos-cliente') },
      historial:  { method: 'GET', url: `${BASE}/api/trabajos/cliente/historial?page=0&size=10`, params: mk('historial') },
      mudanzas:   { method: 'GET', url: `${BASE}/api/mudanzas/cliente`,                          params: mk('mudanzas-cliente') },
      oficios:    { method: 'GET', url: `${BASE}/api/oficios`,                                   params: mk('oficios') },
      me:         { method: 'GET', url: `${BASE}/api/users/me`,                                  params: mk('users-me') },
      unread:     { method: 'GET', url: `${BASE}/api/notificaciones/unread-count`,               params: mk('unread-count') },
    });

    for (const key in res) {
      check(res[key], { [`${key} 200`]: (r) => r.status === 200 });
    }
  });

  sleep(SLEEP);
}

// Genera un reporte HTML (con gráficos) además del resumen en consola.
export function handleSummary(data) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  return {
    [`loadtest/report-dashboard-${ts}.html`]: htmlReport(data),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

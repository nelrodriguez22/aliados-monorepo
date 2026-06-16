import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

// ---------------------------------------------------------------------------
// Stress test de SOLO LECTURA contra endpoints publicos del backend Aliados.
// Endpoints (todos GET, sin auth, definidos en SecurityConfig.permitAll):
//   /api/health         -> solo app, sin DB
//   /api/oficios        -> app + query a Neon
//   /api/mudanzas/tiers -> app + query a Neon
//
// Uso:
//   k6 run stress.js                          # perfil por defecto (ramp suave)
//   PEAK=100 k6 run stress.js                 # subir el pico de VUs
//   BASE_URL=http://localhost:8080 k6 run stress.js
// ---------------------------------------------------------------------------

const BASE_URL = __ENV.BASE_URL || 'https://aliados-web-backend-prd.up.railway.app';
const PEAK = parseInt(__ENV.PEAK || '50', 10);

// Metricas por endpoint para distinguir el costo de la app vs. el de la DB.
const healthDur = new Trend('dur_health', true);
const oficiosDur = new Trend('dur_oficios', true);
const tiersDur = new Trend('dur_tiers', true);
const errors = new Rate('errors');

export const options = {
  // Ramp escalonado: subimos de a poco para no golpear prod de golpe.
  stages: [
    { duration: '30s', target: Math.ceil(PEAK * 0.2) }, // calentamiento
    { duration: '1m', target: Math.ceil(PEAK * 0.5) },  // carga media
    { duration: '1m', target: PEAK },                    // pico
    { duration: '1m', target: PEAK },                    // sostener pico
    { duration: '30s', target: 0 },                      // enfriamiento
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],      // <1% de requests fallidos
    http_req_duration: ['p(95)<1500'],   // 95% bajo 1.5s
    errors: ['rate<0.01'],
  },
};

function hit(name, url, trend) {
  const res = http.get(url, { tags: { endpoint: name } });
  trend.add(res.timings.duration);
  const ok = check(res, {
    [`${name}: status 200`]: (r) => r.status === 200,
  });
  errors.add(!ok);
  return res;
}

export default function () {
  group('health', () => hit('health', `${BASE_URL}/api/health`, healthDur));
  group('oficios', () => hit('oficios', `${BASE_URL}/api/oficios`, oficiosDur));
  group('tiers', () => hit('tiers', `${BASE_URL}/api/mudanzas/tiers`, tiersDur));

  // Pausa breve para simular un cliente real y no saturar artificialmente.
  sleep(1);
}

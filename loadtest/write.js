import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';
import { htmlReport } from 'https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';

// ──────────────────────────────────────────────────────────────────────────
// Load test de ESCRITURA: cada iteración CREA un trabajo (dispara scoring +
// notificación al proveedor vía AFTER_COMMIT) y luego lo CANCELA (cleanup).
// Mide los paths transaccionales, los más pesados.
//
// ⚠️⚠️ GENERA DATOS REALES:
//   - Crea trabajos (quedan como CANCELADO) y notificaciones.
//   - El alta matchea y NOTIFICA a un proveedor real (push al/los testers).
//   Correr SOLO en un entorno borrable / pre-launch y con carga baja.
//   Cleanup sugerido al final (ver loadtest/README.md).
//
//   BASE_URL=... FB_API_KEY=... TEST_EMAIL=... TEST_PASSWORD=... k6 run loadtest/write.js
// ──────────────────────────────────────────────────────────────────────────

const BASE     = __ENV.BASE_URL;
const API_KEY  = __ENV.FB_API_KEY;
const EMAIL    = __ENV.TEST_EMAIL;
const PASSWORD = __ENV.TEST_PASSWORD;
const OFICIO_ID = Number(__ENV.OFICIO_ID || 2); // 2 = Plomero (ajustar si hace falta)
const SLEEP    = Number(__ENV.SLEEP || 2);
// Coordenadas dentro de Rosario (RegionRosario.contiene); override si cambia la región.
const LAT = Number(__ENV.LAT || -32.93582);
const LNG = Number(__ENV.LNG || -60.64758);

if (!BASE || !API_KEY || !EMAIL || !PASSWORD) {
  throw new Error('Faltan env vars: BASE_URL, FB_API_KEY, TEST_EMAIL, TEST_PASSWORD');
}

const creados   = new Counter('trabajos_creados');
const cancelados = new Counter('trabajos_cancelados');

export const options = {
  // Carga BAJA por defecto: es escritura y genera datos. Subí con cuidado.
  stages: __ENV.STAGES ? JSON.parse(__ENV.STAGES) : [
    { duration: '30s', target: 5 },
    { duration: '1m',  target: 10 },
    { duration: '20s', target: 0 },
  ],
  thresholds: {
    http_req_failed:   ['rate<0.01'],
    http_req_duration: ['p(95)<1500'], // los writes toleran más que los reads
  },
};

export function setup() {
  const res = http.post(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
    JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  check(res, { 'login 200': (r) => r.status === 200 });
  const idToken = res.json('idToken');
  if (!idToken) throw new Error('Login falló: ' + res.body);
  return { token: idToken };
}

export default function (data) {
  const headers = {
    Authorization: `Bearer ${data.token}`,
    'Content-Type': 'application/json',
  };

  // 1) Crear trabajo
  const createBody = JSON.stringify({
    oficioId: OFICIO_ID,
    descripcion: 'load test - ignorar',
    direccion: 'Rosario, Santa Fe (load test)',
    latitudCliente: LAT,
    longitudCliente: LNG,
  });
  const createRes = http.post(`${BASE}/api/trabajos`, createBody, { headers, tags: { name: 'crear-trabajo' } });
  const ok = check(createRes, { 'crear 201': (r) => r.status === 201 });
  if (!ok) { sleep(SLEEP); return; }
  creados.add(1);

  const id = createRes.json('id');

  // 2) Cancelar (cleanup) — queda CANCELADO, no activo
  const cancelRes = http.patch(
    `${BASE}/api/trabajos/${id}/cancelar`,
    JSON.stringify({ motivo: 'load test cleanup' }),
    { headers, tags: { name: 'cancelar-trabajo' } },
  );
  if (check(cancelRes, { 'cancelar 200': (r) => r.status === 200 })) cancelados.add(1);

  sleep(SLEEP);
}

// Genera un reporte HTML (con gráficos) además del resumen en consola.
export function handleSummary(data) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  return {
    [`loadtest/report-write-${ts}.html`]: htmlReport(data),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

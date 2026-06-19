import ws from 'k6/ws';
import http from 'k6/http';
import { check } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { htmlReport } from 'https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';

// ──────────────────────────────────────────────────────────────────────────
// Load test de CONEXIONES WebSocket (STOMP). Cada VU abre una conexión, la
// autentica con el frame CONNECT (Authorization: Bearer), se suscribe y la
// MANTIENE abierta `HOLD` segundos. Sirve para medir cuántas sesiones WS
// simultáneas sostiene la instancia (memoria) antes de degradarse.
//
// Trick: el endpoint usa SockJS (`/ws`), pero el transporte nativo está en
// `…/ws/websocket` y habla STOMP directo (sin envoltorio SockJS).
//
//   BASE_URL=... FB_API_KEY=... TEST_EMAIL=... TEST_PASSWORD=... k6 run loadtest/websocket.js
// ──────────────────────────────────────────────────────────────────────────

const BASE     = __ENV.BASE_URL;
const API_KEY  = __ENV.FB_API_KEY;
const EMAIL    = __ENV.TEST_EMAIL;
const PASSWORD = __ENV.TEST_PASSWORD;
const HOLD     = Number(__ENV.HOLD || 60);     // seg que cada conexión queda abierta
const ORIGIN   = __ENV.ORIGIN || 'https://aliados-app-22.web.app'; // debe matchear allowedOrigins

if (!BASE || !API_KEY || !EMAIL || !PASSWORD) {
  throw new Error('Faltan env vars: BASE_URL, FB_API_KEY, TEST_EMAIL, TEST_PASSWORD');
}

const WS_URL = BASE.replace(/^http/, 'ws') + '/ws/websocket';
const NULL = String.fromCharCode(0); // terminador de frame STOMP

const stompConnected = new Counter('stomp_connected');   // CONNECTED recibidos
const stompErrors    = new Counter('stomp_errors');      // errores de socket/handshake
const ttConnected    = new Trend('stomp_time_to_connected', true); // ms hasta CONNECTED

export const options = {
  // Cada VU = 1 conexión sostenida. Subí target para hallar el techo de conexiones.
  stages: __ENV.STAGES ? JSON.parse(__ENV.STAGES) : [
    { duration: '1m', target: 100 },
    { duration: '2m', target: 200 },
    { duration: '1m', target: 200 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    stomp_errors: ['count<1'],            // idealmente 0 fallos de conexión
    ws_connecting: ['p(95)<1000'],        // handshake WS < 1s
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
  const params = { headers: { Origin: ORIGIN } };
  const start = Date.now();

  const res = ws.connect(WS_URL, params, (socket) => {
    socket.on('open', () => {
      // Frame STOMP CONNECT con el token en header nativo (lo lee WebSocketAuthInterceptor).
      const connect =
        'CONNECT\n' +
        'accept-version:1.2\n' +
        'heart-beat:10000,10000\n' +
        `Authorization:Bearer ${data.token}\n` +
        '\n' + NULL;
      socket.send(connect);
    });

    socket.on('message', (msg) => {
      if (msg.indexOf('CONNECTED') === 0) {
        stompConnected.add(1);
        ttConnected.add(Date.now() - start);
        // Suscripción a la cola de notificaciones del usuario (como hace el front).
        socket.send('SUBSCRIBE\nid:sub-0\ndestination:/user/queue/notifications\n\n' + NULL);
      }
    });

    socket.on('error', (e) => {
      stompErrors.add(1);
      // e.error() trae el detalle; lo dejamos como métrica para no inundar el log.
    });

    // Heart-beat STOMP (newline) cada 10s para no parecer inactivo.
    socket.setInterval(() => socket.send('\n'), 10000);
    // Mantener la conexión abierta HOLD seg y cerrar ordenado.
    socket.setTimeout(() => socket.close(), HOLD * 1000);
  });

  check(res, { 'ws handshake 101': (r) => r && r.status === 101 });
}

// Genera un reporte HTML (con gráficos) además del resumen en consola.
export function handleSummary(data) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  return {
    [`loadtest/report-websocket-${ts}.html`]: htmlReport(data),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

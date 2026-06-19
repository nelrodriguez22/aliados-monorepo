# Load test (k6)

Mide latencia (p50/p95/p99) y tasa de error del backend bajo concurrencia.
`dashboard.js` es **read-only** (no crea datos): simula el tráfico del dashboard del cliente.

## 1. Instalar k6
```bash
brew install k6        # macOS
# o: https://k6.io/docs/get-started/installation/
```

## 2. Qué necesitás a mano
- **BASE_URL**: la URL del backend a testear. Ej: `https://aliados-web-backend-prd.up.railway.app`
- **FB_API_KEY**: la Web API Key de Firebase (es pública, está en el bundle / en la URL `...signInWithPassword?key=AIza...`).
- **TEST_EMAIL / TEST_PASSWORD**: un usuario de prueba **cliente** (con email/password, no Google).

## 3. Correr
```bash
BASE_URL="https://TU-BACKEND" \
FB_API_KEY="AIza..." \
TEST_EMAIL="tester@ejemplo.com" \
TEST_PASSWORD="la-pass" \
k6 run loadtest/dashboard.js
```

Al final k6 imprime un resumen: `http_req_duration` (avg, p90, p95, p99), `http_req_failed`,
y métricas **por endpoint** (gracias a los tags `name`).

## Reporte HTML
Los tres scripts generan, además del resumen en consola, un **reporte HTML con gráficos** vía
`handleSummary` (usa el reporter estándar de k6, se descarga solo en runtime → requiere internet).
Queda en `loadtest/report-<test>-<timestamp>.html` — abrilo en el navegador. Está en `.gitignore`
(son artefactos de cada corrida).

## 4. Ajustar la carga
- **Rampa custom:** `STAGES='[{"duration":"2m","target":100},{"duration":"1m","target":0}]'`
- **Think time:** `SLEEP=2` (segundos entre iteraciones; más bajo = más carga por VU).

**Cómo interpretar VUs vs concurrencia:**
- Con `SLEEP` realista (~30-120s) → cada VU ≈ 1 usuario real online. `target: 500` ≈ 500 concurrentes.
- Con `SLEEP` bajo (2-5s) → exagerás la carga por VU para encontrar el punto de quiebre con menos VUs.

Para hallar el techo: subí `target` en escalones (50 → 100 → 200 → 400...) hasta que
`http_req_failed` suba o `p(95)` se dispare. Ese es tu límite con la instancia actual.

## ⚠️ Importante
- **No corras carga alta contra prod sin pensarlo.** Hoy prod es tu único entorno (Neon + Railway).
  Aunque el test es read-only, igual carga la DB y el server. Opciones:
  - Correrlo en **horario de baja** con rampa moderada (hasta ~50-100 VUs) para un baseline.
  - O levantar un entorno de staging y apuntar ahí.
- **Token:** expira en 1h → mantené los tests por debajo de ~50 min.
- **Un solo usuario de prueba** alcanza para baseline de latencia. Para más realismo (varios
  usuarios), se puede extender el script para loguear N usuarios desde un CSV.

---

# `websocket.js` — conexiones WebSocket (STOMP)

Mide cuántas **sesiones WS simultáneas** sostiene la instancia (memoria). Cada VU abre una
conexión, la autentica (frame STOMP `CONNECT` con `Authorization: Bearer`), se suscribe a
`/user/queue/notifications` y la **mantiene abierta** `HOLD` segundos.

```bash
BASE_URL="https://TU-BACKEND" FB_API_KEY="AIza..." \
TEST_EMAIL="..." TEST_PASSWORD="..." \
k6 run loadtest/websocket.js
```

- **HOLD**: segundos que cada conexión queda abierta (default 60). Más alto = más conexiones simultáneas reales.
- **ORIGIN**: debe matchear `allowedOriginPatterns` del server (default `https://aliados-app-22.web.app`).
- Métricas clave: `stomp_connected` (CONNECTED ok), `stomp_errors` (debe ser 0), `ws_connecting` (handshake), `stomp_time_to_connected`.
- **Hallar el techo de conexiones:** subí `target` (cada VU ≈ 1 conexión) hasta que `stomp_errors` aparezca o el handshake se dispare:
  ```bash
  STAGES='[{"duration":"1m","target":300},{"duration":"2m","target":800},{"duration":"1m","target":0}]' HOLD=90 ...
  ```

---

# `write.js` — escritura (crear + cancelar trabajo)

Mide los paths **transaccionales** (el alta dispara scoring + notificación AFTER_COMMIT). Cada
iteración crea un trabajo y lo cancela (queda `CANCELADO`).

> ⚠️ **GENERA DATOS REALES**: crea trabajos + notificaciones y **notifica a un proveedor real**
> (push a los testers). Correr **solo en pre-launch / entorno borrable** y con carga baja.

```bash
BASE_URL="https://TU-BACKEND" FB_API_KEY="AIza..." \
TEST_EMAIL="..." TEST_PASSWORD="..." OFICIO_ID=2 \
k6 run loadtest/write.js
```

- **OFICIO_ID**: oficio del trabajo (default 2 = Plomero). **LAT/LNG**: dentro de Rosario (default coords del centro).
- Métricas: `trabajos_creados`, `trabajos_cancelados`, latencia por endpoint (`crear-trabajo`, `cancelar-trabajo`).

### Cleanup tras el test de escritura
Borra los trabajos de prueba y sus notificaciones:
```sql
DELETE FROM notificaciones WHERE trabajo_id IN (SELECT id FROM trabajos WHERE descripcion = 'load test - ignorar');
DELETE FROM trabajos WHERE descripcion = 'load test - ignorar';
```

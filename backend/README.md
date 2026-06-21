# Aliados — Backend (API)

API REST + WebSocket de Aliados. Consumida por la [app](../apps/app). Para el panorama general ver el [README raíz](../README.md).

## Stack

- **Java 21**, **Spring Boot 3.4.2**: Web, Data JPA, Security, Validation, WebSocket, Actuator
- **PostgreSQL** gestionado en **Neon** (neon.tech) + **Flyway** (migraciones versionadas)
- **Firebase Admin** (verificación de ID tokens de la app + envío de push **FCM**)
- **Cloudinary** (imágenes), **Caffeine** (cache en memoria), **Resend** (emails de registración/verificación), **Sentry**
- Build: **Gradle** (`./gradlew`)
- Deploy: **Railway** (Docker)

## Estructura

```
src/main/java/com/aliados/backend/
  config/        Configuración (Security, CORS, Firebase, Cloudinary, WebSocket, cache…)
  controller/    Endpoints REST (incluye HealthController → /api/health)
  service/       Lógica de negocio
  repository/    Repositorios JPA
  entity/        Entidades JPA
  dto/           DTOs de request/response
  event/         Eventos de dominio
  websockets/    STOMP / mensajería en tiempo real
  exception/     Manejo de errores
  util/
src/main/resources/
  application.properties
  db/migration/  Migraciones Flyway (V…__*.sql, R__*.sql)
```

## Comandos

```bash
./gradlew bootRun      # levantar en local (requiere las env vars)
./gradlew build        # compilar + tests
./gradlew compileJava  # solo compilar
./gradlew test         # tests (JUnit / Spring Boot Test)
```

## Variables de entorno

| Variable | Para qué |
|----------|----------|
| `DATABASE_URL` | Conexión a Postgres (Neon) |
| `FIREBASE_CREDENTIALS` | Credenciales del service account de Firebase Admin (JSON), para verificar ID tokens y enviar push FCM |
| `FRONTEND_URL` | Origen permitido (CORS) |
| `GOOGLE_MAPS_API_KEY` | Geocoding |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Subida de imágenes |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | Envío de emails de registración / verificación |
| `SENTRY_DSN` | Sentry (errores) |
| `SENTRY_AUTH_TOKEN` | Subida de source maps a Sentry en el build |
| `MUDANZA_COMISION_PORCENTAJE` | Comisión de plataforma para mudanzas (%) |
| `MUDANZA_RATIO_TIEMPO` | **Solo testing** (acelera el cobro por tiempo). Debe ir en su valor real (`1.0`) en prod |

> Railway inyecta automáticamente `PORT` y `RAILWAY_GIT_COMMIT_SHA` (este último se usa como release de Sentry). Las primeras 10 filas son las que están configuradas en Railway; `MUDANZA_COMISION_PORCENTAJE` y la config fina de Sentry (`SENTRY_ENVIRONMENT` / `SENTRY_RELEASE` / `SENTRY_TRACES_SAMPLE_RATE`) tienen valor por defecto en `application.properties` y solo se setean si querés sobreescribirlas.

## Base de datos / migraciones

- Esquema versionado con **Flyway** en `src/main/resources/db/migration`.
- **No editar** migraciones ya aplicadas; agregar una nueva (`V<n>__descripcion.sql`).

## Deploy

Railway, por push. Usa [`railway.json`](./railway.json) con healthcheck en `/api/health` + graceful shutdown (`server.shutdown=graceful`) para deploys sin downtime.

> Auditoría de mejoras del backend: `backend/INFORME-MEJORAS-BACKEND.md`.

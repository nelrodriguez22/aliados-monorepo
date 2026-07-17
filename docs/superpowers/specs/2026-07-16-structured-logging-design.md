# Structured logging en el backend (escalera de observabilidad, paso 1)

**Fecha:** 2026-07-16
**Estado:** aprobado (diseño validado en conversación)
**Contexto:** decisión "ELK descartado en pre-launch" del INFORME-MEJORAS-BACKEND (PR #49).
Este es el paso 1 de la escalera: logs correlacionables hoy, y prerequisito de cualquier
destino futuro (Axiom/Loki/ELK) sin retrabajo.

## Problema

Los logs del backend son texto plano sin correlación: no se puede filtrar "todo lo de
este request" ni "todo lo que hizo este usuario". Cualquier destino de logs futuro
necesita JSON estructurado.

## Solución

**Enfoque nativo de Spring Boot 3.4** (elegido sobre logstash-logback-encoder +
logback-spring.xml: cero dependencias nuevas, cero XML; si un destino futuro exige un
formato exacto, se migra recién ahí):

1. **Formato JSON activable por env var, fuera del repo**: Spring Boot 3.4 trae
   structured logging nativo. En Railway se setea
   `LOGGING_STRUCTURED_FORMAT_CONSOLE=ecs` (relaxed binding →
   `logging.structured.format.console=ecs`). Sin la var, el pattern legible de
   siempre → dev local intacto, reversible al instante. El formato ECS incluye
   los valores del MDC automáticamente.
2. **`config/MdcLoggingFilter.java`** (molde: `SentryOrigenFilter`): puebla el MDC
   por request con:
   - `requestId`: header `X-Request-Id` entrante si existe (proxies/Railway suelen
     mandarlo); si no, UUID corto (8 chars alcanzan para correlacionar). Se devuelve
     también como header `X-Request-Id` de la respuesta → correlación cliente-servidor.
   - `uid`: firebaseUid del `Authentication` en el `SecurityContext` (lo puso
     `FirebaseAuthFilter`). Decisión validada: el uid es pseudonímico (no email/nombre),
     coherente con la política de Sentry (id+rol, nada más). Sin auth → sin campo.
   - `MDC.clear()` en `finally`: los threads del pool se reusan; sin limpieza un
     request loguearía con el uid del anterior.
3. **Orden en la cadena**: el filtro debe correr DESPUÉS de `FirebaseAuthFilter`
   (necesita el `SecurityContext` ya poblado) — se registra en `SecurityConfig` con
   `addFilterAfter(mdcLoggingFilter, FirebaseAuthFilter.class)`.

## Limitaciones aceptadas (documentar en el javadoc del filtro)

- Los threads del scheduler (`escalarUnTrabajo`) y los mensajes STOMP del chat no
  llevan MDC → esas líneas salen sin `requestId`/`uid`. Propagarlo (TaskDecorator /
  interceptors STOMP) es otra media jornada que no se paga hasta que duela.
- Con el formato ECS activo, la UI de Railway muestra JSON de una línea (menos legible
  a ojo). Por eso el gate por env var: se activa cuando haya drain o necesidad real.

## Testing

Unit test del filtro (JUnit + Mockito, sin contexto Spring, como `SentryOrigenFilterTest`):

| Test | Verifica |
|---|---|
| Header entrante | respeta el `X-Request-Id` recibido |
| Sin header | genera un id no vacío |
| Respuesta | el `X-Request-Id` sale como header de respuesta |
| Con auth | `uid` presente en el MDC durante la cadena |
| Sin auth | `uid` ausente |
| Limpieza | el MDC queda vacío después de la cadena, incluso si el downstream lanza |

El "durante la cadena" se captura con un `FilterChain` fake que lee el MDC adentro.

## Activación (fuera del repo, documentar en el informe)

- Railway → variables → `LOGGING_STRUCTURED_FORMAT_CONSOLE=ecs`. Rollback: borrarla.

## Fuera de alcance

- Propagación de MDC a scheduler/STOMP.
- Drain de logs a un destino externo (paso 2 de la escalera).
- Cambios de niveles o de mensajes de log existentes.

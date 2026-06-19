# Cloudinary Signed Upload — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar las fotos en base64 (trabajos, mudanzas) y agregar subida de avatar, subiendo las imágenes a Cloudinary vía signed upload (el backend firma; los bytes van directo cliente→Cloudinary) y guardando solo las URLs.

**Architecture:** El backend expone `POST /api/uploads/signature` que devuelve una firma para una carpeta según el tipo. El frontend sube la imagen directo a Cloudinary con esa firma y guarda la `secure_url`. Al cancelar trabajo/mudanza o reemplazar avatar, el backend borra las imágenes de Cloudinary (best-effort).

**Tech Stack:** Spring Boot + Gradle + Cloudinary Java SDK (`cloudinary-http5`) en backend; React 19 + Vite + apiClient en frontend.

## Global Constraints

- **Git:** NO ejecutar git (add/commit/push). El usuario commitea por tarea. Cada tarea termina en verificación, no en commit.
- **Tests:** frontend sin runner de tests → verificar con `npx tsc -b --noEmit`, `npm run lint`, `npm run build` (desde `apps/app/`). Backend: `./gradlew compileJava` (desde `backend/`); NO `./gradlew build` (el test `contextLoads` falla por falta de DB local, pre-existente).
- **ESLint:** regla `no-console: error` activa → NO usar `console.*` en código frontend nuevo (usar `toast`).
- **Cloudinary:** cuenta ya existe. Credenciales como env vars en Railway: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.
- **Carpetas Cloudinary:** `aliados/trabajos`, `aliados/mudanzas`, `aliados/avatars`.
- **Pre-launch:** vaciar los `fotos` base64 de prueba existentes (no hay migración).
- **Firma:** se firma exactamente `{timestamp, folder}` (lo que el cliente manda además de file/api_key/signature).

---

### Task 1: Backend — config Cloudinary + CloudinaryService

**Files:**
- Modify: `backend/build.gradle` (dependencia)
- Modify: `backend/src/main/resources/application.properties`
- Create: `backend/src/main/java/com/aliados/backend/config/CloudinaryConfig.java`
- Create: `backend/src/main/java/com/aliados/backend/entity/TipoUpload.java`
- Create: `backend/src/main/java/com/aliados/backend/dto/SignatureResponse.java`
- Create: `backend/src/main/java/com/aliados/backend/service/CloudinaryService.java`

**Interfaces:**
- Produces: `CloudinaryService.firmar(TipoUpload) → SignatureResponse`; `CloudinaryService.borrarFotos(String fotosJson)`; `CloudinaryService.borrarUrl(String url)`. `TipoUpload { TRABAJO, MUDANZA, AVATAR }`. `SignatureResponse(String signature, long timestamp, String apiKey, String cloudName, String folder)`.

- [ ] **Step 1: Agregar dependencia en `build.gradle`**

Dentro del bloque `dependencies {` (después de la línea de `firebase-admin`):
```gradle
	implementation 'com.cloudinary:cloudinary-http5:1.39.0'
```

- [ ] **Step 2: Propiedades en `application.properties`**

Agregar (junto a las demás config):
```properties
    # Cloudinary
    cloudinary.cloud-name=${CLOUDINARY_CLOUD_NAME}
    cloudinary.api-key=${CLOUDINARY_API_KEY}
    cloudinary.api-secret=${CLOUDINARY_API_SECRET}
```

- [ ] **Step 3: Crear `config/CloudinaryConfig.java`**

```java
package com.aliados.backend.config;

import com.cloudinary.Cloudinary;
import com.cloudinary.utils.ObjectUtils;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class CloudinaryConfig {

    @Bean
    public Cloudinary cloudinary(
            @Value("${cloudinary.cloud-name}") String cloudName,
            @Value("${cloudinary.api-key}") String apiKey,
            @Value("${cloudinary.api-secret}") String apiSecret) {
        return new Cloudinary(ObjectUtils.asMap(
                "cloud_name", cloudName,
                "api_key", apiKey,
                "api_secret", apiSecret,
                "secure", true
        ));
    }
}
```

- [ ] **Step 4: Crear `entity/TipoUpload.java`**

```java
package com.aliados.backend.entity;

public enum TipoUpload {
    TRABAJO,
    MUDANZA,
    AVATAR
}
```

- [ ] **Step 5: Crear `dto/SignatureResponse.java`**

```java
package com.aliados.backend.dto;

public record SignatureResponse(
        String signature,
        long timestamp,
        String apiKey,
        String cloudName,
        String folder
) {}
```

- [ ] **Step 6: Crear `service/CloudinaryService.java`**

```java
package com.aliados.backend.service;

import com.aliados.backend.dto.SignatureResponse;
import com.aliados.backend.entity.TipoUpload;
import com.cloudinary.Cloudinary;
import com.cloudinary.utils.ObjectUtils;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

@Service
public class CloudinaryService {

    private static final Logger logger = LoggerFactory.getLogger(CloudinaryService.class);

    private final Cloudinary cloudinary;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public CloudinaryService(Cloudinary cloudinary) {
        this.cloudinary = cloudinary;
    }

    public SignatureResponse firmar(TipoUpload tipo) {
        long timestamp = System.currentTimeMillis() / 1000L;
        String folder = switch (tipo) {
            case TRABAJO -> "aliados/trabajos";
            case MUDANZA -> "aliados/mudanzas";
            case AVATAR -> "aliados/avatars";
        };
        Map<String, Object> paramsToSign = ObjectUtils.asMap("timestamp", timestamp, "folder", folder);
        String signature = cloudinary.apiSignRequest(paramsToSign, cloudinary.config.apiSecret);
        return new SignatureResponse(
                signature, timestamp, cloudinary.config.apiKey, cloudinary.config.cloudName, folder);
    }

    /** Borra todas las fotos de un `fotos` (JSON array de secure_url). Best-effort. */
    public void borrarFotos(String fotosJson) {
        if (fotosJson == null || fotosJson.isBlank()) return;
        List<String> urls;
        try {
            urls = objectMapper.readValue(fotosJson, new TypeReference<List<String>>() {});
        } catch (Exception e) {
            logger.warn("No se pudo parsear fotos para borrar: {}", e.getMessage());
            return;
        }
        urls.forEach(this::borrarUrl);
    }

    /** Borra una imagen por su secure_url. Best-effort (no propaga errores). */
    public void borrarUrl(String url) {
        String publicId = extraerPublicId(url);
        if (publicId == null) return;
        try {
            cloudinary.uploader().destroy(publicId, ObjectUtils.emptyMap());
        } catch (Exception e) {
            logger.warn("No se pudo borrar de Cloudinary [{}]: {}", publicId, e.getMessage());
        }
    }

    /** Extrae el public_id (incluida carpeta, sin versión ni extensión) de una secure_url. */
    String extraerPublicId(String secureUrl) {
        if (secureUrl == null) return null;
        int idx = secureUrl.indexOf("/upload/");
        if (idx < 0) return null;
        String afterUpload = secureUrl.substring(idx + "/upload/".length());
        afterUpload = afterUpload.replaceFirst("^v\\d+/", ""); // quita versión v123/
        int dot = afterUpload.lastIndexOf('.');
        if (dot > 0) afterUpload = afterUpload.substring(0, dot); // quita extensión
        return afterUpload.isBlank() ? null : afterUpload;
    }
}
```

- [ ] **Step 7: Compilar**

Run (desde `backend/`): `./gradlew compileJava`
Expected: `BUILD SUCCESSFUL`. (Si la versión del SDK no resuelve, ajustar a la última `cloudinary-http5` disponible.)

> Commit lo hace el usuario.

---

### Task 2: Backend — endpoint de firma

**Files:**
- Create: `backend/src/main/java/com/aliados/backend/controller/UploadController.java`

**Interfaces:**
- Consumes: `CloudinaryService.firmar`, `TipoUpload`, `SignatureResponse` (Task 1).
- Produces: `POST /api/uploads/signature` body `{ "tipo": "TRABAJO|MUDANZA|AVATAR" }` → `SignatureResponse` JSON. Queda bajo `.authenticated()` (sin cambios en SecurityConfig).

- [ ] **Step 1: Crear `controller/UploadController.java`**

```java
package com.aliados.backend.controller;

import com.aliados.backend.dto.SignatureResponse;
import com.aliados.backend.entity.TipoUpload;
import com.aliados.backend.service.CloudinaryService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/uploads")
public class UploadController {

    private final CloudinaryService cloudinaryService;

    public UploadController(CloudinaryService cloudinaryService) {
        this.cloudinaryService = cloudinaryService;
    }

    @PostMapping("/signature")
    public ResponseEntity<SignatureResponse> firmar(@RequestBody Map<String, String> body) {
        // valueOf lanza IllegalArgumentException si el tipo es inválido → 400 (GlobalExceptionHandler)
        TipoUpload tipo = TipoUpload.valueOf(body.get("tipo"));
        return ResponseEntity.ok(cloudinaryService.firmar(tipo));
    }
}
```

- [ ] **Step 2: Compilar**

Run (desde `backend/`): `./gradlew compileJava`
Expected: `BUILD SUCCESSFUL`.

> Commit lo hace el usuario.

---

### Task 3: Backend — borrado integrado (cancelar / reemplazar avatar)

**Files:**
- Modify: `backend/src/main/java/com/aliados/backend/service/TrabajoService.java` (`cancelarTrabajo`)
- Modify: `backend/src/main/java/com/aliados/backend/service/MudanzaService.java` (`cancelarMudanza`)
- Modify: `backend/src/main/java/com/aliados/backend/service/UserService.java` (`updateProfile`)

**Interfaces:**
- Consumes: `CloudinaryService.borrarFotos(String)`, `CloudinaryService.borrarUrl(String)` (Task 1).

- [ ] **Step 1: Inyectar y usar en `TrabajoService.cancelarTrabajo`**

Agregar el campo inyectado junto a los otros `@Autowired` de `TrabajoService`:
```java
    @Autowired
    private CloudinaryService cloudinaryService;
```
En `cancelarTrabajo`, después de `trabajo = trabajoRepository.save(trabajo);` (el que sigue al `setMotivoCancelacion`), agregar:
```java
        cloudinaryService.borrarFotos(trabajo.getFotos());
```

- [ ] **Step 2: Inyectar y usar en `MudanzaService.cancelarMudanza`**

Agregar el campo inyectado junto a los otros `@Autowired` de `MudanzaService`:
```java
    @Autowired
    private CloudinaryService cloudinaryService;
```
En `cancelarMudanza` (método que arranca en la línea con `public MudanzaResponseDTO cancelarMudanza(...)`), después del `mudanzaRepository.save(...)` que persiste el estado `CANCELADO`, agregar:
```java
        cloudinaryService.borrarFotos(mudanza.getFotos());
```

- [ ] **Step 3: Manejar `fotoPerfil` en `UserService.updateProfile`**

Agregar el campo inyectado junto a los otros `@Autowired` de `UserService`:
```java
    @Autowired
    private CloudinaryService cloudinaryService;
```
En `updateProfile`, después de la línea de `localidad` y antes de `userRepository.save(user);`, agregar:
```java
        if (body.containsKey("fotoPerfil")) {
            String nueva = body.get("fotoPerfil");
            String anterior = user.getFotoPerfil();
            if (anterior != null && !anterior.equals(nueva)) {
                cloudinaryService.borrarUrl(anterior); // borra el avatar viejo
            }
            user.setFotoPerfil(nueva);
        }
```

- [ ] **Step 4: Compilar**

Run (desde `backend/`): `./gradlew compileJava`
Expected: `BUILD SUCCESSFUL`.

> Commit lo hace el usuario.

---

### Task 4: Frontend — helper `uploadToCloudinary` + CSP

**Files:**
- Create: `apps/app/src/shared/lib/uploadToCloudinary.ts`
- Modify: `firebase.json` (CSP `connect-src`)

**Interfaces:**
- Produces: `uploadToCloudinary(file: File, tipo: 'TRABAJO' | 'MUDANZA' | 'AVATAR'): Promise<string>` (devuelve la `secure_url`).

- [ ] **Step 1: Crear `apps/app/src/shared/lib/uploadToCloudinary.ts`**

```ts
import { apiClient } from '@/shared/lib/apiClient';

type UploadTipo = 'TRABAJO' | 'MUDANZA' | 'AVATAR';

interface SignatureResponse {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
}

const MAX_BYTES = 5 * 1024 * 1024; // 5MB

/**
 * Sube una imagen a Cloudinary vía signed upload: pide la firma al backend y luego
 * sube el archivo DIRECTO a Cloudinary (los bytes no pasan por nuestro servidor).
 * Devuelve la secure_url para guardar.
 */
export async function uploadToCloudinary(file: File, tipo: UploadTipo): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('El archivo debe ser una imagen');
  if (file.size > MAX_BYTES) throw new Error('La imagen supera los 5MB');

  const sig = await apiClient.post<SignatureResponse>('/api/uploads/signature', { tipo });

  const form = new FormData();
  form.append('file', file);
  form.append('api_key', sig.apiKey);
  form.append('timestamp', String(sig.timestamp));
  form.append('signature', sig.signature);
  form.append('folder', sig.folder);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new Error('Error subiendo la imagen a Cloudinary');

  const data = (await res.json()) as { secure_url: string };
  return data.secure_url;
}
```

- [ ] **Step 2: Agregar `https://api.cloudinary.com` al `connect-src` en `firebase.json`**

En `firebase.json`, en AMBOS headers de CSP (`Content-Security-Policy` y `Content-Security-Policy-Report-Only`), dentro de la directiva `connect-src`, agregar ` https://api.cloudinary.com` justo después de `https://res.cloudinary.com`. (Reemplazo del substring, aplica a las 2 ocurrencias:)
- Buscar: `https://res.cloudinary.com https://*.google-analytics.com`
- Reemplazar por: `https://res.cloudinary.com https://api.cloudinary.com https://*.google-analytics.com`

- [ ] **Step 3: Verificar typecheck**

Run (desde `apps/app/`): `npx tsc -b --noEmit`
Expected: sin errores.

> Commit lo hace el usuario.

---

### Task 5: Frontend — migrar `ServiceRequest` (fotos de trabajo)

**Files:**
- Modify: `apps/app/src/features/client/pages/ServiceRequest.tsx`

**Interfaces:**
- Consumes: `uploadToCloudinary` (Task 4).

- [ ] **Step 1: Importar el helper + estado de carga**

Agregar el import (junto a los otros imports del archivo):
```tsx
import { uploadToCloudinary } from "@/shared/lib/uploadToCloudinary";
```
Agregar el estado de carga junto a los otros `useState` (cerca de `const [imagenes, setImagenes] = useState<string[]>([])`):
```tsx
  const [uploading, setUploading] = useState(false);
```

- [ ] **Step 2: Reemplazar `handleImageUpload` por la versión que sube a Cloudinary**

Reemplazar la función `handleImageUpload` actual por:
```tsx
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    if (imagenes.length + files.length > 3) { toast.error('Máximo 3 fotos permitidas'); return; }
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const url = await uploadToCloudinary(file, 'TRABAJO');
        setImagenes((prev) => [...prev, url]);
      }
    } catch (err: any) {
      toast.error(err?.message ?? 'No se pudo subir la imagen. Intentá de nuevo.');
    } finally {
      setUploading(false);
      e.target.value = ''; // permite re-seleccionar el mismo archivo
    }
  };
```
(El submit sigue igual: `fotos: imagenes.length > 0 ? JSON.stringify(imagenes) : null` — ahora `imagenes` son URLs, no base64.)

- [ ] **Step 3: Deshabilitar el input mientras sube (opcional pero recomendado)**

En el `<input type="file" ...>` de fotos, agregar `disabled={uploading}`. Si hay un texto/botón de "agregar foto", mostrar "Subiendo..." cuando `uploading` sea true. (Si el input es accesible vía un label, agregar el `disabled` al input.)

- [ ] **Step 4: Verificar typecheck + build**

Run (desde `apps/app/`): `npx tsc -b --noEmit && npm run build`
Expected: sin errores; build OK.

> Commit lo hace el usuario.

---

### Task 6: Frontend — migrar `MudanzaRequest` (fotos de mudanza)

**Files:**
- Modify: `apps/app/src/features/client/pages/MudanzaRequest.tsx`

**Interfaces:**
- Consumes: `uploadToCloudinary` (Task 4).

- [ ] **Step 1: Importar el helper + estado de carga**

Agregar el import:
```tsx
import { uploadToCloudinary } from "@/shared/lib/uploadToCloudinary";
```
Agregar junto a `const [imagenes, setImagenes] = useState<string[]>([])`:
```tsx
  const [uploading, setUploading] = useState(false);
```

- [ ] **Step 2: Reemplazar `handleImageUpload`**

Reemplazar la función `handleImageUpload` actual por (nota: el límite acá es 5):
```tsx
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    if (imagenes.length + files.length > 5) { toast.error("Máximo 5 fotos"); return; }
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const url = await uploadToCloudinary(file, 'MUDANZA');
        setImagenes((prev) => [...prev, url]);
      }
    } catch (err: any) {
      toast.error(err?.message ?? 'No se pudo subir la imagen. Intentá de nuevo.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };
```
(El submit sigue: `fotos: JSON.stringify(imagenes)` — ahora URLs. La validación `if (imagenes.length === 0) throw ...` queda igual.)

- [ ] **Step 3: Deshabilitar input mientras sube**

En el `<input type="file">` de fotos, agregar `disabled={uploading}` y, si hay texto de ayuda, mostrar "Subiendo..." cuando corresponda.

- [ ] **Step 4: Verificar typecheck + build**

Run (desde `apps/app/`): `npx tsc -b --noEmit && npm run build`
Expected: sin errores; build OK.

> Commit lo hace el usuario.

---

### Task 7: Frontend — subida de avatar en `ClientProfile`

**Files:**
- Modify: `apps/app/src/features/client/pages/ClientProfile.tsx`

**Interfaces:**
- Consumes: `uploadToCloudinary` (Task 4); `PATCH`/`PUT /api/users/me` con `{ fotoPerfil }` (Task 3 lo persiste y borra el anterior).

- [ ] **Step 1: Imports + estado + ref**

Agregar imports (junto a los existentes):
```tsx
import { uploadToCloudinary } from "@/shared/lib/uploadToCloudinary";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
```
(Si `useState`/`useRef` ya están importados, no duplicar.)

Dentro del componente, agregar:
```tsx
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const url = await uploadToCloudinary(file, 'AVATAR');
      await apiClient.put('/api/users/me', { fotoPerfil: url });
      await queryClient.invalidateQueries({ queryKey: ['auth-profile'] });
      toast.success('Foto actualizada');
    } catch (err: any) {
      toast.error(err?.message ?? 'No se pudo actualizar la foto.');
    } finally {
      setUploadingAvatar(false);
      e.target.value = '';
    }
  };
```

- [ ] **Step 2: Botón "cambiar foto" sobre el avatar**

En el bloque del avatar (donde está `{user?.fotoPerfil ? <img .../> : ...}`), envolver/agregar un input file oculto + botón que lo dispara:
```tsx
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleAvatarChange}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingAvatar}
                      className="mt-2 text-xs font-medium text-brand-600 dark:text-dark-brand hover:opacity-70 disabled:opacity-50 cursor-pointer"
                    >
                      {uploadingAvatar ? 'Subiendo...' : 'Cambiar foto'}
                    </button>
```
(Ubicarlo cerca del `<img>`/placeholder del avatar, dentro del mismo contenedor.)

- [ ] **Step 3: Verificar typecheck + lint + build**

Run (desde `apps/app/`): `npx tsc -b --noEmit && npm run lint && npm run build`
Expected: typecheck OK; sin errores `no-console` nuevos; build OK.

> Commit lo hace el usuario.

---

## Verificación end-to-end (manual, pre-launch)

Requiere: env vars de Cloudinary en Railway, backend redeployado, frontend deployado, y haber vaciado los `fotos` base64 viejos.

1. **Trabajo:** crear un servicio con 1-3 fotos → en el dashboard de Cloudinary aparecen en `aliados/trabajos`; en la DB `fotos` tiene URLs (no `data:image`); se ven en el detalle del proveedor.
2. **Mudanza:** ídem en `aliados/mudanzas`.
3. **Avatar:** "Cambiar foto" en perfil → se ve; subir otra → la anterior desaparece de Cloudinary (`aliados/avatars`).
4. **Cancelación:** cancelar un trabajo/mudanza con fotos → las imágenes se borran de Cloudinary (revisar dashboard).
5. **Payload:** `GET /api/trabajos/cliente` ya no devuelve MB (las fotos no van en listados; y aunque fueran, ahora son URLs).
6. **CSP:** en la consola del navegador, la subida a `api.cloudinary.com` no debe dar error de CSP.

## Notas de despliegue

- Backend (Tasks 1-3): requiere agregar las 3 env vars de Cloudinary en Railway + redeploy.
- Frontend (Tasks 4-7): `npm run build` + `firebase deploy --only hosting:app`. El cambio de CSP en `firebase.json` aplica al deploy de hosting.

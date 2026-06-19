# Diseño: Subida de imágenes a Cloudinary (signed upload)

Fecha: 2026-06-18
Estado: Aprobado (sin commit, por regla de no tocar git sin permiso)
Relacionado: `backend/INFORME-MEJORAS-BACKEND.md` #20 (fotos base64 → payload gigante).

## Problema

Hoy las fotos (de trabajos y mudanzas) se guardan como **data URLs base64** en la columna
`fotos` (JSON string) — ver `ServiceRequest.tsx`/`MudanzaRequest.tsx` con
`FileReader.readAsDataURL`. Eso infla la DB y cada respuesta. `fotoPerfil` existe como campo
URL pero no tiene flujo de subida.

## Decisiones tomadas

- **Método: signed upload.** El backend firma cada subida (control), pero los **bytes van
  directo del cliente a Cloudinary** (escala: el backend no es cuello de botella). Descartado
  el backend-proxy justamente por el stacking de subidas en el server.
- **Alcance:** fotos de **trabajos** + **mudanzas** + **avatar (`fotoPerfil`)** (nuevo flujo).
- **Cuenta Cloudinary:** ya existe; credenciales como env vars en Railway.
- **Borrado:** al **cancelar** trabajo/mudanza y al **reemplazar** avatar (best-effort).
- **Almacenamiento:** `fotos` guarda array JSON de `secure_url`; el borrado parsea el
  `public_id` desde la URL (estructura estándar de Cloudinary).
- **Sin migración de datos:** pre-launch → se vacían las `fotos` base64 de prueba.

## Flujo (data flow)

```
Usuario elige imagen
  → POST /api/uploads/signature { tipo: TRABAJO | MUDANZA | AVATAR }   (autenticado)
  → Backend: mapea tipo→carpeta, firma {timestamp, folder} con API secret,
     responde { signature, timestamp, apiKey, cloudName, folder }
  → Front sube DIRECTO a https://api.cloudinary.com/v1_1/{cloudName}/image/upload
     (multipart: file, api_key, timestamp, signature, folder)   ← bytes NO pasan por backend
  → Cloudinary responde { secure_url, public_id }
  → Front guarda secure_url en `fotos` (trabajo/mudanza) o lo manda como fotoPerfil (avatar)
```

## Componentes

### Backend
1. **Dependencia + config:** Cloudinary Java SDK (`cloudinary-http5`). Bean `Cloudinary`
   configurado desde env vars `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`,
   `CLOUDINARY_API_SECRET` (en `application.properties` con placeholders + Railway).
2. **`CloudinaryService`:**
   - `firmar(tipo) → SignatureResponse`: valida tipo, resuelve carpeta
     (`aliados/trabajos` | `aliados/mudanzas` | `aliados/avatars`), `timestamp = now/1000`,
     `signature = cloudinary.apiSignRequest({timestamp, folder}, apiSecret)`. Devuelve
     `{ signature, timestamp, apiKey, cloudName, folder }`.
   - `borrar(List<String> urls)`: parsea `public_id` de cada URL y llama
     `uploader().destroy(publicId)`. Best-effort: loguea fallos, no propaga.
   - `extraerPublicId(String secureUrl)`: helper que extrae el public_id (incluida carpeta,
     sin versión `v###/` ni extensión) de una secure_url de Cloudinary.
3. **`UploadController` — `POST /api/uploads/signature`** (autenticado): recibe `{ tipo }`,
   delega en `CloudinaryService.firmar`. SecurityConfig: queda bajo `.authenticated()`.
4. **Borrado integrado:**
   - `TrabajoService.cancelarTrabajo`: tras cancelar, `cloudinaryService.borrar(fotos del trabajo)`.
   - `MudanzaService.cancelarMudanza`: ídem.
   - `UserService.updateProfile`: si llega `fotoPerfil` y difiere del actual, borrar el anterior
     y setear el nuevo. (Hoy `updateProfile` maneja nombre/telefono/localidad; se agrega `fotoPerfil`.)

### Frontend
5. **Helper `uploadToCloudinary(file, tipo): Promise<string>`** (nuevo, en `shared/lib`):
   pide firma a `/api/uploads/signature`, arma el `FormData`, hace `fetch` POST a Cloudinary,
   devuelve `secure_url`. Valida tamaño/formato antes (ej. ≤5MB, image/*).
6. **`ServiceRequest.tsx`:** `handleImageUpload` usa `uploadToCloudinary(file, 'TRABAJO')` en vez
   de `readAsDataURL`; `imagenes` pasa a ser array de URLs; spinner por imagen mientras sube;
   `fotos: JSON.stringify(urls)` (igual que hoy pero con URLs).
7. **`MudanzaRequest.tsx`:** ídem con `'MUDANZA'`.
8. **`ClientProfile.tsx`:** botón "cambiar foto" → `uploadToCloudinary(file, 'AVATAR')` →
   `PATCH /api/users/me { fotoPerfil: url }` → refresca perfil.

### Config / infra
- **CSP (`firebase.json`):** agregar `https://api.cloudinary.com` a `connect-src` (hoy no está;
  el POST de subida fallaría). `res.cloudinary.com` ya está en `img-src`.
- **Railway:** setear `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.

## Manejo de errores

- Firma o subida falla → toast de error, NO se confirma el formulario (no se persiste un
  trabajo/mudanza con fotos a medias).
- Validación client-side de tamaño/formato antes de subir (evita rechazos de Cloudinary).
- `borrar` es best-effort: si `destroy` falla, se loguea (`warn`) y la cancelación/replace
  igual procede. Una imagen huérfana es tolerable; romper la cancelación no.

## Testing (manual, pre-launch)

- Crear un servicio con 1-3 fotos → verificar que aparecen en Cloudinary (carpeta `aliados/trabajos`),
  que `fotos` guarda URLs (no base64), y que se ven en el detalle del proveedor.
- Ídem mudanza (`aliados/mudanzas`).
- Subir avatar → se ve en perfil; subir otro → el anterior se borra de Cloudinary.
- Cancelar un trabajo/mudanza con fotos → las imágenes se borran de Cloudinary.
- Confirmar que `/api/trabajos/cliente` ya no devuelve payloads pesados.

## Fuera de scope

- Limpieza de huérfanas por abandono de formulario (subió pero no confirmó) — quedan en
  Cloudinary; aceptable. Futuro: limpieza periódica o carpeta `temp` con auto-expiración.
- Transformaciones/optimización server-side (Cloudinary puede servir resized on-the-fly vía
  URL params si se quiere más adelante).
- Migración de datos base64 existentes (se vacían, pre-launch).

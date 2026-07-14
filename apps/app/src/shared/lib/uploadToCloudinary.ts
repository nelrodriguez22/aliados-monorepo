import { apiClient } from '@/shared/lib/apiClient';

type UploadTipo = 'TRABAJO' | 'MUDANZA' | 'AVATAR' | 'CHAT';

interface SignatureResponse {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
}

// Tope de seguridad para el archivo ORIGINAL (antes de comprimir): evita decodificar
// archivos absurdos en memoria. Las fotos de celular (3-8MB) entran sin problema.
const HARD_MAX_BYTES = 25 * 1024 * 1024;
// Tope final tras comprimir (Cloudinary rechaza >10MB en el plan free).
const CLOUDINARY_MAX_BYTES = 10 * 1024 * 1024;

// Compresión por tipo: lado mayor (px) y calidad JPEG. El avatar va chico porque
// se muestra mini; trabajo/mudanza más grande para que el proveedor vea el detalle.
const COMPRESSION: Record<UploadTipo, { maxDim: number; quality: number }> = {
  TRABAJO: { maxDim: 1600, quality: 0.8 },
  MUDANZA: { maxDim: 1600, quality: 0.8 },
  AVATAR:  { maxDim: 512,  quality: 0.8 },
  // Las fotos del chat se ven dentro de una burbuja (max-h-64) pero se abren para ver
  // detalle: mismo tratamiento que trabajo/mudanza.
  CHAT:    { maxDim: 1600, quality: 0.8 },
};

/**
 * Reescala (lado mayor <= maxDim) y re-encodea a JPEG en el navegador para que la
 * subida sea liviana (una foto de 3MB queda en ~150-300kB). `imageOrientation:
 * 'from-image'` corrige la rotación EXIF de las fotos de celular.
 * Si algo falla, no es un raster comprimible, o no logra achicar, devuelve el original.
 */
async function compressImage(file: File, maxDim: number, quality: number): Promise<File> {
  // Los GIF (posiblemente animados) no se comprimen para no perder la animación.
  if (file.type === 'image/gif' || typeof createImageBitmap !== 'function') return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) { bitmap.close(); return file; }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    );
    if (!blob || blob.size >= file.size) return file; // si no achicó, usar el original

    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

/**
 * Sube una imagen a Cloudinary vía signed upload: comprime en el cliente, pide la
 * firma al backend y luego sube el archivo DIRECTO a Cloudinary (los bytes no pasan
 * por nuestro servidor). Devuelve la secure_url para guardar.
 */
export async function uploadToCloudinary(file: File, tipo: UploadTipo): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('El archivo debe ser una imagen');
  if (file.size > HARD_MAX_BYTES) throw new Error('La imagen es demasiado grande (máx 25MB)');

  const { maxDim, quality } = COMPRESSION[tipo];
  const optimized = await compressImage(file, maxDim, quality);
  if (optimized.size > CLOUDINARY_MAX_BYTES) {
    throw new Error('La imagen es demasiado pesada, probá con otra.');
  }

  const sig = await apiClient.post<SignatureResponse>('/api/uploads/signature', { tipo });

  const form = new FormData();
  form.append('file', optimized);
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

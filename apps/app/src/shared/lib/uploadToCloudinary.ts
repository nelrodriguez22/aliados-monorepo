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

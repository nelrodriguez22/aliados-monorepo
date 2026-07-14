import { apiClient } from "@/shared/lib/apiClient";

export type TipoMensaje = "TEXTO" | "IMAGEN";

// Lo decide el backend (viene en TrabajoDTO.chatModo / MudanzaDTO.chatModo). El frontend NUNCA
// lo deriva del estado del servicio: esa regla vive sólo en ConversacionService.
export type ModoChat = "ESCRITURA" | "LECTURA";

export interface Mensaje {
  id: number;
  conversacionId: number;
  emisorId: number;
  emisorNombre: string;
  // null si el usuario nunca subió foto: la burbuja cae a las iniciales del nombre.
  emisorFotoPerfil: string | null;
  tipo: TipoMensaje;
  contenido: string | null;
  imagenUrl: string | null;
  creadoAt: string;
}

export interface PageMensajes {
  content: Mensaje[];
  number: number;
  totalPages: number;
  last: boolean;
}

export const ChatService = {
  // page 0 = mensajes más recientes.
  listarMensajes: (conversacionId: number, page = 0, size = 30) =>
    apiClient.get<PageMensajes>(
      `/api/conversaciones/${conversacionId}/mensajes?page=${page}&size=${size}`
    ),

  enviarTexto: (conversacionId: number, contenido: string) =>
    apiClient.post<Mensaje>(`/api/conversaciones/${conversacionId}/mensajes`, {
      tipo: "TEXTO",
      contenido,
    }),

  enviarImagen: (conversacionId: number, imagenUrl: string) =>
    apiClient.post<Mensaje>(`/api/conversaciones/${conversacionId}/mensajes`, {
      tipo: "IMAGEN",
      imagenUrl,
    }),

  marcarLeido: (conversacionId: number, hastaMensajeId: number) =>
    apiClient.post<void>(`/api/conversaciones/${conversacionId}/mensajes/leidos`, {
      hastaMensajeId,
    }),

  contarNoLeidos: (conversacionId: number) =>
    apiClient.get<{ count: number }>(`/api/conversaciones/${conversacionId}/no-leidos`),
};

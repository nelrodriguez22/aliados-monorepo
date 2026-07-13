export interface Oficio {
  id: number;
  nombre: string;
  icono: string;
  activo?: boolean;
}

export interface Notification {
  id: number;
  text: string;
  time: string;
  unread: boolean;
}

export interface Job {
  id: number;
  service: string;
  provider: string;
  status: string;
  statusVariant: 'success' | 'warning' | 'info';
  eta: string;
  avatar: string;
}

export interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

export interface User {
  uid: string;
  // Id de base del usuario (no confundir con `uid`, que es el de Firebase). Lo
  // necesita todo consumidor que compare contra `emisorId` de un mensaje de chat.
  id: number;
  name: string;
  email: string;
  role: 'CLIENT' | 'PROVIDER' | 'ADMIN';
  status: 'ONLINE' | 'OFFLINE' | 'BUSY';
  telefono?: string | null;
  fotoPerfil?: string | null;
  localidad?: string | null;
  oficio?: {
    id: number;
    nombre: string;
    icono: string;
  } | null;
  promedioCalificacion?: number;
  cantidadCalificaciones?: number;
  totalTrabajosCompletados?: number;
  codigo?: string | null;
}

export interface Store {
  user: User | null;
  isAuthenticated: boolean;
  theme: 'light' | 'dark';
  login: (user: User) => void;
  logout: () => void;
  setTheme: (theme: 'light' | 'dark') => void;
  updateUserStatus: (status: 'ONLINE' | 'OFFLINE' | 'BUSY') => void;
}

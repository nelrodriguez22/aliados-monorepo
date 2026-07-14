// src/shared/constants/routes.ts
export const ROUTES = {
  // Públicas
  HOME: '/',
  LOGIN: '/login',
  REGISTER: '/registro',
  CHECK_EMAIL: '/verifica-tu-correo',
  VERIFICATION_SUCCESS: '/verificacion-exitosa',
  RECOVER_PASSWORD: '/recuperar-contrasena',
  RESET_PASSWORD: '/restablecer-contrasena',
  ONBOARDING: '/completar-perfil',
  TERMS: '/terminos',
  PRIVACY: '/privacidad',

  //cliente
  CLIENT: {
    ROOT: 'cliente',
    DASHBOARD: '/cliente/dashboard',
    SEARCH: '/cliente/busqueda',
    SERVICE_REQUEST: '/cliente/pedido-de-servicio',
    TRACKING: (jobId: string | number = ':jobId') => `/cliente/seguimiento/${jobId}`,
    PROPOSAL: (jobId: string | number = ':jobId') => `/cliente/propuesta/${jobId}`,
    COMPLETED: (jobId: string | number = ':jobId') => `/cliente/completado/${jobId}`,
    NOTIFICATIONS: '/cliente/notificaciones',
    PROFILE: '/cliente/perfil',
    SETTINGS: '/cliente/configuracion',
    PAYMENT_METHODS: '/cliente/metodos-de-pago',
    MUDANZA_NEW: '/cliente/mudanza/nueva',
    MUDANZA_DETAIL: (id: string | number = ':id') => `/cliente/mudanza/${id}`,
  },

  // Proveedor
  PROVIDER: {
    ROOT: 'proveedor',
    DASHBOARD: '/proveedor/dashboard',
    JOB: (jobId: string | number = ':jobId') => `/proveedor/trabajo/${jobId}`,
    ACTIVE_JOB: (jobId: string | number = ':jobId') => `/proveedor/trabajo-activo/${jobId}`,
    COMPLETED_JOB: (jobId: string | number = ':jobId') => `/proveedor/completado/${jobId}`,
    REVIEWS: '/proveedor/resenas',
    MUDANZA_DETAIL: (id: string | number = ':id') => `/proveedor/mudanza/${id}`,
    NOTIFICATIONS: '/proveedor/notificaciones',
    PROFILE: '/proveedor/perfil',
    SETTINGS: '/proveedor/configuracion',
    CREDENCIAL: '/proveedor/credencial',
    PRESUPUESTO: (id: string | number = ':id') => `/proveedor/presupuesto/${id}`,
  },

  // Admin
  ADMIN: 'unlimitd-dashboard',
} as const;

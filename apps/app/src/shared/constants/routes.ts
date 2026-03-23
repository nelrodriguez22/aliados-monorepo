// src/shared/constants/routes.ts
export const ROUTES = {
  // Públicas
  HOME: '/',
  LOGIN: '/login',
  REGISTER: '/registro',
  VERIFICATION_SUCCESS: '/verificacion-exitosa',

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
  },

  // Proveedor
  PROVIDER: {
    ROOT: 'proveedor',
    DASHBOARD: '/proveedor/dashboard',
    JOB: (jobId: string | number = ':jobId') => `/proveedor/trabajo/${jobId}`,
    ACTIVE_JOB: (jobId: string | number = ':jobId') => `/proveedor/trabajo-activo/${jobId}`,
    COMPLETED_JOB: (jobId: string | number = ':jobId') => `/proveedor/completado/${jobId}`,
    REVIEWS: '/proveedor/resenas',
    NOTIFICATIONS: '/proveedor/notificaciones',
    PROFILE: '/proveedor/perfil',
    SETTINGS: '/proveedor/configuracion',
  },

  // Admin
  ADMIN: 'unlimitd-dashboard',
} as const;

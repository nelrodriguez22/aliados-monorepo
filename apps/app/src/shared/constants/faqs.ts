import type { User } from '@/shared/types/interfaces';

export type FaqAudiencia = 'cliente' | 'proveedor';

export interface Faq {
  q: string;
  a: string;
  audiencia: FaqAudiencia;
}

/** Tab inicial del modal de FAQs según el rol del usuario logueado. */
export function defaultAudiencia(role: User['role'] | undefined): FaqAudiencia {
  return role === 'PROVIDER' ? 'proveedor' : 'cliente';
}

export const FAQS: Faq[] = [
  // ── Clientes ──────────────────────────────────────────────────────────────
  {
    audiencia: 'cliente',
    q: '¿Qué es Aliados y cómo funciona?',
    a: 'Aliados es la plataforma que te conecta en minutos con profesionales de confianza para resolver las necesidades de mantenimiento y reparación en tu espacio. Solo tenés que indicar qué servicio necesitás (plomería, gas, electricidad, etc.), y la aplicación te conectará con el experto mejor calificado y más cercano a tu ubicación.',
  },
  {
    audiencia: 'cliente',
    q: '¿Cómo solicito un servicio?',
    a: "Desde tu panel, hacé clic en una de las tarjetas de 'Servicios populares' (Electricista, Plomero, Cerrajero, Gasista, Mudanzas) o usá el buscador y hacé clic en 'Buscar'. Luego completá la dirección (podés usar el GPS), describí el problema y adjuntá fotos opcionales. Confirmá con el botón 'Solicitar servicio'.",
  },
  {
    audiencia: 'cliente',
    q: '¿Cómo hago seguimiento de mi servicio?',
    a: "Tus solicitudes activas aparecen en 'Trabajos activos' del panel principal. Hacé clic en cualquiera para ver el estado en tiempo real. Las mudanzas activas se muestran en la sección 'Mudanzas activas'. Recibirás notificaciones push cuando haya novedades.",
  },
  {
    audiencia: 'cliente',
    q: '¿Cómo verifican a los profesionales que prestan el servicio?',
    a: 'Tu seguridad es nuestra prioridad. Todos los proveedores en nuestra red pasan por un riguroso proceso de validación que incluye verificación de identidad, revisión de antecedentes y validación de sus credenciales y matrículas habilitantes. Además, al recibir una propuesta podés ver el perfil del proveedor con su calificación promedio y reseñas de trabajos anteriores.',
  },
  {
    audiencia: 'cliente',
    q: '¿Cómo sé cuánto voy a pagar?',
    a: 'La transparencia es total. Antes de confirmar la solicitud, vas a recibir una tarifa clara para la visita técnica, luego el valor final del trabajo se acuerda directamente a través de la plataforma con un presupuesto detallado una vez que el profesional evalúa la tarea a realizar.',
  },
  {
    audiencia: 'cliente',
    q: '¿El presupuesto incluye el valor de los materiales?',
    a: 'No, el presupuesto es solo de la mano de obra, la lista de materiales necesarios es meramente enunciativa.',
  },
  {
    audiencia: 'cliente',
    q: '¿Cuáles son los métodos de pago disponibles?',
    a: 'Podés abonar de forma 100% segura a través de la aplicación utilizando tarjetas de crédito, débito o billeteras virtuales. Al centralizar el pago en la plataforma, garantizamos la seguridad de tu dinero.',
  },
  {
    audiencia: 'cliente',
    q: '¿Puedo cancelar una solicitud?',
    a: "Sí, podés cancelar mientras el estado sea 'Buscando proveedor'. Entrá al seguimiento del trabajo y usá la opción de cancelar; te pedirá ingresar el motivo. Una vez que el proveedor está en camino o trabajando ya no es posible cancelar.",
  },
  {
    audiencia: 'cliente',
    q: '¿Cómo califico al proveedor?',
    a: "Al completarse el servicio accedés automáticamente a la pantalla de calificación con estrellas (1 a 5) y comentario opcional. También podés calificar más tarde desde 'Historial de trabajos' en tu panel, haciendo clic en los trabajos con badge 'Sin calificar'.",
  },
  {
    audiencia: 'cliente',
    q: '¿Qué hago si surge un inconveniente con el trabajo realizado?',
    a: 'Contamos con un equipo de soporte dedicado. Si el servicio no cumple con los estándares acordados, podés reportarlo directamente desde la app. Revisaremos el caso inmediatamente para mediar con el profesional y brindarte una solución.',
  },
  {
    audiencia: 'cliente',
    q: '¿Cómo contacto a soporte?',
    a: 'Podés reportar un problema con el botón de bug de esta barra, o consultarnos por el asistente de chat. Para casos urgentes escribinos a soporte@aliados.com.',
  },
  // ── Profesionales ─────────────────────────────────────────────────────────
  {
    audiencia: 'proveedor',
    q: '¿Qué beneficios tengo al ofrecer mis servicios en Aliados?',
    a: 'Aliados funciona como tu principal canal de adquisición de clientes. Te conectamos de forma automática con personas y empresas que buscan activamente tus servicios en tu zona. Sos tu propio jefe: manejás tus horarios, optimizás tus rutas y potenciás tus ingresos sin gastar en publicidad.',
  },
  {
    audiencia: 'proveedor',
    q: '¿Cuáles son los requisitos para darme de alta en la plataforma?',
    a: 'Para garantizar la excelencia de la red, solicitamos: documento de identidad (DNI), constancia de inscripción impositiva Monotributo/Responsable Inscripto, certificado de antecedentes penales, la matrícula vigente obligatoria para aquellos oficios regulados (como gasistas o electricistas) y la póliza de un seguro de trabajo.',
  },
  {
    audiencia: 'proveedor',
    q: '¿Cómo recibo las solicitudes de trabajo?',
    a: 'Una vez que tu perfil esté validado y activo, la aplicación te enviará notificaciones en tiempo real cuando un cliente cercano requiera un servicio de tu especialidad. Vas a poder revisar los detalles del pedido antes de decidir si lo aceptás.',
  },
  {
    audiencia: 'proveedor',
    q: '¿Cómo activo o desactivo mi disponibilidad?',
    a: "En el encabezado de la app encontrarás el toggle que alterna entre 'Disponible' y 'Desconectado'. Al activarlo empezás a recibir solicitudes de trabajo. No podés desconectarte mientras tenés un trabajo en curso; el sistema te mostrará el estado 'Ocupado' automáticamente.",
  },
  {
    audiencia: 'proveedor',
    q: '¿Cómo es el sistema de comisiones y cuándo cobro?',
    a: 'Descargar la app y registrarse es completamente gratuito. Solo retenemos una comisión transparente y preestablecida por cada trabajo concretado con éxito a través de la plataforma. Tus ganancias se liquidan periódicamente y se transfieren de forma automática a la cuenta bancaria o billetera virtual que elijas.',
  },
  {
    audiencia: 'proveedor',
    q: '¿Qué sucede si un cliente cancela el servicio cuando ya estoy en camino?',
    a: 'Valoramos tu tiempo y tu esfuerzo. Contamos con una política de cancelación estricta. Si el cliente cancela el servicio de forma tardía o una vez que llegaste al domicilio, recibirás una compensación económica predefinida por el traslado.',
  },
];

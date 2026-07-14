// src/shared/lib/dayjs.ts
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/es';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(relativeTime);
dayjs.locale('es');

export const formatDateTime = (date: string | Date) => {
  return dayjs(date).tz('America/Argentina/Buenos_Aires').format('DD/MM/YYYY HH:mm');
};

export const formatTime = (date: string | Date) => {
  return dayjs(date).tz('America/Argentina/Buenos_Aires').format('HH:mm');
};

export const formatDate = (date: string | Date) => {
  return dayjs(date).tz('America/Argentina/Buenos_Aires').format('DD/MM/YYYY');
};

export const fromNow = (date: string | Date) => {
  return dayjs(date).tz('America/Argentina/Buenos_Aires').fromNow();
};

// ¿Dos fechas caen el mismo día? Se compara en horario argentino, no en el del navegador:
// un mensaje de las 22:30 de Buenos Aires es "ayer" para un navegador en Madrid.
export const esMismoDia = (a: string | Date, b: string | Date) =>
  dayjs(a).tz('America/Argentina/Buenos_Aires')
    .isSame(dayjs(b).tz('America/Argentina/Buenos_Aires'), 'day');

// Etiqueta del separador de día en el chat: "Hoy", "Ayer" o "12 de julio".
export const formatDiaRelativo = (date: string | Date) => {
  const d = dayjs(date).tz('America/Argentina/Buenos_Aires');
  const hoy = dayjs().tz('America/Argentina/Buenos_Aires');
  if (d.isSame(hoy, 'day')) return 'Hoy';
  if (d.isSame(hoy.subtract(1, 'day'), 'day')) return 'Ayer';
  return d.format(d.isSame(hoy, 'year') ? 'D [de] MMMM' : 'D [de] MMMM [de] YYYY');
};

export { dayjs };

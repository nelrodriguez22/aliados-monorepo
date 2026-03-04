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

export { dayjs };

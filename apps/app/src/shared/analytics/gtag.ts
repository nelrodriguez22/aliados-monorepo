// Google Analytics (gtag.js) — carga e instrumentación para el SPA.
//
// El SPA tiene un único index.html: gtag por sí solo solo dispara un page_view
// en la carga inicial. Las navegaciones de React Router NO generan page_view
// salvo que lo enviemos a mano (ver useAnalytics). Por eso configuramos con
// send_page_view: false y controlamos los page_view desde el router.
//
// Solo se activa en el build de producción (import.meta.env.PROD).

const GA_ID = 'G-C69HGKX2XV';

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

let initialized = false;

/** Inyecta gtag.js e inicializa. No-op fuera de producción o si ya se inicializó. */
export function initGtag(): void {
  if (!import.meta.env.PROD || initialized || typeof window === 'undefined') return;
  initialized = true;

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer.push(arguments);
  };
  window.gtag('js', new Date());
  // send_page_view: false → el page_view inicial y los de cada ruta los manda useAnalytics.
  window.gtag('config', GA_ID, { send_page_view: false });
}

/** Envía un page_view para la ruta actual. No-op fuera de producción. */
export function trackPageView(path: string): void {
  if (!import.meta.env.PROD || !initialized || typeof window === 'undefined') return;
  window.gtag('event', 'page_view', {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
  });
}

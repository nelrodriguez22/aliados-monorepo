// src/shared/hooks/useInstallPWA.ts
import { useState, useEffect } from 'react';

// Detección de iOS (incluye iPadOS, que se reporta como "MacIntel" con touch).
const detectIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// ¿Ya está instalada y corriendo como app? (no tiene sentido ofrecer instalar)
const detectStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  // iOS Safari expone esto en vez de display-mode
  (navigator as unknown as { standalone?: boolean }).standalone === true;

export function useInstallPWA() {
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isStandalone, setIsStandalone] = useState(detectStandalone);

  // iOS no dispara `beforeinstallprompt`: la instalación es manual (Compartir →
  // Agregar a inicio). Lo marcamos como "instalable vía instrucciones" si NO está
  // ya en modo standalone.
  const isIOS = detectIOS();

  useEffect(() => {
    const beforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
      setIsInstallable(true);
    };

    // Cuando se instala, ocultamos cualquier CTA.
    const installed = () => {
      setIsInstallable(false);
      setInstallPrompt(null);
      setIsStandalone(true);
    };

    window.addEventListener('beforeinstallprompt', beforeInstall);
    window.addEventListener('appinstalled', installed);
    return () => {
      window.removeEventListener('beforeinstallprompt', beforeInstall);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);

  const install = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstallable(false);
      setInstallPrompt(null);
    }
  };

  return {
    isInstallable,   // Android/Chrome: prompt nativo disponible
    isIOS,           // iOS Safari: requiere instrucciones manuales
    isStandalone,    // ya instalada → no ofrecer nada
    install,
  };
}

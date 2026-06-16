import { useState, useEffect } from 'react';
import { getMessagingInstance } from '@/shared/lib/firebase';
import { apiClient } from '@/shared/lib/apiClient';
import toast from 'react-hot-toast';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY || 'BFDfb_tFWtvZrF9YSAjLzQA8neaAdb6XIqEPPomSapukBbBnyx7XGihCWGw6YNvlJ9MR7JNCqhM9led9OaNIxjQ';

export function usePushNotifications() {
  // Detección de soporte sincrónica para evitar flash del banner.
  const supported =
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window;
  const [permission, setPermission] = useState<NotificationPermission>(
    supported ? Notification.permission : 'default'
  );
  const [isSupported] = useState(supported);

  // Listener de mensajes en foreground. Solo se monta (y descarga el chunk de
  // firebase/messaging) si el usuario YA concedió el permiso de push.
  useEffect(() => {
    if (!isSupported || Notification.permission !== 'granted') return;

    let active = true;
    let unsubscribe: (() => void) | undefined;

    (async () => {
      const messaging = await getMessagingInstance();
      if (!messaging || !active) return;
      const { onMessage } = await import('firebase/messaging');
      unsubscribe = onMessage(messaging, (payload) => {
        const { title, body } = payload.notification || {};
        if (title) toast(body || title, { duration: 5000 });
      });
    })();

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [isSupported]);

  const requestPermission = async (): Promise<boolean> => {
    if (!isSupported) return false;

    try {
      const result = await Notification.requestPermission();
      setPermission(result);

      if (result === 'granted') {
        const messaging = await getMessagingInstance();
        if (!messaging) return false;

        const { getToken } = await import('firebase/messaging');
        const fcmToken = await getToken(messaging, { vapidKey: VAPID_KEY });

        if (fcmToken) {
          // Enviar token al backend
          await apiClient.post('/api/users/fcm-token', { token: fcmToken });
          console.log('✅ FCM token registrado');
        }
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return false;
    }
  };

  return {
    isSupported,
    permission,
    requestPermission,
  };
}

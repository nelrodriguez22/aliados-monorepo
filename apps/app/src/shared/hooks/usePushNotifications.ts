import { useState, useEffect } from 'react';
import { messaging } from '@/shared/lib/firebase';
import { getToken, onMessage } from 'firebase/messaging';
import { getToken as getAuthToken } from '@/shared/lib/getToken';
import toast from 'react-hot-toast';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY || 'BFDfb_tFWtvZrF9YSAjLzQA8neaAdb6XIqEPPomSapukBbBnyx7XGihCWGw6YNvlJ9MR7JNCqhM9led9OaNIxjQ';

export function usePushNotifications() {
  // Leer permission sincrónicamente para evitar flash del banner
  const supported = typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window && messaging !== null;
  const [permission, setPermission] = useState<NotificationPermission>(
    supported ? Notification.permission : 'default'
  );
  const [isSupported] = useState(supported);

  // Escuchar mensajes en foreground
  useEffect(() => {
    if (!messaging) return;

    const unsubscribe = onMessage(messaging, (payload) => {
      const { title, body } = payload.notification || {};
      if (title) {
        toast(body || title, { duration: 5000 });
      }
    });

    return () => unsubscribe();
  }, []);

  const requestPermission = async (): Promise<boolean> => {
    if (!isSupported || !messaging) return false;

    try {
      const result = await Notification.requestPermission();
      setPermission(result);

      if (result === 'granted') {
        const fcmToken = await getToken(messaging, { vapidKey: VAPID_KEY });

        if (fcmToken) {
          // Enviar token al backend
          const authToken = await getAuthToken();
          await fetch(`${import.meta.env.VITE_API_URL}/api/users/fcm-token`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${authToken}`,
            },
            body: JSON.stringify({ token: fcmToken }),
          });
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

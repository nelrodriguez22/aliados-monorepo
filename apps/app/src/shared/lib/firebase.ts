import { initializeApp } from "firebase/app";
import { getAuth } from 'firebase/auth';
import type { Messaging } from 'firebase/messaging';
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export default app;

// Messaging se carga de forma diferida (import dinámico): firebase/messaging
// queda fuera del bundle inicial y solo se descarga cuando se usa push.
// La promesa se cachea para no reinicializar en cada llamada.
let messagingPromise: Promise<Messaging | null> | null = null;
export function getMessagingInstance(): Promise<Messaging | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (!messagingPromise) {
    messagingPromise = import('firebase/messaging').then(({ getMessaging }) =>
      getMessaging(app),
    );
  }
  return messagingPromise;
}

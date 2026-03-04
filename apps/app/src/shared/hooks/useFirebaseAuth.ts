import { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut, type User as FirebaseUser } from 'firebase/auth';
import { auth } from '@/shared/lib/firebase';

/**
 * Capa 1: Firebase listener puro.
 * 
 * Solo escucha onAuthStateChanged y expone:
 * - firebaseUser: el usuario de Firebase (null si no hay, o si email no verificado)
 * - isLoading: true mientras Firebase resuelve el estado inicial
 * 
 * Si el email no está verificado, hace signOut y trata como no autenticado.
 * NO hace fetch al backend. NO toca el store.
 */
export function useFirebaseAuth() {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user && !user.emailVerified) {
        // Email no verificado → tratar como no autenticado
        await signOut(auth);
        setFirebaseUser(null);
        setIsLoading(false);
        return;
      }

      setFirebaseUser(user);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return { firebaseUser, isLoading };
}

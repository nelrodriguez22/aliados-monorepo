// src/shared/lib/getToken.ts
import { auth } from './firebase';

export const getToken = async (): Promise<string> => {
  const user = auth.currentUser;
  if (!user) throw new Error('No hay usuario autenticado');
  return user.getIdToken();
};

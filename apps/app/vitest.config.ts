import { defineConfig } from "vitest/config";
import path from "path";

// Los tests NO leen el .env de desarrollo: las env vars se declaran acá, con valores falsos.
//
// Por qué importa: `firebase.ts` llama a getAuth() al importarse, y sin VITE_FIREBASE_API_KEY
// tira `auth/invalid-api-key` y tumba el archivo de test entero. En la máquina de un dev el
// .env tiene la key de verdad, así que todo pasa; en CI no hay .env y explota. El CI del front
// se cayó dos veces por exactamente esto, con tests que localmente estaban en verde.
//
// Declarándolas acá, local y CI corren en el MISMO entorno y esa clase de bug desaparece: un
// test nuevo que arrastre firebase (aunque sea de rebote, vía el automock de un hook que
// importe apiClient) ya no necesita acordarse de mockear nada.
//
// Son credenciales sintéticas: Firebase no las valida contra el servidor al inicializar, y
// ningún test hace llamadas reales de auth.
const envFalsas = {
  VITE_API_URL: "http://test.local",
  VITE_FIREBASE_API_KEY: "test-api-key",
  VITE_FIREBASE_AUTH_DOMAIN: "test.firebaseapp.com",
  VITE_FIREBASE_PROJECT_ID: "test-project",
  VITE_FIREBASE_STORAGE_BUCKET: "test.appspot.com",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "000000000000",
  VITE_FIREBASE_APP_ID: "1:000000000000:web:testtesttest",
  VITE_FIREBASE_MEASUREMENT_ID: "G-TEST00000",
};

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    env: envFalsas,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});

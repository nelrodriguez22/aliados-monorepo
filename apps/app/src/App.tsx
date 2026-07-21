import { AppRouter } from "@/router/AppRouter";
import { WebSocketProvider } from "@/shared/providers/WebSocketProvider";
import { ThemeProvider } from "@/shared/providers/ThemeProvider";
import { MaintenanceGate } from "@/shared/components/MaintenanceGate";
import { VersionGate } from "@/shared/components/VersionGate";
import { AuthProvider } from "@/shared/components/AuthProvider";
import { CookieConsentBanner } from "@/shared/consent/CookieConsentBanner";

export default function App() {
  return (
    <ThemeProvider>
      <VersionGate>
      <MaintenanceGate>
        <AuthProvider>
          <WebSocketProvider>
            <AppRouter />
          </WebSocketProvider>
        </AuthProvider>
      </MaintenanceGate>
      </VersionGate>
      {/* Fuera de los gates: el consentimiento debe verse en cualquier pantalla, y el
          efecto que carga GA según la decisión corre siempre que la app esté montada. */}
      <CookieConsentBanner />
    </ThemeProvider>
  );
}

import { AppRouter } from "@/router/AppRouter";
import { WebSocketProvider } from "@/shared/providers/WebSocketProvider";
import { ThemeProvider } from "@/shared/providers/ThemeProvider";
import { MaintenanceGate } from "@/shared/components/MaintenanceGate";
import { VersionGate } from "@/shared/components/VersionGate";
import { AuthProvider } from "@/shared/components/AuthProvider";

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
    </ThemeProvider>
  );
}

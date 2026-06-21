import { AppRouter } from "@/router/AppRouter";
import { WebSocketProvider } from "@/shared/providers/WebSocketProvider";
import { ThemeProvider } from "@/shared/providers/ThemeProvider";
import { MaintenanceGate } from "@/shared/components/MaintenanceGate";
import { AuthProvider } from "@/shared/components/AuthProvider";

export default function App() {
  return (
    <ThemeProvider>
      <MaintenanceGate>
        <AuthProvider>
          <WebSocketProvider>
            <AppRouter />
          </WebSocketProvider>
        </AuthProvider>
      </MaintenanceGate>
    </ThemeProvider>
  );
}

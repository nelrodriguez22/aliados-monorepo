import { AppRouter } from "@/router/AppRouter";
import { WebSocketProvider } from "@/shared/providers/WebSocketProvider";
import { ThemeProvider } from "@/shared/providers/ThemeProvider";
import { MaintenanceGate } from "@/shared/components/MaintenanceGate";

export default function App() {
  return (
    <ThemeProvider>
      <MaintenanceGate>
        <WebSocketProvider>
          <AppRouter />
        </WebSocketProvider>
      </MaintenanceGate>
    </ThemeProvider>
  );
}

import { AppRouter } from "@/router/AppRouter";
import { WebSocketProvider } from "@/shared/providers/WebSocketProvider";
import { ThemeProvider } from "@/shared/providers/ThemeProvider";

export default function App() {
  return (
    <ThemeProvider>
      <WebSocketProvider>
        <AppRouter />
      </WebSocketProvider>
    </ThemeProvider>
  );
}

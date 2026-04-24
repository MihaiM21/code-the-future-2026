import { useState, useEffect } from "react";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import LoginPage from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Safety from "./pages/Safety";
import CanBus from "./pages/CanBus";
import Sessions from "./pages/Sessions";
import AutonomyCommands from "./pages/AutonomyCommands";
import Settings from "./pages/Settings";
import type { Page } from "./types";
import { useSerialStore } from "./store";
import { useAuthStore } from "./store/auth";
import { AlertTriangle } from "lucide-react";

const PAGE_TITLES: Record<Page, string> = {
  dashboard: "Live Dashboard",
  safety: "Safety & Autonomy",
  can: "CAN Bus Monitor",
  laps: "Session Analytics",
  autonomy: "Autonomy Commands",
  settings: "Connection Settings",
};

function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { config, lastFrameAge } = useSerialStore();
  const { isAuthenticated, login, logout } = useAuthStore();

  // Check localStorage on mount to restore auth state
  useEffect(() => {
    const stored = localStorage.getItem("auth-store");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.state?.user) {
          // Auth state is already loaded by Zustand persistence
        }
      } catch (e) {
        console.error("Failed to restore auth state", e);
      }
    }
  }, []);

  if (!isAuthenticated) {
    return <LoginPage onLoginSuccess={(user) => login(user)} />;
  }

  const signalLost = config.connected && lastFrameAge > 2000;

  return (
    <div
      className="grid h-screen grid-rows-[56px_minmax(0,1fr)] overflow-hidden transition-[grid-template-columns] duration-200"
      style={{
        gridTemplateColumns: sidebarCollapsed
          ? "60px minmax(0, 1fr)"
          : "220px minmax(0, 1fr)",
      }}
    >
      <Sidebar
        currentPage={page}
        onNavigate={setPage}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((v) => !v)}
        onLogout={logout}
      />
      <Header pageTitle={PAGE_TITLES[page]} />

      {signalLost && (
        <div
          className="fixed top-14 right-0 z-[100] flex items-center gap-2 border-b border-[#e639464d] bg-[#e6394626] px-5 py-2.5 text-[0.85rem] font-semibold uppercase tracking-[0.06em] text-[var(--accent-red)]"
          style={{ left: sidebarCollapsed ? "60px" : "220px" }}
        >
          <AlertTriangle size={14} />
          SIGNAL LOST — No telemetry received in {Math.round(lastFrameAge / 1000)}s
        </div>
      )}

      <main className="col-start-2 flex min-h-0 flex-col overflow-hidden">
        {page === "dashboard" && <Dashboard />}
        {page === "safety"    && <Safety />}
        {page === "can"       && <CanBus />}
        {page === "laps"      && <Sessions />}
        {page === "autonomy"  && <AutonomyCommands />}
        {page === "settings"  && <Settings />}
      </main>
    </div>
  );
}

export default App;

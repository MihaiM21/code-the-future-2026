import {
  LayoutDashboard,
  ShieldCheck,
  Network,
  TrendingUp,
  Settings,
  ChevronLeft,
  Zap,
  Gauge,
  LogOut,
} from "lucide-react";
import type { Page } from "../types";
import { useAuthStore } from "../store/auth";

interface Props {
  currentPage: Page;
  onNavigate: (p: Page) => void;
  collapsed: boolean;
  onToggle: () => void;
  onLogout: () => void;
}

const navItems: { id: Page; label: string; icon: React.ReactNode }[] = [
  { id: "dashboard", label: "Dashboard",  icon: <LayoutDashboard size={18} /> },
  { id: "safety",    label: "Safety",     icon: <ShieldCheck size={18} /> },
  { id: "can",       label: "CAN Bus",    icon: <Network size={18} /> },
  { id: "laps",      label: "Sessions",  icon: <TrendingUp size={18} /> },
  { id: "settings",  label: "Connection", icon: <Settings size={18} /> },
];

export default function Sidebar({ currentPage, onNavigate, collapsed, onToggle, onLogout }: Props) {
  const { user } = useAuthStore();

  const handleLogout = () => {
    if (confirm("Are you sure you want to logout?")) {
      onLogout();
    }
  };

  return (
    <aside className="row-span-2 flex flex-col overflow-hidden border-r border-[var(--border)] bg-[var(--bg-surface)]">
      <div className="relative flex h-14 items-center gap-2.5 border-b border-[var(--border)] px-3.5 py-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--accent-cyan)] to-[var(--accent-purple)] text-black">
          <Gauge size={20}/>
        </div>
        {!collapsed && <span className="whitespace-nowrap text-base font-extrabold tracking-[0.1em] text-[var(--text-primary)]">APEX</span>}
        <button
          className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-transparent text-[var(--text-muted)] transition-colors duration-150 hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]"
          onClick={onToggle}
          aria-label="Toggle sidebar"
        >
          <ChevronLeft size={16} className={`transition-transform duration-200 ${collapsed ? "rotate-180" : ""}`} />
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-2 py-3">
        {navItems.map((item) => (
          <button
            key={item.id}
            className={`relative flex w-full items-center gap-2.5 whitespace-nowrap rounded-[10px] px-2.5 py-2.5 text-left text-sm font-medium transition-colors duration-150 ${
              currentPage === item.id
                ? "bg-[rgba(0,210,255,0.08)] text-[var(--accent-cyan)] hover:bg-[rgba(0,210,255,0.12)]"
                : "bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]"
            }`}
            onClick={() => onNavigate(item.id)}
            title={collapsed ? item.label : undefined}
          >
            <span className="flex shrink-0">{item.icon}</span>
            {!collapsed && <span className="flex-1">{item.label}</span>}
            {currentPage === item.id && <span className="absolute right-0 top-1/2 h-[18px] w-[3px] -translate-y-1/2 rounded-l-[3px] bg-[var(--accent-cyan)]" />}
          </button>
        ))}
      </nav>

      <div className="border-t border-[var(--border)] space-y-3 px-2 py-3">
        {!collapsed && user && (
          <div className="px-2 py-2 rounded-lg bg-[var(--bg-card)]">
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wide">Logged in as</p>
            <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{user.username}</p>
            <span
              className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-[0.08em] ${
                user.role === "authorized_user"
                  ? "border-[#06d6a04d] bg-[var(--accent-green-dim)] text-[var(--accent-green)]"
                  : "border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-muted)]"
              }`}
            >
              {user.role === "authorized_user" ? "Authorized User" : "User"}
            </span>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-2.5 py-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors text-sm font-medium"
          title={collapsed ? "Logout" : undefined}
        >
          <LogOut size={16} />
          {!collapsed && "Logout"}
        </button>
        {!collapsed && <span className="mono text-[0.72rem] text-[var(--text-muted)] block px-2">v0.1.0</span>}
      </div>
    </aside>
  );
}

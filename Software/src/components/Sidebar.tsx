import {
  LayoutDashboard,
  ShieldCheck,
  Network,
  TrendingUp,
  Settings,
  ChevronLeft,
  Gauge,
  LogOut,
  Database,
  Bot,
  CheckCircle2,
  CircleSlash,
  Terminal,
} from "lucide-react";
import type { Page } from "../types";
import { useAuthStore } from "../store/auth";
import { useAutonomyStore } from "../store";
import { approveAutonomyAction, rejectAutonomyAction } from "../services/autonomy";

interface Props {
  currentPage: Page;
  onNavigate: (p: Page) => void;
  collapsed: boolean;
  onToggle: () => void;
  onLogout: () => void;
}

const severityColor: Record<string, string> = {
  info: "var(--accent-cyan)",
  warning: "var(--accent-amber)",
  critical: "var(--accent-red)",
};

function AutonomyQueueMini({ onNavigate, collapsed }: { onNavigate: (p: Page) => void; collapsed: boolean }) {
  const actions = useAutonomyStore((s) => s.actions);
  const isAuthorized = useAuthStore((s) => s.isAuthorized);
  const pending = actions.filter((a) => a.status === "pending");

  if (collapsed) {
    return pending.length > 0 ? (
      <button
        onClick={() => onNavigate("safety")}
        className="relative flex w-full items-center justify-center rounded-[10px] px-2.5 py-2.5 text-[var(--accent-amber)] hover:bg-[var(--bg-card)] transition-colors"
        title={`${pending.length} pending autonomy action${pending.length > 1 ? "s" : ""}`}
      >
        <Bot size={18} />
        <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--accent-amber)] text-[0.55rem] font-bold text-black">
          {pending.length}
        </span>
      </button>
    ) : null;
  }

  if (pending.length === 0) return null;

  return (
    <div className="mx-2 mb-1 rounded-[10px] border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
      <div className="flex items-center gap-1.5 px-2.5 py-2 border-b border-[var(--border)]">
        <Bot size={13} style={{ color: "var(--accent-cyan)" }} />
        <span className="flex-1 text-[0.72rem] font-bold uppercase tracking-[0.06em] text-[var(--text-secondary)]">Queue</span>
        <span
          className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-[var(--accent-amber)] px-1 text-[0.6rem] font-bold text-black"
        >
          {pending.length}
        </span>
      </div>

      <div className="flex flex-col gap-1 p-1.5">
        {pending.slice(0, 2).map((action) => (
          <div key={action.id} className="rounded-md bg-[var(--bg-surface)] px-2 py-1.5">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="led shrink-0" style={{ background: severityColor[action.severity], boxShadow: `0 0 4px ${severityColor[action.severity]}` }} />
              <span className="flex-1 truncate text-[0.72rem] font-semibold text-[var(--text-primary)]">{action.title}</span>
              <span className="shrink-0 text-[0.6rem] uppercase font-bold" style={{ color: severityColor[action.severity] }}>{action.domain}</span>
            </div>
            {isAuthorized && (
              <div className="flex gap-1 mt-1">
                <button
                  type="button"
                  onClick={() => void approveAutonomyAction(action.id)}
                  className="flex flex-1 items-center justify-center gap-1 rounded-md border border-[#00d2ff33] bg-[rgba(0,210,255,0.06)] py-0.5 text-[0.65rem] font-semibold text-[var(--accent-cyan)] hover:bg-[rgba(0,210,255,0.12)] transition-colors"
                >
                  <CheckCircle2 size={10} /> OK
                </button>
                <button
                  type="button"
                  onClick={() => rejectAutonomyAction(action.id)}
                  className="flex flex-1 items-center justify-center gap-1 rounded-md border border-[var(--border)] bg-[rgba(255,255,255,0.03)] py-0.5 text-[0.65rem] font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <CircleSlash size={10} /> Skip
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {pending.length > 0 && (
        <button
          onClick={() => onNavigate("safety")}
          className="w-full border-t border-[var(--border)] px-2.5 py-1.5 text-center text-[0.68rem] font-semibold text-[var(--accent-cyan)] hover:bg-[rgba(0,210,255,0.05)] transition-colors"
        >
          View all {pending.length > 2 ? `(+${pending.length - 2} more)` : ""}→
        </button>
      )}
    </div>
  );
}

const navItems: { id: Page; label: string; icon: React.ReactNode }[] = [
  { id: "dashboard", label: "Dashboard",  icon: <LayoutDashboard size={18} /> },
  { id: "safety",    label: "Safety",     icon: <ShieldCheck size={18} /> },
  { id: "can",       label: "CAN Bus",    icon: <Network size={18} /> },
  { id: "laps",      label: "Sessions",  icon: <TrendingUp size={18} /> },
  { id: "autonomy",  label: "Autonomy",  icon: <Database size={18} /> },
  { id: "terminal",  label: "Terminal",   icon: <Terminal size={18} /> },
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
        {/* <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--accent-cyan)] to-[var(--accent-purple)] text-black">
          <Gauge size={20}/>
        </div> */}
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

      <AutonomyQueueMini onNavigate={onNavigate} collapsed={collapsed} />

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

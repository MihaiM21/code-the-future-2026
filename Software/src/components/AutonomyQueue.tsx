import { useAutonomyStore } from "../store";
import { useAuthStore } from "../store/auth";
import { approveAutonomyAction, rejectAutonomyAction, updateAutonomyActionCommand } from "../services/autonomy";
import { Bot, CheckCircle2, CircleSlash, Edit3, Sparkles } from "lucide-react";

const severityColor = {
  info: "var(--accent-cyan)",
  warning: "var(--accent-amber)",
  critical: "var(--accent-red)",
};

const statusLabel: Record<string, string> = {
  pending: "PENDING",
  approved: "APPROVED",
  sent: "SENT",
  rejected: "REJECTED",
  blocked: "BLOCKED",
};

export default function AutonomyQueue() {
  const actions = useAutonomyStore((state) => state.actions);
  const isAuthorized = useAuthStore((state) => state.isAuthorized);
  const pendingActions = actions.filter((action) => action.status === "pending");

  return (
    <div className="card flex min-h-0 flex-1 flex-col">
      <div className="card-header-row">
        <Bot size={16} style={{ color: "var(--accent-cyan)" }} />
        <h3>Autonomy Queue</h3>
        <span className="badge badge-cyan" style={{ marginLeft: "auto" }}>{pendingActions.length}</span>
      </div>

      <p className="mb-3 text-[0.83rem] leading-relaxed text-[var(--text-secondary)]">
        Sensor-driven recommendations appear here first. Authorized users can edit the command, approve it, or reject it.
      </p>

      <div className="flex max-h-[460px] flex-col gap-2 overflow-y-auto pr-1">
        {pendingActions.length === 0 && (
          <div className="rounded-md border border-dashed border-[var(--border)] bg-[var(--bg-card)] px-3 py-6 text-center text-[0.85rem] text-[var(--text-muted)]">
            No autonomy proposals yet. Telemetry rules will surface here as the car warms up.
          </div>
        )}

        {pendingActions.map((action) => (
          <div key={action.id} className="rounded-[12px] border border-[var(--border)] bg-[var(--bg-card)] p-3">
            <div className="mb-2 flex items-start gap-2">
              <span className="led" style={{ background: severityColor[action.severity], boxShadow: `0 0 6px ${severityColor[action.severity]}` }} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[0.82rem] font-semibold text-[var(--text-primary)]">{action.title}</span>
                  <span className="badge uppercase" style={{ background: action.requiresApproval ? "rgba(255,183,3,0.12)" : "rgba(6,214,160,0.12)", color: action.requiresApproval ? "var(--accent-amber)" : "var(--accent-green)" }}>
                    {action.requiresApproval ? "REVIEW" : "AUTO"}
                  </span>
                  <span className="badge uppercase" style={{ background: "rgba(255,255,255,0.05)", color: "var(--text-muted)" }}>
                    {statusLabel[action.status] ?? action.status.toUpperCase()}
                  </span>
                </div>
                <p className="mt-1 text-[0.8rem] leading-relaxed text-[var(--text-secondary)]">{action.rationale}</p>
                <p className="mt-1 text-[0.72rem] uppercase tracking-[0.08em] text-[var(--text-muted)]">Trigger: {action.trigger}</p>
              </div>
              <span className="badge uppercase" style={{ background: "rgba(255,255,255,0.05)", color: severityColor[action.severity] }}>
                {action.domain}
              </span>
            </div>

            <div className="mb-2 flex flex-wrap gap-1.5">
              {action.suggestedCommands.map((command) => (
                <button
                  key={command}
                  type="button"
                  className="rounded-full border border-[var(--border)] bg-[rgba(255,255,255,0.03)] px-2.5 py-1 text-[0.7rem] font-semibold tracking-[0.05em] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-cyan)] hover:text-[var(--accent-cyan)]"
                  onClick={() => updateAutonomyActionCommand(action.id, command)}
                  disabled={!isAuthorized || action.status === "sent" || action.status === "rejected"}
                >
                  <Sparkles size={10} className="mr-1 inline" />
                  {command}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-[0.7rem] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                <Edit3 size={11} />
                Command
              </label>
              <input
                type="text"
                value={action.command}
                onChange={(e) => updateAutonomyActionCommand(action.id, e.target.value)}
                disabled={!isAuthorized || action.status === "sent" || action.status === "rejected"}
                className="rounded-[10px] border border-[var(--border)] bg-[#0d0d1a] px-3 py-2 text-[0.8rem] text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-cyan)] disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void approveAutonomyAction(action.id)}
                disabled={!isAuthorized || action.status === "sent" || action.status === "rejected"}
              >
                <CheckCircle2 size={14} /> Approve
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => rejectAutonomyAction(action.id)}
                disabled={!isAuthorized || action.status === "sent" || action.status === "rejected"}
              >
                <CircleSlash size={14} /> Reject
              </button>
            </div>

            {!isAuthorized && (
              <p className="mt-2 text-[0.72rem] text-[var(--accent-amber)]">
                Read-only view. Sign in as an Authorized User to change or approve commands.
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
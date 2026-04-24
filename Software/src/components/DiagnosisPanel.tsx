import { Activity, AlertTriangle, Lightbulb, Send } from "lucide-react";
import { useDiagnosisStore } from "../store";
import { useAuthStore } from "../store/auth";
import { useAlertStore } from "../store";
import { sendSerialCommand } from "../services/command";
import type { DiagRecommendation } from "../types";

function HealthBar({ value, status }: { value: number; status: "ok" | "warn" | "crit" }) {
  const color =
    status === "ok"
      ? "var(--accent-green)"
      : status === "warn"
      ? "var(--accent-amber)"
      : "var(--accent-red)";
  return (
    <div className="h-1.5 w-full rounded-full bg-[var(--bg-surface)]">
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{ width: `${value}%`, background: color }}
      />
    </div>
  );
}

async function sendRecommendation(rec: DiagRecommendation, isAuthorized: boolean) {
  if (!isAuthorized) {
    useAlertStore.getState().addAlert({
      id: `diag-rec-blocked-${Date.now()}`,
      ts: Date.now(),
      severity: "critical",
      system: "Diagnosis",
      message: `Blocked recommendation "${rec.command}" — not authorized`,
    });
    return;
  }
  try {
    await sendSerialCommand(rec.command);
    useAlertStore.getState().addAlert({
      id: `diag-rec-sent-${Date.now()}`,
      ts: Date.now(),
      severity: "info",
      system: "Diagnosis",
      message: `Sent recommendation: ${rec.command}`,
    });
  } catch (e) {
    useAlertStore.getState().addAlert({
      id: `diag-rec-failed-${Date.now()}`,
      ts: Date.now(),
      severity: "critical",
      system: "Diagnosis",
      message: `Failed to send ${rec.command}: ${String(e)}`,
    });
  }
}

export default function DiagnosisPanel() {
  const result = useDiagnosisStore((s) => s.result);
  const isAuthorized = useAuthStore((s) => s.isAuthorized);

  if (!result) {
    return (
      <div className="card flex flex-col gap-2 p-4">
        <div className="card-header-row">
          <Activity size={14} style={{ color: "var(--accent-cyan)" }} />
          <span className="card-section-label">VEHICLE HEALTH</span>
        </div>
        <p className="text-[0.78rem] text-[var(--text-muted)]">Awaiting telemetry…</p>
      </div>
    );
  }

  const healthColor =
    result.healthPct >= 70
      ? "var(--accent-green)"
      : result.healthPct >= 40
      ? "var(--accent-amber)"
      : "var(--accent-red)";

  const urgencyColor = (u: DiagRecommendation["urgency"]) =>
    u === "high" ? "var(--accent-red)" : u === "medium" ? "var(--accent-amber)" : "var(--accent-green)";

  return (
    <div className="card flex flex-col gap-3 p-4">
      {/* Header + composite score */}
      <div className="flex items-center justify-between">
        <div className="card-header-row">
          <Activity size={14} style={{ color: "var(--accent-cyan)" }} />
          <span className="card-section-label">VEHICLE HEALTH</span>
        </div>
        <span
          className="mono text-[1.1rem] font-bold"
          style={{ color: healthColor }}
        >
          {result.healthPct}%
        </span>
      </div>

      {/* Overall bar */}
      <div className="h-2 w-full rounded-full bg-[var(--bg-surface)]">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${result.healthPct}%`, background: healthColor }}
        />
      </div>

      {/* Subsystems */}
      <div className="flex flex-col gap-2">
        {result.subsystems.map((sub) => (
          <div key={sub.name} className="grid items-center gap-2" style={{ gridTemplateColumns: "90px 1fr 36px" }}>
            <span className="text-[0.72rem] text-[var(--text-muted)] truncate">{sub.name}</span>
            <HealthBar value={sub.value} status={sub.status} />
            <span
              className="mono text-right text-[0.72rem]"
              style={{
                color:
                  sub.status === "ok"
                    ? "var(--accent-green)"
                    : sub.status === "warn"
                    ? "var(--accent-amber)"
                    : "var(--accent-red)",
              }}
            >
              {sub.value}%
            </span>
          </div>
        ))}
      </div>

      {/* Predictions */}
      {result.predictions.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-[var(--border)] pt-2">
          <div className="flex items-center gap-1.5">
            <AlertTriangle size={12} style={{ color: "var(--accent-amber)" }} />
            <span className="card-section-label text-[0.65rem]">PREDICTIONS</span>
          </div>
          {result.predictions.map((p) => (
            <div key={p.id} className="flex items-start gap-1.5">
              <span
                className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full"
                style={{
                  background:
                    p.severity === "critical"
                      ? "var(--accent-red)"
                      : p.severity === "warning"
                      ? "var(--accent-amber)"
                      : "var(--accent-cyan)",
                }}
              />
              <span className="text-[0.72rem] leading-snug text-[var(--text-secondary)]">{p.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Recommendations */}
      {result.recommendations.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-[var(--border)] pt-2">
          <div className="flex items-center gap-1.5">
            <Lightbulb size={12} style={{ color: "var(--accent-cyan)" }} />
            <span className="card-section-label text-[0.65rem]">RECOMMENDED</span>
          </div>
          {result.recommendations.map((rec) => (
            <div key={rec.id} className="flex items-center gap-2">
              <div className="flex flex-1 flex-col gap-0.5 min-w-0">
                <span
                  className="mono truncate text-[0.72rem] font-medium"
                  style={{ color: urgencyColor(rec.urgency) }}
                >
                  {rec.command}
                </span>
                <span className="truncate text-[0.68rem] text-[var(--text-muted)]">{rec.rationale}</span>
              </div>
              <button
                className="btn btn-ghost shrink-0 flex items-center gap-1 px-2 py-1 text-[0.68rem]"
                title={isAuthorized ? "Send command" : "Not authorized"}
                onClick={() => sendRecommendation(rec, isAuthorized)}
              >
                <Send size={10} />
                Send
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { ShieldCheck, Clock, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { useReliabilityStore } from "../store";
import type { ComponentLifetime, SessionSummary } from "../types";

function LifetimeBar({ lt }: { lt: ComponentLifetime }) {
  const color =
    lt.pctRemaining >= 50
      ? "var(--accent-green)"
      : lt.pctRemaining >= 20
      ? "var(--accent-amber)"
      : "var(--accent-red)";

  return (
    <div className="grid items-center gap-2" style={{ gridTemplateColumns: "70px 1fr 38px" }}>
      <span className="text-[0.72rem] text-[var(--text-muted)]">{lt.component}</span>
      <div className="h-1.5 w-full rounded-full bg-[var(--bg-surface)]">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${lt.pctRemaining}%`, background: color }}
        />
      </div>
      <span
        className="mono text-right text-[0.72rem]"
        style={{ color }}
      >
        {lt.pctRemaining}%
      </span>
    </div>
  );
}

function SessionRow({ session, prev }: { session: SessionSummary; prev?: SessionSummary }) {
  const date = new Date(session.startTs);
  const durationMin = Math.round((session.endTs - session.startTs) / 60000);

  const healthDelta = prev ? session.healthPctAvg - prev.healthPctAvg : null;
  const deltaColor =
    healthDelta === null
      ? "var(--text-muted)"
      : healthDelta >= 0
      ? "var(--accent-green)"
      : "var(--accent-red)";

  return (
    <div className="flex items-center gap-2 rounded-md bg-[var(--bg-card)] px-2.5 py-2 text-[0.72rem]">
      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <span className="text-[var(--text-secondary)]">
          {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
        <span className="text-[var(--text-muted)] mono">
          {durationMin}min · {session.lapCount} lap{session.lapCount !== 1 ? "s" : ""}
          {session.peakRpm > 0 && ` · ${session.peakRpm.toLocaleString()} RPM peak`}
        </span>
      </div>
      <div className="flex flex-col items-end gap-0.5">
        <span
          className="mono font-medium"
          style={{
            color:
              session.healthPctAvg >= 70
                ? "var(--accent-green)"
                : session.healthPctAvg >= 40
                ? "var(--accent-amber)"
                : "var(--accent-red)",
          }}
        >
          {session.healthPctAvg}%
        </span>
        {healthDelta !== null && (
          <span className="mono text-[0.65rem]" style={{ color: deltaColor }}>
            {healthDelta >= 0 ? "+" : ""}{healthDelta}
          </span>
        )}
      </div>
    </div>
  );
}

function formatStressTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

export default function ReliabilityPanel() {
  const [showSessions, setShowSessions] = useState(false);
  const { data, sessionStress } = useReliabilityStore();

  const handleReset = () => {
    if (confirm("Reset all reliability data? This cannot be undone.")) {
      useReliabilityStore.getState().setData({ sessions: [], cumulativeStress: [], lifetime: data.lifetime.map((lt) => ({ ...lt, usageScore: 0, pctRemaining: 100 })) });
    }
  };

  const allTimeWarnSeconds = data.cumulativeStress.reduce((a, c) => a + c.secondsInWarn, 0);
  const allTimeCritSeconds = data.cumulativeStress.reduce((a, c) => a + c.secondsInCrit, 0);

  // Detect degrading health trend across sessions (last 5)
  const recentSessions = data.sessions.slice(0, 5);
  let degradationWarning: string | null = null;
  if (recentSessions.length >= 3) {
    const avgRecent = recentSessions.slice(0, 3).reduce((a, s) => a + s.healthPctAvg, 0) / 3;
    const avgOlder = recentSessions.slice(2).reduce((a, s) => a + s.healthPctAvg, 0) / Math.max(1, recentSessions.slice(2).length);
    if (avgOlder - avgRecent > 5) {
      degradationWarning = `Avg health dropped ${Math.round(avgOlder - avgRecent)}% over recent sessions`;
    }
  }

  return (
    <div className="card flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <div className="card-header-row">
          <ShieldCheck size={14} style={{ color: "var(--accent-cyan)" }} />
          <span className="card-section-label">RELIABILITY</span>
        </div>
        <button className="btn btn-ghost px-2 py-1 text-[0.68rem]" onClick={handleReset} title="Reset reliability data">
          <Trash2 size={10} />
        </button>
      </div>

      {/* Component lifetime bars */}
      <div className="flex flex-col gap-2">
        {data.lifetime.map((lt) => (
          <LifetimeBar key={lt.component} lt={lt} />
        ))}
      </div>

      {/* Degradation warning */}
      {degradationWarning && (
        <div className="flex items-start gap-1.5 rounded-md bg-[var(--accent-amber-dim)] border border-[#ffb70333] px-2.5 py-2">
          <span className="text-[0.72rem] text-[var(--accent-amber)]">{degradationWarning}</span>
        </div>
      )}

      {/* Cumulative stress summary */}
      {(allTimeWarnSeconds > 0 || allTimeCritSeconds > 0) && (
        <div className="flex items-center gap-4 border-t border-[var(--border)] pt-2 text-[0.72rem]">
          <div className="flex items-center gap-1.5">
            <Clock size={11} style={{ color: "var(--accent-amber)" }} />
            <span className="text-[var(--text-muted)]">Warn:</span>
            <span className="mono text-[var(--accent-amber)]">{formatStressTime(allTimeWarnSeconds)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock size={11} style={{ color: "var(--accent-red)" }} />
            <span className="text-[var(--text-muted)]">Crit:</span>
            <span className="mono text-[var(--accent-red)]">{formatStressTime(allTimeCritSeconds)}</span>
          </div>
          {sessionStress.length > 0 && (
            <span className="text-[var(--text-muted)]">
              (this session: {formatStressTime(sessionStress.reduce((a, c) => a + c.secondsInWarn + c.secondsInCrit, 0))}s in stress)
            </span>
          )}
        </div>
      )}

      {/* Session history toggle */}
      {data.sessions.length > 0 && (
        <div className="border-t border-[var(--border)] pt-2">
          <button
            className="btn btn-ghost flex w-full items-center justify-between px-1 py-1 text-[0.72rem]"
            onClick={() => setShowSessions((v) => !v)}
          >
            <span className="text-[var(--text-muted)]">Session history ({data.sessions.length})</span>
            {showSessions ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          {showSessions && (
            <div className="mt-2 flex max-h-[260px] flex-col gap-1 overflow-y-auto">
              {data.sessions.map((s, i) => (
                <SessionRow key={s.sessionId} session={s} prev={data.sessions[i + 1]} />
              ))}
            </div>
          )}
        </div>
      )}

      {data.sessions.length === 0 && (
        <p className="text-[0.72rem] text-[var(--text-muted)]">No sessions recorded yet. Data saves when you disconnect.</p>
      )}
    </div>
  );
}

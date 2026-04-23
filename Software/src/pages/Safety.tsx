import { useConfigStore, useAlertStore } from "../store";
import { useTelemetryStore } from "../store";
import { sendCommand } from "../services/serial";
import {
  ShieldCheck, ShieldAlert, Sliders, Bell,
  Wind, Zap, ChevronRight, Trash2
} from "lucide-react";

const autonomyLabels = [
  { level: 0, name: "MANUAL",    desc: "No autonomous actions. All control is manual.", color: "var(--text-muted)" },
  { level: 1, name: "ADVISORY",  desc: "System advises but does not act.", color: "var(--accent-cyan)" },
  { level: 2, name: "SEMI-AUTO", desc: "System acts on safety events only.", color: "var(--accent-amber)" },
  { level: 3, name: "FULL-AUTO", desc: "System acts on all safety & performance events.", color: "var(--accent-red)" },
];

function AutonomySelector() {
  const { autonomyLevel, setAutonomyLevel } = useConfigStore();

  const handleSet = async (n: number) => {
    setAutonomyLevel(n);
    await sendCommand(`SET_AUTONOMY:${n}`);
  };

  return (
    <div className="card">
      <div className="card-header-row">
        <ShieldCheck size={16} style={{ color: "var(--accent-cyan)" }} />
        <h3>Autonomy Level</h3>
      </div>
      <div className="flex flex-col gap-1.5">
        {autonomyLabels.map((a) => (
          <button
            key={a.level}
            className={`flex items-center gap-3 rounded-[10px] border bg-[var(--bg-card)] px-3.5 py-3 text-left transition-all duration-150 ${autonomyLevel === a.level ? "" : "text-[var(--text-secondary)] hover:bg-white/[0.03]"}`}
            style={autonomyLevel === a.level
              ? { borderColor: a.color, color: a.color, background: "rgba(255,255,255,0.03)" }
              : { borderColor: "var(--border)" }}
            onClick={() => handleSet(a.level)}
          >
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[0.9rem] font-bold"
              style={autonomyLevel === a.level ? { background: a.color, color: "#000" } : { background: "rgba(255,255,255,0.06)" }}
            >
              {a.level}
            </span>
            <div className="flex-1">
              <span className="block text-[0.85rem] font-semibold">{a.name}</span>
              <span className="mt-0.5 block text-[0.72rem] text-[var(--text-muted)]">{a.desc}</span>
            </div>
            {autonomyLevel === a.level && <ChevronRight size={14} />}
          </button>
        ))}
      </div>
    </div>
  );
}

function SafetyRules() {
  const {
    fanThreshold, setFanThreshold,
    batteryLowV, setBatteryLowV,
    rpmLimit, setRpmLimit,
    autoFanEnabled, toggleAutoFan,
    autoBatteryAlertEnabled, toggleAutoBatteryAlert,
  } = useConfigStore();

  return (
    <div className="card">
      <div className="card-header-row">
        <Sliders size={16} style={{ color: "var(--accent-amber)" }} />
        <h3>Safety Thresholds</h3>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3 py-2">
          <div className="flex flex-1 items-start gap-2.5 text-[var(--text-muted)]">
            <Wind size={14} />
            <div>
              <div className="text-[0.85rem] font-medium text-[var(--text-primary)]">Auto Fan</div>
              <div className="mt-0.5 text-[0.72rem] text-[var(--text-muted)]">Activate fan above engine temp threshold</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="range" min={75} max={110} value={fanThreshold}
              onChange={(e) => setFanThreshold(+e.target.value)}
              className="range-input"
            />
            <span className="mono min-w-12 text-right text-[0.8rem] text-[var(--text-secondary)]">{fanThreshold}°C</span>
            <button
              className={`rounded-full border px-2.5 py-1 text-[0.7rem] font-bold tracking-[0.05em] ${autoFanEnabled ? "border-[#06d6a04d] bg-[var(--accent-green-dim)] text-[var(--accent-green)]" : "border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-muted)]"}`}
              onClick={toggleAutoFan}
            >
              {autoFanEnabled ? "ON" : "OFF"}
            </button>
          </div>
        </div>

        <div className="my-1 h-px bg-[var(--border)]" />

        <div className="flex items-center gap-3 py-2">
          <div className="flex flex-1 items-start gap-2.5 text-[var(--text-muted)]">
            <Zap size={14} />
            <div>
              <div className="text-[0.85rem] font-medium text-[var(--text-primary)]">Battery Low Voltage Alert</div>
              <div className="mt-0.5 text-[0.72rem] text-[var(--text-muted)]">Alert when battery drops below threshold</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="range" min={10} max={14} step={0.1} value={batteryLowV}
              onChange={(e) => setBatteryLowV(+e.target.value)}
              className="range-input"
            />
            <span className="mono min-w-12 text-right text-[0.8rem] text-[var(--text-secondary)]">{batteryLowV.toFixed(1)}V</span>
            <button
              className={`rounded-full border px-2.5 py-1 text-[0.7rem] font-bold tracking-[0.05em] ${autoBatteryAlertEnabled ? "border-[#06d6a04d] bg-[var(--accent-green-dim)] text-[var(--accent-green)]" : "border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-muted)]"}`}
              onClick={toggleAutoBatteryAlert}
            >
              {autoBatteryAlertEnabled ? "ON" : "OFF"}
            </button>
          </div>
        </div>

        <div className="my-1 h-px bg-[var(--border)]" />

        <div className="flex items-center gap-3 py-2">
          <div className="flex flex-1 items-start gap-2.5 text-[var(--text-muted)]">
            <ShieldAlert size={14} />
            <div>
              <div className="text-[0.85rem] font-medium text-[var(--text-primary)]">RPM Limit Advisory</div>
              <div className="mt-0.5 text-[0.72rem] text-[var(--text-muted)]">Warn when RPM exceeds limit</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="range" min={6000} max={12000} step={100} value={rpmLimit}
              onChange={(e) => setRpmLimit(+e.target.value)}
              className="range-input"
            />
            <span className="mono min-w-12 text-right text-[0.8rem] text-[var(--text-secondary)]">{rpmLimit.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ManualOverride() {
  const current = useTelemetryStore((s) => s.current);
  return (
    <div className="card">
      <div className="card-header-row">
        <Wind size={16} style={{ color: "var(--accent-green)" }} />
        <h3>Manual Override</h3>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <button
          className={`flex flex-col items-center gap-2 rounded-[10px] border px-4 py-4 text-[0.8rem] font-semibold transition-all duration-150 ${current?.fan_active ? "border-[#06d6a04d] bg-[var(--accent-green-dim)] text-[var(--accent-green)]" : "border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:border-[#06d6a04d] hover:text-[var(--accent-green)]"}`}
          onClick={() => sendCommand(current?.fan_active ? "FAN_OFF" : "FAN_ON")}
        >
          <Wind size={20} />
          <span>FAN {current?.fan_active ? "ON" : "OFF"}</span>
        </button>
        <button
          className={`flex flex-col items-center gap-2 rounded-[10px] border px-4 py-4 text-[0.8rem] font-semibold transition-all duration-150 ${current?.drs_active ? "border-[#00d2ff4d] bg-[var(--accent-cyan-dim)] text-[var(--accent-cyan)]" : "border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:border-[#00d2ff4d] hover:text-[var(--accent-cyan)]"}`}
          onClick={() => sendCommand(current?.drs_active ? "DRS_CLOSE" : "DRS_OPEN")}
        >
          <ChevronRight size={20} />
          <span>DRS {current?.drs_active ? "OPEN" : "CLOSED"}</span>
        </button>
      </div>
    </div>
  );
}

function AlertLog() {
  const { alerts, clearAlerts } = useAlertStore();
  const severityColor = { info: "var(--accent-cyan)", warning: "var(--accent-amber)", critical: "var(--accent-red)" };

  return (
    <div className="card flex min-h-0 flex-1 flex-col">
      <div className="card-header-row">
        <Bell size={16} style={{ color: "var(--accent-red)" }} />
        <h3>Alert Log</h3>
        <span className="badge badge-red" style={{ marginLeft: "auto" }}>{alerts.length}</span>
        <button className="btn btn-ghost" style={{ padding: "4px 8px", fontSize: "0.75rem" }} onClick={clearAlerts}>
          <Trash2 size={12} /> Clear
        </button>
      </div>
      <div className="flex max-h-[420px] flex-col gap-1 overflow-y-auto pr-1">
        {alerts.length === 0 && <div className="py-6 text-center text-[0.85rem] text-muted">No alerts recorded.</div>}
        {alerts.map((a) => (
          <div key={a.id} className="animate-slide-in flex items-center gap-2 rounded-md bg-[var(--bg-card)] px-2.5 py-2 text-[0.78rem]">
            <span className="led" style={{ background: severityColor[a.severity], boxShadow: `0 0 5px ${severityColor[a.severity]}` }} />
            <span className="badge uppercase" style={{ background: "rgba(255,255,255,0.05)", color: "var(--text-muted)" }}>
              {a.system}
            </span>
            <span className="flex-1 text-[var(--text-primary)]">{a.message}</span>
            <span className="mono text-[0.7rem] text-[var(--text-muted)]">{new Date(a.ts).toLocaleTimeString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Safety() {
  return (
    <div className="page-content h-full">
      <div className="grid h-full gap-3.5 xl:grid-cols-2">
        <div className="flex flex-col gap-3.5">
          <AutonomySelector />
          <SafetyRules />
          <ManualOverride />
        </div>
        <div className="flex min-h-0 flex-col gap-3.5">
          <AlertLog />
        </div>
      </div>
    </div>
  );
}

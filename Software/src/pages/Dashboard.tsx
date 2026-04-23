import { useTelemetryStore } from "../store";
import {
  Thermometer, Zap, Droplets, Gauge,
  TrendingUp, AlertTriangle, Wind, Radio
} from "lucide-react";

// ── RPM Arc Gauge ─────────────────────────────────────────────
function RpmGauge({ rpm, max = 12000 }: { rpm: number; max?: number }) {
  const pct = Math.min(1, rpm / max);
  const startAngle = -220;
  const endAngle = 40;
  const sweepAngle = endAngle - startAngle;
  const angle = startAngle + pct * sweepAngle;

  const polarToXY = (deg: number, r: number) => {
    const rad = (deg * Math.PI) / 180;
    return { x: 80 + r * Math.cos(rad), y: 80 + r * Math.sin(rad) };
  };

  const describeArc = (start: number, end: number, r: number) => {
    const s = polarToXY(start, r);
    const e = polarToXY(end, r);
    const large = end - start > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
  };

  const needlePt = polarToXY(angle, 54);
  const redZone = rpm > max * 0.85;

  return (
    <div className="h-40 w-40">
      <svg viewBox="0 0 160 160" className="h-full w-full">
        {/* track */}
        <path d={describeArc(-220, 40, 62)} fill="none" stroke="#1e1e30" strokeWidth="10" strokeLinecap="round" />
        {/* fill */}
        <path
          d={describeArc(-220, -220 + pct * sweepAngle, 62)}
          fill="none"
          stroke={redZone ? "var(--accent-red)" : "var(--accent-cyan)"}
          strokeWidth="10"
          strokeLinecap="round"
          style={{ filter: redZone ? "drop-shadow(0 0 6px var(--accent-red))" : "drop-shadow(0 0 6px var(--accent-cyan))" }}
        />
        {/* needle */}
        <line
          x1="80" y1="80"
          x2={needlePt.x} y2={needlePt.y}
          stroke={redZone ? "var(--accent-red)" : "var(--text-primary)"}
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="80" cy="80" r="4" fill="var(--text-secondary)" />
        {/* value */}
        <text x="80" y="110" textAnchor="middle" fill="var(--text-primary)" fontSize="18" fontWeight="700" fontFamily="Inter">
          {Math.round(rpm / 100) * 100}
        </text>
        <text x="80" y="122" textAnchor="middle" fill="var(--text-muted)" fontSize="8" fontFamily="Inter">RPM</text>
      </svg>
    </div>
  );
}

// ── Throttle / Brake bars ─────────────────────────────────────
function ThrottleBrake({ throttle, brake }: { throttle: number; brake: number }) {
  return (
    <div className="flex h-[140px] items-end gap-2.5">
      <div className="flex flex-col items-center gap-1">
        <span className="text-[0.6rem] font-bold tracking-[0.08em] text-[var(--text-muted)]">THR</span>
        <div className="flex h-[90px] w-6 flex-col justify-end overflow-hidden rounded bg-[#1e1e30]">
          <div className="rounded bg-[var(--accent-green)] shadow-[0_0_8px_rgba(6,214,160,0.4)] transition-[height] duration-200" style={{ height: `${throttle}%` }} />
        </div>
        <span className="mono text-[0.68rem] text-[var(--text-secondary)]">{throttle}%</span>
      </div>
      <div className="flex flex-col items-center gap-1">
        <span className="text-[0.6rem] font-bold tracking-[0.08em] text-[var(--text-muted)]">BRK</span>
        <div className="flex h-[90px] w-6 flex-col justify-end overflow-hidden rounded bg-[#1e1e30]">
          <div className="rounded bg-[var(--accent-red)] shadow-[0_0_8px_rgba(230,57,70,0.4)] transition-[height] duration-200" style={{ height: `${brake}%` }} />
        </div>
        <span className="mono text-[0.68rem] text-[var(--text-secondary)]">{brake}%</span>
      </div>
    </div>
  );
}

// ── G-Force circle plot ───────────────────────────────────────
function GForcePlot({ lat, lon }: { lat: number; lon: number }) {
  const maxG = 3;
  const cx = 50, cy = 50, r = 40;
  const dotX = cx + (lat / maxG) * r;
  const dotY = cy - (lon / maxG) * r;

  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 100 100" className="h-[90px] w-[90px] shrink-0">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e1e30" strokeWidth="1" />
        <circle cx={cx} cy={cy} r={r * 0.67} fill="none" stroke="#1e1e30" strokeWidth="1" strokeDasharray="4 4" />
        <circle cx={cx} cy={cy} r={r * 0.33} fill="none" stroke="#1e1e30" strokeWidth="1" strokeDasharray="4 4" />
        <line x1={cx - r} y1={cy} x2={cx + r} y2={cy} stroke="#1e1e30" strokeWidth="1" />
        <line x1={cx} y1={cy - r} x2={cx} y2={cy + r} stroke="#1e1e30" strokeWidth="1" />
        <circle cx={dotX} cy={dotY} r={4} fill="var(--accent-cyan)"
          style={{ filter: "drop-shadow(0 0 4px var(--accent-cyan))" }}
        />
        <text x="50" y="98" textAnchor="middle" fill="var(--text-muted)" fontSize="7" fontFamily="Inter">LAT</text>
        <text x="2" y="52" textAnchor="start" fill="var(--text-muted)" fontSize="7" fontFamily="Inter">LON</text>
      </svg>
      <div className="flex flex-col gap-1 text-[0.85rem]">
        <span className="mono" style={{ color: "var(--accent-cyan)" }}>{lat.toFixed(2)}G</span>
        <span className="text-muted" style={{ fontSize: "0.7rem" }}>Lateral</span>
        <span className="mono" style={{ color: "var(--accent-purple)" }}>{lon.toFixed(2)}G</span>
        <span className="text-muted" style={{ fontSize: "0.7rem" }}>Longitudinal</span>
      </div>
    </div>
  );
}

// ── Temperature card ──────────────────────────────────────────
function TempCard({ label, value, warn, crit, icon }: {
  label: string; value: number; warn: number; crit: number; icon: React.ReactNode;
}) {
  const status = value >= crit ? "crit" : value >= warn ? "warn" : "ok";
  const colorMap = { ok: "var(--accent-green)", warn: "var(--accent-amber)", crit: "var(--accent-red)" };
  const color = colorMap[status];
  const pct = Math.min(100, (value / (crit * 1.1)) * 100);
  const borderClass = status === "crit"
    ? "border-[#e639464d]"
    : status === "warn"
    ? "border-[#ffb7034d]"
    : "border-[var(--border)]";

  return (
    <div className={`flex flex-col gap-2 rounded-2xl border bg-[var(--bg-card)] px-4 py-3.5 ${borderClass}`}>
      <div className="flex items-center gap-1.5">
        <span className="flex" style={{ color }}>{icon}</span>
        <span className="flex-1 text-[0.7rem] font-bold tracking-[0.08em] text-[var(--text-muted)]">{label}</span>
        {status !== "ok" && <AlertTriangle size={13} style={{ color }} />}
      </div>
      <div className="mono text-[1.6rem] leading-none font-bold" style={{ color }}>
        {value.toFixed(1)}<span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>°C</span>
      </div>
      <div className="h-[3px] overflow-hidden rounded bg-[#1e1e30]">
        <div className="h-full rounded transition-[width] duration-300" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

// ── Battery card ──────────────────────────────────────────────
function BatteryCard({ voltage, current, fault }: { voltage: number; current: number; fault: boolean }) {
  const status = fault ? "crit" : voltage < 11.5 ? "warn" : "ok";
  return (
    <div className="card">
      <div className="card-header-row">
        <Zap size={15} style={{ color: "var(--accent-amber)" }} />
        <span className="card-section-label">BATTERY</span>
        <span className={`led ${fault ? "led-red led-blink" : "led-green"}`} />
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-baseline gap-1">
          <span className={`mono text-[1.6rem] font-bold text-[var(--text-primary)] ${status === "crit" ? "text-crit" : status === "warn" ? "text-warn" : ""}`}>
            {voltage.toFixed(2)}
          </span>
          <span className="text-[0.75rem] text-[var(--text-muted)]">V</span>
        </div>
        <div className="h-[30px] w-px bg-[var(--border)]" />
        <div className="flex items-baseline gap-1">
          <span className="mono text-[1.6rem] font-bold text-[var(--text-primary)]">{current.toFixed(1)}</span>
          <span className="text-[0.75rem] text-[var(--text-muted)]">A</span>
        </div>
      </div>
      {fault && (
        <div className="mt-2 flex items-center gap-1.5 rounded-md bg-[var(--accent-red-dim)] px-2.5 py-1.5 text-[0.7rem] font-bold tracking-[0.06em] text-[var(--accent-red)] animate-pulse">
          <AlertTriangle size={12} /> SHORT CIRCUIT DETECTED
        </div>
      )}
    </div>
  );
}

// ── Fuel bar ──────────────────────────────────────────────────
function FuelCard({ level }: { level: number }) {
  const status = level < 15 ? "crit" : level < 30 ? "warn" : "ok";
  const color = status === "crit" ? "var(--accent-red)" : status === "warn" ? "var(--accent-amber)" : "var(--accent-cyan)";
  return (
    <div className="card">
      <div className="card-header-row">
        <Droplets size={15} style={{ color }} />
        <span className="card-section-label">FUEL</span>
        <span className="mono" style={{ color, marginLeft: "auto", fontSize: "1rem", fontWeight: 700 }}>
          {level.toFixed(1)}%
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded bg-[#1e1e30]">
        <div className="h-full rounded transition-[width] duration-300" style={{ width: `${level}%`, background: color }} />
      </div>
    </div>
  );
}

// ── System flags ─────────────────────────────────────────────
function SystemFlags({ fan, drs, autonomy, canErrors }: {
  fan: boolean; drs: boolean; autonomy: number; canErrors: number;
}) {
  const autonomyLabels = ["MANUAL", "ADVISORY", "SEMI-AUTO", "FULL-AUTO"];
  return (
    <div className="card">
      <div className="card-header-row">
        <Radio size={15} style={{ color: "var(--accent-cyan)" }} />
        <span className="card-section-label">SYSTEM FLAGS</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className={`flex items-center gap-1.5 rounded-md border bg-[var(--bg-card)] px-2.5 py-2 text-[0.75rem] font-medium ${fan ? "border-[#06d6a04d] text-[var(--accent-green)]" : "border-[var(--border)] text-[var(--text-muted)]"}`}>
          <Wind size={14} />
          <span>FAN</span>
          <span className={`led ${fan ? "led-green" : "led-gray"}`} />
        </div>
        <div className={`flex items-center gap-1.5 rounded-md border bg-[var(--bg-card)] px-2.5 py-2 text-[0.75rem] font-medium ${drs ? "border-[#00d2ff4d] text-[var(--accent-cyan)]" : "border-[var(--border)] text-[var(--text-muted)]"}`}>
          <TrendingUp size={14} />
          <span>DRS</span>
          <span className={`led ${drs ? "led-green" : "led-gray"}`} />
        </div>
        <div className="flex items-center gap-1.5 rounded-md border border-[#00d2ff33] bg-[var(--bg-card)] px-2.5 py-2 text-[0.75rem] font-medium text-[var(--accent-cyan)]">
          <Gauge size={14} />
          <span style={{ fontSize: "0.7rem" }}>{autonomyLabels[autonomy] ?? "UNKNOWN"}</span>
        </div>
        <div className={`flex items-center gap-1.5 rounded-md border bg-[var(--bg-card)] px-2.5 py-2 text-[0.75rem] font-medium ${canErrors > 0 ? "border-[#ffb7034d] text-[var(--accent-amber)]" : "border-[var(--border)] text-[var(--text-muted)]"}`}>
          <AlertTriangle size={14} />
          <span>CAN ERR</span>
          <span className="mono" style={{ fontSize: "0.75rem", marginLeft: "auto" }}>{canErrors}</span>
        </div>
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────
export default function Dashboard() {
  const current = useTelemetryStore((s) => s.current);

  if (!current) {
    return (
      <div className="page-content flex h-full items-center justify-center">
        <div className="flex max-w-[340px] flex-col items-center gap-3 text-center">
          <Gauge size={48} style={{ color: "var(--text-muted)" }} />
          <h2>No Telemetry Signal</h2>
          <p className="text-secondary">Connect to the ESP32 pitwall device or launch demo mode from the Connection page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content flex flex-col gap-3.5">
      {/* Row 1 — Hero metrics */}
      <div className="grid items-stretch gap-3.5 xl:grid-cols-[200px_minmax(0,1fr)_80px_120px] max-xl:grid-cols-2">
        {/* RPM Gauge */}
        <div className="card flex items-center justify-center p-2.5 max-xl:col-span-2">
          <RpmGauge rpm={current.rpm} />
        </div>

        {/* Speed */}
        <div className="card flex flex-col items-center justify-center gap-0.5 max-xl:col-span-1">
          <span className="text-[0.68rem] font-semibold tracking-[0.1em] text-[var(--text-muted)]">SPEED</span>
          <span className="mono text-[3.5rem] leading-none font-extrabold tracking-[-0.02em] text-[var(--text-primary)]">{Math.round(current.speed)}</span>
          <span className="text-[0.75rem] text-[var(--text-muted)]">km/h</span>
        </div>

        {/* Gear */}
        <div className="card flex flex-col items-center justify-center">
          <span className="text-[0.68rem] font-semibold tracking-[0.1em] text-[var(--text-muted)]">GEAR</span>
          <span className={`mono text-[4rem] leading-none font-black text-[var(--accent-cyan)] drop-shadow-[0_0_30px_rgba(0,210,255,0.4)] ${current.gear === -1 ? "text-crit" : ""}`}>
            {current.gear === -1 ? "R" : current.gear === 0 ? "N" : current.gear}
          </span>
        </div>

        {/* Throttle / Brake */}
        <div className="card flex items-center justify-center">
          <ThrottleBrake throttle={current.throttle} brake={current.brake} />
        </div>
      </div>

      {/* Row 2 — Temps */}
      <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-4">
        <TempCard label="ENGINE"  value={current.temp_engine}  warn={90}  crit={100} icon={<Thermometer size={14} />} />
        <TempCard label="WATER"   value={current.temp_water}   warn={92}  crit={105} icon={<Thermometer size={14} />} />
        <TempCard label="OIL"     value={current.temp_oil}     warn={105} crit={120} icon={<Thermometer size={14} />} />
        <TempCard label="AMBIENT" value={current.temp_ambient} warn={38}  crit={45}  icon={<Thermometer size={14} />} />
      </div>

      {/* Row 3 — Systems */}
      <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-4">
        <BatteryCard voltage={current.battery_voltage} current={current.battery_current} fault={current.battery_fault} />
        <FuelCard level={current.fuel_level} />
        <SystemFlags fan={current.fan_active} drs={current.drs_active} autonomy={current.autonomy_level} canErrors={current.can_errors} />
        <div className="card">
          <div className="card-header-row">
            <Gauge size={15} style={{ color: "var(--accent-purple)" }} />
            <span className="card-section-label">G-FORCE</span>
          </div>
          <GForcePlot lat={current.g_lat} lon={current.g_lon} />
        </div>
      </div>
    </div>
  );
}

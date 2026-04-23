import { useTelemetryStore } from "../store";
import { Gauge } from "lucide-react";

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

        {/* Air Temperature */}
        <div className="card flex flex-col items-center justify-center gap-0.5 max-xl:col-span-1">
          <span className="text-[0.68rem] font-semibold tracking-[0.1em] text-[var(--text-muted)]">AIR TEMP</span>
          <span className="mono text-[3.5rem] leading-none font-extrabold tracking-[-0.02em] text-[var(--text-primary)]">{current.air_temp.toFixed(1)}</span>
          <span className="text-[0.75rem] text-[var(--text-muted)]">°C</span>
        </div>

        {/* Air Quality */}
        <div className="card flex flex-col items-center justify-center gap-0.5 max-xl:col-span-1">
          <span className="text-[0.68rem] font-semibold tracking-[0.1em] text-[var(--text-muted)]">AIR QUALITY</span>
          <span className="mono text-[3.5rem] leading-none font-extrabold tracking-[-0.02em] text-[var(--text-primary)]">{Math.round(current.air_quality)}</span>
          <span className="text-[0.75rem] text-[var(--text-muted)]">AQI</span>
        </div>

        {/* Pressure */}
        <div className="card flex flex-col items-center justify-center gap-0.5 max-xl:col-span-1">
          <span className="text-[0.68rem] font-semibold tracking-[0.1em] text-[var(--text-muted)]">PRESSURE</span>
          <span className="mono text-[3rem] leading-none font-extrabold tracking-[-0.02em] text-[var(--text-primary)]">{current.pressure.toFixed(1)}</span>
          <span className="text-[0.75rem] text-[var(--text-muted)]">hPa</span>
        </div>

        {/* Throttle / Brake */}
        <div className="card flex items-center justify-center">
          <ThrottleBrake throttle={current.throttle} brake={current.brake} />
        </div>
      </div>

      {/* Row 2 — G-Force */}
      <div className="card">
        <div className="card-header-row">
          <Gauge size={15} style={{ color: "var(--accent-purple)" }} />
          <span className="card-section-label">G-FORCE</span>
        </div>
        <GForcePlot lat={current.g_lat} lon={current.g_lon} />
      </div>
    </div>
  );
}

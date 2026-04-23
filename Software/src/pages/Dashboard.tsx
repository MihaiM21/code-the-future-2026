import { useTelemetryStore } from "../store";
import { Gauge, Thermometer, Wind, Activity, Zap } from "lucide-react";

// ── RPM Arc Gauge ─────────────────────────────────────────────
function RpmGauge({ rpm, max = 12000 }: { rpm: number; max?: number }) {
  const pct = Math.min(1, rpm / max);
  const startAngle = -215;
  const endAngle = 35;
  const sweepAngle = endAngle - startAngle;
  const redZone = pct > 0.85;

  const polarToXY = (deg: number, r: number) => {
    const rad = (deg * Math.PI) / 180;
    return { x: 100 + r * Math.cos(rad), y: 100 + r * Math.sin(rad) };
  };

  const describeArc = (start: number, end: number, r: number) => {
    if (end <= start) return "";
    const s = polarToXY(start, r);
    const e = polarToXY(end, r);
    const large = end - start > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
  };

  const ticks = Array.from({ length: 13 }, (_, i) => {
    const tickPct = i / 12;
    const tickAngle = startAngle + tickPct * sweepAngle;
    const isRed = tickPct > 0.85;
    const isMajor = i % 2 === 0;
    const outer = polarToXY(tickAngle, 84);
    const inner = polarToXY(tickAngle, isMajor ? 76 : 79);
    return (
      <line
        key={i}
        x1={outer.x} y1={outer.y} x2={inner.x} y2={inner.y}
        stroke={isRed ? "rgba(230,57,70,0.7)" : "#2a2a2e"}
        strokeWidth={isMajor ? 2 : 1}
        strokeLinecap="round"
      />
    );
  });

  const labels = [0, 2, 4, 6, 8, 10, 12].map((k, i) => {
    const labelPct = (k / 12);
    const labelAngle = startAngle + labelPct * sweepAngle;
    const pos = polarToXY(labelAngle, 65);
    return (
      <text
        key={i} x={pos.x} y={pos.y}
        textAnchor="middle" dominantBaseline="middle"
        fill={labelPct > 0.85 ? "rgba(230,57,70,0.6)" : "#3a3a3e"}
        fontSize="7" fontFamily="Rajdhani" fontWeight="600"
      >
        {k}
      </text>
    );
  });

  const needlePt = polarToXY(startAngle + pct * sweepAngle, 60);
  const redZoneStart = startAngle + 0.85 * sweepAngle;

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 200" className="h-52 w-52">
        {/* Track background */}
        <path d={describeArc(-215, 35, 80)} fill="none" stroke="#141416" strokeWidth="14" strokeLinecap="round" />
        {/* Red zone highlight */}
        <path d={describeArc(redZoneStart, 35, 80)} fill="none" stroke="rgba(230,57,70,0.12)" strokeWidth="14" strokeLinecap="round" />
        {/* Active fill */}
        <path
          d={describeArc(-215, -215 + pct * sweepAngle, 80)}
          fill="none"
          stroke={redZone ? "var(--accent-red)" : "var(--accent-cyan)"}
          strokeWidth="14"
          strokeLinecap="round"
          style={{ filter: redZone ? "drop-shadow(0 0 10px var(--accent-red))" : "drop-shadow(0 0 10px var(--accent-cyan))" }}
        />
        {ticks}
        {labels}
        {/* Needle */}
        <line
          x1="100" y1="100" x2={needlePt.x} y2={needlePt.y}
          stroke={redZone ? "var(--accent-red)" : "var(--text-primary)"}
          strokeWidth="2.5" strokeLinecap="round"
          style={{ filter: redZone ? "drop-shadow(0 0 4px var(--accent-red))" : "drop-shadow(0 0 3px rgba(240,240,248,0.6))" }}
        />
        <circle cx="100" cy="100" r="7" fill="var(--bg-card)" stroke={redZone ? "var(--accent-red)" : "var(--text-secondary)"} strokeWidth="2" />
        {/* Value readout */}
        {redZone && (
          <text x="100" y="130" textAnchor="middle" fill="var(--accent-red)" fontSize="8" fontFamily="Rajdhani" fontWeight="800" letterSpacing="3">
            REDLINE
          </text>
        )}
        <text x="100" y="152" textAnchor="middle" fill="var(--text-primary)" fontSize="28" fontWeight="800" fontFamily="Rajdhani" letterSpacing="-1">
          {(Math.round(rpm / 100) * 100).toLocaleString()}
        </text>
        <text x="100" y="167" textAnchor="middle" fill="var(--text-muted)" fontSize="9" fontFamily="Rajdhani" letterSpacing="3">
          RPM
        </text>
      </svg>
    </div>
  );
}

// ── Pedal Inputs ──────────────────────────────────────────────
function PedalInputs({ throttle, brake }: { throttle: number; brake: number }) {
  const conflict = throttle > 10 && brake > 10;
  return (
    <div className="flex flex-col gap-4">
      <div className="card-header-row">
        <Zap size={13} style={{ color: "var(--accent-green)" }} />
        <span className="card-section-label">PEDAL INPUTS</span>
      </div>

      {[
        { label: "THROTTLE", value: throttle, color: "var(--accent-green)", shadow: "rgba(6,214,160,0.45)" },
        { label: "BRAKE", value: brake, color: "var(--accent-red)", shadow: "rgba(230,57,70,0.45)" },
      ].map(({ label, value, color, shadow }) => (
        <div key={label} className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[0.65rem] font-bold tracking-[0.12em] text-[var(--text-muted)]">{label}</span>
            <span className="mono text-[0.82rem] font-bold" style={{ color }}>{value}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[#141416]">
            <div
              className="h-full rounded-full transition-all duration-150"
              style={{
                width: `${value}%`,
                background: color,
                boxShadow: value > 0 ? `0 0 8px ${shadow}` : "none",
              }}
            />
          </div>
        </div>
      ))}

      {conflict && (
        <div className="flex items-center gap-2 rounded-xl border border-[rgba(255,183,3,0.2)] bg-[var(--accent-amber-dim)] px-3 py-2">
          <span className="led led-amber led-blink" />
          <span className="text-[0.67rem] font-bold tracking-[0.08em] text-[var(--accent-amber)]">SIMULTANEOUS INPUT</span>
        </div>
      )}
    </div>
  );
}

// ── G-Force Panel ─────────────────────────────────────────────
function GForcePanel({ lat, lon, vert }: { lat: number; lon: number; vert: number }) {
  const maxG = 3;
  const cx = 60, cy = 60, r = 50;
  const clampedLat = Math.max(-maxG, Math.min(maxG, lat));
  const clampedLon = Math.max(-maxG, Math.min(maxG, lon));
  const dotX = cx + (clampedLat / maxG) * r;
  const dotY = cy - (clampedLon / maxG) * r;

  const axes = [
    { label: "LATERAL",       value: lat,  color: "var(--accent-cyan)" },
    { label: "LONGITUDINAL",  value: lon,  color: "var(--accent-purple)" },
    { label: "VERTICAL",      value: vert, color: "var(--accent-amber)" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-5">
      {/* Circle plot */}
      <svg viewBox="0 0 120 120" className="h-[120px] w-[120px] shrink-0">
        <circle cx={cx} cy={cy} r={r}        fill="none" stroke="#242428" strokeWidth="1" />
        <circle cx={cx} cy={cy} r={r * 0.67} fill="none" stroke="#242428" strokeWidth="0.5" strokeDasharray="3 3" />
        <circle cx={cx} cy={cy} r={r * 0.33} fill="none" stroke="#242428" strokeWidth="0.5" strokeDasharray="3 3" />
        <line x1={cx - r} y1={cy} x2={cx + r} y2={cy} stroke="#242428" strokeWidth="0.5" />
        <line x1={cx} y1={cy - r} x2={cx} y2={cy + r} stroke="#242428" strokeWidth="0.5" />
        {/* Outer glow ring */}
        <circle cx={dotX} cy={dotY} r={10} fill="var(--accent-cyan)" fillOpacity="0.08" />
        <circle cx={dotX} cy={dotY} r={4.5} fill="var(--accent-cyan)"
          style={{ filter: "drop-shadow(0 0 6px var(--accent-cyan))" }}
        />
        <text x={cx} y={cy + r + 10} textAnchor="middle" fill="#3a3a3e" fontSize="7" fontFamily="Rajdhani">LAT</text>
        <text x={4} y={cy + 3} textAnchor="start" fill="#3a3a3e" fontSize="7" fontFamily="Rajdhani">LON</text>
        <text x={cx + r - 1} y={cy - r + 8} textAnchor="end" fill="#3a3a3e" fontSize="6" fontFamily="Rajdhani">3G</text>
      </svg>

      {/* Axis bars */}
      <div className="flex min-w-[120px] flex-1 flex-col gap-3">
        {axes.map(({ label, value, color }) => {
          const pct = Math.min(100, (Math.abs(value) / maxG) * 100);
          const isPos = value >= 0;
          return (
            <div key={label} className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-[0.62rem] font-bold tracking-[0.1em] text-[var(--text-muted)]">{label}</span>
                <span className="mono text-[0.75rem] font-bold" style={{ color }}>{value.toFixed(2)}G</span>
              </div>
              <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-[#141416]">
                <div className="absolute inset-y-0 left-1/2 w-px bg-[#2a2a2e]" />
                <div
                  className="absolute top-0 h-full rounded-full transition-all duration-150"
                  style={{
                    width: `${pct / 2}%`,
                    background: color,
                    left: isPos ? "50%" : `calc(50% - ${pct / 2}%)`,
                    boxShadow: `0 0 5px ${color}80`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────
function StatCard({
  label,
  value,
  unit,
  color = "var(--text-primary)",
  accentColor,
  icon,
}: {
  label: string;
  value: string | number;
  unit: string;
  color?: string;
  accentColor?: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="card flex flex-col justify-between gap-3">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="card-section-label">{label}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span
          className="mono text-[2.6rem] leading-none font-extrabold tracking-tight"
          style={{
            color,
            textShadow: accentColor ? `0 0 20px ${accentColor}` : undefined,
          }}
        >
          {value}
        </span>
        <span className="mb-0.5 text-[0.72rem] text-[var(--text-muted)]">{unit}</span>
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
        <div className="flex max-w-sm flex-col items-center gap-4 text-center">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
            <Gauge size={44} style={{ color: "var(--text-muted)" }} />
          </div>
          <div>
            <h2 className="mb-1.5 text-[1.1rem] font-bold">No Telemetry Signal</h2>
            <p className="text-[0.85rem] leading-relaxed text-[var(--text-secondary)]">
              Connect to the ESP32 pitwall device or launch demo mode from the Connection page.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const aqiColor =
    current.air_quality < 50
      ? "var(--accent-green)"
      : current.air_quality < 100
      ? "var(--accent-amber)"
      : "var(--accent-red)";

  const tempColor =
    current.air_temp > 40
      ? "var(--accent-red)"
      : current.air_temp > 28
      ? "var(--accent-amber)"
      : "var(--text-primary)";

  return (
    <div className="page-content flex flex-col gap-3">
      {/* Row 1 — RPM hero + sensor cards */}
      <div className="grid gap-3 xl:grid-cols-[auto_1fr_1fr_1fr] lg:grid-cols-2">
        {/* RPM Gauge — spans full width on small screens */}
        <div className="card flex items-center justify-center p-3 lg:col-span-2 xl:col-span-1">
          <RpmGauge rpm={current.rpm} />
        </div>

        <StatCard
          label="AIR TEMP"
          value={current.air_temp.toFixed(1)}
          unit="°C"
          color={tempColor}
          accentColor={tempColor !== "var(--text-primary)" ? tempColor : undefined}
          icon={<Thermometer size={13} style={{ color: "var(--accent-amber)" }} />}
        />

        <StatCard
          label="AIR QUALITY"
          value={Math.round(current.air_quality)}
          unit="AQI"
          color={aqiColor}
          accentColor={aqiColor}
          icon={<Wind size={13} style={{ color: aqiColor }} />}
        />

        <StatCard
          label="PRESSURE"
          value={current.pressure.toFixed(1)}
          unit="hPa"
          icon={<Gauge size={13} style={{ color: "var(--accent-cyan)" }} />}
        />
      </div>

      {/* Row 2 — G-Force + Pedals */}
      <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
        <div className="card">
          <div className="card-header-row">
            <Activity size={14} style={{ color: "var(--accent-purple)" }} />
            <span className="card-section-label">G-FORCE</span>
          </div>
          <GForcePanel lat={current.g_lat} lon={current.g_lon} vert={current.g_vert} />
        </div>

        <div className="card">
          <PedalInputs throttle={current.throttle} brake={current.brake} />
        </div>
      </div>
    </div>
  );
}

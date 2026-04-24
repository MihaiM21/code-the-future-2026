import { useState, useEffect } from "react";
import { useTelemetryStore } from "../store";
import { Gauge, Zap, Activity } from "lucide-react";

// ── Shift Light Bar ───────────────────────────────────────────
function ShiftLightBar({ rpm, max = 12000, blinkOn }: { rpm: number; max?: number; blinkOn: boolean }) {
  const atRedline = rpm >= max * 0.94;

  const segColor = (i: number) => {
    if (i <= 4) return "var(--accent-green)";
    if (i <= 9) return "var(--accent-amber)";
    return "var(--accent-red)";
  };

  return (
    <div className="flex items-center gap-3 w-full">
      <span className="card-section-label shrink-0">SHIFT</span>
      <div className="flex items-center gap-1 flex-1">
        {Array.from({ length: 15 }, (_, i) => {
          const lit = rpm >= ((i + 1) / 15) * max;
          const color = segColor(i);
          const dimmed = atRedline && !blinkOn;
          return (
            <div
              key={i}
              className="flex-1 h-3 rounded-sm transition-opacity duration-75"
              style={{
                background: lit ? color : "#1a1a1e",
                boxShadow: lit && !dimmed ? `0 0 8px ${color}` : "none",
                opacity: lit && dimmed ? 0.15 : 1,
                border: "1px solid #2a2a2e",
              }}
            />
          );
        })}
      </div>
      <span className="card-section-label shrink-0 mono text-[0.6rem]">
        {Math.round((rpm / max) * 100)}%
      </span>
    </div>
  );
}

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
        stroke={isRed ? "rgba(230,57,70,0.9)" : "#55555e"}
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
        fill={labelPct > 0.85 ? "rgba(230,57,70,0.9)" : "#7a7a84"}
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
        {/* Outer decorative ring */}
        <circle cx="100" cy="100" r="96" fill="none" stroke="#1e1e22" strokeWidth="1" />
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
        {redZone && (
          <text x="100" y="130" textAnchor="middle" fill="var(--accent-red)" fontSize="9" fontFamily="Rajdhani" fontWeight="800" letterSpacing="4">
            REDLINE
          </text>
        )}
      </svg>
      {/* Digital readout below gauge */}
      <div className="flex flex-col items-center -mt-4">
        <span
          className="mono font-extrabold leading-none tracking-tight"
          style={{
            fontSize: "2.4rem",
            color: redZone ? "var(--accent-red)" : "var(--text-primary)",
            textShadow: redZone ? "0 0 24px var(--accent-red)" : "0 0 12px rgba(0,210,255,0.35)",
          }}
        >
          {(Math.round(rpm / 100) * 100).toLocaleString()}
        </span>
        <span className="card-section-label mt-0.5">RPM</span>
      </div>
    </div>
  );
}

// ── Pedal Inputs (vertical bars) ──────────────────────────────
function PedalInputs({ throttle, brake }: { throttle: number; brake: number }) {
  const conflict = throttle > 10 && brake > 10;
  const bars = [
    { label: "T", fullLabel: "THROTTLE", value: throttle, color: "var(--accent-green)", shadow: "rgba(6,214,160,0.5)" },
    { label: "B", fullLabel: "BRAKE",    value: brake,    color: "var(--accent-red)",   shadow: "rgba(230,57,70,0.5)" },
  ];

  return (
    <div className="flex flex-col h-full gap-3">
      <div className="card-header-row">
        <Zap size={13} style={{ color: "var(--accent-green)" }} />
        <span className="card-section-label">PEDAL INPUTS</span>
      </div>

      <div className="flex flex-1 items-end justify-center gap-5 min-h-0">
        {bars.map(({ label, value, color, shadow }) => (
          <div key={label} className="flex flex-col items-center gap-2 h-full">
            <span className="mono text-[0.85rem] font-bold tabular-nums" style={{ color }}>
              {value}%
            </span>
            <div
              className="relative flex-1 w-8 rounded-sm overflow-hidden bg-[#141416]"
              style={{ border: "1px solid #2a2a2e" }}
            >
              <div
                className="absolute bottom-0 left-0 right-0 rounded-sm transition-all duration-150"
                style={{
                  height: `${value}%`,
                  background: color,
                  boxShadow: value > 0 ? `0 0 12px ${shadow}` : "none",
                }}
              />
            </div>
            <span className="card-section-label">{label}</span>
          </div>
        ))}
      </div>

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
  const dynamicGlow = Math.abs(clampedLat) + Math.abs(clampedLon) > 1 ? 0.18 : 0.08;

  const axes = [
    { label: "LAT",  value: lat,  color: "var(--accent-cyan)" },
    { label: "LON",  value: lon,  color: "var(--accent-purple)" },
    { label: "VERT", value: vert, color: "var(--accent-amber)" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg viewBox="0 0 120 120" className="h-[120px] w-[120px] shrink-0">
        {/* Corner bracket marks */}
        <path d="M 10 18 L 10 10 L 18 10" fill="none" stroke="#6a6a76" strokeWidth="1.5" strokeLinecap="square" />
        <path d="M 102 10 L 110 10 L 110 18" fill="none" stroke="#6a6a76" strokeWidth="1.5" strokeLinecap="square" />
        <path d="M 10 102 L 10 110 L 18 110" fill="none" stroke="#6a6a76" strokeWidth="1.5" strokeLinecap="square" />
        <path d="M 102 110 L 110 110 L 110 102" fill="none" stroke="#6a6a76" strokeWidth="1.5" strokeLinecap="square" />
        {/* Rings */}
        <circle cx={cx} cy={cy} r={r}        fill="none" stroke="#242428" strokeWidth="1" />
        <circle cx={cx} cy={cy} r={r * 0.67} fill="none" stroke="#242428" strokeWidth="0.5" strokeDasharray="3 3" />
        <circle cx={cx} cy={cy} r={r * 0.33} fill="none" stroke="#242428" strokeWidth="0.5" strokeDasharray="3 3" />
        {/* Split crosshairs */}
        <line x1={cx - r} y1={cy} x2={cx - 8} y2={cy} stroke="#2a2a2e" strokeWidth="0.8" />
        <line x1={cx + 8} y1={cy} x2={cx + r} y2={cy} stroke="#2a2a2e" strokeWidth="0.8" />
        <line x1={cx} y1={cy - r} x2={cx} y2={cy - 8} stroke="#2a2a2e" strokeWidth="0.8" />
        <line x1={cx} y1={cy + 8} x2={cx} y2={cy + r} stroke="#2a2a2e" strokeWidth="0.8" />
        {/* Glow ring + dot */}
        <circle cx={dotX} cy={dotY} r={8} fill="var(--accent-cyan)" fillOpacity={dynamicGlow} />
        <circle cx={dotX} cy={dotY} r={4.5} fill="var(--accent-cyan)"
          style={{ filter: "drop-shadow(0 0 6px var(--accent-cyan))" }}
        />
        <text x={cx} y={cy + r + 10} textAnchor="middle" fill="#8a8a96" fontSize="8" fontFamily="Rajdhani" fontWeight="700">LAT</text>
        <text x={4} y={cy + 3} textAnchor="start" fill="#8a8a96" fontSize="8" fontFamily="Rajdhani" fontWeight="700">LON</text>
        <text x={cx + r - 1} y={cy - r + 8} textAnchor="end" fill="#8a8a96" fontSize="7" fontFamily="Rajdhani" fontWeight="700">3G</text>
      </svg>

      <div className="flex min-w-[120px] flex-1 flex-col gap-3">
        {axes.map(({ label, value, color }) => {
          const pct = Math.min(100, (Math.abs(value) / maxG) * 100);
          const isPos = value >= 0;
          return (
            <div key={label} className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-[0.68rem] font-bold tracking-[0.1em] text-[var(--text-muted)]">{label}</span>
                <span className="mono text-[0.8rem] font-bold" style={{ color }}>{value.toFixed(2)}G</span>
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

// ── Status Strip ──────────────────────────────────────────────
function StatusStrip({ drs, fan, battV }: { drs?: boolean; fan?: boolean; battV?: number }) {
  const battLow = battV !== undefined && battV < 11.5;

  const tiles = [
    {
      id: "DRS",
      label: "DRS",
      active: drs === true,
      available: drs !== undefined,
      activeColor: "var(--accent-green)",
      activeDim: "var(--accent-green-dim)",
      blink: false,
    },
    {
      id: "FAN",
      label: "FAN",
      active: fan === true,
      available: fan !== undefined,
      activeColor: "var(--accent-cyan)",
      activeDim: "var(--accent-cyan-dim)",
      blink: false,
    },
    {
      id: "BATT",
      label: battV !== undefined ? `${battV.toFixed(1)}V` : "BATT",
      active: battLow,
      available: battV !== undefined,
      activeColor: "var(--accent-red)",
      activeDim: "var(--accent-red-dim)",
      blink: battLow,
    },
  ];

  return (
    <div className="flex items-center gap-0">
      <span className="card-section-label mr-5 shrink-0">SYSTEMS</span>
      <div className="flex items-center gap-2">
        {tiles.map(({ id, label, active, available, activeColor, activeDim, blink }) => (
          <div
            key={id}
            className="flex flex-col items-center justify-center rounded-[6px] px-4 py-2 gap-1"
            style={{
              border: `1px solid ${active ? activeColor : available ? "#1a1a1d" : "#aeacac"}`,
              background: active ? activeDim : "transparent",
              opacity: available ? 1 : 0.35,
              minWidth: "64px",
            }}
          >
            <span
              className={`led${blink ? " led-blink" : ""}`}
              style={{
                background: active ? activeColor : "#2a2a2e",
                boxShadow: active ? `0 0 8px ${activeColor}` : "none",
              }}
            />
            <span
              className="mono text-[0.72rem] font-bold tracking-[0.06em] mt-0.5"
              style={{ color: active ? activeColor : available ? "var(--text-muted)" : "#8c8c8e" }}
            >
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Data Tile ─────────────────────────────────────────────────
function DataTile({
  label,
  value,
  unit,
  color = "var(--text-primary)",
  accentColor,
  status,
}: {
  label: string;
  value: string | number | undefined;
  unit: string;
  color?: string;
  accentColor?: string;
  status?: "ok" | "warn" | "crit";
}) {
  const statusColors = {
    ok:   "var(--accent-green)",
    warn: "var(--accent-amber)",
    crit: "var(--accent-red)",
  };
  const borderColor = status ? statusColors[status] : "var(--border)";
  const ledClass = status === "crit" ? "led led-red" : status === "warn" ? "led led-amber" : "led led-green";

  return (
    <div
      className="card flex flex-col gap-2 px-4 py-3"
      style={{ borderLeftColor: borderColor, borderLeftWidth: "3px" }}
    >
      <div className="flex items-center justify-between">
        <span className="card-section-label">{label}</span>
        {status && <span className={ledClass} />}
      </div>
      <div className="flex items-baseline gap-1">
        <span
          className="mono font-extrabold leading-none"
          style={{
            fontSize: "1.9rem",
            color,
            textShadow: accentColor ? `0 0 16px ${accentColor}` : undefined,
          }}
        >
          {value ?? "--"}
        </span>
        <span className="text-[0.75rem] text-[var(--text-muted)] mb-0.5">{unit}</span>
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────
export default function Dashboard() {
  const current = useTelemetryStore((s) => s.current);

  const [blinkOn, setBlinkOn] = useState(true);
  const atRedline = (current?.rpm ?? 0) >= 12000 * 0.94;

  useEffect(() => {
    if (!atRedline) {
      setBlinkOn(true);
      return;
    }
    const id = setInterval(() => setBlinkOn((v) => !v), 80);
    return () => clearInterval(id);
  }, [atRedline]);

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
      {/* Row 1 — Shift light bar */}
      <div className="card px-4 py-3 flex items-center gap-3">
        <ShiftLightBar rpm={current.rpm} blinkOn={blinkOn} />
      </div>

      {/* Row 2 — G-Force | RPM | Pedals */}
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: "minmax(200px,1fr) minmax(240px,auto) minmax(160px,auto)", minHeight: "260px" }}
      >
        <div className="card flex flex-col">
          <div className="card-header-row">
            <Activity size={14} style={{ color: "var(--accent-purple)" }} />
            <span className="card-section-label">G-FORCE</span>
          </div>
          <div className="flex flex-1 items-center">
            <GForcePanel lat={current.g_lat} lon={current.g_lon} vert={current.g_vert} />
          </div>
        </div>

        <div className="card flex flex-col items-center justify-center p-3">
          <RpmGauge rpm={current.rpm} />
        </div>

        <div className="card flex flex-col">
          <PedalInputs throttle={current.throttle} brake={current.brake} />
        </div>
      </div>

      {/* Row 3 — Status strip */}
      <div className="card px-5 py-3">
        <StatusStrip drs={current.drs_active} fan={current.fan_active} battV={current.battery_v} />
      </div>

      {/* Row 4 — Sensor data tiles */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <DataTile
          label="AIR TEMP"
          value={current.air_temp.toFixed(1)}
          unit="°C"
          color={tempColor}
          accentColor={tempColor !== "var(--text-primary)" ? tempColor : undefined}
          status={current.air_temp > 40 ? "crit" : current.air_temp > 28 ? "warn" : "ok"}
        />
        <DataTile
          label="ENGINE TEMP"
          value={current.engine_temp?.toFixed(0)}
          unit="°C"
          color={
            current.engine_temp !== undefined && current.engine_temp > 110
              ? "var(--accent-red)"
              : "var(--text-primary)"
          }
          status={
            current.engine_temp === undefined
              ? undefined
              : current.engine_temp > 110
              ? "crit"
              : current.engine_temp > 95
              ? "warn"
              : "ok"
          }
        />
        <DataTile
          label="AIR QUALITY"
          value={Math.round(current.air_quality)}
          unit="AQI"
          color={aqiColor}
          accentColor={aqiColor}
          status={current.air_quality < 50 ? "ok" : current.air_quality < 100 ? "warn" : "crit"}
        />
        <DataTile
          label="PRESSURE"
          value={current.pressure.toFixed(1)}
          unit="hPa"
          status="ok"
        />
      </div>
    </div>
  );
}

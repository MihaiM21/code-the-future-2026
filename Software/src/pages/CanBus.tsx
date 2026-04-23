import { useState, useEffect, useRef } from "react";
import { useTelemetryStore } from "../store";
import { Network, RefreshCw, Filter } from "lucide-react";

interface CanFrame {
  id: string;
  dlc: number;
  data: number[];
  signal: string;
  value: string;
  count: number;
  ts: number;
}

// Simulated CAN signal decode map
const CAN_DECODE: Record<string, { signal: string; decode: (d: number[]) => string }> = {
  "0x200": { signal: "ENGINE_RPM",   decode: (d) => `${((d[0] << 8) | d[1])} rpm` },
  "0x300": { signal: "AIR_TEMP",     decode: (d) => `${(((d[0] << 8) | d[1]) / 10).toFixed(1)}°C` },
  "0x310": { signal: "AIR_QUALITY",  decode: (d) => `${d[0]}` },
  "0x320": { signal: "PRESSURE",     decode: (d) => `${(((d[0] << 8) | d[1]) / 10).toFixed(1)} hPa` },
  "0x400": { signal: "THROTTLE",     decode: (d) => (d[0] === 1 ? "ON" : "OFF") },
  "0x401": { signal: "BRAKE",        decode: (d) => (d[0] === 1 ? "ON" : "OFF") },
  "0x500": { signal: "G_LAT",        decode: (d) => `${(((d[0] << 8) | d[1]) / 100).toFixed(2)}G` },
  "0x501": { signal: "G_LON",        decode: (d) => `${(((d[0] << 8) | d[1]) / 100).toFixed(2)}G` },
  "0x502": { signal: "G_VERT",       decode: (d) => `${(((d[0] << 8) | d[1]) / 100).toFixed(2)}G` },
};

const CAN_IDS = Object.keys(CAN_DECODE);

function generateCanFrame(id: string, current: ReturnType<typeof useTelemetryStore.getState>["current"]): number[] {
  if (!current) return Array(8).fill(0).map(() => Math.floor(Math.random() * 256));
  const data: number[] = Array(8).fill(0);
  switch (id) {
    case "0x200": data[0] = (current.rpm >> 8) & 0xff; data[1] = current.rpm & 0xff; break;
    case "0x300": { const t = Math.round(current.air_temp * 10); data[0] = (t >> 8) & 0xff; data[1] = t & 0xff; break; }
    case "0x310": data[0] = Math.round(current.air_quality); break;
    case "0x320": { const p = Math.round(current.pressure * 10); data[0] = (p >> 8) & 0xff; data[1] = p & 0xff; break; }
    case "0x400": data[0] = current.throttle; break;
    case "0x401": data[0] = current.brake; break;
    case "0x500": { const g = Math.round(current.g_lat * 100); data[0] = (g >> 8) & 0xff; data[1] = g & 0xff; break; }
    case "0x501": { const g = Math.round(current.g_lon * 100); data[0] = (g >> 8) & 0xff; data[1] = g & 0xff; break; }
    case "0x502": { const g = Math.round(current.g_vert * 100); data[0] = (g >> 8) & 0xff; data[1] = g & 0xff; break; }
  }
  return data;
}

export default function CanBus() {
  const current = useTelemetryStore((s) => s.current);
  const [frames, setFrames] = useState<Record<string, CanFrame>>({});
  const [filter, setFilter] = useState("");
  const [frameRate, setFrameRate] = useState(0);
  const frameCountRef = useRef(0);

  useEffect(() => {
    if (!current) return;
    setFrames((prev) => {
      const next = { ...prev };
      CAN_IDS.forEach((id) => {
        const data = generateCanFrame(id, current);
        const decode = CAN_DECODE[id];
        next[id] = {
          id,
          dlc: 8,
          data,
          signal: decode.signal,
          value: decode.decode(data),
          count: (prev[id]?.count ?? 0) + 1,
          ts: Date.now(),
        };
        frameCountRef.current++;
      });
      return next;
    });
  }, [current]);

  useEffect(() => {
    const interval = setInterval(() => {
      setFrameRate(frameCountRef.current);
      frameCountRef.current = 0;
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const visibleFrames = Object.values(frames).filter(
    (f) =>
      filter === "" ||
      f.id.toLowerCase().includes(filter.toLowerCase()) ||
      f.signal.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="page-content flex h-full flex-col gap-3.5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-5">
          <div className="flex flex-col gap-0.5">
            <span className="text-[0.65rem] font-bold tracking-[0.08em] text-[var(--text-muted)]">FRAME RATE</span>
            <span className="mono text-base font-bold text-[var(--text-primary)]">{frameRate} <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>f/s</span></span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[0.65rem] font-bold tracking-[0.08em] text-[var(--text-muted)]">SIGNALS</span>
            <span className="mono text-base font-bold text-[var(--text-primary)]">{visibleFrames.length}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[0.65rem] font-bold tracking-[0.08em] text-[var(--text-muted)]">BUS STATUS</span>
            <span className="text-base font-bold" style={{ color: "var(--accent-green)" }}>ACTIVE</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[0.65rem] font-bold tracking-[0.08em] text-[var(--text-muted)]">BUS ERRORS</span>
            <span className="mono text-base font-bold text-[var(--text-primary)]">{current?.can_errors ?? 0}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-[10px] border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1.5 text-[var(--text-muted)]">
          <Filter size={14} />
          <input
            type="text"
            placeholder="Filter by ID or signal..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-[220px] border-none bg-transparent text-[0.85rem] text-[var(--text-primary)] outline-none"
          />
          {filter && (
            <button className="btn btn-ghost" style={{ padding: "2px 8px" }} onClick={() => setFilter("")}>
              <RefreshCw size={12} />
            </button>
          )}
        </div>
      </div>

      <div className="card min-h-0 flex-1 overflow-auto p-0">
        <table className="w-full border-collapse text-[0.82rem]">
          <thead>
            <tr className="sticky top-0 z-[1] bg-[var(--bg-panel)]">
              <th className="whitespace-nowrap border-b border-[var(--border)] px-4 py-2.5 text-left text-[0.65rem] font-bold tracking-[0.08em] text-[var(--text-muted)]"><Network size={12} style={{ verticalAlign: "middle" }} /> ID</th>
              <th className="whitespace-nowrap border-b border-[var(--border)] px-4 py-2.5 text-left text-[0.65rem] font-bold tracking-[0.08em] text-[var(--text-muted)]">SIGNAL</th>
              <th className="whitespace-nowrap border-b border-[var(--border)] px-4 py-2.5 text-left text-[0.65rem] font-bold tracking-[0.08em] text-[var(--text-muted)]">DLC</th>
              <th className="whitespace-nowrap border-b border-[var(--border)] px-4 py-2.5 text-left text-[0.65rem] font-bold tracking-[0.08em] text-[var(--text-muted)]">DATA BYTES</th>
              <th className="whitespace-nowrap border-b border-[var(--border)] px-4 py-2.5 text-left text-[0.65rem] font-bold tracking-[0.08em] text-[var(--text-muted)]">VALUE</th>
              <th className="whitespace-nowrap border-b border-[var(--border)] px-4 py-2.5 text-left text-[0.65rem] font-bold tracking-[0.08em] text-[var(--text-muted)]">COUNT</th>
            </tr>
          </thead>
          <tbody>
            {visibleFrames.map((f) => (
              <tr key={f.id} className="hover:bg-white/[0.02]">
                <td className="mono whitespace-nowrap border-b border-white/[0.04] px-4 py-[9px] font-semibold text-[var(--accent-cyan)]">{f.id}</td>
                <td className="whitespace-nowrap border-b border-white/[0.04] px-4 py-[9px] font-medium text-[var(--text-primary)]">{f.signal}</td>
                <td className="mono whitespace-nowrap border-b border-white/[0.04] px-4 py-[9px]">{f.dlc}</td>
                <td className="mono whitespace-nowrap border-b border-white/[0.04] px-4 py-[9px] text-[0.78rem] tracking-[0.05em] text-[var(--text-secondary)]">
                  {f.data.slice(0, f.dlc).map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ")}
                </td>
                <td className="mono whitespace-nowrap border-b border-white/[0.04] px-4 py-[9px] font-semibold text-[var(--accent-amber)]">{f.value}</td>
                <td className="mono whitespace-nowrap border-b border-white/[0.04] px-4 py-[9px] text-[var(--text-muted)]">{f.count.toLocaleString()}</td>
              </tr>
            ))}
            {visibleFrames.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
                  No frames match filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

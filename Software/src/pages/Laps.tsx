import { useLapStore } from "../store";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend
} from "recharts";
import { Flag, Download, TrendingUp } from "lucide-react";

function formatMs(ms: number): string {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const ms2 = Math.floor(ms % 1000);
  return `${m}:${String(s).padStart(2, "0")}.${String(ms2).padStart(3, "0")}`;
}

function exportCsv(frames: { ts: number; rpm: number; speed: number; throttle: number; brake: number }[], lapNum: number) {
  const header = "ts,rpm,speed,throttle,brake\n";
  const rows = frames.map((f) => `${f.ts},${f.rpm},${f.speed},${f.throttle},${f.brake}`).join("\n");
  const blob = new Blob([header + rows], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `lap_${lapNum}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Laps() {
  const { laps, selectedLap, selectLap } = useLapStore();
  const lap = laps.find((l) => l.lapNumber === selectedLap);

  const lapBarData = laps.map((l) => ({
    name: `Lap ${l.lapNumber}`,
    time: +(l.lapTime / 1000).toFixed(3),
  }));

  const chartData = lap
    ? lap.frames.filter((_, i) => i % 5 === 0).map((f) => ({
        t: ((f.lap_time / 1000)).toFixed(1),
        speed: f.speed,
        throttle: f.throttle,
        brake: f.brake,
        rpm: Math.round(f.rpm / 100) * 100,
      }))
    : [];

  return (
    <div className="page-content h-full">
      {laps.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
          <Flag size={48} style={{ color: "var(--text-muted)" }} />
          <h2 style={{ color: "var(--text-secondary)" }}>No Laps Recorded</h2>
          <p className="text-secondary" style={{ fontSize: "0.9rem" }}>
            Lap data is captured automatically. Start demo mode or connect to the car.
          </p>
        </div>
      ) : (
        <div className="grid h-full gap-3.5 xl:grid-cols-[220px_minmax(0,1fr)]">
          {/* Left: lap list */}
          <div className="card flex min-h-0 flex-col overflow-hidden">
            <div className="card-header-row">
              <Flag size={15} style={{ color: "var(--accent-cyan)" }} />
              <h3>Lap Times</h3>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
              {laps.map((l) => {
                const fastest = Math.min(...laps.map((x) => x.lapTime));
                const isFastest = l.lapTime === fastest;
                return (
                  <button
                    key={l.lapNumber}
                    className={`flex items-center gap-2.5 rounded-[10px] border px-3 py-2.5 text-left text-[0.82rem] font-medium transition-all duration-150 ${selectedLap === l.lapNumber ? "border-[#00d2ff4d] bg-[var(--accent-cyan-dim)] text-[var(--accent-cyan)]" : "border-transparent bg-transparent text-[var(--text-secondary)] hover:border-[var(--border)] hover:bg-[var(--bg-card-hover)]"}`}
                    onClick={() => selectLap(l.lapNumber)}
                  >
                    <span className="text-[0.72rem] tracking-[0.05em] text-[var(--text-muted)]">LAP {l.lapNumber}</span>
                    <span className={`mono flex-1 text-right text-[0.95rem] ${isFastest ? "text-ok" : ""}`}>{formatMs(l.lapTime)}</span>
                    {isFastest && <span className="badge badge-green">BEST</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: charts */}
          <div className="flex min-h-0 flex-col gap-3.5 overflow-y-auto">
            {/* Lap comparison bar chart */}
            <div className="card">
              <div className="card-header-row">
                <TrendingUp size={15} style={{ color: "var(--accent-amber)" }} />
                <h3>Lap Time Comparison</h3>
              </div>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={lapBarData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e1e30" />
                  <XAxis dataKey="name" tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
                  <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} unit="s" />
                  <Tooltip
                    contentStyle={{ background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 8 }}
                    labelStyle={{ color: "var(--text-primary)" }}
                    formatter={(v: number) => [`${v}s`, "Lap Time"]}
                  />
                  <Bar dataKey="time" fill="var(--accent-cyan)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Selected lap telemetry traces */}
            {lap && (
              <>
                <div className="card">
                  <div className="card-header-row">
                    <h3>Lap {lap.lapNumber} — Speed Trace</h3>
                    <button
                      className="btn btn-ghost"
                      style={{ marginLeft: "auto", fontSize: "0.75rem", padding: "4px 10px" }}
                      onClick={() => exportCsv(lap.frames, lap.lapNumber)}
                    >
                      <Download size={12} /> CSV
                    </button>
                  </div>
                  <ResponsiveContainer width="100%" height={150}>
                    <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e1e30" />
                      <XAxis dataKey="t" tick={{ fill: "var(--text-muted)", fontSize: 10 }} unit="s" />
                      <YAxis tick={{ fill: "var(--text-muted)", fontSize: 10 }} unit=" km/h" />
                      <Tooltip contentStyle={{ background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 8 }} />
                      <Line type="monotone" dataKey="speed" stroke="var(--accent-cyan)" dot={false} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="card">
                  <div className="card-header-row"><h3>Throttle & Brake Trace</h3></div>
                  <ResponsiveContainer width="100%" height={150}>
                    <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e1e30" />
                      <XAxis dataKey="t" tick={{ fill: "var(--text-muted)", fontSize: 10 }} unit="s" />
                      <YAxis tick={{ fill: "var(--text-muted)", fontSize: 10 }} unit="%" />
                      <Tooltip contentStyle={{ background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 8 }} />
                      <Legend wrapperStyle={{ fontSize: "0.75rem" }} />
                      <Line type="monotone" dataKey="throttle" stroke="var(--accent-green)" dot={false} strokeWidth={2} name="Throttle" />
                      <Line type="monotone" dataKey="brake"    stroke="var(--accent-red)"   dot={false} strokeWidth={2} name="Brake" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
            {!lap && laps.length > 0 && (
              <div style={{ color: "var(--text-muted)", fontSize: "0.9rem", padding: "20px 0" }}>
                Select a lap from the list to see telemetry traces.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

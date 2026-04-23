import { useEffect, useMemo, useState } from "react";
import { useLapStore } from "../store";
import { fetchRecentTelemetry } from "../services/influx";
import type { InfluxTelemetryPoint } from "../types";
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

function exportCsv(frames: { ts: number; rpm: number; throttle: number; brake: number }[], lapNum: number) {
  const header = "ts,rpm,throttle,brake\n";
  const rows = frames.map((f) => `${f.ts},${f.rpm},${f.throttle},${f.brake}`).join("\n");
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
  const [dbPoints, setDbPoints] = useState<InfluxTelemetryPoint[]>([]);
  const [dbError, setDbError] = useState<string | null>(null);
  const [dbLoading, setDbLoading] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadHistory = async () => {
      setDbLoading(true);
      setDbError(null);
      try {
        const points = await fetchRecentTelemetry(1800, 1000, 1800);
        if (mounted) {
          setDbPoints(points);
        }
      } catch (e) {
        if (mounted) {
          setDbError(String(e));
        }
      } finally {
        if (mounted) {
          setDbLoading(false);
        }
      }
    };

    loadHistory();
    const interval = setInterval(loadHistory, 7000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const lapBarData = laps.map((l) => ({
    name: `Lap ${l.lapNumber}`,
    time: +(l.lapTime / 1000).toFixed(3),
  }));

  const chartData = lap
    ? lap.frames.filter((_, i) => i % 5 === 0).map((f) => ({
        t: ((f.ts / 1000)).toFixed(1),
        throttle: f.throttle,
        brake: f.brake,
        rpm: Math.round(f.rpm / 100) * 100,
      }))
    : [];

  const dbChart = useMemo(() => {
    if (dbPoints.length < 4) {
      return [] as Array<Record<string, number | string | null>>;
    }

    const history = dbPoints
      .filter((p) => p.rpm != null)
      .map((p) => ({
        ts: p.ts,
        label: new Date(p.ts).toLocaleTimeString([], { minute: "2-digit", second: "2-digit" }),
        rpm: p.rpm,
        air_temp: p.air_temp,
        rpm_base: null,
        rpm_conservative: null,
        rpm_aggressive: null,
      }));

    if (history.length < 8) {
      return history;
    }

    const recent = history.slice(-90);
    const n = recent.length;
    const xMean = (n - 1) / 2;
    const yMean = recent.reduce((acc, p) => acc + (p.rpm ?? 0), 0) / n;

    let num = 0;
    let den = 0;
    recent.forEach((p, i) => {
      const dx = i - xMean;
      num += dx * ((p.rpm ?? 0) - yMean);
      den += dx * dx;
    });

    const slope = den === 0 ? 0 : num / den;
    const intercept = yMean - slope * xMean;
    const lastTs = history[history.length - 1].ts as number;
    const stepMs = Math.max(1000, Math.round((lastTs - (history[history.length - 2].ts as number)) || 1000));
    const horizon = 30;

    const forecast = Array.from({ length: horizon }, (_, i) => {
      const x = n + i;
      const base = intercept + slope * x;
      const conservative = intercept + slope * 0.65 * x;
      const aggressive = intercept + slope * 1.35 * x;
      const ts = lastTs + (i + 1) * stepMs;

      return {
        ts,
        label: new Date(ts).toLocaleTimeString([], { minute: "2-digit", second: "2-digit" }),
        rpm: null,
        air_temp: null,
        rpm_base: Math.max(0, Math.round(base)),
        rpm_conservative: Math.max(0, Math.round(conservative)),
        rpm_aggressive: Math.max(0, Math.round(aggressive)),
      };
    });

    return [...history, ...forecast];
  }, [dbPoints]);

  const dbTempChart = useMemo(() => {
    if (dbPoints.length < 8) {
      return [] as Array<Record<string, number | string | null>>;
    }

    const history = dbPoints
      .filter((p) => p.air_temp != null)
      .map((p) => ({
        ts: p.ts,
        label: new Date(p.ts).toLocaleTimeString([], { minute: "2-digit", second: "2-digit" }),
        temp: p.air_temp,
        temp_pred: null,
      }));

    if (history.length < 8) {
      return history;
    }

    const recent = history.slice(-120);
    const n = recent.length;
    const xMean = (n - 1) / 2;
    const yMean = recent.reduce((acc, p) => acc + (p.temp ?? 0), 0) / n;

    let num = 0;
    let den = 0;
    recent.forEach((p, i) => {
      const dx = i - xMean;
      num += dx * ((p.temp ?? 0) - yMean);
      den += dx * dx;
    });

    const slope = den === 0 ? 0 : num / den;
    const intercept = yMean - slope * xMean;
    const stepMs = 1000;
    const lastTs = history[history.length - 1].ts as number;
    const horizon = 30;

    const forecast = Array.from({ length: horizon }, (_, i) => {
      const x = n + i;
      const temp = intercept + slope * x;
      const ts = lastTs + (i + 1) * stepMs;

      return {
        ts,
        label: new Date(ts).toLocaleTimeString([], { minute: "2-digit", second: "2-digit" }),
        temp: null,
        temp_pred: +temp.toFixed(2),
      };
    });

    return [...history, ...forecast];
  }, [dbPoints]);

  return (
    <div className="page-content h-full">
      <div className="grid h-full gap-3.5 xl:grid-cols-[220px_minmax(0,1fr)]">
        {/* Left: lap list */}
        <div className="card flex min-h-0 flex-col overflow-hidden">
          <div className="card-header-row">
            <Flag size={15} style={{ color: "var(--accent-cyan)" }} />
            <h3>Lap Times</h3>
          </div>

          {laps.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
              <Flag size={42} style={{ color: "var(--text-muted)" }} />
              <div>
                <h2 style={{ color: "var(--text-secondary)" }}>No Laps Recorded</h2>
                <p className="text-secondary" style={{ fontSize: "0.9rem" }}>
                  Lap data is captured automatically. Start demo mode or connect to the car.
                </p>
              </div>
            </div>
          ) : (
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
          )}
        </div>

        {/* Right: charts */}
        <div className="flex min-h-0 flex-col gap-3.5 overflow-y-auto">
          <div className="card">
            <div className="card-header-row">
              <TrendingUp size={15} style={{ color: "var(--accent-amber)" }} />
              <h3>Lap Time Comparison</h3>
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={lapBarData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#242428" />
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

          {lap ? (
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
                    <CartesianGrid strokeDasharray="3 3" stroke="#242428" />
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
                    <CartesianGrid strokeDasharray="3 3" stroke="#242428" />
                    <XAxis dataKey="t" tick={{ fill: "var(--text-muted)", fontSize: 10 }} unit="s" />
                    <YAxis tick={{ fill: "var(--text-muted)", fontSize: 10 }} unit="%" />
                    <Tooltip contentStyle={{ background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: "0.75rem" }} />
                    <Line type="monotone" dataKey="throttle" stroke="var(--accent-green)" dot={false} strokeWidth={2} name="Throttle" />
                    <Line type="monotone" dataKey="brake" stroke="var(--accent-red)" dot={false} strokeWidth={2} name="Brake" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : laps.length > 0 ? (
            <div style={{ color: "var(--text-muted)", fontSize: "0.9rem", padding: "20px 0" }}>
              Select a lap from the list to see telemetry traces.
            </div>
          ) : null}

          <div className="card">
            <div className="card-header-row">
              <h3>InfluxDB Historical + Future Simulation (RPM)</h3>
            </div>
            {dbLoading && dbChart.length === 0 ? (
              <p className="text-[0.85rem] text-[var(--text-secondary)]">Loading InfluxDB telemetry...</p>
            ) : dbError ? (
              <p className="text-[0.85rem] text-crit">{dbError}</p>
            ) : dbChart.length === 0 ? (
              <p className="text-[0.85rem] text-[var(--text-secondary)]">
                No Influx telemetry yet. Connect ESP32 and ensure INFLUX_* env vars are configured in Tauri runtime.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={dbChart} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#242428" />
                  <XAxis dataKey="label" tick={{ fill: "var(--text-muted)", fontSize: 10 }} minTickGap={28} />
                  <YAxis tick={{ fill: "var(--text-muted)", fontSize: 10 }} unit=" rpm" />
                  <Tooltip contentStyle={{ background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: "0.75rem" }} />
                  <Line type="monotone" dataKey="rpm" stroke="var(--accent-cyan)" dot={false} strokeWidth={2} name="Historical RPM" />
                  <Line type="monotone" dataKey="rpm_base" stroke="var(--accent-amber)" dot={false} strokeWidth={2} strokeDasharray="6 4" name="Forecast Base" />
                  <Line type="monotone" dataKey="rpm_conservative" stroke="var(--accent-green)" dot={false} strokeWidth={1.8} strokeDasharray="3 4" name="Forecast Conservative" />
                  <Line type="monotone" dataKey="rpm_aggressive" stroke="var(--accent-red)" dot={false} strokeWidth={1.8} strokeDasharray="3 4" name="Forecast Aggressive" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="card">
            <div className="card-header-row">
              <h3>InfluxDB Historical + Future Prediction (Air Temp)</h3>
            </div>
            {dbTempChart.length === 0 ? (
              <p className="text-[0.85rem] text-[var(--text-secondary)]">Not enough temperature points for prediction yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={170}>
                <LineChart data={dbTempChart} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#242428" />
                  <XAxis dataKey="label" tick={{ fill: "var(--text-muted)", fontSize: 10 }} minTickGap={28} />
                  <YAxis tick={{ fill: "var(--text-muted)", fontSize: 10 }} unit=" °C" />
                  <Tooltip contentStyle={{ background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: "0.75rem" }} />
                  <Line type="monotone" dataKey="temp" stroke="var(--accent-cyan)" dot={false} strokeWidth={2} name="Historical Temp" />
                  <Line type="monotone" dataKey="temp_pred" stroke="var(--accent-amber)" dot={false} strokeWidth={2} strokeDasharray="6 4" name="Predicted Temp" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

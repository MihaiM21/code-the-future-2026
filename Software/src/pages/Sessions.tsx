import { useEffect, useMemo, useState } from "react";
import { fetchRecentTelemetry } from "../services/influx";
import type { InfluxTelemetryPoint } from "../types";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, Gauge, Radar as RadarIcon, TimerReset, TrendingUp, Waves } from "lucide-react";

const SESSION_GAP_MS = 30_000;
const HISTORY_WINDOW_SECONDS = 28_800;
const HISTORY_LIMIT = 5000;

interface SessionBlock {
  id: number;
  startTs: number;
  endTs: number;
  points: InfluxTelemetryPoint[];
}

interface RpmForecastPoint {
  ts: number;
  label: string;
  rpm: number | null;
  rpm_base: number | null;
  rpm_low: number | null;
  rpm_high: number | null;
}

interface TempForecastPoint {
  ts: number;
  label: string;
  temp: number | null;
  temp_pred: number | null;
}

interface PressureForecastPoint {
  ts: number;
  label: string;
  pressure: number | null;
  pressure_pred: number | null;
}

interface SessionSummary {
  durationMs: number;
  samples: number;
  avgRpm: number;
  peakRpm: number;
  avgTemp: number;
  peakTemp: number;
  peakG: number;
  throttlePct: number;
  brakePct: number;
  smoothness: number;
  stability: number;
  thermalHeadroom: number;
  aggression: number;
  efficiency: number;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function formatClock(ts: number): string {
  return new Date(ts).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance = mean(values.map((value) => (value - avg) ** 2));
  return Math.sqrt(variance);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function normalize(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return clamp(((value - min) / (max - min)) * 100, 0, 100);
}

function buildSessions(points: InfluxTelemetryPoint[]): SessionBlock[] {
  const sorted = [...points].sort((a, b) => a.ts - b.ts);
  if (sorted.length === 0) return [];

  const sessions: SessionBlock[] = [];
  let current: SessionBlock = {
    id: 1,
    startTs: sorted[0].ts,
    endTs: sorted[0].ts,
    points: [sorted[0]],
  };

  for (let i = 1; i < sorted.length; i += 1) {
    const point = sorted[i];
    const previous = sorted[i - 1];
    if (point.ts - previous.ts > SESSION_GAP_MS) {
      sessions.push(current);
      current = {
        id: sessions.length + 2,
        startTs: point.ts,
        endTs: point.ts,
        points: [point],
      };
    } else {
      current.points.push(point);
      current.endTs = point.ts;
    }
  }

  sessions.push(current);
  return sessions.reverse();
}

function holtForecast(values: number[], alpha: number, beta: number, steps: number): number[] {
  if (values.length < 2) return Array(steps).fill(values[values.length - 1] ?? 0);
  let level = values[0];
  let trend = values[1] - values[0];
  for (let i = 1; i < values.length; i++) {
    const prevLevel = level;
    level = alpha * values[i] + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
  }
  return Array.from({ length: steps }, (_, i) => Math.max(0, level + (i + 1) * trend));
}

function getTimeStep(sorted: InfluxTelemetryPoint[]): number {
  const recent = sorted.slice(-120);
  return (
    median(
      recent
        .map((p, i) => (i === 0 ? 0 : p.ts - recent[i - 1].ts))
        .filter((s) => s > 0)
    ) || 1000
  );
}

function buildRpmForecast(points: InfluxTelemetryPoint[], futureSteps = 36): RpmForecastPoint[] {
  const sorted = [...points].sort((a, b) => a.ts - b.ts);
  if (sorted.length === 0) return [];

  const history: RpmForecastPoint[] = sorted.map((p) => ({
    ts: p.ts,
    label: new Date(p.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    rpm: p.rpm,
    rpm_base: null,
    rpm_low: null,
    rpm_high: null,
  }));

  if (sorted.length < 6) return history;

  const recent = sorted.slice(-120);
  const timeStep = getTimeStep(sorted);
  const lastTs = sorted[sorted.length - 1].ts;
  const rpmValues = recent.map((p) => p.rpm ?? 0);
  const rpmStd = stdDev(rpmValues);
  const predicted = holtForecast(rpmValues, 0.3, 0.05, futureSteps);

  const forecast: RpmForecastPoint[] = predicted.map((base, i) => {
    const spread = rpmStd * (i + 1) * 0.15;
    const ts = lastTs + (i + 1) * timeStep;
    return {
      ts,
      label: new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      rpm: null,
      rpm_base: Math.round(base),
      rpm_low: Math.max(0, Math.round(base - spread)),
      rpm_high: Math.round(base + spread),
    };
  });

  return [...history, ...forecast];
}

function buildTempForecast(points: InfluxTelemetryPoint[], futureSteps = 36): TempForecastPoint[] {
  const sorted = [...points].sort((a, b) => a.ts - b.ts);
  if (sorted.length === 0) return [];

  const history: TempForecastPoint[] = sorted.map((p) => ({
    ts: p.ts,
    label: new Date(p.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    temp: p.air_temp,
    temp_pred: null,
  }));

  if (sorted.length < 6) return history;

  const recent = sorted.slice(-120);
  const timeStep = getTimeStep(sorted);
  const lastTs = sorted[sorted.length - 1].ts;
  const tempValues = recent.map((p) => p.air_temp ?? 0);
  const predicted = holtForecast(tempValues, 0.2, 0.03, futureSteps);

  const forecast: TempForecastPoint[] = predicted.map((val, i) => {
    const ts = lastTs + (i + 1) * timeStep;
    return {
      ts,
      label: new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      temp: null,
      temp_pred: +val.toFixed(2),
    };
  });

  return [...history, ...forecast];
}

function buildPressureForecast(points: InfluxTelemetryPoint[], futureSteps = 36): PressureForecastPoint[] {
  const sorted = [...points].sort((a, b) => a.ts - b.ts);
  if (sorted.length === 0) return [];

  const history: PressureForecastPoint[] = sorted.map((p) => ({
    ts: p.ts,
    label: new Date(p.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    pressure: p.pressure,
    pressure_pred: null,
  }));

  if (sorted.length < 6) return history;

  const recent = sorted.slice(-120);
  const timeStep = getTimeStep(sorted);
  const lastTs = sorted[sorted.length - 1].ts;
  const pressureValues = recent.map((p) => p.pressure ?? 0);
  const predicted = holtForecast(pressureValues, 0.15, 0.02, futureSteps);

  const forecast: PressureForecastPoint[] = predicted.map((val, i) => {
    const ts = lastTs + (i + 1) * timeStep;
    return {
      ts,
      label: new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      pressure: null,
      pressure_pred: +val.toFixed(2),
    };
  });

  return [...history, ...forecast];
}

function summarizeSession(session: SessionBlock): SessionSummary {
  const usable = session.points.filter((point) => point.rpm != null || point.air_temp != null);
  const rpmValues = usable.map((point) => point.rpm ?? 0);
  const tempValues = usable.map((point) => point.air_temp ?? 0);
  const gVectors = usable.map((point) => Math.sqrt((point.g_lat ?? 0) ** 2 + (point.g_lon ?? 0) ** 2 + (point.g_vert ?? 0) ** 2));
  const controlValues = usable.map((point) => ((point.throttle ?? 0) + (point.brake ?? 0)) / 2);
  const brakeValues = usable.map((point) => point.brake ?? 0);
  const throttleValues = usable.map((point) => point.throttle ?? 0);

  const rpmDeltas = rpmValues.slice(1).map((value, index) => Math.abs(value - rpmValues[index]));
  const tempRange = tempValues.length ? Math.max(...tempValues) - Math.min(...tempValues) : 0;
  const peakG = gVectors.length ? Math.max(...gVectors) : 0;
  const avgRpm = mean(rpmValues);
  const peakRpm = rpmValues.length ? Math.max(...rpmValues) : 0;
  const avgTemp = mean(tempValues);
  const peakTemp = tempValues.length ? Math.max(...tempValues) : 0;
  const throttlePct = mean(throttleValues);
  const brakePct = mean(brakeValues);
  const smoothness = clamp(100 - normalize(stdDev(rpmDeltas), 0, 1800), 0, 100);
  const stability = clamp(100 - normalize(peakG, 0, 6), 0, 100);
  const thermalHeadroom = clamp(100 - normalize(peakTemp, 20, 95), 0, 100);
  const aggression = clamp(mean(controlValues) * 100 + normalize(peakG, 0, 4) * 0.4, 0, 100);
  const efficiency = clamp(100 - normalize(avgRpm, 0, 12000) * 0.65 - normalize(tempRange, 0, 35) * 0.35, 0, 100);

  return {
    durationMs: session.endTs - session.startTs,
    samples: session.points.length,
    avgRpm,
    peakRpm,
    avgTemp,
    peakTemp,
    peakG,
    throttlePct,
    brakePct,
    smoothness,
    stability,
    thermalHeadroom,
    aggression,
    efficiency,
  };
}

function MetricCard({
  label,
  value,
  unit,
  icon,
  tone = "var(--text-primary)",
}: {
  label: string;
  value: string | number;
  unit: string;
  icon: React.ReactNode;
  tone?: string;
}) {
  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-center gap-2">
        {icon}
        <span className="card-section-label">{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="mono text-[2rem] font-extrabold leading-none" style={{ color: tone }}>
          {value}
        </span>
        <span className="text-[0.72rem] text-[var(--text-muted)]">{unit}</span>
      </div>
    </div>
  );
}

export default function Sessions() {
  const [points, setPoints] = useState<InfluxTelemetryPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadHistory = async () => {
      setLoading(true);
      setError(null);
      try {
        const telemetry = await fetchRecentTelemetry(HISTORY_WINDOW_SECONDS, 1000, HISTORY_LIMIT);
        if (mounted) {
          setPoints(telemetry);
        }
      } catch (err) {
        if (mounted) {
          setError(String(err));
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadHistory();
    const timer = setInterval(loadHistory, 7000);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  const sessions = useMemo(() => buildSessions(points), [points]);
  const selectedSession = useMemo(() => {
    if (sessions.length === 0) return null;
    return sessions.find((session) => session.id === selectedSessionId) ?? sessions[0];
  }, [sessions, selectedSessionId]);

  useEffect(() => {
    if (sessions.length > 0 && selectedSessionId == null) {
      setSelectedSessionId(sessions[0].id);
    }
  }, [sessions, selectedSessionId]);

  useEffect(() => {
    if (selectedSession && selectedSession.id !== selectedSessionId) {
      setSelectedSessionId(selectedSession.id);
    }
  }, [selectedSession, selectedSessionId]);

  const rpmForecast = useMemo(
    () => (selectedSession ? buildRpmForecast(selectedSession.points) : []),
    [selectedSession]
  );
  const tempForecast = useMemo(
    () => (selectedSession ? buildTempForecast(selectedSession.points) : []),
    [selectedSession]
  );
  const pressureForecast = useMemo(
    () => (selectedSession ? buildPressureForecast(selectedSession.points) : []),
    [selectedSession]
  );

  const summary = useMemo(
    () => (selectedSession ? summarizeSession(selectedSession) : null),
    [selectedSession]
  );

  const radarData = summary
    ? [
        { metric: "Smoothness", value: summary.smoothness, fill: "var(--accent-cyan)" },
        { metric: "Stability", value: summary.stability, fill: "var(--accent-green)" },
        { metric: "Thermal", value: summary.thermalHeadroom, fill: "var(--accent-amber)" },
        { metric: "Aggression", value: summary.aggression, fill: "var(--accent-red)" },
        { metric: "Efficiency", value: summary.efficiency, fill: "var(--accent-purple)" },
        { metric: "Control", value: clamp((summary.throttlePct + summary.brakePct) / 2, 0, 100), fill: "var(--accent-cyan)" },
      ]
    : [];

  const isEmpty = sessions.length === 0;

  return (
    <div className="page-content flex h-full flex-col gap-3.5 ">
      <div className="grid gap-3.5 xl:grid-cols-[240px_minmax(0,1fr)]">
        <div className="card flex min-h-0 flex-col overflow-hidden">
          <div className="card-header-row">
            <TimerReset size={15} style={{ color: "var(--accent-cyan)" }} />
            <h3>Telemetry Sessions</h3>
          </div>

          {isEmpty ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
              <TimerReset size={42} style={{ color: "var(--text-muted)" }} />
              <div>
                <h2 style={{ color: "var(--text-secondary)" }}>No Sessions Yet</h2>
                <p className="text-secondary" style={{ fontSize: "0.9rem" }}>
                  Connect the ESP32 or start demo mode to capture a telemetry session.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
              {sessions.map((session) => {
                const isActive = selectedSession?.id === session.id;
                const summaryForRow = summarizeSession(session);
                return (
                  <button
                    key={session.id}
                    className={`flex flex-col gap-1 rounded-[10px] border px-3 py-2.5 text-left transition-all duration-150 ${isActive ? "border-[#00d2ff4d] bg-[var(--accent-cyan-dim)] text-[var(--accent-cyan)]" : "border-transparent bg-transparent text-[var(--text-secondary)] hover:border-[var(--border)] hover:bg-[var(--bg-card-hover)]"}`}
                    onClick={() => setSelectedSessionId(session.id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[0.72rem] font-semibold tracking-[0.08em] text-[var(--text-muted)]">
                        SESSION {session.id}
                      </span>
                      <span className="mono text-[0.76rem] text-[var(--text-muted)]">
                        {formatDuration(summaryForRow.durationMs)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[0.82rem] font-medium text-[var(--text-primary)]">
                        {formatClock(session.startTs)}
                      </span>
                      <span className="mono text-[0.72rem] text-[var(--text-muted)]">
                        {summaryForRow.samples} samples
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex min-h-0 flex-col gap-3.5 overflow-y-auto">
          <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Duration"
              value={summary ? formatDuration(summary.durationMs) : "-"}
              unit=""
              icon={<Gauge size={14} style={{ color: "var(--accent-cyan)" }} />}
            />
            <MetricCard
              label="Samples"
              value={summary ? summary.samples.toLocaleString() : "-"}
              unit="frames"
              icon={<Activity size={14} style={{ color: "var(--accent-green)" }} />}
            />
            <MetricCard
              label="Avg RPM"
              value={summary ? Math.round(summary.avgRpm).toLocaleString() : "-"}
              unit="rpm"
              icon={<TrendingUp size={14} style={{ color: "var(--accent-amber)" }} />}
            />
            <MetricCard
              label="Peak G"
              value={summary ? summary.peakG.toFixed(2) : "-"}
              unit="g"
              icon={<Waves size={14} style={{ color: "var(--accent-purple)" }} />}
            />
          </div>

          <div className="grid gap-3.5 xl:grid-cols-3">
            <div className="card">
              <div className="card-header-row">
                <TrendingUp size={15} style={{ color: "var(--accent-cyan)" }} />
                <h3>RPM Forecast</h3>
              </div>
              {selectedSession ? (
                <ResponsiveContainer width="100%" height={220}>
                  <ComposedChart data={rpmForecast} margin={{ top: 6, right: 10, left: -18, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#242428" />
                    <XAxis dataKey="label" tick={{ fill: "var(--text-muted)", fontSize: 10 }} minTickGap={22} />
                    <YAxis tick={{ fill: "var(--text-muted)", fontSize: 10 }} unit=" rpm" />
                    <Tooltip contentStyle={{ background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: "0.75rem" }} />
                    <Area type="monotone" dataKey="rpm_high" stroke="none" fill="var(--accent-amber)" fillOpacity={0.12} name="Confidence Band" legendType="none" connectNulls />
                    <Area type="monotone" dataKey="rpm_low" stroke="none" fill="var(--bg-card)" fillOpacity={1} name="Band Floor" legendType="none" connectNulls />
                    <Line type="monotone" dataKey="rpm" stroke="var(--accent-cyan)" dot={false} strokeWidth={2} name="RPM History" connectNulls />
                    <Line type="monotone" dataKey="rpm_base" stroke="var(--accent-amber)" dot={false} strokeWidth={2} strokeDasharray="6 4" name="RPM Forecast" connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-[0.85rem] text-[var(--text-secondary)]">Select a session to view the RPM forecast.</p>
              )}
            </div>

            <div className="card">
              <div className="card-header-row">
                <TrendingUp size={15} style={{ color: "var(--accent-purple)" }} />
                <h3>Temperature Forecast</h3>
              </div>
              {selectedSession ? (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={tempForecast} margin={{ top: 6, right: 10, left: -18, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#242428" />
                    <XAxis dataKey="label" tick={{ fill: "var(--text-muted)", fontSize: 10 }} minTickGap={22} />
                    <YAxis tick={{ fill: "var(--text-muted)", fontSize: 10 }} unit=" °C" />
                    <Tooltip contentStyle={{ background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: "0.75rem" }} />
                    <Line type="monotone" dataKey="temp" stroke="var(--accent-purple)" dot={false} strokeWidth={2} name="Temp History" connectNulls />
                    <Line type="monotone" dataKey="temp_pred" stroke="var(--accent-amber)" dot={false} strokeWidth={2} strokeDasharray="6 4" name="Temp Forecast" connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-[0.85rem] text-[var(--text-secondary)]">Select a session to view the temperature forecast.</p>
              )}
            </div>

            <div className="card">
              <div className="card-header-row">
                <Waves size={15} style={{ color: "var(--accent-green)" }} />
                <h3>Pressure Forecast</h3>
              </div>
              {selectedSession ? (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={pressureForecast} margin={{ top: 6, right: 10, left: -18, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#242428" />
                    <XAxis dataKey="label" tick={{ fill: "var(--text-muted)", fontSize: 10 }} minTickGap={22} />
                    <YAxis tick={{ fill: "var(--text-muted)", fontSize: 10 }} unit=" hPa" />
                    <Tooltip contentStyle={{ background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: "0.75rem" }} />
                    <Line type="monotone" dataKey="pressure" stroke="var(--text-secondary)" dot={false} strokeWidth={2} name="Pressure History" connectNulls />
                    <Line type="monotone" dataKey="pressure_pred" stroke="var(--accent-green)" dot={false} strokeWidth={2} strokeDasharray="6 4" name="Pressure Forecast" connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-[0.85rem] text-[var(--text-secondary)]">Select a session to view the pressure forecast.</p>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header-row">
              <RadarIcon size={15} style={{ color: "var(--accent-cyan)" }} />
              <h3>Session Profile Radar</h3>
            </div>
            {radarData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <RadarChart data={radarData} outerRadius="72%">
                  <PolarGrid stroke="#4e4e7c" />
                  <PolarAngleAxis dataKey="metric" tick={{ fill: "var(--text-muted)", fontSize: 15 }} />
                  <Radar dataKey="value" stroke="var(--accent-cyan)" fill="var(--accent-cyan)" fillOpacity={0.2} dot />
                  <Legend/>
                </RadarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-[0.85rem] text-[var(--text-secondary)]">No session selected yet.</p>
            )}
          </div>

          <div className="grid gap-3.5 xl:grid-cols-[1.08fr_0.92fr]">
            <div className="card">
              <div className="card-header-row">
                <Waves size={15} style={{ color: "var(--accent-green)" }} />
                <h3>Vehicle Dynamics Envelope</h3>
              </div>
              {selectedSession ? (
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={selectedSession.points.map((point) => ({
                    label: new Date(point.ts).toLocaleTimeString([], { minute: "2-digit", second: "2-digit" }),
                    g_lat: point.g_lat ?? 0,
                    g_lon: point.g_lon ?? 0,
                    g_vert: point.g_vert ?? 0,
                    load: Math.sqrt((point.g_lat ?? 0) ** 2 + (point.g_lon ?? 0) ** 2 + (point.g_vert ?? 0) ** 2),
                  }))} margin={{ top: 8, right: 10, left: -18, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#242428" />
                    <XAxis dataKey="label" tick={{ fill: "var(--text-muted)", fontSize: 10 }} minTickGap={24} />
                    <YAxis tick={{ fill: "var(--text-muted)", fontSize: 10 }} unit=" g" />
                    <Tooltip contentStyle={{ background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: "0.75rem" }} />
                    <Area type="monotone" dataKey="g_lat" stroke="var(--accent-cyan)" fill="var(--accent-cyan)" fillOpacity={0.16} name="Lateral" />
                    <Area type="monotone" dataKey="g_lon" stroke="var(--accent-amber)" fill="var(--accent-amber)" fillOpacity={0.14} name="Longitudinal" />
                    <Area type="monotone" dataKey="g_vert" stroke="var(--accent-purple)" fill="var(--accent-purple)" fillOpacity={0.12} name="Vertical" />
                    <Line type="monotone" dataKey="load" stroke="var(--accent-green)" strokeWidth={2} dot={false} name="Vector Load" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-[0.85rem] text-[var(--text-secondary)]">No selected session available.</p>
              )}
            </div>

            <div className="card">
              <div className="card-header-row">
                <Activity size={15} style={{ color: "var(--accent-red)" }} />
                <h3>Control Demand and Engine Load</h3>
              </div>
              {selectedSession ? (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart
                    data={selectedSession.points.map((point) => ({
                      label: new Date(point.ts).toLocaleTimeString([], { minute: "2-digit", second: "2-digit" }),
                      throttle: point.throttle ?? 0,
                      brake: point.brake ?? 0,
                      rpmNorm: normalize(point.rpm ?? 0, 0, 12000),
                    }))}
                    margin={{ top: 8, right: 10, left: -12, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#242428" />
                    <XAxis dataKey="label" tick={{ fill: "var(--text-muted)", fontSize: 10 }} minTickGap={24} />
                    <YAxis tick={{ fill: "var(--text-muted)", fontSize: 10 }} unit="%" />
                    <Tooltip contentStyle={{ background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: "0.75rem" }} />
                    <Bar dataKey="throttle" fill="var(--accent-green)" radius={[4, 4, 0, 0]} name="Throttle" />
                    <Bar dataKey="brake" fill="var(--accent-red)" radius={[4, 4, 0, 0]} name="Brake" />
                    <Line type="monotone" dataKey="rpmNorm" stroke="var(--accent-amber)" strokeWidth={2} dot={false} name="RPM Load %" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-[0.85rem] text-[var(--text-secondary)]">No selected session available.</p>
              )}
            </div>
          </div>

          <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Smoothness"
              value={summary ? summary.smoothness.toFixed(0) : "-"}
              unit="/100"
              icon={<Gauge size={14} style={{ color: "var(--accent-cyan)" }} />}
            />
            <MetricCard
              label="Stability"
              value={summary ? summary.stability.toFixed(0) : "-"}
              unit="/100"
              icon={<Waves size={14} style={{ color: "var(--accent-green)" }} />}
            />
            <MetricCard
              label="Thermal"
              value={summary ? summary.thermalHeadroom.toFixed(0) : "-"}
              unit="/100"
              icon={<TrendingUp size={14} style={{ color: "var(--accent-amber)" }} />}
            />
            <MetricCard
              label="Efficiency"
              value={summary ? summary.efficiency.toFixed(0) : "-"}
              unit="/100"
              icon={<RadarIcon size={14} style={{ color: "var(--accent-purple)" }} />}
            />
          </div>

          {loading && sessions.length === 0 && (
            <p className="text-[0.85rem] text-[var(--text-secondary)]">Loading telemetry sessions...</p>
          )}
          {error && <p className="text-[0.85rem] text-crit">{error}</p>}
        </div>
      </div>
    </div>
  );
}

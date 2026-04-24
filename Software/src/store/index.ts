import { create } from "zustand";
import type { TelemetryFrame, AlertEntry, SerialConfig, SerialPortInfo, AutonomyAction, AutonomyLevel, DiagnosisResult, ReliabilityData, StressCounter, ComponentLifetime } from "../types";

const RING_BUFFER_SIZE = 600; // ~60 seconds at 10 fps

// ── Telemetry Store ──────────────────────────────────────────
interface TelemetryState {
  current: TelemetryFrame | null;
  history: TelemetryFrame[];
  pushFrame: (frame: TelemetryFrame) => void;
}

export const useTelemetryStore = create<TelemetryState>((set) => ({
  current: null,
  history: [],
  pushFrame: (frame) =>
    set((s) => ({
      current: frame,
      history: [...s.history.slice(-(RING_BUFFER_SIZE - 1)), frame],
    })),
}));

// ── Alert Store ──────────────────────────────────────────────
interface AlertState {
  alerts: AlertEntry[];
  addAlert: (a: AlertEntry) => void;
  clearAlerts: () => void;
}

export const useAlertStore = create<AlertState>((set) => ({
  alerts: [],
  addAlert: (a) =>
    set((s) => ({ alerts: [a, ...s.alerts].slice(0, 200) })),
  clearAlerts: () => set({ alerts: [] }),
}));

// ── Serial Store ─────────────────────────────────────────────
interface SerialState {
  config: SerialConfig;
  availablePorts: SerialPortInfo[];
  bytesPerSec: number;
  lastFrameAge: number;  // ms
  setConfig: (c: Partial<SerialConfig>) => void;
  setPorts: (ports: SerialPortInfo[]) => void;
  setBytesPerSec: (n: number) => void;
  setLastFrameAge: (n: number) => void;
}

export const useSerialStore = create<SerialState>((set) => ({
  config: { port: "", baud: 115200, connected: false },
  availablePorts: [],
  bytesPerSec: 0,
  lastFrameAge: 0,
  setConfig: (c) => set((s) => ({ config: { ...s.config, ...c } })),
  setPorts: (ports) => set({ availablePorts: ports }),
  setBytesPerSec: (n) => set({ bytesPerSec: n }),
  setLastFrameAge: (n) => set({ lastFrameAge: n }),
}));

// ── Config Store ─────────────────────────────────────────────
interface ConfigState {
  autonomyLevel: AutonomyLevel;
  fanThreshold: number;      // °C
  exhaustTempHigh: number;   // °C
  batteryLowV: number;       // V
  rpmLimit: number;
  autoFanEnabled: boolean;
  autoExhaustCleanupEnabled: boolean;
  autoBatteryAlertEnabled: boolean;
  autoRpmAdvisoryEnabled: boolean;
  setAutonomyLevel: (n: AutonomyLevel) => void;
  setFanThreshold: (n: number) => void;
  setExhaustTempHigh: (n: number) => void;
  setBatteryLowV: (n: number) => void;
  setRpmLimit: (n: number) => void;
  toggleAutoFan: () => void;
  toggleAutoExhaustCleanup: () => void;
  toggleAutoBatteryAlert: () => void;
  toggleAutoRpmAdvisory: () => void;
}

export const useConfigStore = create<ConfigState>((set) => ({
  autonomyLevel: 1,
  fanThreshold: 95,
  exhaustTempHigh: 760,
  batteryLowV: 11.5,
  rpmLimit: 9000,
  autoFanEnabled: true,
  autoExhaustCleanupEnabled: true,
  autoBatteryAlertEnabled: true,
  autoRpmAdvisoryEnabled: true,
  setAutonomyLevel: (n) => set({ autonomyLevel: n }),
  setFanThreshold: (n) => set({ fanThreshold: n }),
  setExhaustTempHigh: (n) => set({ exhaustTempHigh: n }),
  setBatteryLowV: (n) => set({ batteryLowV: n }),
  setRpmLimit: (n) => set({ rpmLimit: n }),
  toggleAutoFan: () => set((s) => ({ autoFanEnabled: !s.autoFanEnabled })),
  toggleAutoExhaustCleanup: () => set((s) => ({ autoExhaustCleanupEnabled: !s.autoExhaustCleanupEnabled })),
  toggleAutoBatteryAlert: () => set((s) => ({ autoBatteryAlertEnabled: !s.autoBatteryAlertEnabled })),
  toggleAutoRpmAdvisory: () => set((s) => ({ autoRpmAdvisoryEnabled: !s.autoRpmAdvisoryEnabled })),
}));

// ── Autonomy Queue ───────────────────────────────────────────
interface AutonomyState {
  actions: AutonomyAction[];
  addAction: (action: AutonomyAction) => void;
  updateAction: (id: string, patch: Partial<AutonomyAction>) => void;
  removeAction: (id: string) => void;
  setActions: (actions: AutonomyAction[]) => void;
}

export const useAutonomyStore = create<AutonomyState>((set) => ({
  actions: [],
  addAction: (action) =>
    set((state) => ({
      actions: [action, ...state.actions.filter((item) => item.id !== action.id)].slice(0, 40),
    })),
  updateAction: (id, patch) =>
    set((state) => ({
      actions: state.actions.map((action) => (action.id === id ? { ...action, ...patch } : action)),
    })),
  removeAction: (id) =>
    set((state) => ({
      actions: state.actions.filter((action) => action.id !== id),
    })),
  setActions: (actions) => set({ actions }),
}));

// ── Reliability Store (persisted to localStorage) ───────────
const RELIABILITY_KEY = "aems_reliability_v1";

const DEFAULT_LIFETIME: ComponentLifetime[] = [
  { component: "Engine",  usageScore: 0, budgetScore: 36000, pctRemaining: 100, lastUpdated: 0 },
  { component: "Exhaust", usageScore: 0, budgetScore: 18000, pctRemaining: 100, lastUpdated: 0 },
  { component: "Battery", usageScore: 0, budgetScore: 14400, pctRemaining: 100, lastUpdated: 0 },
  { component: "RPM",     usageScore: 0, budgetScore: 7200,  pctRemaining: 100, lastUpdated: 0 },
];

function loadReliability(): ReliabilityData {
  try {
    const raw = localStorage.getItem(RELIABILITY_KEY);
    if (raw) return JSON.parse(raw) as ReliabilityData;
  } catch (_) {/* ignore */}
  return { sessions: [], cumulativeStress: [], lifetime: DEFAULT_LIFETIME };
}

interface ReliabilityState {
  data: ReliabilityData;
  // Current session accumulators (not persisted mid-session)
  sessionStress: StressCounter[];
  sessionHealthSamples: number[];
  sessionStartTs: number | null;
  setData: (d: ReliabilityData) => void;
  accumulateStress: (subsystem: string, status: "ok" | "warn" | "crit") => void;
  recordHealthSample: (pct: number) => void;
  startSession: () => void;
  finalizeSession: (peakEngineTemp: number | null, peakExhaustTemp: number | null, minBatteryV: number | null, peakRpm: number, avgRpm: number, peakGLat: number, peakGLon: number, lapCount: number) => void;
}

export const useReliabilityStore = create<ReliabilityState>((set, get) => ({
  data: loadReliability(),
  sessionStress: [],
  sessionHealthSamples: [],
  sessionStartTs: null,

  setData: (d) => {
    localStorage.setItem(RELIABILITY_KEY, JSON.stringify(d));
    set({ data: d });
  },

  accumulateStress: (subsystem, status) => {
    if (status === "ok") return;
    set((s) => {
      const existing = s.sessionStress.find((c) => c.subsystem === subsystem);
      if (existing) {
        return {
          sessionStress: s.sessionStress.map((c) =>
            c.subsystem === subsystem
              ? { ...c, secondsInWarn: c.secondsInWarn + (status === "warn" ? 1 : 0), secondsInCrit: c.secondsInCrit + (status === "crit" ? 1 : 0) }
              : c,
          ),
        };
      }
      return {
        sessionStress: [
          ...s.sessionStress,
          { subsystem, secondsInWarn: status === "warn" ? 1 : 0, secondsInCrit: status === "crit" ? 1 : 0 },
        ],
      };
    });
  },

  recordHealthSample: (pct) => set((s) => ({ sessionHealthSamples: [...s.sessionHealthSamples, pct] })),

  startSession: () => set({ sessionStress: [], sessionHealthSamples: [], sessionStartTs: Date.now() }),

  finalizeSession: (peakEngineTemp, peakExhaustTemp, minBatteryV, peakRpm, avgRpm, peakGLat, peakGLon, lapCount) => {
    const state = get();
    if (!state.sessionStartTs) return;

    const avgHealth =
      state.sessionHealthSamples.length > 0
        ? Math.round(state.sessionHealthSamples.reduce((a, b) => a + b, 0) / state.sessionHealthSamples.length)
        : 100;

    const session = {
      sessionId: `s-${state.sessionStartTs}`,
      startTs: state.sessionStartTs,
      endTs: Date.now(),
      peakEngineTemp,
      peakExhaustTemp,
      minBatteryV,
      peakRpm,
      avgRpm,
      peakGLat,
      peakGLon,
      healthPctAvg: avgHealth,
      lapCount,
      stress: state.sessionStress,
    };

    // Merge cumulative stress
    const cumulative = [...state.data.cumulativeStress];
    for (const sc of state.sessionStress) {
      const ex = cumulative.find((c) => c.subsystem === sc.subsystem);
      if (ex) {
        ex.secondsInWarn += sc.secondsInWarn;
        ex.secondsInCrit += sc.secondsInCrit;
      } else {
        cumulative.push({ ...sc });
      }
    }

    // Update lifetime scores
    const WARN_POINTS_PER_SEC = 1;
    const CRIT_POINTS_PER_SEC = 5;
    const subsystemToComponent: Record<string, string> = {
      "Engine Temp": "Engine",
      "Exhaust Temp": "Exhaust",
      "Battery": "Battery",
      "RPM": "RPM",
    };
    const lifetime = state.data.lifetime.map((lt) => {
      const sc = state.sessionStress.find((c) => subsystemToComponent[c.subsystem] === lt.component);
      if (!sc) return lt;
      const added = sc.secondsInWarn * WARN_POINTS_PER_SEC + sc.secondsInCrit * CRIT_POINTS_PER_SEC;
      const newScore = lt.usageScore + added;
      return {
        ...lt,
        usageScore: newScore,
        pctRemaining: Math.round(Math.max(0, (lt.budgetScore - newScore) / lt.budgetScore * 100)),
        lastUpdated: Date.now(),
      };
    });

    const newData: ReliabilityData = {
      sessions: [session, ...state.data.sessions].slice(0, 20),
      cumulativeStress: cumulative,
      lifetime,
    };

    localStorage.setItem(RELIABILITY_KEY, JSON.stringify(newData));
    set({ data: newData, sessionStress: [], sessionHealthSamples: [], sessionStartTs: null });
  },
}));

// ── Diagnosis Store ──────────────────────────────────────────
interface DiagnosisState {
  result: DiagnosisResult | null;
  setResult: (r: DiagnosisResult) => void;
}

export const useDiagnosisStore = create<DiagnosisState>((set) => ({
  result: null,
  setResult: (r) => set({ result: r }),
}));

// ── Lap Store ────────────────────────────────────────────────
interface LapRecord {
  lapNumber: number;
  lapTime: number;
  frames: TelemetryFrame[];
}

interface LapState {
  laps: LapRecord[];
  currentLapFrames: TelemetryFrame[];
  selectedLap: number | null;
  pushLapFrame: (frame: TelemetryFrame) => void;
  finalizeLap: (lapNumber: number, lapTime: number) => void;
  selectLap: (n: number | null) => void;
}

export const useLapStore = create<LapState>((set) => ({
  laps: [],
  currentLapFrames: [],
  selectedLap: null,
  pushLapFrame: (frame) =>
    set((s) => ({ currentLapFrames: [...s.currentLapFrames, frame] })),
  finalizeLap: (lapNumber, lapTime) =>
    set((s) => ({
      laps: [...s.laps, { lapNumber, lapTime, frames: s.currentLapFrames }],
      currentLapFrames: [],
    })),
  selectLap: (n) => set({ selectedLap: n }),
}));

// ── Log Store ────────────────────────────────────────────────
export interface LogEntry {
  timestamp: number;
  text: string;
  type: "info" | "error" | "raw";
}

interface LogState {
  logs: LogEntry[];
  addLog: (text: string, type?: LogEntry["type"]) => void;
  clearLogs: () => void;
}

export const useLogStore = create<LogState>((set) => ({
  logs: [],
  addLog: (text, type = "raw") =>
    set((s) => ({
      logs: [{ timestamp: Date.now(), text, type }, ...s.logs].slice(0, 1000),
    })),
  clearLogs: () => set({ logs: [] }),
}));


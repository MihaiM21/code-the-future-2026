import { create } from "zustand";
import type { TelemetryFrame, AlertEntry, SerialConfig, SerialPortInfo, AutonomyAction, AutonomyLevel } from "../types";

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

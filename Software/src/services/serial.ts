import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import type { TelemetryFrame, SerialPortInfo } from "../types";
import { useTelemetryStore, useAlertStore, useSerialStore, useLapStore } from "../store";

let unlistenFn: (() => void) | null = null;
let byteCount = 0;
let lastSecTs = Date.now();
let lastFrameTs = Date.now();

// ── Byte-rate tracker ─────────────────────────────────────────
setInterval(() => {
  const now = Date.now();
  const elapsed = (now - lastSecTs) / 1000;
  useSerialStore.getState().setBytesPerSec(Math.round(byteCount / elapsed));
  byteCount = 0;
  lastSecTs = now;
  useSerialStore.getState().setLastFrameAge(now - lastFrameTs);
}, 1000);

// ── List COM ports (calls Rust command) ───────────────────────
export async function listPorts(): Promise<SerialPortInfo[]> {
  const ports = await invoke<SerialPortInfo[]>("list_serial_ports");
  useSerialStore.getState().setPorts(ports);
  return ports;
}

// ── Connect ───────────────────────────────────────────────────
export async function connectSerial(port: string, baud: number): Promise<void> {
  try {
    await invoke("connect_serial", { port, baud });
    useSerialStore.getState().setConfig({ port, baud, connected: true });
    await startListening();
  } catch (e) {
    throw new Error(`Failed to connect: ${e}`);
  }
}

// ── Disconnect ────────────────────────────────────────────────
export async function disconnectSerial(): Promise<void> {
  try {
    await invoke("disconnect_serial");
  } catch (_) {/* ignore */}
  useSerialStore.getState().setConfig({ connected: false });
  if (unlistenFn) { unlistenFn(); unlistenFn = null; }
}

// ── Send command to RPi via ESP32 ─────────────────────────────
export async function sendCommand(cmd: string): Promise<void> {
  try {
    await invoke("send_command", { cmd });
  } catch (e) {
    console.error("send_command error:", e);
  }
}

// ── Listen for telemetry events from Rust ─────────────────────
async function startListening() {
  if (unlistenFn) return;
  unlistenFn = await listen<TelemetryFrame>("telemetry-update", ({ payload }) => {
    const frame = payload;
    byteCount += JSON.stringify(frame).length;
    lastFrameTs = Date.now();

    // Push to ring buffer
    useTelemetryStore.getState().pushFrame(frame);

    // Push to lap buffer
    useLapStore.getState().pushLapFrame(frame);

    // Forward any alerts
    if (frame.alerts && frame.alerts.length > 0) {
      frame.alerts.forEach((a) => useAlertStore.getState().addAlert(a));
    }
  });
}

// ── Demo simulator (used when no hardware connected) ──────────
let demoIntervalId: ReturnType<typeof setInterval> | null = null;
let demoLapFrames: TelemetryFrame[] = [];
let demoLapNumber = 1;

export function startDemo() {
  if (demoIntervalId) return;
  useSerialStore.getState().setConfig({ port: "DEMO", baud: 0, connected: true });

  let t = 0;
  demoIntervalId = setInterval(() => {
    t += 0.1;
    const rpm = 4000 + 4000 * Math.abs(Math.sin(t * 0.5));
    const speed = 80 + 130 * Math.abs(Math.sin(t * 0.3));
    const throttle = 40 + 60 * Math.abs(Math.sin(t * 0.5));
    const brake = throttle < 50 ? 80 - throttle : 0;
    const gear = Math.min(8, Math.max(1, Math.round(speed / 40)));
    const temp_engine = 88 + 12 * Math.abs(Math.sin(t * 0.05));
    const temp_water = 82 + 8 * Math.abs(Math.sin(t * 0.04));
    const temp_oil = 95 + 15 * Math.abs(Math.sin(t * 0.03));
    const lapTime = (t % 90) * 1000;

    const frame: TelemetryFrame = {
      ts: Date.now(),
      rpm: Math.round(rpm),
      speed: Math.round(speed),
      throttle: Math.round(throttle),
      brake: Math.round(brake),
      gear,
      temp_engine: +temp_engine.toFixed(1),
      temp_water: +temp_water.toFixed(1),
      temp_oil: +temp_oil.toFixed(1),
      temp_ambient: 28.5,
      battery_voltage: 12.6 + 0.4 * Math.sin(t * 0.1),
      battery_current: 35 + 20 * Math.abs(Math.sin(t * 0.2)),
      battery_fault: false,
      fuel_level: Math.max(0, 80 - t * 0.05),
      lap_time: lapTime,
      lap_number: demoLapNumber,
      g_lat: 2.2 * Math.sin(t * 0.7),
      g_lon: 1.5 * Math.sin(t * 0.5),
      g_vert: 1.0 + 0.3 * Math.sin(t * 2),
      can_errors: 0,
      autonomy_level: 1,
      fan_active: temp_engine > 96,
      drs_active: speed > 180,
      alerts: [],
    };

    demoLapFrames.push(frame);
    useTelemetryStore.getState().pushFrame(frame);
    lastFrameTs = Date.now();
    useSerialStore.getState().setLastFrameAge(0);
    useSerialStore.getState().setBytesPerSec(Math.round(JSON.stringify(frame).length));

    if (lapTime > 85000) {
      useLapStore.getState().finalizeLap(demoLapNumber, lapTime);
      demoLapNumber++;
      demoLapFrames = [];
    }
  }, 100);
}

export function stopDemo() {
  if (demoIntervalId) { clearInterval(demoIntervalId); demoIntervalId = null; }
  useSerialStore.getState().setConfig({ connected: false, port: "" });
}

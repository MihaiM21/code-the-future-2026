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
    const throttle = Math.sin(t * 0.5) > 0 ? 1 : 0;
    const brake = throttle === 0 && Math.sin(t * 0.3) > 0.5 ? 1 : 0;

    const frame: TelemetryFrame = {
      ts: Date.now(),
      air_temp: 22 + 5 * Math.sin(t * 0.1),
      air_quality: 45 + 20 * Math.abs(Math.sin(t * 0.2)),
      pressure: 1013 + 2 * Math.sin(t * 0.05),
      g_lat: 2.2 * Math.sin(t * 0.7),
      g_lon: 1.5 * Math.sin(t * 0.5),
      g_vert: 1.0 + 0.3 * Math.sin(t * 2),
      throttle,
      brake,
      rpm: Math.round(rpm),
    };
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

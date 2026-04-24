import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import type { SerialPortInfo } from "../types";
import { useTelemetryStore, useAlertStore, useSerialStore, useLapStore, useLogStore, useConfigStore, useReliabilityStore } from "../store";
import { useAuthStore } from "../store/auth";
import { evaluateAutonomyFrame } from "./autonomy";
import { evaluateDiagnosis } from "./diagnosis";
import { startReliabilityTracking, stopReliabilityTracking, finalizeReliabilitySession } from "./reliability";
import type { TelemetryFrame } from "../types";
import { sendSerialCommand } from "./command";

let unlistenAll: (() => void) | null = null;
let byteCount = 0;
let lastSecTs = Date.now();
let lastFrameTs = Date.now();

// Synthetic RPM — used as fallback when hardware doesn't send rpm
let syntheticRpmT = 0;
let syntheticRpmValue = 4000;
let syntheticRpmInterval: ReturnType<typeof setInterval> | null = null;

function startSyntheticRpm() {
  if (syntheticRpmInterval) return;
  syntheticRpmInterval = setInterval(() => {
    syntheticRpmT += 0.1;
    syntheticRpmValue = Math.round(4000 + 4000 * Math.abs(Math.sin(syntheticRpmT * 0.5)));
  }, 100);
}

function stopSyntheticRpm() {
  if (syntheticRpmInterval) { clearInterval(syntheticRpmInterval); syntheticRpmInterval = null; }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function asFiniteNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function firstDefined(...values: Array<number | undefined>): number | undefined {
  return values.find((v) => v !== undefined);
}

function toTelemetryFrame(payload: unknown): TelemetryFrame | null {
  if (!isRecord(payload)) return null;

  const ts = asFiniteNumber(payload.ts) ?? Date.now();

  const dht22 = isRecord(payload.dht22) ? payload.dht22 : undefined;
  const bmp280 = isRecord(payload.bmp280) ? payload.bmp280 : undefined;
  const mpu6050 = isRecord(payload.mpu6050) ? payload.mpu6050 : undefined;

  const accel = Array.isArray(mpu6050?.accelerometer_m_s2)
    ? mpu6050.accelerometer_m_s2
    : undefined;

  const accelX = asFiniteNumber(accel?.[0]);
  const accelY = asFiniteNumber(accel?.[1]);
  const accelZ = asFiniteNumber(accel?.[2]);
  const G = 9.80665;

  const airTemp = firstDefined(
    asFiniteNumber(payload.air_temp),
    asFiniteNumber(dht22?.temperature_c),
  );

  const pressure = firstDefined(
    asFiniteNumber(payload.pressure),
    asFiniteNumber(bmp280?.pressure_hpa),
  );

  const gLat = firstDefined(asFiniteNumber(payload.g_lat), accelX !== undefined ? accelX / G : undefined, 0);
  const gLon = firstDefined(asFiniteNumber(payload.g_lon), accelY !== undefined ? accelY / G : undefined, 0);
  const gVert = firstDefined(asFiniteNumber(payload.g_vert), accelZ !== undefined ? accelZ / G : undefined, 1);

  const rpm = firstDefined(asFiniteNumber(payload.rpm), syntheticRpmValue);

  const throttleObj = isRecord(payload.throttle) ? payload.throttle : undefined;
  const throttle = firstDefined(
    throttleObj ? asFiniteNumber(throttleObj.value) : undefined,
    asFiniteNumber(payload.throttle),
    0,
  );

  const buttonsObj = isRecord(payload.buttons) ? payload.buttons : undefined;
  const brakeRaw = buttonsObj?.button2 === "ON" ? 100 : undefined;
  const brake = firstDefined(
    brakeRaw,
    asFiniteNumber(payload.brake),
    0,
  );

  // If core numeric fields are absent, this payload is not telemetry for the dashboard.
  if (airTemp === undefined || pressure === undefined) {
    return null;
  }

  const engineTemp = firstDefined(
    asFiniteNumber(payload.engine_temp),
    airTemp !== undefined ? airTemp + 70 : undefined,
  );

  const telemetry: TelemetryFrame = {
    ts,
    air_temp: airTemp,
    air_quality: firstDefined(asFiniteNumber(payload.air_quality), 0) as number,
    pressure,
    engine_temp: engineTemp,
    coolant_temp: asFiniteNumber(payload.coolant_temp),
    exhaust_temp: asFiniteNumber(payload.exhaust_temp),
    battery_v: asFiniteNumber(payload.battery_v),
    g_lat: gLat as number,
    g_lon: gLon as number,
    g_vert: gVert as number,
    throttle: Math.max(0, Math.min(100, throttle as number)),
    brake: Math.max(0, Math.min(100, brake as number)),
    rpm: Math.max(0, rpm as number),
    can_errors: asFiniteNumber(payload.can_errors),
    fan_active: typeof payload.fan_active === "boolean" ? payload.fan_active : undefined,
    drs_active: typeof payload.drs_active === "boolean" ? payload.drs_active : undefined,
  };

  return telemetry;
}

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
    useReliabilityStore.getState().startSession();
    startReliabilityTracking();
    startSyntheticRpm();
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
  finalizeReliabilitySession();
  stopReliabilityTracking();
  stopSyntheticRpm();
  useSerialStore.getState().setConfig({ connected: false });
  if (unlistenAll) { unlistenAll(); unlistenAll = null; }
}

// ── Send command to RPi via ESP32 ─────────────────────────────
export async function sendCommand(cmd: string): Promise<void> {
  const role = useAuthStore.getState().user?.role;
  if (role !== "authorized_user") {
    throw new Error("Only Authorized Users can send control commands.");
  }

  try {
    await sendSerialCommand(cmd);
  } catch (e) {
    console.error("send_command error:", e);
  }
}

// ── Listen for telemetry events from Rust ─────────────────────
async function startListening() {
  if (unlistenAll) return;

  const unRaw = await listen<string>("serial-raw", ({ payload }) => {
    useLogStore.getState().addLog(payload, "raw");
  });

  const unRawErr = await listen<string>("serial-raw-error", ({ payload }) => {
    console.warn("[serial] Raw parse error from hardware:", payload);
    useLogStore.getState().addLog(payload, "error");
    useAlertStore.getState().addAlert({
      id: `raw-err-${Date.now()}`,
      ts: Date.now(),
      severity: "warning",
      system: "Hardware",
      message: `Invalid JSON: ${payload.substring(0, 80)}`,
    });
  });

  // Rust reader thread died (USB pulled, port error, etc.)
  const unDisconnected = await listen("serial-disconnected", () => {
    useLogStore.getState().addLog("[serial] Device disconnected unexpectedly", "error");
    useAlertStore.getState().addAlert({
      id: `disconnected-${Date.now()}`,
      ts: Date.now(),
      severity: "critical",
      system: "Serial",
      message: "Serial device disconnected unexpectedly",
    });
    finalizeReliabilitySession();
    stopReliabilityTracking();
    useSerialStore.getState().setConfig({ connected: false });
    if (unlistenAll) { unlistenAll(); unlistenAll = null; }
  });

  const unTelemetry = await listen<unknown>("telemetry-update", ({ payload }) => {
    byteCount += JSON.stringify(payload).length;
    lastFrameTs = Date.now();

    const frame = toTelemetryFrame(payload);
    if (!frame) {
      useLogStore.getState().addLog(`[serial] Dropped non-telemetry payload: ${JSON.stringify(payload).slice(0, 180)}`, "error");
      return;
    }

    useTelemetryStore.getState().pushFrame(frame);
    useLapStore.getState().pushLapFrame(frame);

    if (frame.alerts && frame.alerts.length > 0) {
      frame.alerts.forEach((a) => useAlertStore.getState().addAlert(a));
    }

    evaluateAutonomyFrame(frame);
    evaluateDiagnosis(
      frame,
      useTelemetryStore.getState().history,
      useConfigStore.getState(),
      useSerialStore.getState().lastFrameAge,
    );
  });

  unlistenAll = () => {
    unRaw();
    unRawErr();
    unDisconnected();
    unTelemetry();
  };
}

// ── Demo simulator (used when no hardware connected) ──────────
let demoIntervalId: ReturnType<typeof setInterval> | null = null;
let demoLapNumber = 1;
let demoLapStartTs = 0;

export function startDemo() {
  if (demoIntervalId) return;
  useSerialStore.getState().setConfig({ port: "DEMO", baud: 0, connected: true });
  useReliabilityStore.getState().startSession();
  startReliabilityTracking();
  demoLapStartTs = Date.now();

  let t = 0;
  demoIntervalId = setInterval(() => {
    t += 0.1;

    const throttleRaw = Math.sin(t * 0.5);
    const brakeRaw = Math.sin(t * 0.3);
    // Smooth 0-100 pedal values so the dashboard bars animate visibly
    const throttle = throttleRaw > 0 ? Math.round(throttleRaw * 100) : 0;
    const brake = throttleRaw <= 0 && brakeRaw > 0.3 ? Math.round(brakeRaw * 100) : 0;

    const demoAirTemp = 22 + 5 * Math.sin(t * 0.1);
    const frame: TelemetryFrame = {
      ts: Date.now(),
      air_temp: demoAirTemp,
      air_quality: 45 + 20 * Math.abs(Math.sin(t * 0.2)),
      pressure: 1013 + 2 * Math.sin(t * 0.05),
      engine_temp: demoAirTemp + 70,
      g_lat: 2.2 * Math.sin(t * 0.7),
      g_lon: 1.5 * Math.sin(t * 0.5),
      g_vert: 1.0 + 0.3 * Math.sin(t * 2),
      throttle,
      brake,
      rpm: Math.round(4000 + 4000 * Math.abs(Math.sin(t * 0.5))),
    };

    lastFrameTs = Date.now();
    useSerialStore.getState().setLastFrameAge(0);
    useSerialStore.getState().setBytesPerSec(Math.round(JSON.stringify(frame).length));

    useTelemetryStore.getState().pushFrame(frame);
    useLapStore.getState().pushLapFrame(frame);
    useLogStore.getState().addLog(JSON.stringify(frame), "raw");
    evaluateDiagnosis(
      frame,
      useTelemetryStore.getState().history,
      useConfigStore.getState(),
      0,
    );

    const lapTime = Date.now() - demoLapStartTs;
    if (lapTime > 85000) {
      useLapStore.getState().finalizeLap(demoLapNumber, lapTime);
      demoLapNumber++;
      demoLapStartTs = Date.now();
    }
  }, 100);
}

export function stopDemo() {
  if (demoIntervalId) { clearInterval(demoIntervalId); demoIntervalId = null; }
  finalizeReliabilitySession();
  stopReliabilityTracking();
  useSerialStore.getState().setConfig({ connected: false, port: "" });
}

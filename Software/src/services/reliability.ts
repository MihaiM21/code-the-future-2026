import { useDiagnosisStore, useReliabilityStore, useTelemetryStore, useLapStore } from "../store";

let reliabilityInterval: ReturnType<typeof setInterval> | null = null;

// Accumulate stress once per second from the current diagnosis result
export function startReliabilityTracking(): void {
  if (reliabilityInterval) return;
  reliabilityInterval = setInterval(() => {
    const result = useDiagnosisStore.getState().result;
    const store = useReliabilityStore.getState();
    if (!result) return;

    for (const sub of result.subsystems) {
      store.accumulateStress(sub.name, sub.status);
    }
    store.recordHealthSample(result.healthPct);
  }, 1000);
}

export function stopReliabilityTracking(): void {
  if (reliabilityInterval) {
    clearInterval(reliabilityInterval);
    reliabilityInterval = null;
  }
}

// Call when a session ends (disconnect or demo stop)
export function finalizeReliabilitySession(): void {
  const history = useTelemetryStore.getState().history;
  const lapStore = useLapStore.getState();

  let peakEngineTemp: number | null = null;
  let peakExhaustTemp: number | null = null;
  let minBatteryV: number | null = null;
  let peakRpm = 0;
  let totalRpm = 0;
  let peakGLat = 0;
  let peakGLon = 0;

  const frames = history.length > 0 ? history : lapStore.currentLapFrames;
  for (const f of frames) {
    const et = f.engine_temp ?? f.air_temp;
    if (peakEngineTemp === null || et > peakEngineTemp) peakEngineTemp = et;
    if (f.exhaust_temp !== undefined && (peakExhaustTemp === null || f.exhaust_temp > peakExhaustTemp))
      peakExhaustTemp = f.exhaust_temp;
    if (f.battery_v !== undefined && (minBatteryV === null || f.battery_v < minBatteryV))
      minBatteryV = f.battery_v;
    if (f.rpm > peakRpm) peakRpm = f.rpm;
    totalRpm += f.rpm;
    if (Math.abs(f.g_lat) > peakGLat) peakGLat = Math.abs(f.g_lat);
    if (Math.abs(f.g_lon) > peakGLon) peakGLon = Math.abs(f.g_lon);
  }

  const avgRpm = frames.length > 0 ? Math.round(totalRpm / frames.length) : 0;
  const lapCount = lapStore.laps.length;

  useReliabilityStore.getState().finalizeSession(
    peakEngineTemp,
    peakExhaustTemp,
    minBatteryV,
    peakRpm,
    avgRpm,
    peakGLat,
    peakGLon,
    lapCount,
  );
}

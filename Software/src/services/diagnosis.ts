import type { TelemetryFrame, SubsystemHealth, DiagPrediction, DiagRecommendation, DiagnosisResult } from "../types";
import { useAlertStore, useDiagnosisStore } from "../store";

// Debounce: track when each prediction was last fired as an alert
const predictionLastFired = new Map<string, number>();
const PREDICTION_DEBOUNCE_MS = 10_000;

// Linear interpolation: returns 0–100 health value
// value moves from goodEnd (100%) toward badEnd (0%)
function linearHealth(value: number, goodEnd: number, badEnd: number): number {
  if (goodEnd === badEnd) return 100;
  const pct = (value - badEnd) / (goodEnd - badEnd);
  return Math.round(Math.min(100, Math.max(0, pct * 100)));
}

function statusFromHealth(h: number): "ok" | "warn" | "crit" {
  if (h >= 70) return "ok";
  if (h >= 40) return "warn";
  return "crit";
}

// Linear regression slope over last N values
function trendSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - meanX) * (values[i] - meanY);
    den += (i - meanX) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

interface DiagConfig {
  fanThreshold: number;
  exhaustTempHigh: number;
  batteryLowV: number;
  rpmLimit: number;
  autoFanEnabled: boolean;
  autoBatteryAlertEnabled: boolean;
  autoRpmAdvisoryEnabled: boolean;
}

export function evaluateDiagnosis(
  frame: TelemetryFrame,
  history: TelemetryFrame[],
  config: DiagConfig,
  lastFrameAgeMs: number,
): void {
  const FPS = 10;
  const TREND_WINDOW = history.length; // full ring buffer (~60s at 10fps)
  const ETA_WARN_SEC = 60; // warn when breach is < 60s away

  // Extract recent values for trend analysis
  const recent = history.slice(-TREND_WINDOW);
  const engineTemps = recent.map((f) => f.engine_temp ?? f.air_temp);
  const exhaustTemps = recent.filter((f) => f.exhaust_temp !== undefined).map((f) => f.exhaust_temp!);
  const batteryVs = recent.filter((f) => f.battery_v !== undefined).map((f) => f.battery_v!);
  const rpms = recent.map((f) => f.rpm);

  const engineTemp = frame.engine_temp ?? frame.air_temp;
  const exhaustTemp = frame.exhaust_temp;
  const batteryV = frame.battery_v;
  const canErrors = frame.can_errors ?? 0;

  // ── Subsystem health scores ────────────────────────────────
  const subsystems: SubsystemHealth[] = [];

  // Engine temp: ok < fan-15, crit >= fanThreshold
  const engineH = linearHealth(engineTemp, config.fanThreshold - 15, config.fanThreshold);
  subsystems.push({
    name: "Engine Temp",
    value: engineH,
    status: statusFromHealth(engineH),
    detail: `${engineTemp.toFixed(0)}°C (limit ${config.fanThreshold}°C)`,
  });

  // Exhaust temp: ok < exhaustHigh-80, crit >= exhaustHigh
  if (exhaustTemp !== undefined) {
    const exhaustH = linearHealth(exhaustTemp, config.exhaustTempHigh - 80, config.exhaustTempHigh);
    subsystems.push({
      name: "Exhaust Temp",
      value: exhaustH,
      status: statusFromHealth(exhaustH),
      detail: `${exhaustTemp.toFixed(0)}°C (limit ${config.exhaustTempHigh}°C)`,
    });
  }

  // Battery: ok >= batteryLowV+0.5, crit <= batteryLowV
  if (batteryV !== undefined) {
    const battH = linearHealth(batteryV, config.batteryLowV + 0.5, config.batteryLowV);
    subsystems.push({
      name: "Battery",
      value: battH,
      status: statusFromHealth(battH),
      detail: `${batteryV.toFixed(2)} V (min ${config.batteryLowV} V)`,
    });
  }

  // RPM: ok < 80% limit, crit >= 95% limit
  const rpmH = linearHealth(frame.rpm, config.rpmLimit * 0.8, config.rpmLimit * 0.95);
  subsystems.push({
    name: "RPM",
    value: rpmH,
    status: statusFromHealth(rpmH),
    detail: `${frame.rpm.toLocaleString()} rpm (limit ${config.rpmLimit.toLocaleString()})`,
  });

  // CAN bus: ok = 0 errors, crit > 5
  const canH = linearHealth(5 - Math.min(canErrors, 5), 0, 5);
  subsystems.push({
    name: "CAN Bus",
    value: canErrors === 0 ? 100 : canH,
    status: canErrors === 0 ? "ok" : canErrors <= 5 ? "warn" : "crit",
    detail: canErrors === 0 ? "No errors" : `${canErrors} error${canErrors > 1 ? "s" : ""}`,
  });

  // Signal integrity: ok < 500ms, crit > 2000ms
  const signalH = linearHealth(2000 - Math.min(lastFrameAgeMs, 2000), 0, 2000 - 500);
  subsystems.push({
    name: "Signal",
    value: lastFrameAgeMs < 500 ? 100 : signalH,
    status: lastFrameAgeMs < 500 ? "ok" : lastFrameAgeMs < 2000 ? "warn" : "crit",
    detail: lastFrameAgeMs < 500 ? "Good" : `${(lastFrameAgeMs / 1000).toFixed(1)}s since last frame`,
  });

  // ── Composite health (weighted average) ────────────────────
  const weights: Array<[string, number]> = [
    ["Engine Temp", 0.25],
    ["Exhaust Temp", 0.20],
    ["Battery", 0.20],
    ["RPM", 0.15],
    ["CAN Bus", 0.10],
    ["Signal", 0.10],
  ];

  let weightedSum = 0;
  let weightTotal = 0;
  for (const [name, w] of weights) {
    const sub = subsystems.find((s) => s.name === name);
    if (sub) {
      weightedSum += sub.value * w;
      weightTotal += w;
    }
  }
  // Distribute unmatched weight to present subsystems
  const healthPct = weightTotal > 0 ? Math.round(weightedSum / weightTotal) : 100;

  // ── Predictive trend analysis ──────────────────────────────
  const predictions: DiagPrediction[] = [];

  function tryPredict(
    id: string,
    subsystem: string,
    values: number[],
    threshold: number,
    direction: "rising" | "falling",
    formatMsg: (etaSec: number | null) => string,
    severity: DiagPrediction["severity"],
  ) {
    if (values.length < 10) return;
    const slope = trendSlope(values); // units per frame
    const current = values[values.length - 1];

    const isTrending =
      direction === "rising" ? slope > 0 && current < threshold : slope < 0 && current > threshold;

    if (!isTrending) return;

    const framesUntilBreach =
      Math.abs(slope) > 0.001
        ? Math.abs((threshold - current) / slope)
        : null;
    const etaSec = framesUntilBreach !== null ? framesUntilBreach / FPS : null;

    if (etaSec !== null && etaSec > ETA_WARN_SEC) return;

    predictions.push({ id, subsystem, message: formatMsg(etaSec), etaSec, severity });

    // Fire alert with debounce
    const lastFired = predictionLastFired.get(id) ?? 0;
    if (Date.now() - lastFired >= PREDICTION_DEBOUNCE_MS) {
      predictionLastFired.set(id, Date.now());
      useAlertStore.getState().addAlert({
        id: `diag-${id}-${Date.now()}`,
        ts: Date.now(),
        severity,
        system: "Diagnosis",
        message: formatMsg(etaSec),
      });
    }
  }

  tryPredict(
    "engine-temp-trend",
    "Engine Temp",
    engineTemps,
    config.fanThreshold,
    "rising",
    (eta) =>
      eta !== null
        ? `Engine temp trending to limit in ~${Math.round(eta)}s`
        : "Engine temp trending toward fan threshold",
    "warning",
  );

  if (exhaustTemps.length > 0) {
    tryPredict(
      "exhaust-temp-trend",
      "Exhaust Temp",
      exhaustTemps,
      config.exhaustTempHigh,
      "rising",
      (eta) =>
        eta !== null
          ? `Exhaust temp critical in ~${Math.round(eta)}s`
          : "Exhaust temp rising toward limit",
      "critical",
    );
  }

  if (batteryVs.length > 0) {
    tryPredict(
      "battery-trend",
      "Battery",
      batteryVs,
      config.batteryLowV,
      "falling",
      (eta) =>
        eta !== null
          ? `Battery will reach low threshold in ~${Math.round(eta)}s`
          : "Battery voltage trending down",
      "warning",
    );
  }

  tryPredict(
    "rpm-trend",
    "RPM",
    rpms,
    config.rpmLimit,
    "rising",
    (eta) =>
      eta !== null
        ? `RPM approaching limit in ~${Math.round(eta)}s`
        : "RPM trending toward redline",
    "info",
  );

  // ── Recommendations ────────────────────────────────────────
  const recommendations: DiagRecommendation[] = [];

  // Engine approaching fan threshold (> 80%)
  if (engineH < 80 && config.autoFanEnabled) {
    recommendations.push({
      id: "rec-fan-on",
      command: "AUTONOMY:FAN_ON",
      rationale: `Engine at ${engineTemp.toFixed(0)}°C — activate cooling fan proactively`,
      urgency: engineH < 50 ? "high" : "medium",
    });
  }

  // Ambient air above 30C while fan is off
  if (config.autoFanEnabled && frame.air_temp > 30 && frame.fan_active !== true) {
    recommendations.push({
      id: "rec-fan-on-air-temp",
      command: "AUTONOMY:FAN_ON",
      rationale: `Air temp at ${frame.air_temp.toFixed(1)}°C — turn fan on for additional cooling`,
      urgency: frame.air_temp > 35 ? "high" : "medium",
    });
  }

  // Exhaust nearing limit
  if (exhaustTemp !== undefined) {
    const exhaustPct = exhaustTemp / config.exhaustTempHigh;
    if (exhaustPct > 0.85) {
      recommendations.push({
        id: "rec-throttle-scale",
        command: "AUTONOMY:THROTTLE_SCALE:0.90",
        rationale: `Exhaust at ${exhaustTemp.toFixed(0)}°C (${Math.round(exhaustPct * 100)}% of limit) — reduce load`,
        urgency: exhaustPct > 0.95 ? "high" : "medium",
      });
    }
  }

  // Battery approaching low threshold (within 0.7V)
  if (batteryV !== undefined && batteryV < config.batteryLowV + 0.7) {
    recommendations.push({
      id: "rec-load-shed",
      command: "AUTONOMY:LOAD_SHED",
      rationale: `Battery at ${batteryV.toFixed(2)} V — shed non-critical loads`,
      urgency: batteryV < config.batteryLowV + 0.2 ? "high" : "low",
    });
  }

  // RPM trend toward limit
  if (rpmH < 60 && rpms.length >= 10 && trendSlope(rpms) > 0) {
    recommendations.push({
      id: "rec-shift-up",
      command: "AUTONOMY:SHIFT_UP",
      rationale: `RPM at ${frame.rpm.toLocaleString()} and rising — recommend upshift`,
      urgency: rpmH < 30 ? "high" : "medium",
    });
  }

  // CAN errors present
  if (canErrors > 0) {
    recommendations.push({
      id: "rec-throttle-limit",
      command: "AUTONOMY:THROTTLE_LIMIT:0.95",
      rationale: `${canErrors} CAN error${canErrors > 1 ? "s" : ""} detected — reduce electrical load`,
      urgency: canErrors > 5 ? "high" : "low",
    });
  }

  const result: DiagnosisResult = {
    healthPct,
    subsystems,
    predictions,
    recommendations,
    updatedAt: Date.now(),
  };

  useDiagnosisStore.getState().setResult(result);
}


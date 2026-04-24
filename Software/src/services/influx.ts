import { invoke } from "@tauri-apps/api/core";
import type { InfluxStatus, InfluxTelemetryPoint } from "../types";

export async function getInfluxStatus(): Promise<InfluxStatus> {
  return invoke<InfluxStatus>("influx_status");
}

export async function fetchRecentTelemetry(
  windowSeconds = 900,
  everyMs = 1000,
  limit = 1200,
): Promise<InfluxTelemetryPoint[]> {
  const rows = await invoke<unknown[]>("influx_query_recent", {
    windowSeconds,
    everyMs,
    limit,
  });

  return rows
    .map(normalizeTelemetryPoint)
    .filter((point): point is InfluxTelemetryPoint => point != null)
    .sort((a, b) => a.ts - b.ts);
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toTimestampMs(value: unknown): number | null {
  const numeric = toFiniteNumber(value);
  if (numeric != null) {
    // Accept seconds or milliseconds epoch.
    return numeric < 1_000_000_000_000 ? Math.round(numeric * 1000) : Math.round(numeric);
  }

  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  }

  return null;
}

function normalizeTelemetryPoint(row: unknown): InfluxTelemetryPoint | null {
  if (!row || typeof row !== "object") return null;
  const source = row as Record<string, unknown>;

  const ts =
    toTimestampMs(source.ts) ??
    toTimestampMs(source.timestamp) ??
    toTimestampMs(source._time) ??
    toTimestampMs(source.time);

  if (ts == null) return null;

  return {
    ts,
    air_temp: toFiniteNumber(source.air_temp ?? source.airTemp),
    air_quality: toFiniteNumber(source.air_quality ?? source.airQuality),
    pressure: toFiniteNumber(source.pressure),
    g_lat: toFiniteNumber(source.g_lat ?? source.gLat),
    g_lon: toFiniteNumber(source.g_lon ?? source.gLon),
    g_vert: toFiniteNumber(source.g_vert ?? source.gVert),
    throttle: toFiniteNumber(source.throttle),
    brake: toFiniteNumber(source.brake),
    rpm: toFiniteNumber(source.rpm),
  };
}

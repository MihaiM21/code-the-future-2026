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
  return invoke<InfluxTelemetryPoint[]>("influx_query_recent", {
    windowSeconds,
    everyMs,
    limit,
  });
}

export interface TelemetryFrame {
  ts: number;
  // Powertrain
  rpm: number;
  speed: number;        // km/h
  throttle: number;     // 0–100 %
  brake: number;        // 0–100 %
  gear: number;         // -1=R, 0=N, 1-8
  // Temperatures
  temp_engine: number;  // °C
  temp_water: number;
  temp_oil: number;
  temp_ambient: number;
  // Electrical
  battery_voltage: number;   // V
  battery_current: number;   // A
  battery_fault: boolean;
  // Fuel
  fuel_level: number;   // %
  // Lap
  lap_time: number;     // ms
  lap_number: number;
  // Inertia
  g_lat: number;        // G
  g_lon: number;
  g_vert: number;
  // System
  can_errors: number;
  autonomy_level: number;  // 0-3
  fan_active: boolean;
  drs_active: boolean;
  alerts: AlertEntry[];
}

export interface AlertEntry {
  id: string;
  ts: number;
  severity: "info" | "warning" | "critical";
  message: string;
  system: string;
}

export type Page = "dashboard" | "safety" | "can" | "laps" | "settings";

export interface SerialConfig {
  port: string;
  baud: number;
  connected: boolean;
}

export interface SerialPortInfo {
  portName: string;
  displayName: string;
  manufacturer: string | null;
  product: string | null;
  serialNumber: string | null;
  vid: number | null;
  pid: number | null;
  isUsb: boolean;
  isLikelyEsp: boolean;
}

export interface TelemetryFrame {
  ts: number;
  // Environmental
  air_temp: number;     // °C
  air_quality: number;  // AQI or ppm
  pressure: number;     // hPa or similar
  // IMU (MPU6050)
  g_lat: number;        // G (lateral acceleration)
  g_lon: number;        // G (longitudinal acceleration)
  g_vert: number;       // G (vertical acceleration)
  // Control inputs (binary)
  throttle: number;     // 0 or 1
  brake: number;        // 0 or 1
  // Engine
  rpm: number;
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

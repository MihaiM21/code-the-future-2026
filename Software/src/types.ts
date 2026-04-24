export interface TelemetryFrame {
  ts: number;
  // Environmental
  air_temp: number;     // °C
  air_quality: number;  // AQI or ppm
  pressure: number;     // hPa or similar
  engine_temp?: number;  // °C, optional if firmware provides it
  coolant_temp?: number; // °C, optional if firmware provides it
  exhaust_temp?: number; // °C, optional if firmware provides it
  battery_v?: number;    // V, optional if firmware provides it
  // IMU (MPU6050)
  g_lat: number;        // G (lateral acceleration)
  g_lon: number;        // G (longitudinal acceleration)
  g_vert: number;       // G (vertical acceleration)
  // Control inputs (binary)
  throttle: number;     // 0 or 1
  brake: number;        // 0 or 1
  // Engine
  rpm: number;
  // Optional decoded status and diagnostics
  can_errors?: number;
  fan_active?: boolean;
  drs_active?: boolean;
  alerts?: AlertEntry[];
}

export interface AlertEntry {
  id: string;
  ts: number;
  severity: "info" | "warning" | "critical";
  message: string;
  system: string;
}

export type AutonomyLevel = 1 | 2 | 3 | 4;
export type AutonomyActionStatus = "pending" | "approved" | "sent" | "rejected" | "blocked";
export type AutonomyDomain = "safety" | "performance";

export interface AutonomyAction {
  id: string;
  ruleId: string;
  ts: number;
  level: AutonomyLevel;
  domain: AutonomyDomain;
  severity: AlertEntry["severity"];
  title: string;
  rationale: string;
  trigger: string;
  suggestedCommands: string[];
  command: string;
  requiresApproval: boolean;
  status: AutonomyActionStatus;
}

export interface PersistedAutonomyCommand {
  id: string;
  rule_id: string;
  ts: number;
  level: number;
  domain: string;
  severity: AlertEntry["severity"];
  title: string;
  rationale: string;
  trigger: string;
  suggested_commands: string[];
  command: string;
  requires_approval: boolean;
  status: AutonomyActionStatus;
  created_by_user_id: number | null;
}

export interface AutonomyCatalogCommand {
  id: number;
  command: string;
  source: string;
  created_by_user_id: number | null;
}

export type Page = "dashboard" | "safety" | "can" | "laps" | "autonomy" | "settings";

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

export interface InfluxStatus {
  enabled: boolean;
  url: string | null;
  org: string | null;
  bucket: string | null;
  measurement: string | null;
  lastWriteError: string | null;
  lastWriteSuccess: number | null;
}

export interface InfluxTelemetryPoint {
  ts: number;
  air_temp: number | null;
  air_quality: number | null;
  pressure: number | null;
  g_lat: number | null;
  g_lon: number | null;
  g_vert: number | null;
  throttle: number | null;
  brake: number | null;
  rpm: number | null;
}

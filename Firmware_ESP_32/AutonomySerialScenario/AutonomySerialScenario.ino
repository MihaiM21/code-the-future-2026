// AutonomySerialScenario.ino
// ESP32 test sender for APEX Pitwall autonomy scenarios.
//
// What it does:
// - Sends one JSON telemetry frame every 100 ms (10 Hz)
// - Cycles through scenarios that trigger each autonomy rule
// - Includes recovery phases so hysteresis reset conditions are met
// - Prints inbound commands from the app to Serial so you can verify reactions
//
// Upload target: ESP32
// Serial settings: 115200 baud, newline line endings in Serial Monitor

#include <Arduino.h>

enum Scenario {
  BASELINE = 0,
  HIGH_TEMP,
  COOLING_RECOVERY,
  HIGH_EXHAUST,
  EXHAUST_RECOVERY,
  LOW_BATTERY,
  BATTERY_RECOVERY,
  HIGH_RPM,
  RPM_RECOVERY,
  SCENARIO_COUNT
};

const uint32_t FRAME_PERIOD_MS = 100;     // 10 Hz
const uint32_t PHASE_DURATION_MS = 8000;  // 8 seconds per phase

uint32_t lastFrameMs = 0;
uint32_t phaseStartMs = 0;
Scenario currentScenario = BASELINE;

String scenarioName(Scenario s) {
  switch (s) {
    case BASELINE: return "baseline";
    case HIGH_TEMP: return "high_temp";
    case COOLING_RECOVERY: return "cooling_recovery";
    case HIGH_EXHAUST: return "high_exhaust";
    case EXHAUST_RECOVERY: return "exhaust_recovery";
    case LOW_BATTERY: return "low_battery";
    case BATTERY_RECOVERY: return "battery_recovery";
    case HIGH_RPM: return "high_rpm";
    case RPM_RECOVERY: return "rpm_recovery";
    default: return "unknown";
  }
}

void advanceScenarioIfNeeded(uint32_t nowMs) {
  if (nowMs - phaseStartMs < PHASE_DURATION_MS) {
    return;
  }

  phaseStartMs = nowMs;
  currentScenario = static_cast<Scenario>((static_cast<int>(currentScenario) + 1) % SCENARIO_COUNT);

  Serial.print("# phase -> ");
  Serial.println(scenarioName(currentScenario));
}

void emitTelemetryFrame(uint32_t nowMs) {
  // Baseline values (safe/normal)
  float airTemp = 31.0f;
  float engineTemp = 88.0f;
  float exhaustTemp = 680.0f;
  float batteryV = 12.6f;
  int rpm = 4200;
  int throttle = 28;
  int brake = 0;

  float airQuality = 52.0f;
  float pressure = 1012.2f;
  float gLat = 0.18f;
  float gLon = 0.05f;
  float gVert = 1.01f;

  // Scenario-specific overrides to trigger app rules.
  switch (currentScenario) {
    case BASELINE:
      break;

    case HIGH_TEMP:
      // Triggers cooling-response at fanThreshold (default 95 C).
      engineTemp = 102.0f;
      airTemp = 46.0f;
      throttle = 36;
      rpm = 5100;
      break;

    case COOLING_RECOVERY:
      // Drops below 95 - 1.5 to clear cooling rule hysteresis.
      engineTemp = 92.0f;
      airTemp = 34.0f;
      throttle = 22;
      rpm = 4300;
      break;

    case HIGH_EXHAUST:
      // Triggers exhaust-cleanout at exhaustTempHigh (default 760 C).
      exhaustTemp = 810.0f;
      throttle = 48;
      rpm = 5600;
      break;

    case EXHAUST_RECOVERY:
      // Drops below 760 - 20 to clear exhaust rule hysteresis.
      exhaustTemp = 730.0f;
      throttle = 24;
      rpm = 4500;
      break;

    case LOW_BATTERY:
      // Triggers battery-protection at batteryLowV (default 11.5 V).
      batteryV = 11.1f;
      throttle = 20;
      rpm = 3900;
      break;

    case BATTERY_RECOVERY:
      // Rises above 11.5 + 0.2 to clear battery rule hysteresis.
      batteryV = 11.9f;
      throttle = 26;
      rpm = 4300;
      break;

    case HIGH_RPM:
      // Triggers rpm-advisory at rpmLimit (default 9000 rpm).
      rpm = 9800;
      throttle = 82;
      brake = 0;
      break;

    case RPM_RECOVERY:
      // Drops below 9000 - 250 to clear rpm rule hysteresis.
      rpm = 8600;
      throttle = 44;
      brake = 0;
      break;

    default:
      break;
  }

  // Include optional fields used by autonomy logic:
  // engine_temp, exhaust_temp, battery_v
  // Keep line-delimited JSON so the app can parse one frame per line.
  char json[512];
  snprintf(
    json,
    sizeof(json),
    "{\"ts\":%lu,\"air_temp\":%.2f,\"air_quality\":%.2f,\"pressure\":%.2f,\"g_lat\":%.3f,\"g_lon\":%.3f,\"g_vert\":%.3f,\"throttle\":%d,\"brake\":%d,\"rpm\":%d,\"engine_temp\":%.2f,\"exhaust_temp\":%.2f,\"battery_v\":%.2f,\"fan_active\":false,\"drs_active\":false}",
    static_cast<unsigned long>(nowMs),
    airTemp,
    airQuality,
    pressure,
    gLat,
    gLon,
    gVert,
    throttle,
    brake,
    rpm,
    engineTemp,
    exhaustTemp,
    batteryV
  );

  Serial.println(json);
}

void printIncomingCommands() {
  while (Serial.available() > 0) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    if (cmd.length() == 0) {
      continue;
    }

    Serial.print("# app_cmd <- ");
    Serial.println(cmd);
  }
}

void setup() {
  Serial.begin(115200);
  delay(1200);

  phaseStartMs = millis();
  lastFrameMs = 0;

  Serial.println("# AutonomySerialScenario started");
  Serial.println("# Emits telemetry JSON at 10 Hz");
  Serial.println("# Scenario loop: baseline -> high_temp -> cooling_recovery -> high_exhaust -> exhaust_recovery -> low_battery -> battery_recovery -> high_rpm -> rpm_recovery");
}

void loop() {
  const uint32_t nowMs = millis();

  advanceScenarioIfNeeded(nowMs);
  printIncomingCommands();

  if (nowMs - lastFrameMs >= FRAME_PERIOD_MS) {
    lastFrameMs = nowMs;
    emitTelemetryFrame(nowMs);
  }
}

import type { TelemetryFrame, AutonomyAction } from "../types";
import { useAlertStore, useAutonomyStore, useConfigStore } from "../store";
import { useAuthStore } from "../store/auth";
import { sendSerialCommand } from "./command";
import { saveAutonomyActionToDb } from "./autonomyDb";
import {
  BATTERY_PROTECTION_COMMANDS,
  COOLING_RECOVERY_COMMANDS,
  COOLING_RESPONSE_COMMANDS,
  EXHAUST_CLEANOUT_COMMANDS,
  RPM_ADVISORY_COMMANDS,
} from "./autonomyCatalog";

type CandidateRule = {
  action: AutonomyAction;
  autoSend: boolean;
};

const ruleCooldowns = new Map<string, number>();
const REARM_DELAY_MS = 15000;

let fanOnSent = false;

function makeId(ruleId: string): string {
  return `${ruleId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildAction(params: Omit<AutonomyAction, "id" | "status" | "requiresApproval"> & { requiresApproval: boolean }): AutonomyAction {
  return {
    id: makeId(params.ruleId),
    ...params,
    command: pickRandom(params.suggestedCommands),
    status: "pending",
    requiresApproval: params.requiresApproval,
  };
}

function severityForDelta(delta: number): AutonomyAction["severity"] {
  return delta > 10 ? "critical" : delta > 5 ? "warning" : "info";
}

function canRearm(ruleId: string): boolean {
  const lastTriggeredAt = ruleCooldowns.get(ruleId);
  return lastTriggeredAt === undefined || Date.now() - lastTriggeredAt >= REARM_DELAY_MS;
}

function markRuleTriggered(ruleId: string): void {
  ruleCooldowns.set(ruleId, Date.now());
}

function clearRule(ruleId: string): void {
  ruleCooldowns.delete(ruleId);
}

function recordCandidate(candidate: CandidateRule): void {
  const autonomyStore = useAutonomyStore.getState();
  autonomyStore.addAction(candidate.action);
  void persistAction(candidate.action);

  if (candidate.autoSend) {
    void dispatchAutonomyAction(candidate.action.id, true);
  }
}

async function persistAction(action: AutonomyAction): Promise<void> {
  try {
    await saveAutonomyActionToDb(action);
  } catch (error) {
    useAlertStore.getState().addAlert({
      id: makeId("autonomy-db-save-failed"),
      ts: Date.now(),
      severity: "warning",
      system: "Autonomy",
      message: `Failed to persist autonomy command: ${String(error)}`,
    });
  }
}

function queuePersist(actionId: string): void {
  const action = useAutonomyStore.getState().actions.find((item) => item.id === actionId);
  if (action) {
    void persistAction(action);
  }
}

async function dispatchAutonomyAction(actionId: string, autoApproved = false): Promise<void> {
  const autonomyStore = useAutonomyStore.getState();
  const action = autonomyStore.actions.find((item) => item.id === actionId);
  if (!action) return;

  if (!useAuthStore.getState().isAuthorized) {
    autonomyStore.updateAction(actionId, { status: "blocked" });
    useAlertStore.getState().addAlert({
      id: makeId("autonomy-blocked"),
      ts: Date.now(),
      severity: "critical",
      system: "Autonomy",
      message: `Blocked ${action.title.toLowerCase()} because the current user is not authorized.`,
    });
    return;
  }

  const command = action.command.trim() || action.suggestedCommands[0] || "";
  if (!command) {
    autonomyStore.updateAction(actionId, { status: "blocked" });
    return;
  }

  autonomyStore.updateAction(actionId, {
    command,
    status: autoApproved ? "approved" : "approved",
  });
  queuePersist(actionId);

  try {
    await sendSerialCommand(command);
    if (command.includes("FAN_ON")) fanOnSent = true;
    if (command.includes("FAN_OFF")) fanOnSent = false;
    autonomyStore.updateAction(actionId, { status: "sent", command });
    queuePersist(actionId);
    useAlertStore.getState().addAlert({
      id: makeId("autonomy-sent"),
      ts: Date.now(),
      severity: action.severity,
      system: "Autonomy",
      message: `${autoApproved ? "Auto-sent" : "Sent"} ${action.title.toLowerCase()}: ${command}`,
    });
  } catch (error) {
    autonomyStore.updateAction(actionId, { status: "blocked" });
    queuePersist(actionId);
    useAlertStore.getState().addAlert({
      id: makeId("autonomy-send-failed"),
      ts: Date.now(),
      severity: "critical",
      system: "Autonomy",
      message: `Failed to send ${action.title.toLowerCase()}: ${String(error)}`,
    });
  }
}

export function evaluateAutonomyFrame(frame: TelemetryFrame): void {
  const config = useConfigStore.getState();
  const candidates: CandidateRule[] = [];

  const engineTemp = frame.engine_temp ?? frame.coolant_temp ?? frame.air_temp;
  const airTemp = frame.air_temp;
  const exhaustTemp = frame.exhaust_temp;

  if (config.autoFanEnabled) {
    const ruleId = "cooling-response";
    const active = typeof engineTemp === "number" && engineTemp >= config.fanThreshold && !fanOnSent && frame.fan_active !== true;

    if (active) {
      if (canRearm(ruleId)) {
        const commands = [...COOLING_RESPONSE_COMMANDS];
        candidates.push({
          action: buildAction({
            ruleId,
            ts: frame.ts,
            level: config.autonomyLevel,
            domain: "safety",
            severity: severityForDelta(engineTemp - config.fanThreshold),
            title: "Cooling response",
            rationale: `Temperature ${engineTemp.toFixed(1)}°C is above the ${config.fanThreshold.toFixed(1)}°C threshold.`,
            trigger: `engine temperature ${engineTemp.toFixed(1)}°C`,
            suggestedCommands: commands,
            command: commands[0],
            requiresApproval: config.autonomyLevel < 3,
          }),
          autoSend: config.autonomyLevel >= 3,
        });
        markRuleTriggered(ruleId);
      }
    } else if (engineTemp <= config.fanThreshold - 1.5) {
      clearRule(ruleId);
    }

    const fanOffRuleId = "cooling-recovery";
    const fanActive = frame.fan_active === true;
    const tempBelowThreshold =
      typeof engineTemp === "number" && engineTemp <= config.fanThreshold - 1.5;

    if (fanActive && tempBelowThreshold) {
      if (canRearm(fanOffRuleId)) {
        const commands = [...COOLING_RECOVERY_COMMANDS];
        candidates.push({
          action: buildAction({
            ruleId: fanOffRuleId,
            ts: frame.ts,
            level: config.autonomyLevel,
            domain: "safety",
            severity: "info",
            title: "Cooling recovery",
            rationale: `Temperature ${engineTemp.toFixed(1)}°C is below the ${(config.fanThreshold - 1.5).toFixed(1)}°C recovery threshold. Turn the fan off.`,
            trigger: `engine temperature ${engineTemp.toFixed(1)}°C`,
            suggestedCommands: commands,
            command: commands[0],
            requiresApproval: config.autonomyLevel < 3,
          }),
          autoSend: config.autonomyLevel >= 3,
        });
        markRuleTriggered(fanOffRuleId);
      }
    } else if (!fanActive) {
      fanOnSent = false;
      clearRule(fanOffRuleId);
    }

    const airTempRuleId = "ambient-air-fan-suggestion";
    const hotAmbientAir = typeof airTemp === "number" && airTemp > 30 && !fanOnSent && frame.fan_active !== true;

    if (hotAmbientAir) {
      if (canRearm(airTempRuleId)) {
        const commands = ["AUTONOMY:FAN_ON"];
        candidates.push({
          action: buildAction({
            ruleId: airTempRuleId,
            ts: frame.ts,
            level: config.autonomyLevel,
            domain: "safety",
            severity: severityForDelta(airTemp - 30),
            title: "Ambient cooling suggestion",
            rationale: `Air temperature ${airTemp.toFixed(1)}°C is above 30.0°C. Turn the fan on to improve cooling.`,
            trigger: `air temperature ${airTemp.toFixed(1)}°C`,
            suggestedCommands: commands,
            command: commands[0],
            requiresApproval: config.autonomyLevel < 3,
          }),
          autoSend: config.autonomyLevel >= 3,
        });
        markRuleTriggered(airTempRuleId);
      }
    } else if (typeof airTemp === "number" && airTemp <= 28) {
      clearRule(airTempRuleId);
    }
  }

  if (config.autoExhaustCleanupEnabled && typeof exhaustTemp === "number") {
    const ruleId = "exhaust-cleanout";
    const active = exhaustTemp >= config.exhaustTempHigh;

    if (active) {
      if (canRearm(ruleId)) {
        const commands = [...EXHAUST_CLEANOUT_COMMANDS];
        candidates.push({
          action: buildAction({
            ruleId,
            ts: frame.ts,
            level: config.autonomyLevel,
            domain: "performance",
            severity: severityForDelta(exhaustTemp - config.exhaustTempHigh),
            title: "Exhaust clean-out",
            rationale: `Exhaust temperature ${exhaustTemp.toFixed(1)}°C is above the ${config.exhaustTempHigh.toFixed(1)}°C clean-out target.`,
            trigger: `exhaust temperature ${exhaustTemp.toFixed(1)}°C`,
            suggestedCommands: commands,
            command: commands[0],
            requiresApproval: config.autonomyLevel < 4,
          }),
          autoSend: config.autonomyLevel >= 4,
        });
        markRuleTriggered(ruleId);
      }
    } else if (exhaustTemp <= config.exhaustTempHigh - 20) {
      clearRule(ruleId);
    }
  }

  if (config.autoBatteryAlertEnabled && typeof frame.battery_v === "number") {
    const ruleId = "battery-protection";
    const active = frame.battery_v <= config.batteryLowV;

    if (active) {
      if (canRearm(ruleId)) {
        const commands = [...BATTERY_PROTECTION_COMMANDS];
        candidates.push({
          action: buildAction({
            ruleId,
            ts: frame.ts,
            level: config.autonomyLevel,
            domain: "safety",
            severity: severityForDelta(config.batteryLowV - frame.battery_v),
            title: "Battery protection",
            rationale: `Battery voltage ${frame.battery_v.toFixed(2)}V is below the ${config.batteryLowV.toFixed(1)}V threshold.`,
            trigger: `battery voltage ${frame.battery_v.toFixed(2)}V`,
            suggestedCommands: commands,
            command: commands[0],
            requiresApproval: config.autonomyLevel < 3,
          }),
          autoSend: config.autonomyLevel >= 3,
        });
        markRuleTriggered(ruleId);
      }
    } else if (frame.battery_v >= config.batteryLowV + 0.2) {
      clearRule(ruleId);
    }
  }

  if (config.autoRpmAdvisoryEnabled && typeof frame.rpm === "number" && frame.rpm >= config.rpmLimit) {
    const ruleId = "rpm-advisory";
    if (canRearm(ruleId)) {
      const commands = [...RPM_ADVISORY_COMMANDS];
      candidates.push({
        action: buildAction({
          ruleId,
          ts: frame.ts,
          level: config.autonomyLevel,
          domain: "performance",
          severity: severityForDelta(frame.rpm - config.rpmLimit),
          title: "RPM limit advisory",
          rationale: `Engine speed ${frame.rpm.toLocaleString()} rpm is above the ${config.rpmLimit.toLocaleString()} rpm limit.`,
          trigger: `rpm ${frame.rpm.toLocaleString()}`,
          suggestedCommands: commands,
          command: commands[0],
          requiresApproval: config.autonomyLevel < 4,
        }),
        autoSend: config.autonomyLevel >= 4,
      });
      markRuleTriggered(ruleId);
    }
  } else if (frame.rpm <= config.rpmLimit - 250) {
    clearRule("rpm-advisory");
  }

  candidates.forEach(recordCandidate);
}

export async function approveAutonomyAction(actionId: string): Promise<void> {
  await dispatchAutonomyAction(actionId, false);
}

export function rejectAutonomyAction(actionId: string): void {
  useAutonomyStore.getState().updateAction(actionId, { status: "rejected" });
  queuePersist(actionId);
  useAlertStore.getState().addAlert({
    id: makeId("autonomy-rejected"),
    ts: Date.now(),
    severity: "info",
    system: "Autonomy",
    message: "An autonomy suggestion was rejected by an authorized user.",
  });
}

export function updateAutonomyActionCommand(actionId: string, command: string): void {
  useAutonomyStore.getState().updateAction(actionId, { command });
  queuePersist(actionId);
}
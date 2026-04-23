import type { TelemetryFrame, AutonomyAction } from "../types";
import { useAlertStore, useAutonomyStore, useConfigStore } from "../store";
import { useAuthStore } from "../store/auth";
import { sendSerialCommand } from "./command";

type CandidateRule = {
  action: AutonomyAction;
  autoSend: boolean;
};

const ruleCooldowns = new Map<string, number>();
const REARM_DELAY_MS = 15000;

function makeId(ruleId: string): string {
  return `${ruleId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildAction(params: Omit<AutonomyAction, "id" | "status" | "requiresApproval"> & { requiresApproval: boolean }): AutonomyAction {
  return {
    id: makeId(params.ruleId),
    ...params,
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

  if (candidate.autoSend) {
    void dispatchAutonomyAction(candidate.action.id, true);
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

  try {
    await sendSerialCommand(command);
    autonomyStore.updateAction(actionId, { status: "sent", command });
    useAlertStore.getState().addAlert({
      id: makeId("autonomy-sent"),
      ts: Date.now(),
      severity: action.severity,
      system: "Autonomy",
      message: `${autoApproved ? "Auto-sent" : "Sent"} ${action.title.toLowerCase()}: ${command}`,
    });
  } catch (error) {
    autonomyStore.updateAction(actionId, { status: "blocked" });
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
  const exhaustTemp = frame.exhaust_temp;

  if (config.autoFanEnabled) {
    const ruleId = "cooling-response";
    const active = typeof engineTemp === "number" && engineTemp >= config.fanThreshold;

    if (active) {
      if (canRearm(ruleId)) {
        const commands = ["AUTONOMY:FAN_ON", "AUTONOMY:AERO_OPEN", "AUTONOMY:THROTTLE_SCALE:0.90"];
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
  }

  if (config.autoExhaustCleanupEnabled && typeof exhaustTemp === "number") {
    const ruleId = "exhaust-cleanout";
    const active = exhaustTemp >= config.exhaustTempHigh;

    if (active) {
      if (canRearm(ruleId)) {
        const commands = ["AUTONOMY:THROTTLE_BOOST:1.10", "AUTONOMY:ENGINE_CLEAN_BURN", "AUTONOMY:THROTTLE_SCALE:1.05"];
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
        const commands = ["AUTONOMY:LOAD_SHED", "AUTONOMY:SHUTDOWN_NONCRITICAL", "AUTONOMY:REDUCE_AERO_LOAD"];
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

  if (typeof frame.rpm === "number" && frame.rpm >= config.rpmLimit) {
    const ruleId = "rpm-advisory";
    if (canRearm(ruleId)) {
      const commands = ["AUTONOMY:SHIFT_UP", "AUTONOMY:THROTTLE_LIMIT:0.95", "AUTONOMY:ENGINE_SAFETY_HOLD"];
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
}
import { invoke } from "@tauri-apps/api/core";
import type { AutonomyAction, AutonomyCatalogCommand, PersistedAutonomyCommand } from "../types";
import { useAuthStore } from "../store/auth";

function mapActionToPersisted(action: AutonomyAction): PersistedAutonomyCommand {
  return {
    id: action.id,
    rule_id: action.ruleId,
    ts: action.ts,
    level: action.level,
    domain: action.domain,
    severity: action.severity,
    title: action.title,
    rationale: action.rationale,
    trigger: action.trigger,
    suggested_commands: action.suggestedCommands,
    command: action.command,
    requires_approval: action.requiresApproval,
    status: action.status,
    created_by_user_id: useAuthStore.getState().user?.id ?? null,
  };
}

export async function saveAutonomyActionToDb(action: AutonomyAction): Promise<void> {
  await invoke("save_autonomy_command", {
    command: mapActionToPersisted(action),
  });
}

export async function listPersistedAutonomyCommands(): Promise<PersistedAutonomyCommand[]> {
  const userId = getUserId();

  return invoke<PersistedAutonomyCommand[]>("list_autonomy_commands", {
    requestedByUserId: userId,
  });
}

export async function deletePersistedAutonomyCommand(id: string): Promise<boolean> {
  const userId = getUserId();

  return invoke<boolean>("delete_autonomy_command", {
    requestedByUserId: userId,
    id,
  });
}

export async function upsertAutonomyCatalogCommands(commands: string[], source: "default" | "manual"): Promise<void> {
  if (commands.length === 0) return;

  const userId = getUserId();
  await invoke("upsert_autonomy_catalog_commands", {
    requestedByUserId: userId,
    commands,
    source,
  });
}

export async function listAutonomyCatalogCommands(): Promise<AutonomyCatalogCommand[]> {
  const userId = getUserId();
  return invoke<AutonomyCatalogCommand[]>("list_autonomy_catalog_commands", {
    requestedByUserId: userId,
  });
}

export async function deleteAutonomyCatalogCommand(id: number): Promise<boolean> {
  const userId = getUserId();
  return invoke<boolean>("delete_autonomy_catalog_command", {
    requestedByUserId: userId,
    id,
  });
}

function getUserId(): number {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) {
    throw new Error("No signed-in user found.");
  }

  return userId;
}

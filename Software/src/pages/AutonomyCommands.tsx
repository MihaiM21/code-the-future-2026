import { useEffect, useMemo, useState } from "react";
import { Database, Lock, Plus, RefreshCw, Send, Trash2 } from "lucide-react";
import type { AutonomyCatalogCommand, PersistedAutonomyCommand } from "../types";
import { useAuthStore } from "../store/auth";
import { useAlertStore, useAutonomyStore } from "../store";
import {
  deleteAutonomyCatalogCommand,
  deletePersistedAutonomyCommand,
  listAutonomyCatalogCommands,
  listPersistedAutonomyCommands,
  upsertAutonomyCatalogCommands,
} from "../services/autonomyDb";
import { sendCommand } from "../services/serial";
import { AUTONOMY_DEFAULT_COMMANDS } from "../services/autonomyCatalog";

const severityColor: Record<PersistedAutonomyCommand["severity"], string> = {
  info: "var(--accent-cyan)",
  warning: "var(--accent-amber)",
  critical: "var(--accent-red)",
};

export default function AutonomyCommands() {
  const isAuthorized = useAuthStore((s) => s.isAuthorized);
  const removeAction = useAutonomyStore((s) => s.removeAction);
  const [persistedActions, setPersistedActions] = useState<PersistedAutonomyCommand[]>([]);
  const [catalogCommands, setCatalogCommands] = useState<AutonomyCatalogCommand[]>([]);
  const [newCommand, setNewCommand] = useState("");
  const [loading, setLoading] = useState(false);
  const [sendingCommand, setSendingCommand] = useState("");
  const [error, setError] = useState("");

  const statusCounts = useMemo(() => {
    return persistedActions.reduce<Record<string, number>>((acc, command) => {
      acc[command.status] = (acc[command.status] ?? 0) + 1;
      return acc;
    }, {});
  }, [persistedActions]);

  const refreshData = async () => {
    if (!isAuthorized) return;

    setLoading(true);
    setError("");
    try {
      await upsertAutonomyCatalogCommands(AUTONOMY_DEFAULT_COMMANDS, "default");
      const [actions, commands] = await Promise.all([
        listPersistedAutonomyCommands(),
        listAutonomyCatalogCommands(),
      ]);
      setPersistedActions(actions);
      setCatalogCommands(commands);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshData();
  }, [isAuthorized]);

  const handleSendCommand = async (command: string) => {
    const normalized = command.trim();
    if (!normalized) {
      setError("Please enter a command before sending.");
      return;
    }

    setSendingCommand(normalized);
    setError("");

    try {
      await sendCommand(normalized);
      useAlertStore.getState().addAlert({
        id: `autonomy-manual-send-${Date.now()}`,
        ts: Date.now(),
        severity: "info",
        system: "Autonomy",
        message: `Sent command to ESP: ${normalized}`,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      useAlertStore.getState().addAlert({
        id: `autonomy-manual-send-failed-${Date.now()}`,
        ts: Date.now(),
        severity: "critical",
        system: "Autonomy",
        message: `Failed to send command to ESP: ${String(e)}`,
      });
    } finally {
      setSendingCommand("");
    }
  };

  const handleDelete = async (id: string) => {
    if (!isAuthorized) return;
    const shouldDelete = confirm("Delete this autonomy command from the database?");
    if (!shouldDelete) return;

    try {
      const deleted = await deletePersistedAutonomyCommand(id);
      if (!deleted) {
        setError("Command was not found in the database.");
        return;
      }

      setPersistedActions((prev) => prev.filter((item) => item.id !== id));
      removeAction(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleAddCatalogCommand = async () => {
    const normalized = newCommand.trim();
    if (!normalized) {
      setError("Please enter a command before adding.");
      return;
    }

    try {
      await upsertAutonomyCatalogCommands([normalized], "manual");
      setNewCommand("");
      await refreshData();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDeleteCatalogCommand = async (id: number) => {
    const shouldDelete = confirm("Delete this command from the command library?");
    if (!shouldDelete) return;

    try {
      const deleted = await deleteAutonomyCatalogCommand(id);
      if (!deleted) {
        setError("Catalog command was not found.");
        return;
      }

      setCatalogCommands((prev) => prev.filter((item) => item.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (!isAuthorized) {
    return (
      <div className="page-content h-full">
        <div className="card flex items-center gap-2 text-[var(--accent-amber)]">
          <Lock size={16} />
          Only Authorized Users can access persisted autonomy commands.
        </div>
      </div>
    );
  }

  return (
    <div className="page-content h-full">
      <div className="card h-197 mb-3.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="card-header-row">
              <Database size={16} style={{ color: "var(--accent-green)" }} />
              <h3>Command Library</h3>
            </div>
            <p className="mb-3 text-[0.82rem] text-[var(--text-secondary)]">
              Default commands from autonomy rules are seeded here. Add custom commands for operators to reuse, then send any entry directly to the ESP.
            </p>
          </div>
          <button className="btn btn-ghost shrink-0" onClick={() => void refreshData()} disabled={loading}>
            <RefreshCw size={14} className={loading ? "spin" : ""} />
            Refresh
          </button>
        </div>

        <div className="mb-3 flex flex-wrap gap-2">
          {Object.keys(statusCounts).length === 0 ? (
            <span className="badge uppercase" style={{ background: "rgba(255,255,255,0.05)", color: "var(--text-muted)" }}>
              No persisted autonomy actions yet
            </span>
          ) : (
            Object.entries(statusCounts).map(([status, count]) => (
              <span
                key={status}
                className="badge uppercase"
                style={{ background: "rgba(255,255,255,0.05)", color: "var(--text-muted)" }}
              >
                {status}: {count}
              </span>
            ))
          )}
        </div>

        <div className="flex flex-col gap-2 md:flex-row">
          <input
            type="text"
            value={newCommand}
            onChange={(e) => setNewCommand(e.target.value)}
            placeholder="AUTONOMY:YOUR_COMMAND"
            className="flex-1 rounded-[10px] border border-[var(--border)] bg-[#0d0d1a] px-3 py-2 text-[0.8rem] text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-cyan)]"
          />
          <button className="btn btn-primary" onClick={() => void handleAddCatalogCommand()}>
            <Plus size={14} /> Add Command
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => void handleSendCommand(newCommand)}
            disabled={sendingCommand === newCommand.trim() || !newCommand.trim()}
          >
            <Send size={14} />
            {sendingCommand === newCommand.trim() ? "Sending..." : "Send Now"}
          </button>
        </div>

        <div className="mt-3 flex max-h-150 flex-col gap-1.5 overflow-y-auto pr-1">
          {catalogCommands.length === 0 && (
            <div className="rounded-md border border-dashed border-[var(--border)] bg-[var(--bg-card)] px-3 py-4 text-center text-[0.8rem] text-[var(--text-muted)]">
              No command library entries yet.
            </div>
          )}

          {catalogCommands.map((item) => (
            <div key={item.id} className="flex items-center gap-2 rounded-[10px] border border-[var(--border)] bg-[var(--bg-card)] px-2.5 py-2">
              <span className="mono flex-1 text-[0.76rem] text-[var(--text-primary)]">{item.command}</span>
              <span className="badge uppercase" style={{ background: "rgba(255,255,255,0.05)", color: "var(--text-muted)" }}>
                {item.source}
              </span>
              <button
                className="btn btn-ghost"
                onClick={() => void handleSendCommand(item.command)}
                disabled={sendingCommand === item.command}
              >
                <Send size={13} />
                {sendingCommand === item.command ? "Sending..." : "Send"}
              </button>
              <button className="btn btn-danger" onClick={() => void handleDeleteCatalogCommand(item.id)}>
                <Trash2 size={13} /> Delete
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

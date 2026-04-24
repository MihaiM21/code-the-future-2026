import { useEffect, useRef, useState } from "react";
import { useLogStore } from "../store";
import { Trash2, PauseCircle, PlayCircle } from "lucide-react";

export default function SerialTerminal() {
  const logs = useLogStore((s) => s.logs);
  const clearLogs = useLogStore((s) => s.clearLogs);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (!paused) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, paused]);

  const visible = filter
    ? logs.filter((l) => l.text.toLowerCase().includes(filter.toLowerCase()))
    : logs;

  // logs are newest-first in the store; display oldest-first
  const ordered = [...visible].reverse();

  return (
    <div className="page-content flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-[0.65rem] font-bold tracking-[0.08em] text-[var(--text-muted)]">LINES</span>
            <span className="mono text-base font-bold text-[var(--text-primary)]">{logs.length}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[0.65rem] font-bold tracking-[0.08em] text-[var(--text-muted)]">ERRORS</span>
            <span className="mono text-base font-bold" style={{ color: "var(--accent-red)" }}>
              {logs.filter((l) => l.type === "error").length}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Filter..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-[8px] border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1.5 text-[0.82rem] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
          />
          <button
            onClick={() => setPaused((p) => !p)}
            className="flex items-center gap-1.5 rounded-[8px] border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1.5 text-[0.82rem] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            {paused ? <PlayCircle size={14} /> : <PauseCircle size={14} />}
            {paused ? "Resume" : "Pause"}
          </button>
          <button
            onClick={clearLogs}
            className="flex items-center gap-1.5 rounded-[8px] border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1.5 text-[0.82rem] font-semibold text-[var(--text-secondary)] hover:text-[var(--accent-red)] transition-colors"
          >
            <Trash2 size={14} />
            Clear
          </button>
        </div>
      </div>

      <div className="card mono min-h-0 flex-1 overflow-y-auto p-3 text-[0.78rem] leading-[1.6]" style={{ background: "var(--bg-surface)" }}>
        {ordered.length === 0 ? (
          <span className="text-[var(--text-muted)]">No data received. Connect to a serial port or start Demo mode.</span>
        ) : (
          ordered.map((entry) => {
            const ts = new Date(entry.timestamp).toISOString().substring(11, 23);
            const color =
              entry.type === "error"
                ? "var(--accent-red)"
                : entry.type === "info"
                ? "var(--accent-cyan)"
                : "var(--text-primary)";
            return (
              <div key={`${entry.timestamp}-${entry.text.slice(0, 8)}`} className="flex gap-2 hover:bg-white/[0.02] px-1 rounded">
                <span className="shrink-0 text-[var(--text-muted)]">{ts}</span>
                <span style={{ color }}>{entry.text}</span>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

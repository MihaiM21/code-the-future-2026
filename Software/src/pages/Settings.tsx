import { useState } from "react";
import { useSerialStore } from "../store";
import { listPorts, connectSerial, disconnectSerial, startDemo, stopDemo } from "../services/serial";
import { useTelemetryStore } from "../store";
import { RefreshCw, Plug, PlugZap, Play, Square, Terminal } from "lucide-react";

const BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600];

function formatUsbId(vid: number | null, pid: number | null): string {
  if (vid == null || pid == null) return "";
  return `VID:${vid.toString(16).padStart(4, "0").toUpperCase()} PID:${pid.toString(16).padStart(4, "0").toUpperCase()}`;
}

function buildPortLabel(
  portName: string,
  displayName: string,
  vid: number | null,
  pid: number | null,
  isLikelyEsp: boolean,
): string {
  const usbId = formatUsbId(vid, pid);
  const base = displayName || portName;
  const marked = isLikelyEsp ? `ESP? ${base}` : base;
  return usbId ? `${marked} [${usbId}]` : marked;
}

export default function Settings() {
  const { config, availablePorts, bytesPerSec, lastFrameAge, setConfig, setPorts } = useSerialStore();
  const history = useTelemetryStore((s) => s.history);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [rawView, setRawView] = useState(false);

  const isDemo = config.port === "DEMO";
  const espCandidates = availablePorts.filter((p) => p.isLikelyEsp);

  const handleScan = async () => {
    setError(null);
    setLoading(true);
    try {
      const ports = await listPorts();
      setPorts(ports);
      if (!config.connected && !config.port) {
        const espMatch = ports.find((p) => p.isLikelyEsp);
        if (espMatch) {
          setConfig({ port: espMatch.portName });
        }
      }
    } catch (e) {
      setError(`Port scan failed: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    setError(null);
    if (!config.port) { setError("Select a COM port first."); return; }
    setLoading(true);
    try {
      await connectSerial(config.port, config.baud);
    } catch (e) {
      setError(String(e));
    }
    setLoading(false);
  };

  const handleDisconnect = async () => {
    await disconnectSerial();
  };

  return (
    <div className="page-content">
      <div className="flex max-w-[680px] flex-col gap-3.5">
        {/* Connection panel */}
        <div className="card">
          <div className="card-header-row">
            <Plug size={16} style={{ color: "var(--accent-cyan)" }} />
            <h3>USB Serial Connection</h3>
          </div>

          <div className="mb-3.5 flex flex-col gap-1.5">
            <label className="text-[0.72rem] font-bold uppercase tracking-[0.07em] text-[var(--text-muted)]">COM Port</label>
            <div className="flex items-center gap-2">
              <select
                className="flex-1 cursor-pointer rounded-[10px] border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-cyan)] disabled:cursor-not-allowed disabled:opacity-50"
                value={config.port}
                onChange={(e) => setConfig({ port: e.target.value })}
                disabled={config.connected}
              >
                <option value="">— Select port —</option>
                {availablePorts.map((p) => (
                  <option key={p.portName} value={p.portName}>
                    {buildPortLabel(p.portName, p.displayName, p.vid, p.pid, p.isLikelyEsp)}
                  </option>
                ))}
              </select>
              <button className="btn btn-ghost" onClick={handleScan} disabled={config.connected || loading}>
                <RefreshCw size={14} className={loading ? "spin" : ""} /> Scan
              </button>
            </div>
            {availablePorts.length > 0 && (
              <p className="mb-3.5 mt-2 text-[0.85rem] leading-relaxed text-[var(--text-secondary)]">
                {espCandidates.length > 0
                  ? `ESP candidates: ${espCandidates.map((p) => p.portName).join(", ")}`
                  : "No obvious ESP device signature found in current ports."}
              </p>
            )}
          </div>

          <div className="mb-3.5 flex flex-col gap-1.5">
            <label className="text-[0.72rem] font-bold uppercase tracking-[0.07em] text-[var(--text-muted)]">Baud Rate</label>
            <select
              className="flex-1 cursor-pointer rounded-[10px] border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-cyan)] disabled:cursor-not-allowed disabled:opacity-50"
              value={config.baud}
              onChange={(e) => setConfig({ baud: +e.target.value })}
              disabled={config.connected}
            >
              {BAUD_RATES.map((b) => (
                <option key={b} value={b}>{b.toLocaleString()}</option>
              ))}
            </select>
          </div>

          {error && <div className="rounded-md border border-[#e639464d] bg-[var(--accent-red-dim)] px-3 py-2 text-[0.82rem] text-[var(--accent-red)]">{error}</div>}

          <div className="mt-1 flex gap-2.5">
            {!config.connected ? (
              <button className="btn btn-primary" onClick={handleConnect} disabled={loading || !config.port}>
                <PlugZap size={14} /> Connect
              </button>
            ) : (
              <button className="btn btn-danger" onClick={handleDisconnect}>
                <Square size={14} /> Disconnect
              </button>
            )}
          </div>
        </div>

        {/* Demo mode */}
        <div className="card">
          <div className="card-header-row">
            <Play size={16} style={{ color: "var(--accent-amber)" }} />
            <h3>Demo / Simulation Mode</h3>
          </div>
          <p className="mb-3.5 text-[0.85rem] leading-relaxed text-[var(--text-secondary)]">
            Simulate live telemetry without hardware — useful for testing the UI and autonomy logic.
          </p>
          <div className="mt-1 flex gap-2.5">
            {!isDemo ? (
              <button className="btn btn-primary" onClick={startDemo} disabled={config.connected && !isDemo}>
                <Play size={14} /> Start Demo
              </button>
            ) : (
              <button className="btn btn-danger" onClick={stopDemo}>
                <Square size={14} /> Stop Demo
              </button>
            )}
          </div>
        </div>

        {/* Connection health */}
        {config.connected && (
          <div className="card">
            <div className="card-header-row">
              <PlugZap size={16} style={{ color: "var(--accent-green)" }} />
              <h3>Connection Health</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-[0.65rem] font-bold tracking-[0.08em] text-[var(--text-muted)]">BYTES / SEC</span>
                <span className="mono text-[1.1rem] font-bold text-[var(--text-primary)]">{bytesPerSec}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[0.65rem] font-bold tracking-[0.08em] text-[var(--text-muted)]">LAST FRAME AGE</span>
                <span className={`mono text-[1.1rem] font-bold text-[var(--text-primary)] ${lastFrameAge > 2000 ? "text-crit" : "text-ok"}`}>
                  {lastFrameAge}ms
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[0.65rem] font-bold tracking-[0.08em] text-[var(--text-muted)]">FRAMES BUFFERED</span>
                <span className="mono text-[1.1rem] font-bold text-[var(--text-primary)]">{history.length}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[0.65rem] font-bold tracking-[0.08em] text-[var(--text-muted)]">STATUS</span>
                <span className={`text-[1.1rem] font-bold text-[var(--text-primary)] ${lastFrameAge > 2000 ? "text-crit" : "text-ok"}`}>
                  {lastFrameAge > 2000 ? "SIGNAL LOST" : "NOMINAL"}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Raw serial monitor */}
        {config.connected && (
          <div className="card">
            <div className="card-header-row">
              <Terminal size={16} style={{ color: "var(--accent-purple)" }} />
              <h3>Raw Frame Monitor</h3>
              <button
                className="btn btn-ghost"
                style={{ marginLeft: "auto", fontSize: "0.75rem", padding: "4px 10px" }}
                onClick={() => setRawView((v) => !v)}
              >
                {rawView ? "Hide" : "Show"}
              </button>
            </div>
            {rawView && (
              <div className="mono max-h-[220px] overflow-y-auto rounded-md bg-[#0d0d1a] p-2.5 text-[0.75rem] leading-relaxed text-[var(--text-secondary)]">
                {history.slice(-20).reverse().map((f, i) => (
                  <div key={i} className="flex gap-2.5">
                    <span className="shrink-0 text-[var(--text-muted)]">{new Date(f.ts).toLocaleTimeString()}</span>
                    {JSON.stringify({ rpm: f.rpm, thr: f.throttle, brk: f.brake })}
                  </div>
                ))}
                {history.length === 0 && <span style={{ color: "var(--text-muted)" }}>Waiting for frames...</span>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

import { useSerialStore, useDiagnosisStore } from "../store";
import { Wifi, WifiOff, Activity } from "lucide-react";
import { useTelemetryStore } from "../store";

interface Props {
  pageTitle: string;
}

function formatLapTime(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = Math.floor((ms % 1000) / 10);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(2, "0")}`;
}

export default function Header({ pageTitle }: Props) {
  const { config, lastFrameAge, bytesPerSec } = useSerialStore();
  const current = useTelemetryStore((s) => s.current);
  const diagResult = useDiagnosisStore((s) => s.result);

  const connected = config.connected;
  const signalLost = lastFrameAge > 2000 && connected;
  const connectionClass = connected
    ? signalLost
      ? "border-[#ffb70333] bg-[var(--accent-amber-dim)] text-[var(--accent-amber)]"
      : "border-[#06d6a033] bg-[var(--accent-green-dim)] text-[var(--accent-green)]"
    : "border-[var(--border)] text-[var(--text-muted)]";

  return (
    <header className="col-start-2 flex h-14 items-center gap-4 border-b border-[var(--border)] bg-[var(--bg-surface)] px-5">
      <div className="flex-1">
        <h2 className="text-[0.95rem] font-semibold uppercase tracking-[0.02em] text-[var(--text-secondary)]">{pageTitle}</h2>
      </div>

      <div className="flex items-center gap-3">
        {current && (
          <>
            <div className="flex items-center gap-1.5 text-[0.78rem]">
              <span className="text-[0.78rem] text-[var(--text-muted)]">Air: {current.air_temp.toFixed(1)}°C</span>
            </div>
            <div className="h-[18px] w-px bg-[var(--border)]" />
            <div className="flex items-center gap-1.5 text-[0.78rem]">
              <span className="text-[0.78rem] text-[var(--text-muted)]">Pressure: {current.pressure.toFixed(0)} hPa</span>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-3">
        {diagResult && (
          <div
            className="flex items-center gap-1.5 rounded-full border px-2.5 py-[4px] text-[0.75rem] font-medium"
            style={{
              borderColor:
                diagResult.healthPct >= 70
                  ? "#06d6a033"
                  : diagResult.healthPct >= 40
                  ? "#ffb70333"
                  : "#e6394633",
              background:
                diagResult.healthPct >= 70
                  ? "var(--accent-green-dim)"
                  : diagResult.healthPct >= 40
                  ? "var(--accent-amber-dim)"
                  : "#e6394615",
              color:
                diagResult.healthPct >= 70
                  ? "var(--accent-green)"
                  : diagResult.healthPct >= 40
                  ? "var(--accent-amber)"
                  : "var(--accent-red)",
            }}
          >
            <Activity size={12} />
            <span className="mono">{diagResult.healthPct}%</span>
          </div>
        )}

        {connected && !signalLost && (
          <span className="mono text-[0.72rem] text-[var(--text-muted)]">{bytesPerSec} B/s</span>
        )}

        <div className={`flex items-center gap-[7px] rounded-full border px-3 py-[5px] text-[0.78rem] font-medium ${connectionClass}`}>
          {connected && !signalLost
            ? <Wifi size={14} />
            : <WifiOff size={14} />}
          <span>
            {!connected
              ? "Disconnected"
              : signalLost
              ? "Signal Lost"
              : config.port === "DEMO"
              ? "Demo Mode"
              : config.port}
          </span>
          <span className={`led ${connected && !signalLost ? "led-green" : connected ? "led-amber led-blink" : "led-gray"}`} />
        </div>
      </div>
    </header>
  );
}

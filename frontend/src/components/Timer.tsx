import { useState, useEffect, useCallback, useRef } from "react";

interface TimerState {
  phase: "idle" | "running" | "paused";
  startedAt: number | null;      // epoch ms when last started/resumed
  pausedSecondsLeft: number | null; // seconds remaining when paused
}

interface TimerProps {
  durationMinutes?: number;
  storageKey?: string;
  onExpire?: () => void;
}

function loadState(storageKey: string | undefined): TimerState | null {
  if (!storageKey) return null;
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as TimerState) : null;
  } catch {
    return null;
  }
}

function saveState(storageKey: string | undefined, state: TimerState) {
  if (!storageKey) return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // localStorage not available — silently ignore
  }
}

export function Timer({ durationMinutes = 50, storageKey, onExpire }: TimerProps) {
  const totalSeconds = durationMinutes * 60;

  const computeSecondsLeft = useCallback(
    (state: TimerState): number => {
      if (state.phase === "running" && state.startedAt !== null) {
        const elapsed = Math.floor((Date.now() - state.startedAt) / 1000);
        return Math.max(0, totalSeconds - elapsed);
      }
      if (state.phase === "paused" && state.pausedSecondsLeft !== null) {
        return state.pausedSecondsLeft;
      }
      return totalSeconds;
    },
    [totalSeconds]
  );

  const [timerState, setTimerStateRaw] = useState<TimerState>(() => {
    const saved = loadState(storageKey);
    return saved ?? { phase: "idle", startedAt: null, pausedSecondsLeft: null };
  });

  const [secondsLeft, setSecondsLeft] = useState(() => computeSecondsLeft(
    loadState(storageKey) ?? { phase: "idle", startedAt: null, pausedSecondsLeft: null }
  ));

  const onExpireRef = useRef(onExpire);
  useEffect(() => { onExpireRef.current = onExpire; }, [onExpire]);

  const setTimerState = useCallback(
    (next: TimerState) => {
      setTimerStateRaw(next);
      saveState(storageKey, next);
      setSecondsLeft(computeSecondsLeft(next));
    },
    [storageKey, computeSecondsLeft]
  );

  // Tick while running
  useEffect(() => {
    if (timerState.phase !== "running") return;
    const interval = setInterval(() => {
      const remaining = computeSecondsLeft(timerState);
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        const next: TimerState = { phase: "idle", startedAt: null, pausedSecondsLeft: null };
        setTimerStateRaw(next);
        saveState(storageKey, next);
        onExpireRef.current?.();
      }
    }, 500);
    return () => clearInterval(interval);
  }, [timerState, computeSecondsLeft, storageKey]);

  const handleStartPause = useCallback(() => {
    if (timerState.phase === "running") {
      // Pause
      const remaining = computeSecondsLeft(timerState);
      setTimerState({ phase: "paused", startedAt: null, pausedSecondsLeft: remaining });
    } else {
      // Start or resume from paused/idle
      const resumingFrom =
        timerState.phase === "paused" && timerState.pausedSecondsLeft !== null
          ? timerState.pausedSecondsLeft
          : totalSeconds;
      const startedAt = Date.now() - (totalSeconds - resumingFrom) * 1000;
      setTimerState({ phase: "running", startedAt, pausedSecondsLeft: null });
    }
  }, [timerState, computeSecondsLeft, setTimerState, totalSeconds]);

  const handleReset = useCallback(() => {
    const next: TimerState = { phase: "idle", startedAt: null, pausedSecondsLeft: null };
    setTimerState(next);
  }, [setTimerState]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const isWarning = secondsLeft <= 300 && secondsLeft > 0;
  const isExpired = secondsLeft === 0;
  const running = timerState.phase === "running";

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className={`font-mono text-5xl font-bold tabular-nums ${
          isExpired
            ? "text-red-600"
            : isWarning
            ? "text-amber-500 animate-pulse"
            : "text-gray-800"
        }`}
      >
        {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleStartPause}
          className={`px-4 py-2 rounded text-white font-semibold text-sm ${
            running ? "bg-amber-500 hover:bg-amber-600" : "bg-green-600 hover:bg-green-700"
          }`}
        >
          {running ? "Pause" : "Start"}
        </button>
        <button
          onClick={handleReset}
          className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold text-sm"
        >
          Reset
        </button>
      </div>
    </div>
  );
}

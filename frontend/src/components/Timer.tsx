import { useState, useEffect, useCallback } from "react";

interface TimerProps {
  durationMinutes?: number;
  onExpire?: () => void;
}

export function Timer({ durationMinutes = 50, onExpire }: TimerProps) {
  const totalSeconds = durationMinutes * 60;
  const [secondsLeft, setSecondsLeft] = useState(totalSeconds);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(interval);
          setRunning(false);
          onExpire?.();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [running, onExpire]);

  const reset = useCallback(() => {
    setRunning(false);
    setSecondsLeft(totalSeconds);
  }, [totalSeconds]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const isWarning = secondsLeft <= 300;
  const isExpired = secondsLeft === 0;

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
          onClick={() => setRunning((r) => !r)}
          className={`px-4 py-2 rounded text-white font-semibold text-sm ${
            running ? "bg-amber-500 hover:bg-amber-600" : "bg-green-600 hover:bg-green-700"
          }`}
        >
          {running ? "Pause" : "Start"}
        </button>
        <button
          onClick={reset}
          className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold text-sm"
        >
          Reset
        </button>
      </div>
    </div>
  );
}

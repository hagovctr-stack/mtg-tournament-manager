import { useState, useEffect, useCallback, useRef } from 'react';

interface TimerState {
  phase: 'idle' | 'running' | 'paused' | 'overtime';
  startedAt: number | null; // epoch ms when last started/resumed
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
      if (state.phase === 'running' && state.startedAt !== null) {
        const elapsed = Math.floor((Date.now() - state.startedAt) / 1000);
        return Math.max(0, totalSeconds - elapsed);
      }
      if (state.phase === 'paused' && state.pausedSecondsLeft !== null) {
        return state.pausedSecondsLeft;
      }
      return totalSeconds;
    },
    [totalSeconds],
  );

  const [timerState, setTimerStateRaw] = useState<TimerState>(() => {
    const saved = loadState(storageKey);
    return saved ?? { phase: 'idle', startedAt: null, pausedSecondsLeft: null };
  });

  const [secondsLeft, setSecondsLeft] = useState(() =>
    computeSecondsLeft(
      loadState(storageKey) ?? { phase: 'idle', startedAt: null, pausedSecondsLeft: null },
    ),
  );

  const [overtimeSeconds, setOvertimeSeconds] = useState<number>(0);

  // Pre-load voices for speech synthesis
  useEffect(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
    }
  }, []);

  // Guard so the 10-minute warning fires exactly once per run
  const warningFiredRef = useRef(false);

  const playChime = useCallback((type: 'warning' | 'expired') => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();

      const playTone = (freq: number, startTime: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        osc.connect(gainNode);
        gainNode.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(0.5, startTime + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
        osc.start(startTime);
        osc.stop(startTime + duration);
      };

      const now = ctx.currentTime;
      if (type === 'warning') {
        // Single gentle ding for the warning
        playTone(659.25, now, 1); // E5
      } else {
        // Full ding-dong for expiry
        playTone(880, now, 1); // A5
        playTone(659.25, now + 0.5, 1); // E5
      }
    } catch (e) {
      console.error('AudioContext not supported', e);
    }
  }, []);

  const speakMessage = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const bestVoice =
      voices.find(
        (v) => (v.name.includes('Google') || v.name.includes('Natural')) && v.lang.startsWith('en'),
      ) ||
      voices.find((v) => v.lang.startsWith('en-GB')) ||
      voices.find((v) => v.lang.startsWith('en-US')) ||
      voices[0];
    if (bestVoice) utterance.voice = bestVoice;
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, []);

  const playNotification = useCallback(
    (type: 'warning' | 'expired') => {
      playChime(type);
      setTimeout(
        () =>
          speakMessage(
            type === 'warning' ? 'Ten minutes remaining.' : 'Time is up. Please finish your match.',
          ),
        1200,
      );
    },
    [playChime, speakMessage],
  );

  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  const setTimerState = useCallback(
    (next: TimerState) => {
      setTimerStateRaw(next);
      saveState(storageKey, next);
      setSecondsLeft(computeSecondsLeft(next));
    },
    [storageKey, computeSecondsLeft],
  );

  // Reset warning guard and overtime counter whenever the timer goes idle
  useEffect(() => {
    if (timerState.phase === 'idle') {
      warningFiredRef.current = false;
      setOvertimeSeconds(0);
    }
  }, [timerState.phase]);

  // Tick while running or in overtime
  useEffect(() => {
    if (timerState.phase !== 'running' && timerState.phase !== 'overtime') return;
    const interval = setInterval(() => {
      if (timerState.phase === 'running') {
        const remaining = computeSecondsLeft(timerState);
        setSecondsLeft(remaining);

        // 10-minute warning — fire once
        if (remaining === 600 && !warningFiredRef.current) {
          warningFiredRef.current = true;
          playNotification('warning');
        }

        if (remaining <= 0) {
          clearInterval(interval);
          // Transition to overtime — keep startedAt so we measure elapsed overtime
          const overtimeStart = Date.now();
          const next: TimerState = {
            phase: 'overtime',
            startedAt: overtimeStart,
            pausedSecondsLeft: null,
          };
          setTimerStateRaw(next);
          saveState(storageKey, next);
          setOvertimeSeconds(0);
          playNotification('expired');
          onExpireRef.current?.();
        }
      } else if (timerState.phase === 'overtime' && timerState.startedAt !== null) {
        // Count up elapsed overtime seconds
        const elapsed = Math.floor((Date.now() - timerState.startedAt) / 1000);
        setOvertimeSeconds(elapsed);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [timerState, computeSecondsLeft, storageKey, playNotification]);

  const handleStartPause = useCallback(() => {
    if (timerState.phase === 'running') {
      // Pause
      const remaining = computeSecondsLeft(timerState);
      setTimerState({ phase: 'paused', startedAt: null, pausedSecondsLeft: remaining });
    } else {
      // Start or resume from paused/idle
      const resumingFrom =
        timerState.phase === 'paused' && timerState.pausedSecondsLeft !== null
          ? timerState.pausedSecondsLeft
          : totalSeconds;
      const startedAt = Date.now() - (totalSeconds - resumingFrom) * 1000;
      setTimerState({ phase: 'running', startedAt, pausedSecondsLeft: null });
    }
  }, [timerState, computeSecondsLeft, setTimerState, totalSeconds]);

  const handleReset = useCallback(() => {
    const next: TimerState = { phase: 'idle', startedAt: null, pausedSecondsLeft: null };
    setTimerState(next);
  }, [setTimerState]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const isWarning = secondsLeft <= 300 && secondsLeft > 0;
  const inOvertime = timerState.phase === 'overtime';
  const overtimeMinutes = Math.floor(overtimeSeconds / 60);
  const overtimeSecs = overtimeSeconds % 60;
  const running = timerState.phase === 'running';

  return (
    <div className="flex flex-col items-center gap-3">
      {inOvertime ? (
        <>
          <div className="text-xs font-bold uppercase tracking-widest text-red-500 animate-pulse">
            OVERTIME
          </div>
          <div className="font-mono text-5xl font-bold tabular-nums text-red-600">
            -{String(overtimeMinutes).padStart(2, '0')}:{String(overtimeSecs).padStart(2, '0')}
          </div>
        </>
      ) : (
        <div
          className={`font-mono text-5xl font-bold tabular-nums ${
            isWarning ? 'text-amber-500 animate-pulse' : 'text-gray-800'
          }`}
        >
          {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
        </div>
      )}
      <div className="flex gap-2">
        {!inOvertime && (
          <button
            onClick={handleStartPause}
            className={`px-4 py-2 rounded text-white font-semibold text-sm ${
              running ? 'bg-amber-500 hover:bg-amber-600' : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {running ? 'Pause' : 'Start'}
          </button>
        )}
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

import { useEffect, useState, type CSSProperties } from "react";
import { type Player, type Tournament } from "../api";

interface DraftPodProps {
  players: Player[];
  status: Tournament["status"];
  canRandomize: boolean;
  isRandomizing: boolean;
  onRandomize: () => void;
}

const TABLE_RADIUS_BY_COUNT: Record<number, number> = {
  2: 36,
  3: 37,
  4: 38,
  5: 39,
  6: 40,
  7: 41,
  8: 42,
  9: 43,
  10: 43,
  11: 44,
  12: 44,
};

export function DraftPod({ players, status, canRandomize, isRandomizing, onRandomize }: DraftPodProps) {
  const [collapsed, setCollapsed] = useState(false);
  const activePlayers = players.filter((player) => player.active);
  const seatedPlayers = [...activePlayers]
    .filter((player) => player.seatNumber != null)
    .sort((left, right) => left.seatNumber! - right.seatNumber!);
  const canCollapse = seatedPlayers.length > 0;

  useEffect(() => {
    if (!canCollapse) {
      setCollapsed(false);
    }
  }, [canCollapse]);

  if (seatedPlayers.length === 0) {
    return (
      <section className="mb-5 rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,#faf5ff_0%,#ffffff_100%)] p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-purple-700">Draft Pod</p>
            <p className="mt-1 text-sm text-slate-500">
              {status === "REGISTRATION"
                ? "Start the tournament to assign seats."
                : "Randomize seats to lock the pod layout for round 1."}
            </p>
          </div>
          {canRandomize && (
            <button
              onClick={onRandomize}
              disabled={isRandomizing || activePlayers.length < 2}
              className="rounded-lg border border-purple-200 bg-white px-3 py-2 text-xs font-semibold text-purple-700 shadow-sm hover:border-purple-300 hover:bg-purple-50 disabled:opacity-50"
            >
              {isRandomizing ? "Randomizing..." : "Randomize Seats"}
            </button>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,#faf5ff_0%,#ffffff_100%)] p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-purple-700">Draft Pod</p>
          <p className="mt-1 text-sm text-slate-500">{seatedPlayers.length} seats assigned</p>
        </div>
        <div className="flex items-center gap-2">
          {canCollapse && (
            <button
              onClick={() => setCollapsed((current) => !current)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-50"
            >
              {collapsed ? "Show Pod" : "Hide Pod"}
            </button>
          )}
          {canRandomize && (
            <button
              onClick={onRandomize}
              disabled={isRandomizing}
              className="rounded-lg border border-purple-200 bg-white px-3 py-2 text-xs font-semibold text-purple-700 shadow-sm hover:border-purple-300 hover:bg-purple-50 disabled:opacity-50"
            >
              {isRandomizing ? "Randomizing..." : "Re-randomize"}
            </button>
          )}
        </div>
      </div>

      {!collapsed && (
        <div className="mt-4">
          <div className="relative mx-auto aspect-square w-full max-w-[620px] min-w-[280px]">
            <div className="absolute inset-[20%] rounded-full border border-slate-300/70 bg-slate-900 shadow-[0_24px_70px_rgba(15,23,42,0.22)]">
              <div className="absolute inset-[6%] rounded-full border border-slate-700/80" />
              <div className="absolute inset-[19%] rounded-full border border-slate-700/50" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="rounded-full border border-slate-700 bg-slate-950/85 p-4 shadow-inner">
                  <img
                    src="/mtg-planeswalker.svg"
                    alt="Magic: The Gathering planeswalker symbol"
                    className="h-11 w-11 opacity-95"
                  />
                </div>
              </div>
            </div>

            {seatedPlayers.map((player, index) => (
              <SeatNode
                key={player.id}
                seat={player.seatNumber!}
                name={player.name}
                style={getSeatLayout(index, seatedPlayers.length)}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function getSeatLayout(index: number, seatCount: number): CSSProperties {
  const angle = -90 + (360 / seatCount) * index;
  const radius = TABLE_RADIUS_BY_COUNT[seatCount] ?? 43;
  const radians = (angle * Math.PI) / 180;
  const x = 50 + radius * Math.cos(radians);
  const y = 50 + radius * Math.sin(radians);

  return {
    left: `${x}%`,
    top: `${y}%`,
    transform: "translate(-50%, -50%)",
  };
}

function splitDisplayName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstLine: name, secondLine: "" };
  return {
    firstLine: parts[0]!,
    secondLine: parts.slice(1).join(" "),
  };
}

function SeatNode({ seat, name, style }: { seat: number; name: string; style: CSSProperties }) {
  const { firstLine, secondLine } = splitDisplayName(name);

  return (
    <div className="absolute w-[120px] sm:w-[136px]" style={style}>
      <div className="flex flex-col items-center gap-1.5 text-center">
        <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-purple-600 text-sm font-bold text-white shadow-lg shadow-purple-900/25">
          {seat}
        </div>
        <div className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 shadow-xl shadow-slate-300/60">
          <p className="truncate text-xs font-semibold leading-tight text-slate-800" title={name}>
            {firstLine}
          </p>
          <p className="truncate text-xs font-semibold leading-tight text-slate-700" title={name}>
            {secondLine || " "}
          </p>
        </div>
      </div>
    </div>
  );
}

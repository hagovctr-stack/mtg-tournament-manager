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
  2: 42,
  3: 42,
  4: 43,
  5: 44,
  6: 45,
  7: 44,
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
    <section className="mb-5 rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,#faf5ff_0%,#ffffff_100%)] p-4 shadow-sm">
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
        <div className="mt-4 pb-16 pt-12">
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

            {seatedPlayers.map((player, index) => {
              const { style, angle } = getSeatLayout(index, seatedPlayers.length);
              return (
                <SeatNode
                  key={player.id}
                  seat={player.seatNumber!}
                  name={player.name}
                  avatarUrl={player.avatarUrl}
                  angle={angle}
                  style={style}
                />
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

function getSeatLayout(index: number, seatCount: number): { style: CSSProperties; angle: number } {
  const angle = -90 + (360 / seatCount) * index;
  const baseRadius = TABLE_RADIUS_BY_COUNT[seatCount] ?? 43;
  const radians = (angle * Math.PI) / 180;
  // Pull purely vertical seats (top/bottom) a bit closer to the ring so that
  // all avatars feel equidistant from the circle regardless of their angle.
  const radius = baseRadius - Math.abs(Math.sin(radians)) * 4;
  const x = 50 + radius * Math.cos(radians);
  const y = 50 + radius * Math.sin(radians);

  return {
    style: { left: `${x}%`, top: `${y}%` },
    angle,
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

function SeatNode({ seat, name, avatarUrl, angle, style }: { seat: number; name: string; avatarUrl: string | null; angle: number; style: CSSProperties }) {
  const { firstLine, secondLine } = splitDisplayName(name);
  const isUpperHalf = Math.sin((angle * Math.PI) / 180) < 0;

  // Anchor the avatar circle (radius 32 px) on the ring point so that seats
  // sharing the same ring y-coordinate are visually level with each other.
  const transform = isUpperHalf
    ? "translate(-50%, calc(-100% + 32px))" // card above → avatar sits at bottom of node, on the ring
    : "translate(-50%, -32px)";             // card below → avatar sits at top of node, on the ring

  return (
    <div className="absolute w-[120px] sm:w-[136px]" style={{ ...style, transform }}>
      <div className={`flex ${isUpperHalf ? "flex-col-reverse" : "flex-col"} items-center gap-1.5 text-center`}>
        <div className="relative">
          {avatarUrl ? (
            <div className="h-16 w-16 overflow-hidden rounded-full border-2 border-white shadow-lg ring-2 ring-purple-400">
              <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
            </div>
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-white bg-purple-600 shadow-lg text-xl font-bold text-white">
              {name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-white bg-slate-800 text-[10px] font-bold text-white shadow">
            {seat}
          </div>
        </div>
        <div className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 shadow-xl shadow-slate-300/60">
          <p className="truncate text-xs font-semibold leading-tight text-slate-800" title={name}>
            {firstLine}
          </p>
          <p className="truncate text-xs font-semibold leading-tight text-slate-700" title={name}>
            {secondLine || "\u00a0"}
          </p>
        </div>
      </div>
    </div>
  );
}

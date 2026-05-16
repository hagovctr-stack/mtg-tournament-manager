import { useEffect, useState, type CSSProperties } from 'react';
import { type Player, type Tournament } from '../api';

import { Link } from 'react-router-dom';

interface DraftPodProps {
  players: Player[];
  status: Tournament['status'];
  canRandomize: boolean;
  isRandomizing: boolean;
  onRandomize: () => void;
  onAssignByOrder?: () => void;
  assignByOrderLabel?: string;
  onReorderSeats?: (assignments: Array<{ tournamentPlayerId: string; seatNumber: number }>) => void;
  storageKey?: string;
  /** Map of tournamentPlayerId → hex pip color for team identity rings */
  playerTeamColors?: Record<string, string>;
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

export function DraftPod({
  players,
  status,
  canRandomize,
  isRandomizing,
  onRandomize,
  onAssignByOrder,
  assignByOrderLabel = 'Use Registration Order',
  onReorderSeats,
  storageKey,
  playerTeamColors,
}: DraftPodProps) {
  const [collapsed, setCollapsed] = useState(() =>
    storageKey ? localStorage.getItem(storageKey) === 'true' : false,
  );
  const [draggedTournamentPlayerId, setDraggedTournamentPlayerId] = useState<string | null>(null);
  const [dropTargetTournamentPlayerId, setDropTargetTournamentPlayerId] = useState<string | null>(
    null,
  );
  const activePlayers = players.filter((player) => player.active);
  const seatedPlayers = [...activePlayers]
    .filter((player) => player.seatNumber != null)
    .sort((left, right) => left.seatNumber! - right.seatNumber!);
  const canCollapse = seatedPlayers.length > 0;

  useEffect(() => {
    if (!canCollapse) {
      setCollapsed(false);
      if (storageKey) localStorage.setItem(storageKey, 'false');
    }
  }, [canCollapse, storageKey]);

  if (seatedPlayers.length === 0) {
    return (
      <section className="mb-5 rounded-[1.75rem] border border-white/80 bg-[linear-gradient(180deg,#fff1ee_0%,#ffffff_100%)] p-4 shadow-[0_18px_55px_rgba(15,23,42,0.08)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-rose-700">
              Draft Pod
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {status === 'REGISTRATION'
                ? 'Start the tournament to assign seats.'
                : 'Assign seats to lock the pod layout for round 1.'}
            </p>
          </div>
          {canRandomize && (
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {onAssignByOrder && (
                <button
                  onClick={onAssignByOrder}
                  disabled={isRandomizing || activePlayers.length < 2}
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
                >
                  {assignByOrderLabel}
                </button>
              )}
              <button
                onClick={onRandomize}
                disabled={isRandomizing || activePlayers.length < 2}
                className="rounded-2xl border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 shadow-sm hover:border-rose-300 hover:bg-rose-50 disabled:opacity-50"
              >
                {isRandomizing ? 'Randomizing...' : 'Randomize Seats'}
              </button>
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="mb-5 rounded-[1.75rem] border border-white/80 bg-[linear-gradient(180deg,#fff1ee_0%,#ffffff_100%)] p-4 shadow-[0_18px_55px_rgba(15,23,42,0.08)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-rose-700">
            Draft Pod
          </p>
          <p className="mt-1 text-sm text-slate-600">{seatedPlayers.length} seats assigned</p>
        </div>
        <div className="flex items-center gap-2">
          {canCollapse && (
            <button
              onClick={() => {
                setCollapsed((current) => {
                  const next = !current;
                  if (storageKey) localStorage.setItem(storageKey, String(next));
                  return next;
                });
              }}
              className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-50"
            >
              {collapsed ? 'Show Pod' : 'Hide Pod'}
            </button>
          )}
          {canRandomize && (
            <div className="flex items-center gap-2">
              {onAssignByOrder && (
                <button
                  onClick={onAssignByOrder}
                  disabled={isRandomizing}
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
                >
                  {assignByOrderLabel === 'Use Registration Order'
                    ? 'Reset to Reg. Order'
                    : assignByOrderLabel}
                </button>
              )}
              <button
                onClick={onRandomize}
                disabled={isRandomizing}
                className="rounded-2xl border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 shadow-sm hover:border-rose-300 hover:bg-rose-50 disabled:opacity-50"
              >
                {isRandomizing ? 'Randomizing...' : 'Re-randomize'}
              </button>
            </div>
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
              const isDragging = draggedTournamentPlayerId === player.id;
              const isDropTarget =
                dropTargetTournamentPlayerId === player.id &&
                draggedTournamentPlayerId !== player.id;
              return (
                <SeatNode
                  key={player.id}
                  seat={player.seatNumber!}
                  name={player.name}
                  avatarUrl={player.avatarUrl}
                  playerId={player.playerId}
                  tournamentPlayerId={player.id}
                  angle={angle}
                  style={style}
                  draggable={Boolean(onReorderSeats)}
                  isDragging={isDragging}
                  isDropTarget={isDropTarget}
                  teamColor={playerTeamColors?.[player.id]}
                  onDragStart={() => setDraggedTournamentPlayerId(player.id)}
                  onDragEnd={() => {
                    setDraggedTournamentPlayerId(null);
                    setDropTargetTournamentPlayerId(null);
                  }}
                  onDragOver={() => setDropTargetTournamentPlayerId(player.id)}
                  onDragLeave={() =>
                    setDropTargetTournamentPlayerId((current) =>
                      current === player.id ? null : current,
                    )
                  }
                  onDrop={() => {
                    if (
                      draggedTournamentPlayerId &&
                      draggedTournamentPlayerId !== player.id &&
                      onReorderSeats
                    ) {
                      const source = seatedPlayers.find((p) => p.id === draggedTournamentPlayerId);
                      const target = player;
                      if (source && target) {
                        const assignments = seatedPlayers.map((p) => {
                          if (p.id === source.id)
                            return { tournamentPlayerId: p.id, seatNumber: target.seatNumber! };
                          if (p.id === target.id)
                            return { tournamentPlayerId: p.id, seatNumber: source.seatNumber! };
                          return { tournamentPlayerId: p.id, seatNumber: p.seatNumber! };
                        });
                        onReorderSeats(assignments);
                      }
                    }
                    setDraggedTournamentPlayerId(null);
                    setDropTargetTournamentPlayerId(null);
                  }}
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
  if (parts.length <= 1) return { firstLine: name, secondLine: '' };
  return {
    firstLine: parts[0]!,
    secondLine: parts.slice(1).join(' '),
  };
}

function SeatNode({
  seat,
  name,
  avatarUrl,
  playerId,
  angle,
  style,
  draggable,
  isDragging,
  isDropTarget,
  teamColor,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  seat: number;
  name: string;
  avatarUrl: string | null;
  playerId: string | null;
  tournamentPlayerId: string;
  angle: number;
  style: CSSProperties;
  draggable?: boolean;
  isDragging?: boolean;
  isDropTarget?: boolean;
  teamColor?: string;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onDragOver?: () => void;
  onDragLeave?: () => void;
  onDrop?: () => void;
}) {
  const { firstLine, secondLine } = splitDisplayName(name);
  const isUpperHalf = Math.sin((angle * Math.PI) / 180) < 0;

  // Anchor the avatar circle (radius 32 px) on the ring point so that seats
  // sharing the same ring y-coordinate are visually level with each other.
  const transform = isUpperHalf
    ? 'translate(-50%, calc(-100% + 32px))' // card above → avatar sits at bottom of node, on the ring
    : 'translate(-50%, -32px)'; // card below → avatar sits at top of node, on the ring

  const content = (
    <div
      className={`flex ${isUpperHalf ? 'flex-col-reverse' : 'flex-col'} items-center gap-1.5 text-center`}
    >
      <div className="relative">
        {avatarUrl ? (
          <div
            className={`h-16 w-16 overflow-hidden rounded-full border-2 shadow-lg ring-2 transition ${isDropTarget ? 'border-rose-400 ring-rose-400 scale-110' : 'border-white ring-rose-300'}`}
            style={teamColor && !isDropTarget ? { boxShadow: `0 0 0 2px white, 0 0 0 4px ${teamColor}66`, borderColor: 'white' } : undefined}
          >
            <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
          </div>
        ) : (
          <div
            className={`flex h-16 w-16 items-center justify-center rounded-full border-2 shadow-lg text-xl font-bold text-white transition ${isDropTarget ? 'border-rose-400 bg-rose-400 scale-110' : 'border-white'}`}
            style={teamColor && !isDropTarget ? { backgroundColor: teamColor, boxShadow: `0 0 0 2px white, 0 0 0 4px ${teamColor}55` } : { backgroundColor: '#e11d48' }}
          >
            {name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-white bg-slate-800 text-[10px] font-bold text-white shadow">
          {seat}
        </div>
      </div>
      <div
        className={`w-full rounded-2xl border bg-white px-3 py-2 shadow-xl transition ${isDropTarget ? 'border-rose-300 shadow-rose-200' : 'border-slate-300 shadow-slate-300/60'}`}
      >
        <p className="truncate text-xs font-semibold leading-tight text-slate-800" title={name}>
          {firstLine}
        </p>
        <p className="truncate text-xs font-semibold leading-tight text-slate-700" title={name}>
          {secondLine || '\u00a0'}
        </p>
      </div>
    </div>
  );

  const wrapper = (
    <div
      draggable={draggable}
      onDragStart={(e) => {
        if (draggable) {
          e.dataTransfer.effectAllowed = 'move';
          onDragStart?.();
        }
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver?.();
      }}
      onDragLeave={onDragLeave}
      onDrop={(e) => {
        e.preventDefault();
        onDrop?.();
      }}
      className={`absolute w-[120px] sm:w-[136px] transition-opacity ${isDragging ? 'opacity-40' : 'opacity-100'} ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
      style={{ ...style, transform }}
    >
      {playerId ? <Link to={`/players/${playerId}`}>{content}</Link> : content}
    </div>
  );

  return wrapper;
}

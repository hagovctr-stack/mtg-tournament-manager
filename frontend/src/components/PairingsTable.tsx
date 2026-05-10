import { useState } from 'react';
import type React from 'react';
import { Link } from 'react-router-dom';
import { api, type MatchDetail } from '../api';
import { PlayerAvatar } from './PlayerAvatar';

type Winner = 'p1' | 'p2' | 'draw';
type MatchPlayer = MatchDetail['player1'];

function maxWinsForFormat(format: string) {
  if (format === 'BO1') return 1;
  if (format === 'BO5') return 3;
  if (format === 'FREE') return 99;
  return 2;
}

function defaultDrawWins(format: string) {
  if (format === 'BO5') return 2;
  return 1;
}

function winnerForMatch(match: MatchDetail): Winner | null {
  if (match.result === 'P1_WIN') return 'p1';
  if (match.result === 'P2_WIN') return 'p2';
  if (match.result === 'DRAW') return 'draw';
  return null;
}

function Stepper({
  value,
  min,
  max,
  onChange,
  disabled = false,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-white px-1 py-1">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={disabled || value <= min}
        className="flex h-6 w-6 items-center justify-center rounded-full bg-stone-100 text-sm font-bold leading-none text-slate-700 transition hover:bg-stone-200 disabled:cursor-not-allowed disabled:opacity-35"
      >
        −
      </button>
      <span className="w-7 text-center font-mono text-sm font-bold tabular-nums text-slate-900">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={disabled || value >= max}
        className="flex h-6 w-6 items-center justify-center rounded-full bg-stone-100 text-sm font-bold leading-none text-slate-700 transition hover:bg-stone-200 disabled:cursor-not-allowed disabled:opacity-35"
      >
        +
      </button>
    </div>
  );
}

function ResultBadge({ match }: { match: MatchDetail }) {
  if (match.result === 'BYE') {
    return (
      <span className="inline-flex rounded-full border border-stone-200 bg-stone-100 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
        Bye
      </span>
    );
  }

  if (match.result === 'PENDING') {
    return (
      <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-amber-700">
        Pending
      </span>
    );
  }

  const tone =
    match.result === 'DRAW'
      ? 'border-slate-200 bg-slate-100 text-slate-700'
      : 'border-emerald-200 bg-emerald-50 text-emerald-700';

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] ${tone}`}
    >
      {match.result === 'DRAW'
        ? `Draw ${match.wins1}-${match.wins2}`
        : `${match.wins1}-${match.wins2}`}
    </span>
  );
}

function WinnerMarker({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center text-[1.08rem] leading-none ${
        active ? 'text-amber-500' : 'text-transparent'
      }`}
    >
      ★
    </span>
  );
}

function PlayerCell({
  player,
  align,
  isWinner,
}: {
  player: MatchPlayer;
  align: 'left' | 'right';
  isWinner: boolean;
}) {
  const body = (
    <div
      className={`flex min-w-0 items-center gap-2 ${align === 'right' ? 'flex-row-reverse text-right' : ''}`}
    >
      <PlayerAvatar name={player.name} avatarUrl={player.avatarUrl} size="sm" />
      <span
        className={`truncate text-sm font-medium ${isWinner ? 'text-emerald-700' : 'text-slate-800'}`}
      >
        {player.name}
      </span>
    </div>
  );

  return (
    <div className={`flex min-w-0 items-center gap-2 ${align === 'right' ? 'justify-end' : ''}`}>
      {align === 'left' && <WinnerMarker active={isWinner} />}
      {player.playerId ? (
        <Link
          to={`/players/${player.playerId}`}
          className="min-w-0 hover:text-slate-950 hover:underline"
        >
          {body}
        </Link>
      ) : (
        <div className="min-w-0">{body}</div>
      )}
      {align === 'right' && <WinnerMarker active={isWinner} />}
    </div>
  );
}

interface PairingsTableProps {
  matches: MatchDetail[];
  canReport: boolean;
  bestOfFormat?: string;
  onUpdate: () => void;
  headerRight?: React.ReactNode;
}

export function PairingsTable({
  matches,
  canReport,
  bestOfFormat = 'BO3',
  onUpdate,
  headerRight,
}: PairingsTableProps) {
  const maxW = maxWinsForFormat(bestOfFormat);
  const defaultWinsW = maxW === 99 ? 2 : maxW;
  const isFree = bestOfFormat === 'FREE';
  const totalMatches = matches.length;
  const pendingMatches = matches.filter((match) => match.result === 'PENDING').length;
  const reportedMatches = totalMatches - pendingMatches;
  const [editingMatch, setEditingMatch] = useState<string | null>(null);
  const [selectedWinner, setSelectedWinner] = useState<Winner | null>(null);
  const [winsW, setWinsW] = useState(defaultWinsW);
  const [winsL, setWinsL] = useState(0);
  const [submittingMatchId, setSubmittingMatchId] = useState<string | null>(null);

  const openForm = (match: MatchDetail) => {
    setEditingMatch(match.id);
    setSelectedWinner(null);
    setWinsW(defaultWinsW);
    setWinsL(0);
  };

  const closeForm = () => {
    setEditingMatch(null);
    setSelectedWinner(null);
    setSubmittingMatchId(null);
  };

  const handleSubmit = async (matchId: string, wins1: number, wins2: number) => {
    setSubmittingMatchId(matchId);
    try {
      await api.reportResult(matchId, { wins1, wins2, draws: 0 });
      closeForm();
      onUpdate();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error reporting result');
      setSubmittingMatchId(null);
    }
  };

  const handleWinnerSelect = async (match: MatchDetail, winner: Winner) => {
    if (bestOfFormat === 'BO1' && winner !== 'draw') {
      await handleSubmit(match.id, winner === 'p1' ? 1 : 0, winner === 'p2' ? 1 : 0);
      return;
    }

    if (winner === 'draw' && !isFree) {
      const draws = defaultDrawWins(bestOfFormat);
      await handleSubmit(match.id, draws, draws);
      return;
    }

    setSelectedWinner(winner);
    if (winner === 'draw') {
      const draws = defaultDrawWins(bestOfFormat);
      setWinsW(isFree ? Math.max(1, winsW, winsL) : draws);
      setWinsL(isFree ? Math.max(1, winsW, winsL) : draws);
      return;
    }

    const currentWinner = winnerForMatch(match);
    if (winner === 'p1' && currentWinner === 'p1') {
      setWinsW(match.wins1 ?? defaultWinsW);
      setWinsL(match.wins2 ?? 0);
      return;
    }
    if (winner === 'p2' && currentWinner === 'p2') {
      setWinsW(match.wins2 ?? defaultWinsW);
      setWinsL(match.wins1 ?? 0);
      return;
    }

    setWinsW(defaultWinsW);
    setWinsL(0);
  };

  const handleWinsWChange = (value: number) => {
    setWinsW(value);
    if (winsL >= value) setWinsL(value - 1);
  };

  const handleBack = () => setSelectedWinner(null);

  // Returns per-cell content for the inline editing row (no expand row).
  // Returns null when not editing — caller falls back to normal cells.
  const inlineEditor = (
    match: MatchDetail,
  ): {
    p1Cell: React.ReactNode;
    resultCell: React.ReactNode;
    p2Cell: React.ReactNode;
    actionCell: React.ReactNode;
  } | null => {
    if (editingMatch !== match.id) return null;

    const p1Name = match.player1.name;
    const p2Name = match.player2?.name ?? 'Bye';
    const isSubmitting = submittingMatchId === match.id;
    const showDraw = bestOfFormat !== 'BO1';

    // Phase 1 — pick a winner
    if (selectedWinner === null) {
      const btnBase =
        'flex min-w-0 items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50';
      return {
        p1Cell: (
          <button
            type="button"
            onClick={() => void handleWinnerSelect(match, 'p1')}
            disabled={isSubmitting}
            className={`${btnBase} border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:bg-emerald-50`}
          >
            <PlayerAvatar name={match.player1.name} avatarUrl={match.player1.avatarUrl} size="sm" />
            <span className="truncate">{p1Name}</span>
          </button>
        ),
        resultCell: showDraw ? (
          <button
            type="button"
            onClick={() => void handleWinnerSelect(match, 'draw')}
            disabled={isSubmitting}
            className="inline-flex items-center rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600 transition hover:border-slate-300 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Draw
          </button>
        ) : (
          <span className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Pick winner
          </span>
        ),
        p2Cell: match.player2 ? (
          <button
            type="button"
            onClick={() => void handleWinnerSelect(match, 'p2')}
            disabled={isSubmitting}
            className={`${btnBase} ml-auto border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:bg-emerald-50`}
          >
            <span className="truncate">{p2Name}</span>
            <PlayerAvatar name={match.player2.name} avatarUrl={match.player2.avatarUrl} size="sm" />
          </button>
        ) : null,
        actionCell: (
          <button
            type="button"
            onClick={closeForm}
            disabled={isSubmitting}
            className="rounded-full border border-stone-200 bg-white px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-500 transition hover:border-slate-300 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
        ),
      };
    }

    // Phase 2 — score selector
    const leftWins = selectedWinner === 'draw' ? winsW : selectedWinner === 'p1' ? winsW : winsL;
    const rightWins = selectedWinner === 'draw' ? winsL : selectedWinner === 'p2' ? winsW : winsL;

    const p1Highlighted = selectedWinner === 'p1';
    const p2Highlighted = selectedWinner === 'p2';

    return {
      p1Cell: (
        <div className="flex min-w-0 items-center gap-2">
          <WinnerMarker active={p1Highlighted} />
          <div className="flex min-w-0 items-center gap-2">
            <PlayerAvatar name={match.player1.name} avatarUrl={match.player1.avatarUrl} size="sm" />
            <span
              className={`truncate text-sm font-medium ${p1Highlighted ? 'text-emerald-700' : 'text-slate-400'}`}
            >
              {p1Name}
            </span>
          </div>
        </div>
      ),
      resultCell: (
        <div className="flex items-center justify-center gap-1.5">
          {selectedWinner === 'draw' ? (
            <Stepper
              value={winsW}
              min={0}
              max={99}
              onChange={(v) => {
                setWinsW(v);
                setWinsL(v);
              }}
              disabled={isSubmitting}
            />
          ) : (
            <>
              <Stepper
                value={leftWins}
                min={selectedWinner === 'p1' ? 1 : 0}
                max={selectedWinner === 'p1' ? (maxW === 99 ? 99 : maxW) : Math.max(0, winsW - 1)}
                onChange={selectedWinner === 'p1' ? handleWinsWChange : setWinsL}
                disabled={isSubmitting}
              />
              <span className="text-xs text-slate-400">–</span>
              <Stepper
                value={rightWins}
                min={selectedWinner === 'p2' ? 1 : 0}
                max={selectedWinner === 'p2' ? (maxW === 99 ? 99 : maxW) : Math.max(0, winsW - 1)}
                onChange={selectedWinner === 'p2' ? handleWinsWChange : setWinsL}
                disabled={isSubmitting}
              />
            </>
          )}
        </div>
      ),
      p2Cell: match.player2 ? (
        <div className="flex min-w-0 items-center justify-end gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={`truncate text-sm font-medium ${p2Highlighted ? 'text-emerald-700' : 'text-slate-400'}`}
            >
              {p2Name}
            </span>
            <PlayerAvatar name={match.player2.name} avatarUrl={match.player2.avatarUrl} size="sm" />
          </div>
          <WinnerMarker active={p2Highlighted} />
        </div>
      ) : null,
      actionCell: (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleBack}
            disabled={isSubmitting}
            className="text-xs font-semibold text-slate-400 transition hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Back
          </button>
          <button
            type="button"
            onClick={() =>
              void handleSubmit(
                match.id,
                selectedWinner === 'draw' ? winsW : leftWins,
                selectedWinner === 'draw' ? winsL : rightWins,
              )
            }
            disabled={isSubmitting}
            className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? 'Saving…' : 'Save'}
          </button>
        </div>
      ),
    };
  };

  if (matches.length === 0) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
            {totalMatches} {totalMatches === 1 ? 'Table' : 'Tables'}
          </span>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-emerald-700">
            {reportedMatches} Reported
          </span>
          {pendingMatches > 0 && (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-amber-700">
              {pendingMatches} Pending
            </span>
          )}
        </div>
        {headerRight && <div className="flex items-center">{headerRight}</div>}
      </div>

      <div className="overflow-x-auto rounded-[1.3rem] border border-stone-200 bg-white">
        <table className="min-w-full table-fixed">
          <thead className="border-b border-stone-200 bg-stone-50/80">
            <tr className="text-left text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
              <th className="w-20 px-6 py-3">Table</th>
              <th className="pl-[3.5rem] pr-5 py-3">Player 1</th>
              <th className="w-36 px-4 py-3 text-center">Result</th>
              <th className="pl-5 pr-[3.5rem] py-3 text-right">Player 2</th>
              {canReport && <th className="w-28 pl-5 pr-6 py-3 text-right">Action</th>}
            </tr>
          </thead>
          <tbody>
            {matches.map((match) => {
              const isEditing = editingMatch === match.id;
              const winner = winnerForMatch(match);
              const editor = inlineEditor(match);

              return (
                <tr
                  key={match.id}
                  className={`border-b border-stone-100 text-sm transition ${isEditing ? 'bg-stone-50/70' : 'hover:bg-stone-50/55'}`}
                >
                  <td className="px-6 py-4 font-mono text-sm text-slate-400">
                    {match.tableNumber}
                  </td>
                  <td className="px-5 py-4">
                    {editor ? (
                      editor.p1Cell
                    ) : (
                      <PlayerCell player={match.player1} align="left" isWinner={winner === 'p1'} />
                    )}
                  </td>
                  <td className="px-4 py-4 text-center">
                    {editor ? editor.resultCell : <ResultBadge match={match} />}
                  </td>
                  <td className="px-5 py-4">
                    {editor ? (
                      editor.p2Cell
                    ) : match.player2 ? (
                      <PlayerCell player={match.player2} align="right" isWinner={winner === 'p2'} />
                    ) : (
                      <div className="flex items-center justify-end gap-2 text-sm text-slate-400">
                        <span>Bye</span>
                      </div>
                    )}
                  </td>
                  {canReport && (
                    <td className="pl-5 pr-6 py-4 text-right">
                      {editor ? (
                        editor.actionCell
                      ) : match.result !== 'BYE' ? (
                        <button
                          type="button"
                          onClick={() => openForm(match)}
                          className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] transition ${
                            match.result === 'PENDING'
                              ? 'bg-slate-950 text-white hover:bg-slate-800'
                              : 'border border-stone-200 bg-white text-slate-600 hover:border-stone-300 hover:text-slate-900'
                          }`}
                        >
                          {match.result === 'PENDING' ? 'Report' : 'Edit'}
                        </button>
                      ) : null}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

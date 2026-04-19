import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type MatchDetail } from '../api';

type Winner = 'p1' | 'p2' | 'draw';

function maxWinsForFormat(format: string): number {
  if (format === 'BO1') return 1;
  if (format === 'BO5') return 3;
  if (format === 'FREE') return 99;
  return 2;
}

function Stepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-0.5">
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-bold leading-none disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        −
      </button>
      <span className="w-6 text-center font-mono text-sm font-bold tabular-nums text-gray-800">
        {value}
      </span>
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-bold leading-none disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        +
      </button>
    </div>
  );
}

interface PairingsTableProps {
  matches: MatchDetail[];
  canReport: boolean;
  bestOfFormat?: string;
  onUpdate: () => void;
}

function renderPlayerName(name: string, playerId: string | null | undefined) {
  if (!playerId) return <span>{name}</span>;
  return (
    <Link to={`/players/${playerId}`} className="hover:text-blue-600 hover:underline">
      {name}
    </Link>
  );
}

export function PairingsTable({
  matches,
  canReport,
  bestOfFormat = 'BO3',
  onUpdate,
}: PairingsTableProps) {
  const [editingMatch, setEditingMatch] = useState<string | null>(null);
  const [selectedWinner, setSelectedWinner] = useState<Winner | null>(null);
  const maxW = maxWinsForFormat(bestOfFormat);
  const defaultWinsW = maxW === 99 ? 2 : maxW;
  const [winsW, setWinsW] = useState(defaultWinsW);
  const [winsL, setWinsL] = useState(0);
  const isFree = bestOfFormat === 'FREE';

  const openForm = (matchId: string) => {
    setEditingMatch(matchId);
    setSelectedWinner(null);
    setWinsW(defaultWinsW);
    setWinsL(0);
  };

  const closeForm = () => {
    setEditingMatch(null);
    setSelectedWinner(null);
  };

  const handleSubmit = async (matchId: string, wins1: number, wins2: number) => {
    try {
      await api.reportResult(matchId, { wins1, wins2, draws: 0 });
      closeForm();
      onUpdate();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error reporting result');
    }
  };

  const handleWinnerSelect = async (match: MatchDetail, winner: Winner) => {
    if (bestOfFormat === 'BO1' && winner !== 'draw') {
      await handleSubmit(match.id, winner === 'p1' ? 1 : 0, winner === 'p2' ? 1 : 0);
      return;
    }
    if (winner === 'draw' && !isFree) {
      const draws = bestOfFormat === 'BO5' ? 2 : 1;
      await handleSubmit(match.id, draws, draws);
      return;
    }
    setSelectedWinner(winner);
    if (winner === 'draw') {
      setWinsW(isFree ? 1 : bestOfFormat === 'BO5' ? 2 : 1);
      setWinsL(isFree ? 1 : bestOfFormat === 'BO5' ? 2 : 1);
    } else {
      setWinsW(defaultWinsW);
      setWinsL(0);
    }
  };

  const handleWinsWChange = (value: number) => {
    setWinsW(value);
    if (winsL >= value) setWinsL(value - 1);
  };

  const resultLabel = (match: MatchDetail) => {
    if (match.result === 'BYE') return <span className="text-gray-400 text-xs">BYE</span>;
    if (match.result === 'PENDING') return <span className="text-amber-500 text-xs">Pending</span>;
    if (match.result === 'DRAW') {
      return (
        <span className="text-gray-500 text-xs font-semibold">
          Draw {match.wins1}–{match.wins2}
        </span>
      );
    }
    return (
      <span className="text-green-600 text-xs font-semibold">
        {match.wins1}–{match.wins2}
      </span>
    );
  };

  const renderForm = (match: MatchDetail) => {
    const p1Name = match.player1.name;
    const p2Name = match.player2?.name ?? '';

    if (selectedWinner === null) {
      const showDraw = bestOfFormat !== 'BO1';
      return (
        <div className="flex items-center gap-1 justify-center flex-wrap">
          <button
            onClick={() => handleWinnerSelect(match, 'p1')}
            className="bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-1 rounded text-xs font-semibold border border-blue-200 hover:border-blue-400 transition-colors max-w-[90px] truncate"
            title={`${p1Name} wins`}
          >
            {p1Name} ⭐
          </button>
          {showDraw && (
            <button
              onClick={() => handleWinnerSelect(match, 'draw')}
              className="bg-gray-50 hover:bg-gray-100 text-gray-500 px-2.5 py-1 rounded text-xs font-semibold border border-gray-200 hover:border-gray-400 transition-colors"
            >
              Draw
            </button>
          )}
          <button
            onClick={() => handleWinnerSelect(match, 'p2')}
            className="bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-1 rounded text-xs font-semibold border border-blue-200 hover:border-blue-400 transition-colors max-w-[90px] truncate"
            title={`${p2Name} wins`}
          >
            ⭐ {p2Name}
          </button>
          <button
            onClick={closeForm}
            className="text-gray-400 hover:text-gray-600 px-2 py-1 text-xs"
          >
            Cancel
          </button>
        </div>
      );
    }

    if (selectedWinner === 'draw') {
      return (
        <div className="flex items-center gap-2 justify-center flex-wrap">
          <span className="text-xs text-gray-500">Wins each:</span>
          <Stepper
            value={winsW}
            min={0}
            max={99}
            onChange={(value) => {
              setWinsW(value);
              setWinsL(value);
            }}
          />
          <button
            onClick={() => handleSubmit(match.id, winsW, winsL)}
            className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-xs font-semibold transition-colors"
          >
            Submit
          </button>
          <button
            onClick={() => setSelectedWinner(null)}
            className="text-gray-400 hover:text-gray-600 px-2 py-1 text-xs"
          >
            ← back
          </button>
        </div>
      );
    }

    const winnerName = selectedWinner === 'p1' ? p1Name : p2Name;
    const loserName = selectedWinner === 'p1' ? p2Name : p1Name;
    const abs1 = selectedWinner === 'p1' ? winsW : winsL;
    const abs2 = selectedWinner === 'p2' ? winsW : winsL;

    return (
      <div className="flex items-center gap-1.5 justify-center flex-wrap">
        <span className="text-xs font-semibold text-green-700 max-w-[72px] truncate">
          ⭐ {winnerName}
        </span>
        <Stepper value={winsW} min={1} max={maxW === 99 ? 99 : maxW} onChange={handleWinsWChange} />
        <span className="text-gray-400 text-xs font-mono">—</span>
        <Stepper value={winsL} min={0} max={Math.max(0, winsW - 1)} onChange={setWinsL} />
        <span className="text-xs text-gray-500 max-w-[72px] truncate">{loserName}</span>
        <button
          onClick={() => handleSubmit(match.id, abs1, abs2)}
          className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-xs font-semibold transition-colors"
        >
          Submit
        </button>
        <button
          onClick={() => setSelectedWinner(null)}
          className="text-gray-400 hover:text-gray-600 px-2 py-1 text-xs"
        >
          ← back
        </button>
      </div>
    );
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-gray-100 text-gray-600 uppercase text-xs">
            <th className="px-4 py-2 text-left">Table</th>
            <th className="px-4 py-2 text-left">Player 1</th>
            <th className="px-4 py-2 text-center">Result</th>
            <th className="px-4 py-2 text-right">Player 2</th>
            {canReport && <th className="px-4 py-2 text-center">Report</th>}
          </tr>
        </thead>
        <tbody>
          {matches.map((match) => (
            <tr key={match.id} className="border-t border-gray-100 hover:bg-gray-50">
              <td className="px-4 py-3 text-gray-400 font-mono">{match.tableNumber}</td>
              <td
                className={`px-4 py-3 font-medium ${match.result === 'P1_WIN' ? 'text-green-700' : 'text-gray-800'}`}
              >
                {match.result === 'P1_WIN' && <span className="mr-1">⭐</span>}
                {renderPlayerName(match.player1.name, match.player1.playerId)}
              </td>
              <td className="px-4 py-3 text-center">{resultLabel(match)}</td>
              <td
                className={`px-4 py-3 text-right font-medium ${match.result === 'P2_WIN' ? 'text-green-700' : 'text-gray-500'}`}
              >
                {match.player2 ? (
                  renderPlayerName(match.player2.name, match.player2.playerId)
                ) : (
                  <span className="text-gray-300">BYE</span>
                )}
                {match.result === 'P2_WIN' && <span className="ml-1">⭐</span>}
              </td>
              {canReport && (
                <td className="px-4 py-3 text-center">
                  {editingMatch === match.id ? (
                    renderForm(match)
                  ) : match.result === 'PENDING' ? (
                    <button
                      onClick={() => openForm(match.id)}
                      className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1 rounded text-xs font-semibold"
                    >
                      Report
                    </button>
                  ) : match.result !== 'BYE' ? (
                    <button
                      onClick={() => openForm(match.id)}
                      className="text-gray-400 hover:text-gray-600 px-3 py-1 rounded text-xs"
                      title="Edit result"
                    >
                      Edit
                    </button>
                  ) : null}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

import { useState } from "react";
import { api, type MatchDetail } from "../api";

interface PairingsTableProps {
  matches: MatchDetail[];
  canReport: boolean;
  onUpdate: () => void;
}

export function PairingsTable({ matches, canReport, onUpdate }: PairingsTableProps) {
  const [reporting, setReporting] = useState<string | null>(null);
  const [wins1, setWins1] = useState(2);
  const [wins2, setWins2] = useState(0);

  const handleReport = async (matchId: string) => {
    try {
      await api.reportResult(matchId, { wins1, wins2, draws: 0 });
      setReporting(null);
      onUpdate();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error reporting result");
    }
  };

  const resultLabel = (match: MatchDetail) => {
    if (match.result === "BYE") return <span className="text-gray-400 text-xs">BYE</span>;
    if (match.result === "PENDING") return <span className="text-amber-500 text-xs">Pending</span>;
    if (match.result === "P1_WIN" || match.result === "P2_WIN")
      return <span className="text-green-600 text-xs font-semibold">{match.wins1}-{match.wins2}</span>;
    return <span className="text-gray-500 text-xs">Draw</span>;
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
              <td className={`px-4 py-3 font-medium ${match.result === "P1_WIN" ? "text-green-700" : "text-gray-800"}`}>
                {match.player1.name}
              </td>
              <td className="px-4 py-3 text-center">{resultLabel(match)}</td>
              <td className={`px-4 py-3 text-right font-medium ${match.result === "P2_WIN" ? "text-green-700" : "text-gray-500"}`}>
                {match.player2?.name ?? <span className="text-gray-300">BYE</span>}
              </td>
              {canReport && match.result === "PENDING" && (
                <td className="px-4 py-3 text-center">
                  {reporting === match.id ? (
                    <div className="flex items-center gap-1 justify-center flex-wrap">
                      <input
                        type="number" min={0} max={3} value={wins1}
                        onChange={(e) => setWins1(Number(e.target.value))}
                        className="w-12 border rounded px-2 py-1 text-center text-xs"
                      />
                      <span className="text-gray-400">-</span>
                      <input
                        type="number" min={0} max={3} value={wins2}
                        onChange={(e) => setWins2(Number(e.target.value))}
                        className="w-12 border rounded px-2 py-1 text-center text-xs"
                      />
                      <button
                        onClick={() => handleReport(match.id)}
                        className="bg-green-600 text-white px-2 py-1 rounded text-xs font-semibold"
                      >
                        Submit
                      </button>
                      <button
                        onClick={() => setReporting(null)}
                        className="text-gray-400 px-2 py-1 text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setReporting(match.id)}
                      className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1 rounded text-xs font-semibold"
                    >
                      Report
                    </button>
                  )}
                </td>
              )}
              {canReport && match.result !== "PENDING" && <td className="px-4 py-3" />}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

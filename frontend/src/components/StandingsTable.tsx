import type { Standing } from "../api";

interface StandingsTableProps {
  standings: Standing[];
}

export function StandingsTable({ standings }: StandingsTableProps) {
  if (standings.length === 0) {
    return <p className="text-gray-400 text-sm text-center py-8">No standings yet.</p>;
  }

  const medal = (rank: number) => {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return rank <= 8 ? "⭐" : "";
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-gray-100 text-gray-600 uppercase text-xs">
            <th className="px-4 py-2 text-left">Rank</th>
            <th className="px-4 py-2 text-left">Player</th>
            <th className="px-4 py-2 text-center">Pts</th>
            <th className="px-4 py-2 text-center">W-L-D</th>
            <th className="px-4 py-2 text-center">OMW%</th>
            <th className="px-4 py-2 text-center">GW%</th>
            <th className="px-4 py-2 text-center">OGW%</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s) => (
            <tr key={s.id} className={`border-t border-gray-100 hover:bg-gray-50 ${s.rank <= 8 ? "bg-amber-50" : ""}`}>
              <td className="px-4 py-3">
                <span className="font-mono text-gray-600">{s.rank}</span>{" "}
                <span>{medal(s.rank)}</span>
              </td>
              <td className="px-4 py-3 font-medium text-gray-800">{s.player.name}</td>
              <td className="px-4 py-3 text-center font-bold text-gray-800">{s.matchPoints}</td>
              <td className="px-4 py-3 text-center text-gray-600">
                {s.matchWins}-{s.matchLosses}-{s.matchDraws}
              </td>
              <td className="px-4 py-3 text-center text-gray-500">{(s.omwPercent * 100).toFixed(1)}%</td>
              <td className="px-4 py-3 text-center text-gray-500">{(s.gwPercent * 100).toFixed(1)}%</td>
              <td className="px-4 py-3 text-center text-gray-500">{(s.ogwPercent * 100).toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

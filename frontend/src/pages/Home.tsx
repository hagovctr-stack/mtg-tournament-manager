import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { api, type AddPlayerInput, type PlayerListItem, type Tournament, type CreateTournamentInput } from "../api";

type Section = "tournaments" | "players";
type CreateMode = Section | null;
type SortDirection = "asc" | "desc";
type PlayerSortKey =
  | "name"
  | "rating"
  | "tournamentsPlayed"
  | "matchRecord"
  | "matchWinRate"
  | "lastTournamentAt";

const TOURNAMENT_BATCH_SIZE = 3;
const PLAYER_PAGE_SIZE = 8;

function formatDate(value: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function statusBadge(status: Tournament["status"]) {
  const map = {
    REGISTRATION: "bg-blue-100 text-blue-700",
    ACTIVE: "bg-green-100 text-green-700",
    FINISHED: "bg-gray-100 text-gray-600",
  };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${map[status]}`}>
      {status}
    </span>
  );
}

function getPlayerSortValue(player: PlayerListItem, key: PlayerSortKey) {
  switch (key) {
    case "name":
      return player.name.toLowerCase();
    case "rating":
      return player.rating;
    case "tournamentsPlayed":
      return player.stats.tournamentsPlayed;
    case "matchRecord":
      return player.stats.matchWins * 3 + player.stats.matchDraws;
    case "matchWinRate":
      return player.stats.matchWinRate;
    case "lastTournamentAt":
      return player.stats.lastTournamentAt ? new Date(player.stats.lastTournamentAt).getTime() : 0;
    default:
      return player.rating;
  }
}

export function Home() {
  const location = useLocation();
  const [section, setSection] = useState<Section>(
    (location.state as any)?.section === "players" ? "players" : "tournaments"
  );
  const [createMode, setCreateMode] = useState<CreateMode>(null);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [players, setPlayers] = useState<PlayerListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [tournamentName, setTournamentName] = useState("");
  const [rounds, setRounds] = useState(3);
  const [bestOfFormat, setBestOfFormat] = useState("BO3");
  const [tournamentFormat, setTournamentFormat] = useState("Cube");
  const [tournamentSubtitle, setTournamentSubtitle] = useState("");
  const [cubeCobraUrl, setCubeCobraUrl] = useState("");
  const [tournamentQuery, setTournamentQuery] = useState("");
  const [visibleTournamentCount, setVisibleTournamentCount] = useState(TOURNAMENT_BATCH_SIZE);

  const [playerName, setPlayerName] = useState("");
  const [playerDci, setPlayerDci] = useState("");
  const [playerElo, setPlayerElo] = useState("1500");
  const [playerQuery, setPlayerQuery] = useState("");
  const [playerPage, setPlayerPage] = useState(1);
  const [playerSortKey, setPlayerSortKey] = useState<PlayerSortKey>("rating");
  const [playerSortDirection, setPlayerSortDirection] = useState<SortDirection>("desc");
  const [submitting, setSubmitting] = useState(false);
  const [deletingPlayerId, setDeletingPlayerId] = useState<string | null>(null);

  useEffect(() => {
    document.title = "MTG Tournament Manager";
  }, []);

  useEffect(() => {
    refreshHome();
  }, []);

  async function refreshHome() {
    let nextTournaments: Tournament[] = [];
    let nextPlayers: PlayerListItem[] = [];

    setLoading(true);
    try {
      [nextTournaments, nextPlayers] = await Promise.all([api.listTournaments(), api.listPlayers()]);
      setTournaments(nextTournaments);
      setPlayers(nextPlayers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load home data");
    } finally {
      setLoading(false);
    }
  }

  const filteredTournaments = tournaments.filter((tournament) => {
    const query = tournamentQuery.trim().toLowerCase();
    if (!query) return true;
    const createdAt = formatDate(tournament.createdAt).toLowerCase();
    return (
      tournament.name.toLowerCase().includes(query) ||
      tournament.format.toLowerCase().includes(query) ||
      tournament.subtitle.toLowerCase().includes(query) ||
      tournament.bestOfFormat.toLowerCase().includes(query) ||
      tournament.status.toLowerCase().includes(query) ||
      createdAt.includes(query) ||
      tournament.createdAt.toLowerCase().includes(query)
    );
  });

  const filteredPlayers = players.filter((player) => {
    const query = playerQuery.trim().toLowerCase();
    if (!query) return true;
    return (
      player.name.toLowerCase().includes(query) ||
      player.normalizedName.includes(query) ||
      (player.dciNumber ?? "").toLowerCase().includes(query)
    );
  });

  const sortedPlayers = [...filteredPlayers].sort((left, right) => {
    const leftValue = getPlayerSortValue(left, playerSortKey);
    const rightValue = getPlayerSortValue(right, playerSortKey);

    if (typeof leftValue === "string" && typeof rightValue === "string") {
      const comparison = leftValue.localeCompare(rightValue);
      return playerSortDirection === "asc" ? comparison : -comparison;
    }

    const comparison = Number(leftValue) - Number(rightValue);
    if (comparison === 0) {
      return left.name.localeCompare(right.name);
    }
    return playerSortDirection === "asc" ? comparison : -comparison;
  });

  const totalPlayerPages = Math.max(1, Math.ceil(sortedPlayers.length / PLAYER_PAGE_SIZE));
  const clampedPlayerPage = Math.min(playerPage, totalPlayerPages);
  const pagedPlayers = sortedPlayers.slice(
    (clampedPlayerPage - 1) * PLAYER_PAGE_SIZE,
    clampedPlayerPage * PLAYER_PAGE_SIZE
  );
  const visibleTournaments = filteredTournaments.slice(0, visibleTournamentCount);

  const openCreateForm = () => {
    setError("");
    setCreateMode(section);
  };

  const resetCreateForm = () => {
    setCreateMode(null);
    setTournamentName("");
    setRounds(3);
    setBestOfFormat("BO3");
    setTournamentFormat("Cube");
    setTournamentSubtitle("");
    setCubeCobraUrl("");
    setPlayerName("");
    setPlayerDci("");
    setPlayerElo("1500");
    setSubmitting(false);
  };

  const handleCreateTournament = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tournamentName.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const input: CreateTournamentInput = {
        name: tournamentName.trim(),
        format: tournamentFormat,
        subtitle: tournamentSubtitle.trim() || undefined,
        cubeCobraUrl: cubeCobraUrl.trim() || undefined,
        bestOfFormat,
        totalRounds: rounds,
      };
      const tournament = await api.createTournament(input);
      setTournaments((prev) => [tournament, ...prev]);
      setSection("tournaments");
      setVisibleTournamentCount(TOURNAMENT_BATCH_SIZE);
      resetCreateForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error creating tournament");
      setSubmitting(false);
    }
  };

  const handleCreatePlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim()) return;
    setSubmitting(true);
    setError("");

    const payload: AddPlayerInput = {
      name: playerName.trim(),
      dciNumber: playerDci.trim() || undefined,
    };
    const parsedElo = parseInt(playerElo, 10);
    if (!Number.isNaN(parsedElo)) {
      payload.elo = parsedElo;
    }

    try {
      const player = await api.createPlayer(payload);
      setPlayers((prev) => [player, ...prev]);
      setSection("players");
      setPlayerPage(1);
      resetCreateForm();
    } catch (err) {
      if (err instanceof Error && (err as any).code === "DUPLICATE_NAME") {
        const confirmed = window.confirm(`${err.message}\n\nCreate another player with this name anyway?`);
        if (confirmed) {
          try {
            const player = await api.createPlayer(payload, true);
            setPlayers((prev) => [player, ...prev]);
            setSection("players");
            setPlayerPage(1);
            resetCreateForm();
            return;
          } catch (innerErr) {
            setError(innerErr instanceof Error ? innerErr.message : "Error creating player");
          }
        }
      } else {
        setError(err instanceof Error ? err.message : "Error creating player");
      }
      setSubmitting(false);
    }
  };

  const togglePlayerSort = (key: PlayerSortKey) => {
    if (playerSortKey === key) {
      setPlayerSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setPlayerSortKey(key);
    setPlayerSortDirection(key === "name" || key === "lastTournamentAt" ? "asc" : "desc");
  };

  const sortIndicator = (key: PlayerSortKey) => {
    if (playerSortKey !== key) return "";
    return playerSortDirection === "asc" ? " ↑" : " ↓";
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <img
            src="/mtg-planeswalker.svg"
            alt="Magic: The Gathering planeswalker symbol"
            className="w-9 shrink-0"
          />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">MTG Tournament Manager</h1>
            <p className="text-gray-500 text-sm">Swiss events, player history, and live ELO tracking</p>
          </div>
        </div>
        <button
          onClick={openCreateForm}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-semibold text-sm"
        >
          {section === "players" ? "+ Add Player" : "+ New Tournament"}
        </button>
      </div>

      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-2 shadow-sm">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => {
              setSection("tournaments");
              setCreateMode(null);
            }}
            className={`rounded-lg px-4 py-3 text-sm font-semibold transition-colors ${
              section === "tournaments"
                ? "bg-gray-900 text-white"
                : "bg-transparent text-gray-600 hover:bg-gray-100"
            }`}
          >
            Tournaments
          </button>
          <button
            onClick={() => {
              setSection("players");
              setCreateMode(null);
            }}
            className={`rounded-lg px-4 py-3 text-sm font-semibold transition-colors ${
              section === "players"
                ? "bg-gray-900 text-white"
                : "bg-transparent text-gray-600 hover:bg-gray-100"
            }`}
          >
            Players
          </button>
        </div>
      </div>

      {createMode === "tournaments" && (
        <div className="mb-6 p-5 border border-blue-200 rounded-lg bg-blue-50">
          <h2 className="font-semibold text-gray-800 mb-3">Create Tournament</h2>
          <form onSubmit={handleCreateTournament} className="space-y-3">
            <input
              autoFocus
              type="text"
              placeholder="Tournament name"
              value={tournamentName}
              onChange={(e) => setTournamentName(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">Game Format</label>
                <select
                  value={tournamentFormat}
                  onChange={(e) => setTournamentFormat(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Draft">Draft</option>
                  <option value="Sealed">Sealed</option>
                  <option value="Cube">Cube</option>
                  <option value="Standard">Standard</option>
                  <option value="Pioneer">Pioneer</option>
                  <option value="Modern">Modern</option>
                  <option value="Legacy">Legacy</option>
                  <option value="Vintage">Vintage</option>
                  <option value="Pauper">Pauper</option>
                  <option value="Commander">Commander</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">Subtitle (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. OTJ, Premodern…"
                  value={tournamentSubtitle}
                  onChange={(e) => setTournamentSubtitle(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            {tournamentFormat === "Cube" && (
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Cube Cobra URL (optional)</label>
              <input
                type="url"
                placeholder="https://cubecobra.com/cube/list/…"
                value={cubeCobraUrl}
                onChange={(e) => setCubeCobraUrl(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            )}
            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-600">Rounds:</label>
              <div className="flex items-center border border-gray-300 rounded overflow-hidden">
                <button
                  type="button"
                  onClick={() => setRounds((current) => Math.max(1, current - 1))}
                  className="px-3 py-2 text-gray-600 hover:bg-gray-100 text-sm font-semibold"
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  max={15}
                  value={rounds}
                  onChange={(e) => {
                    const value = parseInt(e.target.value, 10);
                    if (!Number.isNaN(value)) {
                      setRounds(Math.min(15, Math.max(1, value)));
                    }
                  }}
                  className="w-10 text-center text-sm font-medium text-gray-800 border-none outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <button
                  type="button"
                  onClick={() => setRounds((current) => Math.min(15, current + 1))}
                  className="px-3 py-2 text-gray-600 hover:bg-gray-100 text-sm font-semibold"
                >
                  +
                </button>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-600">Format:</label>
              <select
                value={bestOfFormat}
                onChange={(e) => setBestOfFormat(e.target.value)}
                className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="BO1">Best of 1</option>
                <option value="BO3">Best of 3</option>
                <option value="BO5">Best of 5</option>
                <option value="FREE">Free (no restriction)</option>
              </select>
            </div>
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm font-semibold disabled:opacity-50"
              >
                {submitting ? "Creating..." : "Create Tournament"}
              </button>
              <button
                type="button"
                onClick={resetCreateForm}
                className="px-4 py-2 rounded text-sm text-gray-600 hover:bg-gray-200"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {createMode === "players" && (
        <div className="mb-6 p-5 border border-emerald-200 rounded-lg bg-emerald-50">
          <h2 className="font-semibold text-gray-800 mb-3">Create Player</h2>
          <form onSubmit={handleCreatePlayer} className="space-y-3">
            <input
              autoFocus
              type="text"
              placeholder="Player name"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                type="text"
                placeholder="DCI # (optional)"
                value={playerDci}
                onChange={(e) => setPlayerDci(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <input
                type="number"
                min={1}
                placeholder="Starting ELO"
                value={playerElo}
                onChange={(e) => setPlayerElo(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded text-sm font-semibold disabled:opacity-50"
              >
                {submitting ? "Creating..." : "Create Player"}
              </button>
              <button
                type="button"
                onClick={resetCreateForm}
                className="px-4 py-2 rounded text-sm text-gray-600 hover:bg-gray-200"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {error && !createMode && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {section === "tournaments" && (
        <section className="space-y-4">
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Recent tournaments</h2>
              <p className="text-sm text-gray-500">
                Showing {Math.min(visibleTournaments.length, filteredTournaments.length)} of {filteredTournaments.length} matching tournaments.
              </p>
            </div>
            <input
              type="search"
              value={tournamentQuery}
              onChange={(e) => {
                setTournamentQuery(e.target.value);
                setVisibleTournamentCount(TOURNAMENT_BATCH_SIZE);
              }}
              placeholder="Search by name, format, status, or date"
              className="w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {loading && tournaments.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white px-6 py-12 text-center text-sm text-gray-400">
              Loading tournaments...
            </div>
          ) : filteredTournaments.length === 0 ? (
            <div className="text-center rounded-xl border border-dashed border-gray-200 bg-white py-16 text-gray-400">
              {tournaments.length === 0 ? (
                <>
                  <div className="mb-3 text-4xl grayscale opacity-60">🏆</div>
                  <p>No tournaments yet. Create one to get started.</p>
                </>
              ) : (
                <p>No tournaments match that search.</p>
              )}
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {visibleTournaments.map((tournament) => (
                  <Link
                    key={tournament.id}
                    to={`/tournament/${tournament.id}`}
                    className="block rounded-xl border border-gray-200 bg-white p-5 hover:border-blue-300 hover:shadow-sm transition-all"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold text-gray-800">{tournament.name}</p>
                        <p className="mt-1 text-xs text-gray-500">
                          {tournament.format}{tournament.subtitle ? ` · ${tournament.subtitle}` : ""} · {tournament._count?.players ?? 0} players · {tournament.bestOfFormat} · Round {tournament.currentRound}/{tournament.totalRounds || "?"}
                        </p>
                        <p className="mt-2 text-xs text-gray-400">Created {formatDate(tournament.createdAt)}</p>
                      </div>
                      {statusBadge(tournament.status)}
                    </div>
                  </Link>
                ))}
              </div>

              {filteredTournaments.length > TOURNAMENT_BATCH_SIZE && (
                <div className="flex items-center gap-3 pt-2">
                  {visibleTournamentCount < filteredTournaments.length && (
                    <button
                      onClick={() => setVisibleTournamentCount((current) => current + TOURNAMENT_BATCH_SIZE)}
                      className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                    >
                      Show more
                    </button>
                  )}
                  {visibleTournamentCount > TOURNAMENT_BATCH_SIZE && (
                    <button
                      onClick={() => setVisibleTournamentCount(TOURNAMENT_BATCH_SIZE)}
                      className="rounded-lg px-4 py-2 text-sm font-semibold text-gray-500 hover:bg-gray-100"
                    >
                      Show less
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      )}

      {section === "players" && (
        <section className="space-y-4">
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Players</h2>
              <p className="text-sm text-gray-500">
                Lifetime summaries with sortable columns, current ELO, and recent tournament activity.
              </p>
            </div>
            <input
              type="search"
              value={playerQuery}
              onChange={(e) => {
                setPlayerQuery(e.target.value);
                setPlayerPage(1);
              }}
              placeholder="Search by name or DCI"
              className="w-full max-w-xs rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3 text-left">
                    <button onClick={() => togglePlayerSort("name")} className="font-semibold hover:text-gray-700">
                      Player{sortIndicator("name")}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <button onClick={() => togglePlayerSort("rating")} className="font-semibold hover:text-gray-700">
                      ELO{sortIndicator("rating")}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <button onClick={() => togglePlayerSort("tournamentsPlayed")} className="font-semibold hover:text-gray-700">
                      Tournaments{sortIndicator("tournamentsPlayed")}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <button onClick={() => togglePlayerSort("matchRecord")} className="font-semibold hover:text-gray-700">
                      Match Record{sortIndicator("matchRecord")}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <button onClick={() => togglePlayerSort("matchWinRate")} className="font-semibold hover:text-gray-700">
                      Match WR{sortIndicator("matchWinRate")}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <button onClick={() => togglePlayerSort("lastTournamentAt")} className="font-semibold hover:text-gray-700">
                      Last Tournament{sortIndicator("lastTournamentAt")}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right" colSpan={2}>History</th>
                </tr>
              </thead>
              <tbody>
                {loading && players.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-gray-400">
                      Loading players...
                    </td>
                  </tr>
                ) : pagedPlayers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-gray-400">
                      No players match that search.
                    </td>
                  </tr>
                ) : (
                  pagedPlayers.map((player) => (
                    <tr key={player.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <Link to={`/players/${player.id}`} className="flex items-center gap-3 group">
                          <div className="w-8 h-8 rounded-full overflow-hidden border border-gray-200 bg-gray-100 flex items-center justify-center shrink-0 group-hover:ring-2 group-hover:ring-blue-100 transition-all">
                            {player.avatarUrl ? (
                              <img src={player.avatarUrl} alt={player.name} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-xs font-bold text-gray-400">{player.name.charAt(0).toUpperCase()}</span>
                            )}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-800 group-hover:text-blue-600 transition-colors">{player.name}</p>
                            <p className="text-xs text-gray-400">{player.dciNumber ?? "No DCI"}</p>
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-900">{player.rating}</td>
                      <td className="px-4 py-3 text-gray-600">{player.stats.tournamentsPlayed}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {player.stats.matchWins}-{player.stats.matchLosses}-{player.stats.matchDraws}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{formatPercent(player.stats.matchWinRate)}</td>
                      <td className="px-4 py-3 text-gray-500">{formatDate(player.stats.lastTournamentAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          to={`/players/${player.id}`}
                          className="font-semibold text-blue-600 hover:text-blue-700"
                        >
                          View history
                        </Link>
                      </td>
                      <td className="px-2 py-3 text-right">
                        <button
                          disabled={deletingPlayerId === player.id}
                          onClick={async () => {
                            if (!window.confirm(`Delete "${player.name}" permanently? This cannot be undone.`)) return;
                            setDeletingPlayerId(player.id);
                            try {
                              await api.deletePlayer(player.id);
                              setPlayers((prev) => prev.filter((p) => p.id !== player.id));
                            } catch (err) {
                              alert(err instanceof Error ? err.message : "Failed to delete player");
                            } finally {
                              setDeletingPlayerId(null);
                            }
                          }}
                          className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                          title="Delete player"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {sortedPlayers.length > PLAYER_PAGE_SIZE && (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm text-gray-500">
                Page {clampedPlayerPage} of {totalPlayerPages}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPlayerPage((current) => Math.max(1, current - 1))}
                  disabled={clampedPlayerPage === 1}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPlayerPage((current) => Math.min(totalPlayerPages, current + 1))}
                  disabled={clampedPlayerPage === totalPlayerPages}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

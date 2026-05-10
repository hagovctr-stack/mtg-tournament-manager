import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import {
  api,
  type AddPlayerInput,
  type CreateEventInput,
  type CreateLeagueInput,
  type CreateTournamentInput,
  type EventSummary,
  type League,
  type PlayerListItem,
  type TeamMode,
  type TeamSetupTiming,
  type Tournament,
} from '../api';
import { useAuth } from '../auth';
import { PageHeader } from '../components/PageHeader';
import { PlayerAvatar } from '../components/PlayerAvatar';

type WorkspaceKey = 'dashboard' | 'tournaments' | 'leagues' | 'events' | 'players';
type ComposePanel = 'tournament' | 'league' | 'event' | 'player';

const PLAYERS_PER_PAGE_OPTIONS = [5, 10, 25, 50] as const;

const fieldClass =
  'w-full rounded-xl border border-stone-200 bg-white/92 px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-rose-300 focus:ring-4 focus:ring-rose-100';
const selectClass = fieldClass;

function formatDate(value: string | null) {
  if (!value) return 'Never';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function workspaceFromPath(pathname: string): WorkspaceKey {
  if (pathname === '/tournaments') return 'tournaments';
  if (pathname === '/leagues') return 'leagues';
  if (pathname === '/events') return 'events';
  if (pathname === '/players') return 'players';
  return 'dashboard';
}

function shellCardClass(emphasis = false) {
  return `rounded-[1.45rem] border px-5 py-5 shadow-[0_18px_48px_rgba(15,23,42,0.06)] ${
    emphasis ? 'border-rose-200/80 bg-rose-50/50' : 'border-stone-200 bg-white'
  }`;
}

function MetricCard({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <article className={`${shellCardClass()} text-center`}>
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.3em] text-slate-500">
        {label}
      </p>
      <p className="mt-3 font-serif text-4xl font-semibold tracking-tight text-slate-950">
        {value}
      </p>
      {note && <p className="mt-1.5 text-sm text-slate-600">{note}</p>}
    </article>
  );
}

function SectionCard({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={shellCardClass()}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-serif text-[1.9rem] font-semibold tracking-tight text-slate-950">
            {title}
          </h2>
          {description && <p className="mt-1.5 text-sm text-slate-600">{description}</p>}
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function SummaryBadge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-stone-200 bg-white/80 px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-slate-600">
      {children}
    </span>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-[1.25rem] border border-dashed border-stone-200 bg-stone-50/80 px-5 py-10 text-center text-sm text-slate-500">
      {message}
    </div>
  );
}

function HomeIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    >
      <path d="m3 10.5 9-7 9 7" />
      <path d="M5 9.5V20h14V9.5" />
      <path d="M9 20v-6h6v6" />
    </svg>
  );
}

export function Home() {
  const { canManage } = useAuth();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const workspace = workspaceFromPath(location.pathname);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [players, setPlayers] = useState<PlayerListItem[]>([]);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [leagueFilter, setLeagueFilter] = useState('');
  const [composePanel, setComposePanel] = useState<ComposePanel>('tournament');

  const [tournamentName, setTournamentName] = useState('');
  const [tournamentFormat, setTournamentFormat] = useState('Cube');
  const [rounds, setRounds] = useState('3');
  const [bestOfFormat, setBestOfFormat] = useState('BO3');
  const [tournamentSubtitle, setTournamentSubtitle] = useState('');
  const [cubeCobraUrl, setCubeCobraUrl] = useState('');
  const [tournamentLeagueId, setTournamentLeagueId] = useState('');
  const [teamMode, setTeamMode] = useState<TeamMode>('NONE');
  const [teamSetupTiming, setTeamSetupTiming] = useState<TeamSetupTiming>('BEFORE_DRAFT');

  const [playerName, setPlayerName] = useState('');
  const [playerDci, setPlayerDci] = useState('');
  const [playerElo, setPlayerElo] = useState('1500');

  const [leagueName, setLeagueName] = useState('');
  const [leagueStartsAt, setLeagueStartsAt] = useState('');
  const [leagueEndsAt, setLeagueEndsAt] = useState('');

  const [eventName, setEventName] = useState('');
  const [eventTemplate, setEventTemplate] =
    useState<CreateEventInput['template']>('single_pod_to_top8');
  const [eventPodCount, setEventPodCount] = useState('2');
  const [eventTopCutSize, setEventTopCutSize] = useState('8');
  const [submitting, setSubmitting] = useState(false);
  const [playerPage, setPlayerPage] = useState(1);
  const [playerSearch, setPlayerSearch] = useState('');
  const [playersPerPage, setPlayersPerPage] = useState<5 | 10 | 25 | 50>(5);

  async function refreshHome() {
    setLoading(true);
    setError('');
    try {
      const [nextTournaments, nextPlayers, nextLeagues, nextEvents] = await Promise.all([
        api.listTournaments(),
        api.listPlayers(leagueFilter || undefined),
        api.listLeagues(),
        api.listEvents(),
      ]);
      setTournaments(nextTournaments);
      setPlayers(nextPlayers);
      setLeagues(nextLeagues);
      setEvents(nextEvents);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const requestedPanel = searchParams.get('compose');
    if (
      requestedPanel === 'tournament' ||
      requestedPanel === 'league' ||
      requestedPanel === 'event' ||
      requestedPanel === 'player'
    ) {
      setComposePanel(requestedPanel);
    }
  }, [searchParams]);

  useEffect(() => {
    const label =
      workspace === 'dashboard'
        ? 'MTG Tournament Manager'
        : `${workspace[0].toUpperCase()}${workspace.slice(1)} | MTG Tournament Manager`;
    document.title = label;
  }, [workspace]);

  useEffect(() => {
    void refreshHome();
    setPlayerPage(1);
    setPlayerSearch('');
  }, [leagueFilter]);

  const sortedPlayers = useMemo(
    () =>
      [...players].sort((left, right) => {
        const lPts = left.stats.matchWins * 3 + left.stats.matchDraws;
        const rPts = right.stats.matchWins * 3 + right.stats.matchDraws;
        if (lPts !== rPts) return rPts - lPts;
        if (left.stats.trophies !== right.stats.trophies)
          return right.stats.trophies - left.stats.trophies;
        if (left.stats.teamDraftTrophies !== right.stats.teamDraftTrophies)
          return right.stats.teamDraftTrophies - left.stats.teamDraftTrophies;
        if (left.stats.matchWins !== right.stats.matchWins)
          return right.stats.matchWins - left.stats.matchWins;
        return left.name.localeCompare(right.name);
      }),
    [players],
  );

  const filteredPlayers = useMemo(() => {
    const q = playerSearch.trim().toLowerCase();
    if (!q) return sortedPlayers;
    return sortedPlayers.filter((p) => p.name.toLowerCase().includes(q));
  }, [sortedPlayers, playerSearch]);

  const featuredTournaments = useMemo(
    () =>
      [...tournaments]
        .sort((left, right) => +new Date(right.updatedAt) - +new Date(left.updatedAt))
        .slice(0, workspace === 'dashboard' ? 6 : 12),
    [tournaments, workspace],
  );

  const featuredLeagues = useMemo(
    () =>
      [...leagues]
        .sort((left, right) => +new Date(right.startsAt) - +new Date(left.startsAt))
        .slice(0, workspace === 'dashboard' ? 4 : 12),
    [leagues, workspace],
  );

  const featuredEvents = useMemo(
    () =>
      [...events]
        .sort((left, right) => +new Date(right.updatedAt) - +new Date(left.updatedAt))
        .slice(0, workspace === 'dashboard' ? 4 : 12),
    [events, workspace],
  );

  const activeTournaments = tournaments.filter((tournament) => tournament.status === 'ACTIVE');
  const finishedTournaments = tournaments.filter((tournament) => tournament.status === 'FINISHED');
  const pageCopy = {
    dashboard: {
      eyebrow: 'Dashboard',
      title: 'Tournament desk.',
    },
    tournaments: {
      eyebrow: 'Tournaments',
      title: 'All tournaments.',
    },
    leagues: {
      eyebrow: 'Leagues',
      title: 'Season windows.',
    },
    events: {
      eyebrow: 'Events',
      title: 'Stage-based events.',
    },
    players: {
      eyebrow: 'Players',
      title: 'Player archive.',
    },
  }[workspace];

  const openCompose = (panel: ComposePanel) => {
    setComposePanel(panel);
    if (workspace === 'dashboard') {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set('compose', panel);
      setSearchParams(nextParams, { replace: true });
    }
  };

  const createTournament = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!tournamentName.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const input: CreateTournamentInput = {
        name: tournamentName.trim(),
        format: tournamentFormat,
        subtitle: tournamentSubtitle.trim() || undefined,
        cubeCobraUrl: cubeCobraUrl.trim() || undefined,
        bestOfFormat,
        totalRounds: parseInt(rounds, 10) || undefined,
        leagueId: tournamentLeagueId || null,
        teamMode,
        teamSetupTiming,
      };
      await api.createTournament(input);
      setTournamentName('');
      setTournamentSubtitle('');
      setCubeCobraUrl('');
      setTournamentLeagueId('');
      setTeamMode('NONE');
      setTeamSetupTiming('BEFORE_DRAFT');
      await refreshHome();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error creating tournament');
    } finally {
      setSubmitting(false);
    }
  };

  const createPlayer = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!playerName.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const payload: AddPlayerInput = {
        name: playerName.trim(),
        dciNumber: playerDci.trim() || undefined,
        elo: parseInt(playerElo, 10) || 1500,
      };
      await api.createPlayer(payload);
      setPlayerName('');
      setPlayerDci('');
      setPlayerElo('1500');
      await refreshHome();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error creating player');
    } finally {
      setSubmitting(false);
    }
  };

  const createLeague = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!leagueName.trim() || !leagueStartsAt || !leagueEndsAt) return;
    setSubmitting(true);
    setError('');
    try {
      const payload: CreateLeagueInput = {
        name: leagueName.trim(),
        startsAt: leagueStartsAt,
        endsAt: leagueEndsAt,
      };
      await api.createLeague(payload);
      setLeagueName('');
      setLeagueStartsAt('');
      setLeagueEndsAt('');
      await refreshHome();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error creating league');
    } finally {
      setSubmitting(false);
    }
  };

  const createEvent = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!eventName.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      await api.createEvent({
        name: eventName.trim(),
        template: eventTemplate,
        format: tournamentFormat,
        bestOfFormat,
        podCount: parseInt(eventPodCount, 10) || undefined,
        topCutSize: parseInt(eventTopCutSize, 10) || undefined,
      });
      setEventName('');
      await refreshHome();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error creating event');
    } finally {
      setSubmitting(false);
    }
  };

  const tournamentForm = (
    <form onSubmit={createTournament} className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <input
          value={tournamentName}
          onChange={(event) => setTournamentName(event.target.value)}
          placeholder="Tournament name"
          className={fieldClass}
        />
        <input
          value={rounds}
          onChange={(event) => setRounds(event.target.value)}
          placeholder="Planned rounds"
          className={fieldClass}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <select
          value={tournamentFormat}
          onChange={(event) => setTournamentFormat(event.target.value)}
          className={selectClass}
        >
          {[
            'Cube',
            'Draft',
            'Sealed',
            'Standard',
            'Pioneer',
            'Modern',
            'Legacy',
            'Vintage',
            'Pauper',
            'Commander',
          ].map((format) => (
            <option key={format} value={format}>
              {format}
            </option>
          ))}
        </select>
        <select
          value={bestOfFormat}
          onChange={(event) => setBestOfFormat(event.target.value)}
          className={selectClass}
        >
          {['BO1', 'BO3', 'BO5', 'FREE'].map((format) => (
            <option key={format} value={format}>
              {format}
            </option>
          ))}
        </select>
        <select
          value={teamMode}
          onChange={(event) => setTeamMode(event.target.value as TeamMode)}
          className={selectClass}
        >
          <option value="NONE">Individual</option>
          <option value="TEAM_DRAFT_3V3">Team Draft 3v3</option>
        </select>
        <select
          value={tournamentLeagueId}
          onChange={(event) => setTournamentLeagueId(event.target.value)}
          className={selectClass}
        >
          <option value="">No league</option>
          {leagues.map((league) => (
            <option key={league.id} value={league.id}>
              {league.name}
            </option>
          ))}
        </select>
      </div>
      {teamMode === 'TEAM_DRAFT_3V3' && (
        <div className="grid gap-4 md:grid-cols-2">
          <select
            value={teamSetupTiming}
            onChange={(event) => setTeamSetupTiming(event.target.value as TeamSetupTiming)}
            className={selectClass}
          >
            <option value="BEFORE_DRAFT">Teams before draft</option>
            <option value="AFTER_DRAFT">Teams after draft</option>
          </select>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {teamSetupTiming === 'BEFORE_DRAFT'
              ? 'Assign teams first, then randomize seats so opponents alternate around the pod.'
              : 'Draft as individuals, then assign teams before round 1 to remove hate-drafting incentives.'}
          </div>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <input
          value={tournamentSubtitle}
          onChange={(event) => setTournamentSubtitle(event.target.value)}
          placeholder="Subtitle"
          className={fieldClass}
        />
        <input
          value={cubeCobraUrl}
          onChange={(event) => setCubeCobraUrl(event.target.value)}
          placeholder="Cube Cobra URL"
          className={fieldClass}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
        >
          Create Tournament
        </button>
      </div>
    </form>
  );

  const leagueForm = (
    <form onSubmit={createLeague} className="space-y-4">
      <input
        value={leagueName}
        onChange={(event) => setLeagueName(event.target.value)}
        placeholder="League name"
        className={fieldClass}
      />
      <div className="grid gap-4 md:grid-cols-2">
        <input
          type="date"
          value={leagueStartsAt}
          onChange={(event) => setLeagueStartsAt(event.target.value)}
          className={fieldClass}
        />
        <input
          type="date"
          value={leagueEndsAt}
          onChange={(event) => setLeagueEndsAt(event.target.value)}
          className={fieldClass}
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="rounded-xl bg-rose-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:opacity-50"
      >
        Create League
      </button>
    </form>
  );

  const eventForm = (
    <form onSubmit={createEvent} className="space-y-4">
      <input
        value={eventName}
        onChange={(event) => setEventName(event.target.value)}
        placeholder="Event name"
        className={fieldClass}
      />
      <div className="grid gap-4 xl:grid-cols-4">
        <select
          value={eventTemplate}
          onChange={(event) => setEventTemplate(event.target.value as CreateEventInput['template'])}
          className={selectClass}
        >
          <option value="single_pod_to_top8">Single Pod to Top 8</option>
          <option value="multi_pod_to_top8">Multi Pod to Top 8</option>
          <option value="double_draft_then_top8">Double Draft then Top 8</option>
        </select>
        <input
          value={eventPodCount}
          onChange={(event) => setEventPodCount(event.target.value)}
          placeholder="Pods"
          className={fieldClass}
        />
        <input
          value={eventTopCutSize}
          onChange={(event) => setEventTopCutSize(event.target.value)}
          placeholder="Top cut"
          className={fieldClass}
        />
        <select
          value={tournamentFormat}
          onChange={(event) => setTournamentFormat(event.target.value)}
          className={selectClass}
        >
          {['Cube', 'Draft', 'Sealed', 'Modern', 'Legacy', 'Pioneer'].map((format) => (
            <option key={format} value={format}>
              {format}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
      >
        Create Event
      </button>
    </form>
  );

  const playerForm = (
    <form onSubmit={createPlayer} className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr_1fr]">
        <input
          value={playerName}
          onChange={(event) => setPlayerName(event.target.value)}
          placeholder="Player name"
          className={fieldClass}
        />
        <input
          value={playerDci}
          onChange={(event) => setPlayerDci(event.target.value)}
          placeholder="DCI number"
          className={fieldClass}
        />
        <input
          value={playerElo}
          onChange={(event) => setPlayerElo(event.target.value)}
          placeholder="1500"
          className={fieldClass}
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="rounded-xl bg-sky-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-600 disabled:opacity-50"
      >
        Add Player
      </button>
    </form>
  );

  const composerSection =
    canManage &&
    (workspace === 'dashboard' ? (
      <SectionCard
        title="Quick Create"
        action={
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['tournament', 'Tournament'],
                ['league', 'League'],
                ['event', 'Event'],
                ['player', 'Player'],
              ] as Array<[ComposePanel, string]>
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => openCompose(value)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  composePanel === value
                    ? 'bg-slate-950 text-white'
                    : 'border border-stone-200 bg-white text-slate-600 hover:border-stone-300 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        }
      >
        {composePanel === 'tournament' && tournamentForm}
        {composePanel === 'league' && leagueForm}
        {composePanel === 'event' && eventForm}
        {composePanel === 'player' && playerForm}
      </SectionCard>
    ) : workspace === 'tournaments' ? (
      <SectionCard title="Create Tournament">{tournamentForm}</SectionCard>
    ) : workspace === 'leagues' ? (
      <SectionCard title="Create League">{leagueForm}</SectionCard>
    ) : workspace === 'events' ? (
      <SectionCard title="Create Event">{eventForm}</SectionCard>
    ) : workspace === 'players' ? (
      <SectionCard title="Add Player">{playerForm}</SectionCard>
    ) : null);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={pageCopy.eyebrow}
        title={pageCopy.title}
        compact
        meta={
          <>
            <SummaryBadge>
              {activeTournaments.length} live{' '}
              {activeTournaments.length === 1 ? 'tournament' : 'tournaments'}
            </SummaryBadge>
            <SummaryBadge>
              {leagues.length} {leagues.length === 1 ? 'league' : 'leagues'}
            </SummaryBadge>
            <SummaryBadge>
              {players.length} tracked {players.length === 1 ? 'player' : 'players'}
            </SummaryBadge>
          </>
        }
        actions={
          workspace === 'dashboard' ? undefined : (
            <Link
              to="/"
              aria-label="Dashboard"
              title="Dashboard"
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-slate-950 text-white transition hover:bg-slate-800"
            >
              <HomeIcon className="h-5 w-5" />
              <span className="sr-only">Dashboard</span>
            </Link>
          )
        }
      />

      {error && (
        <div className="rounded-[1.2rem] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700 shadow-sm">
          {error}
        </div>
      )}

      {workspace === 'dashboard' && (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Live Tournaments"
            value={String(activeTournaments.length)}
            note={
              activeTournaments.length > 0 ? (activeTournaments[0]?.name ?? undefined) : undefined
            }
          />
          <MetricCard label="Finished Events" value={String(finishedTournaments.length)} />
          <MetricCard
            label="Tracked Players"
            value={String(players.length)}
            note={
              leagueFilter
                ? (leagues.find((league) => league.id === leagueFilter)?.name ?? 'Filtered')
                : undefined
            }
          />
          <MetricCard
            label="Last Tournament"
            value={
              tournaments.length > 0
                ? formatDate(
                    tournaments.reduce((a, b) =>
                      new Date(a.updatedAt) > new Date(b.updatedAt) ? a : b,
                    ).updatedAt,
                  )
                : '—'
            }
            note={
              tournaments.length > 0
                ? tournaments.reduce((a, b) =>
                    new Date(a.updatedAt) > new Date(b.updatedAt) ? a : b,
                  ).name
                : undefined
            }
          />
        </section>
      )}

      {composerSection}

      {(workspace === 'dashboard' || workspace === 'tournaments') && (
        <SectionCard
          title={workspace === 'dashboard' ? 'Recent Tournaments' : 'Tournaments'}
          action={
            loading ? (
              <span className="text-sm text-slate-400">Loading…</span>
            ) : (
              <SummaryBadge>{tournaments.length} total</SummaryBadge>
            )
          }
        >
          {featuredTournaments.length === 0 ? (
            <EmptyState message="No tournaments yet." />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {featuredTournaments.map((tournament) => (
                <Link
                  key={tournament.id}
                  to={`/tournament/${tournament.id}`}
                  className="group rounded-[1.2rem] border border-stone-200 bg-white px-5 py-5 transition hover:-translate-y-0.5 hover:border-rose-200 hover:shadow-[0_18px_45px_rgba(15,23,42,0.08)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-lg font-semibold text-slate-950 transition group-hover:text-rose-700">
                        {tournament.name}
                      </p>
                      <p className="mt-1.5 text-sm text-slate-600">
                        {tournament.format}
                        {tournament.league?.name ? ` · ${tournament.league.name}` : ''}
                        {tournament.teamMode === 'TEAM_DRAFT_3V3' ? ' · Team Draft' : ''}
                      </p>
                    </div>
                    <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      {tournament.status}
                    </span>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3 text-sm text-slate-500">
                    <span>
                      Round {tournament.currentRound}/{tournament.totalRounds || '?'}
                    </span>
                    <span>{formatDate(tournament.updatedAt)}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {(workspace === 'dashboard' || workspace === 'leagues' || workspace === 'events') && (
        <div className="grid gap-6 xl:grid-cols-2">
          {(workspace === 'dashboard' || workspace === 'leagues') && (
            <SectionCard
              title="Leagues"
              action={
                <SummaryBadge>
                  {leagues.length} {leagues.length === 1 ? 'season' : 'seasons'}
                </SummaryBadge>
              }
            >
              {featuredLeagues.length === 0 ? (
                <EmptyState message="No leagues configured yet." />
              ) : (
                <div className="space-y-3">
                  {featuredLeagues.map((league) => (
                    <Link
                      key={league.id}
                      to={`/leagues/${league.id}`}
                      className="flex items-center justify-between gap-4 rounded-[1.15rem] border border-stone-200 bg-stone-50/50 px-4 py-4 transition hover:border-rose-200 hover:bg-white"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-950">{league.name}</p>
                        <p className="mt-1 text-sm text-slate-600">
                          {formatDate(league.startsAt)} to {formatDate(league.endsAt)}
                        </p>
                      </div>
                      <span className="text-sm text-slate-500">
                        {league.tournamentCount} {league.tournamentCount === 1 ? 'event' : 'events'}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </SectionCard>
          )}

          {(workspace === 'dashboard' || workspace === 'events') && (
            <SectionCard
              title="Events"
              action={
                <SummaryBadge>
                  {events.length} staged {events.length === 1 ? 'event' : 'events'}
                </SummaryBadge>
              }
            >
              {featuredEvents.length === 0 ? (
                <EmptyState message="No staged events yet." />
              ) : (
                <div className="space-y-3">
                  {featuredEvents.map((event) => (
                    <Link
                      key={event.id}
                      to={`/events/${event.id}`}
                      className="block rounded-[1.15rem] border border-stone-200 bg-stone-50/50 px-4 py-4 transition hover:border-rose-200 hover:bg-white"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-950">{event.name}</p>
                          <p className="mt-1 text-sm text-slate-600">
                            {event.template} · {event.participantCount} participants
                          </p>
                        </div>
                        <span className="rounded-full bg-white px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500 shadow-sm">
                          {event.status}
                        </span>
                      </div>
                      <p className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-400">
                        {event.stages.length} stages
                      </p>
                    </Link>
                  ))}
                </div>
              )}
            </SectionCard>
          )}
        </div>
      )}

      {(workspace === 'dashboard' || workspace === 'players') && (
        <SectionCard
          title={workspace === 'dashboard' ? 'Player Leaderboard' : 'Players'}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={playersPerPage}
                onChange={(e) => {
                  setPlayersPerPage(Number(e.target.value) as 5 | 10 | 25 | 50);
                  setPlayerPage(1);
                }}
                className="rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm text-slate-700 outline-none transition focus:border-rose-300 focus:ring-4 focus:ring-rose-100"
              >
                {PLAYERS_PER_PAGE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n} per page
                  </option>
                ))}
              </select>
              <select
                value={leagueFilter}
                onChange={(event) => setLeagueFilter(event.target.value)}
                className="rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm text-slate-700 outline-none transition focus:border-rose-300 focus:ring-4 focus:ring-rose-100"
              >
                <option value="">All-time</option>
                {leagues.map((league) => (
                  <option key={league.id} value={league.id}>
                    {league.name}
                  </option>
                ))}
              </select>
            </div>
          }
        >
          <input
            value={playerSearch}
            onChange={(e) => {
              setPlayerSearch(e.target.value);
              setPlayerPage(1);
            }}
            placeholder="Search players…"
            className="mb-4 w-full rounded-xl border border-stone-200 bg-white/92 px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-rose-300 focus:ring-4 focus:ring-rose-100"
          />
          {filteredPlayers.length === 0 ? (
            <EmptyState
              message={playerSearch ? 'No players match your search.' : 'No tracked players yet.'}
            />
          ) : (
            <>
              <div className="space-y-3">
                {filteredPlayers
                  .slice((playerPage - 1) * playersPerPage, playerPage * playersPerPage)
                  .map((player) => (
                    <Link
                      key={player.id}
                      to={`/players/${player.id}`}
                      className="flex items-center justify-between gap-4 rounded-[1.15rem] border border-stone-200 bg-stone-50/50 px-4 py-4 transition hover:border-rose-200 hover:bg-white"
                    >
                      <div className="flex min-w-0 items-center gap-4">
                        <div className="relative shrink-0">
                          <PlayerAvatar
                            name={player.name}
                            avatarUrl={player.avatarUrl}
                            className="ring-2 ring-white"
                          />
                          <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[0.65rem] font-semibold text-white">
                            {sortedPlayers.indexOf(player) + 1}
                          </div>
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-950">{player.name}</p>
                          <p className="mt-1 text-sm text-slate-600">
                            {player.stats.tournamentsPlayed} tournaments · ELO {player.rating}
                          </p>
                        </div>
                      </div>
                      <div className="text-right text-sm text-slate-500">
                        <p>
                          {player.stats.matchWins}-{player.stats.matchLosses}-
                          {player.stats.matchDraws}
                        </p>
                        <p>{formatPercent(player.stats.matchWinRate)}</p>
                      </div>
                    </Link>
                  ))}
              </div>
              {filteredPlayers.length > playersPerPage && (
                <div className="mt-4 flex items-center justify-between gap-3">
                  <button
                    onClick={() => setPlayerPage((p) => Math.max(1, p - 1))}
                    disabled={playerPage === 1}
                    className="rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-slate-500">
                    Page {playerPage} of {Math.ceil(filteredPlayers.length / playersPerPage)}
                  </span>
                  <button
                    onClick={() =>
                      setPlayerPage((p) =>
                        Math.min(Math.ceil(filteredPlayers.length / playersPerPage), p + 1),
                      )
                    }
                    disabled={playerPage >= Math.ceil(filteredPlayers.length / playersPerPage)}
                    className="rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </SectionCard>
      )}
    </div>
  );
}

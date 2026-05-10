import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type EventDetail } from '../api';
import { useAuth } from '../auth';
import { PageHeader } from '../components/PageHeader';

export function EventPage() {
  const { id } = useParams<{ id: string }>();
  const { canManage } = useAuth();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [error, setError] = useState('');
  const [busyStageId, setBusyStageId] = useState<string | null>(null);

  async function refresh() {
    if (!id) return;
    try {
      setEvent(await api.getEvent(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load event');
    }
  }

  useEffect(() => {
    refresh();
  }, [id]);

  useEffect(() => {
    document.title = event ? `${event.name} | MTG Tournament Manager` : 'Event';
  }, [event]);

  if (!event) {
    return (
      <div className="px-4 py-16 text-center text-slate-400">{error || 'Loading event...'}</div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Event"
        title={event.name}
        compact
        meta={
          <>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
              {event.template}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
              {event.participants.length} participants
            </span>
          </>
        }
        actions={
          <Link
            to="/events"
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
          >
            All Events
          </Link>
        }
      />

      {error && (
        <div className="rounded-[1.5rem] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="rounded-[1.75rem] border border-white/80 bg-white/88 p-6 shadow-[0_18px_55px_rgba(15,23,42,0.08)]">
        <h2 className="font-serif text-2xl font-semibold tracking-tight text-slate-950">Stages</h2>
        <div className="mt-4 space-y-3">
          {event.stages.map((stage) => (
            <article
              key={stage.id}
              className="rounded-[1.4rem] border border-slate-200 bg-slate-50 p-4"
            >
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    Stage {stage.sequence}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{stage.name}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {stage.kind} · {stage.status}
                    {stage.advancementCount ? ` · Advances ${stage.advancementCount}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {stage.tournament && (
                    <Link
                      to={`/tournament/${stage.tournament.id}`}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
                    >
                      Open Tournament
                    </Link>
                  )}
                  {canManage && stage.status !== 'COMPLETED' && (
                    <button
                      onClick={async () => {
                        setBusyStageId(stage.id);
                        setError('');
                        try {
                          const nextEvent = await api.advanceStage(stage.id);
                          setEvent(nextEvent);
                        } catch (err) {
                          setError(err instanceof Error ? err.message : 'Failed to advance stage');
                        } finally {
                          setBusyStageId(null);
                        }
                      }}
                      className="rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
                      disabled={busyStageId === stage.id}
                    >
                      {busyStageId === stage.id ? 'Advancing...' : 'Advance'}
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

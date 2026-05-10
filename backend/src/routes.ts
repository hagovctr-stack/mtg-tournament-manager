import { Router, Request, Response, NextFunction } from 'express';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import * as svc from './tournamentService';
import { getSession, requireRole } from './auth';
import { getStandings, getStandingsAtRound } from './standingsService';
import * as leagues from './leagueService';
import { broadcast } from './websocket';

const uploadsDir = path.join(__dirname, '../uploads');

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (_req, file, cb) => {
      const ext = path
        .extname(file.originalname)
        .toLowerCase()
        .replace(/[^.a-z0-9]/g, '');
      cb(null, `${crypto.randomBytes(16).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype));
  },
});

const router = Router();

const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

router.get(
  '/auth/session',
  wrap(async (req, res) => {
    res.json(await getSession(req.auth?.userId));
  }),
);

router.get(
  '/tournaments',
  wrap(async (req, res) => {
    res.json(await svc.listTournaments(req.auth));
  }),
);

router.post(
  '/tournaments',
  requireRole('ORG_ADMIN', 'ORGANIZER'),
  wrap(async (req, res) => {
    res.status(201).json(await svc.createTournament(req.body, req.auth));
  }),
);

router.get(
  '/tournaments/:id',
  wrap(async (req, res) => {
    const tournament = await svc.getTournament(req.params.id, req.auth);
    if (!tournament) return res.status(404).json({ error: 'Not found' });
    res.json(tournament);
  }),
);

router.post(
  '/tournaments/:id/start',
  requireRole('ORG_ADMIN', 'ORGANIZER'),
  wrap(async (req, res) => {
    const tournament = await svc.startTournament(req.params.id);
    broadcast(req.params.id, 'round_started', { tournamentId: req.params.id });
    res.json(tournament);
  }),
);

router.post(
  '/tournaments/:id/finish',
  requireRole('ORG_ADMIN', 'ORGANIZER'),
  wrap(async (req, res) => {
    const tournament = await svc.finishTournament(req.params.id);
    broadcast(req.params.id, 'tournament_finished', { tournamentId: req.params.id });
    res.json(tournament);
  }),
);

router.delete(
  '/tournaments/:id',
  requireRole('ORG_ADMIN', 'ORGANIZER'),
  wrap(async (req, res) => {
    res.json(await svc.deleteTournament(req.params.id));
  }),
);

router.patch(
  '/tournaments/:id',
  requireRole('ORG_ADMIN', 'ORGANIZER'),
  wrap(async (req, res) => {
    const t = await svc.updateTournament(req.params.id, req.body, req.auth);
    res.json(t);
  }),
);

router.post(
  '/tournaments/:id/randomize-seats',
  requireRole('ORG_ADMIN', 'ORGANIZER'),
  wrap(async (req, res) => {
    await svc.randomizeSeats(req.params.id);
    const tournament = await svc.getTournament(req.params.id, req.auth);
    res.json(tournament);
  }),
);

router.get(
  '/players',
  wrap(async (req, res) => {
    res.json(await svc.listPlayers(req.auth));
  }),
);

router.post(
  '/players',
  requireRole('ORG_ADMIN', 'ORGANIZER'),
  wrap(async (req, res) => {
    try {
      res.status(201).json(await svc.createPlayer(req.body, req.query.force === 'true', req.auth));
    } catch (err: any) {
      res.status(err.status ?? 400).json({ error: err.message, code: err.code });
    }
  }),
);

router.post(
  '/tournaments/:id/players',
  requireRole('ORG_ADMIN', 'ORGANIZER'),
  wrap(async (req, res) => {
    res.status(201).json(await svc.addPlayer(req.params.id, req.body));
  }),
);

router.delete(
  '/players/:id',
  requireRole('ORG_ADMIN', 'ORGANIZER'),
  wrap(async (req, res) => {
    res.json(await svc.dropPlayer(req.params.id));
  }),
);

router.delete(
  '/players/:id/profile',
  requireRole('ORG_ADMIN', 'ORGANIZER'),
  wrap(async (req, res) => {
    try {
      res.json(await svc.deleteGlobalPlayer(req.params.id));
    } catch (err: any) {
      res.status(err.status ?? 400).json({ error: err.message });
    }
  }),
);

router.post(
  '/players/:id/avatar',
  avatarUpload.single('avatar'),
  requireRole('ORG_ADMIN', 'ORGANIZER', 'PLAYER'),
  wrap(async (req, res) => {
    if (!req.file)
      return res
        .status(400)
        .json({ error: 'No valid image file provided (max 2 MB, JPEG/PNG/WebP/GIF)' });
    const avatarUrl = `/uploads/${req.file.filename}`;
    const player = await svc.updatePlayerAvatar(req.params.id, avatarUrl);
    res.json(player);
  }),
);

router.get(
  '/players/:id/summary',
  wrap(async (req, res) => {
    const player = await svc.getPlayerSummary(req.params.id);
    if (!player) return res.status(404).json({ error: 'Not found' });
    res.json(player);
  }),
);

router.post(
  '/tournaments/:id/rounds',
  requireRole('ORG_ADMIN', 'ORGANIZER'),
  wrap(async (req, res) => {
    const round = await svc.generateNextRound(req.params.id);
    broadcast(req.params.id, 'pairings_updated', round);
    broadcast(req.params.id, 'round_started', { round });
    res.status(201).json(round);
  }),
);

router.patch(
  '/matches/:id/result',
  requireRole('ORG_ADMIN', 'ORGANIZER'),
  wrap(async (req, res) => {
    const match = await svc.reportResult(req.params.id, req.body);
    broadcast(match!.tournamentId, 'result_reported', { match });
    const standings = await getStandings(match!.tournamentId);
    broadcast(match!.tournamentId, 'standings_updated', standings);
    res.json(match);
  }),
);

router.post(
  '/tournaments/:id/teams/generate',
  requireRole('ORG_ADMIN', 'ORGANIZER'),
  wrap(async (req, res) => {
    const payload = await svc.generateTournamentTeams(req.params.id);
    broadcast(req.params.id, 'tournament_updated', { tournamentId: req.params.id });
    res.json(payload);
  }),
);

router.patch(
  '/tournaments/:id/teams',
  requireRole('ORG_ADMIN', 'ORGANIZER'),
  wrap(async (req, res) => {
    const payload = await svc.saveTournamentTeams(req.params.id, req.body.assignments ?? []);
    broadcast(req.params.id, 'tournament_updated', { tournamentId: req.params.id });
    res.json(payload);
  }),
);

router.get(
  '/tournaments/:id/standings',
  wrap(async (req, res) => {
    const round = req.query.round ? parseInt(req.query.round as string, 10) : null;
    if (round !== null && !Number.isNaN(round)) {
      res.json(await getStandingsAtRound(req.params.id, round));
    } else {
      res.json(await getStandings(req.params.id));
    }
  }),
);

router.get(
  '/tournaments/:id/export',
  wrap(async (req, res) => {
    const tournament = await svc.getTournament(req.params.id, req.auth);
    const standings = await getStandings(req.params.id);
    const csv = [
      'Rank,Player,Points,OMW%,GW%,OGW%,W,L,D',
      ...standings.map(
        (standing: any) =>
          `${standing.rank},${standing.player.name},${standing.matchPoints},${(standing.omwPercent * 100).toFixed(1)}%,${(standing.gwPercent * 100).toFixed(1)}%,${(standing.ogwPercent * 100).toFixed(1)}%,${standing.matchWins},${standing.matchLosses},${standing.matchDraws}`,
      ),
    ].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="tournament-${tournament?.name ?? req.params.id}.csv"`,
    );
    res.send(csv);
  }),
);


router.get(
  '/leagues',
  wrap(async (req, res) => {
    res.json(await leagues.listLeagues(req.auth!));
  }),
);

router.post(
  '/leagues',
  requireRole('ORG_ADMIN', 'ORGANIZER'),
  wrap(async (req, res) => {
    res.status(201).json(await leagues.createLeague(req.body, req.auth!));
  }),
);

router.get(
  '/leagues/:id',
  wrap(async (req, res) => {
    const league = await leagues.getLeague(req.params.id, req.auth!);
    if (!league) return res.status(404).json({ error: 'Not found' });
    res.json(league);
  }),
);

router.patch(
  '/leagues/:id',
  requireRole('ORG_ADMIN', 'ORGANIZER'),
  wrap(async (req, res) => {
    res.json(await leagues.updateLeague(req.params.id, req.body, req.auth!));
  }),
);

router.delete(
  '/leagues/:id',
  requireRole('ORG_ADMIN', 'ORGANIZER'),
  wrap(async (req, res) => {
    await leagues.deleteLeague(req.params.id, req.auth!);
    res.status(204).end();
  }),
);

router.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[API Error]', err.message);
  res.status(400).json({ error: err.message });
});

export default router;

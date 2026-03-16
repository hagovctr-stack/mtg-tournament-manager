import { Router, Request, Response, NextFunction } from "express";
import * as svc from "./tournamentService";
import { getStandings } from "./standingsService";
import { broadcast } from "./websocket";

const router = Router();

const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

// ─── Tournaments ──────────────────────────────────────────────────────────────

router.get("/tournaments", wrap(async (req, res) => {
  res.json(await svc.listTournaments());
}));

router.post("/tournaments", wrap(async (req, res) => {
  res.status(201).json(await svc.createTournament(req.body));
}));

router.get("/tournaments/:id", wrap(async (req, res) => {
  const t = await svc.getTournament(req.params.id);
  if (!t) return res.status(404).json({ error: "Not found" });
  res.json(t);
}));

router.post("/tournaments/:id/start", wrap(async (req, res) => {
  const t = await svc.startTournament(req.params.id);
  broadcast(req.params.id, "round_started", { tournamentId: req.params.id });
  res.json(t);
}));

router.post("/tournaments/:id/finish", wrap(async (req, res) => {
  const t = await svc.finishTournament(req.params.id);
  broadcast(req.params.id, "tournament_finished", { tournamentId: req.params.id });
  res.json(t);
}));

// ─── Players ──────────────────────────────────────────────────────────────────

router.post("/tournaments/:id/players", wrap(async (req, res) => {
  res.status(201).json(await svc.addPlayer(req.params.id, req.body));
}));

router.delete("/players/:id", wrap(async (req, res) => {
  res.json(await svc.dropPlayer(req.params.id));
}));

// ─── Rounds ───────────────────────────────────────────────────────────────────

router.post("/tournaments/:id/rounds", wrap(async (req, res) => {
  const round = await svc.generateNextRound(req.params.id);
  broadcast(req.params.id, "pairings_updated", round);
  broadcast(req.params.id, "round_started", { round });
  res.status(201).json(round);
}));

// ─── Matches ──────────────────────────────────────────────────────────────────

router.patch("/matches/:id/result", wrap(async (req, res) => {
  const match = await svc.reportResult(req.params.id, req.body);
  broadcast(match!.tournamentId, "result_reported", { match });
  const standings = await getStandings(match!.tournamentId);
  broadcast(match!.tournamentId, "standings_updated", standings);
  res.json(match);
}));

// ─── Standings ────────────────────────────────────────────────────────────────

router.get("/tournaments/:id/standings", wrap(async (req, res) => {
  res.json(await getStandings(req.params.id));
}));

// ─── Top 8 ────────────────────────────────────────────────────────────────────

router.get("/tournaments/:id/top8", wrap(async (req, res) => {
  const standings = await getStandings(req.params.id);
  const top8 = standings.slice(0, 8);
  const bracket = [
    { match: 1, player1: top8[0], player2: top8[7] },
    { match: 2, player1: top8[3], player2: top8[4] },
    { match: 3, player1: top8[1], player2: top8[6] },
    { match: 4, player1: top8[2], player2: top8[5] },
  ];
  res.json(bracket);
}));

// ─── Export ───────────────────────────────────────────────────────────────────

router.get("/tournaments/:id/export", wrap(async (req, res) => {
  const tournament = await svc.getTournament(req.params.id);
  const standings = await getStandings(req.params.id);
  const csv = [
    "Rank,Player,Points,OMW%,GW%,OGW%,W,L,D",
    ...standings.map(
      (s) =>
        `${s.rank},${s.player.name},${s.matchPoints},${(s.omwPercent * 100).toFixed(1)}%,${(s.gwPercent * 100).toFixed(1)}%,${(s.ogwPercent * 100).toFixed(1)}%,${s.matchWins},${s.matchLosses},${s.matchDraws}`
    ),
  ].join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="tournament-${tournament?.name ?? req.params.id}.csv"`);
  res.send(csv);
}));

// ─── Error handler ────────────────────────────────────────────────────────────

router.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  console.error("[API Error]", err.message);
  res.status(400).json({ error: err.message });
});

export default router;

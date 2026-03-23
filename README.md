# MTG Tournament Manager

Professional Magic: The Gathering Swiss tournament system.

Supports up to **256 players**. Implements official MTG tiebreakers (OMW%, GW%, OGW%).
Real-time pairings and standings via WebSockets.

## Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Express + TypeScript |
| Frontend | React + Vite + TailwindCSS |
| Database | PostgreSQL + Prisma ORM |
| Realtime | Socket.io |
| Deploy | Docker + nginx |

---

## Quick start with Docker

```bash
git clone <repo-url>
cd mtg-tournament-manager

docker compose -f docker/docker-compose.yml up --build
```

Open **http://localhost:8080** in your browser.

## Docker Development

For hot reload during development, use the dev Compose file instead of the production one:

```bash
docker compose -f docker/docker-compose.dev.yml up
```

This runs:
- Postgres in Docker
- Backend with `tsx watch` on **http://localhost:3001**
- Frontend with Vite HMR on **http://localhost:5173**

Changes in `backend/`, `frontend/`, and `database/schema.prisma` are reflected without rebuilding the images.

### DBCode / DB access

The dev Compose stack exposes PostgreSQL on **localhost:5433** so you can inspect it from tools like DBCode.

Use this connection:
- Host: `localhost`
- Port: `5433`
- Database: `mtg_tournament`
- Username: `mtg`
- Password: `mtg_secret`

Connection string:

```bash
postgresql://mtg:mtg_secret@localhost:5433/mtg_tournament
```

---

## Local development

### Backend

```bash
cd backend
cp ../config/.env.example .env
# Edit DATABASE_URL to point to your local Postgres instance

npm install
npm run db:push       # Push schema to DB
npm run db:generate   # Generate Prisma client
npm run dev           # Start dev server with hot reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at **http://localhost:5173**  
Backend API at **http://localhost:3001/api**

---

## Run tests

```bash
cd backend
npm test
```

Tests cover:
- Correct pairing count (even/odd players)
- BYE assigned only once per player
- Rematch avoidance
- Deterministic output
- Performance: 256 players in < 2 seconds
- OMW% floor enforcement

---

## Swiss Pairing Algorithm

Located in `backend/src/pairingAlgorithm.ts`.

**Implements Dutch Swiss:**

1. Players sorted by match points into **score brackets**
2. Within each bracket: **backtracking search** to find valid pairings avoiding rematches
3. If bracket has odd players: lowest player **floats down** to the next bracket
4. **BYE**: assigned to the lowest-ranked player who hasn't received one yet
5. **Tiebreakers** (official MTG order): Match Points → OMW% → GW% → OGW%
6. All outputs are **deterministic** (stable sort with name as final tiebreak)

Performance: < 100ms typical for 256 players.

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/tournaments` | List all tournaments |
| `POST` | `/api/tournaments` | Create tournament |
| `GET` | `/api/tournaments/:id` | Get tournament detail |
| `POST` | `/api/tournaments/:id/start` | Start tournament |
| `POST` | `/api/tournaments/:id/finish` | Finalize tournament |
| `POST` | `/api/tournaments/:id/players` | Add player |
| `DELETE` | `/api/players/:id` | Drop player |
| `POST` | `/api/tournaments/:id/rounds` | Generate next round |
| `PATCH` | `/api/matches/:id/result` | Report match result |
| `GET` | `/api/tournaments/:id/standings` | Get standings |
| `GET` | `/api/tournaments/:id/top8` | Get Top 8 bracket |
| `GET` | `/api/tournaments/:id/export` | Export results as CSV |

---

## WebSocket Events

Join a tournament room: emit `join_tournament` with `tournamentId`.

| Event | Direction | Payload |
|-------|-----------|---------|
| `join_tournament` | client → server | `tournamentId` |
| `pairings_updated` | server → client | round data |
| `standings_updated` | server → client | standings array |
| `result_reported` | server → client | match data |
| `round_started` | server → client | round info |
| `tournament_finished` | server → client | tournament info |

---

## Project Structure

```
mtg-tournament-manager/
├── backend/
│   ├── src/
│   │   ├── server.ts           # Express + HTTP server setup
│   │   ├── routes.ts           # All API routes
│   │   ├── tournamentService.ts # Business logic
│   │   ├── pairingAlgorithm.ts  # Swiss pairing engine
│   │   ├── standingsService.ts  # Standings + tiebreakers
│   │   ├── websocket.ts        # Socket.io setup
│   │   └── db.ts               # Prisma client singleton
│   └── tests/
│       └── pairingAlgorithm.test.ts
├── frontend/
│   └── src/
│       ├── pages/              # Home, Tournament, Pairings, Standings
│       └── components/         # PlayerList, PairingsTable, StandingsTable, Timer
├── database/
│   └── schema.prisma
├── docker/
│   ├── Dockerfile.backend
│   ├── Dockerfile.frontend
│   ├── docker-compose.yml
│   └── nginx.conf
└── config/
    └── .env.example
```

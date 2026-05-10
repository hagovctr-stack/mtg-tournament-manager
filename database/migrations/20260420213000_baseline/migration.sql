-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "tableNumber" INTEGER NOT NULL,
    "player1Id" TEXT NOT NULL,
    "player2Id" TEXT,
    "byePlayerId" TEXT,
    "wins1" INTEGER,
    "wins2" INTEGER,
    "draws" INTEGER,
    "result" TEXT NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "dciNumber" TEXT,
    "rating" INTEGER NOT NULL DEFAULT 1500,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Round" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "Round_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Standing" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "matchPoints" INTEGER NOT NULL DEFAULT 0,
    "gameWins" INTEGER NOT NULL DEFAULT 0,
    "gameLosses" INTEGER NOT NULL DEFAULT 0,
    "gameDraws" INTEGER NOT NULL DEFAULT 0,
    "matchWins" INTEGER NOT NULL DEFAULT 0,
    "matchLosses" INTEGER NOT NULL DEFAULT 0,
    "matchDraws" INTEGER NOT NULL DEFAULT 0,
    "omwPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gwPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ogwPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Standing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tournament" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'Cube',
    "bestOfFormat" TEXT NOT NULL DEFAULT 'BO3',
    "subtitle" TEXT NOT NULL DEFAULT '',
    "cubeCobraUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REGISTRATION',
    "totalRounds" INTEGER NOT NULL DEFAULT 0,
    "currentRound" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentPlayer" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "playerId" TEXT,
    "name" TEXT NOT NULL,
    "dciNumber" TEXT,
    "elo" INTEGER NOT NULL DEFAULT 1500,
    "currentElo" INTEGER NOT NULL DEFAULT 1500,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "seatNumber" INTEGER,

    CONSTRAINT "TournamentPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Match_player1Id_idx" ON "Match"("player1Id" ASC);

-- CreateIndex
CREATE INDEX "Match_player2Id_idx" ON "Match"("player2Id" ASC);

-- CreateIndex
CREATE INDEX "Match_roundId_idx" ON "Match"("roundId" ASC);

-- CreateIndex
CREATE INDEX "Match_tournamentId_idx" ON "Match"("tournamentId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Player_dciNumber_key" ON "Player"("dciNumber" ASC);

-- CreateIndex
CREATE INDEX "Player_normalizedName_idx" ON "Player"("normalizedName" ASC);

-- CreateIndex
CREATE INDEX "Round_tournamentId_idx" ON "Round"("tournamentId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Round_tournamentId_number_key" ON "Round"("tournamentId" ASC, "number" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Standing_playerId_key" ON "Standing"("playerId" ASC);

-- CreateIndex
CREATE INDEX "Standing_tournamentId_idx" ON "Standing"("tournamentId" ASC);

-- CreateIndex
CREATE INDEX "TournamentPlayer_playerId_idx" ON "TournamentPlayer"("playerId" ASC);

-- CreateIndex
CREATE INDEX "TournamentPlayer_tournamentId_idx" ON "TournamentPlayer"("tournamentId" ASC);

-- CreateIndex
CREATE INDEX "TournamentPlayer_tournamentId_playerId_idx" ON "TournamentPlayer"("tournamentId" ASC, "playerId" ASC);

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_byePlayerId_fkey" FOREIGN KEY ("byePlayerId") REFERENCES "TournamentPlayer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_player1Id_fkey" FOREIGN KEY ("player1Id") REFERENCES "TournamentPlayer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_player2Id_fkey" FOREIGN KEY ("player2Id") REFERENCES "TournamentPlayer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Round" ADD CONSTRAINT "Round_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Standing" ADD CONSTRAINT "Standing_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "TournamentPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Standing" ADD CONSTRAINT "Standing_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentPlayer" ADD CONSTRAINT "TournamentPlayer_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentPlayer" ADD CONSTRAINT "TournamentPlayer_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

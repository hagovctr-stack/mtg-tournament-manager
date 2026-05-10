CREATE TYPE "TeamSetupTiming" AS ENUM ('BEFORE_DRAFT', 'AFTER_DRAFT');

ALTER TABLE "Tournament"
ADD COLUMN "teamSetupTiming" "TeamSetupTiming" NOT NULL DEFAULT 'BEFORE_DRAFT';

CREATE INDEX "Tournament_teamSetupTiming_idx" ON "Tournament"("teamSetupTiming");

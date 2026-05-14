/**
 * One-off script: fix Round 3 pairings + results for "Vintage Cube #2 - Juanro's"
 *
 * Actual Round 3 results (paper):
 *   Table 1: Gian       vs Juanro  → Juanro wins 2-1  (P2_WIN)
 *   Table 2: Nathan     vs Fefe    → Nathan wins 2-0  (P1_WIN)
 *   Table 3: Marto      vs Chango  → Marto wins 2-1   (P1_WIN)
 *   Table 4: Gus        vs Chino   → Gus wins 2-0     (P1_WIN)
 *   Table 5: Fefo       vs Axel    → Fefo wins 2-0    (P1_WIN)
 */

import { prisma } from '../src/db';
import { recalculateStandings } from '../src/standingsService';

const TOURNAMENT_ID = 'cmp5rcuti03td41wd6s2vr5q5';

const TP = {
  fefo: 'cmp5rdkk1000pk6kfelj8djq0',
  chango: 'cmp5repuf0011s2hx909s2857',
  axel: 'cmp5re2pw001dwkzn2c556rjo',
  juanro: 'cmp5reu4m002ts2hx249agwul',
  chino: 'cmp5rebzi0011lmdgn5h2m8pi',
  nathan: 'cmp5rezan004ls2hxqg93csmi',
  gian: 'cmp5reibp0035lmdgpa3bmyam',
  fefe: 'cmp5rf1nx006ds2hxlt1ieip3',
  marto: 'cmp5rem2m004xlmdg3su70gmu',
  gus: 'cmp5rf4640085s2hxk6vs10om',
};

// Match IDs for Round 3 (confirmed from DB)
const MATCHES = [
  {
    id: 'cmp5v9h0900pstqy520u8oej8',
    tableNumber: 1,
    player1Id: TP.gian,
    player2Id: TP.juanro,
    wins1: 1,
    wins2: 2,
    draws: 0,
    result: 'P2_WIN',
  },
  {
    id: 'cmp5v9h0a00putqy59gnu4f5d',
    tableNumber: 2,
    player1Id: TP.nathan,
    player2Id: TP.fefe,
    wins1: 2,
    wins2: 0,
    draws: 0,
    result: 'P1_WIN',
  },
  {
    id: 'cmp5v9h0b00pwtqy579i48j68',
    tableNumber: 3,
    player1Id: TP.marto,
    player2Id: TP.chango,
    wins1: 2,
    wins2: 1,
    draws: 0,
    result: 'P1_WIN',
  },
  {
    id: 'cmp5v9h0c00pytqy5hr2njuu1',
    tableNumber: 4,
    player1Id: TP.gus,
    player2Id: TP.chino,
    wins1: 2,
    wins2: 0,
    draws: 0,
    result: 'P1_WIN',
  },
  {
    id: 'cmp5v9h0d00q0tqy57qkgiuj3',
    tableNumber: 5,
    player1Id: TP.fefo,
    player2Id: TP.axel,
    wins1: 2,
    wins2: 0,
    draws: 0,
    result: 'P1_WIN',
  },
];

async function main() {
  console.log('Updating Round 3 match pairings and results...');

  await prisma.$transaction(
    MATCHES.map((m) =>
      prisma.match.update({
        where: { id: m.id },
        data: {
          player1: { connect: { id: m.player1Id } },
          player2: { connect: { id: m.player2Id } },
          wins1: m.wins1,
          wins2: m.wins2,
          draws: m.draws,
          result: m.result,
        },
      }),
    ),
  );

  // Also mark Round 3 as FINISHED
  await prisma.round.updateMany({
    where: { tournamentId: TOURNAMENT_ID, number: 3 },
    data: { status: 'FINISHED', finishedAt: new Date() },
  });

  console.log('Matches updated. Recalculating standings...');
  await recalculateStandings(TOURNAMENT_ID);
  console.log('Done.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

/**
 * One-off script: fix Round 2 pairings + results for "Vintage Cube #2 - Juanro's"
 * to match the actual paper record, then recalculate standings.
 *
 * Actual Round 2 results:
 *   Table 1: Chango     vs Nathan  → Nathan wins 2-0  (P2_WIN)
 *   Table 2: Gian       vs Marto   → Gian wins 2-0    (P1_WIN)
 *   Table 3: Juanro     vs Gus     → Juanro wins 2-1  (P1_WIN)
 *   Table 4: Axel       vs Chino   → Chino wins 2-0   (P2_WIN)
 *   Table 5: Fefo       vs Fefe    → Fefe wins 2-1    (P2_WIN)
 */

import { prisma } from '../src/db';
import { recalculateStandings } from '../src/standingsService';

const TOURNAMENT_ID = 'cmp5rcuti03td41wd6s2vr5q5';

// TournamentPlayer IDs (confirmed from DB query)
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

// Match IDs for Round 2 (confirmed from DB query)
const MATCHES = [
  {
    id: 'cmp5urecj04bk14naqk9snpw4',
    tableNumber: 1,
    player1Id: TP.chango,
    player2Id: TP.nathan,
    wins1: 0,
    wins2: 2,
    draws: 0,
    result: 'P2_WIN',
  },
  {
    id: 'cmp5ureck04bm14na12lk0vrf',
    tableNumber: 2,
    player1Id: TP.gian,
    player2Id: TP.marto,
    wins1: 2,
    wins2: 0,
    draws: 0,
    result: 'P1_WIN',
  },
  {
    id: 'cmp5urecl04bo14naoh1rsmvy',
    tableNumber: 3,
    player1Id: TP.juanro,
    player2Id: TP.gus,
    wins1: 2,
    wins2: 1,
    draws: 0,
    result: 'P1_WIN',
  },
  {
    id: 'cmp5urecm04bq14nadiolnu4p',
    tableNumber: 4,
    player1Id: TP.axel,
    player2Id: TP.chino,
    wins1: 0,
    wins2: 2,
    draws: 0,
    result: 'P2_WIN',
  },
  {
    id: 'cmp5urecn04bs14nay6xylnw3',
    tableNumber: 5,
    player1Id: TP.fefo,
    player2Id: TP.fefe,
    wins1: 1,
    wins2: 2,
    draws: 0,
    result: 'P2_WIN',
  },
];

async function main() {
  console.log('Updating Round 2 match pairings and results...');

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

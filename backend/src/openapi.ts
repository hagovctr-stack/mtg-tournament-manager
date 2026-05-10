export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'MTG Tournament Manager API',
    version: '1.0.0',
    description:
      'REST API for managing MTG Swiss tournaments, players, rounds, standings, and exports.',
  },
  servers: [{ url: 'http://localhost:3001', description: 'Local backend' }],
  tags: [
    { name: 'Health' },
    { name: 'Tournaments' },
    { name: 'Players' },
    { name: 'Rounds' },
    { name: 'Matches' },
    { name: 'Standings' },
    { name: 'Export' },
  ],
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Health check',
        responses: {
          '200': {
            description: 'Backend is healthy',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { ok: { type: 'boolean', example: true } },
                  required: ['ok'],
                },
              },
            },
          },
        },
      },
    },
    '/api/tournaments': {
      get: {
        tags: ['Tournaments'],
        summary: 'List tournaments',
        responses: {
          '200': {
            description: 'List of tournaments',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Tournament' },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Tournaments'],
        summary: 'Create tournament',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateTournamentInput' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Tournament created',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Tournament' },
              },
            },
          },
          '400': { $ref: '#/components/responses/ErrorResponse' },
        },
      },
    },
    '/api/tournaments/{id}': {
      get: {
        tags: ['Tournaments'],
        summary: 'Get tournament detail',
        parameters: [{ $ref: '#/components/parameters/TournamentId' }],
        responses: {
          '200': {
            description: 'Tournament detail',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/TournamentDetail' },
              },
            },
          },
          '404': { $ref: '#/components/responses/ErrorResponse' },
        },
      },
      delete: {
        tags: ['Tournaments'],
        summary: 'Delete tournament',
        parameters: [{ $ref: '#/components/parameters/TournamentId' }],
        responses: {
          '200': {
            description: 'Deleted tournament summary',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                  },
                  required: ['id', 'name'],
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/ErrorResponse' },
        },
      },
    },
    '/api/tournaments/{id}/start': {
      post: {
        tags: ['Tournaments'],
        summary: 'Start tournament',
        parameters: [{ $ref: '#/components/parameters/TournamentId' }],
        responses: {
          '200': {
            description: 'Tournament started',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Tournament' },
              },
            },
          },
          '400': { $ref: '#/components/responses/ErrorResponse' },
        },
      },
    },
    '/api/tournaments/{id}/finish': {
      post: {
        tags: ['Tournaments'],
        summary: 'Finish tournament',
        parameters: [{ $ref: '#/components/parameters/TournamentId' }],
        responses: {
          '200': {
            description: 'Tournament finished',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Tournament' },
              },
            },
          },
          '400': { $ref: '#/components/responses/ErrorResponse' },
        },
      },
    },
    '/api/tournaments/{id}/players': {
      post: {
        tags: ['Players'],
        summary: 'Add player to tournament',
        parameters: [{ $ref: '#/components/parameters/TournamentId' }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AddPlayerInput' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Player created',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Player' },
              },
            },
          },
          '400': { $ref: '#/components/responses/ErrorResponse' },
        },
      },
    },
    '/api/players': {
      get: {
        tags: ['Players'],
        summary: 'List global players with aggregate stats',
        responses: {
          '200': {
            description: 'List of global players',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/PlayerListItem' },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Players'],
        summary: 'Create global player profile',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AddPlayerInput' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Global player created',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PlayerListItem' },
              },
            },
          },
          '400': { $ref: '#/components/responses/ErrorResponse' },
        },
      },
    },
    '/api/players/{id}': {
      delete: {
        tags: ['Players'],
        summary: 'Drop player from tournament',
        parameters: [{ $ref: '#/components/parameters/PlayerId' }],
        responses: {
          '200': {
            description: 'Player dropped',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Player' },
              },
            },
          },
          '400': { $ref: '#/components/responses/ErrorResponse' },
        },
      },
    },
    '/api/players/{id}/summary': {
      get: {
        tags: ['Players'],
        summary: 'Get global player summary and lifetime stats',
        parameters: [{ $ref: '#/components/parameters/PlayerId' }],
        responses: {
          '200': {
            description: 'Global player summary',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PlayerSummary' },
              },
            },
          },
          '404': { $ref: '#/components/responses/ErrorResponse' },
        },
      },
    },
    '/api/tournaments/{id}/rounds': {
      post: {
        tags: ['Rounds'],
        summary: 'Generate next round',
        parameters: [{ $ref: '#/components/parameters/TournamentId' }],
        responses: {
          '201': {
            description: 'Round generated',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/RoundDetail' },
              },
            },
          },
          '400': { $ref: '#/components/responses/ErrorResponse' },
        },
      },
    },
    '/api/matches/{id}/result': {
      patch: {
        tags: ['Matches'],
        summary: 'Report match result',
        parameters: [{ $ref: '#/components/parameters/MatchId' }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ReportResultInput' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Match updated',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/MatchDetail' },
              },
            },
          },
          '400': { $ref: '#/components/responses/ErrorResponse' },
        },
      },
    },
    '/api/tournaments/{id}/standings': {
      get: {
        tags: ['Standings'],
        summary: 'Get standings',
        parameters: [{ $ref: '#/components/parameters/TournamentId' }],
        responses: {
          '200': {
            description: 'Standings',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Standing' },
                },
              },
            },
          },
        },
      },
    },
    '/api/tournaments/{id}/export': {
      get: {
        tags: ['Export'],
        summary: 'Export standings as CSV',
        parameters: [{ $ref: '#/components/parameters/TournamentId' }],
        responses: {
          '200': {
            description: 'CSV export',
            content: {
              'text/csv': {
                schema: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
  components: {
    parameters: {
      TournamentId: {
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'string' },
        description: 'Tournament id',
      },
      PlayerId: {
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'string' },
        description: 'Player id',
      },
      MatchId: {
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'string' },
        description: 'Match id',
      },
    },
    responses: {
      ErrorResponse: {
        description: 'Error response',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                error: { type: 'string' },
              },
              required: ['error'],
            },
          },
        },
      },
    },
    schemas: {
      Tournament: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          format: { type: 'string' },
          teamMode: { type: 'string', enum: ['NONE', 'TEAM_DRAFT_3V3'] },
          teamSetupTiming: { type: 'string', enum: ['BEFORE_DRAFT', 'AFTER_DRAFT'] },
          status: { type: 'string', enum: ['REGISTRATION', 'ACTIVE', 'FINISHED'] },
          totalRounds: { type: 'integer' },
          currentRound: { type: 'integer' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          _count: {
            type: 'object',
            properties: {
              players: { type: 'integer' },
            },
          },
        },
        required: [
          'id',
          'name',
          'format',
          'teamMode',
          'teamSetupTiming',
          'status',
          'totalRounds',
          'currentRound',
          'createdAt',
          'updatedAt',
        ],
      },
      TournamentDetail: {
        allOf: [
          { $ref: '#/components/schemas/Tournament' },
          {
            type: 'object',
            properties: {
              players: {
                type: 'array',
                items: { $ref: '#/components/schemas/Player' },
              },
              rounds: {
                type: 'array',
                items: { $ref: '#/components/schemas/RoundDetail' },
              },
              standings: {
                type: 'array',
                items: { $ref: '#/components/schemas/Standing' },
              },
            },
            required: ['players', 'rounds', 'standings'],
          },
        ],
      },
      Player: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          tournamentPlayerId: { type: 'string' },
          playerId: { type: 'string', nullable: true },
          name: { type: 'string' },
          dciNumber: { type: 'string', nullable: true },
          elo: { type: 'integer' },
          active: { type: 'boolean' },
          tournamentId: { type: 'string' },
        },
        required: ['id', 'tournamentPlayerId', 'name', 'elo', 'active', 'tournamentId'],
      },
      Match: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          tableNumber: { type: 'integer' },
          player1Id: { type: 'string' },
          player2Id: { type: 'string', nullable: true },
          wins1: { type: 'integer', nullable: true },
          wins2: { type: 'integer', nullable: true },
          draws: { type: 'integer', nullable: true },
          result: { type: 'string', enum: ['PENDING', 'P1_WIN', 'P2_WIN', 'DRAW', 'BYE'] },
          tournamentId: { type: 'string' },
        },
        required: ['id', 'tableNumber', 'player1Id', 'result', 'tournamentId'],
      },
      MatchDetail: {
        allOf: [
          { $ref: '#/components/schemas/Match' },
          {
            type: 'object',
            properties: {
              player1: { $ref: '#/components/schemas/Player' },
              player2: {
                anyOf: [{ $ref: '#/components/schemas/Player' }, { type: 'null' }],
              },
            },
            required: ['player1', 'player2'],
          },
        ],
      },
      Round: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          number: { type: 'integer' },
          status: { type: 'string', enum: ['PENDING', 'ACTIVE', 'FINISHED'] },
          startedAt: { type: 'string', format: 'date-time', nullable: true },
          matches: {
            type: 'array',
            items: { $ref: '#/components/schemas/Match' },
          },
        },
        required: ['id', 'number', 'status', 'matches'],
      },
      RoundDetail: {
        allOf: [
          { $ref: '#/components/schemas/Round' },
          {
            type: 'object',
            properties: {
              matches: {
                type: 'array',
                items: { $ref: '#/components/schemas/MatchDetail' },
              },
            },
            required: ['matches'],
          },
        ],
      },
      Standing: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          tournamentId: { type: 'string' },
          tournamentPlayerId: { type: 'string' },
          playerId: { type: 'string', nullable: true },
          rank: { type: 'integer' },
          matchPoints: { type: 'integer' },
          matchWins: { type: 'integer' },
          matchLosses: { type: 'integer' },
          matchDraws: { type: 'integer' },
          gameWins: { type: 'integer' },
          gameLosses: { type: 'integer' },
          omwPercent: { type: 'number' },
          gwPercent: { type: 'number' },
          ogwPercent: { type: 'number' },
          player: { $ref: '#/components/schemas/Player' },
        },
        required: [
          'id',
          'tournamentId',
          'tournamentPlayerId',
          'rank',
          'matchPoints',
          'matchWins',
          'matchLosses',
          'matchDraws',
          'gameWins',
          'gameLosses',
          'omwPercent',
          'gwPercent',
          'ogwPercent',
          'player',
        ],
      },
      PlayerStats: {
        type: 'object',
        properties: {
          tournamentsPlayed: { type: 'integer' },
          activeRegistrations: { type: 'integer' },
          matchWins: { type: 'integer' },
          matchLosses: { type: 'integer' },
          matchDraws: { type: 'integer' },
          gameWins: { type: 'integer' },
          gameLosses: { type: 'integer' },
          gameDraws: { type: 'integer' },
          matchWinRate: { type: 'number' },
          gameWinRate: { type: 'number' },
          lastTournamentAt: { type: 'string', format: 'date-time', nullable: true },
        },
        required: [
          'tournamentsPlayed',
          'activeRegistrations',
          'matchWins',
          'matchLosses',
          'matchDraws',
          'gameWins',
          'gameLosses',
          'gameDraws',
          'matchWinRate',
          'gameWinRate',
          'lastTournamentAt',
        ],
      },
      PlayerTournamentHistoryEntry: {
        type: 'object',
        properties: {
          tournamentId: { type: 'string' },
          tournamentPlayerId: { type: 'string' },
          name: { type: 'string' },
          status: { type: 'string' },
          playedAt: { type: 'string', format: 'date-time' },
          displayName: { type: 'string' },
          displayDciNumber: { type: 'string', nullable: true },
          startingElo: { type: 'integer' },
          currentElo: { type: 'integer' },
          endingElo: { type: 'integer', nullable: true },
          active: { type: 'boolean' },
          rank: { type: 'integer', nullable: true },
          matchPoints: { type: 'integer' },
          matchWins: { type: 'integer' },
          matchLosses: { type: 'integer' },
          matchDraws: { type: 'integer' },
        },
        required: [
          'tournamentId',
          'tournamentPlayerId',
          'name',
          'status',
          'playedAt',
          'displayName',
          'startingElo',
          'currentElo',
          'endingElo',
          'active',
          'rank',
          'matchPoints',
          'matchWins',
          'matchLosses',
          'matchDraws',
        ],
      },
      PlayerListItem: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          normalizedName: { type: 'string' },
          dciNumber: { type: 'string', nullable: true },
          rating: { type: 'integer' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          stats: { $ref: '#/components/schemas/PlayerStats' },
        },
        required: ['id', 'name', 'normalizedName', 'rating', 'createdAt', 'updatedAt', 'stats'],
      },
      PlayerSummary: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          normalizedName: { type: 'string' },
          dciNumber: { type: 'string', nullable: true },
          rating: { type: 'integer' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          stats: { $ref: '#/components/schemas/PlayerStats' },
          tournaments: {
            type: 'array',
            items: { $ref: '#/components/schemas/PlayerTournamentHistoryEntry' },
          },
        },
        required: [
          'id',
          'name',
          'normalizedName',
          'rating',
          'createdAt',
          'updatedAt',
          'stats',
          'tournaments',
        ],
      },
      CreateTournamentInput: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          format: { type: 'string' },
          teamMode: { type: 'string', enum: ['NONE', 'TEAM_DRAFT_3V3'] },
          teamSetupTiming: { type: 'string', enum: ['BEFORE_DRAFT', 'AFTER_DRAFT'] },
          totalRounds: { type: 'integer' },
        },
        required: ['name'],
      },
      AddPlayerInput: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          dciNumber: { type: 'string' },
          elo: { type: 'integer' },
        },
        required: ['name'],
      },
      ReportResultInput: {
        type: 'object',
        properties: {
          wins1: { type: 'integer' },
          wins2: { type: 'integer' },
          draws: { type: 'integer' },
        },
        required: ['wins1', 'wins2', 'draws'],
      },
    },
  },
} as const;

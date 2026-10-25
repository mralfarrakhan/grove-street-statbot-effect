import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { Cause, Data, Effect, Layer, Option, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import worker from '../src/index';
import { computeStreak, makeGetLatestRankChange } from '../src/handles';
import { extractCauseDetails } from '../src/logger';
import { getAgentPersona } from '../src/personas';
import {
  buildDownRankPartnerPrompt,
  buildLossStreakPartnerPrompt,
  buildMonsterCarryPartnerPrompt,
  buildUpRankPartnerPrompt,
  buildWinStreakPartnerPrompt,
} from '../src/prompts';
import { AccountV2, MMRHistoryV2 } from '../src/schemas';
import { KVClient } from '../src/services';
import { HttpClient } from '@effect/platform';

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe('Grove Street Statbot Worker API', () => {
  it('GET /api returns "ok" with status 200', async () => {
    const request = new IncomingRequest('http://example.com/api');
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('ok');
  });

  it('GET /api/players returns 401 without Basic Auth', async () => {
    const request = new IncomingRequest('http://example.com/api/players');
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(401);
  });
});

describe('Structured Logger', () => {
  it('extracts concise error details from Cause with ParseError', () => {
    const TestSchema = Schema.Struct({ id: Schema.UUID });
    try {
      Schema.decodeUnknownSync(TestSchema)({ id: '' });
      expect.fail('Expected parse error');
    } catch (e) {
      const cause = Cause.fail(e);
      const details = extractCauseDetails(cause);
      expect(details.errorType).toBe('ParseError');
      expect(details.message).toContain('Expected a Universally Unique Identifier');
      expect(details.stack.length).toBeLessThanOrEqual(530);
    }
  });

  it('extracts status code and errorType from HTTP ResponseError', () => {
    class HttpRateLimitError extends Data.TaggedError('ResponseError')<{
      readonly status: number;
      readonly message: string;
    }> {}

    const cause = Cause.fail(
      new HttpRateLimitError({
        status: 429,
        message: 'Rate limit exceeded: 30 requests per minute',
      }),
    );
    const details = extractCauseDetails(cause);
    expect(details.errorType).toBe('ResponseError');
    expect(details.statusCode).toBe(429);
    expect(details.message).toBe('Rate limit exceeded: 30 requests per minute');
  });
});

describe('Agent Personas', () => {
  it('resolves known agent personas accurately', () => {
    const jett = getAgentPersona('Jett');
    expect(jett.displayName).toBe('Jett');
    expect(jett.archetype).toBe('Duelist');
    expect(jett.nativeLanguageSlips).toContain('Korean');

    const brimstone = getAgentPersona('Brimstone');
    expect(brimstone.displayName).toBe('Brimstone');
    expect(brimstone.archetype).toBe('Controller');
    expect(brimstone.voiceTraits).toContain('commander');
  });

  it('provides a resilient fallback persona for unknown agents', () => {
    const unknown = getAgentPersona('UnknownAgent99');
    expect(unknown.displayName).toBe('UnknownAgent99');
    expect(unknown.catchphrases.length).toBeGreaterThan(0);
    expect(unknown.partnerTone).toBeTruthy();
  });
});

describe('Schema Resilience with Riot Edge Cases', () => {
  it('decodes MMRHistoryV2 with empty string map and season IDs', () => {
    const mockMmrPayload = {
      status: 200,
      data: {
        account: {
          name: 'Synzdrome',
          tag: '9258',
          puuid: 'f031d578-58a6-5094-879c-bc861fc0e3f8',
        },
        history: [
          {
            tier: { id: 10, name: 'Silver 2' },
            match_id: '067a1956-0f12-4f97-bd8c-ab7d0863f4ee',
            map: { id: '', name: 'Unknown' },
            season: { id: '', short: 'Unknown' },
            rr: 64,
            last_change: -6,
            elo: 764,
            refunded_rr: 0,
            was_derank_protected: false,
            date: '2026-10-23T15:03:31Z',
          },
        ],
      },
    };

    const decoded = Schema.decodeUnknownSync(MMRHistoryV2)(mockMmrPayload);
    expect(decoded.data.history[0].map.id).toBe('');
    expect(decoded.data.history[0].season.id).toBe('');
    expect(decoded.data.history[0].match_id).toBe('067a1956-0f12-4f97-bd8c-ab7d0863f4ee');
  });

  it('decodes AccountV2 with string card and title IDs', () => {
    const mockAccountPayload = {
      status: 200,
      data: {
        puuid: '20e05298-a3b7-53c5-a872-105c0032759d',
        region: 'ap',
        account_level: 209,
        name: 'A Grothendieck',
        tag: '3110',
        card: 'custom-card-id',
        title: 'custom-title-id',
        platforms: ['PC'],
        updated_at: '2026-10-24T23:50:45.517Z',
      },
    };

    const decoded = Schema.decodeUnknownSync(AccountV2)(mockAccountPayload);
    expect(decoded.data.name).toBe('A Grothendieck');
    expect(decoded.data.card).toBe('custom-card-id');
    expect(decoded.data.title).toBe('custom-title-id');
  });
});

describe('Streak Calculation (computeStreak)', () => {
  it('detects a 3-game win streak correctly', () => {
    const history = [{ last_change: 22 }, { last_change: 18 }, { last_change: 24 }];
    const streak = computeStreak(history);
    expect(streak.type).toBe('win');
    expect(streak.count).toBe(3);
  });

  it('detects a 4-game loss streak correctly', () => {
    const history = [
      { last_change: -15 },
      { last_change: -18 },
      { last_change: -20 },
      { last_change: -12 },
    ];
    const streak = computeStreak(history);
    expect(streak.type).toBe('loss');
    expect(streak.count).toBe(4);
  });

  it('stops counting streak when broken by a remake or tie (last_change = 0)', () => {
    const history = [{ last_change: 20 }, { last_change: 0 }, { last_change: 18 }];
    const streak = computeStreak(history);
    expect(streak.type).toBe('win');
    expect(streak.count).toBe(1);
  });

  it('returns none for an empty match history', () => {
    const streak = computeStreak([]);
    expect(streak.type).toBe('none');
    expect(streak.count).toBe(0);
  });
});

describe('Escalating Partner Prompts', () => {
  const dummyCtx = {
    player: '**TestPlayer#0001**',
    discordMention: '<@123456789>',
    persona: getAgentPersona('Reyna'),
    map: 'Bind',
    lastChange: 24,
    kda: '24/12/4',
  };

  it('generates escalating win streak prompts (3 vs 5+ wins)', () => {
    const prompt3 = buildWinStreakPartnerPrompt(dummyCtx, 3);
    expect(prompt3).toContain('3-game win streak');
    expect(prompt3).toContain('<@123456789>');

    const prompt5 = buildWinStreakPartnerPrompt(dummyCtx, 5, 26);
    expect(prompt5).toContain('5-game win streak');
    expect(prompt5).toContain('26 kills');
  });

  it('generates escalating loss streak tilt alert prompts (3 vs 5+ losses)', () => {
    const lossCtx = { ...dummyCtx, lastChange: -18 };
    const prompt3 = buildLossStreakPartnerPrompt(lossCtx, 3);
    expect(prompt3).toContain('3-game loss streak');
    expect(prompt3).toContain('compassionate tilt check');

    const prompt5 = buildLossStreakPartnerPrompt(lossCtx, 5, 22);
    expect(prompt5).toContain('5-game losing skid');
    expect(prompt5).toContain('log off for the day');
    expect(prompt5).toContain('22 kills');
  });

  it('generates monster carry prompts for 20+ kills on win vs loss', () => {
    const promptWin = buildMonsterCarryPartnerPrompt(dummyCtx, 28, true);
    expect(promptWin).toContain('28 kills hard carry');
    expect(promptWin).toContain('back must hurt');

    const promptLoss = buildMonsterCarryPartnerPrompt({ ...dummyCtx, lastChange: -16 }, 24, false);
    expect(promptLoss).toContain('24 kills');
    expect(promptLoss).toContain('tragic 1v9 carry');
    expect(promptLoss).toContain('team let them down');
  });

  it('weaves streak and 20+ kills into UpRank promotion prompt', () => {
    const prompt = buildUpRankPartnerPrompt(dummyCtx, 'Diamond 3', 'Ascendant 1', {
      streakCount: 4,
      kills: 25,
    });
    expect(prompt).toContain('Ascendant 1');
    expect(prompt).toContain('4-game heater');
    expect(prompt).toContain('25 kills');
  });

  it('weaves losing skid and 20+ kills into DownRank demotion prompt', () => {
    const prompt = buildDownRankPartnerPrompt(dummyCtx, 'Ascendant 1', 'Diamond 3', {
      streakCount: 3,
      kills: 22,
    });
    expect(prompt).toContain('Diamond 3');
    expect(prompt).toContain('3-game losing skid');
    expect(prompt).toContain('22 kills');
  });
});

describe('Milestone & Rank Change Resolution', () => {
  const makeMockHistory = (
    entries: Array<{ matchId: string; tierId: number; tierName: string; lastChange: number }>,
  ) =>
    Schema.decodeUnknownSync(MMRHistoryV2)({
      status: 200,
      data: {
        account: {
          name: 'TestPlayer',
          tag: '1234',
          puuid: '20e05298-a3b7-53c5-a872-105c0032759d',
        },
        history: entries.map((e) => ({
          tier: { id: e.tierId, name: e.tierName },
          match_id: e.matchId,
          map: { id: 'map-1', name: 'Haven' },
          season: { id: 'season-1', short: 'E9A3' },
          rr: 50,
          last_change: e.lastChange,
          elo: 1050,
          refunded_rr: 0,
          was_derank_protected: false,
          date: '2026-10-24T23:50:45.517Z',
        })),
      },
    });

  const createMockKV = (cachedPerf?: {
    character: string;
    kills: number;
    deaths: number;
    assists: number;
    score: number;
  }) =>
    Layer.succeed(KVClient, {
      get: (key: string) => {
        if (cachedPerf && key.startsWith('match:')) {
          return Effect.succeed(Option.some(JSON.stringify(cachedPerf)));
        }
        return Effect.succeed(Option.none());
      },
      set: () => Effect.void,
      delete: () => Effect.void,
    });

  const dummyHttp = Layer.succeed(HttpClient.HttpClient, {
    execute: () => Effect.fail(new Error('Network error in test')),
  } as unknown as HttpClient.HttpClient);

  it('returns NoChange when there is no new match played', async () => {
    const mmr = makeMockHistory([
      { matchId: 'm1', tierId: 15, tierName: 'Platinum 1', lastChange: 20 },
    ]);

    const result = await Effect.runPromise(
      makeGetLatestRankChange(mmr)(Option.some('m1')).pipe(
        Effect.provide(Layer.merge(createMockKV(), dummyHttp)),
      ),
    );

    expect(result._tag).toBe('NoChange');
  });

  it('returns UpRank with streakCount and kills when promotion coincides with a 3-win streak', async () => {
    const mmr = makeMockHistory([
      { matchId: 'm3', tierId: 16, tierName: 'Platinum 2', lastChange: 22 },
      { matchId: 'm2', tierId: 15, tierName: 'Platinum 1', lastChange: 18 },
      { matchId: 'm1', tierId: 15, tierName: 'Platinum 1', lastChange: 24 },
    ]);

    const mockPerf = { character: 'Reyna', kills: 25, deaths: 10, assists: 3, score: 6500 };

    const result = await Effect.runPromise(
      makeGetLatestRankChange(mmr)(Option.some('m2')).pipe(
        Effect.provide(Layer.merge(createMockKV(mockPerf), dummyHttp)),
      ),
    );

    expect(result._tag).toBe('UpRank');
    if (result._tag === 'UpRank') {
      expect(result.oldRank).toBe('Platinum 1');
      expect(result.newRank).toBe('Platinum 2');
      expect(result.streakCount).toBe(3);
      expect(result.kills).toBe(25);
    }
  });

  it('returns WinStreak when tier did not change and player is on a 3-game heater', async () => {
    const mmr = makeMockHistory([
      { matchId: 'm3', tierId: 15, tierName: 'Platinum 1', lastChange: 21 },
      { matchId: 'm2', tierId: 15, tierName: 'Platinum 1', lastChange: 19 },
      { matchId: 'm1', tierId: 15, tierName: 'Platinum 1', lastChange: 23 },
    ]);

    const normalPerf = { character: 'Omen', kills: 14, deaths: 12, assists: 8, score: 4100 };

    const result = await Effect.runPromise(
      makeGetLatestRankChange(mmr)(Option.some('m2')).pipe(
        Effect.provide(Layer.merge(createMockKV(normalPerf), dummyHttp)),
      ),
    );

    expect(result._tag).toBe('WinStreak');
    if (result._tag === 'WinStreak') {
      expect(result.streakCount).toBe(3);
      expect(result.lastChange).toBe(21);
    }
  });

  it('returns LossStreak when tier did not change and player is on a 3-game losing skid', async () => {
    const mmr = makeMockHistory([
      { matchId: 'm3', tierId: 15, tierName: 'Platinum 1', lastChange: -18 },
      { matchId: 'm2', tierId: 15, tierName: 'Platinum 1', lastChange: -20 },
      { matchId: 'm1', tierId: 15, tierName: 'Platinum 1', lastChange: -15 },
    ]);

    const normalPerf = { character: 'Sova', kills: 12, deaths: 15, assists: 4, score: 3800 };

    const result = await Effect.runPromise(
      makeGetLatestRankChange(mmr)(Option.some('m2')).pipe(
        Effect.provide(Layer.merge(createMockKV(normalPerf), dummyHttp)),
      ),
    );

    expect(result._tag).toBe('LossStreak');
    if (result._tag === 'LossStreak') {
      expect(result.streakCount).toBe(3);
      expect(result.lastChange).toBe(-18);
    }
  });

  it('returns MonsterCarry when tier did not change, no streak, but player dropped 22 kills', async () => {
    const mmr = makeMockHistory([
      { matchId: 'm2', tierId: 15, tierName: 'Platinum 1', lastChange: 20 },
      { matchId: 'm1', tierId: 15, tierName: 'Platinum 1', lastChange: -18 },
    ]);

    const mockPerf = { character: 'Jett', kills: 22, deaths: 14, assists: 6, score: 5800 };

    const result = await Effect.runPromise(
      makeGetLatestRankChange(mmr)(Option.some('m1')).pipe(
        Effect.provide(Layer.merge(createMockKV(mockPerf), dummyHttp)),
      ),
    );

    expect(result._tag).toBe('MonsterCarry');
    if (result._tag === 'MonsterCarry') {
      expect(result.kills).toBe(22);
      expect(result.won).toBe(true);
      expect(result.score).toBe(5800);
    }
  });
});

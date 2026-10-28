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
import { verifyDiscordSignature } from '../src/discord/verify';
import {
  formatProgressBar,
  getTierColor,
  hasAdminPermission,
  InteractionType,
  InteractionResponseType,
} from '../src/discord/types';
import {
  handleLinkCommand,
  handleListCommand,
  handleRankCommand,
  handleRemoveCommand,
  handleUnlinkCommand,
  resolveTargetPlayers,
} from '../src/discord/commands';
import { D1Client } from '@effect/sql-d1';

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

  it('POST /interactions returns 401 without valid Ed25519 signature', async () => {
    const request = new IncomingRequest('http://example.com/interactions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-signature-ed25519': '00'.repeat(64),
        'x-signature-timestamp': `${Date.now()}`,
      },
      body: JSON.stringify({ type: 1 }),
    });
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

    const prompt5 = buildWinStreakPartnerPrompt(dummyCtx, 5, 32);
    expect(prompt5).toContain('5-game win streak');
    expect(prompt5).toContain('32 kills');
  });

  it('generates escalating loss streak tilt alert prompts (3 vs 5+ losses)', () => {
    const lossCtx = { ...dummyCtx, lastChange: -18 };
    const prompt3 = buildLossStreakPartnerPrompt(lossCtx, 3);
    expect(prompt3).toContain('3-game loss streak');
    expect(prompt3).toContain('compassionate tilt check');

    const prompt5 = buildLossStreakPartnerPrompt(lossCtx, 5, 34);
    expect(prompt5).toContain('5-game losing skid');
    expect(prompt5).toContain('log off for the day');
    expect(prompt5).toContain('34 kills');
  });

  it('generates monster carry prompts for 30+ kills as MVP on win vs loss', () => {
    const promptWin = buildMonsterCarryPartnerPrompt(dummyCtx, 34, true, 'Match MVP');
    expect(promptWin).toContain('34 kills hard carry');
    expect(promptWin).toContain('Match MVP');
    expect(promptWin).toContain('back must hurt');

    const promptLoss = buildMonsterCarryPartnerPrompt(
      { ...dummyCtx, lastChange: -16 },
      31,
      false,
      'Team MVP',
    );
    expect(promptLoss).toContain('31 kills');
    expect(promptLoss).toContain('Team MVP');
    expect(promptLoss).toContain('tragic 1v9 carry');
    expect(promptLoss).toContain('team let them down');
  });

  it('weaves streak and 30+ kills into UpRank promotion prompt', () => {
    const prompt = buildUpRankPartnerPrompt(dummyCtx, 'Diamond 3', 'Ascendant 1', {
      streakCount: 4,
      kills: 35,
    });
    expect(prompt).toContain('Ascendant 1');
    expect(prompt).toContain('4-game heater');
    expect(prompt).toContain('35 kills');
  });

  it('weaves losing skid and 30+ kills into DownRank demotion prompt', () => {
    const prompt = buildDownRankPartnerPrompt(dummyCtx, 'Ascendant 1', 'Diamond 3', {
      streakCount: 3,
      kills: 31,
    });
    expect(prompt).toContain('Diamond 3');
    expect(prompt).toContain('3-game losing skid');
    expect(prompt).toContain('31 kills');
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

    const mockPerf = {
      character: 'Reyna',
      kills: 35,
      deaths: 10,
      assists: 3,
      score: 6500,
      isMatchMvp: true,
      isTeamMvp: true,
    };

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
      expect(result.kills).toBe(35);
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

  it('returns NoChange when player dropped kills below 30 or is not MVP', async () => {
    const mmr = makeMockHistory([
      { matchId: 'm2', tierId: 15, tierName: 'Platinum 1', lastChange: 20 },
      { matchId: 'm1', tierId: 15, tierName: 'Platinum 1', lastChange: -18 },
    ]);

    // Case 1: 28 kills (below 30) even as Match MVP
    const perfLowKills = {
      character: 'Jett',
      kills: 28,
      deaths: 14,
      assists: 6,
      score: 5800,
      isMatchMvp: true,
      isTeamMvp: true,
    };
    const resLowKills = await Effect.runPromise(
      makeGetLatestRankChange(mmr)(Option.some('m1')).pipe(
        Effect.provide(Layer.merge(createMockKV(perfLowKills), dummyHttp)),
      ),
    );
    expect(resLowKills._tag).toBe('NoChange');

    // Case 2: 32 kills (>=30) but neither Match MVP nor Team MVP
    const perfNotMvp = {
      character: 'Jett',
      kills: 32,
      deaths: 14,
      assists: 6,
      score: 5800,
      isMatchMvp: false,
      isTeamMvp: false,
    };
    const resNotMvp = await Effect.runPromise(
      makeGetLatestRankChange(mmr)(Option.some('m1')).pipe(
        Effect.provide(Layer.merge(createMockKV(perfNotMvp), dummyHttp)),
      ),
    );
    expect(resNotMvp._tag).toBe('NoChange');
  });

  it('returns MonsterCarry when player dropped >= 30 kills as Match MVP on win', async () => {
    const mmr = makeMockHistory([
      { matchId: 'm2', tierId: 15, tierName: 'Platinum 1', lastChange: 20 },
      { matchId: 'm1', tierId: 15, tierName: 'Platinum 1', lastChange: -18 },
    ]);

    const mockPerf = {
      character: 'Jett',
      kills: 34,
      deaths: 14,
      assists: 6,
      score: 6200,
      isMatchMvp: true,
      isTeamMvp: true,
    };

    const result = await Effect.runPromise(
      makeGetLatestRankChange(mmr)(Option.some('m1')).pipe(
        Effect.provide(Layer.merge(createMockKV(mockPerf), dummyHttp)),
      ),
    );

    expect(result._tag).toBe('MonsterCarry');
    if (result._tag === 'MonsterCarry') {
      expect(result.kills).toBe(34);
      expect(result.won).toBe(true);
      expect(result.score).toBe(6200);
      expect(result.isMatchMvp).toBe(true);
    }
  });

  it('returns MonsterCarry (1v9 Tragedy) when player dropped >= 30 kills as Team MVP on loss', async () => {
    const mmr = makeMockHistory([
      { matchId: 'm2', tierId: 15, tierName: 'Platinum 1', lastChange: -16 },
      { matchId: 'm1', tierId: 15, tierName: 'Platinum 1', lastChange: 18 },
    ]);

    const mockPerf = {
      character: 'Reyna',
      kills: 31,
      deaths: 18,
      assists: 4,
      score: 5900,
      isMatchMvp: false,
      isTeamMvp: true,
    };

    const result = await Effect.runPromise(
      makeGetLatestRankChange(mmr)(Option.some('m1')).pipe(
        Effect.provide(Layer.merge(createMockKV(mockPerf), dummyHttp)),
      ),
    );

    expect(result._tag).toBe('MonsterCarry');
    if (result._tag === 'MonsterCarry') {
      expect(result.kills).toBe(31);
      expect(result.won).toBe(false);
      expect(result.score).toBe(5900);
      expect(result.isMatchMvp).toBe(false);
    }
  });
});

describe('Discord Embed & Permission Utilities', () => {
  it('formats progress bar accurately', () => {
    const bar64 = formatProgressBar(64, 100);
    expect(bar64).toContain('64/100 RR');
    expect(bar64).toContain('█');
    expect(bar64).toContain('░');

    const bar0 = formatProgressBar(0, 100);
    expect(bar0).toBe('[░░░░░░░░░░] 0/100 RR');

    const bar100 = formatProgressBar(100, 100);
    expect(bar100).toBe('[██████████] 100/100 RR');
  });

  it('maps tier names to characteristic colors', () => {
    expect(getTierColor('Diamond 2')).toBe(0xb977d6);
    expect(getTierColor('Ascendant 1')).toBe(0x48a66d);
    expect(getTierColor('Gold 3')).toBe(0xe2b338);
    expect(getTierColor('Immortal 3')).toBe(0xc83c5b);
  });

  it('detects administrator and manage server permissions', () => {
    const adminBit = (1n << 3n).toString();
    const manageGuildBit = (1n << 5n).toString();
    const normalUserBit = '0';

    expect(hasAdminPermission(adminBit)).toBe(true);
    expect(hasAdminPermission(manageGuildBit)).toBe(true);
    expect(hasAdminPermission(normalUserBit)).toBe(false);
    expect(hasAdminPermission(undefined)).toBe(false);
  });
});

describe('Discord Cryptography & Signature Verification', () => {
  it('rejects missing or malformed signatures', async () => {
    const valid = await verifyDiscordSignature('pubkey', 'sig', 'timestamp', 'body');
    expect(valid).toBe(false);
  });

  it('generates a valid Ed25519 signature and verifies successfully', async () => {
    let keyPair: CryptoKeyPair;
    try {
      keyPair = await crypto.subtle.generateKey(
        { name: 'NODE-ED25519', namedCurve: 'NODE-ED25519' },
        true,
        ['sign', 'verify'],
      );
    } catch {
      keyPair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    }

    const exportedRaw = await crypto.subtle.exportKey('raw', keyPair.publicKey);
    const pubKeyHex = Array.from(new Uint8Array(exportedRaw))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const timestamp = '1710000000';
    const body = JSON.stringify({ type: 1 });
    const message = new TextEncoder().encode(timestamp + body);

    const sigArrayBuffer = await crypto.subtle.sign(
      keyPair.privateKey.algorithm.name,
      keyPair.privateKey,
      message,
    );
    const sigHex = Array.from(new Uint8Array(sigArrayBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const verified = await verifyDiscordSignature(pubKeyHex, sigHex, timestamp, body);
    expect(verified).toBe(true);

    const tampered = await verifyDiscordSignature(pubKeyHex, sigHex, timestamp, 'tampered');
    expect(tampered).toBe(false);
  });
});

describe('Discord Slash Command Handlers', () => {
  const dummyD1 = Layer.succeed(D1Client.D1Client, ((_query: unknown, ..._args: unknown[]) => {
    return Effect.succeed([
      { puuid: 'p1', name: 'PlayerOne', tag: '1234', discord_user_id: '111' },
      { puuid: 'p2', name: 'PlayerTwo', tag: '5678', discord_user_id: null },
    ]);
  }) as unknown as D1Client.D1Client);

  it('handleListCommand returns roster embed with members', async () => {
    const response = await Effect.runPromise(handleListCommand().pipe(Effect.provide(dummyD1)));
    expect(response.type).toBe(InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE);
    expect(response.data?.embeds?.[0]?.title).toContain('Grove Street Tracked Roster');
    expect(response.data?.embeds?.[0]?.description).toContain('PlayerOne#1234');
    expect(response.data?.embeds?.[0]?.description).toContain('<@111>');
    expect(response.data?.embeds?.[0]?.description).toContain('*Unlinked*');
  });

  it('handleLinkCommand returns guidance on missing hash separator', async () => {
    const dummyHttp = Layer.succeed(HttpClient.HttpClient, {} as unknown as HttpClient.HttpClient);

    const interaction = {
      id: 'i1',
      type: InteractionType.APPLICATION_COMMAND,
      token: 'tok',
      user: { id: '999', username: 'TestUser' },
      data: {
        id: 'c1',
        name: 'link',
        options: [{ name: 'riot_id', type: 3, value: 'InvalidRiotIdWithoutTag' }],
      },
    };

    const response = await Effect.runPromise(
      handleLinkCommand(interaction).pipe(Effect.provide(Layer.merge(dummyD1, dummyHttp))),
    );

    expect(response.data?.content).toContain('Name#Tag');
  });

  it('handleRankCommand returns linking guidance for unlinked caller without options', async () => {
    const emptyD1 = Layer.succeed(D1Client.D1Client, (() =>
      Effect.succeed([])) as unknown as D1Client.D1Client);
    const dummyHttp = Layer.succeed(HttpClient.HttpClient, {} as unknown as HttpClient.HttpClient);
    const dummyKV = Layer.succeed(KVClient, {
      get: () => Effect.succeed(Option.none()),
      set: () => Effect.void,
      delete: () => Effect.void,
    });

    const interaction = {
      id: 'i2',
      type: InteractionType.APPLICATION_COMMAND,
      token: 'tok',
      user: { id: '999', username: 'UnlinkedUser' },
      data: { id: 'c2', name: 'rank' },
    };

    const response = await Effect.runPromise(
      handleRankCommand(interaction).pipe(
        Effect.provide(Layer.mergeAll(emptyD1, dummyHttp, dummyKV)),
      ),
    );

    expect(response.data?.content).toContain('Discord Account Not Linked');
    expect(response.data?.content).toContain('/link riot_id: Name#Tag');
  });

  it('resolveTargetPlayers resolves mentions, riot IDs, and caller fallback', async () => {
    const mockDb = [
      { puuid: 'p1', name: 'MainAcc', tag: '1001', discord_user_id: '111111' },
      { puuid: 'p2', name: 'AltAcc', tag: '2002', discord_user_id: '111111' },
      { puuid: 'p3', name: 'OtherGuy', tag: '3003', discord_user_id: '222222' },
    ];

    const mockD1 = Layer.succeed(D1Client.D1Client, ((query: any, ...params: any[]) => {
      const sql = typeof query === 'string' ? query : Array.isArray(query) ? query.join('?') : '';
      if (sql.includes('discord_user_id =')) {
        const id = params[0] || '';
        return Effect.succeed(mockDb.filter((p) => p.discord_user_id === id));
      }
      if (sql.includes('LOWER(name) = LOWER(?) AND LOWER(tag) = LOWER(?)')) {
        const name = params[0]?.toLowerCase();
        const tag = params[1]?.toLowerCase();
        return Effect.succeed(
          mockDb.filter((p) => p.name.toLowerCase() === name && p.tag.toLowerCase() === tag),
        );
      }
      return Effect.succeed(mockDb);
    }) as unknown as D1Client.D1Client);

    // 1. Mention resolution
    const mentionInteraction = {
      id: 'i-mention',
      type: InteractionType.APPLICATION_COMMAND,
      token: 'tok',
      user: { id: 'caller1' },
      data: { id: 'c', name: 'rank' },
    };
    const resMention = await Effect.runPromise(
      resolveTargetPlayers(mentionInteraction, '<@111111>').pipe(Effect.provide(mockD1)),
    );
    expect(resMention).toHaveLength(2);
    expect(resMention[0]?.name).toBe('MainAcc');
    expect(resMention[1]?.name).toBe('AltAcc');

    // 2. Exact Riot ID resolution
    const resRiotId = await Effect.runPromise(
      resolveTargetPlayers(mentionInteraction, 'OtherGuy#3003').pipe(Effect.provide(mockD1)),
    );
    expect(resRiotId).toHaveLength(1);
    expect(resRiotId[0]?.name).toBe('OtherGuy');

    // 3. Caller fallback when no playerOption
    const callerInteraction = {
      id: 'i-caller',
      type: InteractionType.APPLICATION_COMMAND,
      token: 'tok',
      user: { id: '111111' },
      data: { id: 'c', name: 'rank' },
    };
    const resCaller = await Effect.runPromise(
      resolveTargetPlayers(callerInteraction).pipe(Effect.provide(mockD1)),
    );
    expect(resCaller).toHaveLength(2);
  });

  it('handleRankCommand displays highest-ranked account when member has multiple accounts', async () => {
    const mockAccounts = [
      { puuid: 'p-silver', name: 'SilverMain', tag: '1111', discord_user_id: 'userMulti' },
      { puuid: 'p-gold', name: 'GoldSmurf', tag: '2222', discord_user_id: 'userMulti' },
    ];

    const mockD1 = Layer.succeed(D1Client.D1Client, ((_query: any, ..._params: any[]) => {
      return Effect.succeed(mockAccounts);
    }) as unknown as D1Client.D1Client);

    const mockKV = Layer.succeed(KVClient, {
      get: (key: string) => {
        if (key.includes('p-silver')) {
          return Effect.succeed(
            Option.some(
              JSON.stringify({
                tierName: 'Silver 1',
                tierId: 9,
                rr: 45,
                elo: 645,
                lastChange: 15,
                map: 'Ascent',
                matchId: 'm1',
                streakType: 'win',
                streakCount: 2,
              }),
            ),
          );
        }
        if (key.includes('p-gold')) {
          return Effect.succeed(
            Option.some(
              JSON.stringify({
                tierName: 'Gold 2',
                tierId: 13,
                rr: 88,
                elo: 1088,
                lastChange: 20,
                map: 'Haven',
                matchId: 'm2',
                streakType: 'win',
                streakCount: 3,
              }),
            ),
          );
        }
        return Effect.succeed(Option.none());
      },
      set: () => Effect.void,
      delete: () => Effect.void,
    });

    const dummyHttp = Layer.succeed(HttpClient.HttpClient, {} as unknown as HttpClient.HttpClient);

    const interaction = {
      id: 'i-rank-multi',
      type: InteractionType.APPLICATION_COMMAND,
      token: 'tok',
      user: { id: 'userMulti' },
      data: { id: 'c-rank', name: 'rank' },
    };

    const response = await Effect.runPromise(
      handleRankCommand(interaction).pipe(
        Effect.provide(Layer.mergeAll(mockD1, dummyHttp, mockKV)),
      ),
    );

    expect(response.type).toBe(InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE);
    const embed = response.data?.embeds?.[0];
    expect(embed?.title).toContain('GoldSmurf#2222');
    expect(embed?.fields?.[0]?.value).toContain('Gold 2');
    expect(embed?.footer?.text).toContain('Also tracking: SilverMain#1111 (Silver 1)');
  });

  it('handleUnlinkCommand guides user when multiple accounts are linked without specific player option', async () => {
    const mockAccounts = [
      { puuid: 'p1', name: 'MainAcc', tag: '1001', discord_user_id: 'userX' },
      { puuid: 'p2', name: 'AltAcc', tag: '2002', discord_user_id: 'userX' },
    ];

    const mockD1 = Layer.succeed(D1Client.D1Client, ((query: any, ..._params: any[]) => {
      const sql = typeof query === 'string' ? query : Array.isArray(query) ? query.join('?') : '';
      if (sql.includes('SELECT')) {
        return Effect.succeed(mockAccounts);
      }
      return Effect.succeed([]);
    }) as unknown as D1Client.D1Client);

    const interaction = {
      id: 'i-unlink',
      type: InteractionType.APPLICATION_COMMAND,
      token: 'tok',
      user: { id: 'userX' },
      data: { id: 'c-unlink', name: 'unlink' },
    };

    const response = await Effect.runPromise(
      handleUnlinkCommand(interaction).pipe(Effect.provide(mockD1)),
    );

    expect(response.data?.content).toContain('You have **2 accounts** linked');
    expect(response.data?.content).toContain('/unlink player: MainAcc#1001');
    expect(response.data?.content).toContain('/unlink player: AltAcc#2002');
  });

  it('handleUnlinkCommand unlinks target alt account successfully', async () => {
    let deletedPuuid = '';
    const mockD1 = Layer.succeed(D1Client.D1Client, ((query: any, ...params: any[]) => {
      const sql = typeof query === 'string' ? query : Array.isArray(query) ? query.join('?') : '';
      if (sql.includes('SELECT')) {
        return Effect.succeed([
          { puuid: 'p-alt', name: 'AltAcc', tag: '2002', discord_user_id: 'userX' },
        ]);
      }
      if (sql.includes('DELETE')) {
        deletedPuuid = params[0];
        return Effect.succeed([]);
      }
      return Effect.succeed([]);
    }) as unknown as D1Client.D1Client);

    const interaction = {
      id: 'i-unlink-alt',
      type: InteractionType.APPLICATION_COMMAND,
      token: 'tok',
      user: { id: 'userX' },
      data: {
        id: 'c-unlink',
        name: 'unlink',
        options: [{ name: 'player', type: 3, value: 'AltAcc#2002' }],
      },
    };

    const response = await Effect.runPromise(
      handleUnlinkCommand(interaction).pipe(Effect.provide(mockD1)),
    );

    expect(deletedPuuid).toBe('p-alt');
    expect(response.data?.embeds?.[0]?.title).toContain('Account Unlinked');
    expect(response.data?.embeds?.[0]?.description).toContain('AltAcc#2002');
  });

  it('handleRemoveCommand enforces admin permission and supports mention & tag', async () => {
    // 1. Non-admin fails
    const nonAdminInteraction = {
      id: 'i-remove-fail',
      type: InteractionType.APPLICATION_COMMAND,
      token: 'tok',
      member: {
        user: { id: 'regular-user' },
        permissions: '0',
      },
      data: {
        id: 'c-remove',
        name: 'remove',
        options: [{ name: 'player', type: 3, value: 'Any#1234' }],
      },
    };

    const dummyD1 = Layer.succeed(D1Client.D1Client, (() =>
      Effect.succeed([])) as unknown as D1Client.D1Client);

    const failResponse = await Effect.runPromise(
      handleRemoveCommand(nonAdminInteraction).pipe(Effect.provide(dummyD1)),
    );
    expect(failResponse.data?.content).toContain('Administrator');

    // 2. Admin removes by mention
    let deleteQuery = '';
    const adminD1 = Layer.succeed(D1Client.D1Client, ((query: any, ..._params: any[]) => {
      deleteQuery = typeof query === 'string' ? query : Array.isArray(query) ? query.join('?') : '';
      return Effect.succeed([]);
    }) as unknown as D1Client.D1Client);

    const adminMentionInteraction = {
      id: 'i-remove-admin',
      type: InteractionType.APPLICATION_COMMAND,
      token: 'tok',
      member: {
        user: { id: 'admin-user' },
        permissions: `${1n << 3n}`, // ADMINISTRATOR
      },
      data: {
        id: 'c-remove',
        name: 'remove',
        options: [{ name: 'player', type: 3, value: '<@999999>' }],
      },
    };

    const adminResponse = await Effect.runPromise(
      handleRemoveCommand(adminMentionInteraction).pipe(Effect.provide(adminD1)),
    );
    expect(deleteQuery).toContain('discord_user_id =');
    expect(adminResponse.data?.embeds?.[0]?.title).toContain('Member Accounts Removed');
  });
});

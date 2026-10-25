import { D1Client } from '@effect/sql-d1';
import {
  Array,
  Console,
  DateTime,
  Effect,
  Match,
  Option,
  Order,
  pipe,
  Random,
  Schema,
} from 'effect';
import {
  Player,
  MMRHistoryV2,
  Agents,
  Agent,
  AIResponse,
  HookMessage,
  MMRHistoryV2Account,
} from './schemas';
import { HttpClient, HttpClientRequest, HttpClientResponse } from '@effect/platform';
import { env } from 'cloudflare:workers';
import { AIClient, KVClient } from './services';
import {
  DownRank,
  FirstRank,
  NewSeason,
  NoChange,
  reportMatch,
  UpRank,
  DerankProtected,
  RefundedRR,
  WinStreak,
  LossStreak,
  MonsterCarry,
  type Report,
} from './model';
import { getAgentPersona } from './personas';
import { fetchPlayerMatchPerformance } from './match';
import { logStructuredError } from './logger';
import {
  type PartnerPromptContext,
  buildCommanderRefundPrompt,
  buildDerankProtectedPartnerPrompt,
  buildDownRankPartnerPrompt,
  buildFirstRankPartnerPrompt,
  buildUpRankPartnerPrompt,
  buildWinStreakPartnerPrompt,
  buildLossStreakPartnerPrompt,
  buildMonsterCarryPartnerPrompt,
} from './prompts';

const dbGetPlayers = D1Client.D1Client.pipe(
  Effect.flatMap(
    (v) => v<Player>`SELECT puuid, name, tag, discord_user_id FROM players ORDER BY name DESC`,
  ),
);

const makeFetchMMRHistoryV2 = (player: Player) =>
  HttpClient.HttpClient.pipe(
    Effect.flatMap((c) =>
      HttpClientRequest.get(
        `https://api.henrikdev.xyz/valorant/v2/by-puuid/mmr-history/ap/pc/${player.puuid}`,
      ).pipe(
        HttpClientRequest.setHeaders({ Authorization: env.VALAPIKEY, Accept: '*/*' }),
        c.execute,
        Effect.flatMap(HttpClientResponse.schemaBodyJson(MMRHistoryV2)),
      ),
    ),
  );

export interface StreakResult {
  readonly type: 'win' | 'loss' | 'none';
  readonly count: number;
}

export const computeStreak = (
  history: ReadonlyArray<{ readonly last_change: number }>,
): StreakResult => {
  const first = history[0];
  if (!first) return { type: 'none', count: 0 };
  if (first.last_change > 0) {
    let count = 0;
    for (const h of history) {
      if (h.last_change > 0) count++;
      else break;
    }
    return { type: 'win', count };
  } else if (first.last_change < 0) {
    let count = 0;
    for (const h of history) {
      if (h.last_change < 0) count++;
      else break;
    }
    return { type: 'loss', count };
  }
  return { type: 'none', count: 0 };
};

export const makeGetLatestRankChange =
  (m: MMRHistoryV2) =>
  (
    lastMatchId: Option.Option<string>,
  ): Effect.Effect<Report, never, HttpClient.HttpClient | KVClient> => {
    const tt = pipe(
      Option.match(lastMatchId, {
        onNone: () => [...m.data.history],
        onSome: (lastId) =>
          pipe(
            Array.findFirstIndex(m.data.history, (x) => x.match_id === lastId),
            Option.map((l) => Array.take(m.data.history, l + 1)),
            Option.getOrElse(() => [...m.data.history]),
          ),
      }),
    );

    const isNewMatch = Option.isNone(lastMatchId) || tt.length > 1;
    const latest = tt[0];

    if (!isNewMatch || !latest) {
      return Effect.succeed(NoChange());
    }

    if (latest.refunded_rr > 0) {
      return Effect.succeed(
        RefundedRR({
          amount: latest.refunded_rr,
          currentRank: latest.tier.name,
        }),
      );
    }

    const streak = computeStreak(m.data.history);
    const streakCount = streak.count >= 3 ? streak.count : undefined;

    return fetchPlayerMatchPerformance(latest.match_id, m.data.account.puuid).pipe(
      Effect.map((maybePerf) => {
        const kills = pipe(
          maybePerf,
          Option.map((p) => p.kills),
          Option.filter((k) => k >= 20),
          Option.getOrUndefined,
        );

        if (latest.was_derank_protected) {
          return DerankProtected({
            rank: latest.tier.name,
            matchId: latest.match_id,
            map: latest.map.name,
            lastChange: latest.last_change,
            kills,
          });
        }

        const rankChange = pipe(
          Array.zip(tt, Array.drop(tt, 1)),
          Array.findFirst(([l, r]) => l.tier.id !== r.tier.id),
          Option.flatMap(([l, r]) =>
            Match.value({ v: { l, r } }).pipe(
              Match.when({ v: ({ r }) => r.tier.id === 0 }, () =>
                FirstRank({
                  rank: l.tier.name,
                  matchId: l.match_id,
                  map: l.map.name,
                  lastChange: l.last_change,
                  kills,
                }),
              ),
              Match.when({ v: ({ l, r }) => l.season.id !== r.season.id }, () => NewSeason()),
              Match.when(
                { v: ({ l, r }) => l.season.id === r.season.id && l.tier.id > r.tier.id },
                () =>
                  UpRank({
                    oldRank: r.tier.name,
                    newRank: l.tier.name,
                    matchId: l.match_id,
                    map: l.map.name,
                    lastChange: l.last_change,
                    streakCount: streak.type === 'win' ? streakCount : undefined,
                    kills,
                  }),
              ),
              Match.when(
                { v: ({ l, r }) => l.season.id === r.season.id && l.tier.id < r.tier.id },
                () =>
                  DownRank({
                    oldRank: r.tier.name,
                    newRank: l.tier.name,
                    matchId: l.match_id,
                    map: l.map.name,
                    lastChange: l.last_change,
                    streakCount: streak.type === 'loss' ? streakCount : undefined,
                    kills,
                  }),
              ),
              Match.option,
            ),
          ),
        );

        if (Option.isSome(rankChange)) {
          return rankChange.value;
        }

        if (streak.count >= 3 && streak.type === 'win') {
          return WinStreak({
            streakCount: streak.count,
            matchId: latest.match_id,
            map: latest.map.name,
            lastChange: latest.last_change,
            kills,
          });
        }

        if (streak.count >= 3 && streak.type === 'loss') {
          return LossStreak({
            streakCount: streak.count,
            matchId: latest.match_id,
            map: latest.map.name,
            lastChange: latest.last_change,
            kills,
          });
        }

        if (Option.isSome(maybePerf) && maybePerf.value.kills >= 20) {
          const perf = maybePerf.value;
          return MonsterCarry({
            kills: perf.kills,
            deaths: perf.deaths,
            assists: perf.assists,
            score: perf.score,
            won: latest.last_change > 0,
            matchId: latest.match_id,
            map: latest.map.name,
            lastChange: latest.last_change,
          });
        }

        return NoChange();
      }),
    );
  };

const fetchPlayableAgents = HttpClient.HttpClient.pipe(
  Effect.flatMap((c) =>
    HttpClientRequest.get('https://valorant-api.com/v1/agents?isPlayableCharacter=true').pipe(
      c.execute,
      Effect.flatMap(HttpClientResponse.schemaBodyJson(Agents)),
    ),
  ),
);

const defaultAgent = new Agent({
  displayName: 'Brimstone',
  displayIcon: new URL(
    'https://media.valorant-api.com/agents/9f0d8ba9-42c0-8739-6604-6c39d37746b1/displayicon.png',
  ),
  description: 'Commander Brimstone',
});

const cleanDialogue = (text: string) =>
  text
    .trim()
    .replace(/^["']|["']$/g, '')
    .trim();

const generateAndCreateHookMessage = ({
  agent,
  prompt,
  fallback,
}: {
  agent: Agent;
  prompt: string;
  fallback: string;
}) =>
  AIClient.pipe(
    Effect.flatMap((ai) => ai.run(prompt)),
    Effect.flatMap((v) => Schema.decodeUnknown(AIResponse)(v)),
    Effect.map((res) => {
      const text = res.response ?? res.choices?.[0]?.message.content;
      return text && text.trim().length > 0 ? cleanDialogue(text) : fallback;
    }),
    Effect.orElseSucceed(() => fallback),
    Effect.flatMap((content) =>
      Schema.decodeUnknown(HookMessage)({
        content,
        username: agent.displayName,
        avatar_url: agent.displayIcon.toString(),
      }),
    ),
    Effect.map(Option.some),
    Effect.catchAll(() => Effect.succeed(Option.none<HookMessage>())),
  );

const buildMatchReport = ({
  p,
  matchId,
  map,
  lastChange,
  buildPrompt,
  fallback,
}: {
  p: Player;
  matchId: string;
  map: string;
  lastChange: number;
  buildPrompt: (ctx: PartnerPromptContext) => string;
  fallback: string;
}) =>
  Effect.all({
    maybePerf: fetchPlayerMatchPerformance(matchId, p.puuid),
    agents: fetchPlayableAgents,
  }).pipe(
    Effect.flatMap(({ maybePerf, agents }) => {
      const fallbackChoice =
        agents.data.length > 0 ? Random.choice(agents.data) : Effect.succeed(defaultAgent);

      return fallbackChoice.pipe(
        Effect.flatMap((randomAgent) => {
          const selectedAgent = pipe(
            maybePerf,
            Option.flatMap((perf) =>
              Array.findFirst(
                agents.data,
                (a) => a.displayName.toLowerCase() === perf.character.toLowerCase(),
              ),
            ),
            Option.getOrElse(() => randomAgent),
          );

          const persona = getAgentPersona(selectedAgent.displayName);
          const kda = pipe(
            maybePerf,
            Option.map((perf) => `${perf.kills}/${perf.deaths}/${perf.assists}`),
            Option.getOrUndefined,
          );

          const prompt = buildPrompt({
            player: `**${p.name}#${p.tag}**`,
            discordMention: `<@${p.discord_user_id}>`,
            persona,
            map: map !== '' ? map : 'Unknown Map',
            lastChange,
            kda,
          });

          return generateAndCreateHookMessage({
            agent: selectedAgent,
            prompt,
            fallback,
          });
        }),
      );
    }),
  );

const makeBuildReport = (p: Player) => (r: Report) =>
  pipe(
    r,
    reportMatch({
      NoChange: () => Effect.succeed(Option.none<HookMessage>()),
      NewSeason: () => Effect.succeed(Option.none<HookMessage>()),
      RefundedRR: ({ amount, currentRank }) =>
        fetchPlayableAgents.pipe(
          Effect.flatMap((agents) => {
            const brimstone =
              agents.data.find((a) => a.displayName.toLowerCase() === 'brimstone') ??
              agents.data[0] ??
              defaultAgent;
            const prompt = buildCommanderRefundPrompt(
              `**${p.name}#${p.tag}**`,
              `<@${p.discord_user_id}>`,
              amount,
              currentRank,
            );
            const fallback = `**${p.name}#${p.tag}** received +${amount} refunded RR after Vanguard banned a cheater. Justice served, <@${p.discord_user_id}>.`;

            return generateAndCreateHookMessage({
              agent: brimstone,
              prompt,
              fallback,
            });
          }),
        ),
      FirstRank: ({ rank, matchId, map, lastChange }) =>
        buildMatchReport({
          p,
          matchId,
          map,
          lastChange,
          buildPrompt: (ctx) => buildFirstRankPartnerPrompt(ctx, rank),
          fallback: `**${p.name}#${p.tag}** calibrated as ${rank} on ${map}. Ready for the climb, <@${p.discord_user_id}>.`,
        }),
      UpRank: ({ oldRank, newRank, matchId, map, lastChange, streakCount, kills }) =>
        buildMatchReport({
          p,
          matchId,
          map,
          lastChange,
          buildPrompt: (ctx) =>
            buildUpRankPartnerPrompt(ctx, oldRank, newRank, { streakCount, kills }),
          fallback: `**${p.name}#${p.tag}** has been promoted to ${newRank}${streakCount && streakCount >= 3 ? ` (${streakCount}-game heater!)` : ''}${kills && kills >= 20 ? ` with ${kills} kills` : ''}! Well played on ${map}, <@${p.discord_user_id}>.`,
        }),
      DownRank: ({ oldRank, newRank, matchId, map, lastChange, streakCount, kills }) =>
        buildMatchReport({
          p,
          matchId,
          map,
          lastChange,
          buildPrompt: (ctx) =>
            buildDownRankPartnerPrompt(ctx, oldRank, newRank, { streakCount, kills }),
          fallback: `**${p.name}#${p.tag}** has been demoted to ${newRank}${streakCount && streakCount >= 3 ? ` (${streakCount}-game losing skid)` : ''}. Tough game on ${map}, <@${p.discord_user_id}>.`,
        }),
      DerankProtected: ({ rank, matchId, map, lastChange }) =>
        buildMatchReport({
          p,
          matchId,
          map,
          lastChange,
          buildPrompt: (ctx) => buildDerankProtectedPartnerPrompt(ctx, rank),
          fallback: `**${p.name}#${p.tag}** was saved from demoting by the derank shield on ${map}! Still ${rank}, <@${p.discord_user_id}>.`,
        }),
      WinStreak: ({ streakCount, matchId, map, lastChange, kills }) =>
        buildMatchReport({
          p,
          matchId,
          map,
          lastChange,
          buildPrompt: (ctx) => buildWinStreakPartnerPrompt(ctx, streakCount, kills),
          fallback: `🔥 **${p.name}#${p.tag}** is on a ${streakCount}-game heater! Gained +${lastChange} RR on ${map}${kills && kills >= 20 ? ` with ${kills} kills` : ''}. Unstoppable, <@${p.discord_user_id}>!`,
        }),
      LossStreak: ({ streakCount, matchId, map, lastChange, kills }) =>
        buildMatchReport({
          p,
          matchId,
          map,
          lastChange,
          buildPrompt: (ctx) => buildLossStreakPartnerPrompt(ctx, streakCount, kills),
          fallback: `⚠️ **Tilt Alert**: **${p.name}#${p.tag}** has dropped ${streakCount} consecutive games (${lastChange} RR on ${map}). Take a breather and reset mental, <@${p.discord_user_id}>.`,
        }),
      MonsterCarry: ({ kills, score, won, matchId, map, lastChange }) =>
        buildMatchReport({
          p,
          matchId,
          map,
          lastChange,
          buildPrompt: (ctx) => buildMonsterCarryPartnerPrompt(ctx, kills, won),
          fallback: won
            ? `👑 **Monster Carry**: **${p.name}#${p.tag}** dropped ${kills} kills on ${map} (Score: ${score}) to secure the victory! Masterclass, <@${p.discord_user_id}>!`
            : `💔 **1v9 Tragedy**: **${p.name}#${p.tag}** dropped ${kills} kills on ${map}, but the team couldn't close it out. Unlucky, <@${p.discord_user_id}>.`,
        }),
    }),
  );

const buildCategory = (m: MMRHistoryV2) =>
  KVClient.pipe(
    Effect.flatMap((kv) => kv.get(m.data.account.puuid)),
    Effect.flatMap(makeGetLatestRankChange(m)),
  );

const advanceKV = (m: MMRHistoryV2) =>
  pipe(
    Option.fromNullable(m.data.history.at(0)),
    Option.match({
      onNone: () => Effect.void,
      onSome: (latest) =>
        KVClient.pipe(Effect.flatMap((kv) => kv.set(m.data.account.puuid, latest.match_id))),
    }),
  );

const ensureSorted = (m: MMRHistoryV2) =>
  new MMRHistoryV2({
    status: m.status,
    errors: m.errors,
    data: {
      ...m.data,
      history: pipe(
        m.data.history,
        Array.sortBy(Order.mapInput(Order.reverse(Order.Date), (h) => DateTime.toDate(h.date))),
      ),
    },
  });

const sendReport = (m: HookMessage) =>
  HttpClient.HttpClient.pipe(
    Effect.zipWith(Schema.encode(HookMessage)(m), (c, msg) =>
      HttpClientRequest.post(env.WEBHOOK_URL).pipe(
        HttpClientRequest.bodyJson(msg),
        Effect.flatMap(c.execute),
        Effect.flatMap(HttpClientResponse.filterStatusOk),
      ),
    ),
    Effect.flatten,
    Effect.tapErrorCause((c) =>
      logStructuredError('discord_webhook_failure', c, { username: m.username }),
    ),
  );

const makeReporting =
  (z: Player) =>
  <E, R>(mmr: Effect.Effect<MMRHistoryV2, E, R>) =>
    mmr.pipe(
      Effect.map(ensureSorted),
      Effect.flatMap((mmr) =>
        buildCategory(mmr).pipe(
          Effect.flatMap(makeBuildReport(z)),
          Effect.flatMap((maybeMsg) =>
            Option.match(maybeMsg, {
              onNone: () => advanceKV(mmr),
              onSome: (msg) => sendReport(msg).pipe(Effect.zipRight(advanceKV(mmr))),
            }),
          ),
        ),
      ),
      Effect.either,
    );

const makeUpdateAccount = (account: MMRHistoryV2Account) =>
  D1Client.D1Client.pipe(
    Effect.flatMap(
      (v) =>
        v<Player>`SELECT puuid, name, tag, discord_user_id FROM players WHERE puuid = ${account.puuid}`,
    ),
    Effect.flatMap(Schema.decode(Schema.Array(Player))),
    Effect.flatMap(Array.head),
    Effect.flatMap((p) => {
      const nameChanged = p.name !== account.name;
      const tagChanged = p.tag !== account.tag;

      if (!nameChanged && !tagChanged) return Effect.void;

      return D1Client.D1Client.pipe(
        Effect.flatMap(
          (v) =>
            v`UPDATE players SET name = ${account.name}, tag = ${account.tag} WHERE puuid = ${account.puuid}`,
        ),
        Effect.tap(
          Console.log(
            JSON.stringify({
              message: 'Player identity updated',
              puuid: account.puuid,
              from: `${p.name}#${p.tag}`,
              to: `${account.name}#${account.tag}`,
            }),
          ),
        ),
      );
    }),
  );

export const scheduled = dbGetPlayers.pipe(
  Effect.flatMap((v) =>
    Effect.forEach(
      v,
      (z) =>
        makeFetchMMRHistoryV2(z).pipe(
          (x) =>
            Effect.zipLeft(
              x.pipe(makeReporting(z)),
              x.pipe(Effect.flatMap(({ data }) => makeUpdateAccount(data.account))),
              { concurrent: true },
            ),
          Effect.catchAllCause((cause) =>
            logStructuredError('player_cron_failure', cause, {
              puuid: z.puuid,
              player: `${z.name}#${z.tag}`,
            }),
          ),
        ),
      {
        concurrency: 2,
      },
    ),
  ),
  Effect.tapErrorCause((c) => logStructuredError('scheduled_cron_failure', c)),
);

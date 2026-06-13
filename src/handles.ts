import { D1Client } from '@effect/sql-d1';
import { verifyKey, InteractionType, InteractionResponseType } from 'discord-interactions';
import { Unauthorized } from '@effect/platform/HttpApiError';
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
  AccountV2,
  InsertPlayerSchema,
  RemovePlayerSchema,
  MMRHistoryV2,
  Agents,
  AIResponse,
  HookMessage,
  Interaction,
} from './schemas';
import {
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
  HttpServerRequest,
  HttpServerResponse,
} from '@effect/platform';
import { env } from 'cloudflare:workers';
import { AIClient, AIError, KVClient } from './services';
import { SqlResolver } from '@effect/sql';
import {
  DownRank,
  FirstRank,
  NewSeason,
  NoChange,
  reportMatch,
  UpRank,
  type Report,
} from './model';
import {
  downRankPrompt,
  firstRankPrompt,
  promptGenerator,
  upRankPrompt,
} from './prompts';
import he from 'he';
import mustache from 'mustache';

const dbGetPlayers = D1Client.D1Client.pipe(
  Effect.flatMap(
    (v) =>
      v<Player>`SELECT puuid, name, tag, discord_user_id FROM players ORDER BY name DESC`,
  ),
);

export const getPlayers = dbGetPlayers.pipe(
  Effect.flatMap(Schema.decode(Schema.Array(Player))),
  Effect.flatMap((players) =>
    HttpServerResponse.schemaJson(Schema.Array(Player))(players),
  ),
);

const enrichAccount =
  <T extends { name: string; tag: string }>({
    name,
    tag,
  }: T): ((account: AccountV2) => AccountV2) =>
  (account) =>
    new AccountV2({
      status: account.status,
      errors: account.errors,
      data: {
        ...account.data,
        name: account.data.name !== '' ? account.data.name : name,
        tag: account.data.tag !== '' ? account.data.tag : tag,
      },
    });

const makeFetchAccount = (name: string, tag: string) =>
  HttpClient.HttpClient.pipe(
    Effect.flatMap((c) =>
      HttpClientRequest.get(
        `https://api.henrikdev.xyz/valorant/v2/account/${name}/${tag}`,
      ).pipe(
        HttpClientRequest.setHeaders({ Authorization: env.VALAPIKEY, Accept: '*/*' }),
        c.execute,
        Effect.flatMap(HttpClientResponse.schemaBodyJson(AccountV2)),
        Effect.map(enrichAccount({ name, tag })),
      ),
    ),
  );

const makeDbInsertPlayer = <T extends Player>(player: T) =>
  D1Client.D1Client.pipe(
    Effect.flatMap((s) =>
      SqlResolver.void('insertPlayer', {
        Request: Player,
        execute: (p) => s`INSERT INTO players ${s.insert(p)}`,
      }),
    ),
    Effect.flatMap((s) => s.execute(player)),
  );

export const insertPlayer = HttpServerRequest.schemaBodyJson(InsertPlayerSchema).pipe(
  Effect.flatMap((v) =>
    makeFetchAccount(v.name, v.tag).pipe(
      Effect.flatMap((account) =>
        makeDbInsertPlayer({
          puuid: account.data.puuid,
          name: v.name,
          tag: v.tag,
          discord_user_id: v.discord_user_id,
        }),
      ),
    ),
  ),
  Effect.map(() => HttpServerResponse.empty({ status: 201 })),
  Effect.catchTags({
    RequestError: (c) => HttpServerResponse.json({ message: c.message }, { status: 400 }),
  }),
);

const makeDbRemovePlayer = (name: string, tag: string) =>
  D1Client.D1Client.pipe(
    Effect.flatMap(
      (s) =>
        s<Schema.Void>`DELETE FROM players WHERE name = ${s(name)} AND tag = ${s(tag)}`,
    ),
  );

export const removePlayer = HttpServerRequest.schemaBodyJson(RemovePlayerSchema).pipe(
  Effect.flatMap((v) => makeDbRemovePlayer(v.name, v.tag)),
  Effect.map(() => HttpServerResponse.empty({ status: 201 })),
  Effect.catchTags({
    ParseError: (c) => HttpServerResponse.json({ message: c.message }, { status: 400 }),
  }),
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

const makeGetLatestRankChange =
  (m: MMRHistoryV2) => (lastMatchId: Option.Option<string>) =>
    pipe(
      Option.match(lastMatchId, {
        onNone: () => [...m.data.history],
        onSome: (lastMatchId) =>
          pipe(
            Array.findFirstIndex(m.data.history, (x) => x.match_id === lastMatchId),
            Option.map((l) => Array.take(m.data.history, l + 1)),
            Option.getOrElse(() => [...m.data.history]),
          ),
      }),
      (tt) => Array.zip(tt, Array.drop(tt, 1)),
      (u) => Array.findFirst(u, ([l, r]) => l.tier.id !== r.tier.id),
      Option.flatMap(([l, r]) =>
        Match.value({ v: { l, r } }).pipe(
          Match.when({ v: ({ r }) => r.tier.id === 0 }, () =>
            FirstRank({ rank: l.tier.name }),
          ),
          Match.when({ v: ({ l, r }) => l.season.id !== r.season.id }, () => NewSeason()),
          Match.when(
            { v: ({ l, r }) => l.season.id === r.season.id && l.tier.id > r.tier.id },
            () =>
              UpRank({
                oldRank: r.tier.name,
                newRank: l.tier.name,
              }),
          ),
          Match.when(
            { v: ({ l, r }) => l.season.id === r.season.id && l.tier.id < r.tier.id },
            () =>
              DownRank({
                oldRank: r.tier.name,
                newRank: l.tier.name,
              }),
          ),
          Match.option,
        ),
      ),
      Option.getOrElse(() => NoChange()),
    );

const llmReportGenerator = <
  M extends {
    player: string;
    new_rank: string;
    discord_user_id: string;
  },
>(
  prompt: string,
  agent: string,
  description: string,
  run: (prompt: string) => Effect.Effect<Record<string, unknown>, AIError>,
  view: M,
  fallback: string,
) =>
  pipe(
    promptGenerator(prompt, agent, description),
    Effect.succeed,
    Effect.flatMap(run),
    Effect.flatMap((v) => Schema.decodeUnknown(AIResponse)(v)),
    Effect.flatMap((v) => Option.fromNullable(v.choices[0]?.message.content)),
    Effect.map((v) => mustache.render(v, view)),
    Effect.orElseSucceed(() => fallback),
    Effect.optionFromOptional,
  );

const makeGetReportConfig = (p: Player) => (r: Report) =>
  pipe(
    r,
    reportMatch({
      NoChange: () => Option.none(),
      NewSeason: () => Option.none(),
      FirstRank: ({ rank }) =>
        Option.some({
          prompt: firstRankPrompt,
          rank,
          fallback: `**${p.name}#${p.tag}** has started this season as ${rank}. keep the good work <@${p.discord_user_id}>.`,
        }),
      DownRank: ({ newRank }) =>
        Option.some({
          prompt: downRankPrompt,
          rank: newRank,
          fallback: `**${p.name}#${p.tag}** has been demoted to ${newRank}. too bad, <@${p.discord_user_id}>.`,
        }),
      UpRank: ({ newRank }) =>
        Option.some({
          prompt: upRankPrompt,
          rank: newRank,
          fallback: `**${p.name}#${p.tag}** has been promoted to ${newRank}. well done, <@${p.discord_user_id}>.`,
        }),
    }),
  );

const makeBuildReport = (p: Player) => (r: Report) =>
  pipe(
    r,
    makeGetReportConfig(p),
    Option.match({
      onNone: () => Effect.succeed(Option.none<HookMessage>()),
      onSome: ({ prompt, rank, fallback }) =>
        HttpClient.HttpClient.pipe(
          Effect.flatMap((c) =>
            HttpClientRequest.get('https://valorant-api.com/v1/agents').pipe(
              c.execute,
              Effect.flatMap(HttpClientResponse.schemaBodyJson(Agents)),
              Effect.flatMap((v) => Random.choice(v.data)),
            ),
          ),
          Effect.flatMap((a) =>
            AIClient.pipe(
              Effect.flatMap((ai) =>
                llmReportGenerator(
                  prompt,
                  a.displayName,
                  he.decode(a.description),
                  ai.run,
                  {
                    player: `**${p.name}#${p.tag}**`,
                    new_rank: rank,
                    discord_user_id: `<@${p.discord_user_id}>`,
                  },
                  fallback,
                ).pipe(
                  Effect.flatMap(
                    Option.map((m) =>
                      Schema.decodeUnknown(HookMessage)({
                        content: m,
                        username: a.displayName,
                        avatar_url: a.displayIcon.toString(),
                      }),
                    ),
                  ),
                  Effect.flatten,
                  Effect.optionFromOptional,
                ),
              ),
            ),
          ),
        ),
    }),
  );

const buildCategory = (m: MMRHistoryV2) =>
  KVClient.pipe(
    Effect.flatMap((kv) => kv.get(m.data.account.puuid)),
    Effect.map(makeGetLatestRankChange(m)),
  );

const advanceKV = (m: MMRHistoryV2) =>
  pipe(
    Option.fromNullable(m.data.history.at(0)),
    Option.match({
      onNone: () => Effect.void,
      onSome: (latest) =>
        KVClient.pipe(
          Effect.flatMap((kv) => kv.set(m.data.account.puuid, latest.match_id)),
        ),
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
        Array.sortBy(
          Order.mapInput(Order.reverse(Order.Date), (h) => DateTime.toDate(h.date)),
        ),
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
  );

export const scheduled = dbGetPlayers.pipe(
  Effect.flatMap((v) =>
    Effect.forEach(
      v,
      (z) =>
        makeFetchMMRHistoryV2(z).pipe(
          Effect.map(ensureSorted),
          Effect.flatMap((mmr) =>
            buildCategory(mmr).pipe(
              Effect.tap((v) =>
                Console.log(
                  JSON.stringify({ event: 'rank_check', puuid: z.puuid, report: v }),
                ),
              ),
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
        ),
      { concurrency: 'unbounded' },
    ),
  ),
  Effect.tapErrorCause((c) =>
    Console.error(JSON.stringify({ event: 'scheduled_error', cause: c.toJSON() })),
  ),
);

const listInteraction = dbGetPlayers.pipe(
  Effect.flatMap(Schema.decode(Schema.Array(Player))),
  Effect.flatMap((players) =>
    HttpServerResponse.json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        embeds: [
          {
            title: `Registered Players (${players.length})`,
            description:
              players.length === 0
                ? 'No players registered.'
                : players
                    .map((p) =>
                      p.discord_user_id
                        ? `• **${p.name}#${p.tag}** — <@${p.discord_user_id}>`
                        : `• **${p.name}#${p.tag}**`,
                    )
                    .join('\n'),
            color: 0x58b9ff,
          },
        ],
      },
    }),
  ),
);

const dispatchInteraction = (interaction: Interaction) => {
  if (interaction.type === InteractionType.PING) {
    return HttpServerResponse.json({ type: InteractionResponseType.PONG });
  }
  if (
    interaction.type === InteractionType.APPLICATION_COMMAND &&
    interaction.data?.name === 'list'
  ) {
    return listInteraction;
  }
  return HttpServerResponse.json({ type: InteractionResponseType.PONG });
};

export const handleInteraction = HttpServerRequest.HttpServerRequest.pipe(
  Effect.flatMap((req) => {
    const sig = req.headers['x-signature-ed25519'] ?? '';
    const ts = req.headers['x-signature-timestamp'] ?? '';
    return req.text.pipe(
      Effect.flatMap((rawBody) =>
        Effect.promise(() => verifyKey(rawBody, sig, ts, env.BOT_PUBLIC_KEY)).pipe(
          Effect.filterOrFail(
            (valid) => valid,
            () => new Unauthorized(),
          ),
          Effect.as(rawBody),
        ),
      ),
      Effect.flatMap(Schema.decodeUnknown(Schema.parseJson(Interaction))),
      Effect.flatMap(dispatchInteraction),
    );
  }),
);

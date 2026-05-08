import { D1Client } from '@effect/sql-d1';
import { Array, Console, DateTime, Effect, Option, Order, pipe, Schema } from 'effect';
import {
  Player,
  AccountV2,
  InsertPlayerSchema,
  RemovePlayerSchema,
  MMRHistoryV2,
  MMRHistoryV2History,
} from './schemas';
import {
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
  HttpServerRequest,
  HttpServerResponse,
} from '@effect/platform';
import { env } from 'cloudflare:workers';
import { KVClient } from './services';
import { SqlResolver } from '@effect/sql';

const dbGetPlayers = D1Client.D1Client.pipe(
  Effect.flatMap(
    (v) => v<Player>`SELECT puuid, name, tag FROM players ORDER BY name DESC`,
  ),
);

export const getPlayers = dbGetPlayers.pipe(
  Effect.flatMap(Schema.decode(Schema.Array(Player))),
  Effect.flatMap((players) =>
    HttpServerResponse.json({
      players,
    }),
  ),
);

const enrichAccount =
  <T extends { name: string; tag: string }>({
    name,
    tag,
  }: T): ((account: AccountV2) => AccountV2) =>
  (account) =>
    new AccountV2({
      ...account,
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
    Effect.catchTag('SqlError', (e) => Console.log(e)),
  );

export const insertPlayer = HttpServerRequest.schemaBodyJson(InsertPlayerSchema).pipe(
  Effect.flatMap((v) =>
    makeFetchAccount(v.name, v.tag).pipe(
      Effect.flatMap((account) =>
        makeDbInsertPlayer({
          puuid: account.data.puuid,
          name: v.name,
          tag: v.tag,
          discord_tag: v.discord_tag,
        }),
      ),
    ),
  ),
  Effect.map(() => HttpServerResponse.empty({ status: 201 })),
  Effect.catchTags({
    RequestError: (c) => HttpServerResponse.json({ message: c.message }, { status: 400 }),
  }),
);

const makeDbRemovePlayer = (puuid: string) =>
  D1Client.D1Client.pipe(
    Effect.flatMap((s) => s<Schema.Void>`DELETE FROM players WHERE puuid = ${s(puuid)}`),
  );

export const removePlayer = HttpServerRequest.schemaSearchParams(RemovePlayerSchema).pipe(
  Effect.flatMap((v) => makeDbRemovePlayer(v.puuid)),
  Effect.map(() => HttpServerResponse.empty({ status: 201 })),
  Effect.catchTags({
    ParseError: (c) => HttpServerResponse.json({ message: c.message }, { status: 400 }),
  }),
);

const makeFetchMMRHistoryV2 = (player: Player) =>
  HttpClient.HttpClient.pipe(
    Effect.flatMap((c) =>
      HttpClientRequest.get(
        `https://api.henrikdev.xyz/valorant/v2/mmr-history/ap/pc/${player.name}/${player.tag}`,
      ).pipe(
        HttpClientRequest.setHeaders({ Authorization: env.VALAPIKEY, Accept: '*/*' }),
        c.execute,
        Effect.flatMap(HttpClientResponse.schemaBodyJson(MMRHistoryV2)),
      ),
    ),
  );

const buildReportV2 = (m: MMRHistoryV2) =>
  KVClient.pipe(
    Effect.flatMap((kv) =>
      kv.get(m.data.account.puuid).pipe(
        Effect.flatMap((lastMatchId) =>
          lastMatchId.pipe(
            Option.match({
              onSome: (a) => kv.set(m.data.account.puuid, a),
              onNone: () =>
                Effect.fromNullable(m.data.history.at(0)).pipe(
                  Effect.flatMap((z) => kv.set(m.data.account.puuid, z.match_id)),
                ),
            }),
          ),
        ),
      ),
    ),
  );

const ensureSorted = (m: MMRHistoryV2) =>
  new MMRHistoryV2({
    ...m,
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

export const scheduled = dbGetPlayers.pipe(
  Effect.flatMap((v) =>
    Effect.forEach(v, (z) =>
      makeFetchMMRHistoryV2(z).pipe(
        Effect.map(ensureSorted),
        Effect.flatMap(buildReportV2),
        Effect.either,
      ),
    ),
  ),
  Effect.tap(Console.log),
);

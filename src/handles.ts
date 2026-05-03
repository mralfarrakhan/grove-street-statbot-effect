import { D1Client } from '@effect/sql-d1';
import { Effect, Schema } from 'effect';
import { PlayerNameTag, Player, Account } from './schemas';
import {
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
  HttpServerRequest,
  HttpServerResponse,
} from '@effect/platform';
import { SqlResolver } from '@effect/sql';
import { env } from 'cloudflare:workers';

export const getPlayers = D1Client.D1Client.pipe(
  Effect.flatMap(
    (v) => v<Player>`SELECT puuid, name, tag FROM players ORDER BY name DESC`,
  ),
  Effect.flatMap(Schema.decode(Schema.Array(Player))),
  Effect.flatMap((players) =>
    HttpServerResponse.json({
      players: players
        .toSorted((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
        )
        .map(({ name, tag }) => `${name}#${tag}`),
    }),
  ),
);

const makeFetchAccount = (name: string, tag: string) =>
  HttpClient.HttpClient.pipe(
    Effect.flatMap((c) =>
      HttpClientRequest.get(
        `https://api.henrikdev.xyz/valorant/v2/account/${name}/${tag}`,
      ).pipe(
        HttpClientRequest.setHeaders({ Authorization: env.VALAPIKEY, Accept: '*/*' }),
        c.execute,
        Effect.flatMap(HttpClientResponse.schemaBodyJson(Account)),
        Effect.map((account) => ({
          ...account,
          data: {
            ...account.data,
            name: account.data.name !== '' ? account.data.name : name,
            tag: account.data.tag !== '' ? account.data.tag : tag,
          },
        })),
      ),
    ),
  );

const dbInsertPlayer = D1Client.D1Client.pipe(
  Effect.flatMap((v) =>
    SqlResolver.void('insertPlayer', {
      Request: Player,
      execute: (request) =>
        v`INSERT INTO players ${v.insert(request)} ON CONFLICT(puuid) DO UPDATE SET name = excluded.name, tag = excluded.tag`,
    }),
  ),
);

export const insertPlayer = HttpServerRequest.schemaBodyJson(PlayerNameTag).pipe(
  Effect.flatMap((v) =>
    makeFetchAccount(v.name, v.tag).pipe(
      Effect.flatMap((account) =>
        dbInsertPlayer.pipe(
          Effect.flatMap((z) =>
            z.execute({ puuid: account.data.puuid, name: v.name, tag: v.tag }),
          ),
        ),
      ),
    ),
  ),
  Effect.map(() => HttpServerResponse.empty({ status: 201 })),
  Effect.catchTags({
    RequestError: (c) => HttpServerResponse.json({ message: c.message }, { status: 400 }),
  }),
  Effect.catchAllCause((cause) =>
    HttpServerResponse.json({ message: cause.toString() }, { status: 500 }),
  ),
);

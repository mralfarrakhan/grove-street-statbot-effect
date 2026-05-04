import { D1Client } from '@effect/sql-d1';
import { Effect, Schema } from 'effect';
import { PlayerNameTag, Player, Account, PlayerPuuid } from './schemas';
import {
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
  HttpServerRequest,
  HttpServerResponse,
} from '@effect/platform';
import { env } from 'cloudflare:workers';

export const getPlayers = D1Client.D1Client.pipe(
  Effect.flatMap(
    (v) => v<Player>`SELECT puuid, name, tag FROM players ORDER BY name DESC`,
  ),
  Effect.flatMap(Schema.decode(Schema.Array(Player))),
  Effect.flatMap((players) =>
    HttpServerResponse.json({
      players,
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

const makeDbInsertPlayer = (puuid: string, name: string, tag: string) =>
  D1Client.D1Client.pipe(
    Effect.flatMap(
      (s) =>
        s`INSERT INTO players
            (puuid, name, tag) 
            values (${s(puuid)}, ${s(name)}, ${s(tag)}) 
            ON CONFLICT(puuid) DO UPDATE SET name = excluded.name, tag = excluded.tag`,
    ),
  );

export const insertPlayer = HttpServerRequest.schemaBodyJson(PlayerNameTag).pipe(
  Effect.flatMap((v) =>
    makeFetchAccount(v.name, v.tag).pipe(
      Effect.flatMap((account) => makeDbInsertPlayer(account.data.puuid, v.name, v.tag)),
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

export const removePlayer = HttpServerRequest.schemaSearchParams(PlayerPuuid).pipe(
  Effect.flatMap((v) => makeDbRemovePlayer(v.puuid)),
  Effect.map(() => HttpServerResponse.empty({ status: 201 })),
  Effect.catchTags({
    ParseError: (c) => HttpServerResponse.json({ message: c.message }, { status: 400 }),
  }),
);

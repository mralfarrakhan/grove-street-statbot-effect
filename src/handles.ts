import { D1Client } from '@effect/sql-d1';
import { Effect, Schema } from 'effect';
import { PlayerNameTag, Player, Account, PlayerPuuid, MMRHistory } from './schemas';
import {
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
  HttpServerRequest,
  HttpServerResponse,
} from '@effect/platform';
import { env } from 'cloudflare:workers';

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

const makeDbInsertPlayer = (player: Player) =>
  D1Client.D1Client.pipe(
    Effect.flatMap(
      (s) =>
        s`INSERT INTO players
            (puuid, name, tag) 
            values (${s(player.puuid)}, ${s(player.name)}, ${s(player.tag)}) 
            ON CONFLICT(puuid) DO UPDATE SET name = excluded.name, tag = excluded.tag`,
    ),
  );

export const insertPlayer = HttpServerRequest.schemaBodyJson(PlayerNameTag).pipe(
  Effect.flatMap((v) =>
    makeFetchAccount(v.name, v.tag).pipe(
      Effect.flatMap((account) =>
        makeDbInsertPlayer({ puuid: account.data.puuid, name: v.name, tag: v.tag }),
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

export const removePlayer = HttpServerRequest.schemaSearchParams(PlayerPuuid).pipe(
  Effect.flatMap((v) => makeDbRemovePlayer(v.puuid)),
  Effect.map(() => HttpServerResponse.empty({ status: 201 })),
  Effect.catchTags({
    ParseError: (c) => HttpServerResponse.json({ message: c.message }, { status: 400 }),
  }),
);

const makeFetchMMRHistory = (player: Player) =>
  HttpClient.HttpClient.pipe(
    Effect.flatMap((c) =>
      HttpClientRequest.get(
        `https://api.henrikdev.xyz/valorant/v1/mmr-history/ap/${player.name}/${player.tag}`,
      ).pipe(
        HttpClientRequest.setHeaders({ Authorization: env.VALAPIKEY, Accept: '*/*' }),
        c.execute,
        Effect.flatMap(HttpClientResponse.schemaBodyJson(MMRHistory)),
      ),
    ),
  );

export const scheduled = dbGetPlayers.pipe(
  Effect.flatMap((v) => Effect.forEach(v, (z) => makeFetchMMRHistory(z))),
);

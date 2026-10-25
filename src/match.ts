import { HttpClient, HttpClientRequest, HttpClientResponse } from '@effect/platform';
import { env } from 'cloudflare:workers';
import { Effect, Option, pipe, Schema } from 'effect';
import { KVClient } from './services';

export interface PlayerMatchPerformance {
  readonly character: string;
  readonly kills: number;
  readonly deaths: number;
  readonly assists: number;
  readonly score: number;
}

interface RawPlayer {
  readonly puuid?: string;
  readonly character?: string;
  readonly stats?: {
    readonly kills?: number;
    readonly deaths?: number;
    readonly assists?: number;
    readonly score?: number;
  };
}

interface RawMatchResponse {
  readonly data?: {
    readonly players?: {
      readonly all_players?: ReadonlyArray<RawPlayer>;
    };
  };
}

const MATCH_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export const fetchPlayerMatchPerformance = (
  matchId: string,
  puuid: string,
): Effect.Effect<
  Option.Option<PlayerMatchPerformance>,
  never,
  HttpClient.HttpClient | KVClient
> => {
  const cacheKey = `match:${matchId}:${puuid}`;

  const fetchFromApi = HttpClient.HttpClient.pipe(
    Effect.flatMap((c) =>
      HttpClientRequest.get(`https://api.henrikdev.xyz/valorant/v2/match/${matchId}`).pipe(
        HttpClientRequest.setHeaders({ Authorization: env.VALAPIKEY, Accept: '*/*' }),
        c.execute,
        Effect.flatMap(HttpClientResponse.schemaBodyJson(Schema.Unknown)),
        Effect.map((json) => {
          const res = json as RawMatchResponse;
          const players = res?.data?.players?.all_players ?? [];
          const player = players.find((p) => p.puuid === puuid);
          if (!player || !player.character) {
            return Option.none<PlayerMatchPerformance>();
          }
          return Option.some<PlayerMatchPerformance>({
            character: player.character,
            kills: player.stats?.kills ?? 0,
            deaths: player.stats?.deaths ?? 0,
            assists: player.stats?.assists ?? 0,
            score: player.stats?.score ?? 0,
          });
        }),
      ),
    ),
    Effect.tap((maybePerf) =>
      Option.match(maybePerf, {
        onNone: () => Effect.void,
        onSome: (perf) =>
          KVClient.pipe(
            Effect.flatMap((kv) =>
              kv.set(cacheKey, JSON.stringify(perf), {
                expirationTtl: MATCH_CACHE_TTL_SECONDS,
              }),
            ),
            Effect.catchAll(() => Effect.void),
          ),
      }),
    ),
    Effect.catchAll(() => Effect.succeed(Option.none<PlayerMatchPerformance>())),
  );

  return KVClient.pipe(
    Effect.flatMap((kv) => kv.get(cacheKey)),
    Effect.map((maybeStr) =>
      pipe(
        maybeStr,
        Option.flatMap((str) => {
          try {
            return Option.some(JSON.parse(str) as PlayerMatchPerformance);
          } catch {
            return Option.none<PlayerMatchPerformance>();
          }
        }),
      ),
    ),
    Effect.flatMap((maybeCached) =>
      Option.match(maybeCached, {
        onNone: () => fetchFromApi,
        onSome: (perf) => Effect.succeed(Option.some(perf)),
      }),
    ),
    Effect.catchAll(() => fetchFromApi),
  );
};

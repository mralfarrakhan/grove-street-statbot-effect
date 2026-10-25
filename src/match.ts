import { HttpClient, HttpClientRequest, HttpClientResponse } from '@effect/platform';
import { env } from 'cloudflare:workers';
import { Effect, Option, Schema } from 'effect';

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

export const fetchPlayerMatchPerformance = (
  matchId: string,
  puuid: string,
): Effect.Effect<Option.Option<PlayerMatchPerformance>, never, HttpClient.HttpClient> =>
  HttpClient.HttpClient.pipe(
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
    Effect.catchAll(() => Effect.succeed(Option.none<PlayerMatchPerformance>())),
  );

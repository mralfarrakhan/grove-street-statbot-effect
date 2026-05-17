import { FetchHttpClient, HttpClient, HttpClientResponse } from '@effect/platform';
import { Effect, Schema } from 'effect';

const PlayerSchema = Schema.Struct({
  name: Schema.String,
  tag: Schema.String,
  puuid: Schema.UUID,
  discord_user_id: Schema.optional(Schema.String),
});

export type Player = typeof PlayerSchema.Type;

export const listProgram = HttpClient.get('/api/players').pipe(
  Effect.flatMap(HttpClientResponse.schemaBodyJson(Schema.Array(PlayerSchema))),
  Effect.provide(FetchHttpClient.layer),
);

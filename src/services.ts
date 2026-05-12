import { D1Client } from '@effect/sql-d1';
import { env } from 'cloudflare:workers';
import { Context, Data, Effect, Layer, Option } from 'effect';

export const D1Live = D1Client.layer({
  db: env.STATBOT_DB,
});

export class KVError extends Data.TaggedError('KVError')<{
  cause: unknown;
}> {}

export class KVClient extends Context.Tag('KVClient')<
  KVClient,
  {
    readonly get: (key: string) => Effect.Effect<Option.Option<string>, KVError>;
    readonly set: (key: string, value: string) => Effect.Effect<void, KVError>;
  }
>() {}

export const KVLive = Layer.succeed(
  KVClient,
  KVClient.of({
    get: (key) =>
      Effect.tryPromise({
        try: () => env.STATBOT_KV.get(key),
        catch: (e) => new KVError({ cause: e }),
      }).pipe(Effect.map(Option.fromNullable)),
    set: (key, value) =>
      Effect.tryPromise({
        try: () => env.STATBOT_KV.put(key, value),
        catch: (e) => new KVError({ cause: e }),
      }),
  }),
);

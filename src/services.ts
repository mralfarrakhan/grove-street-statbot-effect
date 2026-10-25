import { D1Client } from '@effect/sql-d1';
import { env } from 'cloudflare:workers';
import { Context, Data, Effect, Layer, Option } from 'effect';

export const D1Live = D1Client.layer({
  db: env.STATBOT_DB,
});

export class KVError extends Data.TaggedError('KVError')<{
  cause: unknown;
}> {}

export interface KVSetOptions {
  readonly expirationTtl?: number;
}

export class KVClient extends Context.Tag('KVClient')<
  KVClient,
  {
    readonly get: (key: string) => Effect.Effect<Option.Option<string>, KVError>;
    readonly set: (
      key: string,
      value: string,
      options?: KVSetOptions,
    ) => Effect.Effect<void, KVError>;
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
    set: (key, value, options) =>
      Effect.tryPromise({
        try: () =>
          options?.expirationTtl !== undefined
            ? env.STATBOT_KV.put(key, value, { expirationTtl: options.expirationTtl })
            : env.STATBOT_KV.put(key, value),
        catch: (e) => new KVError({ cause: e }),
      }),
  }),
);

export class AIError extends Data.TaggedError('AIError')<{
  cause: unknown;
}> {}

export class AIClient extends Context.Tag('AIClient')<
  AIClient,
  {
    readonly run: (prompt: string) => Effect.Effect<Record<string, unknown>, AIError>;
  }
>() {}

export const AILive = Layer.succeed(
  AIClient,
  AIClient.of({
    run: (prompt) =>
      Effect.tryPromise({
        try: () =>
          env.AI.run('@cf/meta/llama-3.3-70b-instruct', {
            messages: [
              {
                role: 'system',
                content:
                  'You are an elite voice actor and scriptwriter for Riot Games VALORANT. You write concise, lore-accurate spoken dialogue in the authentic voice and personality of VALORANT agents. Output only the spoken dialogue text.',
              },
              { role: 'user', content: prompt },
            ],
            temperature: 0.75,
            max_tokens: 256,
          }),
        catch: (e) => new AIError({ cause: e }),
      }),
  }),
);

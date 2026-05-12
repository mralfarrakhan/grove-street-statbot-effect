import { HttpMiddleware, HttpServerRequest } from '@effect/platform';
import { Unauthorized } from '@effect/platform/HttpApiError';
import { Effect } from 'effect';
import { Option, pipe } from 'effect';

export const parseAuthString = (auth: string, username: string, password: string) =>
  pipe(
    Option.some(auth),
    Option.filter((s) => s.startsWith('Basic ')),
    Option.map((s) => s.slice(6)),
    Option.map((base64) => Buffer.from(base64, 'base64').toString('utf-8')),
    Effect.flatMap((decoded) => {
      const [u, p] = decoded.split(':');
      return u === username && p === password
        ? Effect.succeed({})
        : Effect.fail(new Unauthorized());
    }),
  );

export const makeBasicAuth = (username: string, password: string) =>
  HttpMiddleware.make((app) =>
    HttpServerRequest.HttpServerRequest.pipe(
      Effect.map((req) => req.headers['authorization']),
      Effect.flatMap(Effect.fromNullable),
      Effect.flatMap((authStr) => parseAuthString(authStr, username, password)),
      Effect.tap((v) => v),
      Effect.zipRight(app),
    ),
  );

import { HttpMiddleware, HttpServerRequest, HttpServerResponse } from '@effect/platform';
import { Effect } from 'effect';
import { Option, pipe } from 'effect';

export const parseAuthString = (
  auth: string,
  username: string,
  password: string,
): Option.Option<{}> =>
  pipe(
    Option.some(auth),
    Option.filter((s) => s.startsWith('Basic ')),
    Option.map((s) => s.slice(6)),
    Option.map((base64) => Buffer.from(base64, 'base64').toString('utf-8')),
    Option.flatMap((decoded) => {
      const [u, p] = decoded.split(':');
      return u === username && p === password ? Option.some({}) : Option.none();
    }),
  );

export const makeBasicAuth = (username: string, password: string) =>
  HttpMiddleware.make((app) =>
    HttpServerRequest.HttpServerRequest.pipe(
      Effect.map((req) => req.headers['authorization']),
      Effect.flatMap(Effect.fromNullable),
      Effect.flatMap((authStr) => parseAuthString(authStr, username, password)),
      Effect.zipRight(app),
      Effect.catchAll(() => HttpServerResponse.empty({ status: 401 })),
    ),
  );

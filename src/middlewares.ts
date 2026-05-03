import { HttpMiddleware, HttpServerRequest, HttpServerResponse } from '@effect/platform';
import { Effect } from 'effect';
import { env } from 'cloudflare:workers';
import { Option, pipe } from 'effect';

export const parseAuthString = (auth: string): Option.Option<{}> =>
  pipe(
    Option.some(auth),
    Option.filter((s) => s.startsWith('Basic ')),
    Option.map((s) => s.slice(6)),
    Option.map((base64) => Buffer.from(base64, 'base64').toString('utf-8')),
    Option.flatMap((decoded) => {
      const [username, password] = decoded.split(':');
      return username === env.ADMIN_USERNAME && password === env.ADMIN_PASSWORD
        ? Option.some({})
        : Option.none();
    }),
  );

export const basicAuth = HttpMiddleware.make((app) =>
  HttpServerRequest.HttpServerRequest.pipe(
    Effect.map((req) => req.headers['authorization']),
    Effect.flatMap(Effect.fromNullable),
    Effect.flatMap((authStr) => parseAuthString(authStr)),
    Effect.zipRight(app),
    Effect.catchAll(() => HttpServerResponse.empty({ status: 401 })),
  ),
);

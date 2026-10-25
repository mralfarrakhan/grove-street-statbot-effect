import { HttpMiddleware, HttpServerRequest } from '@effect/platform';
import { Unauthorized } from '@effect/platform/HttpApiError';
import { Effect } from 'effect';

export const parseAuthString = (auth: string, username: string, password: string) => {
  if (!auth.startsWith('Basic ')) {
    return Effect.fail(new Unauthorized());
  }
  const base64 = auth.slice(6);
  const decoded = Buffer.from(base64, 'base64').toString('utf-8');
  const [u, p] = decoded.split(':');
  return u === username && p === password ? Effect.succeed({}) : Effect.fail(new Unauthorized());
};

export const makeBasicAuth = (username: string, password: string) =>
  HttpMiddleware.make((app) =>
    HttpServerRequest.HttpServerRequest.pipe(
      Effect.flatMap((req) => {
        const auth = req.headers['authorization'];
        if (!auth) {
          return Effect.fail(new Unauthorized());
        }
        return parseAuthString(auth, username, password);
      }),
      Effect.zipRight(app),
    ),
  );

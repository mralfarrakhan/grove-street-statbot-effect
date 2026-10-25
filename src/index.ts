import { FetchHttpClient, HttpApp, HttpRouter, HttpServerResponse } from '@effect/platform';
import { Effect } from 'effect';
import { handleDiscordInteractions } from './discord/router';
import { scheduled as runScheduled } from './handles';
import { logStructuredError } from './logger';
import { AILive, D1Live, KVLive } from './services';

const router = HttpRouter.empty.pipe(
  HttpRouter.post('/interactions', handleDiscordInteractions),
  HttpRouter.post('/api/interactions', handleDiscordInteractions),
  HttpRouter.get('/api', HttpServerResponse.text('ok')),
  HttpRouter.get('/', HttpServerResponse.text('ok')),
  Effect.catchTag('RouteNotFound', () => HttpServerResponse.text('Not Found', { status: 404 })),
  Effect.catchAllCause((cause) =>
    logStructuredError('api_unhandled_failure', cause).pipe(
      Effect.zipRight(
        HttpServerResponse.json(
          {
            error: 'Internal Server Error',
            message: 'An unexpected error occurred while processing the request',
          },
          { status: 500 },
        ),
      ),
    ),
  ),
  Effect.provide([D1Live, KVLive, FetchHttpClient.layer]),
  HttpApp.toWebHandler,
);

const scheduled = runScheduled.pipe(
  Effect.provide([D1Live, KVLive, AILive]),
  Effect.provide(FetchHttpClient.layer),
);

export default {
  fetch: (request, _env, _ctx) => router(request),
  scheduled: async (_controller, _env, ctx) => {
    ctx.waitUntil(Effect.runPromise(scheduled));
  },
} satisfies ExportedHandler<Env>;

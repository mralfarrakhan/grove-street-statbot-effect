import {
  FetchHttpClient,
  HttpApp,
  HttpRouter,
  HttpServerResponse,
} from '@effect/platform';
import { Effect } from 'effect';
import { D1Live, KVLive } from './services';
import { makeBasicAuth } from './middlewares';
import {
  getPlayers,
  insertPlayer,
  removePlayer,
  scheduled as runScheduled,
} from './handles';
import { env } from 'cloudflare:workers';

const playerRoute = HttpRouter.empty.pipe(
  HttpRouter.put('/', insertPlayer),
  HttpRouter.del('/', removePlayer),
  HttpRouter.use(makeBasicAuth(env.ADMIN_USERNAME, env.ADMIN_PASSWORD)),
  HttpRouter.get('/', getPlayers),
);

const servo = HttpRouter.empty.pipe(
  HttpRouter.mount('/players', playerRoute),
  HttpRouter.get('/', HttpServerResponse.text('ok')),
  Effect.catchTags({
    RouteNotFound: () => HttpServerResponse.text('Not Found', { status: 404 }),
    Unauthorized: () => HttpServerResponse.empty({ status: 404 }),
  }),
  Effect.catchAllCause((cause) =>
    HttpServerResponse.json({ message: cause.toJSON() }, { status: 500 }),
  ),
  Effect.provide([D1Live, FetchHttpClient.layer]),
  HttpApp.toWebHandler,
);

const scheduled = runScheduled.pipe(
  Effect.provide([D1Live, KVLive]),
  Effect.provide(FetchHttpClient.layer),
);

export default {
  fetch: (request, env, ctx) => servo(request),
  scheduled: async (controller, env, ctx) => {
    ctx.waitUntil(Effect.runPromise(scheduled));
  },
} satisfies ExportedHandler<Env>;

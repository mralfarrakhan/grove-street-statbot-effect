import {
  FetchHttpClient,
  HttpApp,
  HttpRouter,
  HttpServerResponse,
} from '@effect/platform';
import { Effect } from 'effect';
import { AILive, D1Live, KVLive } from './services';
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

const api = HttpRouter.empty.pipe(
  HttpRouter.mount('/players', playerRoute),
  HttpRouter.get('/', HttpServerResponse.text('ok')),
);

const servo = HttpRouter.empty.pipe(
  HttpRouter.mount('/api', api),
  Effect.catchTags({
    RouteNotFound: () => HttpServerResponse.text('Not Found', { status: 404 }),
    Unauthorized: () => HttpServerResponse.empty({ status: 401 }),
  }),
  Effect.catchAllCause((cause) =>
    HttpServerResponse.json({ message: cause.toJSON() }, { status: 500 }),
  ),
  Effect.provide([D1Live, FetchHttpClient.layer]),
  HttpApp.toWebHandler,
);

const scheduled = runScheduled.pipe(
  Effect.provide([D1Live, KVLive, AILive]),
  Effect.provide(FetchHttpClient.layer),
);

export default {
  fetch: (request, _env, _ctx) => servo(request),
  scheduled: async (_controller, _env, ctx) => {
    ctx.waitUntil(Effect.runPromise(scheduled));
  },
} satisfies ExportedHandler<Env>;

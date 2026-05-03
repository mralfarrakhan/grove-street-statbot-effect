import {
  FetchHttpClient,
  HttpApp,
  HttpRouter,
  HttpServerResponse,
} from '@effect/platform';
import { Effect } from 'effect';
import { D1Live } from './services';
import { basicAuth } from './middlewares';
import { getPlayers, insertPlayer } from './handles';

const playerRoute = HttpRouter.empty.pipe(
  HttpRouter.put('/', insertPlayer.pipe(basicAuth)),
  HttpRouter.get('/', getPlayers),
);

const servo = HttpRouter.empty.pipe(
  HttpRouter.mount('/players', playerRoute),
  HttpRouter.get('/', HttpServerResponse.text('ok')),
  Effect.catchTags({
    RouteNotFound: () => HttpServerResponse.text('Not Found', { status: 404 }),
  }),
  Effect.catchAllCause((cause) =>
    HttpServerResponse.json({ message: cause.toJSON() }, { status: 500 }),
  ),
  Effect.provide(D1Live),
  Effect.provide(FetchHttpClient.layer),
  HttpApp.toWebHandler,
);

export default {
  fetch: (request, env, ctx) => servo(request),
} satisfies ExportedHandler<Env>;

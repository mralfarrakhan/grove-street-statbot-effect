import { Args, Command } from '@effect/cli';
import { NodeContext, NodeRuntime } from '@effect/platform-node';
import { Console, Effect, Schema } from 'effect';
import process from 'node:process';
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from '@effect/platform';
import { ApplicationCommand, ApplicationCommandInput } from './schemas.ts';
import { formatCommands } from './format.ts';

const BOT_TOKEN = process.env['BOT_TOKEN'] ?? '';
const BOT_APPLICATION_ID = process.env['BOT_APPLICATION_ID'] ?? '';

const makeHeaders = {
  Authorization: `Bot ${BOT_TOKEN}`,
  'Content-Type': 'application/json; charset=UTF-8',
  'User-Agent':
    'GroveStreetStatbot (https://github.com/mralfarrakhan/grove-street-statbot-effect, 1.0.0)',
};

const fetchCommands = HttpClient.HttpClient.pipe(
  Effect.flatMap((c) =>
    HttpClientRequest.get(
      `https://discord.com/api/v10/applications/${BOT_APPLICATION_ID}/commands`,
    ).pipe(
      HttpClientRequest.setHeaders(makeHeaders),
      c.execute,
      Effect.flatMap(HttpClientResponse.schemaBodyJson(Schema.Array(ApplicationCommand))),
      Effect.flatMap((cmds) => Console.log(formatCommands(cmds))),
    ),
  ),
);

const putCommands = Command.make(
  'put',
  { file: Args.fileParse({ name: 'file' }) },
  ({ file }) =>
    Effect.flatMap(
      Schema.decodeUnknown(
        Schema.Union(ApplicationCommandInput, Schema.Array(ApplicationCommandInput)),
      )(file),
      (parsed) => {
        const body = Array.isArray(parsed) ? parsed : [parsed];
        return HttpClient.HttpClient.pipe(
          Effect.flatMap((c) =>
            HttpClientRequest.put(
              `https://discord.com/api/v10/applications/${BOT_APPLICATION_ID}/commands`,
            ).pipe(
              HttpClientRequest.setHeaders(makeHeaders),
              HttpClientRequest.bodyJson(body),
              Effect.flatMap(c.execute),
              Effect.flatMap(
                HttpClientResponse.schemaBodyJson(Schema.Array(ApplicationCommand)),
              ),
              Effect.flatMap((cmds) => Console.log(formatCommands(cmds))),
            ),
          ),
        );
      },
    ),
);

const commands = Command.make('cli').pipe(
  Command.withSubcommands([
    Command.make('commands').pipe(
      Command.withSubcommands([
        Command.make('get', {}, () => fetchCommands),
        putCommands,
      ]),
    ),
  ]),
  Command.transformHandler((c) => c.pipe(Effect.catchAll(Console.log))),
);

const cli = Command.run(commands, {
  name: 'Grove Street Statbot Management CLI',
  version: 'v0.1.0',
});

cli(process.argv).pipe(
  Effect.provide([NodeContext.layer, FetchHttpClient.layer]),
  NodeRuntime.runMain,
);

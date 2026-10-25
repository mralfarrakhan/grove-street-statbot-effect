import { HttpServerRequest, HttpServerResponse } from '@effect/platform';
import { env } from 'cloudflare:workers';
import { Effect } from 'effect';
import {
  handleLastMatchCommand,
  handleLeaderboardCommand,
  handleLinkCommand,
  handleListCommand,
  handleRankCommand,
  handleRemoveCommand,
  handleUnlinkCommand,
} from './commands';
import { type DiscordInteraction, InteractionResponseType, InteractionType } from './types';
import { verifyDiscordSignature } from './verify';

export const handleDiscordInteractions = HttpServerRequest.HttpServerRequest.pipe(
  Effect.flatMap((req) =>
    req.text.pipe(
      Effect.flatMap((rawBody) => {
        const signature = req.headers['x-signature-ed25519'] ?? '';
        const timestamp = req.headers['x-signature-timestamp'] ?? '';

        const publicKey = (env as unknown as { BOT_PUBLIC_KEY?: string }).BOT_PUBLIC_KEY ?? '';

        return Effect.promise(() =>
          verifyDiscordSignature(publicKey, signature, timestamp, rawBody),
        ).pipe(
          Effect.flatMap((isValid) => {
            if (!isValid) {
              return HttpServerResponse.text('Invalid request signature', { status: 401 });
            }

            let interaction: DiscordInteraction;
            try {
              interaction = JSON.parse(rawBody) as DiscordInteraction;
            } catch {
              return HttpServerResponse.text('Invalid JSON payload', { status: 400 });
            }

            if (interaction.type === InteractionType.PING) {
              return HttpServerResponse.json({ type: InteractionResponseType.PONG });
            }

            if (interaction.type === InteractionType.APPLICATION_COMMAND) {
              const commandName = interaction.data?.name;
              let commandEffect;

              switch (commandName) {
                case 'rank':
                  commandEffect = handleRankCommand(interaction);
                  break;
                case 'lastmatch':
                  commandEffect = handleLastMatchCommand(interaction);
                  break;
                case 'leaderboard':
                  commandEffect = handleLeaderboardCommand();
                  break;
                case 'link':
                  commandEffect = handleLinkCommand(interaction);
                  break;
                case 'unlink':
                  commandEffect = handleUnlinkCommand(interaction);
                  break;
                case 'remove':
                  commandEffect = handleRemoveCommand(interaction);
                  break;
                case 'list':
                  commandEffect = handleListCommand();
                  break;
                default:
                  return HttpServerResponse.json({
                    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                    data: {
                      content: `❌ Unknown command: /${commandName ?? 'unknown'}`,
                      flags: 64,
                    },
                  });
              }

              return commandEffect.pipe(
                Effect.flatMap((response) => HttpServerResponse.json(response)),
              );
            }

            return HttpServerResponse.text('Unsupported interaction type', { status: 400 });
          }),
        );
      }),
    ),
  ),
);

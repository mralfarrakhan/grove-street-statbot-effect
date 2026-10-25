import { HttpClient, HttpClientRequest, HttpClientResponse } from '@effect/platform';
import { D1Client } from '@effect/sql-d1';
import { env } from 'cloudflare:workers';
import { Effect, Option, pipe } from 'effect';
import { computeStreak } from '../handles';
import { fetchPlayerMatchPerformance } from '../match';
import { AccountV2, MMRHistoryV2, Player } from '../schemas';
import { KVClient } from '../services';
import {
  type DiscordEmbed,
  type DiscordInteraction,
  type DiscordInteractionResponse,
  formatProgressBar,
  getTierColor,
  getTierIconUrl,
  hasAdminPermission,
  InteractionResponseType,
} from './types';

const LEADERBOARD_CACHE_TTL = 300; // 5 minutes

interface CachedMMRSummary {
  readonly tierName: string;
  readonly tierId: number;
  readonly rr: number;
  readonly elo: number;
  readonly lastChange: number;
  readonly map: string;
  readonly matchId: string;
  readonly streakType: 'win' | 'loss' | 'none';
  readonly streakCount: number;
}

const makeSuccessResponse = (embed: DiscordEmbed): DiscordInteractionResponse => ({
  type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
  data: {
    embeds: [embed],
  },
});

const makeEphemeralResponse = (content: string): DiscordInteractionResponse => ({
  type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
  data: {
    content,
    flags: 64, // EPHEMERAL
  },
});

const fetchPlayerMMR = (puuid: string) =>
  HttpClient.HttpClient.pipe(
    Effect.flatMap((c) =>
      HttpClientRequest.get(
        `https://api.henrikdev.xyz/valorant/v2/by-puuid/mmr-history/ap/pc/${puuid}`,
      ).pipe(
        HttpClientRequest.setHeaders({ Authorization: env.VALAPIKEY, Accept: '*/*' }),
        c.execute,
        Effect.flatMap(HttpClientResponse.schemaBodyJson(MMRHistoryV2)),
      ),
    ),
  );

const getPlayerMMRSummary = (
  puuid: string,
): Effect.Effect<Option.Option<CachedMMRSummary>, never, HttpClient.HttpClient | KVClient> => {
  const cacheKey = `mmr:summary:${puuid}`;

  const fetchAndCache = fetchPlayerMMR(puuid).pipe(
    Effect.map((mmr) => {
      const latest = mmr.data.history[0];
      if (!latest) return Option.none<CachedMMRSummary>();
      const streak = computeStreak(mmr.data.history);
      const summary: CachedMMRSummary = {
        tierName: latest.tier.name,
        tierId: latest.tier.id,
        rr: latest.rr,
        elo: latest.elo,
        lastChange: latest.last_change,
        map: latest.map.name,
        matchId: latest.match_id,
        streakType: streak.type,
        streakCount: streak.count,
      };
      return Option.some(summary);
    }),
    Effect.tap((maybeSummary) =>
      Option.match(maybeSummary, {
        onNone: () => Effect.void,
        onSome: (summary) =>
          KVClient.pipe(
            Effect.flatMap((kv) =>
              kv.set(cacheKey, JSON.stringify(summary), {
                expirationTtl: LEADERBOARD_CACHE_TTL,
              }),
            ),
            Effect.catchAll(() => Effect.void),
          ),
      }),
    ),
    Effect.catchAll(() => Effect.succeed(Option.none<CachedMMRSummary>())),
  );

  return KVClient.pipe(
    Effect.flatMap((kv) => kv.get(cacheKey)),
    Effect.map((maybeStr) =>
      pipe(
        maybeStr,
        Option.flatMap((str) => {
          try {
            return Option.some(JSON.parse(str) as CachedMMRSummary);
          } catch {
            return Option.none<CachedMMRSummary>();
          }
        }),
      ),
    ),
    Effect.flatMap((maybeCached) =>
      Option.match(maybeCached, {
        onSome: (summary) => Effect.succeed(Option.some(summary)),
        onNone: () => fetchAndCache,
      }),
    ),
    Effect.catchAll(() => Effect.succeed(Option.none<CachedMMRSummary>())),
  );
};

const resolveTargetPlayer = (
  interaction: DiscordInteraction,
  playerOption?: string,
): Effect.Effect<Option.Option<Player>, never, D1Client.D1Client> =>
  D1Client.D1Client.pipe(
    Effect.flatMap((d1) => {
      if (playerOption && playerOption.trim().length > 0) {
        const raw = playerOption.trim();
        if (raw.includes('#')) {
          const [name, tag] = raw.split('#');
          return d1<Player>`SELECT puuid, name, tag, discord_user_id FROM players WHERE LOWER(name) = LOWER(${name?.trim() ?? ''}) AND LOWER(tag) = LOWER(${tag?.trim() ?? ''}) LIMIT 1`;
        }
        return d1<Player>`SELECT puuid, name, tag, discord_user_id FROM players WHERE LOWER(name) = LOWER(${raw}) OR LOWER(name) LIKE ${`%${raw.toLowerCase()}%`} LIMIT 1`;
      }

      const callerId = interaction.member?.user.id ?? interaction.user?.id;
      if (!callerId) return Effect.succeed([]);
      return d1<Player>`SELECT puuid, name, tag, discord_user_id FROM players WHERE discord_user_id = ${callerId} LIMIT 1`;
    }),
    Effect.map((rows) =>
      rows.length > 0 && rows[0] ? Option.some(rows[0]) : Option.none<Player>(),
    ),
    Effect.catchAll(() => Effect.succeed(Option.none<Player>())),
  );

export const handleRankCommand = (
  interaction: DiscordInteraction,
): Effect.Effect<
  DiscordInteractionResponse,
  never,
  D1Client.D1Client | HttpClient.HttpClient | KVClient
> => {
  const playerOpt = interaction.data?.options?.find((o) => o.name === 'player')?.value as
    | string
    | undefined;

  return resolveTargetPlayer(interaction, playerOpt).pipe(
    Effect.flatMap((maybePlayer) => {
      if (Option.isNone(maybePlayer)) {
        if (!playerOpt) {
          return Effect.succeed(
            makeEphemeralResponse(
              '⚠️ **Discord Account Not Linked**\nYour Discord account is not yet linked to a Riot ID.\n• Use `/link riot_id: Name#Tag` to link your account\n• Or check another player with `/rank player: Name#Tag`',
            ),
          );
        }
        return Effect.succeed(
          makeEphemeralResponse(
            `❌ Could not find player matching **"${playerOpt}"** in the tracked crew. Use \`/list\` to view all registered players.`,
          ),
        );
      }

      const player = maybePlayer.value;
      return getPlayerMMRSummary(player.puuid).pipe(
        Effect.map((maybeSummary) => {
          if (Option.isNone(maybeSummary)) {
            return makeEphemeralResponse(
              `❌ Failed to retrieve live rank data for **${player.name}#${player.tag}** from Riot API.`,
            );
          }

          const s = maybeSummary.value;
          const streakBadge =
            s.streakCount >= 3
              ? s.streakType === 'win'
                ? `🔥 **${s.streakCount}-Game Heater**`
                : `⚠️ **${s.streakCount}-Loss Skid**`
              : '—';

          const embed: DiscordEmbed = {
            author: { name: 'Grove Street Statbot' },
            title: `📈 Rank Card: ${player.name}#${player.tag}`,
            thumbnail: { url: getTierIconUrl(s.tierId) },
            color: getTierColor(s.tierName),
            fields: [
              { name: 'Current Tier', value: `**${s.tierName}**`, inline: true },
              { name: 'Rating Progress', value: formatProgressBar(s.rr), inline: false },
              {
                name: 'Recent Match',
                value: `${s.lastChange > 0 ? `+${s.lastChange}` : s.lastChange} RR on **${s.map}**`,
                inline: true,
              },
              { name: 'Streak Status', value: streakBadge, inline: true },
            ],
            footer: {
              text: player.discord_user_id
                ? `Linked to Discord User ID: ${player.discord_user_id}`
                : 'Unlinked account',
            },
            timestamp: new Date().toISOString(),
          };

          return makeSuccessResponse(embed);
        }),
      );
    }),
  );
};

export const handleLastMatchCommand = (
  interaction: DiscordInteraction,
): Effect.Effect<
  DiscordInteractionResponse,
  never,
  D1Client.D1Client | HttpClient.HttpClient | KVClient
> => {
  const playerOpt = interaction.data?.options?.find((o) => o.name === 'player')?.value as
    | string
    | undefined;

  return resolveTargetPlayer(interaction, playerOpt).pipe(
    Effect.flatMap((maybePlayer) => {
      if (Option.isNone(maybePlayer)) {
        if (!playerOpt) {
          return Effect.succeed(
            makeEphemeralResponse(
              '⚠️ **Discord Account Not Linked**\nYour Discord account is not yet linked to a Riot ID.\n• Use `/link riot_id: Name#Tag` to link your account\n• Or check another player with `/lastmatch player: Name#Tag`',
            ),
          );
        }
        return Effect.succeed(
          makeEphemeralResponse(
            `❌ Could not find player matching **"${playerOpt}"** in the tracked crew.`,
          ),
        );
      }

      const player = maybePlayer.value;
      return getPlayerMMRSummary(player.puuid).pipe(
        Effect.flatMap((maybeSummary) => {
          if (Option.isNone(maybeSummary)) {
            return Effect.succeed(
              makeEphemeralResponse(
                `❌ Failed to load recent match history for **${player.name}#${player.tag}**.`,
              ),
            );
          }

          const s = maybeSummary.value;
          return fetchPlayerMatchPerformance(s.matchId, player.puuid).pipe(
            Effect.map((maybePerf) => {
              const won = s.lastChange > 0;
              const outcomeTitle = won
                ? `🏆 Victory on ${s.map} (+${s.lastChange} RR)`
                : `💀 Defeat on ${s.map} (${s.lastChange} RR)`;

              const perfFields: Array<{ name: string; value: string; inline?: boolean }> = [];

              if (Option.isSome(maybePerf)) {
                const perf = maybePerf.value;
                perfFields.push(
                  { name: 'Agent', value: `**${perf.character}**`, inline: true },
                  {
                    name: 'K / D / A',
                    value: `**${perf.kills}** / ${perf.deaths} / ${perf.assists}`,
                    inline: true,
                  },
                  { name: 'Score', value: `${perf.score}`, inline: true },
                );
              } else {
                perfFields.push({
                  name: 'Performance',
                  value: 'Detailed scoreboard unavailable from match API',
                  inline: false,
                });
              }

              const embed: DiscordEmbed = {
                author: { name: `${player.name}#${player.tag}` },
                title: outcomeTitle,
                color: won ? 0x48a66d : 0xc83c5b,
                fields: perfFields,
                footer: { text: `Tier at conclusion: ${s.tierName} (${s.rr} RR)` },
                timestamp: new Date().toISOString(),
              };

              return makeSuccessResponse(embed);
            }),
          );
        }),
      );
    }),
  );
};

export const handleLeaderboardCommand = (): Effect.Effect<
  DiscordInteractionResponse,
  never,
  D1Client.D1Client | HttpClient.HttpClient | KVClient
> =>
  D1Client.D1Client.pipe(
    Effect.flatMap(
      (d1) => d1<Player>`SELECT puuid, name, tag, discord_user_id FROM players ORDER BY name ASC`,
    ),
    Effect.flatMap((players) =>
      Effect.forEach(
        players,
        (p) =>
          getPlayerMMRSummary(p.puuid).pipe(
            Effect.map((maybeSum) => ({
              player: p,
              summary: Option.getOrUndefined(maybeSum),
            })),
          ),
        { concurrency: 3 },
      ),
    ),
    Effect.map((items) => {
      if (items.length === 0) {
        return makeEphemeralResponse('ℹ️ No players are currently registered in the database.');
      }

      const sorted = [...items].sort((a, b) => {
        const eloA = a.summary?.elo ?? 0;
        const eloB = b.summary?.elo ?? 0;
        return eloB - eloA;
      });

      const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

      const lines = sorted.map((entry, idx) => {
        const medal = medals[idx] ?? `**#${idx + 1}**`;
        const p = entry.player;
        const s = entry.summary;
        if (!s) {
          return `${medal} **${p.name}#${p.tag}** — *Uncalibrated*`;
        }

        const streakBadge =
          s.streakCount >= 3
            ? s.streakType === 'win'
              ? `🔥 ${s.streakCount}W`
              : `⚠️ ${s.streakCount}L`
            : '';

        return `${medal} **${p.name}#${p.tag}** — **${s.tierName}** (${s.rr} RR) ${streakBadge}`.trim();
      });

      const embed: DiscordEmbed = {
        title: '🏆 Grove Street Crew Leaderboard',
        description: lines.join('\n\n'),
        color: 0xffd700,
        footer: { text: `Tracking ${items.length} players • 5-min cache active` },
        timestamp: new Date().toISOString(),
      };

      return makeSuccessResponse(embed);
    }),
    Effect.catchAll(() =>
      Effect.succeed(makeEphemeralResponse('❌ Failed to construct server leaderboard.')),
    ),
  );

export const handleLinkCommand = (
  interaction: DiscordInteraction,
): Effect.Effect<DiscordInteractionResponse, never, D1Client.D1Client | HttpClient.HttpClient> => {
  const callerId = interaction.member?.user.id ?? interaction.user?.id;
  if (!callerId) {
    return Effect.succeed(makeEphemeralResponse('❌ Could not identify your Discord user ID.'));
  }

  const riotIdOpt = interaction.data?.options?.find((o) => o.name === 'riot_id')?.value as
    | string
    | undefined;

  if (!riotIdOpt || !riotIdOpt.includes('#')) {
    return Effect.succeed(
      makeEphemeralResponse(
        "⚠️ Please provide your Riot ID in the format **'Name#Tag'** (e.g. `/link riot_id: Jett#1234`).",
      ),
    );
  }

  const [rawName, rawTag] = riotIdOpt.split('#');
  const name = rawName?.trim() ?? '';
  const tag = rawTag?.trim() ?? '';

  if (name.length === 0 || tag.length === 0) {
    return Effect.succeed(
      makeEphemeralResponse('⚠️ Invalid Riot ID format. Both name and tag are required.'),
    );
  }

  const fetchAccount = HttpClient.HttpClient.pipe(
    Effect.flatMap((c) =>
      HttpClientRequest.get(
        `https://api.henrikdev.xyz/valorant/v2/account/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`,
      ).pipe(
        HttpClientRequest.setHeaders({ Authorization: env.VALAPIKEY, Accept: '*/*' }),
        c.execute,
        Effect.flatMap(HttpClientResponse.schemaBodyJson(AccountV2)),
      ),
    ),
  );

  return fetchAccount.pipe(
    Effect.flatMap((acc) =>
      D1Client.D1Client.pipe(
        Effect.flatMap((d1) =>
          d1<Player>`SELECT puuid, name, tag, discord_user_id FROM players WHERE puuid = ${acc.data.puuid} LIMIT 1`.pipe(
            Effect.flatMap((existingRows) => {
              const existing = existingRows[0];
              if (existing && existing.discord_user_id && existing.discord_user_id !== callerId) {
                return Effect.succeed(
                  makeEphemeralResponse(
                    `❌ **Account Already Linked**: Riot account **${acc.data.name}#${acc.data.tag}** is already linked to <@${existing.discord_user_id}>.`,
                  ),
                );
              }

              return d1`DELETE FROM players WHERE discord_user_id = ${callerId}`.pipe(
                Effect.flatMap(
                  () =>
                    d1`INSERT INTO players (puuid, name, tag, discord_user_id) VALUES (${acc.data.puuid}, ${acc.data.name}, ${acc.data.tag}, ${callerId})
                     ON CONFLICT(puuid) DO UPDATE SET name = ${acc.data.name}, tag = ${acc.data.tag}, discord_user_id = ${callerId}`,
                ),
                Effect.map(() => {
                  const embed: DiscordEmbed = {
                    title: '✅ Riot Account Linked Successfully!',
                    description: `<@${callerId}> is now officially registered and linked to **${acc.data.name}#${acc.data.tag}**!`,
                    color: 0x48a66d,
                    fields: [
                      {
                        name: 'Riot Account',
                        value: `**${acc.data.name}#${acc.data.tag}**`,
                        inline: true,
                      },
                      { name: 'Account Level', value: `${acc.data.account_level}`, inline: true },
                    ],
                    footer: { text: 'You can now use /rank and /lastmatch without options!' },
                    timestamp: new Date().toISOString(),
                  };
                  return makeSuccessResponse(embed);
                }),
              );
            }),
          ),
        ),
      ),
    ),
    Effect.catchAll(() =>
      Effect.succeed(
        makeEphemeralResponse(
          `❌ Could not verify Riot account **"${name}#${tag}"** with Riot API. Please verify spelling, capitalization, and region.`,
        ),
      ),
    ),
  );
};

export const handleUnlinkCommand = (
  interaction: DiscordInteraction,
): Effect.Effect<DiscordInteractionResponse, never, D1Client.D1Client> => {
  const callerId = interaction.member?.user.id ?? interaction.user?.id;
  if (!callerId) {
    return Effect.succeed(makeEphemeralResponse('❌ Could not identify your Discord user ID.'));
  }

  return D1Client.D1Client.pipe(
    Effect.flatMap((d1) =>
      d1<Player>`SELECT puuid, name, tag FROM players WHERE discord_user_id = ${callerId} LIMIT 1`.pipe(
        Effect.flatMap((rows) => {
          const p = rows[0];
          if (!p) {
            return Effect.succeed(
              makeEphemeralResponse('ℹ️ You do not currently have any linked Riot account.'),
            );
          }

          return d1`DELETE FROM players WHERE discord_user_id = ${callerId}`.pipe(
            Effect.map(() =>
              makeSuccessResponse({
                title: '✅ Account Unlinked',
                description: `Successfully unlinked and stopped tracking **${p.name}#${p.tag}** for <@${callerId}>.`,
                color: 0x48a66d,
              }),
            ),
          );
        }),
      ),
    ),
    Effect.catchAll(() =>
      Effect.succeed(makeEphemeralResponse('❌ Failed to process unlinking request.')),
    ),
  );
};

export const handleRemoveCommand = (
  interaction: DiscordInteraction,
): Effect.Effect<DiscordInteractionResponse, never, D1Client.D1Client> => {
  const permissions = interaction.member?.permissions;
  if (!hasAdminPermission(permissions)) {
    return Effect.succeed(
      makeEphemeralResponse(
        '❌ You need **Administrator** or **Manage Server** permissions to use `/remove`.',
      ),
    );
  }

  const playerOpt = interaction.data?.options?.find((o) => o.name === 'player')?.value as
    | string
    | undefined;

  if (!playerOpt || playerOpt.trim().length === 0) {
    return Effect.succeed(
      makeEphemeralResponse(
        '⚠️ Please specify the player to remove (e.g. `/remove player: Jett#1234`).',
      ),
    );
  }

  const raw = playerOpt.trim();
  let name = raw;
  let tag: string | undefined;
  if (raw.includes('#')) {
    const parts = raw.split('#');
    name = parts[0]?.trim() ?? '';
    tag = parts[1]?.trim();
  }

  return D1Client.D1Client.pipe(
    Effect.flatMap((d1) => {
      const query = tag
        ? d1`DELETE FROM players WHERE LOWER(name) = LOWER(${name}) AND LOWER(tag) = LOWER(${tag})`
        : d1`DELETE FROM players WHERE LOWER(name) = LOWER(${name})`;

      return query.pipe(
        Effect.map(() =>
          makeSuccessResponse({
            title: '🗑️ Player Removed',
            description: `Successfully removed player **"${playerOpt}"** from the tracked crew.`,
            color: 0x5a5959,
          }),
        ),
      );
    }),
    Effect.catchAll(() =>
      Effect.succeed(makeEphemeralResponse(`❌ Failed to remove player "${playerOpt}".`)),
    ),
  );
};

export const handleListCommand = (): Effect.Effect<
  DiscordInteractionResponse,
  never,
  D1Client.D1Client
> =>
  D1Client.D1Client.pipe(
    Effect.flatMap(
      (d1) => d1<Player>`SELECT puuid, name, tag, discord_user_id FROM players ORDER BY name ASC`,
    ),
    Effect.map((players) => {
      if (players.length === 0) {
        return makeEphemeralResponse('ℹ️ No players are currently registered in the database.');
      }

      const lines = players.map(
        (p) =>
          `• **${p.name}#${p.tag}** — ${p.discord_user_id ? `<@${p.discord_user_id}>` : '*Unlinked*'}`,
      );

      const embed: DiscordEmbed = {
        title: '📋 Grove Street Tracked Roster',
        description: `Tracking **${players.length}** crew members:\n\n${lines.join('\n')}`,
        color: 0x5865f2,
        footer: { text: 'Use /link to link your account or /rank to inspect stats' },
        timestamp: new Date().toISOString(),
      };

      return makeSuccessResponse(embed);
    }),
    Effect.catchAll(() =>
      Effect.succeed(makeEphemeralResponse('❌ Failed to retrieve registered roster.')),
    ),
  );

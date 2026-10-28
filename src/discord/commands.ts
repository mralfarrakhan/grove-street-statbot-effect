import { HttpClient, HttpClientRequest, HttpClientResponse } from '@effect/platform';
import { D1Client } from '@effect/sql-d1';
import { env } from 'cloudflare:workers';
import { DateTime, Effect, Option, pipe } from 'effect';
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

export const resolveTargetPlayers = (
  interaction: DiscordInteraction,
  playerOption?: string,
): Effect.Effect<ReadonlyArray<Player>, never, D1Client.D1Client> =>
  D1Client.D1Client.pipe(
    Effect.flatMap((d1) => {
      if (playerOption && playerOption.trim().length > 0) {
        const raw = playerOption.trim();
        const mentionMatch = raw.match(/^<@!?(\d+)>$/);
        if (mentionMatch && mentionMatch[1]) {
          const discordId = mentionMatch[1];
          return d1<Player>`SELECT puuid, name, tag, discord_user_id FROM players WHERE discord_user_id = ${discordId} ORDER BY name ASC`;
        }

        if (raw.includes('#')) {
          const [name, tag] = raw.split('#');
          return d1<Player>`SELECT puuid, name, tag, discord_user_id FROM players WHERE LOWER(name) = LOWER(${name?.trim() ?? ''}) AND LOWER(tag) = LOWER(${tag?.trim() ?? ''}) LIMIT 1`;
        }

        return d1<Player>`SELECT puuid, name, tag, discord_user_id FROM players WHERE LOWER(name) = LOWER(${raw}) OR LOWER(name) LIKE ${`%${raw.toLowerCase()}%`} ORDER BY name ASC`;
      }

      const callerId = interaction.member?.user.id ?? interaction.user?.id;
      if (!callerId) return Effect.succeed([]);
      return d1<Player>`SELECT puuid, name, tag, discord_user_id FROM players WHERE discord_user_id = ${callerId} ORDER BY name ASC`;
    }),
    Effect.catchAll(() => Effect.succeed([])),
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

  return resolveTargetPlayers(interaction, playerOpt).pipe(
    Effect.flatMap((players) => {
      if (players.length === 0) {
        if (!playerOpt) {
          return Effect.succeed(
            makeEphemeralResponse(
              '⚠️ **Discord Account Not Linked**\nYour Discord account is not yet linked to a Riot ID.\n• Use `/link riot_id: Name#Tag` to link your account\n• Or check another player with `/rank player: Name#Tag` or `/rank player: @Member`',
            ),
          );
        }
        return Effect.succeed(
          makeEphemeralResponse(
            `❌ Could not find player matching **"${playerOpt}"** in the tracked crew. Use \`/list\` to view all registered players.`,
          ),
        );
      }

      return Effect.forEach(
        players,
        (p) =>
          getPlayerMMRSummary(p.puuid).pipe(
            Effect.map((maybeSum) => ({
              player: p,
              summary: Option.getOrUndefined(maybeSum),
            })),
          ),
        { concurrency: 3 },
      ).pipe(
        Effect.map((accountSummaries) => {
          const validSummaries = accountSummaries.filter(
            (a): a is { player: Player; summary: CachedMMRSummary } => a.summary !== undefined,
          );

          if (validSummaries.length === 0) {
            const first = players[0];
            return makeEphemeralResponse(
              `❌ Failed to retrieve live rank data for **${first?.name}#${first?.tag}** from Riot API.`,
            );
          }

          // Sort by ELO descending to find the highest-ranked account
          const sorted = [...validSummaries].sort((a, b) => b.summary.elo - a.summary.elo);
          const top = sorted[0]!;
          const s = top.summary;
          const p = top.player;

          const streakBadge =
            s.streakCount >= 3
              ? s.streakType === 'win'
                ? `🔥 **${s.streakCount}-Game Heater**`
                : `⚠️ **${s.streakCount}-Loss Skid**`
              : '—';

          let footerText = p.discord_user_id
            ? `Linked to Discord User ID: ${p.discord_user_id}`
            : 'Unlinked account';

          if (sorted.length > 1) {
            const others = sorted.slice(1);
            const otherNames = others
              .map((o) => `${o.player.name}#${o.player.tag} (${o.summary.tierName})`)
              .join(', ');
            footerText = `Highest of ${sorted.length} linked accounts • Also tracking: ${otherNames}`;
          }

          const embed: DiscordEmbed = {
            author: { name: 'Grove Street Statbot' },
            title: `📈 Rank Card: ${p.name}#${p.tag}`,
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
            footer: { text: footerText },
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

  return resolveTargetPlayers(interaction, playerOpt).pipe(
    Effect.flatMap((players) => {
      if (players.length === 0) {
        if (!playerOpt) {
          return Effect.succeed(
            makeEphemeralResponse(
              '⚠️ **Discord Account Not Linked**\nYour Discord account is not yet linked to a Riot ID.\n• Use `/link riot_id: Name#Tag` to link your account\n• Or check another player with `/lastmatch player: Name#Tag` or `/lastmatch player: @Member`',
            ),
          );
        }
        return Effect.succeed(
          makeEphemeralResponse(
            `❌ Could not find player matching **"${playerOpt}"** in the tracked crew.`,
          ),
        );
      }

      return Effect.forEach(
        players,
        (p) =>
          fetchPlayerMMR(p.puuid).pipe(
            Effect.map((mmr) => {
              const latest = mmr.data.history[0];
              return { player: p, latest };
            }),
            Effect.catchAll(() => Effect.succeed({ player: p, latest: undefined })),
          ),
        { concurrency: 3 },
      ).pipe(
        Effect.flatMap((matches) => {
          const valid = matches.filter(
            (m): m is { player: Player; latest: NonNullable<typeof m.latest> } =>
              m.latest !== undefined,
          );

          if (valid.length === 0) {
            const first = players[0];
            return Effect.succeed(
              makeEphemeralResponse(
                `❌ Failed to load recent match history for **${first?.name}#${first?.tag}**.`,
              ),
            );
          }

          // Pick newest match by date across all accounts
          const sorted = [...valid].sort(
            (a, b) => DateTime.toEpochMillis(b.latest.date) - DateTime.toEpochMillis(a.latest.date),
          );
          const newest = sorted[0]!;
          const p = newest.player;
          const s = newest.latest;

          return fetchPlayerMatchPerformance(s.match_id, p.puuid).pipe(
            Effect.map((maybePerf) => {
              const won = s.last_change > 0;
              const accountTag = players.length > 1 ? ` (${p.name}#${p.tag})` : '';
              const outcomeTitle = won
                ? `🏆 Victory on ${s.map.name} (+${s.last_change} RR)${accountTag}`
                : `💀 Defeat on ${s.map.name} (${s.last_change} RR)${accountTag}`;

              const perfFields: Array<{ name: string; value: string; inline?: boolean }> = [
                { name: 'Account', value: `**${p.name}#${p.tag}**`, inline: true },
              ];

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
                author: { name: `${p.name}#${p.tag}` },
                title: outcomeTitle,
                color: won ? 0x48a66d : 0xc83c5b,
                fields: perfFields,
                footer: { text: `Tier at conclusion: ${s.tier.name} (${s.rr} RR)` },
                timestamp: DateTime.toDate(s.date).toISOString(),
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
        const ownerTag = p.discord_user_id ? ` (<@${p.discord_user_id}>)` : '';

        if (!s) {
          return `${medal} **${p.name}#${p.tag}**${ownerTag} — *Uncalibrated*`;
        }

        const streakBadge =
          s.streakCount >= 3
            ? s.streakType === 'win'
              ? `🔥 ${s.streakCount}W`
              : `⚠️ ${s.streakCount}L`
            : '';

        return `${medal} **${p.name}#${p.tag}**${ownerTag} — **${s.tierName}** (${s.rr} RR) ${streakBadge}`.trim();
      });

      const embed: DiscordEmbed = {
        title: '🏆 Grove Street Crew Leaderboard',
        description: lines.join('\n\n'),
        color: 0xffd700,
        footer: { text: `Tracking ${items.length} accounts • 5-min cache active` },
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

              // Additive insert/update - does NOT delete caller's previous accounts
              return d1`INSERT INTO players (puuid, name, tag, discord_user_id) VALUES (${acc.data.puuid}, ${acc.data.name}, ${acc.data.tag}, ${callerId})
                 ON CONFLICT(puuid) DO UPDATE SET name = ${acc.data.name}, tag = ${acc.data.tag}, discord_user_id = ${callerId}`.pipe(
                Effect.flatMap(
                  () =>
                    d1<Player>`SELECT puuid, name, tag FROM players WHERE discord_user_id = ${callerId}`,
                ),
                Effect.map((allCallerAccounts) => {
                  const count = allCallerAccounts.length;
                  const countNote = count > 1 ? ` You now have **${count} accounts** linked!` : '';

                  const embed: DiscordEmbed = {
                    title: '✅ Riot Account Linked Successfully!',
                    description: `<@${callerId}> is now officially linked to **${acc.data.name}#${acc.data.tag}**!${countNote}`,
                    color: 0x48a66d,
                    fields: [
                      {
                        name: 'Riot Account',
                        value: `**${acc.data.name}#${acc.data.tag}**`,
                        inline: true,
                      },
                      { name: 'Account Level', value: `${acc.data.account_level}`, inline: true },
                      { name: 'Total Accounts Linked', value: `${count}`, inline: true },
                    ],
                    footer: { text: 'You can use /rank and /lastmatch without options anytime!' },
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

  const playerOpt = interaction.data?.options?.find((o) => o.name === 'player')?.value as
    | string
    | undefined;

  return D1Client.D1Client.pipe(
    Effect.flatMap((d1) =>
      d1<Player>`SELECT puuid, name, tag FROM players WHERE discord_user_id = ${callerId}`.pipe(
        Effect.flatMap((accounts) => {
          if (accounts.length === 0) {
            return Effect.succeed(
              makeEphemeralResponse('ℹ️ You do not currently have any linked Riot accounts.'),
            );
          }

          // If a specific player was requested
          if (playerOpt && playerOpt.trim().length > 0) {
            const raw = playerOpt.trim().toLowerCase();
            const target = accounts.find(
              (a) => `${a.name}#${a.tag}`.toLowerCase() === raw || a.name.toLowerCase() === raw,
            );

            if (!target) {
              const accountList = accounts.map((a) => `• \`${a.name}#${a.tag}\``).join('\n');
              return Effect.succeed(
                makeEphemeralResponse(
                  `❌ Could not find **"${playerOpt}"** among your linked accounts:\n${accountList}`,
                ),
              );
            }

            return d1`DELETE FROM players WHERE puuid = ${target.puuid}`.pipe(
              Effect.map(() =>
                makeSuccessResponse({
                  title: '✅ Account Unlinked',
                  description: `Successfully unlinked and stopped tracking **${target.name}#${target.tag}** for <@${callerId}>. (${accounts.length - 1} accounts remaining)`,
                  color: 0x48a66d,
                }),
              ),
            );
          }

          // If only 1 account, unlink it directly
          if (accounts.length === 1 && accounts[0]) {
            const only = accounts[0];
            return d1`DELETE FROM players WHERE puuid = ${only.puuid}`.pipe(
              Effect.map(() =>
                makeSuccessResponse({
                  title: '✅ Account Unlinked',
                  description: `Successfully unlinked and stopped tracking **${only.name}#${only.tag}** for <@${callerId}>.`,
                  color: 0x48a66d,
                }),
              ),
            );
          }

          // If multiple accounts exist and none specified, guide user to pick
          const accountList = accounts
            .map((a) => `• \`/unlink player: ${a.name}#${a.tag}\``)
            .join('\n');
          return Effect.succeed(
            makeEphemeralResponse(
              `⚠️ You have **${accounts.length} accounts** linked. Please specify which account to unlink:\n\n${accountList}`,
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
        '⚠️ Please specify the player to remove (e.g. `/remove player: Jett#1234` or `/remove player: @Member`).',
      ),
    );
  }

  const raw = playerOpt.trim();
  const mentionMatch = raw.match(/^<@!?(\d+)>$/);

  return D1Client.D1Client.pipe(
    Effect.flatMap((d1) => {
      if (mentionMatch && mentionMatch[1]) {
        const discordId = mentionMatch[1];
        return d1`DELETE FROM players WHERE discord_user_id = ${discordId}`.pipe(
          Effect.map(() =>
            makeSuccessResponse({
              title: '🗑️ Member Accounts Removed',
              description: `Successfully removed all accounts linked to <@${discordId}> from tracking.`,
              color: 0x5a5959,
            }),
          ),
        );
      }

      let name = raw;
      let tag: string | undefined;
      if (raw.includes('#')) {
        const parts = raw.split('#');
        name = parts[0]?.trim() ?? '';
        tag = parts[1]?.trim();
      }

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

      const memberMap = new Map<string, Array<Player>>();
      const unlinked: Array<Player> = [];

      for (const p of players) {
        if (p.discord_user_id) {
          const list = memberMap.get(p.discord_user_id) ?? [];
          list.push(p);
          memberMap.set(p.discord_user_id, list);
        } else {
          unlinked.push(p);
        }
      }

      const lines: string[] = [];
      for (const [discordId, memberPlayers] of memberMap.entries()) {
        const accs = memberPlayers.map((p) => `**${p.name}#${p.tag}**`).join(', ');
        lines.push(`• <@${discordId}> (${memberPlayers.length}): ${accs}`);
      }

      if (unlinked.length > 0) {
        const accs = unlinked.map((p) => `**${p.name}#${p.tag}**`).join(', ');
        lines.push(`• *Unlinked* (${unlinked.length}): ${accs}`);
      }

      const embed: DiscordEmbed = {
        title: '📋 Grove Street Tracked Roster',
        description: `Tracking **${players.length}** accounts across **${memberMap.size}** members:\n\n${lines.join('\n')}`,
        color: 0x5865f2,
        footer: { text: 'Use /link to register accounts or /rank to inspect stats' },
        timestamp: new Date().toISOString(),
      };

      return makeSuccessResponse(embed);
    }),
    Effect.catchAll(() =>
      Effect.succeed(makeEphemeralResponse('❌ Failed to retrieve registered roster.')),
    ),
  );

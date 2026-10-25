import fs from 'node:fs';
import path from 'node:path';

function loadEnvVars() {
  const vars = { ...process.env };
  const devVarsPath = path.resolve(process.cwd(), '.dev.vars');
  if (fs.existsSync(devVarsPath)) {
    const lines = fs.readFileSync(devVarsPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        let val = trimmed.slice(idx + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (!vars[key]) vars[key] = val;
      }
    }
  }
  return vars;
}

const env = loadEnvVars();
const token = env.BOT_TOKEN;
const applicationId = env.BOT_APPLICATION_ID;

if (!token || !applicationId) {
  console.error('❌ BOT_TOKEN or BOT_APPLICATION_ID is missing from environment / .dev.vars');
  process.exit(1);
}

const commands = [
  {
    name: 'rank',
    description: "Check a player's live VALORANT rank, RR progress, and active streak",
    options: [
      {
        name: 'player',
        description: 'Target player Name#Tag (defaults to you if linked)',
        type: 3, // STRING
        required: false,
      },
    ],
  },
  {
    name: 'lastmatch',
    description: 'View scoreboard, agent, and RR change from the most recent match',
    options: [
      {
        name: 'player',
        description: 'Target player Name#Tag (defaults to you if linked)',
        type: 3, // STRING
        required: false,
      },
    ],
  },
  {
    name: 'leaderboard',
    description: 'View the Grove Street crew leaderboard ranked by live ELO/RR',
  },
  {
    name: 'link',
    description: 'Link your Discord account to your Riot ID for automatic stat tracking',
    options: [
      {
        name: 'riot_id',
        description: 'Your Riot ID in Name#Tag format (e.g. Jett#1234)',
        type: 3, // STRING
        required: true,
      },
    ],
  },
  {
    name: 'unlink',
    description: 'Unlink your Discord account from the tracked crew',
  },
  {
    name: 'remove',
    description: 'Admin: Remove a player from the tracked crew',
    options: [
      {
        name: 'player',
        description: 'Player Name#Tag or Name to remove',
        type: 3, // STRING
        required: true,
      },
    ],
  },
  {
    name: 'list',
    description: 'List all currently tracked crew members and their linked Discord accounts',
  },
];

async function registerCommands() {
  const args = process.argv.slice(2);
  const isClearGuild = args.includes('--clear-guild');
  const isClearGlobal = args.includes('--clear-global');

  if (isClearGlobal) {
    console.log(`🧹 Clearing all global commands...`);
    const url = `https://discord.com/api/v10/applications/${applicationId}/commands`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([]),
    });
    if (!res.ok) throw new Error(await res.text());
    console.log(`✅ All global commands cleared!`);
    return;
  }

  const cleanArgs = args.filter((a) => !a.startsWith('--'));
  const targetGuild = isClearGuild
    ? cleanArgs[0]
    : cleanArgs[0] || env.DISCORD_GUILD_ID || env.GUILD_ID;

  if (isClearGuild) {
    if (!targetGuild) {
      console.error(
        '❌ Please specify the Server ID to clear: npm run register-commands -- --clear-guild <SERVER_ID>',
      );
      process.exit(1);
    }
    console.log(`🧹 Clearing guild commands for Server ID: ${targetGuild}...`);
    const url = `https://discord.com/api/v10/applications/${applicationId}/guilds/${targetGuild}/commands`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([]),
    });
    if (!res.ok) throw new Error(await res.text());
    console.log(
      `✅ All guild commands for server ${targetGuild} cleared! Reload Discord (Cmd+R / Ctrl+R) to see the single global set.`,
    );
    return;
  }

  const guildId = targetGuild;

  if (guildId) {
    console.log(
      `⚡ Registering ${commands.length} INSTANT Guild commands for Server ID: ${guildId}...`,
    );
  } else {
    console.log(
      `📡 Registering ${commands.length} global slash commands for application ${applicationId}...`,
    );
    console.log(
      `💡 Tip: To register instantly with 0 delay, run: npm run register-commands -- <YOUR_SERVER_ID>`,
    );
  }

  const url = guildId
    ? `https://discord.com/api/v10/applications/${applicationId}/guilds/${guildId}/commands`
    : `https://discord.com/api/v10/applications/${applicationId}/commands`;

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`❌ Failed to register commands (${response.status}):`, errorText);
    process.exit(1);
  }

  const result = await response.json();
  console.log(`✅ Successfully registered ${result.length} commands with Discord:`);
  for (const cmd of result) {
    console.log(`   - /${cmd.name}: ${cmd.description}`);
  }
}

registerCommands().catch((err) => {
  console.error('Fatal error during registration:', err);
  process.exit(1);
});

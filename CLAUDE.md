# Grove Street Statbot Effect

Valorant rank tracker — polls HenrikDev API on cron, posts in-character Discord webhook messages when player rank changes. Web dashboard for player management. Discord slash command `/list`.

## Architecture

```
Cloudflare Worker (src/index.ts)
├── HTTP server (fetch handler)
│   ├── /api/players    — CRUD (PUT/DELETE basic auth, GET public)
│   ├── /api            — health check ("ok")
│   └── /interactions   — Discord interaction endpoint (POST)
├── Cron handler (scheduled)
│   └── For each player in D1: fetch MMR → detect rank change → LLM message → Discord webhook
└── Static assets (React SPA via Vite, /app/)
```

## Stack

- **Effect-TS** (`effect`, `@effect/platform`, `@effect/sql`, `@effect/sql-d1`) — strict pipe/flatMap, NO Effect.gen or Do (monad comprehension banned)
- **Cloudflare Workers** — D1 (SQLite), KV, Workers AI (Gemma 4 26B)
- **React 19** + Tailwind CSS 4 + Vite 8 (frontend)
- **discord-interactions** v4 — Ed25519 signature verification
- **HenrikDev API** — Valorant account + MMR data
- **valorant-api.com** — Agent data for LLM character prompts

## Branches

| Branch | Purpose |
|---|---|
| `master` | Deployed (no interactions endpoint) |
| `bot` | Discord slash command support (has unfixed issues) |
| `bot-fix` | `bot` branch + error handling fixes + commands.json |

## Key files

| File | Purpose |
|---|---|
| `src/index.ts` | Worker entry, router, error boundary |
| `src/handles.ts` | All HTTP handlers + scheduled logic + interaction dispatch |
| `src/schemas.ts` | Effect Schema definitions (Player, Interaction, MMRHistoryV2, etc.) |
| `src/model.ts` | Report tagged enum (NoChange, FirstRank, UpRank, DownRank, NewSeason) |
| `src/middlewares.ts` | Basic auth middleware |
| `src/services.ts` | D1, KV, AI service layers |
| `src/prompts.ts` | LLM prompt templates |
| `cli/index.ts` | Effect CLI for slash command registration |
| `cli/schemas.ts` | Full Discord Application Command schema |
| `commands.json` | Slash command definitions for CLI registration |
| `app/` | React SPA (Add/Remove/List players dashboard) |
| `wrangler.jsonc` | Worker config (bindings, crons, compatibility) |

## Deploy

```bash
npm run deploy                    # tsc -b && vite build && wrangler deploy
npx tsx cli/index.ts commands put commands.json  # register slash commands
```

Secrets managed via `wrangler secret put`:
- `ADMIN_USERNAME`, `ADMIN_PASSWORD` — dashboard basic auth
- `VALAPIKEY` — HenrikDev API key
- `WEBHOOK_URL` — Discord webhook for rank notifications
- `BOT_PUBLIC_KEY` — Discord Ed25519 public key (interaction verification)
- `BOT_TOKEN`, `BOT_APPLICATION_ID` — Discord bot token + app ID (CLI only)

## Discord interaction setup

1. Deploy worker → `/interactions` endpoint live
2. Discord Developer Portal → set Interactions Endpoint URL to `https://<worker>/interactions`
3. Register commands via CLI (needs `BOT_TOKEN` + `BOT_APPLICATION_ID` env vars)
4. Discord sends PING → Worker validates Ed25519 sig → returns PONG → endpoint verified

## Error handling conventions

- Typed errors caught with `Effect.catchTags({ TagName: handler })`
- `Unauthorized` → 401 (signature fail, bad credentials)
- `ParseError` → 400 (invalid JSON body)
- `RequestError` → 400 (body read failure)
- `RouteNotFound` → 404
- Everything else → `catchAllCause` logs full cause + returns sanitized `{ message: "Internal Server Error" }` (500)
- Never expose `cause.toJSON()` to clients
- Auth middleware catches `NoSuchElementException` (missing header) → maps to `Unauthorized`

## D1 schema

```sql
CREATE TABLE players (
  puuid TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tag TEXT NOT NULL,
  discord_user_id TEXT DEFAULT ''
);
```

## KV usage

Key = player PUUID, Value = last known match ID. Used to diff MMR history and detect rank changes between cron runs.

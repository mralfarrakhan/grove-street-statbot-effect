import { Schema, Struct } from 'effect';

export class Player extends Schema.Class<Player>('Player')({
  name: Schema.String,
  tag: Schema.String,
  puuid: Schema.UUID,
  discord_tag: Schema.optional(Schema.String),
}) {}

export const InsertPlayerSchema = Schema.Struct(
  Struct.pick(Player.fields, 'name', 'tag', 'discord_tag'),
);

export const RemovePlayerSchema = Schema.Struct(
  Struct.pick(Player.fields, 'name', 'tag'),
);

export class Errors extends Schema.Class<Errors>('Errors')({
  message: Schema.String,
  code: Schema.Number,
  details: Schema.String,
}) {}

export class BaseResponse extends Schema.Class<BaseResponse>('BaseResponse')({
  status: Schema.Number,
  errors: Schema.optional(Errors),
}) {}

export class AccountV2 extends BaseResponse.extend<AccountV2>('Account')({
  data: Schema.Struct({
    puuid: Schema.UUID,
    region: Schema.String,
    account_level: Schema.Number,
    name: Schema.String,
    tag: Schema.String,
    card: Schema.UUID,
    title: Schema.UUID,
    platforms: Schema.Array(Schema.String),
    updated_at: Schema.DateTimeUtc,
  }),
}) {}

export class MMRHistory extends BaseResponse.extend<MMRHistory>('MMRHistory')({
  name: Schema.String,
  tag: Schema.String,
  data: Schema.optional(
    Schema.Array(
      Schema.Struct({
        currenttier: Schema.Number,
        currenttierpatched: Schema.String,
        images: Schema.Struct({
          small: Schema.String,
          large: Schema.String,
          triangle_down: Schema.String,
          triangle_up: Schema.String,
        }),
        match_id: Schema.String,
        map: Schema.Struct({
          id: Schema.String,
          name: Schema.String,
        }),
        season_id: Schema.String,
        ranking_in_tier: Schema.Number,
        mmr_change_to_last_game: Schema.Number,
        elo: Schema.Number,
        date: Schema.String,
        date_raw: Schema.Number,
      }),
    ),
  ),
}) {}

export class MMRHistoryWithPuuid extends MMRHistory.extend<MMRHistoryWithPuuid>(
  'MMRHistoryWithPuuid',
)({
  puuid: Schema.UUID,
}) {}

const MMRHistoryV2HistorySchema = Schema.Struct({
  tier: Schema.Struct({
    id: Schema.Number,
    name: Schema.String,
  }),
  match_id: Schema.UUID,
  map: Schema.Struct({
    id: Schema.UUID,
    name: Schema.String,
  }),
  season: Schema.Struct({
    id: Schema.UUID,
    short: Schema.String,
  }),
  rr: Schema.Number,
  last_change: Schema.Number,
  elo: Schema.Number,
  refunded_rr: Schema.Number,
  was_derank_protected: Schema.Boolean,
  date: Schema.DateTimeUtc,
});

export type MMRHistoryV2History = typeof MMRHistoryV2HistorySchema.Type;

export class MMRHistoryV2 extends BaseResponse.extend<MMRHistoryV2>('MMRHistory')({
  data: Schema.Struct({
    account: Schema.Struct(Struct.pick(Player.fields, 'name', 'tag', 'puuid')),
    history: Schema.Array(MMRHistoryV2HistorySchema),
  }),
}) {}

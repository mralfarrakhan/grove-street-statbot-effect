import { Schema, Struct } from 'effect';

export class Player extends Schema.Class<Player>('Player')({
  name: Schema.String,
  tag: Schema.String,
  puuid: Schema.UUID,
}) {}

export const PlayerNameTag = Schema.Struct(Struct.omit(Player.fields, 'puuid'));

export class Errors extends Schema.Class<Errors>('Errors')({
  message: Schema.String,
  code: Schema.Number,
  details: Schema.String,
}) {}

export class BaseResponse extends Schema.Class<BaseResponse>('BaseResponse')({
  status: Schema.Number,
  errors: Schema.optional(Errors),
}) {}

export class Account extends BaseResponse.extend<Account>('Account')({
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

import { Schema, Struct } from 'effect';

export class Player extends Schema.Class<Player>('Player')({
  name: Schema.String,
  tag: Schema.String,
  puuid: Schema.UUID,
  discord_user_id: Schema.optional(Schema.String),
}) {}

export const InsertPlayerSchema = Schema.Struct(
  Struct.pick(Player.fields, 'name', 'tag', 'discord_user_id'),
);

export const RemovePlayerSchema = Schema.Struct(Struct.pick(Player.fields, 'name', 'tag'));

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

export class HookMessage extends Schema.Class<HookMessage>('HookMessage')({
  content: Schema.String,
  username: Schema.String,
  avatar_url: Schema.URL,
}) {}

export class Agent extends Schema.Class<Agent>('AgentData')({
  displayName: Schema.String,
  displayIcon: Schema.URL,
  description: Schema.String,
}) {}

export class Agents extends BaseResponse.extend<Agents>('Agents')({
  data: Schema.Array(Agent),
}) {}

export class AIMessage extends Schema.Class<AIMessage>('AIMessage')({
  content: Schema.optional(Schema.String),
}) {}

export class AIChoice extends Schema.Class<AIChoice>('AIChoice')({
  message: AIMessage,
}) {}

export class AIResponse extends Schema.Class<AIResponse>('AIResponse')({
  choices: Schema.Array(AIChoice),
}) {}

export class InteractionData extends Schema.Class<InteractionData>('InteractionData')({
  name: Schema.String,
}) {}

export class Interaction extends Schema.Class<Interaction>('Interaction')({
  type: Schema.Number,
  data: Schema.optional(InteractionData),
}) {}

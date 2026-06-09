import { Schema } from 'effect';

export const CommandTypeName: Record<number, string> = {
  1: 'CHAT_INPUT',
  2: 'USER',
  3: 'MESSAGE',
  4: 'PRIMARY_ENTRY_POINT',
};

export const OptionTypeName: Record<number, string> = {
  1: 'SUB_COMMAND',
  2: 'SUB_COMMAND_GROUP',
  3: 'STRING',
  4: 'INTEGER',
  5: 'BOOLEAN',
  6: 'USER',
  7: 'CHANNEL',
  8: 'ROLE',
  9: 'MENTIONABLE',
  10: 'NUMBER',
  11: 'ATTACHMENT',
};

export const ApplicationCommandOptionChoice = Schema.Struct({
  name: Schema.String,
  value: Schema.Union(Schema.String, Schema.Number),
});

export const ApplicationCommandOption = Schema.Struct({
  type: Schema.Number,
  name: Schema.String,
  description: Schema.String,
  required: Schema.optional(Schema.Boolean),
  choices: Schema.optional(Schema.Array(ApplicationCommandOptionChoice)),
  autocomplete: Schema.optional(Schema.Boolean),
  min_value: Schema.optional(Schema.Number),
  max_value: Schema.optional(Schema.Number),
  min_length: Schema.optional(Schema.Number),
  max_length: Schema.optional(Schema.Number),
});

export const ApplicationCommand = Schema.Struct({
  id: Schema.String,
  type: Schema.optional(Schema.Number),
  application_id: Schema.String,
  guild_id: Schema.optional(Schema.String),
  name: Schema.String,
  description: Schema.String,
  options: Schema.optional(Schema.Array(ApplicationCommandOption)),
  default_member_permissions: Schema.optional(Schema.NullOr(Schema.String)),
  nsfw: Schema.optional(Schema.Boolean),
  version: Schema.String,
});

export type ApplicationCommandOption = typeof ApplicationCommandOption.Type;
export type ApplicationCommand = typeof ApplicationCommand.Type;

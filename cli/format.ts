import type { ApplicationCommand, ApplicationCommandOption } from './schemas.ts';
import { CommandTypeName, OptionTypeName } from './schemas.ts';

const formatOption = (opt: ApplicationCommandOption): string => {
  const typeName = OptionTypeName[opt.type] ?? String(opt.type);
  const required = opt.required === true ? ' *' : '';
  let out = `    - ${opt.name} [${typeName}]${required}: ${opt.description}`;
  const range = [
    opt.min_value !== undefined ? `min:${opt.min_value}` : null,
    opt.max_value !== undefined ? `max:${opt.max_value}` : null,
    opt.min_length !== undefined ? `minLen:${opt.min_length}` : null,
    opt.max_length !== undefined ? `maxLen:${opt.max_length}` : null,
  ]
    .filter(Boolean)
    .join(' ');
  if (range) out += ` (${range})`;
  if (opt.autocomplete === true) out += ' [autocomplete]';
  if (opt.choices && opt.choices.length > 0) {
    out += `\n      choices: ${opt.choices.map((c) => `${c.name}=${c.value}`).join(', ')}`;
  }
  return out;
};

const formatCommand = (cmd: ApplicationCommand): string => {
  const typeName = CommandTypeName[cmd.type ?? 1] ?? String(cmd.type);
  const scope = cmd.guild_id != null ? `guild:${cmd.guild_id}` : 'global';
  const tags = [
    cmd.nsfw === true ? 'nsfw' : null,
    cmd.default_member_permissions != null
      ? `perms:${cmd.default_member_permissions}`
      : null,
  ]
    .filter(Boolean)
    .join(' ');
  const lines = [
    `[${typeName}] ${cmd.name}  (${scope})${tags ? '  ' + tags : ''}`,
    `  id: ${cmd.id}  version: ${cmd.version}`,
    `  ${cmd.description || '(no description)'}`,
  ];
  if (cmd.options && cmd.options.length > 0) {
    lines.push(`  options (${cmd.options.length}):`);
    lines.push(...cmd.options.map(formatOption));
  }
  return lines.join('\n');
};

export const formatCommands = (cmds: ReadonlyArray<ApplicationCommand>): string =>
  cmds.length === 0 ? 'No commands registered.' : cmds.map(formatCommand).join('\n\n');

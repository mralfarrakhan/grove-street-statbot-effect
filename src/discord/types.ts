export enum InteractionType {
  PING = 1,
  APPLICATION_COMMAND = 2,
}

export enum InteractionResponseType {
  PONG = 1,
  CHANNEL_MESSAGE_WITH_SOURCE = 4,
}

export interface DiscordUser {
  readonly id: string;
  readonly username: string;
  readonly global_name?: string;
  readonly avatar?: string;
}

export interface DiscordMember {
  readonly user: DiscordUser;
  readonly permissions?: string;
}

export interface CommandOption {
  readonly name: string;
  readonly type: number;
  readonly value: string | number | boolean;
}

export interface InteractionData {
  readonly id: string;
  readonly name: string;
  readonly options?: ReadonlyArray<CommandOption>;
}

export interface DiscordInteraction {
  readonly id: string;
  readonly type: InteractionType;
  readonly token: string;
  readonly member?: DiscordMember;
  readonly user?: DiscordUser;
  readonly data?: InteractionData;
}

export interface DiscordEmbedField {
  readonly name: string;
  readonly value: string;
  readonly inline?: boolean;
}

export interface DiscordEmbed {
  readonly title?: string;
  readonly description?: string;
  readonly color?: number;
  readonly fields?: ReadonlyArray<DiscordEmbedField>;
  readonly thumbnail?: { readonly url: string };
  readonly footer?: { readonly text: string; readonly icon_url?: string };
  readonly author?: { readonly name: string; readonly icon_url?: string };
  readonly timestamp?: string;
}

export interface DiscordInteractionResponse {
  readonly type: InteractionResponseType;
  readonly data?: {
    readonly content?: string;
    readonly embeds?: ReadonlyArray<DiscordEmbed>;
    readonly flags?: number; // 64 = EPHEMERAL
  };
}

export const formatProgressBar = (currentRR: number, maxRR: number = 100): string => {
  const totalBars = 10;
  const clamped = Math.max(0, Math.min(maxRR, currentRR));
  const filledBars = Math.round((clamped / maxRR) * totalBars);
  const emptyBars = totalBars - filledBars;
  return `[${'█'.repeat(filledBars)}${'░'.repeat(emptyBars)}] ${currentRR}/${maxRR} RR`;
};

export const getTierColor = (tierName?: string): number => {
  if (!tierName) return 0x0f1923;
  const name = tierName.toLowerCase();
  if (name.includes('iron')) return 0x5a5959;
  if (name.includes('bronze')) return 0xa5855e;
  if (name.includes('silver')) return 0xb4b8b9;
  if (name.includes('gold')) return 0xe2b338;
  if (name.includes('platinum')) return 0x2fa8a8;
  if (name.includes('diamond')) return 0xb977d6;
  if (name.includes('ascendant')) return 0x48a66d;
  if (name.includes('immortal')) return 0xc83c5b;
  if (name.includes('radiant')) return 0xffe885;
  return 0x0f1923; // Valorant dark gray
};

export const getTierIconUrl = (tierId: number): string =>
  `https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/${tierId}/smallicon.png`;

export const hasAdminPermission = (permissions?: string): boolean => {
  if (!permissions) return false;
  try {
    const bitfield = BigInt(permissions);
    const ADMINISTRATOR = 1n << 3n;
    const MANAGE_GUILD = 1n << 5n;
    return (bitfield & ADMINISTRATOR) !== 0n || (bitfield & MANAGE_GUILD) !== 0n;
  } catch {
    return false;
  }
};

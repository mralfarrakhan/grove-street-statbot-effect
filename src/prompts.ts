export const upRankPrompt = 'rank promotion congratulation';

export const downRankPrompt = 'rank demotion pitiness';

export const firstRankPrompt = 'first rank acquirement message';

export const promptGenerator = (message: string, character: string, description: string) =>
  `write a very short ${message} in the style of Valorant video game character ${character} (official description: '${description}'), maybe with their catchphrases, mother tongue slips, or references to in-game contents, set the player name to {{player}}, new rank {{new_rank}}, and append the player discord account at {{discord_user_id}} at the end. write the exactly only the message. no em dashes.`;

export interface AgentPersona {
  displayName: string;
  archetype: 'Duelist' | 'Initiator' | 'Controller' | 'Sentinel';
  voiceTraits: string;
  nativeLanguageSlips: string;
  catchphrases: string[];
  partnerTone: string;
}

export const AGENT_PERSONAS: Record<string, AgentPersona> = {
  Jett: {
    displayName: 'Jett',
    archetype: 'Duelist',
    voiceTraits: 'Breezy, cocky, fast-talking South Korean wind radiant.',
    nativeLanguageSlips: 'Korean slips: "Aish!", "Daebak", "Gaja!", "Pabo", "Jinjja".',
    catchphrases: ['Watch this!', 'Get out of my way!', 'Easy!', 'They never stood a chance.'],
    partnerTone: 'Playful and cocky. Boasts about their shared movement and dagger plays together.',
  },
  Phoenix: {
    displayName: 'Phoenix',
    archetype: 'Duelist',
    voiceTraits: 'Confident, stylish, energetic Londoner with swagger and fire powers.',
    nativeLanguageSlips: 'British London slang: "bruv", "mate", "innit", "swear down", "skrrt".',
    catchphrases: ['Watch and learn!', 'Super high flare!', "Come on, let's go!"],
    partnerTone: 'Hyped-up hype man. Keeps the energy blazing and loves showboating.',
  },
  Reyna: {
    displayName: 'Reyna',
    archetype: 'Duelist',
    voiceTraits: 'Ruthless, predatory Mexican radiant who thrives on consuming enemy souls.',
    nativeLanguageSlips: 'Spanish slips: "Corazón", "Mi vida", "Míralos", "Pobrecitos".',
    catchphrases: ['The hunt begins.', 'Give me more.', 'They will cower!'],
    partnerTone:
      'Fierce and demanding. Feeds off ruthless aggression, respects bloodthirsty plays.',
  },
  Raze: {
    displayName: 'Raze',
    archetype: 'Duelist',
    voiceTraits: 'Loud, explosive, upbeat Brazilian engineer who loves chaos and paint.',
    nativeLanguageSlips: 'Brazilian Portuguese slips: "Opa!", "Beleza", "Vamos!", "Demais".',
    catchphrases: ['Fire in the hole!', 'Here comes the party!', 'Boom!'],
    partnerTone:
      'High-energy demolition partner. Celebrates explosive plays and laughing off chaos.',
  },
  Yoru: {
    displayName: 'Yoru',
    archetype: 'Duelist',
    voiceTraits: 'Arrogant, rebellious Tokyo rift-walker who refuses to follow rules.',
    nativeLanguageSlips: 'Japanese slips: "Kuso", "Yare yare", "Baka", "Ikuzo".',
    catchphrases: ["I'll handle this.", "Who's next?", 'Too slow.'],
    partnerTone:
      'Grudgingly approving. Pretends he did everything alone but acknowledges good coordination.',
  },
  Neon: {
    displayName: 'Neon',
    archetype: 'Duelist',
    voiceTraits: 'Spirited, fast-paced Filipina radiant charged with bioelectric speed.',
    nativeLanguageSlips: 'Tagalog slips: "Hay nako", "Tara na", "Sige", "Salamat".',
    catchphrases: ['Out of my way!', 'Here we go!', 'Zip-zap!'],
    partnerTone: 'Fast and eager. Wants to keep moving forward at max speed.',
  },
  Iso: {
    displayName: 'Iso',
    archetype: 'Duelist',
    voiceTraits: 'Calm, methodical, laser-focused Chinese assassin and fixer.',
    nativeLanguageSlips: 'Mandarin slips: "Zhende ma", "Mei wenti", "Xie xie".',
    catchphrases: ['Focus.', 'One by one.', 'Target down.'],
    partnerTone: 'Quiet, lethal professional. Treats the match as a cleanly executed contract.',
  },
  Brimstone: {
    displayName: 'Brimstone',
    archetype: 'Controller',
    voiceTraits: 'Grizzled veteran military commander from Baltimore, authoritative and fatherly.',
    nativeLanguageSlips:
      'American military jargon: calls the player "kid", "soldier", or "rookie".',
    catchphrases: ['Open up the sky!', 'Good work, soldier.', 'Shake it off, kid.'],
    partnerTone:
      'Firm military leader. Praises tactical execution or urges resilience after defeat.',
  },
  Viper: {
    displayName: 'Viper',
    archetype: 'Controller',
    voiceTraits: 'Cold, cynical American toxicologist who demands clinical perfection.',
    nativeLanguageSlips: 'Toxic, chemical, and lethal venom metaphors.',
    catchphrases: ['Welcome to my world.', "Don't disappoint me.", 'Toxin levels rising.'],
    partnerTone:
      'Demanding and razor-sharp. Reluctantly satisfied with wins, scathing towards sloppy losses.',
  },
  Omen: {
    displayName: 'Omen',
    archetype: 'Controller',
    voiceTraits: 'Haunted, brooding, ethereal shadow wraith navigating fragmented memories.',
    nativeLanguageSlips: 'Whispered existential references to shadows, darkness, and unraveling.',
    catchphrases: ['Scatter.', 'I am everywhere.', 'They thought they were safe.'],
    partnerTone:
      'A quiet phantom walking beside the player, connecting their combat to shadows and focus.',
  },
  Astra: {
    displayName: 'Astra',
    archetype: 'Controller',
    voiceTraits: 'Vibrant, energetic Ghanaian astral guardian channeling cosmic energy.',
    nativeLanguageSlips: 'Ghanaian Pidgin slips: "Chale", "Walahi", "You dey craze".',
    catchphrases: ['I see everything.', 'Cosmic alignment.', 'World is mine!'],
    partnerTone: 'Big sister cosmic guardian. Radiates celestial confidence and warmth.',
  },
  Harbor: {
    displayName: 'Harbor',
    archetype: 'Controller',
    voiceTraits: 'Charismatic, heroic Indian coastal relic-bearer with a warm, commanding voice.',
    nativeLanguageSlips: 'Hindi slips: "Shabash", "Chalo", "Bhai", "Dhanyavaad".',
    catchphrases: ['Cove down.', 'Ride the wave!', 'Stay with me.'],
    partnerTone:
      'Protective, brotherhood-focused comrade who prides himself on shielding his partner.',
  },
  Clove: {
    displayName: 'Clove',
    archetype: 'Controller',
    voiceTraits: 'Mischievous, rebellious Scottish immortal who treats death as a minor nuisance.',
    nativeLanguageSlips: 'Scottish slang: "Wee", "Braw", "Daft", "Cannae", "Nae bother".',
    catchphrases: ['Back already!', 'You cannot kill me!', 'Pick yourself up.'],
    partnerTone:
      'Playful, defiant pest. Laughs in the face of defeat and banters effortlessly on wins.',
  },
  Sova: {
    displayName: 'Sova',
    archetype: 'Initiator',
    voiceTraits: 'Patient, noble Russian archer and tracker who values precision and honor.',
    nativeLanguageSlips: 'Russian slips: "Khorosho", "Da", "Babushka", "Pozhaluysta".',
    catchphrases: ['I am the hunter!', 'Trust your aim.', 'Nowhere to hide.'],
    partnerTone: 'Reliable scout and mentor. Praises patience and sharp reconnaissance.',
  },
  Breach: {
    displayName: 'Breach',
    archetype: 'Initiator',
    voiceTraits: 'Aggressive, loud Swedish bionic demolitions expert who charges through walls.',
    nativeLanguageSlips: 'Swedish slips: "Fan", "Tack", "Kom igen!", "Jävlar".',
    catchphrases: ["Let's go!", 'Make some noise!', 'Stand up and fight!'],
    partnerTone: 'Raucous brawler. Loves brute force, aggression, and knocking heads together.',
  },
  Skye: {
    displayName: 'Skye',
    archetype: 'Initiator',
    voiceTraits: 'Tough, earthy Australian nature guide and beast-caller.',
    nativeLanguageSlips: 'Australian slang: "Mate", "Too easy", "Ripper", "Bloody oath".',
    catchphrases: ['Hawk out!', 'Good on ya.', 'Back on your feet!'],
    partnerTone: 'Hardworking outdoor bush survivalist. Upbeat, grounded, and team-first.',
  },
  'KAY/O': {
    displayName: 'KAY/O',
    archetype: 'Initiator',
    voiceTraits: 'Determined, war-weary anti-radiant robotic war machine from the future.',
    nativeLanguageSlips:
      'Military combat telemetry: "Target suppressed", "System status green", "Affirmative".',
    catchphrases: ['Shutting them down.', 'No radiants left standing.', 'Mission ongoing.'],
    partnerTone:
      'Steely war comrade. Evaluates combat efficiency and celebrates tactical mission completion.',
  },
  Fade: {
    displayName: 'Fade',
    archetype: 'Initiator',
    voiceTraits: 'Brooding, menacing Turkish bounty hunter who weaponizes raw fear and shadows.',
    nativeLanguageSlips: 'Turkish slips: "Korkma", "Hadi", "Tamam", "Görüşürüz".',
    catchphrases: ['Face your fear.', 'I smell their panic.', 'Night falls.'],
    partnerTone:
      "Intense and watchful. Sees through the opponents' panic and commends resolute nerve.",
  },
  Gekko: {
    displayName: 'Gekko',
    archetype: 'Initiator',
    voiceTraits: 'Easygoing, warm, youthful angelino from East LA who leads his creature crew.',
    nativeLanguageSlips: 'Bilingual Chicano / Spanglish slips: "Oye", "Homie", "Vamos", "Claro".',
    catchphrases: ["Dizzy, blind 'em!", 'Wingman on it!', 'We got this.'],
    partnerTone:
      'Chill and friendly neighborhood bro. Treats the player like part of his close crew.',
  },
  Killjoy: {
    displayName: 'Killjoy',
    archetype: 'Sentinel',
    voiceTraits: 'Brilliant, quirky German inventor and tech prodigy with a witty, logical mind.',
    nativeLanguageSlips: 'German slips: "Wunderbar", "Ach ja", "Nein", "Danke schön".',
    catchphrases: ['Relax, I already analyzed everything.', "Don't stress.", 'Tech ready.'],
    partnerTone:
      'Smug inventor partner. Reminds the player how well their tactics and gadgets worked together.',
  },
  Cypher: {
    displayName: 'Cypher',
    archetype: 'Sentinel',
    voiceTraits: 'Secretive, paranoid Moroccan surveillance broker with dark, dry wit.',
    nativeLanguageSlips: 'Moroccan Arabic slips: "Habibi", "Yallah", "Sidi", "Khoya".',
    catchphrases: [
      'I know exactly where you are.',
      'Nothing stays hidden.',
      'My cameras never lie.',
    ],
    partnerTone: 'Speaks like an intelligence handler who orchestrated the match with the player.',
  },
  Sage: {
    displayName: 'Sage',
    archetype: 'Sentinel',
    voiceTraits: 'Graceful, resolute Chinese healer and steadfast pillar of the team.',
    nativeLanguageSlips: 'Mandarin slips: "Jiayou", "Mei shi", "Baozhong".',
    catchphrases: ['You are not alone.', 'Stand tall.', 'Duty calls.'],
    partnerTone: 'Nurturing yet firm guardian. Restores confidence and praises discipline.',
  },
  Chamber: {
    displayName: 'Chamber',
    archetype: 'Sentinel',
    voiceTraits: 'Flamboyant, elegant French weapons designer obsessed with custom luxury arms.',
    nativeLanguageSlips:
      'French slips: "Magnifique", "Mon ami", "Voilà", "Merci beaucoup", "Au revoir".',
    catchphrases: ["You want to play, let's play.", 'Fashionable, yes?', 'Perfection.'],
    partnerTone:
      'Refined gentleman partner. Praises the player for style, finesse, and headshot precision.',
  },
  Deadlock: {
    displayName: 'Deadlock',
    archetype: 'Sentinel',
    voiceTraits: 'Stoic, battle-hardened Norwegian security operative with bionic tech.',
    nativeLanguageSlips: 'Norwegian slips: "Javel", "Skål", "Herregud", "Takk".',
    catchphrases: ['Nothing gets through.', 'Hold the line.', 'Secure.'],
    partnerTone:
      'No-nonsense security partner. Values tactical discipline, lockdown defense, and survival.',
  },
  Vyse: {
    displayName: 'Vyse',
    archetype: 'Sentinel',
    voiceTraits:
      'Cold, calculating liquid metal metallic mastermind who isolates and controls prey.',
    nativeLanguageSlips: 'Metallic, calculated, architectural and structural traps metaphors.',
    catchphrases: ['Ensnared.', 'I dictate terms.', 'Walls closing in.'],
    partnerTone: 'Cold, strategic architect. Treats every game as a carefully engineered trap.',
  },
};

export const getAgentPersona = (name: string): AgentPersona =>
  AGENT_PERSONAS[name] ?? {
    displayName: name,
    archetype: 'Initiator',
    voiceTraits: 'Tactical VALORANT Protocol operative.',
    nativeLanguageSlips: '',
    catchphrases: ['Stay sharp.', 'Focus up.'],
    partnerTone: 'Fights alongside the player as a dedicated field duo.',
  };

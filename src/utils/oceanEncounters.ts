import type { Commodity } from './commodities';

export type EncounterType = 'whale' | 'turtle' | 'wreckage';
export type WhaleSpecies = 'sperm' | 'right';

export interface OceanEncounterDef {
  id: string;
  type: EncounterType;
  whaleSpecies?: WhaleSpecies;
  position: [number, number, number];
  rotation: number;
  collected: boolean;
}

export interface EncounterLoot {
  gold: number;
  provisions: number;
  cargo: Partial<Record<Commodity, number>>;
  description: string;
  title: string;
  subtitle: string;
  ascii: string[];
}

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }

const WHALE_LOOT: Record<WhaleSpecies, () => EncounterLoot> = {
  sperm: () => ({
    gold: randInt(20, 60),
    provisions: 0,
    cargo: { Ambergris: 1 },
    title: 'Sperm Whale',
    subtitle: 'Physeter macrocephalus',
    description: 'A great sperm whale sounded nearby. In its wake the crew found a small lump of ambergris, waxy and salt-stained.',
    ascii: [
      '               .--.',
      '           ___/    \\___',
      '     ~~~~~/ °          \\~~~~~~',
      '    ~~~~~/______________\\~~~~~',
      '     ~~~   \\__/  \\__/   ~~~',
    ],
  }),
  right: () => ({
    gold: randInt(30, 90),
    provisions: 0,
    cargo: {},
    title: 'Right Whale',
    subtitle: 'Eubalaena australis',
    description: 'A barnacled right whale rolled near the surface and then slipped away. Its wake left scraps of floating matter the crew sold in port.',
    ascii: [
      '            __.--.__',
      '       ____/   °    \\____',
      '  ~~~~/ .  .          .  \\~~~~',
      '  ~~~\\__________________ /~~~',
      '   ~~~  \\___/   \\___/  ~~~',
    ],
  }),
};

const TURTLE_LOOT: (() => EncounterLoot)[] = [
  () => ({
    gold: randInt(20, 60),
    provisions: randInt(3, 8),
    cargo: {},
    title: 'Hawksbill Turtle',
    subtitle: 'Eretmochelys imbricata',
    description: 'A hawksbill turtle paddles at the surface, its beautiful mottled shell catching the light. Prized for tortoiseshell.',
    ascii: [
      '        ___....___',
      '      /`  .  .   `\\',
      '   o-( ~~~~~~~~~~~ )-',
      '      \\_ .  .  . _/',
      '        `---°---`',
    ],
  }),
  () => ({
    gold: randInt(10, 30),
    provisions: randInt(5, 12),
    cargo: {},
    title: 'Green Sea Turtle',
    subtitle: 'Chelonia mydas',
    description: 'An enormous green turtle drifts alongside, ancient and unhurried. Its meat would feed the crew for days.',
    ascii: [
      '        ___===___',
      '      /`  . ~ .  `\\',
      '   o-( ~~~ ° ~~~~~ )-',
      '      \\_ . ~ .  _/',
      '        `--===--`',
    ],
  }),
];

const WRECKAGE_LOOT: (() => EncounterLoot)[] = [
  () => {
    const commodity = pick(['Black Pepper', 'Cinnamon', 'Tea', 'Coffee'] as Commodity[]);
    return {
      gold: randInt(10, 50),
      provisions: randInt(0, 3),
      cargo: { [commodity]: randInt(2, 6) },
      title: 'Drifting Wreckage',
      subtitle: 'Flotsam & salvage',
      description: `Shattered timbers and a half-sunk cargo crate. The crew hauls aboard what they can — ${commodity.toLowerCase()} and a few coins.`,
      ascii: [
        '    ___',
        '   |   |  //',
        '   |___|_//_____',
        '  ~~~~~/  |     |~~~~',
        '  ~~~~/___|_____|~~~~',
        '  ~~~~~~~~~~~~~~~~~~~~~~~~',
      ],
    };
  },
  () => ({
    gold: randInt(30, 120),
    provisions: randInt(1, 5),
    cargo: { Timber: randInt(3, 8) },
    title: 'Abandoned Boat',
    subtitle: 'A waterlogged pinnace',
    description: 'A small boat, waterlogged and listing, with no crew aboard. Its stores are still partly intact.',
    ascii: [
      '       |',
      '      /|\\',
      '     / | \\',
      '  __/  |  \\__',
      ' /____________\\',
      ' ~~~~~~~~~~~~~~~',
    ],
  }),
  () => ({
    gold: randInt(50, 200),
    provisions: 0,
    cargo: { 'Small Shot': randInt(2, 5) },
    title: 'Sunken Cargo',
    subtitle: 'Jettisoned stores',
    description: 'Barrels and crates bob in the swell — cargo thrown overboard in a storm. Some are still sealed.',
    ascii: [
      '      ___   ___',
      '     (   ) (   )',
      '  ~~~(___) (___) ~~~',
      '  ~~~~~ []  [] ~~~~~',
      '  ~~~~~~~~~~~~~~~~~~~~~~',
    ],
  }),
];

export function generateEncounterLoot(type: EncounterType, whaleSpecies: WhaleSpecies = 'sperm'): EncounterLoot {
  switch (type) {
    case 'whale': return WHALE_LOOT[whaleSpecies]();
    case 'turtle': return pick(TURTLE_LOOT)();
    case 'wreckage': return pick(WRECKAGE_LOOT)();
  }
}

export function generateEncounter(position: [number, number, number]): OceanEncounterDef {
  const types: EncounterType[] = ['whale', 'whale', 'turtle', 'turtle', 'turtle', 'wreckage', 'wreckage', 'wreckage'];
  const type = pick(types);
  return {
    id: Math.random().toString(36).substring(2, 9),
    type,
    whaleSpecies: type === 'whale' ? pick(['sperm', 'right'] as WhaleSpecies[]) : undefined,
    position,
    rotation: Math.random() * Math.PI * 2,
    collected: false,
  };
}

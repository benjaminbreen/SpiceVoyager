import type { Commodity } from '../store/gameStore';

export type EncounterType = 'whale' | 'turtle' | 'wreckage';

export interface OceanEncounterDef {
  id: string;
  type: EncounterType;
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

const WHALE_LOOT: (() => EncounterLoot)[] = [
  () => ({
    gold: randInt(80, 200),
    provisions: 0,
    cargo: {},
    title: 'Sperm Whale',
    subtitle: 'Physeter macrocephalus',
    description: 'A great sperm whale surfaces nearby, exhaling a plume of mist. Fragments of ambergris float in its wake.',
    ascii: [
      '               .--.',
      '           ___/    \\___',
      '     ~~~~~/ °          \\~~~~~~',
      '    ~~~~~/______________\\~~~~~',
      '     ~~~   \\__/  \\__/   ~~~',
    ],
  }),
  () => ({
    gold: randInt(40, 100),
    provisions: 5,
    cargo: {},
    title: 'Right Whale',
    subtitle: 'Eubalaena australis',
    description: 'A barnacled right whale rolls lazily at the surface, its great eye regarding the ship without fear.',
    ascii: [
      '            __.--.__',
      '       ____/   °    \\____',
      '  ~~~~/ .  .          .  \\~~~~',
      '  ~~~\\__________________ /~~~',
      '   ~~~  \\___/   \\___/  ~~~',
    ],
  }),
];

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
    const commodity = pick(['Spices', 'Silk', 'Tea'] as Commodity[]);
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
    cargo: { Wood: randInt(3, 8) },
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
    cargo: { Cannonballs: randInt(2, 5) },
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

export function generateEncounterLoot(type: EncounterType): EncounterLoot {
  switch (type) {
    case 'whale': return pick(WHALE_LOOT)();
    case 'turtle': return pick(TURTLE_LOOT)();
    case 'wreckage': return pick(WRECKAGE_LOOT)();
  }
}

export function generateEncounter(position: [number, number, number]): OceanEncounterDef {
  const types: EncounterType[] = ['whale', 'whale', 'turtle', 'turtle', 'turtle', 'wreckage', 'wreckage', 'wreckage'];
  return {
    id: Math.random().toString(36).substring(2, 9),
    type: pick(types),
    position,
    rotation: Math.random() * Math.PI * 2,
    collected: false,
  };
}

// ── Procedural Shrines ─────────────────────────────────────────────────────
//
// Phase 2 of the POI System (see AGENTS.md). One archetype — `shrine` —
// produces dozens of distinct sites by recombining:
//
//   faith-pool (from PORT_FAITHS) × scale (wayside / village / pilgrimage)
//
// Geometry reuse: a shrine is a synthetic spiritual `Building` injected into
// the port's buildings array, drawn by the existing per-faith spiritual
// branch in ProceduralCity.tsx, scaled uniformly via Building.geometryScale.
// No new bespoke geometry. The mosque/cathedral/shikhara/pagoda you see at
// the in-city scale is the same mesh, just smaller and outside the city.
//
// Each shrine produces a paired POIDefinition so the marker/modal pipeline
// from Phase 1 picks it up automatically. The generator returns both, and
// mapGenerator.ts attaches them to the port at gen time.
//
// Determinism: all placement, faith selection, and naming flows through one
// mulberry32 stream seeded by (worldSeed, portIdx). Same world seed → same
// shrines on the same hilltops with the same names.
//
// Slavery exclusion: shrine archetypes never reference forced-labor sites
// (no "plantation chapel", no "slave market shrine"). Religious POIs at
// historically-charged sites are bespoke, not procedural.

import type { Building, Port } from '../store/gameStore';
import type { Faith } from './portReligions';
import type { POIDefinition, POILocation } from './poiDefinitions';
import type { Commodity } from './commodities';
import { faithsForPort } from './portReligions';
import { getTerrainHeight } from './terrain';
import { SEA_LEVEL } from '../constants/world';

// ── Variant axes ────────────────────────────────────────────────────────────

type ShrineScale = 'wayside' | 'village' | 'pilgrimage';

// Heightened "splash-globe" silhouettes — a wayside shrine should still read
// from across the hinterland, so we no longer compress geometry below 1.0×.
// Pilgrimage sites out-scale the in-city version because they're standalone
// monuments, not buildings squeezed into a city block.
const SCALE_GEOMETRY: Record<ShrineScale, number> = {
  wayside: 1.0,
  village: 1.4,
  pilgrimage: 1.8,
};

// AABB footprint for the synthetic spiritual building. Tracks geometryScale so
// walking-detection lands on the shrine's visible footprint.
const SCALE_FOOTPRINT: Record<ShrineScale, [number, number, number]> = {
  wayside:    [9, 9, 10],
  village:    [12, 12, 14],
  pilgrimage: [16, 16, 18],
};

// ── Shrine variant axes ─────────────────────────────────────────────────────
//
// Five cheap, multiplicative axes that make every shrine visibly distinct
// without authoring new geometry. The renderer in ProceduralCity.tsx reads
// `Building.shrineVariant` from the spiritual branch and applies these.
//
//   keyFeatureScale : multiplier on the height of the faith's hero feature
//                     (Catholic bell tower, Sunni minaret, Hindu shikhara,
//                     Buddhist pagoda spire, Jewish dome…). Range ~0.85–1.6.
//   bodyProportion  : <1 squat, >1 vertical. Affects the main hall's height
//                     (the body of the shrine, not the hero feature).
//                     Range ~0.85–1.25.
//   paletteShift    : signed value passed to the per-faith palette helper. The
//                     renderer uses it to nudge wash / stone / accent hue.
//                     Range ~-0.10 to +0.10.
//   accents.boundaryWall : low ring of stones / mud / whitewashed posts around
//                          the precinct (~30% of shrines).
//   accents.prayerPole   : tall pole + pennant / banner / tikkun (~25%).
//   accents.outerCourtyard : flat plinth one tier wider than the body (~15%,
//                            mostly pilgrimage scale).

export interface ShrineVariant {
  keyFeatureScale: number;
  bodyProportion: number;
  paletteShift: number;
  accents: {
    boundaryWall: boolean;
    prayerPole: boolean;
    outerCourtyard: boolean;
  };
}

function rollShrineVariant(rng: () => number, scale: ShrineScale): ShrineVariant {
  // Pilgrimage shrines bias toward exaggerated hero features (taller spires,
  // bigger domes). Wayside stays closer to neutral.
  const heroBase = scale === 'pilgrimage' ? 1.25 : scale === 'village' ? 1.05 : 0.95;
  const heroJitter = (rng() - 0.5) * 0.45;
  return {
    keyFeatureScale: clamp(heroBase + heroJitter, 0.85, 1.6),
    bodyProportion: clamp(0.95 + (rng() - 0.5) * 0.35, 0.85, 1.25),
    paletteShift: (rng() - 0.5) * 0.20,
    accents: {
      boundaryWall: rng() < (scale === 'wayside' ? 0.20 : 0.40),
      prayerPole: rng() < (scale === 'wayside' ? 0.15 : 0.30),
      outerCourtyard: scale === 'pilgrimage' ? rng() < 0.45 : rng() < 0.08,
    },
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// ── Per-faith content pools ─────────────────────────────────────────────────

interface FaithContent {
  /** Returned as the POI name. The picker fills in {placeholder}s. */
  nameTemplates: string[];
  /** Sub-line shown beneath the name on the toast/modal. */
  subTemplates: string[];
  /** First names for the keeper NPC. */
  npcFirstNames: string[];
  /** Honorific/role title. The same shrine may use any of these. */
  roleTitles: string[];
  /** Filler — saint, pir, deity, master. Used by name templates. */
  patrons: string[];
  /** Two-paragraph lore template. {role}, {patron}, {place} substituted in. */
  loreTemplate: string;
  /** Knowledge domain tilted toward each tradition's herbal/medicinal lineage. */
  knowledgeDomain: Commodity[];
  /** Subset that scales-up to mastery at pilgrimage-scale shrines only. */
  masteryGoods: Commodity[];
}

const FAITH_CONTENT: Record<Faith, FaithContent> = {
  catholic: {
    nameTemplates: [
      'Wayside Chapel of São {patron}',
      'Hermitage of San {patron}',
      'Capela de Nossa Senhora do {patron}',
      'Shrine of the Pilgrim {patron}',
    ],
    subTemplates: ['A whitewashed oratory on the hill road', 'A wayside chapel kept by a hermit', 'A pilgrim oratory'],
    npcFirstNames: ['Padre Anselmo', 'Padre Bento', 'Frei Tomé', 'Padre Inácio', 'Frei Manoel', 'Padre Damião'],
    roleTitles: ['hermit-priest', 'oratory chaplain', 'wayside hermit'],
    patrons: ['Roque', 'Cristóvão', 'Antão', 'Brás', 'Gonçalo', 'Bartolomeu', 'Sebastião'],
    loreTemplate: "A small {role} keeps the oratory of São {patron} on the road into {place}. He compounds simples for travellers — aloes for the bowels, cassia for the bile — and keeps a thin pharmacopeia of the older Galenic lineage. He believes in the saints and the four humors in the same breath.",
    knowledgeDomain: ['Aloes', 'Cassia Fistula', 'Mumia', 'Theriac'],
    masteryGoods: ['Aloes'],
  },
  protestant: {
    nameTemplates: [
      'Meeting House of {patron}',
      "{patron}'s Chapel of Ease",
      'Wayside Parish of {patron}',
    ],
    subTemplates: ['A plain brick chapel beyond the parish bounds', 'A Reformed meeting house'],
    npcFirstNames: ['Reverend Whitcombe', 'Master Pyke', 'Vicar Holdsworth', 'Reverend Strode', 'Master Allott'],
    roleTitles: ['parish reader', 'curate of ease', 'lay minister'],
    patrons: ['St Anne', 'St Bartholomew', 'St James-the-Less', 'St Matthew', 'Holy Trinity'],
    loreTemplate: "A plain Reformed chapel beyond the parish bounds of {place}. The {role} keeps no relics and burns no incense; he reads in English, not Latin, and considers the popish taste for compounds with bezoar and mumia a Romish vanity. Still, he keeps a small herbal — Galen and Gerard, well-thumbed.",
    knowledgeDomain: ['Aloes', 'Cassia Fistula', 'Theriac'],
    masteryGoods: [],
  },
  sunni: {
    nameTemplates: [
      'Dargah of Pir {patron}',
      'Mazaar of Shaikh {patron}',
      'Khanqah of {patron}',
      'Ziyaratgah of {patron}',
    ],
    subTemplates: ['A Sufi tomb-shrine in the date palms', 'A khanqah of dervishes', 'A pilgrim mazaar'],
    npcFirstNames: ['Pir Ghulam', 'Shaikh Abdullah', 'Hakim Yusuf', 'Mawlana Karim', 'Maulvi Hasan', 'Sayyid Mahmud'],
    roleTitles: ['mujawir of the tomb', 'khalifa', 'sajjada-nashin', 'dervish-keeper'],
    patrons: ['Hassan al-Basri', 'Junayd', 'Bayazid', 'Shadhili', 'Chishti', 'Qadiri', 'Muʻin al-Din', 'Ali Hujwiri'],
    loreTemplate: "A Sufi mazaar a half-day's ride from {place}. The {role} of Pir {patron} grinds bhang into majoon paste for the dhikr nights and sells coffee from Mocha at cost to pilgrims. He is courteous, half-blind, and entirely uninterested in coin from strangers.",
    knowledgeDomain: ['Bhang', 'Frankincense', 'Myrrh', 'Coffee', 'Cassia Fistula'],
    masteryGoods: ['Bhang'],
  },
  shia: {
    nameTemplates: [
      'Imambara of {patron}',
      'Husayniya of {patron}',
      'Astan of {patron}',
    ],
    subTemplates: ['A blue-tiled imambara', 'A husayniya of mourners'],
    npcFirstNames: ['Mawlavi Riza', 'Hakim Mirza', 'Sayyid Husain', 'Mulla Bagher', 'Mawlavi Kamal'],
    roleTitles: ['mutawalli', 'maulvi', 'majlis-keeper'],
    patrons: ['Husayn', 'Abbas', 'Zayn al-Abidin', 'Ali Akbar', 'Bibi Fatima'],
    loreTemplate: "A blue-tiled imambara beyond {place}, kept by the {role} of {patron}. The Safavid touches in the tile-work mark its allegiance. He compounds the old Persian remedies — rose water, mumia, theriac of seventy ingredients — and grades them by smell, by taste, and by silence.",
    knowledgeDomain: ['Mumia', 'Rose Water', 'Theriac', 'Frankincense'],
    masteryGoods: ['Mumia'],
  },
  ibadi: {
    nameTemplates: [
      'Masjid of {patron}',
      'Hermitage of the {patron} Trail',
    ],
    subTemplates: ['A plain Ibadi mosque on the wadi road'],
    npcFirstNames: ['Imam Salim', 'Sayyid Said', 'Imam Hamad', 'Imam Khalfan'],
    roleTitles: ['imam', 'mosque-keeper'],
    patrons: ['Jabir ibn Zayd', 'Abu Bilal', 'Wadi Nakhal', 'Wadi Bani Khalid'],
    loreTemplate: "A small Ibadi mosque on the wadi road from {place}. The {role} keeps no shrine and venerates no saint — Ibadi austerity admits no intercession — but he keeps a date garden, frankincense incense for funerals, and the older traditions of southern Arabian medicine.",
    knowledgeDomain: ['Frankincense', 'Myrrh', 'Aloes'],
    masteryGoods: ['Frankincense'],
  },
  hindu: {
    nameTemplates: [
      'Mandir of {patron}',
      'Devi Shrine of {patron}',
      'Samadhi of Swami {patron}',
      '{patron} Kshetra',
    ],
    subTemplates: ['A small temple at the village edge', 'A goddess shrine in the grove', 'A samadhi of a renouncer'],
    npcFirstNames: ['Pandit Ramesh', 'Pujari Krishnadas', 'Sadhu Nityananda', 'Brahmin Govind', 'Pujari Lakshman'],
    roleTitles: ['pujari', 'sadhu-keeper', 'brahmin priest', 'mahant'],
    patrons: ['Shiva', 'Devi', 'Hanuman', 'Ganapati', 'Kali', 'Krishna', 'Rama'],
    loreTemplate: "A small mandir of {patron} a short walk beyond {place}. The {role} performs the daily aarti and keeps a small herb garden — bhang for the Shiva-prasad, ginger for digestion, the bitter tonics of Ayurveda. Strangers are admitted; coin is not refused but a flower or fruit is preferred.",
    knowledgeDomain: ['Bhang', 'Ginger', 'Cardamom', 'Cassia Fistula'],
    masteryGoods: ['Bhang'],
  },
  buddhist: {
    nameTemplates: [
      'Wayside Vihara of {patron}',
      'Stupa of the {patron} Master',
      'Wat {patron}',
    ],
    subTemplates: ['A small monastery in the bamboo grove', 'A pagoda on the headland', 'A forest vihara'],
    npcFirstNames: ['Bhikkhu Sumedha', 'Phra Ananta', 'Lama Tashi', 'Bhante Tissa', 'Bonze Wei'],
    roleTitles: ['bhikkhu', 'forest monk', 'wat-keeper', 'bonze'],
    patrons: ['Avalokiteshvara', 'Kuan Yin', 'Bodhi', 'Padmasambhava', 'Maitreya'],
    loreTemplate: "A small vihara dedicated to {patron} a half-day's walk from {place}. The {role} keeps the old herbal tradition — China root for skin, camphor for the head, tea for everything — and is content to grade a sample for tea or a bowl of rice.",
    knowledgeDomain: ['China Root', 'Camphor', 'Tea', 'Ginger'],
    masteryGoods: ['Camphor'],
  },
  'chinese-folk': {
    nameTemplates: [
      'Tudi Shrine of the {patron}',
      'Mazu Shrine of the {patron}',
      'Earth-God Shrine ({patron})',
    ],
    subTemplates: ['A small red shrine on the hill', 'A coastal Mazu shrine'],
    npcFirstNames: ['Master Wei', 'Old Lin', 'Keeper Cheung', 'Master Tan'],
    roleTitles: ['shrine-keeper', 'taoshi'],
    patrons: ['Eastern Hill', 'Southern Pass', 'Wave Mother', 'Old Banyan'],
    loreTemplate: "A small red shrine to the local tudi (earth god) of the {patron}, beyond {place}. The {role} keeps incense burning and a drawer of old herbal almanacs — China root, camphor, tea, dried ginseng substitutes from any plausible place.",
    knowledgeDomain: ['China Root', 'Camphor', 'Tea'],
    masteryGoods: ['China Root'],
  },
  animist: {
    nameTemplates: [
      'Sacred Grove of the {patron}',
      'Spirit-Pole of the {patron}',
      "{patron} Ancestor Shrine",
    ],
    subTemplates: ['A clearing of carved poles in the bush', 'A sacred grove at the spring'],
    npcFirstNames: ['Mama Aba', 'Tata Kofi', 'Elder Nomvula', 'Sangoma Lerato', 'Babalawo Fela'],
    roleTitles: ['sangoma', 'ritual elder', 'spirit-keeper'],
    patrons: ['Twin Ancestors', 'Spring-Mother', 'Old Baobab', 'Iron-Father', 'River-Spirit'],
    loreTemplate: "A clearing of carved poles in the bush beyond {place}. The {role} of the {patron} keeps the small fires and reads the ancestors' moods. Local materia — aloe of the cape, dried bark, animal parts — is read against complaints by smell and by song.",
    knowledgeDomain: ['Aloes', 'Hides', 'Horn'],
    masteryGoods: [],
  },
  jewish: {
    nameTemplates: [
      'Beit Knesset of {patron}',
      'Shtibl of Reb {patron}',
    ],
    subTemplates: ['A small synagogue in the trader’s quarter beyond town'],
    npcFirstNames: ['Rabbi Yehuda', 'Reb Ezra', 'Hakham David', 'Reb Shlomo'],
    roleTitles: ['hakham', 'shochet', 'shtibl-rabbi'],
    patrons: ['Rambam', 'Maharal', 'Abulafia', 'Cordoba', 'Tsfat'],
    loreTemplate: "A small Sephardic shtibl beyond {place}, kept by Reb {patron}'s line. The {role} grades materia medica with a tradition that runs from Cordoba through Salonica — theriac, mumia, the bezoar substitutes — and reads Galen in the original Greek when no one is watching.",
    knowledgeDomain: ['Theriac', 'Mumia', 'Bezoar Stones'],
    masteryGoods: ['Theriac'],
  },
};

// ── RNG (mulberry32, copied from neighboring files per AGENTS.md note) ──────

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

// Stable string hash → integer for seeding from port id.
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ── Per-port count by scale ─────────────────────────────────────────────────
//
// Probabilistic, capped at 2. Many ports get 0 — they're meant to feel
// uncommon, since shrines are one of several POI archetypes. Larger ports
// skew toward 1, with a meaningful tail at 2; smaller ports mostly get
// nothing.
//
// Approximate expected value per scale (Small 0.25 → Huge 1.20). Across the
// ~30-port world this lands ~22 shrines total — about half of the previous
// hard-count behavior.

function rollShrineCount(scale: string, rng: () => number): 0 | 1 | 2 {
  const r = rng();
  switch (scale) {
    case 'Small':
      // Mostly empty. Outposts like Socotra, Muscat, Cape feel sparse.
      return r < 0.25 ? 1 : 0;
    case 'Medium':
      if (r < 0.05) return 2;
      if (r < 0.50) return 1;
      return 0;
    case 'Large':
      if (r < 0.15) return 2;
      if (r < 0.65) return 1;
      return 0;
    case 'Very Large':
      if (r < 0.25) return 2;
      if (r < 0.85) return 1;
      return 0;
    case 'Huge':
      // London / Goa-tier. Almost always at least one; ~30% get two.
      if (r < 0.30) return 2;
      if (r < 0.90) return 1;
      return 0;
    default:
      return 0;
  }
}

// Pilgrimage scale is rare — at most 1 per port and only at Large+. Wayside
// is the most common. Bias the roll toward visible-but-modest village shrines
// so the world feels populated without inflating asset density.
function rollScale(rng: () => number, allowPilgrimage: boolean): ShrineScale {
  const r = rng();
  if (allowPilgrimage && r < 0.15) return 'pilgrimage';
  if (r < 0.55) return 'village';
  return 'wayside';
}

// Pick a faith from the port's faith list with a soft bias toward the most
// prominent (the first in the list). The PORT_FAITHS list is ordered by
// dominance, so the dominant faith carries the bulk of shrines.
function pickFaith(faiths: readonly Faith[], rng: () => number): Faith {
  if (faiths.length === 0) return 'catholic';
  if (faiths.length === 1) return faiths[0];
  const r = rng();
  if (r < 0.65) return faiths[0];
  if (r < 0.90) return faiths[1];
  return faiths[Math.min(2, faiths.length - 1)];
}

// ── Public generator ───────────────────────────────────────────────────────

export interface GeneratedShrines {
  /** POI definitions for the modal/marker pipeline. */
  pois: POIDefinition[];
  /** Synthetic spiritual buildings to inject into port.buildings. Each
   *  carries `poiId` referencing its POI; the renderer uses faith + geometryScale. */
  buildings: Building[];
}

export function generateShrinesForPort(
  port: Pick<Port, 'id' | 'name' | 'scale' | 'position' | 'buildings'>,
  worldSeed: number,
): GeneratedShrines {
  const faiths = faithsForPort(port.id);
  if (faiths.length === 0) return { pois: [], buildings: [] };

  // Roll the shrine count first so RNG state advances deterministically even
  // when the count is 0 — keeps subsequent generators (future ruins, etc.)
  // stable per worldSeed when shrine counts shift.
  const rng = mulberry32((worldSeed * 9001) ^ hashStr(port.id) ^ 0xa5a5);
  const target = rollShrineCount(port.scale, rng);
  if (target === 0) return { pois: [], buildings: [] };
  const allowPilgrimage = port.scale === 'Large' || port.scale === 'Very Large' || port.scale === 'Huge';

  const portX = port.position[0];
  const portZ = port.position[2];

  const pois: POIDefinition[] = [];
  const buildings: Building[] = [];

  // Same hinterland-band placement parameters as hinterlandScenes — keeps
  // shrines visually consistent with other rural sites and avoids placing
  // them on city footprints.
  const MIN_DIST = 115;
  const MAX_DIST = 215;
  const BUILDING_CLEAR = 35;
  const SHRINE_SPACING = 60;

  let placedPilgrimage = false;
  let attempts = 0;
  while (pois.length < target && attempts < 80) {
    attempts++;
    const angle = rng() * Math.PI * 2;
    const dist = MIN_DIST + rng() * (MAX_DIST - MIN_DIST);
    const x = portX + Math.cos(angle) * dist;
    const z = portZ + Math.sin(angle) * dist;

    // Building / shrine clearance
    let tooClose = false;
    for (const b of port.buildings) {
      const dx = b.position[0] - x;
      const dz = b.position[2] - z;
      if (dx * dx + dz * dz < BUILDING_CLEAR * BUILDING_CLEAR) { tooClose = true; break; }
    }
    if (tooClose) continue;
    for (const prev of buildings) {
      const dx = prev.position[0] - x;
      const dz = prev.position[2] - z;
      if (dx * dx + dz * dz < SHRINE_SPACING * SHRINE_SPACING) { tooClose = true; break; }
    }
    if (tooClose) continue;

    // Terrain check — must be on land, not in the ocean
    const terrainY = getTerrainHeight(x, z);
    if (terrainY < SEA_LEVEL + 0.4) continue;

    // Compose variant
    const faith = pickFaith(faiths, rng);
    const scale: ShrineScale = (() => {
      const s = rollScale(rng, allowPilgrimage && !placedPilgrimage);
      if (s === 'pilgrimage') placedPilgrimage = true;
      return s;
    })();
    const content = FAITH_CONTENT[faith];
    if (!content) continue;

    const patron = pick(content.patrons, rng);
    const role = pick(content.roleTitles, rng);
    const npcName = pick(content.npcFirstNames, rng);
    const name = pick(content.nameTemplates, rng).replace('{patron}', patron);
    const sub = pick(content.subTemplates, rng);
    const lore = content.loreTemplate
      .replace('{role}', role)
      .replace('{patron}', patron)
      .replace('{place}', port.name);

    // Knowledge domain trims at smaller scales — wayside shrines hold one
    // expertise; village holds most; pilgrimage holds the full domain plus
    // mastery on the keystone good.
    const fullDomain = content.knowledgeDomain;
    const knowledgeDomain = scale === 'wayside'
      ? fullDomain.slice(0, 1)
      : scale === 'village'
        ? fullDomain.slice(0, Math.max(2, fullDomain.length - 1))
        : fullDomain;
    const masteryGoods = scale === 'pilgrimage' ? content.masteryGoods : [];

    const id = `${port.id}-shrine-${pois.length}-${faith}`;
    const location: POILocation = { kind: 'hinterland', position: [x, z] };

    pois.push({
      id,
      name,
      sub,
      kind: 'shrine',
      class: 'religious',
      port: port.id,
      location,
      knowledgeDomain,
      masteryGoods,
      cost: scale === 'wayside'
        ? { type: 'gold', amount: 15 }
        : scale === 'village'
          ? { type: 'gold', amount: 40 }
          : { type: 'gold', amount: 80 },
      npcName: `${npcName}`,
      npcRole: role,
      lore,
    });

    // Synthetic spiritual building. Position Y uses terrain at the picked
    // (x, z) so the renderer puts the shrine on the ground, not floating.
    //
    // RNG ordering matters for determinism: rotation rolls FIRST so adding
    // the variant axes (5 rng() calls below) doesn't shift the rotation
    // values for shrines with the same world seed. Variant must remain the
    // last rng() consumer in this loop iteration so future axes can be
    // appended after it without rippling back into earlier shrines.
    const footprint = SCALE_FOOTPRINT[scale];
    const rotation = rng() * Math.PI * 2;
    const variant = rollShrineVariant(rng, scale);
    buildings.push({
      id,
      type: 'spiritual',
      position: [x, terrainY, z],
      rotation,
      scale: footprint,
      faith,
      label: name,
      labelSub: sub,
      labelEyebrow: 'RELIGIOUS',
      labelEyebrowColor: '#c4a1ff',
      district: 'sacred',
      poiId: id,
      geometryScale: SCALE_GEOMETRY[scale],
      shrineVariant: variant,
    });
  }

  return { pois, buildings };
}

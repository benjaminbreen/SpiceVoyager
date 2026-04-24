# NPC Ship Hail System — Design Plan

## Goal

Transform the current hail encounter from a three-button single-response panel into a **state-driven procedural dialogue system** that feels like meeting a specific person in a specific place on a specific day — without any LLM involvement. All variation emerges from world state, captain identity, and player history, authored once and composed at runtime.

## Design philosophy

Every interesting question the hail system asks reduces to one operation: **score a set of candidates against a context, pick the best (or weighted-random among top N)**. If we build that primitive well, the rest is data authoring.

Questions this unifies:
- How does this captain feel about the player right now?
- Which conversation topics are available?
- Which phrase variant do we use for the greeting?
- Did the player's crew understand what was said?
- Which rumor does the captain volunteer?

All of them are `pick(candidates, context) → candidate`. That's the architectural spine.

## Current state (baseline to preserve)

The existing hail system is fully functional within its scope — see `src/components/UI.tsx:2832-3045` (`HailPanel`), `src/utils/npcShipGenerator.ts:715-762` (`generateNPCShip`), and `src/components/UI.tsx:2797-2813` (`UNTRANSLATED_HAIL`). It has:

- 20 ship traditions with weighted captain-name and language pools
- Mood enum derived from faction reputation
- Translator lookup via crew role/charisma/skill ranking
- Native-script fallback phrases in 15 languages
- Three actions: News / Trade / Bearing
- Stable-hash selection so a single hail session is consistent

Do not break any of this. The plan is additive: new layers slot in underneath the existing UI, and the UI reads from richer data.

## Simplifications up front

Before specifying subsystems, six choices that collapse what would otherwise be parallel systems:

1. **Single scoring primitive.** Disposition, topic availability, phrase selection, and rumor choice all use one `pick<T>(candidates, context)` function with weighted predicates. No per-subsystem bespoke logic.

2. **Rumors replace the "News" action entirely.** Don't maintain both a handcrafted news pool and a rumor ledger. News *is* rumor transfer. One data source, two surfaces (hail + tavern later).

3. **Traits are data.** A captain trait is a bundle of `(predicate, weight-modifier)` entries, not a code branch. Adding a trait means writing a row, not editing logic.

4. **Phrasebook is flat with tags, not tree-per-tradition.** Each phrase variant carries tags like `{slot: "greet.friendly", tradition: ["portuguese", "spanish"], trait: ["devout"]}`. The scorer filters by tags. This avoids duplicating a phrase tree for every tradition.

5. **Disposition is a single signed score, with named contributors kept only for debug and topic gating.** The player never sees a vector; downstream code only cares about the number and, occasionally, which contributor dominates.

6. **Encounter log is capped and summarized.** Store at most the last 3 encounters per NPC identity, plus an aggregate tally (`timesTraded`, `timesFought`, `lastOutcome`). Don't grow state forever.

## Data model

### NPCShipIdentity (extend existing)

```ts
// src/utils/npcShipGenerator.ts
interface NPCShipIdentity {
  // ...existing fields...
  identityKey: string;          // stable hash for memory lookup (tradition + captainName + shipName)
  traits: CaptainTrait[];       // 2-3 rolled once at generation
  portraitSeed: number;         // for future portrait system; set now so re-encounters are stable
  originPort: PortId;           // where last departed — drives cargo hints + rumors they carry
  destinationPort: PortId | null; // where they're bound; null = unknown
  carriedRumors: RumorId[];     // picked up from originPort when generated
}
```

### CaptainTrait

```ts
// src/utils/hail/traits.ts  (new)
type CaptainTrait = {
  id: string;                          // 'devout' | 'greedy' | 'proud' | 'cautious' | 'drunkard' | 'veteran' | 'green' | 'scarred'
  dispositionMods: DispositionMod[];   // e.g. +8 vs heretic flags if devout
  topicMods: TopicMod[];               // e.g. proud captain always refuses tribute demand
  phraseTags: string[];                // expands the tag pool for phrase lookup
};
```

Traits are declared in a single file (`traits.ts`) as data. Generator rolls from a tradition-weighted pool.

### EncounterLog (per identity)

```ts
// Lives in gameStore.ts, keyed by identityKey.
interface EncounterRecord {
  day: number;
  action: 'traded' | 'fought' | 'fled' | 'hailed' | 'ignored' | 'tributed';
  outcome: 'good' | 'neutral' | 'bad';
  dispositionDelta: number;
}
interface EncounterMemory {
  records: EncounterRecord[];   // cap at 3, roll oldest out
  timesTraded: number;
  timesFought: number;
  lastSeenDay: number;
}
```

### RumorLedger (new global state)

```ts
// src/utils/hail/rumors.ts  +  slice in gameStore.ts
interface Rumor {
  id: string;
  kind: 'plague' | 'blockade' | 'wreck' | 'war' | 'famine' | 'windfall' | 'pirate' | 'edict';
  subjectPort: PortId | null;     // where it happened
  subjectFaction: Nationality | null;
  postedDay: number;
  decayDay: number;               // removed from ledger after this
  severity: 1 | 2 | 3;            // drives phrasing intensity
  phraseKey: string;              // selector into the phrasebook
  gameplayEffect?: RumorEffect;   // optional: modifies port prices, reputation drifts
}
```

A rumor propagates via geography: when a captain is generated with `originPort`, they pick up rumors whose `subjectPort` is within N travel days of that port. When a hail resolves, active rumors they carry transfer to the player's journal and may update the player's price expectations.

### LanguageProficiency (replace current `Language[]`)

```ts
// crewGenerator.ts
type Proficiency = 0 | 1 | 2 | 3;  // none, smatter, conversational, fluent
interface CrewMember {
  // ...existing...
  languages: Partial<Record<Language, Proficiency>>;
}
```

Default fluent in mother tongue, conversational in 0–2 others, smatter in 0–3 more depending on role and nationality. Migrating the existing crew generator is straightforward: today's `languages: Language[]` becomes a map with all listed languages at `3` (fluent).

### Cognate matrix (sparse)

```ts
// src/utils/hail/cognates.ts
// Only interesting pairs listed; all others default to 0.
const COGNATES: Partial<Record<`${Language}-${Language}`, number>> = {
  'Portuguese-Spanish': 0.6,
  'Spanish-Portuguese': 0.6,
  'Portuguese-Italian': 0.35,
  'Hindustani-Gujarati': 0.7,
  'Arabic-Persian': 0.3,
  'Malay-Swahili': 0.1,       // trade pidgin overlap, low
  'Dutch-English': 0.3,
  // ... ~20 pairs total
};
```

Effective proficiency for language L given crew's best proficiency in any known language L': `max(profInL, max over L' of profInL' * cognate(L', L))`, then floored to tier.

### PhraseBook

```ts
// src/utils/hail/phrasebook.ts
interface PhraseVariant {
  text: string;                           // may contain {slot} placeholders for nested expansion
  tags: {
    slot: string;                         // 'greet' | 'greet.friendly' | 'oath_mild' | 'address_peer' | ...
    tradition?: ShipTraditionId[];        // which traditions can use this
    disposition?: ('hostile' | 'cold' | 'neutral' | 'warm' | 'allied')[];
    trait?: string[];                     // required captain traits
    playerFlag?: Nationality[];           // e.g. "herege" only when player is heretic-from-portuguese perspective
    rumorKind?: Rumor['kind'][];          // when slot is rumor-gossip
    season?: ('monsoon_sw' | 'monsoon_ne' | 'dry' | 'winter')[];
    year?: { min?: number; max?: number };
  };
  weight?: number;                        // default 1
}
```

One flat list, hundreds of entries, filtered by scorer per call. Easier to author than trees, easier to re-balance.

## Subsystems

### 1. Disposition

Computed at hail-open, stored on the open panel state (not on the NPC — it's contextual).

```ts
function computeDisposition(npc, player, world): DispositionResult {
  const contributors = [
    factionStance(npc.flag, player.flag, world.conflicts),        // ±25
    personalHistory(world.encounterMemory[npc.identityKey]),      // ±20
    cargoInterest(npc.cargo, player.cargo, world.nearbyPrices),   // ±10
    relativeForce(npc.armed, npc.crewCount, player.shipStats),    // ±10 (bullies: force → +disp if you're stronger and mood was friendly, -disp if hostile)
    crewKinship(npc.flag, player.crew.map(c => c.nationality)),   // ±5
    situational(world.dayOfYear, world.distanceToFriendlyPort),   // ±5
    traitMods(npc.traits, player, world),                         // trait-specific
  ];
  const score = sum(contributors) / (contributors.length);        // bounded naturally
  return { score, bucket: toBucket(score), contributors };
}
```

`bucket` ∈ `{hostile, cold, neutral, warm, allied}` — replaces the existing mood enum. `contributors` are kept around for topic gating ("was cargoInterest a dominant contributor? then unlock cargo-trade topic even if bucket is cold") and for debug tooltips.

### 2. Topic menu

```ts
function availableTopics(disposition, npc, player, world, comprehension): Topic[] {
  return TOPICS
    .filter(t => t.predicate(disposition, npc, player, world, comprehension))
    .map(t => ({ ...t, score: t.score(disposition, npc, player, world) }))
    .sort(byScore).slice(0, 4);   // show at most 4
}
```

Each topic is a data row:

```ts
const TOPICS: Topic[] = [
  { id: 'rumor',          predicate: (d,n)   => n.carriedRumors.length > 0,
                           score:     (d)    => 3 + (d.bucket !== 'hostile' ? 2 : 0) },
  { id: 'trade_provisions', predicate: (d,n,p) => d.bucket !== 'hostile' && (n.morale > 0.6 || p.provisions < 10),
                           score:     ()    => 2 },
  { id: 'trade_cargo',    predicate: (d,n,p,w,c) => c.understood && dominantContributor(d) === 'cargoInterest',
                           score:     (d)    => 4 },
  { id: 'ask_bearing',    predicate: (d,_n,p,w) => w.undiscoveredPortsNearby(p.position).length > 0 && d.bucket !== 'hostile',
                           score:     ()    => 2 },
  { id: 'ask_after',      predicate: (_d,n,p) => p.metCrewFromTradition(n.flag),
                           score:     ()    => 1 },
  { id: 'demand_tribute', predicate: (d,n,p) => relativeForce(p,n) > 15 && d.bucket !== 'allied',
                           score:     ()    => 3 },
  { id: 'offer_tribute',  predicate: (d,n,p) => relativeForce(p,n) < -15 && d.bucket === 'hostile',
                           score:     ()    => 4 },
  { id: 'invoke_enemy',   predicate: (_d,n,p,w) => sharedEnemy(n.flag, p.flag, w.conflicts),
                           score:     ()    => 2 },
  { id: 'wreck_inquiry',  predicate: (_d,n,_p,w) => w.recentWrecksNear(n.position, 100, 7).length > 0,
                           score:     ()    => 1 },
];
```

The menu is *emergent*. Two hails in a row look different because world state has shifted.

Each topic has its own resolver that produces text via the phrasebook and may mutate world state (transferring a rumor, opening a trade modal, applying reputation delta, creating an encounter log entry).

### 3. Rumor ledger

Global store, posted to by world events:

```ts
// gameStore slice
interface RumorSlice {
  active: Rumor[];
  post(r: Omit<Rumor, 'id'>): void;
  decay(currentDay: number): void;     // called on day tick
  near(port: PortId, maxDays: number): Rumor[];   // for NPC generation
}
```

Seed three rumor sources in phase 2:
- **Price anomaly detector** — a port with ±40% price move on any commodity posts a `windfall` or `famine` rumor.
- **Player actions** — sinking a ship, sacking a port, bribing an official all post rumors with the player as subject (or anonymous if low visibility).
- **Authored event calendar** — a small JSON of historical 1612 events that fire on matching dates (e.g. Tokugawa edicts, Dutch-Portuguese skirmishes). Decays after 60 days.

On `generateNPCShip`, pick 1–3 rumors from `near(originPort, maxDays: 30)`.

### 4. Language comprehension

Replace `pickTranslator` returning a single crew member with `computeComprehension`:

```ts
function computeComprehension(crew, language): {
  tier: Proficiency;
  translator: CrewMember | null;
  cognateBoost: boolean;   // did the best tier come from a cognate, not the language itself?
} {
  let best = 0, translator = null, viaCognate = false;
  for (const c of crew) {
    for (const [lang, prof] of Object.entries(c.languages)) {
      const effective = lang === language ? prof : prof * cognate(lang, language);
      const tiered = Math.floor(effective) as Proficiency;
      if (tiered > best) { best = tiered; translator = c; viaCognate = lang !== language; }
    }
  }
  return { tier: best, translator, cognateBoost: viaCognate };
}
```

Then rendering:

- **tier 3 (fluent):** text fully translated.
- **tier 2 (conversational):** text translated, but one slot per sentence is rendered in native script ("The captain says he comes from ░░░░░░ bound for Malacca"). Pick the slot by lowest-importance rule.
- **tier 1 (smatter):** only topic *category* is readable; text is half native-script. Topics available: limited to rumor (compressed to one line), trade_provisions only.
- **tier 0 (none):** existing UNTRANSLATED_HAIL behavior, PLUS a new **Parley** action that rolls charisma + 1d20 against a target. Success unlocks a minimal 2-topic menu (trade provisions at −30% rate, warn of danger).

Hidden **exposure counter** per (crew member, language): every tier-0 encounter increments it. At thresholds (e.g. 5, 15, 40) a charisma roll grants a tier bump. Crew *learn* at sea. Over a long voyage through unfamiliar waters, your factor picks up smatter of Malay and eventually haggles directly.

### 5. Phrase selection

One function:

```ts
function renderPhrase(slot, context): string {
  const candidates = PHRASEBOOK.filter(v => matchesTags(v.tags, slot, context));
  const variant = weightedPick(candidates, stableHash(context), c => c.weight ?? 1);
  return expand(variant.text, context);   // recursively fill nested {slot}
}
```

`expand` resolves nested `{oath_mild}` or `{address_peer}` by calling `renderPhrase` recursively with the same context. A greeting template like:

```
"{oath_mild}, {address_peer}. Fair winds from {their_lastPort}, though {condition_comment}."
```

Produces a fresh combination each encounter, all type-safe and anachronism-free because the author picked every phrase.

Authoring bootstrap:
- Start with **Portuguese** and **Dutch** tradition-tagged phrases (most common NPCs in the current game). ~30 slots × 3–5 variants each.
- Other traditions inherit from a neutral pool tagged `tradition: undefined` (matches all) until explicitly authored.
- This way the system ships working on day 1 with partial authoring, and each authored batch improves specific traditions visibly.

### 6. Encounter memory

Panel open → if `encounterMemory[identityKey]` exists, inject its summary into the context so the phrasebook can surface variants tagged `encounter: "repeat"`:

> "You again. Last we met off Hormuz — you overpaid for my nutmeg. God bless fools."

Panel close (on action resolve) → append an `EncounterRecord`, cap to 3.

### 7. Cargo hints

Replace the current "show cargo list" with a fuzzy hint string computed at panel-open:

```ts
function cargoHint(npc, player): string {
  const draftRatio = totalMass(npc.cargo) / shipCapacity(npc.shipType);
  const topSmell = dominantCommodity(npc.cargo);
  const playerSkill = best(player.crew, c => c.skills.trade ?? 0);
  const precision = clamp(playerSkill / 10, 0, 1);

  if (draftRatio < 0.2) return "She rides high — empty holds or fool's ballast.";
  if (precision > 0.7) return `Sitting ${draftRatio > 0.7 ? 'deep' : 'steady'}, smells of ${topSmell.scent}.`;
  return `Sits ${draftRatio > 0.7 ? 'low' : 'easy'} in the water.`;
}
```

Commodities get a `scent` field (clove → "clove and tar"; pepper → "dry spice and rope"; silk → "clean and perfumed"; iron → "rust and oil"). Adds a small data row to each commodity, no system change.

## Text generation flow (end-to-end)

On hail open:

1. Resolve `comprehension = computeComprehension(crew, npc.hailLanguage)`.
2. Resolve `disposition = computeDisposition(npc, player, world)`.
3. Build `context = { npc, player, world, disposition, comprehension, memory: encounterMemory[npc.identityKey], seed: stableHash(npc.identityKey, day) }`.
4. Render greeting: `renderPhrase('greet', context)`.
5. Build `topics = availableTopics(...)`.
6. Render panel: header (flag, ship, captain), greeting, translator line, topic buttons.

On topic click:

1. Resolver runs: mutates state (rumor transfer, reputation delta, gold change, encounter log append), selects phrase slot for response.
2. Response text rendered via `renderPhrase(topic.responseSlot, context)`.
3. Topic is marked used (same as today). Player may click another topic or Sail On.

On panel close:

1. Append encounter record.
2. Rumors carried by NPC that player interacted with get transferred to player journal.
3. Exposure counters updated.

## Gameplay consequences (why depth pays off)

- **Language becomes a strategic dimension.** Hiring polyglot crew has measurable value; sending exploratory voyages with a linguist matters. Parley rolls introduce genuine risk at first contact.
- **Rumor networks are spatial.** News travels at the speed of ships; you can scoop price changes by getting rumors fresh. Port price anomalies propagate outward, making early arrival profitable.
- **Reputation is legible through behavior, not a number.** "Your reputation precedes you" is authored phrasing that fires when the captain's `personalHistory` contributor dominates disposition.
- **Faction war feels real.** When Dutch-Portuguese conflict is active, every Portuguese captain you hail reads cold, references it, and may refuse topics they'd otherwise offer.
- **Encounters have continuity.** Same captain remembered across a campaign is the cheapest possible "character" — the world accumulates small relationships.

## Build phases

Each phase is independently shippable and leaves the system better than it found it.

### Phase 1 — Foundation (no user-visible change yet)

- Add `identityKey`, `traits`, `portraitSeed`, `originPort`, `destinationPort`, `carriedRumors` to `NPCShipIdentity`.
- Add `EncounterMemory` store slice, keyed by `identityKey`.
- Add `RumorLedger` store slice, empty.
- Migrate `crewMember.languages` to proficiency map (default all existing to 3).
- Keep UI behavior identical. Ship. Verify no regressions.

### Phase 2 — Disposition vector + topic emergence

- Implement `computeDisposition` with all contributors.
- Implement `TOPICS` data rows + `availableTopics`.
- Replace hardcoded News/Trade/Bearing with topic resolvers, preserving their behavior as three of the topic rows.
- New topics gated off until their subsystems land (trade_cargo, invoke_enemy, wreck_inquiry shipped as no-ops).
- Visible change: menu shows 1–4 buttons depending on state; richer unlock conditions.

### Phase 3 — Rumor ledger

- Price anomaly detector posts rumors on day tick.
- NPC generation picks up rumors near origin port.
- "Rumor" topic resolver transfers to player journal.
- Retire the hardcoded news phrase pool.
- Authored event calendar for 1612 (small JSON).

### Phase 4 — Phrasebook refactor

- Move all hardcoded greetings + responses into tagged `PhraseBook` entries.
- Author Portuguese + Dutch tradition tags in depth.
- Implement `renderPhrase` with slot expansion and stable-hash selection.
- Other traditions inherit from neutral pool; author incrementally over subsequent commits.

### Phase 5 — Language gradient + Parley

- Implement cognate matrix.
- Implement tiered rendering (partial native-script interpolation at tier 2; heavier at tier 1).
- Add Parley action at tier 0 with charisma roll.
- Exposure counter increments + threshold bumps for crew self-learning.

### Phase 6 — Traits + memory

- Roll traits at NPC generation from tradition-weighted pools.
- Wire trait `dispositionMods` and `topicMods` into their scorers.
- Append phrasebook entries tagged by trait.
- Encounter memory used for re-meet greeting variants.

### Phase 7 — Cargo hint + polish

- Add `scent` field to commodities.
- Replace manifest display with fuzzy hint.
- Skill-roll precision band.

## Files to create

```
src/utils/hail/
  traits.ts          — CaptainTrait data rows + pool weights per tradition
  rumors.ts          — Rumor type, seed event calendar, propagation helpers
  cognates.ts        — sparse cognate matrix
  phrasebook.ts      — PhraseVariant[] flat list
  topics.ts          — Topic data rows with predicate + score + resolver
  disposition.ts     — computeDisposition, contributors
  comprehension.ts   — computeComprehension, exposure counter helpers
  render.ts          — renderPhrase, expand, stableHash
  types.ts           — shared types (DispositionResult, Topic, Comprehension, PhraseVariant)
```

## Files to modify

- `src/utils/npcShipGenerator.ts` — extend `NPCShipIdentity`, roll traits + rumors on generation
- `src/utils/crewGenerator.ts` — switch to proficiency map
- `src/components/UI.tsx` (HailPanel) — consume new computed context, render via phrasebook
- `src/store/gameStore.ts` — add `encounterMemory` and `rumorLedger` slices
- `AGENTS.md` — add pointer to this plan under "Planned / in progress"

## What's explicitly out of scope

- **Captain portraits.** Good idea, separate plan. `portraitSeed` is added now so the future portrait system has a stable input.
- **LLM-generated follow-ups.** Explicitly not pursued; the grammar-and-state approach supersedes.
- **Multi-turn branching dialogue trees.** The emergent topic menu replaces this; branching would add authoring cost without commensurate depth.
- **Combat resolution from hail.** The hail can *lead to* combat (hostile greeting + aggressive action) but combat itself lives in its existing system.

## Open questions

- **Rumor visibility.** Should the player have a "rumors" journal tab, or do rumors just flavor prices and news feed? Leaning: journal tab, filterable by kind and age.
- **Trait count.** Start with 8 traits listed above, or author ~15 for more variety? Leaning: start 8, expand in Phase 6 with authoring.
- **Cognate tuning.** The matrix values are historically plausible guesses; will need playtesting to tune comprehension tier thresholds.
- **Performance.** Phrasebook linear scan per render is fine at current scale (a few hundred phrases, ≤10 hails per session). If it grows past ~2k phrases, index by slot. Not a day-one concern.

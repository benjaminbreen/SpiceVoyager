# Agent Notes — Merchant of the Indian Ocean

## Reputation System

A per-nationality reputation system tracks the player's standing with each faction (-100 to +100, starts at 0).

### Where it lives
- **State**: `reputation: Partial<Record<Nationality, number>>` in `src/store/gameStore.ts`
- **Actions**: `adjustReputation(nationality, delta)`, `getReputation(nationality)` in game store
- **Port mapping**: `PORT_FACTION` dict in `src/store/gameStore.ts` maps port IDs to controlling nationality

### What moves reputation
- **Collisions with NPC ships**: -5 per collision (in `NPCShip.tsx`)
- **Shooting NPC ships**: -15 per hit (in `ProjectileSystem` in `Game.tsx`)
- **Trading at ports** (buy or sell): +2 per transaction, based on port's controlling faction
- **Hailing NPC ships** (pressing T): +1 per hail

### How it surfaces
- **NPC hail dialogue**: `getHailResponse()` in `Game.tsx` — responses vary from hostile (<-60) to warm (>60) based on the NPC's faction reputation. Uses captain name and ship name from `NPCShipIdentity`.
- **Journal entries**: Auto-generated at threshold crossings (-60, -25, +25, +60) via `adjustReputation()`.
- **Ship Dashboard**: NOT YET IMPLEMENTED — planned for after dashboard redesign.

### Key state: `nearestHailableNpc`
- `NPCShip.tsx` sets `nearestHailableNpc` in the store when the player enters hail range
- `Game.tsx` reads it on T keypress to generate reputation-aware dialogue
- Cleared when player leaves hail range

### NPC Alert Mode
- On collision, NPC ships enter alert mode for 8 seconds (orange ring, 2.5x flee speed)
- Controlled by `alertUntil` ref in `NPCShip.tsx`
- Visual: orange `<ringGeometry>` around the ship, pulsing opacity
- UI: `CollisionBanner` in `UI.tsx` shows a top-center warning with the ship's `appearancePhrase`

## Combat System

### Swivel Gun (default weapon)
- **Aiming**: Mouse cursor controls aim direction. `CameraController` raycasts mouse onto y=0 water plane, writes to `mouseWorldPos` and `swivelAimAngle` in `src/utils/combatState.ts`.
- **Visual**: `swivelPivotRef` group in `Ship.tsx` — barrel + mount at bow, rotates to match aim angle in combat mode, hidden otherwise.
- **Firing**: Spacebar in combat mode (handled in `InteractionController` in `Game.tsx`). Gated by `WEAPON_DEFS.swivelGun.reloadTime` (2s). Consumes 1 Cannonball from cargo.
- **Projectile**: Spawned via `spawnProjectile()` in `combatState.ts`. Rendered by `ProjectileSystem` in `Game.tsx` using instanced mesh (max 10). Gravity arc, 2.5s flight time.

### Hit Detection
- `ProjectileSystem` checks projectile positions against `npcLivePositions` map (updated every frame by each `NPCShip`).
- Hit radius: 4 units. On hit: `sfxCannonImpact()`, -15 reputation, notification, NPC enters 10s alert/flee mode via `hitAlert` flag.
- Misses that hit water (y < 0): `sfxCannonSplash()`.

### Ammo
- **Swivel gun**: No ammo cost — uses cheap lead shot, historically crews cast their own.
- **Broadside cannons** (future): Will consume `cargo.Cannonballs`. Banner already shows cannonball count when `stats.cannons > 0`.

### Sound Effects
- `sfxCannonFire()` — boom + noise burst + metallic ping
- `sfxCannonImpact()` — thud + wood splinter noise
- `sfxCannonSplash()` — water splash noise

### Key files
- `src/utils/combatState.ts` — shared mutable state (mouse pos, aim angle, projectiles, NPC live positions)
- `Game.tsx` → `ProjectileSystem` — renders projectiles, hit detection
- `Game.tsx` → `InteractionController` — spacebar fire handler
- `Game.tsx` → `CameraController` — mouse raycast for aiming
- `Ship.tsx` — swivel gun visual + aim rotation
- `NPCShip.tsx` — updates `npcLivePositions`, reads `hitAlert` for flee behavior

## Knowledge & Information Asymmetry System

The core expansion mechanic: the player doesn't automatically know what trade goods are. Goods exist on a **knowledge spectrum** from unrecognized to expert-level understanding, and knowledge is acquired through layered sources — tavern gossip, POI visits, broker consultations, and rare permanent crew hires. This mirrors the real historical experience of European merchants in the Indian Ocean c. 1600–1650, where identifying, sourcing, and understanding drugs/spices/medicines was the fundamental challenge of the trade.

### Design Philosophy

The information asymmetry is the game. A port market might show 15 goods; the player recognizes 5. The rest appear as evocative physical descriptions ("a pungent dried seed," "a dark resinous substance"). The player can still buy unknown goods — gambling on them being valuable — but trades with knowledge advantage when goods are identified. This makes knowledge acquisition the primary progression system alongside wealth.

Fraud/deception is part of the system: tavern rumors can be wrong, brokers can cheat you, and goods themselves can be adulterated (painted bark sold as cinnamon, cut opium). The player discovers fraud when they try to sell — the good is revealed as worthless or worth far less than expected.

### Knowledge Levels

Each good has a per-player knowledge level (0–3), stored in game state:

| Level | What the player sees | How it's acquired |
|-------|---------------------|-------------------|
| **0 — Unrecognized** | Physical description only: "a fragrant reddish bark," "small dried flower buds." No name, no price guidance. Can still buy blind. | Default for goods outside the player's cultural knowledge |
| **1 — Rumored** | Category hint: "some kind of pepper," "a resin used in incense." Vague price range. | Tavern gossip, dockside observation, partial POI info |
| **2 — Identified** | Full name revealed (e.g., "Long Pepper — *Piper longum*"). Base price visible. Origin and primary markets known. | POI visits, broker consultation, knowledgeable crew |
| **3 — Expert** | Medicinal/ritual uses, adulteration risks, best markets, seasonal availability. Unlocks premium sale prices and related quests. | Specialized POIs (naturalists, temple physicians), crew with domain expertise, or accumulating multiple Level 2 fragments about the same good |

### Starting Knowledge

The player starts with knowledge based on their origin/nationality (already tracked in crew system):
- **English captain**: Level 2 on European-familiar goods (Pepper, Cotton Textiles, Iron, Timber, Tea). Level 1 on widely-traded goods (Cinnamon, Indigo, Coffee). Level 0 on most Asian-specific goods (Nutmeg, Cloves, Camphor, Bezoar, Bangue, etc.).
- Starting crew (generated via `generateStartingCrew()` in `crewGenerator.ts`) contribute their own knowledge domains, so a starting Gujarati lascar might give Level 1 on western Indian Ocean goods immediately.

### Knowledge Acquisition Sources (Tiered)

#### Tier 1 — Casual / Free / Low Cost

**Tavern gossip** (existing tavern tab in PortModal):
- Free, available at every port.
- Gives Level 0→1 on 1–3 random goods available at the current port or nearby ports.
- **Unreliable**: ~20% chance the information is wrong (identifies a good incorrectly, claims false medicinal properties, or points to a nonexistent trade route).
- Flavor: NPC dialogue snippets. "A Banyan merchant told me the dark paste from Bengal brings visions and dulls pain." (Opium — but might be wrong.)
- Can also reveal: existence of nearby POIs, rumors about distant ports, warnings about piracy.

**Dockside observation** (passive, triggered on port arrival):
- The player automatically observes what other ships are loading/unloading.
- Gives category-level hints: "Gujarati dhows are loading heavy sacks from the spice warehouse" → hints that the port produces bulk spices.
- No direct good identification, but narrows possibilities.

#### Tier 2 — Moderate Cost / Effort

**POI visits** (new system, see POI section below):
- Visiting a temple, monastery, naturalist, merchant guild, or ruin.
- Gives reliable Level 1→2 identification on goods within the POI's knowledge domain.
- Some POIs can give Level 3 on specific goods in their specialty.
- Costs: time (travel to the POI), sometimes a gift/payment, sometimes trading a good you have for analysis.
- Example: A Hindu temple physician near Calicut can identify Ayurvedic medicinal goods (Cardamom, Turmeric, Neem, Bangue) to Level 2, and if you bring him a sample of an unknown substance, he might identify it or tell you where to learn more.

**Broker/factor consultation** (new tab or interaction in PortModal):
- Pay a local intermediary to identify goods currently in the port's market.
- Cost scales with port size and number of goods identified.
- **Temporary**: the broker identifies what's here NOW. You don't retain the knowledge when you leave — unless you write it in your journal (see Journal section). Essentially the broker gives you Level 2 for the duration of your port visit.
- The broker's reliability depends on the port: a major trading hub (Malacca, Surat) has reliable brokers; a small port (Socotra) might have a broker who's guessing.
- Brokers can also be bribed to reveal what rival merchants are buying, or to spread disinformation to other traders (future feature).

#### Tier 3 — Rare / Expensive / Permanent

**Hiring a knowledgeable crew member** (extension of existing crew hire system in `generateHireableCrewMember()`):
- Rare: not always available. A port might have 0–1 knowledgeable hires at any time.
- Expensive: 2–5x normal crew hire cost.
- Takes a crew slot (crew slots are limited).
- **Permanent knowledge**: as long as this crew member is aboard, their knowledge domain goods are identified at Level 2 (or Level 3 for their specialty).
- If the crew member leaves, dies, or is dismissed, the knowledge stays at whatever level the player has independently acquired — you lose the crew member's bonus.
- Crew knowledge domains (extend `CrewMember` interface):

| Crew Background | Knowledge Domain | Level 2 Goods | Level 3 Specialty |
|-----------------|-----------------|---------------|-------------------|
| Gujarati factor | Western Indian Ocean trade | Pepper, Cotton, Indigo, Opium, Calico, Saltpeter | Market prices & adulteration detection |
| Malay navigator | Southeast Asian goods | Cloves, Nutmeg, Mace, Camphor, Benzoin, Tin | Origin sourcing, seasonal availability |
| Arab merchant | Red Sea / East African trade | Frankincense, Myrrh, Coffee, Ambergris, Slaves | Trade route knowledge, caravan connections |
| Chinese trader | East Asian goods | Porcelain, Silk, Tea, Rhubarb, Musk, Lacquerware | Quality grading, imperial demand cycles |
| Portuguese naturalist | European pharmacopoeia | Can upgrade any Level 2 good to Level 3 | Medicinal classification, Galenic properties |
| Swahili pilot | East African coast | Ivory, Gold, Tortoiseshell, Copal, Mangrove Poles | Coastal navigation, monsoon timing |
| Tamil pearl diver | Pearl fisheries, gems | Pearls, Gems, Coral, Chanks | Quality grading, diving site knowledge |

### The Journal System

The player accumulates knowledge fragments in a **journal** (new UI component, accessible from ship dashboard). This is the Dampier's-notebook mechanic.

- Each knowledge fragment is a short text entry tied to a good, with its source and reliability noted.
- Fragments accumulate: 2–3 reliable fragments about the same good can upgrade it from Level 1 to Level 2 without a crew hire.
- The journal also stores: port rumors, POI discoveries, trade route hints, quest-relevant lore.
- Visually: a ledger-style interface consistent with the existing `MarketTabLedger.tsx` aesthetic. Entries appear handwritten/period-appropriate.
- Journal entries persist across port visits — this is the player's own compiled knowledge, distinct from temporary broker consultations.

### POI System (Points of Interest)

New location type on the local 3D port maps. POIs appear as markers the player can sail or walk to, similar to how ports work on the world map but at the local level.

#### POI Data Model

```typescript
interface POIDefinition {
  id: string;
  name: string;
  type: 'temple' | 'monastery' | 'naturalist' | 'merchant_guild' | 'ruin' | 'garden' | 'court' | 'market_quarter';
  port: string;                    // which port this POI is near
  position: [number, number];      // local map coordinates
  description: string;
  knowledgeDomain: string[];       // which commodity categories this POI can identify
  maxLevel: number;                // highest knowledge level this POI can grant (usually 2, sometimes 3)
  cost?: {                         // what the player must pay/trade for knowledge
    type: 'gold' | 'commodity' | 'reputation' | 'quest';
    amount?: number;
    commodityId?: string;
  };
  reliability: number;             // 0-1, how likely the info is correct
  lore: string[];                  // flavor text / historical narrative
  unlocksPort?: string;            // visiting this POI reveals a new port on the world map
  unlocksQuest?: string;           // visiting triggers a quest
}
```

#### POI Examples by Port

| Port | POI | Type | Knowledge Domain | Special |
|------|-----|------|-----------------|---------|
| Goa | Jesuit College of St. Paul | monastery | European pharmacopoeia, New World drugs | Can analyze any sample to Level 2; has Orta's *Colóquios* — identifies many goods but some info is outdated/wrong |
| Calicut | Temple of Thalassery | temple | Ayurvedic medicines, Malabar spices | Reliable Level 3 on Pepper, Cardamom, Turmeric |
| Malacca | Chinese merchant guild | merchant_guild | East Asian trade goods, Spice Islands goods | Reveals sea routes to Bantam, Macau; broker services |
| Mocha | Sufi lodge | monastery | Coffee, Arabian incense, perfumes | Level 3 on Coffee; lore about Ethiopian origins |
| Zanzibar | Swahili merchant quarter | market_quarter | East African goods, ivory trade | Reveals inland trade routes; gold/ivory sourcing |
| Hormuz | Persian royal factor | court | Gems, carpets, horses, rhubarb | Expensive but very reliable; connects to Safavid court quests |
| Surat | Banyan merchant house | merchant_guild | Cotton textiles, indigo, opium | Best broker services in game; textile quality grading |
| Macau | Jesuit observatory | naturalist | Chinese medicines, natural philosophy | Can upgrade any Level 2 Asian good to Level 3; astronomical knowledge |
| Bantam | Pepper gardens | garden | Pepper varieties, local spices | Walk through actual pepper/spice cultivation; Level 3 on pepper family |
| Socotra | Aloe groves & ruins | ruin | Aloe, dragon's blood, ancient trade | Reveals Ptolemaic-era trade knowledge; hints at legendary goods |
| Mombasa | Swahili ruins at Gedi | ruin | East African trade history | Unlocks knowledge about Great Zimbabwe gold route |
| Muscat | Omani frankincense merchants | merchant_guild | Arabian incense trade | Level 3 on Frankincense, Myrrh; Dhofar sourcing |
| Aden | Rasulid-era library | monastery | Historical pharmacopoeia, Red Sea trade | Broad but sometimes outdated knowledge; covers many goods at Level 1–2 |

#### POI Modal

New component: `POIModal.tsx`, similar structure to `PortModal.tsx` but with different tabs:

- **Lore tab**: Historical narrative about the place. Provides atmosphere and context. May contain hints about goods or trade routes embedded in the text.
- **Identify tab**: Bring goods from your cargo for identification. The POI examines them and provides knowledge (if within their domain). Some POIs charge for this; some want you to trade a sample.
- **Learn tab**: The POI shares knowledge about goods you DON'T have. Reveals what exists, where to find it, what it's used for. This is how you learn "nutmeg comes from the Banda Islands" before you've ever seen nutmeg.
- **Trade Knowledge tab** (some POIs): Exchange knowledge for knowledge. "I'll tell you about the camphor trade if you tell me about European medicines." This creates a mechanic where your existing knowledge has value beyond commerce.

### Fraud & Deception System

Extends the existing `fraudRisk` property on `CommodityDef` in `commodities.ts`.

**How fraud works:**
- When buying a good at Level 0 or Level 1, there's a chance (scaled by `fraudRisk` and port reliability) that the good is **adulterated or counterfeit**.
- The player doesn't know until they try to sell it at another port (or have it analyzed at a POI).
- On attempted sale: "Your buyer examines the cinnamon closely and shakes his head — this is cassia bark, worth a fraction of the price."
- The good's value drops to 10–30% of what it should be.

**Fraud types:**
- **Substitution**: Cheaper good sold as expensive one (cassia as cinnamon, wild pepper as black pepper).
- **Adulteration**: Real good cut with filler (opium mixed with plant gum, saffron bulked with safflower).
- **Counterfeiting**: Completely fake (painted bark as nutmeg, colored glass as gems).

**Fraud prevention:**
- Level 2+ knowledge on a good: fraud chance reduced by 50%.
- Level 3 knowledge: fraud chance reduced by 90% (you know what to look for).
- Crew member with relevant domain: additional fraud detection on purchase ("Your Gujarati factor warns you this pepper smells wrong").
- Broker consultation: brokers can detect fraud on goods in their domain (but dishonest brokers might not tell you, or might be in on it).
- POI analysis: a naturalist or temple physician can verify authenticity. Costs time/money but is definitive.

**Fraud likelihood by context:**
- Major trading hub (Malacca, Surat): lower fraud risk, more oversight.
- Small/remote port (Socotra): higher fraud risk.
- Buying from a tavern contact (future feature): highest fraud risk.
- Buying from the regular market: moderate risk, scaled by `fraudRisk` per commodity.

### Implementation: State Changes

#### gameStore.ts additions

```typescript
// Add to game state
knowledgeState: Record<string, number>;  // commodityId → knowledge level (0-3)
journalEntries: JournalEntry[];
discoveredPOIs: string[];                // POI ids the player has found
visitedPOIs: string[];                   // POI ids the player has interacted with

// New interface
interface JournalEntry {
  id: string;
  timestamp: number;                     // in-game date
  commodityId?: string;                  // if about a specific good
  source: 'tavern' | 'poi' | 'broker' | 'crew' | 'trade' | 'observation';
  reliability: 'rumor' | 'likely' | 'confirmed';
  text: string;                          // the knowledge fragment
  portId: string;                        // where this was learned
}

// New actions
learnAboutCommodity(commodityId: string, newLevel: number, source: string): void;
addJournalEntry(entry: Omit<JournalEntry, 'id'>): void;
discoverPOI(poiId: string): void;
visitPOI(poiId: string): void;
checkForFraud(commodityId: string, quantity: number): { isFraud: boolean; fraudType?: string; realValue?: number };
```

#### CrewMember interface extensions (crewGenerator.ts)

```typescript
// Add to CrewMember interface
knowledgeDomains?: string[];        // commodity categories this crew member knows
knowledgeLevel?: number;            // 2 or 3, what level they grant
knowledgeSpecialty?: string;        // specific area of Level 3 expertise
```

#### Commodity display logic (MarketTabLedger.tsx)

```typescript
// Pseudocode for market display
function getDisplayName(commodity: CommodityDef, knowledgeLevel: number): string {
  if (knowledgeLevel >= 2) return commodity.id;                    // "Nutmeg"
  if (knowledgeLevel === 1) return commodity.categoryHint;         // "A warm aromatic seed"
  return commodity.physicalDescription;                            // "Small brown ovoid seeds with a strong fragrance"
}

function getDisplayPrice(commodity: CommodityDef, knowledgeLevel: number, portPrice: number): string {
  if (knowledgeLevel >= 2) return `${portPrice} coins`;
  if (knowledgeLevel === 1) return "~" + roughEstimate(portPrice); // vague range
  return "???";
}
```

#### New properties on CommodityDef (commodities.ts)

```typescript
// Add to CommodityDef interface
physicalDescription: string;     // Level 0 display: "a pungent dried seed"
categoryHint: string;            // Level 1 display: "some kind of pepper"
expertKnowledge: string;         // Level 3 info: medicinal uses, adulteration risks
originRegion: string;            // where it actually comes from
culturalDomains: string[];       // which crew knowledge domains cover this good
```

### Implementation: New Files

| File | Purpose |
|------|---------|
| `src/utils/knowledgeSystem.ts` | Core knowledge logic: level checks, fraud detection, knowledge acquisition calculations |
| `src/utils/poiDefinitions.ts` | All POI data (similar to `worldPorts.ts` for ports) |
| `src/utils/commodityDescriptions.ts` | Physical descriptions and category hints for all 41 commodities at each knowledge level |
| `src/components/POIModal.tsx` | POI interaction modal with Lore/Identify/Learn/Trade Knowledge tabs |
| `src/components/POIMarker.tsx` | 3D marker for POIs on local port maps |
| `src/components/Journal.tsx` | Journal/notebook UI component |

### Implementation Order

1. **Phase 1 — Knowledge state & display**: Add `knowledgeState` to game store. Add `physicalDescription` and `categoryHint` to all 41 commodities. Modify `MarketTabLedger.tsx` to show goods based on knowledge level. Set starting knowledge based on player nationality.
2. **Phase 2 — Crew knowledge**: Extend `CrewMember` with knowledge domains. Modify `generateStartingCrew()` and `generateHireableCrewMember()` to assign domains. Wire crew presence to knowledge level checks.
3. **Phase 3 — Tavern knowledge**: Add gossip/rumor generation to tavern tab in `PortModal.tsx`. Implement journal entries. Add unreliable information mechanic.
4. **Phase 4 — POI system**: Create POI definitions, modal, and map markers. Implement POI-based knowledge acquisition. Add broker consultation mechanic.
5. **Phase 5 — Fraud system**: Extend `fraudRisk` into full fraud/deception system. Add fraud detection on sale. Wire crew/knowledge-based fraud prevention.
6. **Phase 6 — Journal UI**: Build out the Dampier's-notebook journal interface. Implement fragment accumulation (multiple fragments → level upgrade).

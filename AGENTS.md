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

The core expansion mechanic: the player doesn't automatically know what trade goods are. Knowledge is acquired through three sources — tavern gossip, POI visits, and knowledgeable crew hires. This mirrors the real historical experience of European merchants in the Indian Ocean c. 1600–1650, where identifying, sourcing, and understanding drugs/spices/medicines was the fundamental challenge of the trade.

### Design Philosophy

The information asymmetry is the game. A port market shows 15 goods; the player recognizes 5. The rest appear as evocative physical descriptions ("a pungent dried seed," "a dark resinous substance"). The player can still buy unknown goods — and **unknown goods are cheap** (20–40% of true value, because sellers know you're ignorant) — so buying blind is a genuine gamble. You might turn 5 coins into 200, or buy painted bark.

This makes knowledge the primary progression system alongside wealth. The moment you identify a mysterious substance as ambergris worth 500x what you paid should be the best moment in the game — dramatic reveal toast, journal entry, the full Dampier feeling.

### Knowledge Levels

Three levels, stored as `knowledgeState: Record<string, 0 | 1 | 2>` in game state:

| Level | Name | Market Display | Price Display | Fraud Risk |
|-------|------|---------------|---------------|------------|
| **0 — Unknown** | Physical description: "small brown ovoid seeds with a strong fragrance" | "???" | Full (base `fraudRisk` applies) |
| **1 — Identified** | Real name: "Nutmeg." Origin and primary markets known. | Actual port price shown | Reduced 50% |
| **2 — Mastered** | Full name + expert info. **Sells for 15–20% more** (you know the best buyers). Fraud immunity. Unlocks quest content for this good. | Price + "You know the best markets" | Immune |

Every knowledge upgrade is a clear, discrete moment — a conversation, a POI visit, a crew hire — not an invisible counter ticking up.

### Starting Knowledge

Based on player nationality (already tracked in crew system):
- **English captain**: Identified (1) on European-familiar goods (Pepper, Cotton Textiles, Iron, Timber). Unknown (0) on most Asian-specific goods.
- Starting crew contribute their knowledge domains passively, so a starting Gujarati lascar immediately gives Identified on western Indian Ocean goods.

### Knowledge Sources

#### 1. Tavern Gossip (free, unreliable)

Extension of existing tavern tab in `PortModal.tsx`:
- Free, available at every port.
- Gives Unknown→Identified on 1–2 random goods at the current port.
- **~20% chance the information is wrong** — misidentifies a good, claims false properties, or points to a nonexistent trade route. The player finds out when they try to sell.
- Can also reveal: existence of nearby POIs, rumors about distant ports.
- Flavor: NPC dialogue snippets. "A Banyan merchant told me the dark paste from Bengal brings visions and dulls pain."
- Optionally, paying the barkeep introduces you to a local merchant for more reliable identification (still Unknown→Identified, but lower error rate).

#### 2. POI Visits (reliable, mid-cost)

See POI System section below. POIs give:
- Reliable Unknown→Identified on goods within their knowledge domain.
- Identified→Mastered on goods in their specialty (e.g., the Calicut temple masters Pepper, Cardamom, Turmeric).
- Costs: gold, a gift, offering a sample for analysis, or reputation with local faction.

#### 3. Crew Knowledge (permanent, expensive, rare)

Extension of existing crew hire system in `generateHireableCrewMember()`:
- Rare: 0–1 knowledgeable hires available at a port at any time.
- Expensive: 2–5x normal crew hire cost. Takes a crew slot.
- **Permanent**: as long as this crew member is aboard, their domain goods are Identified. Rare crew give Mastered on their specialty.
- If the crew member leaves/dies, knowledge reverts to whatever the player independently acquired.

| Crew Background | Identified Goods | Mastered Specialty |
|-----------------|------------------|--------------------|
| Gujarati factor | Pepper, Cotton, Indigo, Opium, Calico, Saltpeter | Adulteration detection (all goods) |
| Malay navigator | Cloves, Nutmeg, Mace, Camphor, Benzoin, Tin | Spice Islands sourcing |
| Arab merchant | Frankincense, Myrrh, Coffee, Ambergris | Red Sea trade routes |
| Chinese trader | Porcelain, Silk, Tea, Rhubarb, Musk, Lacquerware | Quality grading |
| Portuguese naturalist | Can upgrade any Identified good to Mastered | Galenic medicinal classification |
| Swahili pilot | Ivory, Gold, Tortoiseshell, Copal, Mangrove Poles | East African coastal knowledge |
| Tamil pearl diver | Pearls, Gems, Coral, Chanks | Quality grading, diving sites |

### Fraud System

One mechanic, not three. Extends existing `fraudRisk` on `CommodityDef`.

- When buying a good at Unknown (Level 0), there's a chance (scaled by `fraudRisk` × port context) that **the good is bad** — adulterated, substituted, or fake.
- The player doesn't know until they try to sell at another port: "Your buyer examines the cinnamon and shakes his head — this is cassia bark, worth a fraction of the price." Value drops to 10–30%.
- **Prevention**: Identified (Level 1) cuts fraud chance by 50%. Mastered (Level 2) eliminates it. Crew with relevant domain warn on purchase ("Your Gujarati factor says this pepper smells wrong").
- **Port context**: Major hubs (Malacca, Surat) = lower fraud. Remote ports (Socotra) = higher.

### The Journal

A readable record of what the player has learned, styled like Dampier's notebooks. **Not a crafting system** — knowledge upgrades come from clear moments (conversations, POI visits, crew), not from accumulating fragments.

- New UI component accessible from ship dashboard, ledger-style consistent with `MarketTabLedger.tsx`.
- Entries auto-generated on knowledge events: "In Calicut, the temple physician identified our 'fragrant bark' as true cinnamon — *Cinnamomum verum* — and noted it grows inland, not on the coast."
- Stores: identification records, port rumors (marked as unverified), POI lore, trade tips from crew.
- Useful as reference: "Where did I hear about nutmeg?" → check journal.
- No fragment accumulation mechanic. The journal is atmosphere and reference, not a progress bar.

### POI System (Points of Interest)

New location type on local 3D port maps. POIs appear as markers the player can sail to, similar to port markers on the world map.

#### POI Data Model

```typescript
interface POIDefinition {
  id: string;
  name: string;
  type: 'temple' | 'monastery' | 'naturalist' | 'merchant_guild' | 'ruin' | 'garden' | 'court';
  port: string;                    // which port this POI is near
  position: [number, number];      // local map coordinates
  description: string;             // short flavor text
  knowledgeDomain: string[];       // commodity IDs this POI can identify/master
  masteryGoods: string[];          // subset that this POI can upgrade to Mastered
  cost: {                          // what the player pays for knowledge
    type: 'gold' | 'commodity' | 'reputation';
    amount?: number;
    commodityId?: string;
  };
  npcName: string;                 // the character you interact with
  npcRole: string;                 // "Jesuit naturalist," "temple physician," etc.
  lore: string;                    // historical context for the Converse tab (LLM context)
  unlocksPort?: string;            // visiting reveals a new port on world map
}
```

#### POI Examples by Port

| Port | POI | Type | NPC | Knowledge Domain | Mastery Specialty |
|------|-----|------|-----|-----------------|-------------------|
| Goa | Jesuit College of St. Paul | monastery | Fr. António de Sousa, naturalist | European pharmacopoeia, New World drugs | Has Orta's *Colóquios* — broad but some info outdated/wrong |
| Calicut | Temple of Thalassery | temple | Vaidya Krishnan, Ayurvedic physician | Ayurvedic medicines, Malabar spices | Mastery: Pepper, Cardamom, Turmeric |
| Malacca | Chinese merchant guild | merchant_guild | Lim Wei, guild elder | East Asian trade goods, Spice Islands goods | Mastery: Porcelain, Silk quality grades |
| Mocha | Sufi lodge | monastery | Sheikh al-Dhabhani | Coffee, Arabian incense, perfumes | Mastery: Coffee (including Ethiopian origin lore) |
| Zanzibar | Swahili merchant quarter | merchant_guild | Mwana Khadija, trader | East African goods, ivory trade | Reveals inland gold/ivory routes |
| Hormuz | Persian royal factor | court | Mirza Abbas, Safavid agent | Gems, carpets, horses, rhubarb | Expensive but very reliable; Safavid court quests |
| Surat | Banyan merchant house | merchant_guild | Seth Virji Vora, merchant prince | Cotton textiles, indigo, opium | Mastery: textile grading, opium purity |
| Macau | Jesuit observatory | naturalist | Fr. Manuel Dias, astronomer | Chinese medicines, natural philosophy | Can upgrade any Identified Asian good to Mastered |
| Bantam | Pepper gardens | garden | Kyai Demang, plantation overseer | Pepper varieties, local spices | Mastery: pepper family (walk through actual cultivation) |
| Socotra | Aloe groves & ruins | ruin | Old Socotran hermit | Aloe, dragon's blood, ancient trade | Hints at legendary goods; Ptolemaic-era routes |
| Mombasa | Swahili ruins at Gedi | ruin | Local guide | East African trade history | Unlocks Great Zimbabwe gold route knowledge |
| Muscat | Omani frankincense merchants | merchant_guild | Sheikh Salim, incense trader | Arabian incense trade | Mastery: Frankincense, Myrrh; Dhofar sourcing |
| Aden | Rasulid-era library | monastery | Qadi Ibrahim, librarian | Historical pharmacopoeia, Red Sea trade | Broad but sometimes outdated; covers many goods at Identified |

#### POI Modal

New component: `POIModal.tsx`. Visually similar to `PortModal.tsx` (same frame/chrome) but with **two tabs only**:

**Tab 1 — Learn**
- The core knowledge-acquisition interface.
- Shows the POI's NPC and a brief narrative introduction ("Vaidya Krishnan examines your cargo with interest...").
- Lists goods from your cargo that this POI can identify or upgrade, plus goods in their domain that you haven't encountered yet.
- Player selects goods to learn about. Each identification costs according to the POI's `cost` definition.
- On identification: dramatic reveal moment — the good's name appears, a short historical description displays, journal entry auto-generated, knowledge state updated.
- For goods not in your cargo: the POI describes what exists and where to find it ("The Banda Islands, far to the east, produce a seed called nutmeg..."). This adds the good to your journal as a known-but-unseen entry.

**Tab 2 — Converse**
- An interactive LLM-powered conversation with the POI's NPC character.
- **Model**: Gemini 2.0 Flash Lite (latest) via API.
- **System prompt context includes**:
  - The POI's `lore` field (historical context about this place and person).
  - The NPC's name, role, and knowledge domain.
  - The player's captain name, nationality, crew composition, current cargo, ports visited, and knowledge state.
  - Era-appropriate constraints: the NPC speaks as a person of 1600–1650, with the knowledge and biases of their position. A Jesuit naturalist thinks in Galenic humoral terms. A Vaidya thinks in Ayurvedic terms. An Arab merchant knows trade routes but not botanical taxonomy.
  - The NPC can reveal knowledge through conversation — if the player asks the right questions, the NPC might identify a good or hint at a trade route, and the system should detect this and update knowledge state accordingly.
- **Gameplay function**: This is where depth lives. The player can ask "What is this dark resin I bought in Aden?" and the Jesuit might say "Ah, that appears to be *olibanum* — true frankincense. The ancients prized it, though Dioscorides confused it with several similar gums..." This is educational, atmospheric, AND mechanically useful.
- **Guard rails**: The LLM should stay in character and in period. It should not reveal information outside its NPC's plausible knowledge (a Calicut physician doesn't know about Chinese trade goods). Token budget per conversation should be capped to control costs.
- **Implementation**: API call on each player message. Conversation history maintained for the duration of the POI visit. NPC responses are short (2-4 sentences typical). A simple chat interface within the tab — player text input at bottom, scrollable message history above.

### Implementation: State Changes

#### gameStore.ts additions

```typescript
// Add to game state
knowledgeState: Record<string, number>;  // commodityId → knowledge level (0 | 1 | 2)
journalEntries: JournalEntry[];
discoveredPOIs: string[];                // POI ids the player has found
visitedPOIs: string[];                   // POI ids the player has interacted with

// New interface
interface JournalEntry {
  id: string;
  timestamp: number;                     // in-game date
  commodityId?: string;                  // if about a specific good
  source: 'tavern' | 'poi' | 'crew' | 'trade';
  text: string;                          // the knowledge record
  portId: string;                        // where this was learned
}

// New actions
learnAboutCommodity(commodityId: string, newLevel: number, source: string): void;
addJournalEntry(entry: Omit<JournalEntry, 'id'>): void;
discoverPOI(poiId: string): void;
visitPOI(poiId: string): void;
```

#### CrewMember interface extensions (crewGenerator.ts)

```typescript
// Add to CrewMember interface
knowledgeDomains?: string[];        // commodity IDs this crew member identifies
masteryDomain?: string[];           // commodity IDs this crew member masters
```

#### Commodity display logic (MarketTabLedger.tsx)

```typescript
function getDisplayName(commodity: CommodityDef, level: number): string {
  if (level >= 1) return commodity.id;                    // "Nutmeg"
  return commodity.physicalDescription;                   // "Small brown ovoid seeds with a strong fragrance"
}

function getDisplayPrice(commodity: CommodityDef, level: number, portPrice: number): string {
  if (level >= 1) return `${portPrice} coins`;
  return "???";
}

// Unknown goods sell at 20-40% of true value (seller knows you're ignorant)
function getUnknownDiscount(): number {
  return 0.2 + Math.random() * 0.2;  // 20-40%
}
```

#### New properties on CommodityDef (commodities.ts)

```typescript
// Add to CommodityDef interface
physicalDescription: string;     // Level 0 display: "a pungent dried seed"
expertKnowledge: string;         // Level 2 info shown in journal: medicinal uses, best markets
originRegion: string;            // where it actually comes from
culturalDomains: string[];       // which crew backgrounds cover this good
```

### Implementation: New Files

| File | Purpose |
|------|---------|
| `src/utils/knowledgeSystem.ts` | Knowledge level checks, effective level calculation (player + crew), fraud roll on purchase |
| `src/utils/poiDefinitions.ts` | All POI data (similar to `worldPorts.ts`) |
| `src/utils/commodityDescriptions.ts` | `physicalDescription` and `expertKnowledge` for all 41 commodities |
| `src/components/POIModal.tsx` | POI modal with Learn and Converse tabs |
| `src/components/POIMarker.tsx` | 3D marker for POIs on local port maps |
| `src/components/Journal.tsx` | Journal/notebook UI component |
| `src/utils/poiConversation.ts` | Gemini Flash Lite API integration: system prompt construction, message handling, knowledge-state extraction from NPC responses |

### Implementation Order

1. **Phase 1 — Knowledge state & display**: Add `knowledgeState` to game store. Add `physicalDescription` to all 41 commodities. Modify `MarketTabLedger.tsx` to show goods based on knowledge level. Unknown goods display at 20–40% price. Set starting knowledge by nationality. Add dramatic reveal toast (via existing `ASCIIToast`) when a good is first identified.
2. **Phase 2 — Crew knowledge**: Extend `CrewMember` with `knowledgeDomains` and `masteryDomain`. Modify `generateStartingCrew()` and `generateHireableCrewMember()` to assign domains. Effective knowledge = max(player level, crew level).
3. **Phase 3 — Tavern knowledge**: Add gossip/rumor generation to tavern tab in `PortModal.tsx`. ~20% unreliable info. Auto-generate journal entries.
4. **Phase 4 — POI system**: Create POI definitions and `POIMarker.tsx` on local maps. Build `POIModal.tsx` with Learn tab. Wire knowledge acquisition through POI visits.
5. **Phase 5 — POI Converse tab**: Integrate Gemini 2.0 Flash Lite API. Build system prompt from POI lore + player state. Chat UI in Converse tab. Detect knowledge reveals in conversation and update state.
6. **Phase 6 — Fraud & Journal**: Fraud roll on Unknown purchases, revealed on sale. Journal UI as readable reference.

## Expanded World Map — Europe, Atlantic & Cape Route

### Architecture: One Map, Not Tabs

The world map remains a **single D3 Mercator projection** (in `WorldMapModal.tsx`), not separate tab-based maps. Reasons:

1. The Indian Ocean, Atlantic, and European trade networks were *becoming connected* in this period — the Portuguese Carreira da Índia linked them. Separate maps would break that feeling.
2. The current D3 setup supports it: recenter from `[75, 8]` to ~`[30, 10]` and zoom out to show Lisbon→Macau in one view.
3. Tabs add UI complexity for no gameplay gain ("Is Luanda on the Atlantic map or the Indian Ocean map?" shouldn't be a question).

**Interactive zoom + pan** via `d3.zoom()` replaces the fixed view. The map opens centered on the player's current region. Quick-jump buttons along the bottom recenter without changing maps: **Atlantic | East Africa | Indian Ocean | East Indies**.

### New Climate Profile: Mediterranean

Add `'mediterranean'` to the `ClimateProfile` union type in `portArchetypes.ts`. This sits between `arid` and `temperate` — warm clear water, mixed vegetation.

#### Climate → Water & Vegetation Mapping

| Climate | Water Palette | Trees | Ground Character |
|---------|--------------|-------|-----------------|
| `tropical` | tropical (cyan-turquoise) | Palms dominant, some broad-leaf | Lush green, jungle undergrowth |
| `monsoon` | monsoon (deep teal) | Palms + dense jungle trees | Dark green, muddy riverbanks |
| `arid` | arid (bright cobalt) | Cacti, thornbush, dead trees | Sandy, sparse scrub |
| `temperate` | temperate (slate-grey) | **Fir/cone trees only, no palms.** Denser, darker green canopy. | Mossy greens, grey-brown earth |
| `mediterranean` | mediterranean (warm blue) | **Mix of palms and fir/cone trees.** Palms near coast only, firs on hills. Olive/cypress feel. | Dry golden-brown grass, green scrub near water |

#### Implementation (climate changes)

1. **`portArchetypes.ts`**: Add `'mediterranean'` to `ClimateProfile` union. Add moisture range in `getClimateMoisture()`: `'mediterranean': [0.15, 0.45]` (drier than temperate, wetter than arid).
2. **`waterPalettes.ts`**: The `mediterranean` water palette already exists. Add `'mediterranean'` to the `ClimateLike` type alias and wire it in `getDefaultWaterPaletteForClimate()`: `case 'mediterranean': return 'mediterranean';`
3. **`World.tsx` vegetation placement**: In the forest/jungle biome tree-placement block (~line 520), add climate-aware logic:
   - If `temperate`: suppress all palm placement. Cone trees only, slightly denser (lower rand threshold).
   - If `mediterranean`: reduce palm frequency by ~60%. Palms only below elevation threshold (coastal). Cone trees on hills.
   - Other climates: unchanged.
4. **`terrain.ts`**: `getClimateMoisture` and `climateWindStrength` need `mediterranean` cases. Wind strength ~0.7 (moderate Atlantic breeze).

### New Ports (10 ports, 24 total)

#### Europe (4 ports)

**Lisbon** `[−9.14, 38.71]`
- Scale: Very Large. Culture: European.
- Geography: `estuary`. Climate: `mediterranean`.
- The metropole. Hub of the Carreira da Índia. Sells European manufactures (iron, textiles, weapons). Buys everything from the East — highest prices for spices but longest voyage.
- `openDirection: 'W'`. Wide Tagus estuary opening to the Atlantic. Palms along waterfront, pines on hills above.

**Amsterdam** `[4.90, 52.37]`
- Scale: Large. Culture: European.
- Geography: `estuary`. Climate: `temperate`.
- VOC headquarters. Emerging rival to Portuguese monopoly. Best prices for fine spices (nutmeg, mace, cloves). Hostile to Portuguese-flagged ships.
- `openDirection: 'N'`. Flat marshy IJ river/Zuiderzee. Dark cold water, sparse firs on banks. `channelWidth: 0.7`.

**Seville** `[−5.99, 37.39]`
- Scale: Large. Culture: European.
- Geography: `estuary`. Climate: `mediterranean`.
- Gateway to the Spanish Atlantic. New World silver flows through here. Buys Asian luxury goods for re-export to the Americas.
- `openDirection: 'S'`. Guadalquivir river, warm blue water, mixed vegetation. `channelWidth: 0.6`.

**London** `[−0.08, 51.51]`
- Scale: Large. Culture: European.
- Geography: `strait`. Climate: `temperate`.
- EIC headquarters. Apothecary/drug trade center — best market for exotic medicines. Hostile to Spanish/Portuguese-flagged ships.
- `openDirection: 'E'`. Narrow Thames with land close on both sides. Dark slate-grey water, fir trees only. `channelWidth: 0.5`, `channelTaper: 0.4` (narrows upstream). Note: `channelTaper` is a new `PortDefinition` field — see strait taper implementation below.

#### West Africa (2 ports)

**Elmina** `[−1.35, 5.08]`
- Scale: Small. Culture: European (Portuguese fortress).
- Geography: `continental_coast`. Climate: `tropical`.
- Gold Coast fortress. Gold, slaves, ivory. Provisioning stop on the Carreira da Índia. Knowledge about African interior trade.
- `openDirection: 'S'`. Open tropical coastline with fortress on headland.

**Luanda** `[13.23, −8.84]`
- Scale: Small. Culture: European (Portuguese).
- Geography: `bay`. Climate: `tropical`.
- Portuguese slave-trading hub. Slaves, ivory, wax. Connects Atlantic slave trade to Indian Ocean economy (slaves traded in Goa, Malacca).
- `openDirection: 'W'`. Natural bay, tropical vegetation.

#### Atlantic Americas (3 ports)

**Salvador da Bahia** `[−38.51, −12.97]`
- Scale: Large. Culture: European (Portuguese Brazil).
- Geography: `bay`. Climate: `tropical`.
- Capital of Portuguese Brazil. Sugar, tobacco, brazilwood. Hub of the Atlantic triangle — Brazilian sugar traded for African slaves traded for Asian spices.
- `openDirection: 'E'`. Baía de Todos os Santos — large natural harbor, lush tropical vegetation.

**Havana** `[−82.36, 23.14]`
- Scale: Large. Culture: European (Spanish).
- Geography: `inlet`. Climate: `tropical`.
- Treasure fleet staging point. Silver, tobacco, sugar, hides. Gateway to New Spain silver. Heavily fortified, Spanish-controlled.
- `openDirection: 'N'`. Narrow channel opening into large protected harbor.

**Cartagena de Indias** `[−75.51, 10.39]`
- Scale: Medium. Culture: European (Spanish).
- Geography: `bay`. Climate: `tropical`.
- Spanish colonial port. Silver, emeralds, New World drugs (tobacco, cacao, coca). Gateway to Potosí silver.
- `openDirection: 'W'`. Enclosed bay with narrow entrance, heavily fortified.

#### Cape Route (1 waypoint)

**Cape of Good Hope** `[18.42, −33.93]`
- Scale: Small. Culture: None (no permanent settlement in 1612).
- Geography: `continental_coast`. Climate: `mediterranean`.
- Critical provisioning stop, not a true port. Fresh water, limited trade with Khoikhoi pastoralists. Mandatory waypoint on Europe↔India routes.
- `openDirection: 'S'`. Rocky exposed coastline. Mediterranean climate (historically accurate — fynbos biome). Mixed vegetation, warm-ish water but windswept.
- Special: minimal port services. No tavern, no full market. Just provisioning (water, food) and a POI (Khoikhoi trading post).

### Sea Lane Connections

New connections extending `SEA_LANE_GRAPH` in `worldPorts.ts`:

```typescript
// New port connections
london:    ['amsterdam', 'lisbon', 'seville'],
amsterdam: ['london', 'lisbon', 'elmina'],
lisbon:    ['london', 'amsterdam', 'seville', 'elmina', 'salvador'],
seville:   ['london', 'lisbon', 'havana', 'cartagena'],
elmina:    ['amsterdam', 'lisbon', 'luanda', 'salvador'],
luanda:    ['elmina', 'salvador', 'cape'],
salvador:  ['lisbon', 'elmina', 'luanda', 'havana'],
havana:    ['seville', 'salvador', 'cartagena'],
cartagena: ['seville', 'havana'],
cape:      ['luanda', 'zanzibar', 'mombasa', 'mozambique_channel'],

// Updated existing connections (add Cape route links)
zanzibar:  ['calicut', 'goa', 'mombasa', 'cape'],
mombasa:   ['aden', 'muscat', 'socotra', 'zanzibar', 'cape'],
```

The **Cape of Good Hope** is the bottleneck connecting the two halves — historically accurate. You cannot sail Lisbon→Goa without passing through Cape and then up the East African coast. This creates meaningful route planning.

### Strait Taper (new feature for London)

Small addition to the `strait` case in `portArchetypes.ts` (~line 518) so that straits can narrow at one end, making them look like rivers:

```typescript
// Add to PortDefinition interface
channelTaper?: number;  // 0 = uniform width, 0.5 = narrows to half at one end

// In the 'strait' case:
case 'strait': {
  const taperFactor = def.channelTaper ?? 0;
  // wrz ranges roughly -0.5 to 0.5; taper narrows toward +z (upstream)
  const taper = 1.0 - taperFactor * (wrz * 0.5 + 0.5);
  const cw = (def.channelWidth ?? 1.0) * 0.25 * taper;
  const channelNoise = cn * 0.5;
  const channelEdge = cw + channelNoise;
  const absWrx = Math.abs(wrx);
  const isLand = absWrx > channelEdge;
  const landStrength = isLand ? smoothstep(channelEdge, channelEdge + 0.12, absWrx) : 0;
  shape = landStrength * 0.9 - (isLand ? 0 : 0.5);
  break;
}
```

### Gameplay Impact

**The Carreira da Índia becomes playable.** Buy pepper in Calicut → sail to Goa → load up → Cape → Elmina → Lisbon → sell at 10x markup. But the voyage takes months, provisions spoil, crew morale drops, and you might lose everything to weather or pirates off the Swahili coast.

**Atlantic triangle opens up.** European manufactures → West Africa (trade for gold/slaves) → Brazil (trade for sugar/tobacco) → Europe (sell sugar) — or cut east from Cape into the Indian Ocean with European goods that sell at premium.

**Knowledge system gets richer.** A Portuguese naturalist knows European and New World goods but is useless in the Spice Islands. A Gujarati factor is invaluable in the Indian Ocean but has no idea what Brazilian tobacco is. Different regions need different knowledge.

**New World drugs enter the system.** Tobacco, cacao, coca, cinchona bark (quinine), guaiacum — all historically entering global trade in exactly this period. Unknown to everyone in the Indian Ocean, creating fresh discovery moments even late in the game.

### New Commodities (to add to commodities.ts)

New World and European goods to support the expanded map:

| Good | Tier | Origin Region | Notes |
|------|------|--------------|-------|
| Tobacco | 2 | Atlantic Americas | Havana, Salvador. Rapidly becoming global commodity by 1612. |
| Cacao | 3 | Atlantic Americas | Cartagena, Havana. Luxury drink, not yet widely known in Asia. |
| Sugar | 1 | Atlantic Americas / tropical | Salvador primary producer. Bulk commodity. |
| Brazilwood | 2 | Atlantic Americas | Salvador. Red dye source, valuable in Europe and Asia. |
| Silver | 4 | Atlantic Americas | Havana, Cartagena, Seville. The currency of global trade. |
| Emeralds | 4 | Atlantic Americas | Cartagena. Colombian mines, prized in Mughal India. |
| Cinchona bark | 3 | Atlantic Americas | Cartagena. "Jesuit's bark" — anti-malarial. Barely known in 1612. |
| Guaiacum | 3 | Atlantic Americas | Havana, Cartagena. "Holy wood" — supposed syphilis cure, major drug trade item. |
| Wool cloth | 1 | Europe | London, Amsterdam. Bulk European export, staple of Indian Ocean trade. |
| Firearms | 3 | Europe | London, Amsterdam, Lisbon. Muskets, powder. High demand everywhere. |
| Wine | 2 | Europe | Lisbon, Seville. Portuguese wine traded across the Estado da Índia. |
| Gold (West African) | 4 | West Africa | Elmina. Alluvial gold, the original reason for Portuguese presence on the Gold Coast. |
| Slaves | 3 | West Africa | Luanda, Elmina, Zanzibar. Historically central to this trade network. Handle with appropriate gravity. |

### POIs for New Ports

| Port | POI | Type | NPC | Knowledge Domain |
|------|-----|------|-----|-----------------|
| Lisbon | Royal Hospital of All Saints | naturalist | Dr. Tomás Rodrigues, royal physician | European pharmacopoeia, New World drugs. Has access to Garcia de Orta's networks. |
| Amsterdam | VOC Spice Warehouse | merchant_guild | Hendrik van Hoorn, VOC factor | Spice Islands goods, market prices. Best intelligence on nutmeg/clove trade. |
| Seville | Casa de Contratación | court | Don Luis de Velasco, trade official | New World goods, silver trade, Atlantic routes. Bureaucratic but comprehensive. |
| London | Apothecaries' Hall | naturalist | Thomas Johnson, apothecary | Drug identification, medicinal uses. Excellent Level 2→Mastered on medicines. |
| Havana | Fortress garrison | court | Capitán Diego de Salazar | New Spain silver routes, treasure fleet schedules. Military knowledge, fortification. |
| Salvador | Jesuit college | monastery | Fr. Fernão Cardim | Brazilian drugs (tobacco, ipecacuanha), Tupi medicinal knowledge. |
| Cartagena | Inquisition library | monastery | Fr. Pedro Claver | New World drugs, indigenous knowledge filtered through Catholic lens. Unreliable on some things. |
| Elmina | Akan traders outside the fort | merchant_guild | Kwame Asante, gold trader | West African gold sourcing, inland trade routes, forest products. |
| Luanda | Imbangala war camp | ruin | Ngola's envoy | Slave trade networks, inland African geography, wax and ivory sourcing. |
| Cape of Good Hope | Khoikhoi pastoral camp | garden | /Xam elder | Local plants, animal products, fresh water sources. Very limited trade goods but unique botanical knowledge. |

### Implementation Order (Map Expansion)

1. **Phase M1 — Climate system**: Add `mediterranean` to `ClimateProfile`. Wire moisture, water palette, wind. Add vegetation rules for `temperate` (no palms) and `mediterranean` (mixed) in `World.tsx`.
2. **Phase M2 — Strait taper**: Add `channelTaper` to `PortDefinition`. Modify strait case in `portArchetypes.ts`. Test with London definition.
3. **Phase M3 — Port definitions**: Add all 10 new ports to `portArchetypes.ts` (CORE_PORTS) and `worldPorts.ts` (WORLD_PORT_COORDS, SEA_LANE_GRAPH, PORT_TRADE_PROFILES).
4. **Phase M4 — World map zoom**: Replace fixed-center D3 projection with `d3.zoom()` pan/zoom. Add region quick-jump buttons. Recenter default to show player's current region.
5. **Phase M5 — New commodities**: Add ~13 new commodities to `commodities.ts`. Define trade profiles for new ports. Wire into market generation.
6. **Phase M6 — New POIs**: Add POI definitions for the 10 new ports. Wire into POI system (depends on Knowledge System Phase 4).

## Building Style System

Visual differentiation of ports that share a `culture`. Lisbon, Amsterdam, and London are all `European` culture but should not look alike. Culture remains the *gameplay* label (markets, NPCs, flags, awning dyes, language); `buildingStyle` is a separate *visual* layer.

### Core principle

Keep primitives minimal — box, cylinder, cone, sphere — and drive differentiation through **palette + proportion + weighted variant mix**. No per-facade detail, no tiles, no textures. A full visual style is typically: a wall-color palette, a roof-color/profile palette, a weighted list of house variants with scale multipliers and optional feature flags. Three new cheap primitives cover the features worth adding: **stilts**, **wind-catcher**, **veranda**.

### Data model (additions to `portArchetypes.ts`)

```typescript
type BuildingStyle =
  | 'iberian'            // Lisbon, Seville
  | 'dutch-brick'        // Amsterdam
  | 'english-tudor'      // London (pre-1666 half-timber)
  | 'luso-colonial'      // Goa, Diu, Macau
  | 'swahili-coral'      // Mombasa, Zanzibar
  | 'arab-cubic'         // Aden, Mocha, Socotra, Muscat
  | 'persian-gulf'       // Hormuz (wind-catchers)
  | 'malabar-hindu'      // Calicut
  | 'mughal-gujarati'    // Surat
  | 'malay-stilted'      // Malacca, Bantam
  | 'west-african-round' // Elmina, Luanda
  | 'luso-brazilian'     // Salvador
  | 'spanish-caribbean'  // Havana, Cartagena
  | 'khoikhoi-minimal';  // Cape (no real settlement)

interface PortLandmark {
  id: string;                // e.g. 'tower-of-london', 'torre-de-belem'
  slot: 'citadel' | 'hilltop' | 'waterfront' | 'bridge' | 'custom';
  anchor?: [number, number]; // local-map coords if slot is 'custom'
}

// Added to PortDefinition
buildingStyle?: BuildingStyle;   // falls back to culture default when absent
landmarks?: PortLandmark[];      // data-only scaffold; renderer is future work
```

### Style registry shape (in `ProceduralCity.tsx`)

```typescript
interface BuildingStyleDef {
  wallPalette: [number, number, number][];      // repeat colors to weight them
  roofPalette: { color: [number, number, number]; geo: 'box' | 'cone'; h: number }[];
  houseVariants: HouseVariant[];                // weighted mix within a single port
  shutterPalette?: [number, number, number][];  // European-derived styles
  densityBias?: number;                         // >1 tighter, <1 spread
}

interface HouseVariant {
  weight: number;
  scaleMul?: [number, number, number];  // multiplier on base [w,h,d]
  roofGeoOverride?: 'box' | 'cone';
  roofHMul?: number;
  features?: {
    stilts?: boolean;              // 4 thin posts below main box
    roundHut?: boolean;            // cylinder walls + cone roof
    flatRoofParapet?: boolean;     // flat roof with slight lip, no cone
    deepEaves?: boolean;           // cone base wider than wall footprint
    windCatcher?: boolean;         // small upright box on top
    veranda?: boolean;             // thin slab porch extending from front
    upturnedEave?: boolean;        // Chinese shophouse flare (Manila Parián — reserved for future)
  };
}
```

### Port-to-style map

| Style | Ports | Signature |
|---|---|---|
| `iberian` | Lisbon, Seville | whitewash + terracotta, shallower pitched roofs, wider footprints |
| `dutch-brick` | Amsterdam | red-brown brick palette, tall narrow scale `[2, 4, 2.5]`, steep dark tile |
| `english-tudor` | London | dark timber + cream plaster palette, steep thatch-brown cones |
| `luso-colonial` | Goa, Diu, Macau | Portuguese whites + cream + Goa yellow + Macau pink, iconic painted shutters |
| `swahili-coral` | Mombasa, Zanzibar | whitewash + flat-roof parapets (box roofs), low horizontal proportions |
| `arab-cubic` | Aden, Mocha, Socotra, Muscat | whitewash + mud, tall narrow scale, 90 % flat roofs |
| `persian-gulf` | Hormuz | sun-beaten mud palette, flat roofs, ~25 % get a wind-catcher |
| `malabar-hindu` | Calicut | laterite earth tones + deep-eave palm thatch |
| `mughal-gujarati` | Surat | warm stucco + tile, medium density |
| `malay-stilted` | Malacca, Bantam | bahay-kubo: stilt posts + pyramidal palm thatch |
| `west-african-round` | Elmina, Luanda | round mud hut + cone thatch (existing behavior, now formalized) |
| `luso-brazilian` | Salvador | Iberian palette + wide squat solar houses + ground-floor veranda, ~15 % thatch mix |
| `spanish-caribbean` | Havana, Cartagena | whitewash + tile core + 30–40 % bohío palm-thatch mix |
| `khoikhoi-minimal` | Cape | no real settlement; reduced count, earth tones only |

### New primitive components

Three additions cover every style:

1. **Stilts**: four thin box posts (~0.1 × 1 × 0.1) centered below the house base. Reused by `malay-stilted` and the existing Indian Ocean shack branch.
2. **Wind-catcher (badgir)**: a small upright box (~0.6 × 1.2 × 0.6) above the roof. Unique to `persian-gulf` for now.
3. **Veranda**: a thin flat slab (~1.0 deep × 0.15 tall × wall-width) extending from the front face at ground level, optionally with two thin post cylinders. Used by `luso-brazilian` and some `spanish-caribbean` / `luso-colonial` estates.

Everything else — Amsterdam's tall-narrow silhouette, London's steep-thatch look, Swahili flat roofs, Malabar deep eaves — is achieved via palette swap + scale multiplier + roof-profile parameters. No extra meshes.

### Scope boundaries

- `culture` still drives: fort wall material, market shelter geometry, fort flag color, awning dye palette, shack wall palette, and all gameplay (NPCs, markets, reputation). **Unchanged.**
- `buildingStyle` drives only: house / warehouse / estate / farmhouse wall + roof + variant selection + feature flags. This is the main visual differentiator players see walking through a port.
- `landmarks` is scaffolding only. The renderer is a future phase. When implemented, `cityGenerator.ts` should reserve those grid cells before placing generic buildings, and a new renderer module handles the unique POI meshes.

### Future: Manila (`manila-hybrid`) and Lima (`spanish-andean`)

When Manila and Lima/Callao are added, introduce two more styles:
- `spanish-andean`: warm adobe palette, max-2-story earthquake-conscious scale, deep-eave cones, arcaded plaza POI slot.
- `manila-hybrid`: weighted mix of `luso-colonial`-like stone (30 %), `malay-stilted` bahay kubo (40 %), Chinese shophouse with upturned eave (20 %), native thatch (10 %). Demonstrates the weighted-variant system at full stretch — no new primitives needed beyond the three listed above (plus `upturnedEave` when Manila ships).

## Wildlife / Animal System

Procedurally spawned animals on land, rendered as instanced meshes for performance. Each animal type is a **template** — a single geometry + behavior pattern reused across ports with different colors, scales, and spawn biomes.

### Architecture

- Each template is its own React component (e.g. `Grazers.tsx`, `Primates.tsx`) receiving spawn data + `shadowsActive` as props.
- **Spawn data** is generated inside the terrain vertex loop in `World.tsx`'s useMemo, alongside trees/crabs/gulls. Port-specific variant configs (color, scale, herd size, allowed biomes) are selected via a switch on `portId`.
- **City exclusion**: Animals don't spawn within 90 units of port center (`CITY_EXCLUSION_SQ`).
- **Instanced mesh**: All animals of a template share one `InstancedMesh` with per-instance color. Geometry is merged from simple primitives (spheres, cylinders, cones).
- **Animation range**: Only animate instances within `ANIM_RANGE_SQ` (120²) of the player. Distant animals freeze for performance.
- **Max count**: Each template capped (e.g. 60 grazers) to bound draw calls.

### Behavior Patterns

Four core behaviors, reused across templates:

1. **Ground scatter** (grazers): Mutable offset array tracks per-instance displacement. When player enters scatter radius (~22 units), animals flee radially away. Velocity decays and animals drift back to spawn when player leaves. Facing rotates to direction of travel during flee.
2. **Tree scatter** (primates): Similar to ground scatter but flee targets nearby tree positions. Spawn biased toward tree-dense biomes.
3. **Slow waddle** (reptiles): Like ground scatter but lower flee speed and longer return time. Solitary, no herd clustering.
4. **Fly-away** (wading birds): On scatter, animate upward (increasing Y) and outward, then circle at altitude before descending back. Reuses gull-style circular orbit for the airborne phase. Spawn at water-edge (shoreline / shallow inlets).

### Templates

#### 1. Grazer — `src/components/Grazers.tsx` ✅ DONE

Geometry: body ellipsoid + head sphere + 4 cylinder legs + cone tail nub. Ground scatter behavior.

| Variant | Ports | Color | Scale | Herd Size | Biomes |
|---------|-------|-------|-------|-----------|--------|
| Springbok | Cape | `#c8a060` tan | 1.0 | 5–9 | grassland, scrubland |
| Antelope | Mombasa, Zanzibar | `#a06840` reddish | 0.9 | 4–7 | grassland, forest, scrubland |
| Goat | Hormuz, Diu, Socotra, Muscat, Mocha, Aden | `#8a7a6a` grey-brown | 0.65–0.7 | 3–5 | scrubland, desert, arroyo |
| Sheep | London, Amsterdam, Lisbon, Seville | `#e8dcc8` cream | 0.6–0.65 | 3–8 | grassland, scrubland |
| Water buffalo | Goa, Calicut, Surat | `#4a4a4a` dark | 1.2 | 2–3 | grassland, swamp, scrubland |
| Capybara | Salvador, Cartagena | `#8a6848` brown | 0.8 | 3–5 | grassland, swamp, scrubland |
| Generic grazer | Malacca, Bantam, Macau, Elmina, Luanda, fallback | various | 0.85–1.1 | 2–5 | various |
| *(none)* | Havana | — | — | — | *(iguanas via reptile template instead)* |

#### 2. Primate — `src/components/Primates.tsx` ☐ TODO

Geometry: upright-ish body + round head + long tail + 4 limbs. Tree scatter behavior — spawn near trees, flee toward nearest tree cluster.

| Variant | Ports | Color | Troop Size |
|---------|-------|-------|------------|
| Macaque | Goa, Calicut, Surat | brown | 4–6 |
| Long-tailed macaque | Malacca, Bantam | grey | 4–6 |
| Baboon | Cape, Mombasa | olive-grey, larger | 3–5 |
| Colobus monkey | Zanzibar, Elmina | black w/ white patches | 3–4 |

#### 3. Wading Bird — `src/components/WadingBirds.tsx` ☐ TODO

Geometry: long thin legs + body + curved neck + beak. Fly-away scatter — flock lifts off, circles, returns.

| Variant | Ports | Color | Flock Size |
|---------|-------|-------|------------|
| Flamingo | Mombasa, Zanzibar, Surat | pink/salmon | 6–12 |
| Scarlet ibis | Salvador | bright red | 5–8 |
| Heron/egret | Goa, Calicut, Luanda, Elmina | white | 2–4 |

#### 4. Reptile — `src/components/Reptiles.tsx` ☐ TODO

Geometry: low long body + 4 stubby legs + long tail. Slow waddle-away, solitary. Spawn near water edges.

| Variant | Ports | Color | Count |
|---------|-------|-------|-------|
| Monitor lizard | Bantam, Malacca | dark olive | 1–2 |
| Iguana | Havana, Cartagena | green | 2–3 |
| Crocodile | Luanda, Salvador, Surat | dark brown-green | 1 |

### Hunting Mechanic — ☐ TODO (Phase 2)

Reuse swivel gun combat mode: F to enter fight mode, mouse/trackpad aim, spacebar fire. Hit animal → provisions or trade goods (hides, ivory). Not yet implemented — requires:
- Extending `combatState.ts` hit detection to check animal instanced meshes
- Loot table per animal type (provisions for most, rare drops for some)
- Animals should scatter more aggressively / permanently when shot at

### Implementation Checklist

- [x] **Grazers**: Component, geometry, spawn logic, scatter animation, port variants
- [ ] **Primates**: Component + tree-proximity spawn + erratic flee paths
- [ ] **Wading Birds**: Component + fly-away scatter + landing behavior
- [ ] **Reptiles**: Component + slow flee + water-edge spawn
- [ ] **Hunting mechanic**: Swivel gun hit detection on animal meshes, loot drops
- [ ] **Sound effects**: Scatter sounds per template (hoofbeats, bird wings, splashing)
- [ ] **Notifications**: Click-to-identify like crabs/fish (species name + flavor text)

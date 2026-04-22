# Agent Notes — Spice Voyager, 1612

## Who you're working with

Benjamin Breen — history professor at UC Santa Cruz, author of *The Age of Intoxication: Origins of the Global Drug Trade* (Penn, 2019) and *Tripping on Utopia* (Grand Central, 2024). His scholarship centers on early modern drug/commodity trades, the Portuguese Estado da Índia, and the intellectual history of pharmacology.

Practical implications for this project:
- The simulation target is 1612 Indian Ocean + Atlantic and Pacific trade. Historical accuracy matters — period-specific, not generic "age of sail."
- Drugs, spices, and medicines are the mechanical core, not generic commodities. Treat them with the specificity he'd bring to a monograph.
- His writing voice is grounded and experiential, not literary-ornate. Avoid LLM flourishes in NPC dialogue, journal entries, and UI copy. If you'd describe it as "evocative," you've probably overdone it.
- He's written on the ethics of representing colonial violence. Slavery is excluded from procgen entirely (no Afro-diasporic names in generators, no compensating structural labels). When the trade touches it, the game handles it through discrete hand-written content, not randomization.

## Working guidelines

These bias toward caution over speed. Use judgment for trivial edits.

### Think before coding
- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, surface them — don't silently pick one.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop and name what's confusing before implementing.

### Simplicity first
- Minimum code that solves the problem. Nothing speculative.
- No features beyond what was asked, no abstractions for single-use code, no configurability that wasn't requested, no error handling for impossible scenarios.
- If you wrote 200 lines and it could be 50, rewrite it.
- "Would a senior engineer call this overcomplicated?" — if yes, simplify.

### Surgical changes
- Touch only what you must. Match existing style even if you'd write it differently.
- Don't "improve" adjacent code, comments, or formatting while passing through.
- Don't refactor things that aren't broken.
- Remove imports/variables your changes orphaned; don't delete pre-existing dead code unless asked.
- Test: every changed line should trace directly to the request.

### Goal-driven execution
- Transform vague tasks into verifiable goals ("add validation" → "write tests for invalid inputs, then pass them"; "fix the bug" → "write a test that reproduces it, then pass it").
- For multi-step work, state a short plan with a verify step per item.
- Strong success criteria let you loop independently. Weak ones ("make it work") force clarification mid-flight.

### Project-specific
- **There is no test suite.** `npm run lint` is `tsc --noEmit` only — no ESLint, no Vitest, no CI. Never claim tests passed. Verification for this project means: (a) `tsc --noEmit` clean, (b) dev server starts, (c) the specific feature works in the browser when Ben tries it.
- **For UI / 3D / gameplay changes, you cannot verify correctness by types alone.** Report what you changed and ask Ben to sanity-check in the browser. Don't claim visual/feel outcomes you haven't seen.
- **Historical claims in code/content**: when introducing a fact (a commodity's origin, a port's 1612 political status, an NPC role), cite it or flag it as your inference. Ben will catch errors; better to flag than to assert.
- **LLM-generated prose in-game**: keep NPC dialogue short, period-specific, and plain. No "Ah, a fellow traveler of the seven seas" style openings.
- **Don't invent features to document.** If AGENTS.md has a gap, ask — don't fill it with speculation.

## Orientation — codebase map

React + TypeScript + Vite + React Three Fiber. Single Zustand store. No backend — everything runs in the browser; LLM features call external APIs directly.

```
src/
  store/gameStore.ts              — single source of truth (~2000 lines)
  audio/                          — AudioManager, SoundEffects, AmbientEngine
  components/                     — R3F scene + React UI (all .tsx)
  utils/                          — pure logic, data, generators
```

### Key components
| File | Role |
|---|---|
| `Game.tsx` | Top-level scene container, mode switching (ship/walking), input controllers |
| `GameScene.tsx` | R3F scene root, projectile system, hit detection |
| `World.tsx` | Terrain generation + per-port spawn loops (trees, animals, POIs) |
| `Ship.tsx` | Player ship mesh, sail animation, swivel gun aim |
| `Player.tsx` | Walking-mode character |
| `NPCShip.tsx` | AI ships: hailing, collision, alert mode, flee logic |
| `Ocean.tsx` | Water rendering, climate-aware palettes |
| `ProceduralCity.tsx` | Port building placement + `BuildingStyle` rendering (~84KB) |
| `Pedestrians.tsx` | Walking NPCs in port cities |
| `Grazers.tsx` / `Primates.tsx` / `WadingBirds.tsx` / `Reptiles.tsx` | Wildlife templates (all implemented) |
| `PortModal.tsx` | Port UI: market, tavern, crew, upgrades tabs |
| `TavernTab.tsx` | Gemini-powered NPC conversation |
| `MarketTabLedger.tsx` | Ledger-style market, respects knowledge state |
| `ShipDashboard.tsx` | Status panel (HP, crew, cargo, etc.) |
| `JournalModal.tsx` / `Journal.tsx` | Knowledge record UI |
| `WorldMapModal.tsx` | D3 Mercator world map |
| `Minimap.tsx` | In-game minimap |
| `CrewDeathModal.tsx` / `GameOverScreen.tsx` | Death/game-over flow |
| `UI.tsx` | HUD: banners, notifications, keybind hints |

### Key utils
| File | Role |
|---|---|
| `commodities.ts` | Commodity defs (name, tier, `physicalDescription`, fraud risk) |
| `commodityHistoricalNotes.ts` | Longer-form historical notes |
| `worldPorts.ts` | Port coordinates, `SEA_LANE_GRAPH`, trade profiles |
| `portArchetypes.ts` | `CORE_PORTS` defs, climate, geography, `BuildingStyle` |
| `terrain.ts` | Perlin-based terrain, climate moisture/wind |
| `waterPalettes.ts` | Per-climate water colors |
| `wind.ts` | Wind direction/speed per port |
| `knowledgeSystem.ts` | Knowledge levels, crew domains, fraud rolls, display helpers |
| `journalTemplates.ts` | Auto-generated journal entry text |
| `crewGenerator.ts` | Starting + hireable crew |
| `npcShipGenerator.ts` | NPC ship identities (captain, ship name, appearance phrase) |
| `pedestrianSystem.ts` | Pedestrian generation for ports |
| `buildingLabels.ts` | Contextual building names (~42KB) |
| `cityGenerator.ts` | Procedural city layout |
| `combatState.ts` | Mutable combat state: aim, projectiles, NPC/wildlife positions |
| `huntLoot.ts` / `lootRoll.ts` | Hunting drops |
| `oceanEncounters.ts` | Random events at sea |
| `fishTypes.ts` | Fish species defs |
| `gameDate.ts` | In-game calendar |
| `tavernConversation.ts` / `tavernNpcGenerator.ts` | Tavern LLM conversation |
| `mapGenerator.ts` | Minimap tile generation |
| `performanceStats.ts` | FPS / draw call tracking |

## Current systems

### Reputation
Per-nationality score (−100 to +100) in `gameStore.ts` as `reputation: Partial<Record<Nationality, number>>`. `PORT_FACTION` maps port → controlling nationality. Actions: `adjustReputation`, `getReputation`.

- Collision with NPC ship: −5
- Cannon hit on NPC: −15
- Trade at port (buy or sell): +2 to port's faction
- Hail (T key): +1

Auto-generates journal entries at threshold crossings (−60, −25, +25, +60). NPC hail dialogue in `getHailResponse()` in `Game.tsx` scales by faction reputation. `nearestHailableNpc` in the store is set by `NPCShip.tsx` when the player is in hail range, read by the T handler.

**Not yet in Ship Dashboard** — planned for dashboard refresh.

### Combat — ship
`combatState.ts` holds mutable combat state (aim angle, projectiles, `npcLivePositions`). `ProjectileSystem` in `GameScene.tsx` renders via instanced mesh and checks hits each frame. `CameraController` in `Game.tsx` raycasts mouse onto y=0 water plane for aim.

- **Swivel gun**: aimable by mouse, reload `0.5s` (see `WEAPON_DEFS` in `gameStore.ts`). No ammo cost.
- **Broadside cannons** — Implemented as purchasable weapons: `minion`, `saker`, `demiCulverin`, `demiCannon`, `basilisk`. Per-port availability in `PORT_ARMORY` (e.g. Goa sells Portuguese arsenal; Surat sells Mughal heavy guns). Reload times 5–12s. Broadside firing mechanic (left/right salvos) is still being tuned — check with Ben before changing fire logic.
- **Hit**: NPC enters 8s alert mode (orange pulsing ring, 2.5x flee speed), −15 reputation, `CollisionBanner` in `UI.tsx` shows warning.
- **SFX**: `sfxCannonFire`, `sfxCannonImpact`, `sfxCannonSplash` in `src/audio/SoundEffects.ts`.

### Combat — land (hunting)
Walking-mode weapon system parallel to ship combat. `LandWeaponType` in gameStore, `cycleLandWeapon()` action, `huntAimAngle` / `landWeaponReload` in `combatState.ts`. Hits tracked against `wildlifeLivePositions` (populated each frame by animal components). Drops defined in `huntLoot.ts` + `lootRoll.ts`.

### Knowledge & information asymmetry
Core progression system. Goods exist at three knowledge levels (0 Unknown, 1 Identified, 2 Mastered), stored as `knowledgeState: Record<string, KnowledgeLevel>` in the game store.

- **Level 0**: displays `physicalDescription` ("a pungent dried seed"), price shows "???", sells at 20–40% of true value, full fraud risk.
- **Level 1**: real name, actual price, 50% fraud reduction.
- **Level 2**: full expert info, +15–20% sell price, fraud immunity.

**Implemented sources**:
- **Starting knowledge** by nationality (`generateStartingKnowledge()` in `knowledgeSystem.ts`).
- **Crew domains**: `CREW_KNOWLEDGE_DOMAINS` maps crew nationality → commodity set. Effective level = `max(player, any crew aboard)`. Knowledge reverts if the crew member leaves/dies.
- **Tavern gossip**: `TavernTab.tsx` uses Gemini Flash Lite (`tavernConversation.ts` + `tavernNpcGenerator.ts`) for free-form NPC conversation; NPC can identify goods, with ~20% unreliability on blind identifications.
- **Journal**: auto-generates entries on knowledge events, on reputation thresholds, and on significant encounters. UI: `JournalModal.tsx`, templates in `journalTemplates.ts`.

**Not yet implemented**: POI system (temples, monasteries, naturalist houses with LLM-powered conversations). See Planned section.

### World map
Single D3 Mercator projection in `WorldMapModal.tsx` (not tabs). Covers Atlantic + Indian Ocean in one view. 28 ports total — Indian Ocean core (Goa, Calicut, Surat, Diu, Cochin, Malacca, Aceh, Bantam, Macau, Aden, Mocha, Muscat, Socotra, Hormuz, Zanzibar, Mombasa, Mogadishu, Kilwa) + Atlantic expansion (Lisbon, Amsterdam, Seville, London, Elmina, Luanda, Salvador, Havana, Cartagena, Jamestown, Cape of Good Hope).

- Coordinates + `SEA_LANE_GRAPH` in `worldPorts.ts`.
- Archetypes (geography, climate, culture, `buildingStyle`) in `portArchetypes.ts`.
- Cape of Good Hope is the bottleneck between Atlantic and Indian Ocean — intentional.
- **Jamestown** is a London-only curiosity port (Virginia Company colony, ~300 settlers in 1612), not a general trade hub.

### Climate & vegetation
Climate profiles: `tropical`, `monsoon`, `arid`, `temperate`, `mediterranean`. Each drives water palette (`waterPalettes.ts`), moisture / vegetation (`terrain.ts`, `World.tsx`), and wind strength (`wind.ts`). Tree placement in `World.tsx` respects climate: temperate = firs only, mediterranean = mixed firs + coastal palms, tropical/monsoon = palms dominant.

### Spiritual buildings & sacred-site system
Each port carries a typed faith list (`PORT_FAITHS` in `src/utils/portReligions.ts`) derived from its real c.1612 demographics, ordered by prominence. 10 faith keys: `catholic`, `protestant`, `sunni`, `shia`, `ibadi`, `hindu`, `buddhist`, `chinese-folk`, `animist`, `jewish`.

**Placement** (`cityGenerator.ts`, step 2c): up to 3 spiritual buildings per port (capped 1/2/3 by Small/Medium/Large+). Each faith gets one, in prominence order. Scoring prefers inland, elevated, and well-separated sites. `BUILDING_SIZES.spiritual = [8, 4, 8]` reserves a clearing around them. They register as road-connection anchors (priority 0, alongside market/plaza).

**Landmark / generic deduplication**: some `PortLandmark` entries are themselves religious (Bom Jesus, Oude Kerk, Giralda, Al-Shādhilī, Mesjid Agung, Tali gopuram, Jesuit College, Palacio de la Inquisición). When a landmark represents a faith on the port's faith list, the generator drops that faith from the generic spiritual loop and seeds the landmark cell into the separation-avoidance set so the remaining faiths stay spatially separated from it. See `LANDMARK_FAITH` map in `cityGenerator.ts`.

**Landmark building type**: landmarks live as `type: 'landmark'` (a real `BuildingType`), not as `type: 'fort'` with a landmarkId marker. Every `Record<BuildingType, …>` table (`SCALE_COUNTS`, `BUILDING_SIZES`, `BUILDING_ACTIVITY`, `BUILDING_CLEARANCE`, `BUILDING_TRAFFIC`, the road-anchor priority order) has a landmark entry. Render dispatch in `ProceduralCity.tsx` gates on `b.type === 'landmark' && b.landmarkId` before drawing the custom geometry; the generic `'fort'` branch never sees landmarks. Label dispatch in `buildingLabels.ts` looks up `LANDMARK_LABELS[landmarkId]` first and returns label+sub. When adding a new landmark: register in `LANDMARK_RULES` (cityGenerator.ts), `LANDMARK_LABELS` (buildingLabels.ts), `LANDMARK_CLASS` (semanticClasses.ts), and the renderer dispatch (ProceduralCity.tsx). Religious landmarks additionally need an entry in `LANDMARK_FAITH` (cityGenerator.ts) so the generic spiritual-building loop dedupes against them.

**Rendering** (`ProceduralCity.tsx`, `b.type === 'spiritual'` branch): per-faith geometry within the 8×8 reserved footprint — Catholic nave+tile roof+bell tower+cross; Protestant brick hall+pyramid-cap tower; Sunni/Shia dome+minaret (Safavid-blue dome for Shia); Ibadi plainer cube+short minaret; Hindu stepped shikhara+copper roofs+brass flag mast; Buddhist tiered red+gold pagoda; Chinese-folk red-pillar hall+green sweeping tile roof; animist raised platform+thatch canopy+fetish pole+stone altars; Jewish stone hall+small dome+arched windows+Star of David.

**Sacred markers** (Sims "plumbob" style): floating glowing purple octahedron + billboard halo above every spiritual building and every religious landmark. Instanced (`SacredBuildingMarkers` in `ProceduralCity.tsx`) — one draw call for diamonds, one for halos. Toggleable in Settings → Display → Map Markers → "Sacred Site Markers". Defaults on. State in `RenderDebugSettings.sacredMarkers` in `gameStore.ts`.

**Labels**: `buildingLabels.ts` has a `spiritualLabel()` generator (faith + culture + region aware — e.g. Igreja de São Francisco, Zuiderkerk, Masjid al-Jāmiʿ, Tali Śiva Kōvil, Bet Yaʿaqov Synagogue) and a `LANDMARK_LABELS` override table for all 13 named landmarks. Eyebrows (RELIGIOUS / CIVIC / ROYAL / LEARNED / MERCANTILE) are not set here — they come from the semantic class system (see below). `BuildingTooltip.tsx` renders the eyebrow as a glowing all-caps prefix above the title; `drawBuildingLabel()` in `worldLabelTextures.ts` bumps the label canvas height from 84 → 104 when an eyebrow is present.

### Semantic classes
`src/utils/semanticClasses.ts` is the single source of truth for what "kind of important thing" a building is. Five classes with their own color and optional 3D marker:
- `religious` — purple `#c4a1ff`, diamond marker (only class with an always-on 3D marker today)
- `civic` — gold `#e8c872`, hover-only (forts, town halls, civic markets, customs houses)
- `learned` — pale blue `#9bc4e8`, hover-only (colleges, hospitals, apothecaries, observatories, libraries)
- `mercantile` — teal `#6dc3b0`, hover-only (guild halls, factories, counting houses)
- `royal` — crimson `#e89b9b`, hover-only (viceroyalty, treasury, inquisition, crown fortresses)

The resolver `buildingSemanticClass(b)` maps buildings to classes: all spiritual buildings → `religious`; landmarks → `LANDMARK_CLASS[landmarkId]`; generic buildings → null (keeps the eyebrow signal scarce). `cityGenerator.ts` calls the resolver after labels are assigned and stamps `labelEyebrow` + `labelEyebrowColor` onto the Building. `BuildingTooltip.tsx` reads both fields. `SacredBuildingMarkers` in `ProceduralCity.tsx` filters by `SEMANTIC_STYLE[class].marker === 'diamond'` instead of maintaining a separate religious-landmarks set.

The table is designed to extend into POIs. When the POI system lands, `POIDefinition` will carry `class: SemanticClass`, and the marker renderer will iterate both building and POI lists through the same style lookup.

### Building style system
`buildingStyle` on `PortDefinition` is the visual-only differentiator (separate from `culture`, which drives gameplay — markets, flags, language, awning dyes). 14 styles currently defined: `iberian`, `dutch-brick`, `english-tudor`, `luso-colonial`, `swahili-coral`, `arab-cubic`, `persian-gulf`, `malabar-hindu`, `mughal-gujarati`, `malay-stilted`, `west-african-round`, `luso-brazilian`, `spanish-caribbean`, `khoikhoi-minimal`.

Rendering lives in `ProceduralCity.tsx`. Differentiation is palette + proportion + weighted variant mix, plus three cheap feature primitives: **stilts**, **wind-catcher**, **veranda**. No per-facade detail. `PortLandmark` type exists as a data scaffold but the landmark renderer is not yet built.

### Wildlife
Four templates, all implemented: `Grazers.tsx`, `Primates.tsx`, `WadingBirds.tsx`, `Reptiles.tsx`. Each is an instanced mesh with per-port variants (color, scale, herd/flock size, biome preference).

- Behaviors: ground scatter (grazers, reptiles), tree scatter (primates), fly-away scatter (wading birds).
- Spawn in `World.tsx` vertex loop, excluded within 90 units of port center (`CITY_EXCLUSION_SQ`).
- Animation gated by `ANIM_RANGE_SQ` (120²) around player for perf.
- Hit detection via `wildlifeLivePositions` in `combatState.ts`; loot via `huntLoot.ts`.

### Ship upgrades
`ShipUpgradeType` enum (8 upgrade types) + `PORT_UPGRADE_POOLS` mapping ports → available upgrades, with effects applied via `ShipUpgrade` interface. Available in the Upgrades tab of `PortModal.tsx`.

### Weapons purchasing
`PORT_ARMORY` in `gameStore.ts` lists weapons each port sells. `MAX_CANNONS` bounds total armament. Player's armament is `state.stats.armament: WeaponType[]`.

### Walking mode
`playerMode: 'ship' | 'walking'`. `Player.tsx` is the character controller, `landCharacter.ts` holds avatar config. Pedestrians (`Pedestrians.tsx`, generated by `pedestrianSystem.ts`) populate port streets. Buildings tooltip on hover via `BuildingTooltip.tsx` (labels from `buildingLabels.ts`).

### Road & path rendering
Three small modules share one invariant: the renderer, the ground-height resolver, and the topology pass all read road tier geometry from one place so they can't drift.

- **`src/utils/roadStyle.ts`** — single source of truth. `ROAD_TIER_STYLE[tier]` exposes `width`, `yLift`, `renderOrder`, `polygonOffsetFactor`, and an optional `walkHalfWidth` override (bridges use 1.6 inside a 4.5-wide visible deck). Farm-track constants (`FARM_TRACK_WIDTH`, `FARM_TRACK_Y_LIFT`, `FARM_TRACK_OPACITY`) live here too — farm tracks stay on tier `'path'` in the data model and are identified by id prefix `farm_track_`.
- **`src/utils/roadSurface.ts`** — `buildRoadSurfaceIndex(roads)` buckets every segment into an 8u XZ grid at port-load time; `getGroundHeight(x, z, index)` returns `max(terrainY, lifted road surface)` across all tiers whose footprint contains (x, z). Characters stand on road ribbons, not terrain. Callers: `Player.tsx`, `pedestrianSystem.ts` (both store the index in a ref / state slot, rebuild only on port change).
- **`src/utils/roadTopology.ts`** — generation-time pipeline: `densify → weld+junction → densify → buildRoadGraph`. Run once in `mapGenerator.ts` on the merged city+hinterland roads; result attached to the port as `roadGraph`. Densify subdivides segments >1u and resamples terrain Y; weld finds each non-bridge endpoint's nearest other-road segment within 1.5u and either merges endpoints (if both are endpoints within 0.6u) or inserts a T-junction vertex on the target and trims the welded endpoint back to the target's edge. Trimmed endpoints resample Y directly. A `WeldManifest` records each T-weld's logical anchor so `buildRoadGraph` still sees T-welded endpoints as junctions (degree ≥ 2) rather than dead-ends.
- **Ribbon rendering** (`buildRoadRibbon` in `ProceduralCity.tsx`) — takes `taperStart` / `taperEnd` flags. `CityRoads` derives them from `port.roadGraph`: a node of `degree === 1` is a true dead-end (taper to 85%); anything else stays full width so the ribbon meets the target cleanly. The builder also miters sharp turns (>~75°) by splitting the shared vertex into two per-segment perpendicular pairs to avoid outer-edge pinching.

**Stacking at overlaps** is deterministic via a three-way bias: yLift (path 0.06 / road 0.10 / avenue 0.16 / bridge polyline Y), `renderOrder` (1 / 2 / 3 / 4), and `polygonOffsetFactor` (−1 / −2 / −4 / −6). The wider tier always wins at a junction regardless of camera angle. Don't hardcode any of these three values in a new road mesh — pull from `ROAD_TIER_STYLE` and `ROAD_POLYGON_OFFSET_UNITS`.

### View modes
`viewMode: 'default' | 'cinematic' | 'topdown' | 'firstperson'`, cycled by `cycleViewMode()`. Each mode retargets camera offset + look behavior.

### Wind, day/night
- `wind.ts` exposes direction/speed; Ocean.tsx uses it for waves, Ship.tsx for sail animation.
- `timeOfDay: 0-24` + `dayCount` advance via `gameDate.ts`. Day length scales game time.
- No weather system. Ocean/sky mood comes from climate palettes + time of day. If you want a dramatic storm, build it as a scripted event, not a background simulation.

### Audio
`src/audio/AudioManager.ts` is the singleton. `SoundEffects.ts` exposes one-shot SFX (cannon, UI, crab collect, etc.). `AmbientEngine.ts` handles layered ambient loops keyed to biome and time of day.

### Save/load, settings, debug
- **SettingsModal.tsx**: gameplay + audio + render toggles.
- **`RenderDebugSettings`** in gameStore: individually disable shadows, bloom, postprocessing, fog, etc. for perf debugging.
- **Performance stats** tracked in `performanceStats.ts`.

### Fishing / crabs
`FishShoalEntry` in gameStore, fish types in `fishTypes.ts`, `collectCrab()` action. Fishing spots respawn. Used as subsistence + journal flavor, not a major economic system.

### Crew death + game over
`killCrewMember()` removes a crew member, adds to `deadCrew`. `CrewDeathModal.tsx` surfaces the event. `triggerGameOver()` → `GameOverScreen.tsx` when captain dies or ship is destroyed.

### Opening / arrival flow
`Opening.tsx` handles intro splash. `ArrivalCurtain.tsx` plays when the player enters a new port.

## Planned / in progress

### POI System (largest unbuilt feature)
Points of Interest on local port maps — temples, monasteries, naturalist houses, guilds. Each POI is a location you sail/walk to with its own modal containing a **Learn** tab (knowledge acquisition against defined cost) and a **Converse** tab (Gemini-powered in-character conversation, extending the pattern from `TavernTab.tsx`).

Planned data model — not yet in code:

```typescript
interface POIDefinition {
  id: string;
  name: string;
  type: 'temple' | 'monastery' | 'naturalist' | 'merchant_guild' | 'ruin' | 'garden' | 'court';
  port: string;
  position: [number, number];
  knowledgeDomain: string[];      // commodity IDs identifiable here
  masteryGoods: string[];         // subset upgradeable to Mastered
  cost: { type: 'gold' | 'commodity' | 'reputation'; amount?: number; commodityId?: string };
  npcName: string;
  npcRole: string;
  lore: string;                   // LLM context
  unlocksPort?: string;
}
```

Example POIs by port (drafted, not built): Goa → Jesuit College of St. Paul; Calicut → Temple of Thalassery; Malacca → Chinese merchant guild; Mocha → Sufi lodge; Hormuz → Persian royal factor; Surat → Banyan merchant house; Macau → Jesuit observatory; Bantam → pepper gardens; Socotra → aloe groves; Lisbon → Royal Hospital of All Saints; Amsterdam → VOC Spice Warehouse; London → Apothecaries' Hall; Salvador → Jesuit college; Cartagena → Inquisition library; Cape → Khoikhoi pastoral camp.

Files to create: `src/utils/poiDefinitions.ts`, `src/utils/poiConversation.ts`, `src/components/POIModal.tsx`, `src/components/POIMarker.tsx`.

### Fraud detection surface
Fraud rolls on Unknown-level purchases are specced in `knowledgeSystem.ts` design but the reveal-on-sale moment + Gujarati factor warning on purchase are not yet wired into `MarketTabLedger.tsx` / `PortModal.tsx`.

### Reputation on Ship Dashboard
Deferred until the dashboard redesign.

### Manila + Lima / Callao
Planned when Pacific expansion ships. Two new building styles: `spanish-andean` (adobe, max 2 stories, deep eaves, arcaded plaza) and `manila-hybrid` (weighted mix: 30% `luso-colonial` stone, 40% `malay-stilted` bahay kubo, 20% Chinese shophouse with `upturnedEave`, 10% thatch). Only one new feature primitive needed: `upturnedEave`.

### Playable factions / randomized start
Currently the game always starts as English captain of "The Dorada". Plan: 7 playable factions (English, Portuguese, Dutch, Spanish, Gujarati, Omani, Chinese), randomized on new game. All faction-keyed infrastructure (crew, cargo, starting knowledge, ship name pools, hull/sail palettes) already exists in `npcShipGenerator.ts` + `crewGenerator.ts` + `commodities.ts` + `knowledgeSystem.ts`.

- **Phase 1 (done / in progress)**: the 4 European factions. All four map to the `european` visual family so `Ship.tsx` renders correctly without changes. Wiring is faction → `{ shipType, shipName, homePortId }` in `gameStore.ts`, with `shipName` pulled from `SHIP_NAMES` in `npcShipGenerator.ts`. Home ports: London / Lisbon / Amsterdam / Seville.
- **Phase 2 (deferred)**: Gujarati + Omani (dhow family) and Chinese (junk family). Requires extracting `DhowLikeModel` and `JunkModel` from `NPCShip.tsx` into shared components, making `Ship.tsx` swap its visual mesh by family, and re-anchoring cannons / anchor / sail-trim for non-european hull proportions. Also needs home-port verification for Surat, Muscat, Quanzhou.
- **Not doing**: per-faction hull/sail colors in phase 1. `Ship.tsx` colors are hardcoded in ~20 `meshStandardMaterial` tags; plumbing them through is phase 2 scope.

### Hunting polish
Loot tables exist and basic hit detection works. Still rough: animal scatter should be more aggressive after being shot, death/butcher animation, species-specific drops that matter economically (ivory from elephants if added, hides, exotic feathers).

### Sound effects for wildlife scatter
Hoofbeats, bird wingbeats, splashing — not yet in `SoundEffects.ts`.

## Gotchas

- **Large files — search before adding.** A handful of files hold most of the code and grep is faster than re-implementing:
  - `gameStore.ts` ~1700 lines (all state, all actions)
  - `UI.tsx` ~2400 lines (HUD, tabs, many modals)
  - `ASCIIDashboard.tsx` ~3600 lines (entire ASCII mode)
  - `World.tsx` ~2800 lines (terrain + all per-port spawn loops)
  - `ProceduralCity.tsx` ~1800 lines (city gen + building rendering)
  - `buildingLabels.ts` ~42KB (cultural name pools)
  Grep before writing a new action, selector, or label pool — odds are it exists.
- **Three port registries must stay in sync**: `CORE_PORTS` in `portArchetypes.ts` (visual/geographic), `worldPorts.ts` (coordinates + trade + `SEA_LANE_GRAPH`), and `PORT_FACTION` + `PORT_CULTURAL_REGION` in `gameStore.ts`. String-keyed — typos are silent. When adding a port, update all three.
- **`npcLivePositions` / `wildlifeLivePositions`**: mutable maps in `combatState.ts` that each NPC ship / animal instance writes to every frame. `ProjectileSystem` reads them for hit detection. If you add a new shootable entity, it needs to participate in this pattern.
- **Effective knowledge level**: always `max(player.knowledgeState[id], max of crew domains)`. Never read the player's level alone.
- **`culture` vs `buildingStyle`**: culture drives gameplay (markets, NPCs, flags, language, awning dyes, shack palette, fort wall material). buildingStyle drives only houses/warehouses/estates. Don't conflate them when adding ports.
- **Mediterranean and temperate vegetation**: gated in `World.tsx`'s tree placement block. Temperate suppresses palms entirely; mediterranean allows palms only at low elevations.
- **City exclusion radius**: animals and some decorations are suppressed within 90 units of port center. If a new entity spawns in the city, it needs to bypass or respect this.
- **Slavery**: excluded from procgen. No Afro-diasporic names in `crewGenerator.ts` / `pedestrianSystem.ts` / `npcShipGenerator.ts`. Where the historical trade touches it, content is discrete and hand-written. Ask before adding anything procedural adjacent to this.
- **Gemini API costs**: tavern conversations maintain history for the duration of a port visit. Keep replies short (2–4 sentences) and cap token budget. Same pattern will apply to POI Converse.
- **Shared `Ship.tsx`**: the player ship and NPC ships both use `Ship.tsx`. Props differentiate them. Don't hardcode player-only behavior into the mesh.
- **R3F perf**: prefer instanced meshes for anything with >20 instances. Gate per-frame work by distance-to-player (pattern: `ANIM_RANGE_SQ`). Check `performanceStats.ts` before and after adding per-frame logic.
- **Don't allocate in `useFrame`.** No `new THREE.Color()`, `new THREE.Vector3()`, or fresh arrays per frame. Cache at module/ref scope and mutate in place. The codebase has a few existing violations (e.g. sky color lerp in `World.tsx`) — don't add more.
- **Store access inside `useFrame`**: the pattern is `useGameStore.getState()` (direct, non-subscribing), not `useGameStore(selector)`. The hook form re-renders the component on every store change, which is wrong inside a render loop. Copy the existing pattern.
- **Determinism via `mulberry32`**: procedural generators (cities, labels, NPCs, portraits, terrain) use mulberry32-seeded RNG so the same port looks the same across sessions. The function is currently re-implemented in ~9 files — if you're adding generation code, copy the existing implementation from a nearby file rather than importing a new one. Consolidating into `src/utils/rng.ts` is on the cleanup list but hasn't happened; don't do it as a drive-by refactor.
- **Historical dates**: game start is **May 1, 1612** (see `gameDate.ts`). Features, ships, weapons, commodities should be plausibly available in that year. Tobacco and cacao are new-entrant commodities; cinchona bark is barely known; Virginia tobacco = 1612 John Rolfe first crop; the Dutch are emerging rivals to the Portuguese, not yet dominant. If a tavern prompt or LLM system prompt says "around 1600–1620," pin it to 1612.
- **Road tier constants live in `roadStyle.ts`**, not inline. If you add a new road-like surface (e.g. market flagstones, a canal towpath), either route it through an existing tier or extend `ROAD_TIER_STYLE` — don't hardcode `yLift`, `polygonOffsetFactor`, or `width` in a new mesh. The renderer and the ground-height resolver both read from this table; drift between them is what caused the old "player sinks into road" bug.
- **Road polyline Y semantics**: for `path` / `road` / `avenue`, `points[i][1]` is terrain height at that (x, z). The visible ribbon sits at `polylineY + tier.yLift`. For `bridge`, the polyline Y is the authored deck ramp (terrain at abutments, `SEA_LEVEL + 0.8` over water). `getGroundHeight()` and the renderer both respect this — don't confuse bridge polyline Y with other tiers.
- **Road generation runs once per port**, inside `mapGenerator.ts`. `postprocessRoads()` mutates the roads array in place (densify + weld) and returns the graph. If you generate roads at runtime (you shouldn't), you also have to rebuild `port.roadGraph` and any downstream `RoadSurfaceIndex` refs — they are cached on `useEffect` / `initPedestrianSystem`.

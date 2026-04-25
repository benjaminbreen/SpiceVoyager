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
- **Testing is now minimal but real.** `npm run lint` is still `tsc --noEmit`, `npm test` runs the Vitest unit suite, and `npm run test:e2e` runs the Playwright browser smoke test. For UI / 3D / gameplay work, don't treat those as sufficient proof of visual correctness; Ben still needs to sanity-check in the browser.
- **For UI / 3D / gameplay changes, you cannot verify correctness by types alone.** Report what you changed and ask Ben to sanity-check in the browser. Don't claim visual/feel outcomes you haven't seen.
- **Historical claims in code/content**: when introducing a fact (a commodity's origin, a port's 1612 political status, an NPC role), cite it or flag it as your inference. Ben will catch errors; better to flag than to assert.
- **LLM-generated prose in-game**: keep NPC dialogue short, period-specific, and plain. No "Ah, a fellow traveler of the seven seas" style openings.
- **Don't invent features to document.** If AGENTS.md has a gap, ask — don't fill it with speculation.

### Testing roadmap
- Build testing in layers, not as one giant suite: pure logic first, then store integration, then browser scenarios, then seeded screenshot/performance checks.
- Phase 1 goal: install a real harness (`vitest` + `playwright`), add a deterministic test boot path, and prove it with a few smoke tests.
- Determinism first: if a system relies on `Math.random()` or live external APIs, either inject a seedable RNG or mock it before adding broad coverage.
- Browser tests should target fixed seeded scenes and explicit debug toggles; avoid free-roaming screenshot tests.
- Performance tests should read the existing runtime stats event and enforce budgets on a few canonical scenes, not every port.

### Testing progress
- 2026-04-23: Phase 1 complete. Added the real harness: `vitest`, `playwright`, deterministic `testMode` URL hooks, opening-overlay bypass, and the first smoke/unit coverage. Baseline verification reached `npm run lint`, `npm test`, and an initial `npm run test:e2e`.
- 2026-04-23: Phase 2 complete. Added store-level integration coverage for core gameplay actions: `buyCommodity`, `sellCommodity`, `adjustReputation`, `damageShip`, `fastTravel`, `killCrewMember`, and `learnAboutCommodity`. Verified with `npm run lint` and `npm test`.
- 2026-04-25: Phase 3 partially implemented, not complete. Added Playwright-facing hooks/selectors for market, arrival, toast, and world-map flows, plus `tests/e2e/gameplay.spec.ts`. Missing: stable green browser scenarios for market/arrival/world-map, and a clean full `npm run test:e2e` pass.

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
| `cityDistricts.ts` | District classification + boundary pruning |
| `cityBuildings.ts` | Per-building form assignment (stories, setback, housing class) |
| `cityFields.ts` | Additive field model (sanctity/prestige/centrality/…) |
| `semanticClasses.ts` | Eyebrow + marker classes (RELIGIOUS / CIVIC / LEARNED / MERCANTILE / ROYAL) |
| `portReligions.ts` | Per-port faith list → spiritual buildings |
| `palaceStyles.ts` | Per-port palace style → royal palace buildings |
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
Single D3 Mercator projection in `WorldMapModal.tsx` (not tabs). Covers Atlantic + Indian Ocean + the western Pacific in one view. 29 ports total — Indian Ocean / East Indies core (Goa, Calicut, Surat, Diu, Malacca, Bantam, Macau, Aden, Mocha, Muscat, Socotra, Hormuz, Zanzibar, Mombasa, Masulipatnam) + East Asian terminus ports (Manila, Nagasaki) + Europe (Lisbon, Amsterdam, Seville, London, Venice) + West Africa (Elmina, Luanda) + Atlantic Americas (Salvador, Havana, Cartagena, Jamestown) + Cape of Good Hope.

- Coordinates + `SEA_LANE_GRAPH` in `worldPorts.ts`.
- Archetypes (geography, climate, culture, `buildingStyle`) in `portArchetypes.ts`.
- Cape of Good Hope is the bottleneck between Atlantic and Indian Ocean — intentional.
- **Jamestown** is a London-only curiosity port (Virginia Company colony, ~300 settlers in 1612), not a general trade hub.
- **Venice** is reachable only from Lisbon/Seville via the Mediterranean passage — Levantine ports (Alexandria, Aleppo, Constantinople) are not modelled, so Venice stands in for the whole Levant-pepper channel. Ships spawn there as `ottoman_red_sea` (proxy for Levantine galleys) alongside Iberian/French/English Atlantic.
- **Manila / Nagasaki / Masulipatnam** are 1612-specific additions. Manila is the Sangley-Parián + Spanish Intramuros node (galleon link to Acapulco not yet modelled); Nagasaki is the Portuguese Nao do Trato terminus, two years before the 1614 Christian expulsion; Masulipatnam is the Qutb Shahi Golconda port with both VOC (1606) and EIC (1611) factories — the Deccan gateway on the Coromandel.

### Climate & vegetation
Climate profiles: `tropical`, `monsoon`, `arid`, `temperate`, `mediterranean`. Each drives water palette (`waterPalettes.ts`), moisture / vegetation (`terrain.ts`, `World.tsx`), and wind strength (`wind.ts`). Tree placement in `World.tsx` respects climate: temperate = firs only, mediterranean = mixed firs + coastal palms, tropical/monsoon = palms dominant.

### Building system
Port cities are composed of typed `Building`s placed by `cityGenerator.ts` and rendered by `ProceduralCity.tsx`. Three orthogonal axes control a building's identity and presentation:

- **`type: BuildingType`** — what the building *is* mechanically (drives placement, occupancy, pedestrian traffic, road priority, district classification).
- **`district: DistrictKey`** — what *neighborhood* it sits in (drives form assignment: stories, setback, housing class).
- **semantic class** — what *category of importance* it signals to the player (drives hover eyebrow color + optional 3D marker). Computed from `type` + `landmarkId` + other fields at generation time.

#### BuildingType catalog
12 types in `gameStore.ts`, each with distinct placement and rendering logic:

| Type | Count | Placement | Notes |
|---|---|---|---|
| `dock` | 1-6 by scale | Along coast | Anchor for avenue network. Moors boats. |
| `warehouse` | 1-5 by scale | Near docks / waterside | Anchor. Long+low when waterside. |
| `fort` | 0-2 by scale | Commanding ground (ridge/headland) | Anchor. Auto-tagged `civic` semantic class. |
| `estate` | 0-7 by scale | Prestigious cells (high prestige field) | Gets `housingClass: 'elite'`. |
| `market` | 0-4 by scale | Urban core | Anchor. Culture-keyed name (bazaar/chowk/praça…). |
| `plaza` | 0-2 by scale | Urban core | Anchor. Flat footprint, no height. |
| `house` | 8-110 by scale | Field-driven | Bulk of city. Stories/setback from district + form assigner. |
| `shack` | 5-25 by scale | Fringe / waterside | Poor housing. |
| `farmhouse` | 3-20 by scale | Fringe / outer ring | Rural. |
| `spiritual` | 0-3 per port | Inland, elevated, separated | Driven by `PORT_FAITHS` (portReligions.ts). Carries `faith` field. Always `religious` class. |
| `landmark` | 0-1 per port | Per-port `LANDMARK_RULES` (historical positioning) | Carries `landmarkId`. Bespoke geometry. Class from `LANDMARK_CLASS`. |
| `palace` | 0-1 per port | Inland, elevated, central-ish, separated from fort+spirituals | Driven by `PORT_PALACE_STYLE` (palaceStyles.ts). Carries `palaceStyle` field. Always `royal` class. Skipped when port has a `royal`-classed landmark. |

#### Adding a new BuildingType — where to touch
Every `BuildingType` must have an entry in all of these `Record<BuildingType, …>` tables (TypeScript's exhaustiveness check catches misses, unless someone bypasses with `as Record<…>`):

| File | Table | Purpose |
|---|---|---|
| `cityGenerator.ts` | `SCALE_COUNTS[scale][type]` | Count per scale (0 = placement driven by per-port data, not this table) |
| `cityGenerator.ts` | `BUILDING_SIZES[type]` | `[w, h, d]` occupancy footprint |
| `cityGenerator.ts` | road-anchor sort order | Road connection priority (0 = highest) |
| `landCharacter.ts` | `BUILDING_ACTIVITY[type]` | Urban-heat contribution to settlement score |
| `pedestrianSystem.ts` | `BUILDING_CLEARANCE[type]` | Corridor-endpoint offset from building center |
| `pedestrianSystem.ts` | `BUILDING_TRAFFIC[type]` | Pedestrian traffic weight |
| `cityDistricts.ts` | `BUILDING_TYPE_HINT[type]` | Optional district hint (fort→citadel, palace→elite-residential, spiritual→sacred, etc.) |
| `cityDistricts.ts` | `ANCHOR_TYPES` set | Whether the type is pruned-protected |
| `cityBuildings.ts` | `isAnchor` check | Whether form assignment skips the type (anchors have bespoke geometry) |
| `cityFields.ts` | `BUILDING_FIELD_INFLUENCE` | Optional: how the building emits to sanctity/prestige/nuisance/etc fields (Partial — omit for no influence) |
| `semanticClasses.ts` | `buildingSemanticClass()` | Map type → semantic class (may return null) |
| `ProceduralCity.tsx` | render dispatch | Bespoke geometry branch |
| `buildingLabels.ts` | type switch + naming helper | Label + sub for the type |

When the new type is a per-port singleton driven by external data (spiritual, landmark, palace), also create a helper module: `portReligions.ts` / `palaceStyles.ts` style, and thread through `mapGenerator.ts` → `generateCity()`.

#### Semantic classes (eyebrow + marker system)
`src/utils/semanticClasses.ts` is the single source of truth for what *category of importance* a building signals. Five classes, each with a color and an optional 3D marker:

| Class | Color | Marker | Covers |
|---|---|---|---|
| `religious` | purple `#c4a1ff` | Sims-style diamond (plumbob) | All `spiritual`; religious landmarks (Bom Jesus, Oude Kerk, Giralda, Al-Shādhilī, Mesjid Agung, Tali gopuram, Jesuit College) |
| `civic` | gold `#e8c872` | hover-only | All generic `fort`; civic landmarks (Belém, Fort Jesus, Diu, Elmina) |
| `learned` | pale blue `#9bc4e8` | hover-only | LEARNED landmarks (Colégio de São Paulo @ Macau) |
| `mercantile` | teal `#6dc3b0` | hover-only | MERCANTILE landmarks (English Factory @ Surat) |
| `royal` | crimson `#e89b9b` | hover-only | All `palace`; royal landmarks (Tower of London, Palacio de la Inquisición) |

The resolver `buildingSemanticClass(b)` is called after labels are assigned in `cityGenerator.ts` and stamps `labelEyebrow` + `labelEyebrowColor` onto the Building. `BuildingTooltip.tsx` reads both fields. `SacredBuildingMarkers` in `ProceduralCity.tsx` iterates buildings and filters by `SEMANTIC_STYLE[class].marker === 'diamond'` — no separate landmark-specific set.

When adding a new marker shape (e.g. a crown for ROYAL): extend `SemanticStyle['marker']` union, add the shape to `SEMANTIC_STYLE[class].marker`, add a render branch in `SacredBuildingMarkers`. One-line changes in each place.

The system extends cleanly to POIs: `POIDefinition` will carry `class: SemanticClass`, and the marker renderer will iterate buildings + POIs through the same `SEMANTIC_STYLE` lookup. A pilgrimage shrine POI inland of Calicut would get the exact same purple plumbob as an in-city spiritual building, with zero new visual code.

#### Per-port singleton building systems
Three types are placed as 0-1 per port based on external data tables, all following the same pattern:

- **Spiritual** (`portReligions.ts` → `PORT_FAITHS`): list of faith keys per port in prominence order. Generator places up to 3 (capped 1/2/3 by Small/Medium/Large+). Per-faith bespoke geometry in `ProceduralCity.tsx`: Catholic nave+tile+bell tower+cross; Protestant brick hall+pyramid tower; Sunni/Shia dome+minaret (blue dome for Shia); Ibadi plain cube+short minaret; Hindu stepped shikhara+copper+brass flag; Buddhist red+gold pagoda; Chinese-folk red-pillar hall+sweeping green tile; animist raised platform+thatch canopy+fetish pole; Jewish stone hall+small dome+Star of David.
- **Landmark** (`portArchetypes.ts` `landmark` field + `LANDMARK_RULES` in cityGenerator + `LANDMARK_LABELS` in buildingLabels + `LANDMARK_CLASS` in semanticClasses + render dispatch in ProceduralCity): 13 named monuments today. Religious landmarks also need `LANDMARK_FAITH` entry so the generic spiritual loop dedupes against them.
- **Palace** (`palaceStyles.ts` → `PORT_PALACE_STYLE`): keyed to ruling culture. 3 styles implemented (`iberian-colonial`, `mughal`, `malay-istana`) covering 13 ports. Phase-2 candidates: `ottoman` (Aden, Mocha), `swahili` (Mombasa/Zanzibar), `omani` (Muscat), `hindu-zamorin` (Calicut). Skipped when the port already has a `royal`-classed landmark.

#### Sacred-site markers
Floating glowing purple octahedron + camera-billboarded halo above every building whose semantic class has `marker === 'diamond'`. Instanced — one draw call for diamonds, one for halos. Toggleable at Settings → Display → Map Markers → "Sacred Site Markers". Defaults on. State in `RenderDebugSettings.sacredMarkers`.

#### Hover labels
`BuildingTooltip.tsx` reads `b.label`, `b.labelSub`, `b.labelEyebrow`, `b.labelEyebrowColor`. `drawBuildingLabel()` in `worldLabelTextures.ts` renders the eyebrow (if present) as a glowing all-caps prefix above the title; canvas height bumps from 84 → 104 when an eyebrow is present. Label text comes from `buildingLabels.ts` via `generateBuildingLabel()` — dispatches on type with per-type naming pools + cultural/regional variations + named-landmark / faith / palace-style overrides.

### District system
Every non-generic building carries a `district: DistrictKey`. Seven districts in `cityDistricts.ts`:

| District | Color | Driven by | Typical contents |
|---|---|---|---|
| `citadel` | dark red | fort + landmark (fallback for out-of-footprint) | Forts, military landmarks |
| `sacred` | purple | sanctity field + spiritual type hint | Churches, mosques, temples, sacred groves (future POIs) |
| `urban-core` | amber | centrality + access fields | Markets, plazas, dense merchant housing |
| `elite-residential` | cream | prestige + centrality fields + palace/estate hints | Estates, palaces, governor's residences |
| `artisan` | brown | centrality + nuisance fields | Workshops, craft housing |
| `waterside` | blue | waterfront + access/nuisance fields | Docks, waterside warehouses |
| `fringe` | green | low centrality/access | Farmhouses, shacks, edge housing |

Classification happens in two places:
- **`classifyDistrict(fieldValues, scale, buildingType?)`**: samples the additive field model at a point and picks a district. Building-type hints override (e.g. `palace` → `elite-residential`, `spiritual` → `sacred`) before field classification runs. Scale-gating demotes forbidden districts (Small ports can't have `elite-residential` or `artisan`).
- **`classifyBuildingDistrict(b, …)`**: convenience wrapper that samples the field at the building's position.

Scale → district requirements (`REQUIRED_BY_SCALE`): Small has `urban-core`; Medium adds `sacred`; Large adds `waterside`; Very Large adds `elite-residential` + `artisan`; Huge adds `citadel` + `fringe`. Districts drive form assignment in `cityBuildings.ts` (stories, setback, housing class) and district-boundary pruning (`pruneDistrictBoundaries()` drops housing whose neighborhood is dominated by a different district — creates visible separation between neighborhoods).

Field model (`cityFields.ts`) is the substrate: buildings and roads emit falloff into per-cell fields (`sanctity`, `prestige`, `centrality`, `access`, `waterfront`, `nuisance`, `safety`, `danger`), and classification reads those fields. `spiritual`, `palace`, and `landmark` emit field influence too — spirituals radiate sanctity into their precinct, palaces radiate prestige+safety, so housing around them tags correctly via field classification rather than relying on the type-hint layer alone.

### Building style (houses only)
`buildingStyle` on `PortDefinition` is the visual-only differentiator for generic `house` geometry (separate from `culture`, which drives gameplay — markets, flags, language, awning dyes). 14 styles currently defined: `iberian`, `dutch-brick`, `english-tudor`, `luso-colonial`, `swahili-coral`, `arab-cubic`, `persian-gulf`, `malabar-hindu`, `mughal-gujarati`, `malay-stilted`, `west-african-round`, `luso-brazilian`, `spanish-caribbean`, `khoikhoi-minimal`.

Rendering lives in `ProceduralCity.tsx`. Differentiation is palette + proportion + weighted variant mix, plus three cheap feature primitives: **stilts**, **wind-catcher**, **veranda**. No per-facade detail. Does *not* affect anchor buildings (forts, markets, landmarks, spirituals, palaces) — those have bespoke geometry of their own.

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

#### Building entry detection (walking mode)
`UI.tsx` polls every 250ms with two separate pipelines gated by `playerMode`:

- **Ship**: `findNearbyPort(playerPos, ports)` — distance-only check, opens PortModal when the ship sails within `PORT_RADIUS_SQ` (20×20 units) of a port center. Unchanged from original.
- **Walking**: `findNearbyPortWalking(walkingPos, ports)` — candidate port by `WALKING_PORT_SEARCH_RADIUS_SQ`, then `findBuildingAtPoint()` rotated-AABB test returning the specific `Building | null`. Branches on type:
  - `building.type === 'market'` → `setActivePort(port)` → PortModal (market tab). Same audio + dismissed-port logic as before.
  - any other type → `setActiveBuildingToast({ building, port })` → `BuildingToast` component. PortModal stays closed.
  - no building → clears both `activePort` and `activeBuildingToast`.

`BuildingToast` is a local-state component in `UI.tsx` backed by a ref (`activeBuildingToastRef`) to avoid stale closures inside the interval. It slides up with a spring animation, sits at `bottom-32` (mobile) / `bottom-40` (desktop) above the bottom button panel, shows `labelEyebrow` (colored pill), `label`, `labelSub`, and a stubbed **Enter** button (`onEnter` prop, no-op for now). No backdrop; doesn't block movement; auto-dismisses when player walks out of the building footprint. Re-triggers on re-entry (no dismissed-building tracking).

**Wiring up Enter**: the `onEnter` stub is where time-of-day checks, reputation gates ("the door is locked"), and eventual building-interior mechanics will go. When ready, thread port + building through `onEnter` and dispatch to gameStore.

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

### NPC ship hail — procedural deepening
Full writeup: [`npcshipplan.md`](./npcshipplan.md). Transforms the existing single-response hail panel (`UI.tsx:2832-3045`, `npcShipGenerator.ts:715-762`) into a state-driven procedural dialogue system — disposition vector, captain traits, rumor ledger, language proficiency gradient with cognate matrix, tagged phrasebook, and encounter memory. Explicitly no LLM. Authored in 7 phases, each independently shippable; phase 1 is a non-visible foundation refactor.

### POI System (largest unbuilt feature)
Points of Interest — one-off, port-specific, hand-authored sites the player sails or walks to. Each POI is a location with its own modal containing a **Learn** tab (knowledge acquisition against defined cost) and a **Converse** tab (Gemini-powered in-character conversation, extending the pattern from `TavernTab.tsx`).

**Landmark vs POI — the split**:

| | Landmark | POI |
|---|---|---|
| Location | Inside the port's city footprint | Outside it (hinterland, pilgrimage site, ruins, sacred grove) or bound to an existing landmark |
| Placed by | City generator (anchor system) | Hand-authored coords per port |
| Interaction | Hover label only | Walk up / click → modal with Learn + Converse tabs |
| Uniqueness | One per `landmarkId` | One per POI id |
| Content | name + sub + semantic class | all that + `lore`, `npcName`, `knowledgeDomain`, `masteryGoods`, `cost` |

The overlap case: a city landmark that's *also* a POI (Jesuit College at Goa is a landmark you see AND a POI you can enter). Model: POI references the landmark as its location via `location: { kind: 'landmark'; landmarkId: string }`. No duplicate placement.

**Shared infrastructure POIs will reuse**:
- `SemanticClass` + `SEMANTIC_STYLE` from `semanticClasses.ts` — POIs carry `class: SemanticClass` and get the same eyebrow color + marker as classified buildings. A pilgrimage shrine POI (class: religious) gets the same purple plumbob as an in-city mosque. A merchant-guild POI (class: mercantile) gets the same teal eyebrow as the English Factory landmark.
- `buildingLabels.ts` label-texture pipeline — `createWorldLabelTexture({ eyebrow, eyebrowColor })` already accepts arbitrary classes.
- `SacredBuildingMarkers` renderer in `ProceduralCity.tsx` — extend to iterate POI positions alongside buildings, filter by the same `marker === 'diamond'` gate. Zero new visual code for religious POIs.

**Planned data model** — not yet in code:

```typescript
type SemanticClass = 'religious' | 'civic' | 'learned' | 'mercantile' | 'royal';
type POIKind = 'temple' | 'monastery' | 'naturalist' | 'merchant_guild' | 'ruin' | 'garden' | 'court';

interface POIDefinition {
  id: string;
  name: string;
  kind: POIKind;                  // fine-grained type for prose / filtering
  class: SemanticClass;           // drives eyebrow + marker (shared with buildings)
  port: string;
  location:
    | { kind: 'landmark'; landmarkId: string }       // anchored to an in-city landmark
    | { kind: 'coords'; position: [number, number] }  // in-city POI at explicit coords
    | { kind: 'hinterland'; position: [number, number] }; // outside city exclusion radius
  knowledgeDomain: string[];      // commodity IDs identifiable here
  masteryGoods: string[];         // subset upgradeable to Mastered
  cost: { type: 'gold' | 'commodity' | 'reputation'; amount?: number; commodityId?: string };
  npcName: string;
  npcRole: string;
  lore: string;                   // LLM context
  unlocksPort?: string;
}
```

**Example POIs by port** (drafted, not built): Goa → Jesuit College of St. Paul (religious, bound to jesuit-college landmark — wait, that's at Salvador; Goa needs its own LEARNED POI bound to Bom Jesus); Calicut → Tali Temple priest (religious, bound to calicut-gopuram); Malacca → Chinese merchant guild (mercantile, in-city); Mocha → Sufi lodge (religious, bound to al-shadhili-mosque); Hormuz → Persian royal factor (royal, in-city); Surat → Banyan merchant house (mercantile, in-city, distinct from english-factory landmark); Macau → Jesuit observatory (learned, bound to colegio-sao-paulo); Bantam → pepper gardens (mercantile, hinterland); Socotra → aloe groves (learned, hinterland); Lisbon → Royal Hospital of All Saints (learned, in-city); Amsterdam → VOC Spice Warehouse (mercantile, in-city); London → Apothecaries' Hall (learned, in-city); Salvador → Jesuit college apothecary (learned, bound to jesuit-college); Cartagena → Inquisition library (learned, bound to palacio-inquisicion); Cape → Khoikhoi pastoral camp (naturalist, hinterland).

**Files to create**: `src/utils/poiDefinitions.ts`, `src/utils/poiConversation.ts`, `src/components/POIModal.tsx`, `src/components/POIMarker.tsx`.

**Implementation order** (when this kicks off):
1. `poiDefinitions.ts` with 6-10 POIs across 3-4 ports, data-only.
2. Marker renderer — extend `SacredBuildingMarkers` to pull POI positions + classes alongside buildings.
3. Hover label for POIs (reuse `createWorldLabelTexture` + eyebrow system).
4. Walk-up proximity detection (pattern from `interactionPrompt` in gameStore).
5. `POIModal.tsx` with Learn tab wired to `knowledgeSystem.ts`.
6. `poiConversation.ts` + Converse tab (copy the `TavernTab.tsx` / `tavernConversation.ts` pattern).

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
- **Port-anchor commodities** (not to be casually moved): `Japanese Silver` is the engine of the Macau–Nagasaki Nao do Trato — produced only at Nagasaki and recognized natively by Portuguese / Chinese / Japanese crews (see `knowledgeSystem.ts`). `Murano Glass`, `Venetian Soap`, and `Theriac` are Venice monopolies — Theriac in particular is the Republic's state-compounded sixty-ingredient polypharmacy (tier 5) and should not be produced elsewhere. If you add another origin for any of these, the information-asymmetry system stops making historical sense.
- **Road tier constants live in `roadStyle.ts`**, not inline. If you add a new road-like surface (e.g. market flagstones, a canal towpath), either route it through an existing tier or extend `ROAD_TIER_STYLE` — don't hardcode `yLift`, `polygonOffsetFactor`, or `width` in a new mesh. The renderer and the ground-height resolver both read from this table; drift between them is what caused the old "player sinks into road" bug.
- **Road polyline Y semantics**: for `path` / `road` / `avenue`, `points[i][1]` is terrain height at that (x, z). The visible ribbon sits at `polylineY + tier.yLift`. For `bridge`, the polyline Y is the authored deck ramp (terrain at abutments, `BRIDGE_DECK_Y` over water — shared constant in `roadStyle.ts`). `getGroundHeight()` and the renderer both respect this — don't confuse bridge polyline Y with other tiers. Piers filter to `y ≤ BRIDGE_DECK_Y + ε` so abutment points don't spawn columns above the deck.
- **Road generation runs once per port**, inside `mapGenerator.ts`. `postprocessRoads()` mutates the roads array in place (densify + weld) and returns the graph. If you generate roads at runtime (you shouldn't), you also have to rebuild `port.roadGraph` and any downstream `RoadSurfaceIndex` refs — they are cached on `useEffect` / `initPedestrianSystem`.

## Safari perf investigation (2026-04) — read before spending time on this

Symptom: Safari sustains ~16 fps during normal play, "laggy especially at dusk." Chrome is fine. A Safari Timeline recording showed **Paint 49.3% / JS 47.1%** of main thread, ~140 CSS transition events per 6s, one **Full GC of 753ms**, CPU peaking 98.1%.

**Every plausible cause was tested via dev-panel toggle or code change — all flat.** Don't repeat these unless you have new evidence:

- GPU post-processing (N8AO, Bloom, BrightnessContrast, HueSaturation, Vignette) — no change
- Shadow map resolution (2048² → 1024²), DPR cap (1.25 → 1.0), MSAA off — no change
- Wildlife WebGL animation toggle — no change
- drei `<Html>` DOM markers in `AnimalMarkers.tsx` / `FloatingLoot.tsx` — no change (gated by `renderDebug.animalMarkers`)
- `STORE_TIME_STEP` at 0.1 / 0.4 / 0.5 / 1.0 — no change (currently 0.1)
- Production build vs dev — no change
- Global `* { transition: none !important; animation: none !important; }` — no change (gated by `renderDebug.disableTransitions`)
- UI-root GPU layer promotion (`transform: translateZ(0)`) — marginal at best

When the toggle surface is that broad and nothing moves the needle, the cost is distributed across many always-running `useFrame` callbacks (67 across 20 components) plus Safari's per-frame compositor/layer path that JS can't influence. There is no single "unplug this and FPS doubles" fix left; a real win requires a flame graph or accepting the perf.

**The one productive next step** is profiling, not guessing: in Safari Web Inspector → Timelines, click the triangle next to the biggest "Animation Frame Fired" row (the ~120ms R3F render callback at `events-…esm.js:16027`). That expands into the actual call stack. Without that, another round of toggle-and-test will just stack more speculative changes. If a future session gets that flame graph, the hotspots it shows are the real targets.

Changes left in the codebase from this investigation, with their actual value:
- `src/utils/platform.ts`, Safari-only DPR 1.0 / MSAA off / shadow 1024² (`GameScene.tsx`, `World.tsx`) — speculative, didn't measurably help but don't hurt
- `translateZ(0)` on `game-root` and UI overlay (`Game.tsx`, `UI.tsx`) — sound practice, negligible measured impact
- **`EffectComposer` `key` prop tied to enabled-effects set (`GameScene.tsx`)** — real correctness fix: without it, toggling N8AO/Bloom/etc. at runtime freezes the canvas
- Dev-panel diagnostic toggles: `animalMarkers`, `disableTransitions` — kept for future diagnostics, default state is identical to prior behavior

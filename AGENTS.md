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

### Port roster (29 ports as of 2026-04)

**Three registries must stay in sync** (`CORE_PORTS` in `portArchetypes.ts` for visual/geographic; `worldPorts.ts` for coords + `SEA_LANE_GRAPH` + trade weights; `PORT_FACTION` + `PORT_CULTURAL_REGION` in `gameStore.ts`). When adding a port, all three. **Always grep the codebase before claiming a port doesn't exist** — every port is wired into ~5–10 files (faith, fleet composition, NPC pools, banner, region, climate, lore notes).

**Indian Ocean / Asia (17):**
| Port | Geography | Notes |
|---|---|---|
| Goa | inlet | Portuguese Estado capital |
| Calicut | continental_coast | Zamorin's port, Malabar |
| Surat | estuary | Mughal commercial hub |
| Diu | island | Portuguese fortress-island |
| Hormuz | island | Falls to Anglo-Persian 1622 — currently Portuguese |
| Muscat | bay | Omani; Portuguese-held until 1650 |
| Aden | crater_harbor | Ottoman vassal |
| Mocha | continental_coast | Coffee port, Ottoman/Yemeni |
| Socotra | island | Frankincense + dragon's-blood. Already a port — Sunni faith with Nestorian remnant note in `portReligions.ts:50`. Real geography 130km × 40km (`portArchetypes.ts:658-669`). Dragon's-blood lore in `commodityHistoricalNotes.ts:259`. NPC fleet mix in `npcShipGenerator.ts:611` |
| Masulipatnam | estuary | Coromandel, Qutb Shahi |
| Bantam | bay | Pepper port, Sundanese |
| Malacca | strait | Portuguese, falls to VOC 1641 |
| Manila | bay | Spanish, recent animated banner |
| Macau | peninsula | Portuguese; Macau–Nagasaki silver run |
| Nagasaki | inlet | Japanese silver source |
| Mombasa | coastal_island | Swahili, Portuguese-held |
| Zanzibar | island | Swahili sultanate |

**Europe / Mediterranean (5):** Lisbon, Amsterdam, Seville, London, Venice (lagoon archetype, recent add)

**Atlantic / Africa (3):** Elmina (Portuguese gold/slave fort), Luanda (Portuguese Angola), Cape of Good Hope

**Americas (4):** Salvador da Bahia (Brazil NE), Havana (Cuba), Cartagena de Indias, Jamestown (1607 founding, John Rolfe tobacco crop the year of game start)

**Planned/deferred:** Veracruz + Pernambuco (per project memory — completing the 1612 Atlantic). Manila, Nagasaki, Masulipatnam queued for further work per Venice rollout pattern.

### 1612 Port Authority Reference

Use `src/utils/portAuthorities.ts` as the data source for the Governor/Authority tab, authority credit patrons, and authority building labels. The important design rule: this is the official or practical authority a spice trader would petition in 1612, not a generic "governor." Historical basis is a synthesis of the existing project bibliography and port notes; where exact officeholders are not implemented, treat the label as the office/contact, not a named NPC.

| Port | Authority figure/contact | Authority building |
|---|---|---|
| Goa | Viceroy of Estado da India, D. Jeronimo de Azevedo from 1612 | Viceroy's Palace |
| Lisbon | Casa da India officials at the Ribeira Palace | Casa da India |
| Diu | Portuguese Captain of Diu | Captain's Fortress |
| Hormuz | Portuguese Captain of Hormuz / fortress customs officers | Fortress of Hormuz |
| Muscat | Portuguese Captain of Muscat at al-Mirani / al-Jalali | Captain's Fort |
| Malacca | Portuguese Captain-major of Malacca | A Famosa |
| Macau | Leal Senado, with the Captain-major of the Japan voyage as a trade contact | Leal Senado |
| Mombasa | Portuguese Captain of Fort Jesus | Fort Jesus Captaincy |
| Elmina | Captain-factor of Sao Jorge da Mina | Sao Jorge da Mina |
| Luanda | Portuguese Governor of Angola; Bento Banha Cardoso in 1612 | Governor's Fortress |
| Salvador da Bahia | Governor-General of Brazil | Palacio do Governo |
| Seville | Casa de Contratacion | Casa de Contratacion |
| Havana | Governor / Captain-General of Cuba | Captain-General's House |
| Cartagena de Indias | Governor of Cartagena plus royal treasury/customs officers | Governor's Palace |
| Manila | Governor and Captain-General Juan de Silva plus the Real Audiencia | Palacio del Gobernador |
| Calicut | Zamorin as sovereign; practical trade interface is the Shahbandar/Koya broker | Shahbandar's House |
| Surat | Mughal mutasaddi / port governor and customs officials | Mughal Custom House |
| Masulipatnam | Qutb Shahi Golconda port officials | Golconda Custom House |
| Aden | Ottoman pasha/garrison and customs authority | Ottoman Custom House |
| Mocha | Customs farmer and local Yemeni port authority under Ottoman suzerainty | Mocha Custom House |
| Socotra | Mahra sheikh / local Mahri authority | Mahra Sheikh's House |
| Bantam | Sultan Abulmafakhir's court, with regents and shahbandars handling trade | Sultan's Court |
| Nagasaki | Nagasaki bugyo and local daikan Murayama Toan | Nagasaki Magistrate |
| Amsterdam | VOC Amsterdam Chamber / Heeren XVII | VOC Chamber |
| London | East India Company governor Sir Thomas Smythe and Court of Committees | East India House |
| Venice | Cinque Savi alla Mercanzia and spice brokers | Savi alla Mercanzia |
| Cape of Good Hope | Khoikhoi trading intermediaries; no European governor before 1652 | Table Bay Trading Camp |
| Zanzibar | Mwinyi Mkuu / local Swahili ruler under nominal Portuguese pressure | Sultan's Residence |
| Jamestown | Virginia Company marshal/deputy governor Sir Thomas Dale in 1612 | Virginia Company Storehouse |

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
`BuildingTooltip.tsx` reads `b.label`, `b.labelSub`, `b.labelEyebrow`, `b.labelEyebrowColor` and renders the hover panel with Drei `<Html>`, plus a lightweight 3D glow box around the hovered building. Label text comes from `buildingLabels.ts` via `generateBuildingLabel()` — dispatches on type with per-type naming pools + cultural/regional variations + named-landmark / faith / palace-style overrides.

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

**Default view is angled top-down (~45°), not third-person.** The camera sits at roughly `(0.5, 1, 1) * cameraZoom` from the player and looks at the player. There is effectively no visible horizon or skyline — distant features that try to read as "background" (mountains on the horizon, sky-mounted icons, etc.) won't be framed the way they are in a chase-cam game. Any landmark intended to be visible *from far away* must live on the map plane within map bounds, and gets its sense of distance from on-plane separation (water gap, impassable terrain, far-quadrant placement near the map edge), not from horizon framing. `topdown` mode is even flatter (near-vertical with a tiny tilt offset) and reinforces this constraint.

### Wind, day/night
- `wind.ts` exposes direction/speed; Ocean.tsx uses it for waves, Ship.tsx for sail animation.
- `timeOfDay: 0-24` + `dayCount` advance via `gameDate.ts`. Day length scales game time.
- No weather system. Ocean/sky mood comes from climate palettes + time of day. If you want a dramatic storm, build it as a scripted event, not a background simulation.

### Audio
`src/audio/AudioManager.ts` is the singleton. `SoundEffects.ts` exposes one-shot SFX (cannon, UI, crab collect, etc.). `AmbientEngine.ts` handles layered ambient loops keyed to biome and time of day.

**Music zones** (`MusicZone` in `utils/portCoords.ts`): each historical port belongs to one zone (`east-asia` | `southeast-asia` | `south-asia` | `arabia` | `east-africa` | `europe` | `west-africa` | `americas` | `cape`). Tracks in `OVERWORLD_TRACKS` (AudioManager) can carry an optional `zones: string[]` to restrict eligibility — e.g. *Monsoon Ledger* only plays when the player's current world port is in `east-asia`. Tracks without `zones` are global. The active zone is updated via a `useEffect` in `UI.tsx` that watches `currentWorldPortId`. Rotation is random-pick (not round-robin) so zone changes feel fluid; the currently-playing track is allowed to finish before the new pool takes effect.

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

### Sleep / inn rest
RPG-style "rest at the inn" mechanic: in the Tavern tab, the player pays a port-scaled fee, time advances to 8 AM the next morning, crew morale and sometimes health restore, and every crew gets +1 XP (+2 if the port culture differs from the crew's nationality-derived home culture). After a long cozy fade-in to a per-port painted night scene with an animated starfield, a summary modal lists per-crew gains.

**Code paths:**
- `restAtInn(port)` in `gameStore.ts` — applies all state changes, returns a `RestSummary` with per-crew deltas.
- `lodgingCost(scale)` / `lodgingLabel(culture)` (also gameStore.ts) — pricing and "sarai/inn/guesthouse/tavern lodgings" naming.
- `nationalityToCulture(nationality)` in `utils/portCoords.ts` — used for the foreign-culture XP bonus.
- `components/SleepOverlay.tsx` — fullscreen portal-rendered overlay, layers a deep-night gradient + `Starfield` + the painted port still + edge vignette + caption text.
- `components/Starfield.tsx` — canvas pixel-art stars with **latitude-aware constellations** (Polaris + Big Dipper for >25°N, Southern Cross for <-10°, Orion for everyone) and **moon phase** synced to `dayCount` (29.5-day cycle). Reads latitude from `PORT_LATITUDES` in `utils/portCoords.ts`.
- `components/RestSummaryModal.tsx` — renders the per-crew morning summary using `CrewPortraitSquare`.
- `audioManager.startInnMusic()` / `stopInnMusic()` — crossfades to `/music/Inn Rest.mp3` (cozy chiptune that plays during the rest overlay and the summary modal).
- `audioManager.startAfterNightMusic()` — fires automatically on PortModal close when `pendingAfterNightMusic` is set (`gameStore.ts`). Plays `/music/After the Night.mp3` once as a morning-departure theme, then hands back to the regular overworld rotation. Both tracks are also part of the random overworld rotation (`OVERWORLD_TRACKS` in `AudioManager.ts`).

**Rest pacing (in `TavernTab.handleRest`):**
The fade-in to the painted scene is intentionally long for a cozy mood. Total flow is ~10s: overlay fade-in (1.5s) + image fade-in (2.5s after 0.6s delay) + caption (1.4s after 2.6s delay) + dwell + state resolution at 5s + overlay fade-out (1.8s) at 8.5s + summary modal appears at 9.1s. Tweaking the timeouts in `handleRest` is the easiest way to retune feel.

**Asset pipeline for new port night images:**
1. Generate a 1344×768 (16:9) painted scene with a solid magenta sky region. Studio-Ghibli-with-pixel-art-influence visual style. Use this prompt template, varying the historical content per port:
   > studio ghibli style beautiful image of [PORT] in 1612 at night, [HISTORICAL DETAIL: signature buildings, river/harbor, ships, street life]. The sky should be solid magenta (#FF00FF) with no clouds or stars to allow postprocessing. Cozy but historically accurate, the edges at left and right shading in a gradient into darkness. Nearly monochrome palette of inky midnight blues [VARY: + warmer ochre for southern Iberian, + cooler steel-blue for northern, + deep teal for Indian Ocean tropical]. A bit of a very high res pixel art vibe but lush and detailed.
2. Drop the magenta-sky source PNG into `public/sleep/source/{portId}.png` (lowercase port ID).
3. Run `./scripts/key-sleep-images.sh` from the repo root. The script uses a hue-based key (G < R AND G < B) rather than flat #FF00FF matching, because models paint a vignette into the magenta and the actual pixels range from near-black corners to dusty pink center.
4. Keyed transparent-sky PNGs land in `public/sleep/{portId}.png`. The game loads them automatically; ports without an image fall back to pure starfield + dark gradient.
5. If you also need to add a new port to the latitude table for constellation accuracy, edit `PORT_LATITUDES` in `utils/portCoords.ts`.

**Currently shipped images:** london, seville, amsterdam. The other ~27 ports show fallback starfield only until images are added.

**Planned: random nighttime events.** The `restAtInn` resolver and the `setTimeout` in `handleRest` both have hook comments marking where this would slot in. The vision is FF7-style: reuse the per-port painted backdrop, walk small sprites of crew (and possibly tavern NPCs the player has spoken to that day) onto the scene, and run a short dialogue tree. Triggers on the agenda:
- Two crew with personality friction get drunk and brawl.
- A tavern NPC the player previously bought drinks for follows up with information / an offer.
- A theft (gold loss + relevant journal entry) when the player has unusually high gold and no Quartermaster.
- A feverish dream (when at least one crew is `fevered`) — flavor only, ties into the LLM journal system.
- A stranger leaves a note (rare hook for quest-like content).
The event roll should reference `TavernTab`'s `conversationHistory` and the crew morale/health/relationship state. Architecture sketch: a `nightEvents.ts` util with `rollNightEvent(state, port) → NightEvent | null`; if non-null, `handleRest` shows a sprite-on-backdrop dialogue scene instead of (or before) the summary modal.

## Planned / in progress

### NPC ship hail — procedural deepening
Full writeup: [`npcshipplan.md`](./npcshipplan.md). Transforms the existing single-response hail panel (`UI.tsx:2832-3045`, `npcShipGenerator.ts:715-762`) into a state-driven procedural dialogue system — disposition vector, captain traits, rumor ledger, language proficiency gradient with cognate matrix, tagged phrasebook, and encounter memory. Explicitly no LLM. Authored in 7 phases, each independently shippable; phase 1 is a non-visible foundation refactor.

### Quests system — TBD, design in flux
Full writeup: [`questplan.md`](./questplan.md). The "Quests" button in `UI.tsx` (hotkey `6`, gold Scroll icon at lines 1843 / 1882) is currently a stub. Plan is one shared `Lead` type produced by four creation surfaces (tavern, governor audience, POI, NPC ship hail) feeding one panel and one resolution check. Governor tab in `PortModal.tsx` would become an LLM roleplay surface — high-stakes audience where pitches are evaluated against real world state, and successful pitches create capitalized leads with a `debt` field. **Details still being worked out — the doc is a sketch to argue with, not a spec.** Major open questions: LLM extraction reliability, governor ledger snapshot shape, stakes-ceiling tuning, whether hail leads are worth building. Implementation order in the plan starts with the trunk type + panel + tavern source; governor and POI follow once that's playing well.

### Multiplayer presence — possible future option
Feasible compromise: let other human players appear as human-controlled ships, and eventually walking figures in port, without making the whole simulation a PvP MMO. The useful target is **presence + hail + trade**, not fighting.

Best first version:
- Remote ships are rendered like NPC ships but driven by network snapshots instead of `NPCShip.tsx` AI.
- Only show remote players in the same `currentWorldPortId` / compatible world seed.
- Broadcast local transform at a modest rate (roughly 8-12 Hz): player id, mode, position, rotation, velocity, faction/flag, ship visual, ship name.
- Interpolate remote transforms client-side; do not put remote ships directly into `npcLivePositions` unless they are meant to be shootable.
- Hailing is the first interaction: proximity check, `Press T to Hail`, WebSocket request/accept, then a shared hail panel or short message exchange.
- Trading is the second interaction: server owns the trade proposal and atomically validates/transfers gold + cargo. Do not trust direct client-side Zustand mutations for player-to-player trades.

Explicit non-goal for the compromise version: human-vs-human fighting. Multiplayer combat would require server-authoritative hull/sail health, reload timers, projectile/hit validation, sunk state, and reconciliation with the local `GameScene.tsx` projectile system. That is a much larger redesign than ambient presence, hailing, or trade.

Likely architecture: small WebSocket server + `src/utils/multiplayerClient.ts` + a `RemotePlayers` / `RemoteShips` renderer mounted near `World.tsx` or `GameScene.tsx`. Keep this separate from the local NPC AI and local pedestrian instancing until the network model is proven.

### POI System (largest unbuilt feature)
Points of Interest — sites the player sails or walks to that are *not* tradable ports. Each POI has its own modal with a **Learn** tab (knowledge acquisition against defined cost) and a **Converse** tab (Gemini-powered in-character conversation, extending the pattern from `TavernTab.tsx`). About 25% of POI visits also produce a `Lead` once the quest trunk lands (see [`questplan.md`](./questplan.md)).

**Vocabulary** — three terms get conflated easily, so pin them down:
- **3D world** — the single contiguous playable space (~1100×1100 units, `WORLD_HALF = 550` in `worldMapTerrainCache.ts`). All ports placed within it by `distributePortPositions` in `mapGenerator.ts`. The player physically sails/walks here.
- **Local map overlay** (`LocalMap.tsx`) — a 2D top-down harbor/terrain chart opened from the minimap. Shows terrain, current port context, discovered POIs, wildlife clusters, and a button to open the global sailing chart.
- **Port zone** — the playable region around a port: city footprint + hinterland + nearshore water, all part of the single 3D world. **Hinterland** is the part of the zone outside the city's exclusion radius. POIs always anchor to a port zone.

**Bespoke vs procedural.** One axis the system actually has:

| | Examples |
|---|---|
| **Bespoke** (one-of, hand-authored coords + geometry) | Apothecaries' Hall in London; Bom Jesus tied to Goa; Banyan merchant house in Surat. Stretch: bespoke POIs in under-served existing port zones — a Dracaena cinnabari grove on **Socotra** (already a port), Golconda mines as a **Masulipatnam**-hinterland POI, a Vijayanagara ruin in the hinterland of a southern Indian port. Cape Comorin / Kanyakumari is a true gap (no nearby southern-tip port currently exists) — would need to be added as a new pilgrimage-only port if it's authored at all |
| **Procedural** (archetype + variant table) | Hinterland shrine, hinterland ruin, physick garden, caravanserai on the road into a city; coastal-hinterland wreck off Mozambique's beach; smuggler's cove in the offshore band of a remote port zone |

(Earlier drafts of this doc treated "world map" as a parallel gameplay surface where POIs could float between ports. That model is wrong — there's no inter-port playable space. The correct framing is: every POI lives in some port zone; the world-map overlay only displays markers for them.)

**Landmark vs POI — the split** (unchanged):

| | Landmark | POI |
|---|---|---|
| Location | Inside the port's city footprint | Outside it (hinterland, pilgrimage site, ruins, sacred grove) or bound to an existing landmark |
| Placed by | City generator (anchor system) | Hand-authored coords (bespoke) or templated archetype (procedural) |
| Interaction | Hover label only | Walk up / sail up → modal with Learn + Converse tabs |
| Uniqueness | One per `landmarkId` | One per POI id; archetypes spawn N variants per world seed |
| Content | name + sub + semantic class | all that + `lore`, `npcName`, `knowledgeDomain`, `masteryGoods`, `cost` |

Overlap: a city landmark that's *also* a POI (Goa's Bom Jesus is a landmark you see AND a POI you can enter). POI references the landmark as its location via `location: { kind: 'landmark'; landmarkId: string }`. No duplicate placement.

**Shared infrastructure POIs reuse**:
- `SemanticClass` + `SEMANTIC_STYLE` from `semanticClasses.ts` — POIs carry `class: SemanticClass` and get the same eyebrow color + marker as classified buildings. A pilgrimage shrine POI (`religious`) gets the same purple plumbob as an in-city mosque. A merchant-guild POI (`mercantile`) gets the same teal eyebrow as the English Factory landmark.
- `BuildingTooltip.tsx` hover-label path — eyebrow text and color already come from semantic-class fields on buildings.
- `SacredBuildingMarkers` renderer in `ProceduralCity.tsx` — extended to iterate POI positions alongside buildings, filtered by the same `marker === 'diamond'` gate. Zero new visual code for religious POIs.

#### Procedural archetypes — catalog

Each archetype is a template that produces a `POIDefinition` at gen time, with a small variant table that drives geometry + label + faith/culture + reward profile. Same eyebrow/marker/SemanticClass plumbing as buildings and bespoke POIs.

| Archetype | `class` | Procedural axes | Reward profile | Lead probability |
|---|---|---|---|---|
| **Shrine** | religious | faith (catholic / protestant / sunni / shia / ibadi / hindu / buddhist / chinese-folk / animist / jewish) × scale (wayside / village / pilgrimage) × tenant (attended / hermitage) × condition (active / decaying) | Religious-coded leads (carry a relic, find a missing pilgrim), drug knowledge for plant-based traditions (cannabis at Sufi lodges, soma-adjacent at Hindu sites, theriac at Jewish lodges), rep with co-religious factions. **Hermitage-tenant variants** are sage-Converse heavy, low gold, rare medicinal knowledge — the Christian anchorite / Sufi dervish / sannyasin / Theravada forest monk / Daoist recluse all fold in here as a tenant axis rather than a separate archetype | 30% |
| **Ruin** | civic *or* religious *or* royal (rolled) | type (fort / monastery / palace / city) × era (ancient / medieval / recently-abandoned) × hauntedness | Charts, salvage cargo, lost-manuscript mastery upgrades, cursed-item leads, occasional hostile encounter | 40% |
| **Wreck** | (uncoded) | ship type × age × cargo state × accessible-by (beach / reef-dive). Coastal-hinterland-native — placed in the offshore water band of a port zone | Cargo, charts, "last log" leads | 50% |
| **Smuggler's cove** | mercantile | culture × specialty (opium / unlicensed spice / English or Dutch interloper bypassing the *cartaz* system / Japanese-silver runners). Coastal-hinterland-native — hidden inlet on the remote edge of a port zone's coastline | Off-market trades that bypass port reputation; introduces a fence NPC; rep cost if caught later | 25% |
| **Garden** | learned | tradition (Jesuit medicinal / Mughal hakim / VOC company-naturalist / Chinese herbalist / indigenous practitioner) | Mastery upgrades on specific commodities. The drug-knowledge engine of the system. Modeled on real 1612 institutions: Garcia da Orta's Goa garden, Mughal hakim compounds, Jesuit medicinal plots — estate gardens, not field camps. Shares the `garden` kind with bespoke gardens like Oxford and Malabar | 15% |
| **Caravanserai** | mercantile | culture × isolation (highway / oasis / mountain pass). Port-local only — sits on the road into the city, in the hinterland band | Rumor-style leads, overland trade gossip, occasional traveler-NPC quest | 35% |
| **Naturalist** (bespoke-only) | learned *or* mercantile | hand-authored per POI (Apothecaries' Hall, Banyan Counting House, Mappila House, Colégio São Paulo, Fort Jesus apothecary, Hadhrami aloe camp, etc.) | Mastery on specific commodities, faction contacts, named recurring giver for follow-up dialogue. Best lead-givers in the game because the NPC persists across visits | 25–35% (hand-tuned per POI) |

This table is the **source of truth** for POI lead probabilities (referenced by `questplan.md` Source 3). When tuning lead frequency, edit numbers here.

Shrine and ruin do most of the work — they're the high-frequency procgen. The others are 5–15 instances each globally so they feel rare without being precious. Naturalist is bespoke-only and capped at the ~6 hand-authored POIs.

**Cut from earlier drafts:**
- **Hermitage** as its own archetype — folded into Shrine as a `tenant: hermitage` axis. The geometry is a small shrine with a single sage NPC, not a separate building family. Keeping it separate would have duplicated the per-faith name pools and lore templates.
- **Battlefield** — too thin mechanically (charts + lore + rep shift, all of which other archetypes already deliver) and easy to mishandle historically. Battles get told better through ruined forts (e.g. Talikota-era ruin) and named bespoke sites than through a procedural template.

**Slavery exclusion.** Plantation is intentionally not in the proc table. The physick garden archetype covers the drug-economy ground (clove groves, opium poppy fields, indigo vats, aloe groves) by foregrounding the crop and the knowledge-bearer, not the labor system. Bespoke historical sites where forced labor is the point just don't get authored.

#### Two big visual levers

**Shrine archetype reuses existing faith geometry.** `portReligions.ts` already has bespoke per-faith spiritual geometry in `ProceduralCity.tsx` (Catholic nave+bell tower, Sunni dome+minaret, Hindu shikhara, Buddhist pagoda, etc.). A shrine POI is *that geometry rendered at smaller scales, in unusual locations, with weather/decay applied*:

- Wayside shrine = single small chamber, ~25% of the equivalent in-city building's footprint
- Village shrine = the in-city geometry at ~60% scale with a courtyard
- Pilgrimage site = the in-city geometry at 110% scale + procedural pilgrim-camp tents (reuse pedestrian system)
- Decayed = same geometry with a "ruin pass" applied (next bullet)

Zero new bespoke geometry for shrines. Variety comes from `(faith-pool × scale × decay-pass)`. Same trick the building-style system uses on houses.

**`RuinTransform(building, decayLevel)`** is one shader/material function that takes any existing building geometry and:
- removes random roof tiles / planks (vertex deletion above a noise threshold)
- shifts walls 0.5–2u off-axis (lean)
- drops wall opacity in random chunks (gaps)
- swaps material to a desaturated / moss-tinted palette
- spawns a small `vegetation_overgrowth` instance pass on top

Apply to *any* spiritual / fort / palace / market geometry to get a ruined version. A "ruined Hindu temple" in the hinterland is just `shikhara_geometry → RuinTransform(0.7)` — no new asset. Big lever for visual variety.

#### POI anchoring

Every POI lives somewhere in the single 3D world, anchored to a port zone. There is no "inter-port" or "open-ocean" gameplay space; the world-map overlay only renders 2D markers for discovered POIs, it doesn't host them.

Three placement bands within a port zone:
- **City** — anchored to a landmark inside the city footprint, or at explicit in-city coords. Apothecaries' Hall, Bom Jesus, Banyan merchant house.
- **Hinterland** — outside the city exclusion radius, on land. Shipped shrines use the 110–215u band from port center (`placeHinterlandScenes`). Ruins, physick gardens, caravanserais all spawn here.
- **Coastal hinterland / nearshore water** — in the offshore band of the same port zone. Wrecks (visible from the beach), smuggler's coves (hidden inlets at the zone's far edge). Sailed up to in ship mode, not walked to.

**Standalone destination ports** are how showcase sites that don't pair with an existing trade port get into the world: Cape Comorin / Kanyakumari, possibly Mt Athos. Mechanically these would be *new ports* added to all three registries (see "Port roster" above) with their own port zones generated by the existing pipeline — no/limited trade, hand-authored bespoke POIs in the zone, clickable on the world-map overlay like any other port. That's a much cleaner integration than inventing a new "world-map POI" surface. Most "showcase" candidates can instead be authored as bespoke POIs in *existing* port zones — Socotra already exists, Masulipatnam can host Golconda, etc. Check the port roster before assuming a new port is needed.

Resolution: player walks or sails up to the POI inside the current port zone, the existing proximity check fires, `POIModal` opens with Learn + Converse tabs. Same flow as the shipped Phase 1/2 POIs — no overworld modals, no scene transitions. Travelling between port zones uses `fastTravel` like always.

**Planned data model** — not yet in code:

```typescript
type SemanticClass = 'religious' | 'civic' | 'learned' | 'mercantile' | 'royal';
type POIKind =
  | 'naturalist' | 'merchant_guild'         // bespoke-only
  | 'garden' | 'shrine'                      // both bespoke and procedural
  | 'ruin' | 'wreck' | 'smugglers_cove' | 'caravanserai';  // procedural-only

// Cut 2026-04-29 (no in-use bespoke POIs needed them):
//   'temple'        — covered by 'shrine' or in-city spiritual buildings
//   'court'         — covered by in-city palace landmarks + Governor tab
//   'monastery'     — covered by 'shrine' (Bom Jesus reclassified)
//   'hermitage'     — folded into 'shrine' as a tenant axis
//   'battlefield'   — too thin mechanically; better told via 'ruin' POIs
//   'physick_garden'— merged into 'garden' (one silhouette, one kind)

type POILocation =
  | { kind: 'landmark'; landmarkId: string }           // anchored to an in-city landmark
  | { kind: 'coords'; position: [number, number] }     // in-city POI at explicit coords (port-local)
  | { kind: 'hinterland'; position: [number, number] } // outside city exclusion radius, on land
  | { kind: 'nearshore'; position: [number, number] }; // offshore water within the port zone — wrecks, coves
// All four anchor to a port (the `port` field below). There is no free-floating
// "world-map POI" — POIs always live in some port zone in the 3D world.

interface POIDefinition {
  id: string;
  name: string;
  kind: POIKind;
  class: SemanticClass;
  port: string;                   // every POI anchors to a port zone (no exceptions)
  location: POILocation;
  knowledgeDomain: string[];
  masteryGoods: string[];
  cost: { type: 'gold' | 'commodity' | 'reputation'; amount?: number; commodityId?: string };
  npcName: string;
  npcRole: string;
  lore: string;
  unlocksPort?: string;
  // procedural-only — distinguishes a procedurally-rolled garden/shrine from
  // a bespoke one with the same kind
  archetype?: 'shrine' | 'ruin' | 'wreck' | 'smugglers_cove'
            | 'garden' | 'caravanserai';
  variant?: Record<string, string | number>; // archetype-specific axis values
  decay?: number; // 0..1 — RuinTransform input
}
```

**Files** (Phase 1 creates the first three):
- `src/utils/poiDefinitions.ts` — bespoke local POI data, plus archetype variant tables once procedural lands
- `src/utils/poiConversation.ts` — Gemini system-prompt builder, parameterized per POI
- `src/components/POIModal.tsx` — Learn + Converse tabs
- (later) `src/utils/ruinTransform.ts` — the shared ruin pass
- (later) `src/utils/proceduralPOIs.ts` — archetype generators (wreck, cove, ruin, physick garden, caravanserai)
- (later) `src/utils/proceduralCoastal.ts` — placement helper for nearshore POIs (offshore band of a port zone)

#### Implementation order (revised)

1. **Phase 1 — Bespoke local POIs.** [SHIPPED] 8 hand-authored POIs across London, Goa, Surat, Mocha. `poiDefinitions.ts` (data) + `SacredBuildingMarkers` extended to render religious POIs + cyan POI beacon (`POIBeacons` in `ProceduralCity.tsx`) for every POI regardless of class + walk-up proximity detection in UI.tsx + `POIModal.tsx` with Learn tab wired to `learnAboutCommodity` + `poiConversation.ts` + Converse tab + minimap and expanded WorldMap markers (cyan circle, "?" → name on discovery via `discoveredPOIs` slice). Bespoke building geometry (Tudor Apothecaries' Hall, collegiate Oxford, etc.) is deferred to Phase 5+; today non-landmark POIs are visible only via the cyan beacon.
2. **Phase 2 — Shrine archetype on local hinterlands.** [SHIPPED] `proceduralShrines.ts` rolls 0–2 shrines per port (probabilistic, capped at 2), faith picked from `PORT_FAITHS` (catholic, protestant, sunni, shia, ibadi, hindu, buddhist, chinese-folk, animist, jewish — 10 traditions, all with name pools, NPC role pools, lore templates, and per-faith herbal knowledge domains). Three scale variants (wayside / village / pilgrimage) drive both `Building.scale` (AABB) and `Building.geometryScale` (rendered geometry, applied via `scaleLandmark` at the end of the spiritual block in `ProceduralCity.tsx`). Each shrine produces a paired `POIDefinition` attached to `Port.pois`, plus a synthetic spiritual `Building` with `poiId` so the existing renderer draws the geometry and walking detection routes to `POIModal`. Hinterland placement uses the same band as `placeHinterlandScenes` (110–215u from port center) and rejects ocean / built-up cells. Pilgrimage shrines are gated to Large+ ports. Mastery is reserved for pilgrimage scale only — the keystone good per faith (Bhang for Sufi/Hindu, Camphor for Buddhist, Theriac for Jewish, etc.).

   **2026-04-29 update — heightened silhouettes + procedural variation.** The original 0.25/0.6/1.1 scale tiers compressed shrines below city-building size and made them invisible from across the hinterland. Bumped to 1.0/1.4/1.8 (wayside still reads at distance; pilgrimage out-scales the in-city version because it's a standalone monument, not a city-block insert). AABB footprints (`SCALE_FOOTPRINT`) bumped to match. Added `Building.shrineVariant` with five procedurally-rolled axes applied at render time in `ProceduralCity.tsx`'s spiritual branch:
   - `keyFeatureScale` — Y stretch on the hero feature (any part with top-Y > 4u: towers, minarets, shikharas, pagoda spires). Range 0.85–1.6.
   - `bodyProportion` — Y stretch on the body (everything else). Range 0.85–1.25.
   - `paletteShift` — signed warm/cool RGB nudge applied to all per-faith parts. Range ±0.10.
   - `accents.boundaryWall` — eight-segment ring of low stone blocks with a front gap.
   - `accents.prayerPole` — slim pole + banner (warm red or cool indigo, keyed off `paletteShift` sign).
   - `accents.outerCourtyard` — flagstone plinth one tier wider than the body. Mostly pilgrimage scale.

   Variant rolled per shrine in `rollShrineVariant` (deterministic per worldSeed). Pilgrimage shrines bias toward exaggerated hero features. The variant pass runs *before* the uniform `geometryScale` multiplier so non-uniform stretches survive the final scale.
**2026-04-29 foundation pass.** Before procedural spawners (Phase 3) ships, the supporting plumbing was reviewed and tightened:

- **POI proximity is shared.** `src/utils/proximityResolution.ts` exports `findNearestPOI` + `POI_INTERACTION_RADIUS_BY_KIND`. UI.tsx calls it from both ship and walking-mode polling, so wrecks (sailed up to) and shrines (walked up to) share one path. Per-kind radius means a 14u-wide caravanserai can fire interaction when the player stands at the gate, while a 3u shrine still wants tight 8u tolerance.
- **POI visibility is decoupled from sacred markers.** `renderDebug.poiVisibility` (default true) controls silhouette rendering. `sacredMarkers` keeps the cyan beacons + religious plumbobs. Players who hide markers don't lose visible buildings.
- **Variant pass extracted.** `src/utils/shrineVariant.ts` owns the per-faith-block variant logic (Y-stretch by index-tagged hero feature, palette shift, three accent toggles). The renderer's spiritual block uses an `addKey(...)` wrapper for parts that should classify as the hero feature (bell tower, minaret, shikhara, pagoda, dome, etc.) — no Y-position heuristic that mistagged church nave roofs and minaret bases.
- **POIArchetype materials cached.** Module-level `chunkyMaterial(...)` cache keys MeshStandardMaterial by quantized RGB + flags. Static palettes hoisted to module constants. Removes the per-render allocation storm from ~750/render to ~bounded by unique colors.
- **Determinism preserved on variant addition.** `rollShrineVariant` rolls *after* the rotation roll in `proceduralShrines.ts`, so adding new variant axes won't shift earlier shrines on the same world seed.

**2026-04-29 update — POI archetype silhouettes.** [SHIPPED rendering only — spawners are Phase 3 below.] New file `src/components/POIArchetypes.tsx` defines four chunky low-poly silhouettes in the splash-globe style (flatShading, exaggerated proportions, deterministic per-POI variants):

- `WreckSilhouette` — tilted hull (carrack vs dhow), 0–2 snapped masts, fallen spar, partial submersion. Anchors at sea level.
- `SmugglersCoveSilhouette` — stepped cliff face + lean-to + crate stack + jetty + optional watchtower. Anchors at terrain Y.
- `GardenSilhouette` — walled rectangular compound, corner gazebo with dome, optional greenhouse, herb-bed grid. Four culture palettes (Mughal red, Jesuit cream, Chinese grey, Yemeni adobe). Fires on `kind === 'garden'` — bespoke gardens (Oxford, Malabar) and procedural physick gardens both pick it up.
- `CaravanseraiSilhouette` — fortified square with crenellated walls, 2 or 4 corner towers (round or square), arched gate with pylons, plinth.

Top-level `POISilhouettes({ ports })` reads each port's POI list, dispatches by `poi.kind`, and skips kinds that already render their own geometry (shrines via the synthetic spiritual building; landmark-bound POIs that reuse the in-city landmark mesh). Mounted next to `POIBeacons` in `ProceduralCity.tsx`. Variant axes are hashed off `poi.id` so the same world seed produces the same silhouette in the same place.

The `POIKind` union was reconciled: cut `temple`, `court`, `monastery`, `hermitage`, `battlefield`, `physick_garden`. Final 8-kind list (see planned data model above): `naturalist`, `merchant_guild`, `garden`, `shrine`, `ruin`, `wreck`, `smugglers_cove`, `caravanserai`. Bom Jesus reclassified from `monastery` → `shrine` since religious sites all fit under that umbrella now.

3. **Phase 3 — Bespoke POIs in existing port zones + first coastal-hinterland POI.** Two parallel sub-tracks that share the same plumbing:
   - **(a) Bespoke POIs in under-served existing ports.** Several existing ports have rich historical content but no POIs yet. **Socotra is the obvious first target** — it already exists as a fully-wired port (geography, faith, fleet, lore notes, dragon's-blood commodity link), so it just needs 2–3 hand-authored POIs in `poiDefinitions.ts`: a Dracaena cinnabari grove (physick-garden-like, hinterland), a coastal Nestorian Christian community remnant (shrine, hinterland), and possibly a frankincense distillery near the harbor. Same pattern as the existing 8 bespoke POIs — no new code, just data + a Converse persona.
   - **(b) First coastal-hinterland POI.** Add a **named Portuguese carrack wreck** as a `nearshore` POI in **Mozambique's port zone** (Mozambique isn't currently in the port roster — *check before adding*; if not present, anchor instead to **Zanzibar** or **Mombasa**, which are). Sailed up to in ship mode; offshore water of the host port's zone. Implements the `kind: 'nearshore'` POILocation variant + the offshore-band placement helper. Validates the wreck archetype's reward profile (cargo, charts, "last log" leads) without committing to procedural generators.

   *(Earlier drafts of this phase had me proposing to "add Socotra as a new port" — wrong, it's been a port for months. Always check the port roster above before claiming any place needs to be added.)*
4. **Phase 4 — RuinTransform + ruin archetype.** Visual investment that pays off across many archetypes later. Deferred behind Phase 3 because RuinTransform is leverage on archetype variety, and that variety only matters once there are enough archetypes to transform.
5. **Phase 5 — Physick garden archetype.** Drug-knowledge content lands here: Jesuit medicinal gardens, Mughal hakim compounds, VOC company-naturalist plots, Chinese herbalist gardens. Mostly Converse-tab content work plus a small estate-garden geometry kit. The shrine archetype's `tenant: hermitage` variant covers the sage-figure ground that the old Hermitage archetype would have.
6. **Phase 6 — Remaining procedural archetypes** (smuggler's cove, caravanserai, procedural wrecks) as fill, only if the system is carrying its weight.

#### Open questions (still in flux)

- **Procgen seeding** — same world-seed-driven generation as ports, so a player's Goa always has the same hinterland shrine. (Lean yes — POIs need to feel like *places*, not respawns.)
- **POI density per port hinterland** — start at 2.
- **Pooled vs. per-archetype Converse prompt** — lean shared with parameterized prompt (same trick as the governor persona in questplan).
- **Hostile encounters at ruins** — 15% chance of a small skirmish on haunted/bandit-occupied ruins? Adds stakes but raises scope.
- **World-map POI visibility** — bespoke always visible, procedural gated by chart unlocks (so charts found at other POIs become meaningfully valuable)?

The single biggest design lever in the whole sketch is **the RuinTransform function + the shared-faith-geometry-at-variable-scale trick**. Together they let one shrine archetype + one ruin archetype produce dozens of visually distinct sites with no new bespoke art. Everything else is variant tables and lead-roll percentages.

### Fraud detection surface
Fraud rolls on Unknown-level purchases are specced in `knowledgeSystem.ts` design but the reveal-on-sale moment + Gujarati factor warning on purchase are not yet wired into `MarketTabLedger.tsx` / `PortModal.tsx`.

### Reputation on Ship Dashboard
Deferred until the dashboard redesign.

### Manila + Lima / Callao
Planned when Pacific expansion ships. Two new building styles: `spanish-andean` (adobe, max 2 stories, deep eaves, arcaded plaza) and `manila-hybrid` (weighted mix: 30% `luso-colonial` stone, 40% `malay-stilted` bahay kubo, 20% Chinese shophouse with `upturnedEave`, 10% thatch). Only one new feature primitive needed: `upturnedEave`.

### Animated port banner — Manila as test case
Manila's PortModal banner is the prototype for replacing static GenAI banner plates with a live, time-of-day-aware scene built around a magenta-keyed transparent silhouette PNG. If it lands well, the same pipeline rolls out to the other major ports.

**Architecture** (`src/components/PortBannerScene.tsx`, wired in `PortModal.tsx:21-31` via the `ANIMATED_BANNER_PORTS` registry):
- Day silhouette (`/ports/manila.png`) and optional night silhouette (`/sleep/manila.png`) are pixel-art PNGs with a magenta sky cutout.
- A dedicated R3F `Canvas` renders, back-to-front: `SkyDome` gradient → `NightStars` → `Sun` → `SkyClouds` (banner-tuned `BANNER_CLOUDS` rig, lifted above the rooftop band so puffs read as cumulus, not smoke) → `DistantBirds` → magenta-keyed silhouette overlay shader.
- The overlay shader (`SilhouetteOverlay`) crossfades day↔night silhouettes by `dayRef.sunIntensity`, so the same building re-lights at dusk instead of just being tinted cool.
- Post chain: `Bloom` → `Pixelation` (granularity 2, the lightest setting that visibly snaps cloud edges to a shared grid with the silhouette) → `Vignette`.
- All driven by the same `useGameStore` `timeOfDay`, so the banner is in sync with the world map and any ship scene.

**Animated effects layered on the static silhouette**:
- **Sky gradient + clouds**: live, time-of-day-tinted via `dayRef.skyHorizon`. Clouds drift laterally on a wrapping group; per-cloud puff seeds are stable so React re-renders don't reshuffle them.
- **Day↔night silhouette crossfade**: `uMix` ramps with sun intensity (smoothstep 0.4–1.4), straddling golden hour.
- **Ember glow on warm pixels**: at night, the shader detects warm-bright pixels in the night PNG (lit windows, torches, ship lanterns) by combining a brightness floor with a red-over-blue chroma threshold. A per-region hashed flicker (two octaves, ~1.5 Hz + ~4 Hz) modulates them, and an additive warm glow pushes lit pixels above 1.0 luminance so the Bloom pass picks them up as soft halos rather than flat shimmer. Effect scales with `uMix` so it's invisible during daytime by design.

**Tuning knobs** (all in `PortBannerScene.tsx`):
- `BANNER_CLOUDS` — cloud y-positions, volume, color, opacity. Authored colors should be near-white at noon; the day driver in `SkyClouds` warms them at golden hour.
- Ember mask thresholds: `smoothstep(0.30, 0.55, bright) * smoothstep(0.04, 0.18, warmth)` — raise the brightness floor if too many roof tiles register as lit.
- Ember amplitude: `pulse = 1.0 + ember * (0.30 + 0.20 * flick)` and `glow = vec3(1.40, 0.70, 0.18) * ember * (...)` — the additive `glow` magnitude does most of the visible work; halve it if the city looks on fire.
- `Bloom` `luminanceThreshold` (0.55) — must stay below the post-glow luminance of lit pixels or the halo doesn't fire.

**Open questions before rolling out to other ports**:
- Authoring cost: each port needs both a magenta-keyed day PNG *and* a night version with hand-painted lit windows. Is that worth it vs. a single day PNG with shader-only nighttime tinting?
- The night PNG aspect ratio currently differs from the day PNG (1344×768 vs 1536×672); the shader handles this with separate `uDayUvScale` / `uNightUvScale`, but the parallax breaks down if they're wildly different. Standardize aspect for future ports.
- Per-port cloud rigs vs. one shared archetype-driven rig (tropical / temperate / arid). Lean toward archetype-driven once a second port is wired.
- Performance: the banner mounts a second R3F Canvas alongside the world Canvas. Cheap on desktop, untested on Safari/iOS — see "Safari perf investigation" below before assuming this scales to all 30+ ports.

**Status (2026-04)**: Manila wired and visually tuned. Next step is letting it bake for a few days of playtesting before committing to authoring night PNGs for the rest of the port roster.

### Playable factions / randomized start
Currently the game always starts as English captain of "The Dorada". Plan: 7 playable factions (English, Portuguese, Dutch, Spanish, Gujarati, Omani, Chinese), randomized on new game. All faction-keyed infrastructure (crew, cargo, starting knowledge, ship name pools, hull/sail palettes) already exists in `npcShipGenerator.ts` + `crewGenerator.ts` + `commodities.ts` + `knowledgeSystem.ts`.

- **Phase 1 (done / in progress)**: the 4 European factions. All four map to the `european` visual family so `Ship.tsx` renders correctly without changes. Wiring is faction → `{ shipType, shipName, homePortId }` in `gameStore.ts`, with `shipName` pulled from `SHIP_NAMES` in `npcShipGenerator.ts`. Home ports: London / Lisbon / Amsterdam / Seville.
- **Phase 2 (deferred)**: Gujarati + Omani (dhow family) and Chinese (junk family). Requires extracting `DhowLikeModel` and `JunkModel` from `NPCShip.tsx` into shared components, making `Ship.tsx` swap its visual mesh by family, and re-anchoring cannons / anchor / sail-trim for non-european hull proportions. Also needs home-port verification for Surat, Muscat, Quanzhou.
- **Not doing**: per-faction hull/sail colors in phase 1. `Ship.tsx` colors are hardcoded in ~20 `meshStandardMaterial` tags; plumbing them through is phase 2 scope.

### Hunting polish
Loot tables exist and basic hit detection works. Still rough: animal scatter should be more aggressive after being shot, death/butcher animation, species-specific drops that matter economically (ivory from elephants if added, hides, exotic feathers).

### Sound effects for wildlife scatter
Hoofbeats, bird wingbeats, splashing — not yet in `SoundEffects.ts`.

### Crew trouble system — planned archetypes
Crew trouble is the high-salience intervention layer above ambient `crewRelations`: rare modal events where the captain/player must decide. It should use POI-modal-like structure, but with a distinct deep red / amber / blackened-brass palette and archetype medallions. Ambient roster statuses remain lightweight; trouble modals are reserved for illness, morale breaking points, and relation tension that needs captain intervention.

| Archetype | Trigger | Systems touched | Beneficial path |
|---|---|---|---|
| Fever Below Deck | sickness worsens / `fevered` persists | health, hearts, surgeon XP, morale | surgeon care can heal + create loyalty |
| Scurvy Signs | low provisions + scurvy risk | provisions, health, morale | opening stores restores trust |
| Wounded Hand | combat/storm/hunting injury | health, role performance, relations | assign help → care bond |
| Desertion Talk | morale < 25, especially near port | morale, gold, crew removal | hear them out / advance pay preserves crew |
| Refusal of Duty | morale < 10 or repeated low-morale events | discipline, captain charisma, role | fair intervention restores work + authority |
| Ration Quarrel | `rations` relation tag + scarce stores | provisions, tension, injury risk | public rationing lowers crew-wide anxiety |
| Religious Dispute | `faith` tension, worship/prayer conflict | faith inference/canonical faith, morale, relations | separate watches/accommodations stabilize mixed crew |
| Professional Rivalry | same-role ambition / skill competition | roles, XP, relations | trial of skill grants XP and clarifies role fit |
| Captain's Authority Challenged | repeated trouble + weak morale/captain authority | captain role, morale, mutiny precursor | successful address gives crew-wide morale |
| Secret Attachment | `secret`/fondness relation grows | relations, watch assignment, jealousy risk | paired watches can boost morale/bond |
| Homesickness | long voyage + melancholic/far from home | morale, ports, journal, gold | letters/shore-leave promise builds loyalty |
| Blame After Damage | hull/sail damage after storm/combat | ship damage, roles, relations | investigation gives role XP, lowers repeat blame |
| Shared Discovery | port/POI/commodity knowledge discovery | knowledge, journal, crew domains | public credit grants XP/knowledge/morale |
| Lucky Catch | fishing/wildlife/provision pressure + lucky crew | provisions, morale, luck | shared food gives crew-wide morale |
| Port Windfall | profitable trade + factor/reputation | commerce, factor XP, gold, morale | bonus or reinvestment creates loyalty |
| Night Watch Omen | night/storm + perceptive/curious witness | weather, navigation, POI/encounter hooks | trusting/logging clue can reveal future opportunity |

Implementation order: start with data definitions and modal plumbing; wire triggers from daily health/morale ticks, voyage resolution, inn rest, and high-tension `crewRelations`; then add per-archetype medallion assets and richer outcome trees. Keep frequency gated: one active modal, 3+ day global cooldown, 10+ day per-crew cooldown, severe events can bypass.

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

# Agent Notes — Merchant of the Indian Ocean

## Who you're working with

Benjamin Breen — history professor at UC Santa Cruz, author of *The Age of Intoxication: Origins of the Global Drug Trade* (Penn, 2019) and *Tripping on Utopia* (Grand Central, 2024). His scholarship centers on early modern drug/commodity trades, the Portuguese Estado da Índia, and the intellectual history of pharmacology.

Practical implications for this project:
- The simulation target is 1612 Indian Ocean + Atlantic trade. Historical accuracy matters — period-specific, not generic "age of sail."
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

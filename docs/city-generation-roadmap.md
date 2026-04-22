# City Generation Roadmap

## Goal

Make a player feel the difference between a small port and a metropolis through built form, not just count. A 1612 London should read as densely-packed 3-4 story merchant houses around a market core, walled estates on quiet high ground, working dockyards, and sparse fringe. A small port should still look like itself.

The existing generator is the right substrate. This roadmap adds a field layer, a district layer, and scale-aware building form on top of it.

## Architecture

```
src/utils/
  cityFields.ts        field sampling (currently cityFieldModel.ts; rename for consistency)
  cityFieldTypes.ts    field vocabulary + labels
  cityDistricts.ts     NEW — classify cells into districts from fields
  cityLayout.ts        NEW — pick skeleton (town / city / major-city / metropolis)
                            from archetype + scale; emits anchor positions
  cityBuildings.ts     NEW — assign district + form metadata per building
  cityLandmarks.ts     NEW — reserve slots before generic placement
  cityGenerator.ts     orchestrator; calls the above in order
  portArchetypes.ts    existing; gains skeleton hints + landmark slots
```

Modular discipline:

- Each module takes `Port` (or a subset) as input and returns a pure data structure.
- No module mutates state another module owns.
- `cityGenerator.ts` is the only file that calls them in sequence.
- Fields → districts → layout → buildings → landmarks. Anything later can read anything earlier; not the other way around.

## District vocabulary

Seven districts. Inner/outer density is a continuous property of each building (derived from the `centrality` field), not a district class.

| District | Purpose | Dominant fields |
|---|---|---|
| `citadel` | Fort, walls, garrison yard | high prominence, high access, often waterfront |
| `sacred` | Temple/church/mosque precinct — **multi-instance, faith-tagged** | high sanctity, low nuisance |
| `urban-core` | Market, customs, guildhall, merchant houses, 3-4 story townhouses, dense residential — the "city" proper. Ethnic quarters are a style overlay here. | high centrality + access; medium-high nuisance acceptable |
| `elite-residential` | Walled estates, courtyards, gardens | high prestige, low nuisance, mildly elevated |
| `artisan` | Mixed craft and proto-industrial: workshops, tanneries, dyeworks, small forges | medium nuisance, medium access |
| `waterside` | Docks, warehouses, ship chandlers, rope walks, shipwrights, laboring quarters — distinctly marine built form. Ethnic quarters may also overlay here. | high waterfront + high nuisance |
| `fringe` | Sparse transitional edge of the city footprint | low centrality, low access |

Rural outbuildings, farms, roadside shrines, and orchards are explicitly **out of scope** for city generation. They belong to a later road-network / POI-adjacency system (see "Follow-on" below).

## Field guardrails

- Poor or laboring districts are not cursed. `waterside` and `artisan` should read as busy and working, not taboo.
- `risk` means exposure, weak surveillance, terrain difficulty, edge effects, dockside disorder — not spiritual threat.
- Strong taboo/profane zones come only from explicit emitters later: ruins, burial grounds, gallows, plague sites, uncanny groves.
- `sacred` siting is a bias, not a master switch; markets and forts are still driven mainly by access, control, waterfront, and terrain.
- Multi-faith sacred districts are allowed and expected in ports like Goa, Malacca, Surat, and Macau. Each sacred instance carries a faith tag that drives building style.

## Scale gating (hybrid)

Each scale has *required*, *forbidden*, and *biased* districts. Everything else is possible but weighted.

| Scale | Required | Forbidden | Biased toward |
|---|---|---|---|
| Small | urban-core (light) | elite-residential, artisan (as distinct district) | citadel if fort site, one sacred |
| Medium | urban-core, one sacred | — | waterside if port geography allows |
| Large | urban-core, waterside, one sacred | — | elite-residential, artisan, citadel |
| Very Large | urban-core, waterside, elite-residential, artisan, ≥2 sacred | — | multiple sacred, secondary waterside |
| Huge | all seven | — | multiple sacred of different faiths, multiple waterside zones |

This gives the "London feels different from Mocha" guarantee without making small ports silently grow districts they shouldn't have.

## Phase A — Districts and scale gating

Scope:

- `cityDistricts.ts`: classify the cells of each port's footprint into the seven districts by scoring them against the existing field samples.
- Apply scale gating to allow/forbid/bias districts per port.
- Tag every existing building with its `district` at generation time.
- Extend the debug overlay with a district-color mode alongside the field modes.
- Keep all current anchor placement and A* road behavior. Districts *score* current anchors; they do not replace them yet.

Visible result: ports read as zoned when the district overlay is on. No building geometry has changed.

## Phase B — Building form by district

Scope:

- Extend building metadata: `district`, `housingClass`, `stories`, `parcelTightness`, `setback`, `frontageWidth`.
- `cityBuildings.ts` assigns these from district + local centrality + archetype.
- Renderer uses metadata to vary massing. No new building types required.

Form targets per district:

- `urban-core`: narrow parcels, low setback, 2-4 stories in large cities. This is where the metropolis read lives.
- `elite-residential`: wide parcels, large setback, walled courtyards, 1-2 stories, gardens.
- `waterside`: long rectangular warehouses, ship-sheds, cranes/pulleys, low wooden outbuildings, rope walks — a distinctly marine/industrial silhouette.
- `artisan`: medium parcels, mixed heights, workshop frontage, smoke vents for proto-industrial buildings.
- `sacred`: reserved precinct, faith-tagged building style.
- `citadel`: reserved precinct, fortified massing.
- `fringe`: wide spacing, low massing.

Visible result: London reads dense and tall at its core, the docks look like docks, elite districts look elite, small ports are unchanged.

## Phase C — Landmarks and archetype skeletons

Two sub-scopes, sequenced.

**C1 — Landmark slots.** Activate `landmarks[]` from `portArchetypes.ts`. `cityLandmarks.ts` reserves cells before generic placement. Slot types: `citadel`, `bridgehead`, `waterfront`, `hilltop`, `sacred-precinct`, `custom`. Bridge family overrides: `stone-arch`, `timber-trestle`, `pontoon`, `housed-bridge`.

**C2 — Archetype skeletons.** `cityLayout.ts` picks a skeleton family from `archetype + scale` before counts. Town and light-city paths stay close to current behavior. Major-city and metropolis paths get archetype-specific skeletons:

- `tidal_river`: waterfront spine on active banks, bridgeheads, inland parallel corridors
- `estuary`: dominant bank + weaker opposite bank or river-mouth crescent
- `bay` / `continental_coast` / `peninsula`: shore-parallel waterfront with inland parallels
- `strait`: elongated waterfront settlement
- `island` / `crater_harbor`: compact constrained core with shaped fringe
- `canalLayout`: preserve bespoke canal geometry; districts honor canal rings/radials rather than overriding them

Visible result: the Tower of London is placed on purpose; Amsterdam's districts align with canal rings; Malacca reads as a strait city, not a shrunken London.

## Port review matrix

| Tier | Ports | Skeleton | Required districts | Notes |
|---|---|---|---|---|
| Small | zanzibar, mocha, socotra, diu, elmina, luanda, jamestown, cape | town | urban-core (light) | light districting; preserve compactness |
| Medium | hormuz, aden, macau, mombasa, muscat, bantam, cartagena | town / light city | urban-core, one sacred | geography should drive siting more than counts |
| Large | goa, calicut, surat, seville, salvador, havana | city | urban-core, waterside, sacred | distinct core and real waterfront band |
| Very Large | malacca, amsterdam | major-city | urban-core, waterside, elite-residential, artisan, ≥2 sacred | multi-district; canal/strait skeletons |
| Huge | lisbon, london | metropolis | all seven | dense tall core, multiple sacred of different faiths, working dockyards, walled estates |

## Risks

- Overfitting to London and making every large city a tidal-river city. Archetype-first skeleton selection (Phase C) is the guard.
- Sacred/profane field becoming too strong before explicit emitters exist. Keep it as a bias.
- Raising literal building count instead of improving density read through form. Phase B is where the metropolis read is earned, not Phase A.
- Collapsing poor/laboring districts into cursed/taboo districts.
- Districts overriding canal geometry rather than honoring it.
- Field scores correlating so tightly that district classification becomes arbitrary. Worth auditing correlations between `centrality`, `access`, and `prestige` once Phase A lands.

## Success criteria

- Small and Medium ports remain at least as readable as they are now.
- Large+ ports feel materially different in plan, not just in building count.
- London reads as dense 3-4 story core + elite estates + working docks.
- Waterside districts look marine, not just "poor."
- Landmark placement is slot-driven.
- Multiple sacred districts of different faiths are visible in Goa, Malacca, Surat, Macau.
- The debug field overlay stays useful enough to tune later phases.

## Follow-on — countryside and road-adjacent buildings

Out of scope for this roadmap but tracked:

- Road-network system places isolated buildings (farms, barns, roadside shrines, hermitages, brigand camps, mile-markers) along routes between cities and POIs.
- Reuses low-resolution `risk` and `sanctity` fields from `cityFields.ts` at world scale, so the same model drives both city interior and countryside without duplicating logic.
- Not a phase — a separate system built once the in-city work is stable.

# Quests — design plan

Status: design, no code yet. The trunk type, panel/toast UX, and source list are settled enough to start building. The governor section is still a sketch — full design lives there until tavern + crew + POI sources have shipped and we've felt the system in playtest.

## Goal

Make the "Quests" button (currently a stub — hotkey wired at `UI.tsx:1315`, rendered at `2048` mobile / `2087` desktop) into a real system without ballooning into a sprawling RPG quest engine. The button is gold/amber (`#fbbf24`), Lucide `Scroll` icon, hotkey `6`.

## Core idea

One persistent type — `Lead` — produced by four creation surfaces, all funneling into one panel and one resolution check. The complexity that destroys quest systems comes from per-source schemas; everything here shares one shape.

Quests in this game are *leads*, not "missions." They are persistent traces of a conversation or discovery that outlive the ephemeral NPC who gave them. The LLM does the narrative work; the system holds a thin structured shell so a lead can survive after the giver is regenerated next port visit.

## The trunk type

```ts
type LeadSource = 'tavern' | 'crew' | 'poi' | 'governor';
type LeadStatus = 'active' | 'done' | 'failed' | 'expired';
type LeadTemplate = 'delivery' | 'person' | 'commodity' | 'debt' | 'medical';

interface Lead {
  id: string;
  source: LeadSource;
  template: LeadTemplate;       // selects the brass-circle icon
  title: string;
  task: string;                 // one-sentence summary
  sourceQuote: string;          // the giver's actual line — flavor anchor

  giverName: string;
  giverPortraitId?: string;     // if a named, cached NPC; otherwise template icon
  giverPort?: string;           // tavern / governor / crew

  target: {
    port?: string;
    poiId?: string;             // explicit reference, no fuzzy distance
    commodity?: string;
    person?: string;
  };

  offeredOnDay: number;
  deadlineDay?: number;

  reward: {
    gold?: number;
    rep?: { faction: string; amount: number };
  };

  status: LeadStatus;
}
```

State lives in `gameStore.ts` as `leads: Lead[]` plus actions `addLead`, `resolveLead`, `failLead`, `expireLead`. Mirror the existing `JournalEntry` patterns. **Per-source soft caps** prevent any one source from crowding the panel: `max 2 tavern, 1 crew, 2 poi, unlimited governor`. The implicit total ceiling is ~5–6 active leads at peak. Caps are enforced in `addLead` — a new tavern offer when 2 tavern leads are already active simply doesn't surface the Accept button (parse-or-no-button discipline already handles this for tavern; crew/POI need explicit cap checks). **No dedup** — two "deliver to Goa" leads from different givers coexist; the per-source caps throttle redundancy naturally.

A flat global cap was the earlier draft. It looked clean but produced the wrong steady state: tavern offers fire every NPC turn while crew/governor are rate-limited, so a global cap-of-4 is always 3 tavern + 1 other. Per-source caps fix the volume mix without adding any other knobs.

The `debt` field, the `info` / `ship` / `armaments` reward variants, and any world-coords targeting are deliberately *not* in the v1 trunk. They get added in the PR that ships their owning source (governor, mostly), so the schema only carries what's already wired.

## v1 UX — panel and toast

Quests live in two surfaces with different temporal layers.

### The panel — slide-out, sister to the Journal

A ~520px-wide left-side panel, opened by a Quests button placed next to the Journal button at `bottom-4 left-4` (Journal currently at `UI.tsx:2006`). Hotkey `6`. Backdrop-blur over the canvas; **does not pause time** — you may want to glance at quests while sailing. Same chrome family as Journal: `bg-[#0a0e18]/70 backdrop-blur-xl border border-[#2a2d3a]/50 rounded-xl`, gold `#c9a84c` accents.

Each lead renders as a **commission card** (~140px tall):

- Brass-circle icon on the left, matching the minimap chrome. Icon is one of **5 template glyphs** (`delivery`, `person`, `commodity`, `debt`, `medical`) **or** an NPC portrait if the giver is a named, cached character (bespoke POIs, governors, recurring tavern NPCs). Anonymous one-shot givers ("the dying lascar," "the last log of the *Cinco Chagas*") always use the template glyph — don't generate portraits for one-shots.

  Earlier drafts had 8 glyphs (added `passenger`, `relic`, `letter`, `investigation`). Cut: `letter` and `relic` collapse cleanly into `delivery`; `passenger` into `person`; `investigation` was suspiciously generic and always resolves to one of the other five at completion time. Less art to commission, faster icon-recognition for the player.
- Title in Fraunces serif.
- Giver line.
- A 1–2 line italic excerpt of `sourceQuote`.
- Target chip (port name or POI name).
- Deadline countdown.
- Reward chip — **category** for tavern/crew/POI (`gold · modest`, `info · chart`, `rep · faction`); **exact numbers** for governor. See Reward visibility below.

Click a card → expands inline (not a sub-modal) to show full quote + Abandon button. **No Resolved tab** — completed/failed/expired leads vanish from the panel and write a journal entry instead. Empty state: *"No open commissions. Past leads are recorded in your Journal."*

A small gold pip on the Quests button when there's an unviewed lead, clears on panel-open.

### The toast — top-center, distinct from ASCIIToast

A new `QuestToast` component sits ~80px below the port-label cartouche (`UI.tsx:1741`), styled in Fraunces serif + thin gold rules so it reads as the same family as the cartouche, not as combat chrome. **All quest events flow through this**, never the bottom-right ASCIIToast stack — that channel stays for non-quest world ticker events. Three variants:

1. **Offer** — never auto-dismisses. Inline `Accept` / `Decline` buttons. Bright gold + full ornament. Pauses time briefly while open, like the building-walkup toast. Used by tavern, crew, POI, and governor offers.
2. **Resolved** — auto-fades ~5s, click-X. Bright gold + small wax-seal flourish. Reward reveal lands here for hint-style sources (*"…a fine letter of introduction to the Vizier of Aceh"*).
3. **Failed / Expired** — auto-fades ~5s, click-X. Same chrome but desaturated (muted gold → bone-grey rule lines). Governor failures linger ~8s and are louder.

**Collision with mode banners.** Top-center already hosts CombatModeBanner / HuntingModeBanner / AnchorBanner / CollisionBanner. QuestToasts **queue while a mode banner is up** and dequeue when it dismisses. Rare in practice (you don't usually accept a tavern errand mid-cannon-fire), but the queue makes the rare case sane.

**Queue overflow.** A long combat session could queue several toasts. If more than **2 toasts of the same variant** are queued at dismiss time, collapse to a single summary pseudo-toast (*"3 commissions expired while you fought,"* *"2 leads resolved in port"*). Prevents the bad UX where a 4-hour combat ends and the player is staggered by a stack of dismissals. Offer toasts never collapse — they always need an Accept/Decline.

A journal entry fires alongside every toast for resolve / fail / expire — toast is the announcement, journal is the durable record.

## The four sources

| Source | Stakes | What's distinctive | Volume control |
|---|---|---|---|
| `tavern` | Low. Info, small gold, rep | `giverPort`, soft deadline, gossip register | Per-source cap 2; soft-expire on deadline + grace |
| `crew` | Medium. Crewmember health/welfare | Daily-tick trigger on health flip; freezes deterioration on accept | Per-source cap 1; 4-day cooldown |
| `poi` | Variable. Most POIs give items/knowledge; only some give leads | Bespoke = named giver; procedural = anonymous voice. Targets port or another POI | Per-source cap 2; per-archetype rate (see AGENTS.md) |
| `governor` | High. Ships, armaments, capital — and debt | Hard deadline, failure → forced follow-up audience | Rep-gated, rare; no cap |

Tavern / crew / POI leads soft-expire (panel removes silently, single QuestToast on day-of-expiry, journal entry). **Governor leads never expire** — they convert to unpaid debt and follow the player.

## Source 1 — Tavern (simplest, ship first)

Hook into `TavernTab.tsx` after each NPC turn. When the NPC's turn includes a concrete offer, the LLM emits a structured sidecar in the same response (`{offer: {title, task, target, deadline, rewardHint, template}}`). The "Accept this errand" button renders iff the sidecar parses **and** the tavern per-source cap (2) isn't full; clicking it calls `addLead` with the parsed fields verbatim. No retry, no silent miss — if parse fails or cap is full, no button appears, conversation continues unaffected.

Tavern shares its sidecar-parse + Accept-button code with both POI sources (bespoke and procedural) — see Source 3. One mechanism, three system prompts. Don't duplicate the parser per source.

Reward sizes are modest: `gold: 50–300`, rep ±5–10. No ships, no armaments. Tavern leads are *texture*, not engine.

## Source 2 — Crew (the emergent one)

Trigger from the daily tick (`gameStore.ts:2166` neighborhood — provisions/health pass): when a crewmember flips healthy→sick or scurvy→fevered, fire deterministically if and only if:

- No active `crew` lead (per-source cap of 1).
- 4-day cooldown since the last crew lead resolved or expired.

Two knobs, no random gate. Earlier drafts had a 30% roll on top, but three knobs is one too many — random gates feel arbitrary to players ("why didn't this one trigger?") and obscure tuning. If playtest shows it firing too often, lengthen the cooldown to 6 or 8 days. One number to turn.

A QuestToast offer surfaces: *"Cook Diogo has gone pale and cannot keep food down. Will you seek out a doctor in the next port?"* Accept / Decline.

**The mechanical commitment.** On accept, the crewmember's deterioration **freezes** while the lead is active — the captain has acknowledged it, the crew has hope. Resolution: visit any port and engage a surgeon (Surgeon role check on existing crew, or port has a hireable physician — depends on what wires up first). On resolve, crewmember returns to `healthy`. On expiry/decline, deterioration resumes and may worsen one tier.

Without the frozen-on-accept commitment, decline-spam is the dominant strategy. The lead has to *change* something, not just describe it.

## Source 3 — POI

POIs (see Planned section in `AGENTS.md`) are sites with a modal — both bespoke (hand-authored, named NPCs) and procedural (shrines / ruins / wrecks / etc., templated). Lead-creation hooks into the POI modal once it lands.

**Lead probability is per-archetype**, not a blanket POI rate. Source of truth lives in `AGENTS.md` POI archetype catalog (shrine 30%, ruin 40%, wreck 50%, garden 15%, caravanserai 35%, naturalist 25–35% hand-tuned per bespoke POI). The remaining percentage on each POI splits between item/knowledge gifts and pure information (chart reveals, contact names, rumored-POI markers — see below). The earlier blanket "~25% of POIs give a Lead" wording undersold wrecks (the rarest, highest-payoff archetype) and oversold gardens.

**Bespoke vs procedural giver split:**

- **Bespoke POIs** (Apothecaries' Hall, Banyan Counting House, Mappila House, Bom Jesus, etc.) → **named recurring giver**, lead persists with the NPC's portrait + name. The giver doesn't evaporate next visit, so resolution can route back through the same NPC for follow-up dialogue. These are the *good* version of tavern leads.
- **Procedural POIs** (shrine / ruin / wreck / smugglers cove / caravanserai / procedural gardens) → **anonymous voice** ("the dying lascar," "the hermit at the wayside shrine," "the last log of the *Cinco Chagas*"). Template glyph icon, no portrait.

This split also gives bespoke POIs a structural advantage: the named NPC is a recurring referent that procedural sites can't offer.

### Lead creation: one mechanism, three sources

POI leads (bespoke and procedural) and tavern leads share **one creation code path**: the LLM emits a JSON sidecar in its response, the parser surfaces an Accept button if the sidecar parses, otherwise no button. Same sidecar shape, different system prompts:

- Tavern prompt → casual gossip register.
- Bespoke POI prompt → named NPC with full lore + role context.
- Procedural POI prompt → anonymous voice with archetype context (faith / scale / decay for shrines; ship type / age for wrecks; etc.).

Crew and governor leads use separate mechanisms because their stakes structure is different (crew is daily-tick driven; governor is a structured audience with a ledger snapshot). But the three "conversational" sources collapse to one parser, one Accept-button component, one `addLead` call site.

This collapses what would have been three near-duplicate code paths into one. Don't let it grow back.

### Cross-POI targeting: rumored markers

POI leads can target either a port (`target.port`) or another POI (`target.poiId`). The lascar handing you a relic for a Hindu shrine "further west" sets `target.poiId`. But how does the player know where that POI is if they haven't discovered it?

Cleanest answer: **lead creation marks the target POI as `rumored`**. POIs gain a `discoveryStatus: 'discovered' | 'rumored' | 'hidden'` field in render state. Defaults to `hidden`; flips to `rumored` when a lead targets it; flips to `discovered` on first walk-up. Markers render at three opacity tiers (full / desaturated / not-rendered). Rumored markers appear on **both** the world-map overlay and the local map within the target's port zone, so the lead has long-range pull.

Three-state enum, one field, drives marker opacity everywhere it already renders. No new map surface, no fuzzy-radius search.

### POI leads as exploration glue

POI leads are what makes the map reward detours instead of beelining. Targeting weight should bias toward **POIs in unvisited or under-visited port zones** when rolling lead targets — otherwise leads cluster around already-trodden ground and the glue doesn't fire. One bias function, applied at lead-creation time.

Reward profile sits between tavern and governor — sometimes a unique item or chart that no other source provides.

## Source 4 — Governor audience (the engine — full design deferred)

The Governor tab in `PortModal.tsx` is currently a stub. Repurpose it as a single LLM roleplay surface. This is the highest-impact source and the hardest to tune; the full design here is preserved as a reference but expects revision once tavern + crew + POI sources are in playtest.

**Persona prompt:** Gemini Flash Lite as the governor of this port — historical era (1612), title appropriate to the polity (Mughal subahdar, Portuguese viceroy, VOC opperhoofd, English factor, etc.), known concerns. The persona should explicitly *not* be a pushover: "you are not stupid; merchants lie to you constantly; you keep your own clerk's ledger."

**The judgment problem is the whole feature.** The LLM must evaluate the player's pitch against actual world state, or savvy players exploit it. Pass a fixed compact snapshot in the system prompt (~300–400 tokens, cached per audience):

- Top 10 commodity prices in this port (current).
- Last-seen prices the player has from up to 5 most recently visited *other* ports.
- Player gold, ship class, crew count, this-port reputation.
- List of port IDs the player has actually visited.

Don't feed the journal — too noisy and varies in length.

**Programmatic bluff pre-check before the model call.** Don't ask Gemini Flash Lite to do arithmetic and judgment when arithmetic can be done deterministically. Before calling the model, scan the player's pitch for port names and price claims:

- If a claimed port name parses out and is **not in `visitedPorts`**, inject a forced-skepticism token into the system prompt: `THE PLAYER HAS NEVER VISITED {port}. THEIR PRICE CLAIM IS UNVERIFIED.`
- If a claimed price ratio exceeds **2× the snapshot** for the same commodity in a port the player *has* visited, inject: `THE PLAYER'S CLAIMED PRICE FOR {commodity} IN {port} IS {n}× WHAT THEY PAID THERE LAST.`

The LLM still does the persona work and the soft judgments — these tokens just guarantee the governor *notices* the two failure modes most likely to break the system. Pure-LLM bluff detection is fragile and inconsistent; programmatic + LLM is robust and cheap.

**Player levers:**
- **Opening register**: deferential / businesslike / brash — sets the governor's response window.
- **Concrete ask**: writ of safe conduct / introduction letter / cash investment / outfitted ship / armaments. Each ask sets the upside *and* the maximum downside.

**Stakes ceiling — by ask size (first cut, real numbers come from playtest):**

| Ask | Best case | Worst case (initial pitch) |
|---|---|---|
| Writ / introduction | Lead with rep + info reward, no debt | Awkward dismissal, −2 rep |
| Small investment (≤500) | Lead with `debt` populated | −5 rep, lose audience for N days |
| Large investment (≤2000) | Lead with `debt`, deadline | −10 rep, lose 1 crew (insulted retainer), audience locked |
| New ship / armaments | Lead with `debt`, hard deadline, future audience for new commission | −15 rep, brief jail (lose N days) |

**Death is reachable only via the follow-up audience after default**, not the initial pitch. Players who default on a large governor commission and return to that port get a non-declinable second audience where the consequences spike: ship seized, captain killed, etc. This makes the consequence surface principled (size of failure scales to size of original ask) rather than capricious.

**Reputation gates** the audience itself: minimum rep to be granted a meeting, with a per-port cooldown if denied.

A successful pitch creates a Lead with `debt` populated (the trunk type's schema gets extended in this PR — `debt: { amount, dueDay, creditor }` is added back deliberately, and only here, so it doesn't bloat the v1 type). Resolving on time clears the debt and unlocks larger future audiences. This is what gives the governor its identity vs. tavern: governor leads are *contracts*, not gossip.

For v1 of the governor source, use generic title-of-office personas. Backfilling 1612 personae per port (Pieter Both VOC, Mughal subahdars, Portuguese viceroys, Qutb Shahi factors at Masulipatnam, etc.) is a polish pass once the system works mechanically.

## Reward visibility

Split by source, not one rule for all. Two layers: **panel chip** (always visible, lets the player triage under deadline crunch) and **resolution reveal** (the moment of payoff).

- **Tavern / crew / POI**:
  - Panel chip shows **category only**: `gold · modest`, `gold · meaningful`, `info · chart`, `info · port`, `rep · {faction}`, `item · unique`. Player can prioritize four leads at a glance without losing the reveal.
  - Resolved QuestToast shows the exact reward, with flourish (*"…a fine letter of introduction to the Vizier of Aceh"*).
- **Governor**: exact numbers up front in panel and toast. They're contracts — debt is `1200 reales`, deadline is `90 days`, reward is `a pinnace + 200 reales`. Player needs to know what they signed.

The split tracks the gossip-vs-contracts identity that gives governor leads their distinct feel. The earlier draft hid all non-governor rewards entirely; that made the panel useless for triage when four leads stacked up under different deadlines.

## Resolution

One check per source-type, runs in two places:

- **On entering a port** (`activePort` set in gameStore): scan active leads where `target.port === port.id`. If match, surface a "deliver / report" prompt in PortModal.
- **On opening a POI modal**: scan active leads where `target.poiId === poi.id`. If match, surface the same prompt inside the POI modal. On first open, also flip the POI's `discoveryStatus` from `rumored` (or `hidden`) → `discovered` if not already.

No fuzzy world-coords radius. Targets are explicit references — either a known port id or a known POI id. Resolution prompt is a small in-modal block: "You have reached X. Resolve [lead title]?" → on confirm, fire `resolveLead(id)`, apply rewards, fire Resolved QuestToast, journal entry, optional follow-up dialogue with the original giver if locally available (always available for bespoke POIs; never for procedural).

Failure paths:
- Deadline passes → `status: 'expired'` (silent panel removal + single Expired QuestToast + journal entry) for tavern/crew/POI; `status: 'failed'` with debt event for governor.
- Player loses required commodity (e.g. spoilage, theft, jettison) → `status: 'failed'`, Failed QuestToast.

## Two-map architecture interaction

The game has two map surfaces (see AGENTS.md): the local 3D port zone and the D3 world-map overlay. Quest UX behavior across both:

- **Quests panel** is global — opens on hotkey `6` from either surface, doesn't pause time, slides in over whichever map is active.
- **QuestToast** renders at top-center on both surfaces, same chrome, same queue.
- **Rumored POI markers** appear on the world-map overlay as soon as the lead is created (long-range pull) and on the local map within the target's port zone when the player enters that zone. Discovered POIs render at full opacity; rumored at ~40% with a thin gold ring; hidden don't render at all.
- **Resolution check** fires on entering a port zone (port leads) or opening a POI modal (POI leads) — same as before. The world-map overlay is chrome and never resolves leads on its own.

## End-to-end loop, as a player experiences it

1. Surat tavern. Spice merchant: her sister in Calicut needs a remedy from a Goan apothecary. Tavern lead, 60-day soft deadline, modest reward.
2. Day 12 at sea: cook Diogo flips to scurvy. Crew QuestToast offers a "find a surgeon" lead. Accept — Diogo's deterioration freezes. The Calicut detour is now also a chance to engage a surgeon there.
3. Sailing to Goa, you spot a POI: a beached carrack. POI modal — find a chart revealing a Comoros anchorage (info, not a lead — flips a hidden POI to `discovered`). Next POI a week later: a dying lascar begs you carry a relic to a named Hindu shrine POI further west. POI lead with `target.poiId` created; that target shrine flips from `hidden` to `rumored` and a desaturated marker appears on the world-map overlay so you can find it.
4. Governor audience denied on first port stop — rep too low. Come back later.
5. Back in Surat, rep is up. Governor grants audience. You pitch a clove venture to Aceh — LLM checks your pitch against current prices + travel history (Aceh isn't in your visited list; the governor catches the bluff and the pitch falls flat). Try again with a smaller, defensible ask: a writ of safe conduct. Granted. New lead, no debt.

Five active leads at peak (within per-source caps), four sources, one panel.

## Implementation order

Build the trunk, then add one source at a time and play with it before adding the next.

1. **`Lead` schema + Quests panel + QuestToast component** — the trunk + both UX surfaces, no sources yet. Wire up the button next to Journal. Empty panel that reads from `state.leads`. Mode-banner queue logic and queue-overflow collapse in QuestToast.
1.5. **Visual playtest of QuestToast collisions** — manually trigger combat / hunting / anchor / collision banners and verify the queue + collapse rules behave. One afternoon, before any source is built, because every source feeds this toast and bugs here are noisy in playtest.
2. **Starter quest** — auto-added on game start: *"The factor expects a return on this venture. Show a profit at a foreign port within sixty days."* Resolution check on sale event in any port ≠ acquired port (cargo provenance already tracks `purchasePrice` and `acquiredPort` — reuse, no new state).
3. **Tavern source + shared sidecar parser** — cheapest, gives texture immediately, exercises the panel. Player-gated creation via "Accept this errand" affordance + LLM JSON sidecar. Land the sidecar parser in a shared module (`src/utils/leadSidecar.ts`) since POI sources will reuse it verbatim.
4. **Crew source** — daily-tick watcher, fires QuestToast offer on health flip. The frozen-on-accept commitment is what makes it a lead and not a notification.
5. **POI source (bespoke + procedural)** — once the parallel POI modal effort lands. Reuses the tavern sidecar parser; only the system prompt and giver-naming differ. Add `discoveryStatus` field to POIs and rumored-marker rendering in this PR.
6. **Governor source** — the high-impact "real game." Persona prompt + ledger snapshot + programmatic bluff pre-check + ask/stakes table + debt resolution. The trunk type's `debt` field gets added in this PR.

## What we are NOT building

These are where this kind of system metastasizes:

- Quest chains / branching unlocks
- Per-NPC cross-port memory (bespoke POI givers stay local to their POI — that's not cross-port)
- Faction politics between governors
- Multi-stage commissions (a governor offering a new lead on completion is a *fresh* lead, not a chain node)
- "!" markers floating over NPCs
- Hail leads (NPC-ship offers en route — explicitly cut; smallest add and most likely to feel forced, given how brief the hail UI is. If a future hail UI gets a follow-up screen longer than one line, revisit.)
- Save-scumming protection (out of scope)

The earlier draft also cut "world-map quest markers (text in panel only, for v1)." That's been **un-cut** for the rumored-POI marker case only — leads that target a `poiId` flip the target's `discoveryStatus` to `rumored` and the existing POI marker pipeline renders it desaturated. No new marker layer; just a third opacity tier on an existing render path. Port-targeted leads stay text-only.

The discipline is: **leads are atomic and stateless except for status.** A second lead can be offered on completion of the first, but it's a new atom, not a state machine.

## Open questions / things still in flux

- **LLM JSON-sidecar reliability** for tavern leads. Parse-or-no-button is the safety mechanism, but the rate at which legitimate offers get dropped because the model didn't emit the sidecar needs playtest.
- **Stakes ceiling table** — the governor upside/downside per ask size is a first cut. Real numbers come from playtest; defer until tavern + crew + POI have shipped.
- **Whether the "freeze deterioration on accept" rule for crew leads feels right** — could read as gamey. Alternative: deterioration *slows* but doesn't stop. Decide in playtest.
- **Failure visibility for tavern/crew/POI** — silent panel removal + single QuestToast on day-of-expiry + journal entry is the current call. May still be too soft if expiry fires while the player is mid-combat or mid-modal and the toast queues out of sight. Watch for this.

## Files that would be touched (when this kicks off)

- `src/store/gameStore.ts` — `Lead` type, `leads` slice, actions (with per-source cap enforcement in `addLead`), daily-tick crew watcher, `discoveryStatus` field on POIs
- `src/components/QuestsPanel.tsx` — new (~520px slide-out, sister to Journal)
- `src/components/QuestToast.tsx` — new (top-center, three variants, mode-banner queue, queue-overflow collapse)
- `src/components/UI.tsx` — wire hotkey `6`, Quests button next to Journal at `bottom-4`, render QuestToast stack
- `public/icons/quests/` — new folder, **5** brass-circle template glyphs (`delivery`, `person`, `commodity`, `debt`, `medical`)
- `src/utils/leadSidecar.ts` — new, **shared** LLM JSON sidecar parser used by tavern + bespoke POI + procedural POI sources
- `src/components/TavernTab.tsx` — tavern source hook (calls shared sidecar parser + Accept button)
- `src/utils/leadResolution.ts` — new, port/POI match check
- (later) `src/components/POIModal.tsx` — POI source hook (calls same shared sidecar parser; system prompt varies by bespoke vs procedural)
- (later) `src/components/WorldMap.tsx` and POI marker render paths — three-tier opacity (discovered / rumored / hidden)
- (later) `src/components/PortModal.tsx` — Governor tab → audience surface
- (later) `src/utils/governorPrompt.ts` — new, persona + ledger snapshot + programmatic bluff pre-check

---

## Adjacent idea — wildlife trophies (notes, not a quest source)

Status: design note only. Not part of the Lead system.

Killing dangerous wildlife should occasionally drop a named, historically-grounded trophy that flows through the **existing commodity + POI conversation flow** — no new inventory category, no capture mechanic, no naturalist profession.

The discipline: this is a loot table on an action that already exists (combat with the wildlife system), feeding into POIs that already exist. If it can't be built that way, don't build it.

### Scope

- 5–8 named trophies total across all biomes. Each tied to a specific species the wildlife system already spawns (tiger pelt, rhino horn, elephant tusk, civet musk, ambergris, deer bezoar, etc.). More than ~8 turns it into a checklist.
- Each trophy is a commodity entry (or commodity-shaped item) with a documented historical buyer or two — Seville/Casa de Contratación, Mughal court, Goa Jesuit college, Florentine collectors, London virtuosi.
- Drops are *rare*. Most kills yield nothing special; the moment a tiger pelt drops should be a story, not a grind.
- POI conversation gates ("do you have X?") use the same pattern POI conversations already use. No new UI.

### Why this and not the naturalist subsystem

The earlier naturalist/capture/specimen idea was a parallel game stapled to the trade loop. This version rewards what the player already does (hunting dangerous wildlife for survival or coin), uses systems that already exist, and the trophy *is* the historical note — the hook is "a player who shoots a tiger near Masulipatnam and sells the pelt to a Mughal collector has just lived a real 1612 transaction."

### What we are NOT building here

- Capture / live specimens / menageries
- A naturalist crew profession
- Specimen preservation state, decay, or care
- A "knowledge" currency or codex UI
- Trophy-specific quest leads (if a POI wants a tusk, that's a normal Lead with a commodity target — same trunk type)

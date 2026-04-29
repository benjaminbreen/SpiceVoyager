# Quests — design plan (in flux)

Status: design only, no code. Details are still being worked out; treat this as a sketch to argue with, not a spec to implement against. The shape below is what we'd build *if* we built it tomorrow, but every section is open to revision.

## Goal

Make the "Quests" button (currently a stub at `UI.tsx:1130` and rendered at `1843` / `1882`) into a real system without ballooning into a sprawling RPG quest engine. The button is gold/amber (`#fbbf24`), Lucide `Scroll` icon, hotkey `6`.

## Core idea

One persistent type — `Lead` — produced by four creation surfaces, all funneling into one panel and one resolution check. The complexity that destroys quest systems comes from per-source schemas; everything here shares one shape.

Quests in this game are *leads*, not "missions." They are persistent traces of a conversation or discovery that outlive the ephemeral NPC who gave them. The LLM does the narrative work; the system holds a thin structured shell so a lead can survive after the giver is regenerated next port visit.

## The trunk type

```ts
type LeadSource = 'tavern' | 'governor' | 'poi' | 'hail';
type LeadStatus = 'active' | 'done' | 'failed' | 'expired';

interface Lead {
  id: string;
  source: LeadSource;
  title: string;
  task: string;                 // one-sentence summary
  sourceQuote: string;          // the giver's actual line — flavor anchor

  giverName: string;
  giverPort?: string;           // for tavern / governor
  giverCoords?: [number, number]; // for poi / hail

  target: {
    port?: string;
    coords?: [number, number];
    commodity?: string;
    person?: string;
  };

  offeredOnDay: number;
  deadlineDay?: number;

  reward: {
    gold?: number;
    items?: string[];
    rep?: { faction: string; amount: number };
    info?: string;              // commodity id, port id, or chart unlock
    ship?: string;              // ship type id
    armaments?: string[];       // weapon ids
  };

  debt?: {                      // governor only
    amount: number;
    dueDay: number;
    creditor: string;           // 'governor:<port>'
  };

  status: LeadStatus;
}
```

State lives in `gameStore.ts` as `leads: Lead[]` plus actions `addLead`, `resolveLead`, `failLead`, `expireLead`. Mirror the existing `JournalEntry` patterns.

## The four sources

| Source | Stakes | What's distinctive | Volume control |
|---|---|---|---|
| `tavern` | Low. Info, small gold, rep | `giverPort`, soft deadline, gossip register | Soft-expire on deadline + grace |
| `governor` | High. Ships, armaments, capital — and debt | `debt` populated, hard deadline, failure → forced follow-up audience | Rep-gated, rare |
| `poi` | Variable. Most POIs give items/knowledge; only some give leads | `giverCoords`, often anonymous giver ("the dying lascar") | ~1 in 4 POIs |
| `hail` | Low–medium. Cargo runs, letters | `giverCoords`, short deadline | Friendly trader-mood ships only, ~10% |

A global cap (~6 active) prevents log overflow. Tavern / hail / POI leads soft-expire silently after deadline + grace. **Governor leads never expire** — they convert to unpaid debt and follow the player.

## Source 1 — Tavern (simplest, ship first)

Hook into `TavernTab.tsx` after each NPC turn. Run a small extractor pass against the conversation: "did this turn contain a concrete offer with a target and a reward? if yes, return JSON matching the Lead schema." Two reliability options:

- **(a) Strict schema + retry.** LLM outputs JSON, validate, retry once. Accept ~10% miss.
- **(b) Player-gated.** A "Suggested response" affordance ("Accept this errand") makes lead creation deterministic and intentional. Player chooses to accept; LLM only fills in the structured fields.

**Lean (b).** Accepting a quest should be a deliberate player choice, not something that happens silently as conversation drifts. Fits the grounded tone better.

Reward sizes are modest: `gold: 50–300`, occasionally `info` (a commodity reveal or port-intel unlock), rep ±5–10. No ships, no armaments. Tavern leads are *texture*, not engine.

## Source 2 — Governor audience (the engine)

The Governor tab in `PortModal.tsx` is currently a stub. Repurpose it as a single LLM roleplay surface. This is the highest-impact source and the hardest to tune.

**Persona prompt:** Gemini Flash Lite as the governor of this port — historical era (1612), title appropriate to the polity (Mughal subahdar, Portuguese viceroy, VOC opperhoofd, English factor, etc.), known concerns. The persona should explicitly *not* be a pushover: "you are not stupid; merchants lie to you constantly; you keep your own clerk's ledger."

**The judgment problem is the whole feature.** The LLM must evaluate the player's pitch against actual world state, or savvy players exploit it. Pass a small structured snapshot in the system prompt:

- Current commodity prices in this port
- Last-visited prices the player has seen (from journal)
- Player's ship, crew size, current cash
- Player's reputation in this port
- Ports the player has actually visited (vs. ones they're claiming to know)

If the player promises 400% on cloves to Aceh but has never been to Aceh and cloves are at par here, the persona prompt instructs the governor to detect the bluff.

**Player levers:**
- **Opening register**: deferential / businesslike / brash — sets the governor's response window.
- **Concrete ask**: writ of safe conduct / introduction letter / cash investment / outfitted ship / armaments. Each ask sets the upside *and* the maximum downside.

**Stakes ceiling — by ask size:**

| Ask | Best case | Worst case (initial pitch) |
|---|---|---|
| Writ / introduction | Lead with rep + info reward, no debt | Awkward dismissal, −2 rep |
| Small investment (≤500) | Lead with `debt` populated | −5 rep, lose audience for N days |
| Large investment (≤2000) | Lead with `debt`, deadline | −10 rep, lose 1 crew (insulted retainer), audience locked |
| New ship / armaments | Lead with `debt`, hard deadline, future audience for new commission | −15 rep, brief jail (lose N days) |

**Death is reachable only via the follow-up audience after default**, not the initial pitch. Players who default on a large governor commission and return to that port get a non-declinable second audience where the consequences spike: ship seized, captain killed, etc. This makes the consequence surface principled (size of failure scales to size of original ask) rather than capricious.

**Reputation gates** the audience itself: minimum rep to be granted a meeting, with a per-port cooldown if denied.

A successful pitch creates a Lead with `debt` populated; resolving it on time clears the debt and unlocks larger future audiences. This is what gives the governor its identity vs. tavern: governor leads are *contracts*, not gossip.

## Source 3 — POI (when the POI system lands)

POIs (see Planned section in `AGENTS.md`) are hand-authored sites with a modal. Most outcomes are *not* leads:

- ~50% — give an item or one-shot knowledge (commodity reveal, mastery upgrade)
- ~25% — give *information* (chart unlocks a port, reveals a nearby POI, names a faction contact)
- ~25% — give a Lead

Lead-giving POIs feel different from tavern leads: anonymous or thinly-named giver ("the dying lascar," "the hermit at the shrine," "the abandoned ship's last log"), a `giverCoords` instead of a port. Reward profile is between tavern and governor — sometimes a unique item or chart that no other source provides.

POI leads are the exploration glue. Without them, the map rewards beelining; with them, the player has stochastic reason to detour.

## Source 4 — Hail (smallest add, last)

Hook into the existing `getHailResponse()` flow in `Game.tsx`. Constraints:

- Only `friendly` mood, only trader-disposition NPC ships
- ~10% of qualifying hails offer a lead
- Lead is always cargo or letter delivery to a named port
- Short deadline (the captain is going somewhere specific)

This is the smallest source and the easiest to skip if it doesn't feel right in playtest.

## The panel (Quests button)

Single panel matching Journal aesthetic — `bg-[#0a0e18]/70 backdrop-blur-xl border border-[#2a2d3a]/50 rounded-xl`, gold `#c9a84c` for active leads, muted for resolved. Reuse `Journal.tsx` patterns where possible.

Layout:

- **Active** at top, sorted by deadline urgency (closest first). Each row: source icon + title + giver + day-countdown + target.
- **Resolved** (done / failed / expired) collapsed below. Click to expand history.
- Click any lead row to expand → shows `sourceQuote`, full task description, reward preview, and (for governor) debt status.

The quote is the texture. The schema is just scaffolding.

## Resolution

One check, runs in two places:

- **On entering a port** (`activePort` set in gameStore): scan active leads where `target.port === port.id`. If match, surface a "deliver / report" prompt in PortModal.
- **On reaching coords** (player position within ~30 units of `target.coords` on world map or local): same prompt.

Resolution prompt is a small modal: "You have reached X. Resolve [lead title]?" → on confirm, fire `resolveLead(id)`, apply rewards, journal entry, optional follow-up dialogue with the original giver if they're locally available.

Failure paths:
- Deadline passes → `status: 'expired'` (silent for tavern/POI/hail), or `status: 'failed'` with debt event for governor.
- Player loses required commodity (e.g. spoilage, theft, jettison) → `status: 'failed'`.

## End-to-end loop, as a player experiences it

1. Surat tavern. Spice merchant: her sister in Calicut needs a remedy from a Goan apothecary. Tavern lead, 60-day soft deadline, modest reward.
2. Governor audience denied — rep too low. Come back later.
3. Sailing to Goa, you spot a POI: a beached carrack. POI modal — find a chart revealing a Comoros anchorage (info, not a lead). Next POI a week later: a dying lascar begs you carry a relic to Lisbon. POI lead created.
4. An English merchantman hails you en route. Friendly, has cloth bound for Cochin. Hail lead, short deadline.
5. Back in Surat, rep is up. Governor grants audience. You pitch a clove venture to Aceh — LLM checks your pitch against current prices + travel history. Investment granted: 800 reales + 90-day deadline + debt entry. If you succeed, next audience offers a pinnace.

Five active leads, four sources, one panel.

## Implementation order

Don't build all four sources at once. Build the trunk, then add one source at a time and play with it before adding the next.

1. **`Lead` schema + Quests panel** — the trunk, no sources yet. Wire up the button. Empty panel that reads from `state.leads`.
2. **Tavern source** — cheapest, gives texture immediately, exercises the panel. Player-gated creation via "Accept this errand" affordance.
3. **Governor source** — the high-impact "real game." The audience system is the hardest part: persona prompt + ledger snapshot + ask/stakes table + debt resolution.
4. **POI source** — only after the POI system itself ships (see `AGENTS.md` Planned section).
5. **Hail source** — last, smallest, easiest to skip.

## What we are NOT building

These are where this kind of system metastasizes:

- Quest chains / branching unlocks
- Per-NPC cross-port memory
- World-map quest markers (text in panel only, for v1)
- Faction politics between governors
- Multi-stage commissions (a governor offering a new lead on completion is a *fresh* lead, not a chain node)
- "!" markers floating over NPCs
- Save-scumming protection (out of scope)

The discipline is: **leads are atomic and stateless except for status.** A second lead can be offered on completion of the first, but it's a new atom, not a state machine.

## Open questions / things still in flux

- **LLM extraction reliability** for tavern leads. Player-gated creation is the leaning answer but needs playtest.
- **Governor persona ledger** — exact shape of the world-state snapshot we hand to the LLM. Too much context = expensive + slow. Too little = LLM can't catch bluffs.
- **Stakes ceiling table** — the upside/downside per ask size is a first cut. Real numbers come from playtest.
- **Coords-based resolution radius** — 30 units is a guess. Depends on world map scale.
- **Named historical governors** — for v1 use generic title-of-office personas. Backfilling 1612 personae per port (Pieter Both VOC, Mughal subahdars, Portuguese viceroys, Qutb Shahi factors at Masulipatnam, etc.) is a polish pass once the system works mechanically.
- **Reward hint vs. reward reveal** — does the player see exact reward numbers up front, or only "a small purse" / "a fine introduction"? Leaning hint, with reveal at resolution.
- **Failure visibility** — silent expiry vs. journal entry on lapse. Probably journal entry for governor (it's a contract); silent for tavern/POI/hail.
- **Whether hail leads are worth building at all.** Smallest add but also the most likely to feel forced, given how brief hail UI is. Decide after governor source ships.

## Files that would be touched (when this kicks off)

- `src/store/gameStore.ts` — `Lead` type, `leads` slice, actions
- `src/components/QuestsPanel.tsx` — new
- `src/components/UI.tsx` — wire hotkey `6` and button onClick
- `src/components/TavernTab.tsx` — tavern source hook
- `src/components/PortModal.tsx` — Governor tab → audience surface
- `src/utils/governorPrompt.ts` — new, persona + ledger snapshot
- `src/utils/leadResolution.ts` — new, port/coords match check
- (later) `src/components/POIModal.tsx` — POI source hook
- (later) `src/components/Game.tsx` — hail source hook in `getHailResponse()`

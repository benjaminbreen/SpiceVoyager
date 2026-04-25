# NPC Ship Combat AI Plan

## Goal

Make NPC ships tactically credible without turning the sea into constant combat. Civilian vessels should usually flee when attacked. Armed patrols, privateers, and sufficiently hostile factions should be willing to fight, warn, pursue, and potentially kill the player.

Combat should remain simple and readable:

- Some NPCs flee.
- Some fire back after being attacked.
- A smaller set warn, then attack first.
- Swivel guns and cannon fire are both dangerous.
- Boarding and capture are not implemented. They may be added later, but this plan deliberately leaves them out.

## Current Baseline

Relevant files:

- `src/components/NPCShip.tsx` handles NPC movement, collision response, alert rings, sinking, health bars, and hailable proximity.
- `src/utils/npcShipGenerator.ts` already gives each NPC `role`, `armed`, `morale`, `shipType`, `flag`, `cargo`, `traditionId`, and `maxHull`.
- `src/utils/combatState.ts` owns shared projectile state and live NPC positions.
- `src/components/GameScene.tsx` owns projectile update and hit detection.
- `src/store/gameStore.ts` owns player ship damage, reputation, notifications, and NPC defeat rewards.

Today, every attacked NPC ship behaves the same way: `hitAlert` or collision sets an alert timer, and the ship flees from the player at increased speed. NPCs never fire at the player and never initiate combat.

## Design Principles

1. **Ownership before AI.** Add projectile ownership before letting NPCs fire. Otherwise NPC shots will be interpreted as player shots and cause incorrect reputation penalties or friendly-fire behavior.

2. **Posture over simulation.** Use a small behavior state machine rather than detailed naval tactics.

3. **Danger must be legible.** Attack-on-sight should usually have a warning phase: forced hail/challenge if possible, red ring, red notification, and warning sound.

4. **Lethality is intentional.** A small ship should not survive several cannon hits. A few swivel hits or one to two cannon hits can sink the player, depending on hull and tuning.

5. **Historical flavor through existing data.** Use existing `role`, `traditionId`, faction reputation, and ship type. Do not add a large geopolitical matrix in the first pass.

6. **No boarding yet.** NPCs may close distance for firing posture, but they should not attempt boarding/capture in this implementation.

## Behavior Model

### NPC Combat Postures

```ts
type NpcCombatPosture =
  | 'neutral'
  | 'warn'
  | 'flee'
  | 'evade'
  | 'engage'
  | 'pursue';
```

- `neutral`: existing wandering behavior.
- `warn`: NPC has chosen aggression but has not fired yet.
- `flee`: sail away quickly and do not fire.
- `evade`: keep distance and fire swivel shots opportunistically.
- `engage`: keep broadside/swivel range and fire.
- `pursue`: close distance toward the player until in weapon range, then engage.

### First-Pass Role Mapping

```ts
privateer        -> may initiate; usually fights when attacked
armed patrol     -> may initiate against hostile player; fights when attacked
spice convoy     -> fights if armed and confident, otherwise evades/flees
blue-water merchant -> may fire back if armed, usually evades
smuggler         -> usually flees, sometimes fires swivel while escaping
coastal trader   -> usually flees
pilgrim carrier  -> flees unless heavily armed and desperate
horse transport  -> flees or evades
courier          -> flees
fisherman/ferry  -> flees
```

### Aggression Inputs

Keep the first implementation small:

- `identity.role`
- `identity.armed`
- `identity.morale`
- `identity.shipType`
- `identity.flag`
- player's reputation with `identity.flag`
- player's cargo load/value
- player has attacked this NPC
- distance to player
- NPC hull fraction

Suggested thresholds:

- `rep <= -60`: hostile enough for armed ships, patrols, and privateers to attack on sight.
- `rep <= -25`: suspicious; privateers may warn/attack, patrols may challenge, armed merchants may stand ready.
- `rep >= 25`: NPCs should not initiate unless explicitly privateer/raider and player looks like prey.
- `npcHull <= 35%`: switch from `engage` to `flee` unless role is very aggressive and morale is high.

### Cargo Temptation

Use a rough score, not detailed economic modeling:

```ts
playerCargoTemptation =
  cargoFillRatio * 40
  + estimatedCargoValueTier * 10
  - playerRelativeForcePenalty
```

This should only matter for `privateer` and maybe `smuggler`. It should not make normal merchants attack the player.

## Weapon Model

NPC ships should use two simple weapon classes.

### Swivel Guns

Swivel guns are short-to-medium range, more frequent, and especially dangerous to small ships.

Suggested first-pass values:

```ts
range: 55-90
cooldown: 2.2-4.0s
damage: 8-14 hull
accuracy: moderate, worsens with distance and low morale
projectile: direct/low-arc shot
```

Use cases:

- Privateers fire swivels while closing.
- Armed merchants fire swivels while evading.
- Patrols fire swivels before heavier cannon if close.
- Low-armament ships may only have swivels.

### Cannon Fire

Cannon fire is slower, louder, less frequent, and potentially decisive.

Suggested first-pass values:

```ts
range: 80-150
cooldown: 7-12s
damage: 28-45 hull
accuracy: low-to-moderate, best around 80-110 range
projectile: existing cannonball physics with NPC ownership
```

One to two cannon hits should sink or cripple small player vessels. Larger hulls survive more, but still need repairs quickly.

### Damage Tuning Target

The current player `damageShip(amount)` path can already trigger game over. Tune NPC damage against actual starting hull values:

- Small starter hull: a few swivel hits or one solid cannon hit should be grave danger.
- Mid-size ship: two cannon hits or sustained swivel fire should be lethal.
- Large ship: can survive more, but not ignore combat.

Avoid perfectly accurate NPC fire. Lethality should come from failure to disengage, not unavoidable hits.

## Phase 1 — Projectile Ownership

### Goal

Make projectiles safe for multiple factions before any NPC fires.

### Changes

- Extend `Projectile` in `combatState.ts`:

```ts
interface Projectile {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  weaponType: ProjectileWeaponType;
  owner: 'player' | 'npc';
  ownerId?: string;
  trailClock?: number;
}
```

- Update `spawnProjectile()` to accept optional ownership:

```ts
spawnProjectile(origin, direction, speed, weaponType, opts?: {
  owner?: 'player' | 'npc';
  ownerId?: string;
})
```

- Default owner to `player` to preserve all existing call sites.
- Update broadside queue entries to preserve owner fields, even if initially player-only.
- In `ProjectileSystem`, branch hit detection by owner:
  - player projectiles keep current NPC/building/wildlife behavior and reputation penalties.
  - NPC projectiles can hit the player ship and terrain/water.
  - NPC projectiles must not damage NPC ships in first pass.
  - NPC projectiles must not apply player reputation penalties.

### Verification

- Existing player swivel, rocket, and broadside shots still damage NPCs.
- NPC-owned test projectile can damage player via `damageShip()`.
- No reputation penalty occurs from NPC-owned projectiles.
- `npm run lint` and `npm test`.

## Phase 2 — NPC Combat State

### Goal

Replace the binary alert/flee behavior with a small posture machine.

### Changes

- Add local refs in `NPCShip.tsx`:

```ts
const combatPosture = useRef<NpcCombatPosture>('neutral');
const postureUntil = useRef(0);
const lastNpcShotAt = useRef(0);
const lastWarningAt = useRef(0);
```

- Add helper functions, either local first or in a new `src/utils/npcCombat.ts` if the logic grows:

```ts
chooseProvokedPosture(identity, context): NpcCombatPosture
chooseInitiativePosture(identity, context): NpcCombatPosture
shouldBreakOff(identity, hullFrac, morale): boolean
```

- On projectile hit or collision:
  - unarmed/low-morale ships usually `flee`;
  - privateers/patrols usually `engage`;
  - armed merchants usually `evade` or `engage`;
  - badly damaged NPCs switch to `flee`.

- Preserve existing flee movement as the implementation for `flee`.
- Keep existing wandering for `neutral`.

### Verification

- Attacking a civilian trader still makes it flee.
- Attacking an armed patrol makes it fight back.
- Damaging an attacking NPC below the hull threshold makes it flee.
- No new UI yet beyond current alert ring.

## Phase 3 — NPC Weapon Firing

### Goal

Let hostile NPCs fire swivel guns and cannon at the player.

### Changes

- Add weapon capability resolver:

```ts
type NpcWeaponProfile = {
  hasSwivel: boolean;
  hasCannon: boolean;
  swivelDamage: number;
  cannonDamage: number;
  swivelCooldownMs: number;
  cannonCooldownMs: number;
  preferredRange: number;
};
```

- Derive from existing fields:
  - `identity.armed`
  - `identity.role`
  - `identity.shipType`
  - `identity.visual.hasCannonPorts`
  - `identity.morale`

- Add `tryFireNpcWeapon()` in `NPCShip.tsx`:
  - only in `engage`, `evade`, or `pursue`;
  - only when player is in range;
  - chooses swivel at close range;
  - chooses cannon at longer range if available and off cooldown;
  - applies aim spread based on range and morale;
  - calls `spawnProjectile(..., { owner: 'npc', ownerId: identity.id })`.

- For cannon shots, use existing SFX where appropriate.
- For swivel shots, reuse cannon/swivel SFX at lower intensity if available; otherwise use existing cannon fire temporarily and mark for audio pass.

### Verification

- NPC swivel shots damage player and can sink small ships after repeated hits.
- NPC cannon shots can be lethal in one to two hits against small ships.
- NPC shots do not sink the firing NPC or nearby NPCs in this phase.
- Combat remains avoidable by leaving range.

## Phase 4 — Movement Tactics

### Goal

Make fighting ships look intentional without full naval tactics.

### Movement Rules

- `pursue`: target a point near the player until within preferred range.
- `engage`: orbit/offset around preferred range rather than flee straight away.
- `evade`: increase distance but keep stern/side shots possible.
- `flee`: existing flee behavior.

### Simple Range Bands

```ts
tooClose: < 35
swivelBand: 35-85
cannonBand: 75-150
tooFar: > 160
```

- Privateers prefer `swivelBand` first, then cannon if available.
- Patrols prefer `cannonBand`.
- Armed merchants prefer `evade` and swivel/cannon only when the player stays close.

### Verification

- NPCs do not ram as their primary attack.
- NPCs do not beach themselves more often than current flee behavior.
- Ships in combat remain readable: closing, holding, or fleeing.

## Phase 5 — Hostile Initiative and Warning UX

### Goal

Allow attack-on-sight, but make it legible and fair.

### Warning Triggers

NPC may initiate warning if:

- player is in ship mode;
- NPC is armed or privateer/patrol;
- distance is within warning range, e.g. 120-180;
- faction reputation is hostile enough, or privateer cargo temptation is high;
- no major modal is open;
- warning cooldown has expired.

### Warning UX

Use all three layers:

- Forced NPC hail/challenge if UI state allows it.
- Red ring around the NPC ship.
- Red sans-serif notification with plain wording.
- Warning/alert SFX.

Example notification copy:

```txt
The San Felipe runs out her guns.
```

```txt
An English privateer bears down on us.
```

```txt
The patrol warns us off. They will fire if we close.
```

Keep copy short and grounded.

### Forced Hail

Do not overhaul the hail system yet. First-pass options:

- Add a lightweight store field such as `incomingNpcHail`.
- `UI.tsx` opens the existing hail panel or a small warning panel when set.
- If modal/UI state blocks it, fall back to notification + ring + sound.

The hail should not require a full conversation system. It can offer:

- `Heave to` / comply: NPC disengages or watches.
- `Ignore`: NPC attacks after short delay.
- `Stand to fight`: enters combat immediately.

If this is too much for the first implementation, use notification-only warning in Phase 5 and put forced hail in Phase 6.

### Verification

- Hostile armed ships do not fire without warning unless already attacked.
- Privateers can initiate based on cargo/reputation, but rarely.
- Friendly or neutral civilian ships do not initiate.

## Phase 6 — Visual and Audio Readability

### Goal

Make threat state visible before and during combat.

### Changes

- Replace single orange alert ring with threat-colored state:
  - orange: fleeing/alerted
  - red: warning/hostile engagement
  - deep red pulse: actively firing

- Add notification style support if needed for red sans-serif combat notices.
- Add or reuse SFX:
  - warning horn/bell/drum cue;
  - NPC swivel fire;
  - NPC cannon fire;
  - incoming hull impact.

### Verification

- Player can distinguish flee versus hostile.
- Warning is visible even without reading the hail text.
- Audio does not spam during repeated NPC shots.

## Phase 7 — Reputation and Rivalry Rules

### Goal

Add simple faction/rival behavior without over-engineering.

### Rules

- Reputation is primary.
- Role is secondary.
- Rivalry is a small modifier, not a full diplomacy model.

Suggested lightweight rivalry modifier:

```ts
const RIVALRY_AGGRESSION: Partial<Record<Nationality, Nationality[]>> = {
  Portuguese: ['Dutch', 'English', 'Acehnese'],
  Spanish: ['Dutch', 'English', 'French'],
  Dutch: ['Portuguese', 'Spanish'],
  English: ['Spanish', 'Portuguese'],
  Acehnese: ['Portuguese'],
};
```

Use this only to nudge warning/attack probability. Do not make every rival attack.

### Verification

- Low reputation reliably matters.
- Rivalry makes privateers/patrols more suspicious, not universally suicidal.
- Good reputation suppresses most aggression.

## Phase 8 — Tests and Tuning Harness

### Unit Tests

Add pure tests for the new posture resolver:

- civilian attacked -> `flee`
- armed patrol attacked -> `engage`
- privateer sees heavily laden hostile player -> `warn` or `pursue`
- friendly patrol -> `neutral`
- damaged attacker -> `flee`

Add tests for projectile ownership:

- player projectile damages NPC and applies reputation penalty.
- NPC projectile damages player and applies no player reputation penalty.

### Browser Smoke

Add or extend Playwright test mode only if deterministic spawning can select known NPC roles. Otherwise, defer browser automation and verify manually.

### Manual Browser Checks

Required because this is UI/game-feel work:

- Attack civilian trader: it flees.
- Attack armed patrol: it fires back.
- Sail near hostile privateer while cargo-heavy: warning appears, then attack.
- Small ship can be sunk by a few swivel hits or one to two cannon hits.
- Combat can be escaped by leaving range.
- Hail/modal states do not freeze combat incorrectly.

## Phase 9 — Balance Pass

Tune after browser play, not before.

Initial tuning variables:

- warning range
- engage range
- swivel range/cooldown/damage/accuracy
- cannon range/cooldown/damage/accuracy
- hostile reputation threshold
- cargo temptation threshold
- damaged-NPC breakoff threshold
- notification cooldowns

Expected first-pass target:

- Most merchant traffic remains safe if the player behaves.
- Hostile waters feel dangerous.
- Privateers are rare but memorable.
- Starting ships cannot casually trade cannon fire.
- Fleeing remains a valid tactic.

## Implementation Order Summary

1. Projectile ownership and NPC projectile hit path.
2. Pure posture resolver and tests.
3. NPC local combat state in `NPCShip.tsx`.
4. NPC swivel and cannon firing.
5. Engagement movement bands.
6. Warning UX and hostile initiative.
7. Ring/audio/notification polish.
8. Rivalry modifiers.
9. Browser tuning pass.


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

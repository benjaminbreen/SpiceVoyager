import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { projectiles, spawnProjectile } from '../utils/combatState';

afterEach(() => {
  projectiles.length = 0;
});

describe('combatState projectiles', () => {
  it('defaults spawned projectiles to player ownership', () => {
    spawnProjectile(new THREE.Vector3(1, 2, 3), new THREE.Vector3(0, 0, 1), 10, 'swivelGun');

    expect(projectiles).toHaveLength(1);
    expect(projectiles[0]).toMatchObject({
      owner: 'player',
      ownerId: undefined,
      weaponType: 'swivelGun',
    });
  });

  it('preserves NPC projectile ownership metadata', () => {
    spawnProjectile(new THREE.Vector3(1, 2, 3), new THREE.Vector3(0, 0, 1), 10, 'saker', {
      owner: 'npc',
      ownerId: 'npc-ship-1',
    });

    expect(projectiles).toHaveLength(1);
    expect(projectiles[0]).toMatchObject({
      owner: 'npc',
      ownerId: 'npc-ship-1',
      weaponType: 'saker',
    });
  });
});

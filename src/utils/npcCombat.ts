import type { Nationality } from '../store/gameStore';
import type { WeaponType } from '../store/gameStore';
import { COMMODITY_DEFS, type Commodity } from './commodities';
import { factionRelationModifier } from './factionRelations';
import type { NPCShipIdentity, RouteRole, ShipType } from './npcShipGenerator';

export type NpcCombatPosture = 'neutral' | 'warn' | 'flee' | 'evade' | 'engage' | 'pursue';

export interface NpcCombatContext {
  reputation: number;
  provoked: boolean;
  hullFraction: number;
}

export type CollisionResponse = 'apologize' | 'pay' | 'ignore' | 'threaten';
export type WarningResponse = 'alterCourse' | 'payToll' | 'ignore' | 'threaten';

export const COLLISION_REPUTATION_TARGET: Record<CollisionResponse | 'ram', number> = {
  ram: -100,
  apologize: -35,
  pay: -25,
  ignore: -100,
  threaten: -100,
};

const CIVILIAN_ROLES = new Set<RouteRole>([
  'coastal trader',
  'pilgrim carrier',
  'horse transport',
  'courier',
  'fisherman',
  'ferry',
]);

const HEAVY_SHIP_TYPES = new Set<ShipType>([
  'Galleon',
  'Carrack',
  'Armed Merchantman',
  'Jong',
  'Ghurab',
  'Baghla',
  'Fluyt',
  'Nao',
]);

export function shouldBreakOff(identity: Pick<NPCShipIdentity, 'role' | 'morale'>, hullFraction: number) {
  if (hullFraction > 0.35) return false;
  if (identity.role === 'privateer' && identity.morale >= 75 && hullFraction > 0.2) return false;
  if (identity.role === 'armed patrol' && identity.morale >= 82 && hullFraction > 0.25) return false;
  return true;
}

export function chooseProvokedPosture(
  identity: Pick<NPCShipIdentity, 'role' | 'armed' | 'morale' | 'shipType' | 'flag'>,
  context: NpcCombatContext,
): NpcCombatPosture {
  if (!context.provoked) return 'neutral';
  if (shouldBreakOff(identity, context.hullFraction)) return 'flee';
  if (!identity.armed) return 'flee';

  if (identity.role === 'privateer') return identity.morale >= 35 ? 'engage' : 'evade';
  if (identity.role === 'armed patrol') return identity.morale >= 30 ? 'engage' : 'evade';

  const heavy = HEAVY_SHIP_TYPES.has(identity.shipType);
  if (identity.role === 'spice convoy') {
    if (identity.morale >= 45 || heavy) return 'engage';
    return 'evade';
  }
  if (identity.role === 'blue-water merchant' || identity.role === 'smuggler') {
    if (heavy && identity.morale >= 50) return 'engage';
    if (context.reputation <= -60 && identity.morale >= 45) return 'engage';
    return 'evade';
  }
  if (CIVILIAN_ROLES.has(identity.role)) return 'flee';

  return identity.morale >= 65 && heavy ? 'engage' : 'evade';
}

export function chooseInitiativePosture(
  identity: Pick<NPCShipIdentity, 'role' | 'armed' | 'morale' | 'shipType' | 'flag'>,
  context: Omit<NpcCombatContext, 'provoked'> & {
    playerFlag?: Nationality | null;
    cargoTemptation?: number;
  },
): NpcCombatPosture {
  if (!identity.armed) return 'neutral';
  if (shouldBreakOff(identity, context.hullFraction)) return 'neutral';

  const hostile = context.reputation <= -60;
  const suspicious = context.reputation <= -25;
  const relationModifier = context.playerFlag ? factionRelationModifier(context.playerFlag, identity.flag) : 0;
  const sameFaction = context.playerFlag === identity.flag;
  const rival = relationModifier <= -25;
  const bitterRival = relationModifier <= -35;
  const eligiblePredationTarget = !sameFaction && (rival || suspicious);
  const cargoTemptation = context.cargoTemptation ?? 0;
  const playerIsPirate = context.playerFlag === 'Pirate';

  if (identity.role === 'privateer' && (playerIsPirate || hostile || bitterRival || (eligiblePredationTarget && cargoTemptation >= 55) || (suspicious && rival))) {
    return identity.morale >= 35 ? 'warn' : 'neutral';
  }
  if (identity.role === 'armed patrol' && (playerIsPirate || hostile || bitterRival || (suspicious && rival))) {
    return identity.morale >= 45 ? 'warn' : 'neutral';
  }
  if (playerIsPirate && CIVILIAN_ROLES.has(identity.role)) {
    return identity.morale >= 35 ? 'flee' : 'neutral';
  }

  return 'neutral';
}

export function cargoTemptationScore(cargo: Partial<Record<Commodity, number>>, cargoCapacity: number): number {
  const totalValue = (Object.entries(cargo) as [Commodity, number][])
    .reduce((sum, [commodity, qty]) => {
      const def = COMMODITY_DEFS[commodity];
      if (!def || qty <= 0) return sum;
      const averagePrice = (def.basePrice[0] + def.basePrice[1]) / 2;
      return sum + averagePrice * qty;
    }, 0);
  const usedSpace = (Object.entries(cargo) as [Commodity, number][])
    .reduce((sum, [commodity, qty]) => {
      const def = COMMODITY_DEFS[commodity];
      if (!def || qty <= 0) return sum;
      return sum + def.weight * qty;
    }, 0);
  const loadFraction = cargoCapacity > 0 ? Math.min(1, usedSpace / cargoCapacity) : 0;
  const valueScore = Math.min(70, totalValue / 12);
  return Math.max(0, Math.min(100, valueScore + loadFraction * 30));
}

export function npcBowWeapon(identity: Pick<NPCShipIdentity, 'shipType'>): WeaponType {
  if (identity.shipType === 'Junk' || identity.shipType === 'Jong' || identity.shipType === 'Prau') return 'cetbang';
  if (identity.shipType === 'Ghurab' || identity.shipType === 'Baghla' || identity.shipType === 'Dhow') return 'lantaka';
  if (identity.shipType === 'Galleon' || identity.shipType === 'Armed Merchantman') return 'falconet';
  return 'swivelGun';
}

export function npcBroadsideWeapon(identity: Pick<NPCShipIdentity, 'shipType'>): WeaponType {
  if (identity.shipType === 'Galleon' || identity.shipType === 'Carrack') return 'demiCulverin';
  if (identity.shipType === 'Armed Merchantman' || identity.shipType === 'Ghurab' || identity.shipType === 'Jong') return 'saker';
  return 'minion';
}

export function npcBroadsideCount(identity: Pick<NPCShipIdentity, 'shipType' | 'visual'>): number {
  if (!identity.visual.hasCannonPorts) return 0;
  if (identity.shipType === 'Galleon' || identity.shipType === 'Carrack') return 3;
  if (identity.shipType === 'Armed Merchantman' || identity.shipType === 'Jong' || identity.shipType === 'Ghurab') return 2;
  return 1;
}

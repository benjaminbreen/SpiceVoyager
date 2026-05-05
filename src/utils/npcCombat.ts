import type { Nationality } from '../store/gameStore';
import type { WeaponType } from '../store/gameStore';
import { COMMODITY_DEFS, type Commodity } from './commodities';
import { calculateCargoWeight } from './cargoWeight';
import { factionRelationModifier } from './factionRelations';
import type { NPCShipIdentity, RouteRole, ShipType } from './npcShipGenerator';

export type NpcCombatPosture = 'neutral' | 'warn' | 'flee' | 'evade' | 'engage' | 'pursue';

export interface NpcCombatContext {
  reputation: number;
  provoked: boolean;
  hullFraction: number;
}

export type CollisionResponse = 'apologize' | 'pay' | 'ignore' | 'threaten' | 'helpRepairs' | 'turnAway' | 'loadGuns';
export type WarningResponse = 'alterCourse' | 'payToll' | 'ignore' | 'threaten' | 'showPapers' | 'submitInspection';

export const COLLISION_REPUTATION_TARGET: Record<CollisionResponse | 'ram', number> = {
  ram: -100,
  apologize: -35,
  pay: -25,
  helpRepairs: -15,
  turnAway: -65,
  ignore: -100,
  threaten: -100,
  loadGuns: -100,
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

export function shouldStayHostile(
  identity: Pick<NPCShipIdentity, 'role' | 'armed' | 'morale' | 'shipType'>,
  context: Pick<NpcCombatContext, 'reputation' | 'hullFraction'>,
) {
  if (!identity.armed || shouldBreakOff(identity, context.hullFraction)) return false;
  const heavy = HEAVY_SHIP_TYPES.has(identity.shipType);

  if (identity.role === 'privateer') return identity.morale >= 40;
  if (identity.role === 'armed patrol') return identity.morale >= 45 || context.reputation <= -60;
  if (identity.role === 'spice convoy') return heavy && identity.morale >= 60;
  if (identity.role === 'blue-water merchant' || identity.role === 'smuggler') {
    return heavy && identity.morale >= 68 && context.reputation <= -25;
  }
  return false;
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
  const usedSpace = calculateCargoWeight(cargo);
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

export type BranchHailAction =
  | 'collision_apologize'
  | 'collision_pay'
  | 'collision_ignore'
  | 'collision_threaten'
  | 'collision_help_repairs'
  | 'collision_break_off'
  | 'collision_turn_away'
  | 'collision_load_guns'
  | 'warning_alter_course'
  | 'warning_pay_toll'
  | 'warning_ignore'
  | 'warning_threaten'
  | 'warning_show_papers'
  | 'warning_submit_inspection';

export interface HailBranchAction {
  id: BranchHailAction;
  label: string;
  detail?: string;
}

export interface HailBranchContext {
  npc: NPCShipIdentity;
  context: 'collision' | 'warning';
  action: BranchHailAction;
  canUnderstand: boolean;
  hasTranslator: boolean;
  playerGold: number;
  playerBroadsideCount: number;
  playerFlag: Nationality;
  reputation: number;
  hullFraction: number;
}

export interface HailBranchOutcome {
  tone: 'good' | 'warn' | 'neutral';
  text: string;
  impact?: string;
  reputationTarget?: number;
  reputationDelta?: number;
  goldDelta?: number;
  collisionResponse?: CollisionResponse;
  warningResponse?: WarningResponse;
  close?: boolean;
  collisionMood?: 'HOSTILE' | 'COLD' | 'WARY' | 'CORDIAL' | 'WARM';
  nextActions?: HailBranchAction[];
}

function isCivilianRole(role: RouteRole): boolean {
  return CIVILIAN_ROLES.has(role);
}

function isHeavyShip(shipType: ShipType): boolean {
  return HEAVY_SHIP_TYPES.has(shipType);
}

export function collisionCompensationDemand(
  identity: Pick<NPCShipIdentity, 'shipType' | 'armed' | 'role'>,
  hullFraction: number,
): number {
  const damage = Math.max(0, 1 - hullFraction);
  const hullClass = isHeavyShip(identity.shipType) ? 20 : 0;
  const armedPremium = identity.armed ? 10 : 0;
  const privateerPremium = identity.role === 'privateer' ? 15 : 0;
  const raw = 20 + hullClass + armedPremium + privateerPremium + Math.ceil((damage * 80) / 5) * 5;
  return Math.max(20, Math.min(100, raw));
}

export function resolveHailBranchOutcome(input: HailBranchContext): HailBranchOutcome {
  const { npc, action, canUnderstand, playerGold, playerBroadsideCount, playerFlag, reputation, hullFraction } = input;
  const demand = collisionCompensationDemand(npc, hullFraction);
  const civilian = isCivilianRole(npc.role) || !npc.armed;
  const heavyOrArmed = npc.armed || isHeavyShip(npc.shipType);
  const playerLooksArmed = playerBroadsideCount >= Math.max(1, npcBroadsideCount(npc));
  const sameFlag = playerFlag === npc.flag;

  if (input.context === 'collision') {
    if (action === 'collision_apologize') {
      if (!canUnderstand) {
        return {
          tone: 'warn',
          text: 'He does not understand your apology. The anger across the water does not soften.',
          impact: 'apology unclear',
          reputationTarget: -45,
          collisionMood: 'HOSTILE',
          nextActions: [
            { id: 'collision_turn_away', label: 'turn away at once', detail: 'de-escalate' },
            { id: 'collision_load_guns', label: 'load guns and keep off', detail: 'dangerous' },
          ],
        };
      }
      if (civilian || npc.morale < 45) {
        return {
          tone: 'warn',
          text: 'He hears the apology, but his men are still checking the opened seam. Words alone will not quiet them.',
          impact: 'apology heard',
          reputationTarget: COLLISION_REPUTATION_TARGET.apologize,
          collisionMood: 'COLD',
          nextActions: [
            { id: 'collision_help_repairs', label: 'send coin for repairs', detail: `${demand} gold` },
            { id: 'collision_break_off', label: 'break off respectfully', detail: 'keep clear' },
          ],
        };
      }
      return {
        tone: 'warn',
        text: 'He accepts that you call it accident, but his gunners stay by their pieces.',
        impact: 'reputation: hostile',
        reputationTarget: COLLISION_REPUTATION_TARGET.apologize,
        collisionResponse: 'apologize',
        collisionMood: 'COLD',
      };
    }

    if (action === 'collision_pay') {
      if (playerGold < demand) {
        return {
          tone: 'warn',
          text: canUnderstand ? 'You name compensation, but cannot meet the sum he demands.' : 'Your offer fails before it becomes coin.',
          impact: `need ${demand} gold`,
          collisionMood: 'HOSTILE',
        };
      }
      const shakedown = npc.role === 'privateer' && npc.morale >= 55 && reputation <= -25;
      return {
        tone: shakedown ? 'warn' : 'good',
        text: shakedown
          ? 'He takes the coin as passage-money, not friendship. His ship sheers away with guns still run out.'
          : 'Coin passes by boat. It will not mend all the timber, but it gives both crews a way out.',
        impact: `-${demand} gold · reputation: ${shakedown ? 'cold' : 'settled'}`,
        goldDelta: -demand,
        reputationTarget: shakedown ? COLLISION_REPUTATION_TARGET.pay : COLLISION_REPUTATION_TARGET.helpRepairs,
        collisionResponse: shakedown ? 'pay' : 'helpRepairs',
        collisionMood: shakedown ? 'COLD' : 'WARY',
      };
    }

    if (action === 'collision_ignore') {
      return {
        tone: 'warn',
        text: canUnderstand
          ? 'You give no answer. Men on the other deck point at the scrape and then at your stern.'
          : 'You hold silent. Their meaning is plain enough: they have taken offense.',
        impact: 'silence taken as insult',
        reputationTarget: -75,
        collisionMood: 'HOSTILE',
        nextActions: [
          { id: 'collision_turn_away', label: 'turn away now', detail: 'limit the damage' },
          { id: 'collision_load_guns', label: 'load guns', detail: playerLooksArmed ? 'stand ready' : 'risky' },
        ],
      };
    }

    if (action === 'collision_threaten') {
      const scaresCivilian = civilian && playerLooksArmed;
      return {
        tone: 'warn',
        text: scaresCivilian
          ? 'The threat lands. Their crew falls back from the rail, but every witness will remember it.'
          : heavyOrArmed
          ? 'The answer comes in orders, not words. Their gun crews move faster.'
          : 'They recoil from the threat and pull away as best they can.',
        impact: scaresCivilian ? 'they flee · reputation ruined' : 'clearing for action',
        reputationTarget: COLLISION_REPUTATION_TARGET.threaten,
        collisionResponse: 'threaten',
        close: true,
      };
    }

    if (action === 'collision_help_repairs') {
      if (playerGold < demand) {
        return {
          tone: 'warn',
          text: 'You cannot put enough coin in the repair boat.',
          impact: `need ${demand} gold`,
          collisionMood: 'COLD',
        };
      }
      return {
        tone: 'good',
        text: 'The repair money goes over. The other captain still curses your helm, but his crew stands down.',
        impact: `-${demand} gold · reputation: repaired`,
        goldDelta: -demand,
        reputationTarget: COLLISION_REPUTATION_TARGET.helpRepairs,
        collisionResponse: 'helpRepairs',
        collisionMood: 'WARY',
      };
    }

    if (action === 'collision_break_off') {
      return {
        tone: 'neutral',
        text: 'You put water between the ships before pride becomes gunfire.',
        impact: 'reputation: hostile',
        reputationTarget: COLLISION_REPUTATION_TARGET.apologize,
        collisionResponse: 'apologize',
        collisionMood: 'COLD',
        close: true,
      };
    }

    if (action === 'collision_turn_away') {
      return {
        tone: 'neutral',
        text: 'You turn away late, but clearly. They keep their guns trained until the gap opens.',
        impact: 'reputation worsened',
        reputationTarget: COLLISION_REPUTATION_TARGET.turnAway,
        collisionResponse: 'turnAway',
        close: true,
      };
    }

    if (action === 'collision_load_guns') {
      return {
        tone: 'warn',
        text: playerLooksArmed
          ? 'Your gun crews answer the insult with preparation. The other ship reads it as intent.'
          : 'Your men make a show of readiness, but the other deck sees the weakness in it.',
        impact: 'combat likely',
        reputationTarget: COLLISION_REPUTATION_TARGET.loadGuns,
        collisionResponse: 'loadGuns',
        close: true,
      };
    }
  }

  if (action === 'warning_alter_course') {
    return {
      tone: 'neutral',
      text: 'You alter course while there is still room. Their watch follows you until the bearing opens.',
      impact: 'course altered',
      warningResponse: 'alterCourse',
      close: true,
    };
  }

  if (action === 'warning_pay_toll') {
    if (npc.role !== 'privateer') {
      return {
        tone: 'warn',
        text: 'The offer of a toll insults them. They did not hail you as thieves.',
        impact: 'toll refused',
        reputationDelta: sameFlag ? -3 : -5,
        collisionMood: 'HOSTILE',
      };
    }
    const toll = sameFlag ? 20 : 30;
    if (playerGold < toll) {
      return { tone: 'warn', text: 'You offer a toll without the coin to pay it.', impact: `need ${toll} gold` };
    }
    return {
      tone: 'warn',
      text: 'The privateer accepts the toll and falls off, satisfied enough for now.',
      impact: `-${toll} gold`,
      goldDelta: -toll,
      warningResponse: 'payToll',
      close: true,
    };
  }

  if (action === 'warning_show_papers') {
    const accepted = sameFlag || reputation >= 25 || (canUnderstand && npc.role === 'armed patrol');
    return {
      tone: accepted ? 'good' : 'warn',
      text: accepted
        ? 'You name your flag, master, and last port. The challenge slackens into watchfulness.'
        : 'Your papers carry little weight with them. They still want distance.',
      impact: accepted ? 'challenge satisfied' : 'not enough standing',
      reputationDelta: accepted ? 1 : -2,
      warningResponse: accepted ? 'showPapers' : undefined,
      nextActions: accepted ? undefined : [
        { id: 'warning_alter_course', label: 'alter course', detail: 'comply' },
        { id: 'warning_submit_inspection', label: 'submit to inspection', detail: 'costly delay' },
      ],
      close: accepted,
    };
  }

  if (action === 'warning_submit_inspection') {
    return {
      tone: 'neutral',
      text: 'You slow and let them look you over from shouting distance. The delay costs pride, not blood.',
      impact: 'inspection accepted',
      reputationDelta: sameFlag ? 1 : 0,
      warningResponse: 'submitInspection',
      close: true,
    };
  }

  if (action === 'warning_ignore') {
    return {
      tone: 'warn',
      text: 'You hold course. They take it as refusal.',
      impact: 'reputation -10',
      reputationDelta: -10,
      warningResponse: 'ignore',
      close: true,
    };
  }

  return {
    tone: 'warn',
    text: playerLooksArmed
      ? 'You answer threat with threat. Neither deck can mistake the meaning.'
      : 'The threat sounds thin over the water, and makes retreat harder.',
    impact: 'reputation -15',
    reputationDelta: -15,
    warningResponse: 'threaten',
    close: true,
  };
}

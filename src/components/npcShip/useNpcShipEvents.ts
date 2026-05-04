import { useEffect, type MutableRefObject } from 'react';
import type { NPCShipIdentity } from '../../utils/npcShipGenerator';
import { useGameStore } from '../../store/gameStore';
import {
  chooseProvokedPosture,
  shouldStayHostile,
  type CollisionResponse,
  type NpcCombatPosture,
  type WarningResponse,
} from '../../utils/npcCombat';

export function useNpcShipEvents({
  identity,
  hullRef,
  hostileContact,
  committedHostile,
  setCombatPosture,
  alertDuration,
}: {
  identity: NPCShipIdentity;
  hullRef: MutableRefObject<number>;
  hostileContact: MutableRefObject<boolean>;
  committedHostile: MutableRefObject<boolean>;
  setCombatPosture: (posture: NpcCombatPosture, until: number) => void;
  alertDuration: number;
}) {
  useEffect(() => {
    const markProvoked = (reputation: number, hullFraction: number) => {
      hostileContact.current = true;
      if (shouldStayHostile(identity, { reputation, hullFraction })) {
        committedHostile.current = true;
      }
    };

    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { npcId?: string; response?: CollisionResponse } | undefined;
      if (detail?.npcId !== identity.id) return;
      const now = Date.now();
      const hullFraction = hullRef.current / identity.maxHull;
      const reputation = useGameStore.getState().getReputation(identity.flag);
      let posture: NpcCombatPosture;
      if (detail.response === 'apologize' || detail.response === 'pay') {
        posture = identity.armed && hullFraction > 0.35 ? 'evade' : 'flee';
      } else if (detail.response === 'threaten') {
        markProvoked(reputation - 40, hullFraction);
        posture = chooseProvokedPosture(identity, {
          reputation: reputation - 40,
          provoked: true,
          hullFraction,
        });
      } else {
        markProvoked(reputation, hullFraction);
        posture = identity.armed && identity.morale >= 55 && hullFraction > 0.35 ? 'engage' : 'flee';
      }
      setCombatPosture(posture, now + alertDuration);
      useGameStore.getState().addNotification(
        detail.response === 'apologize' || detail.response === 'pay'
          ? `The ${identity.shipName} keeps clear, still cursing your helm.`
          : posture === 'flee'
          ? `The ${identity.shipName} breaks away, shouting curses.`
          : `The ${identity.shipName} clears for action.`,
        'warning',
      );
    };
    window.addEventListener('npc-collision-response', handler);
    return () => window.removeEventListener('npc-collision-response', handler);
  }, [alertDuration, committedHostile, hostileContact, hullRef, identity, setCombatPosture]);

  useEffect(() => {
    const markProvoked = (reputation: number, hullFraction: number) => {
      hostileContact.current = true;
      if (shouldStayHostile(identity, { reputation, hullFraction })) {
        committedHostile.current = true;
      }
    };

    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { npcId?: string; response?: WarningResponse } | undefined;
      if (detail?.npcId !== identity.id) return;
      const now = Date.now();
      const hullFraction = hullRef.current / identity.maxHull;
      const reputation = useGameStore.getState().getReputation(identity.flag);
      let posture: NpcCombatPosture;
      if (detail.response === 'alterCourse' || detail.response === 'payToll') {
        posture = 'evade';
      } else if (detail.response === 'threaten') {
        markProvoked(reputation - 35, hullFraction);
        posture = chooseProvokedPosture(identity, {
          reputation: reputation - 35,
          provoked: true,
          hullFraction,
        });
      } else {
        markProvoked(reputation, hullFraction);
        posture = identity.armed && identity.morale >= 45 && hullFraction > 0.35 ? 'pursue' : 'evade';
      }
      setCombatPosture(posture, now + alertDuration);
      useGameStore.getState().addNotification(
        posture === 'evade'
          ? `The ${identity.shipName} sheers off but keeps watch.`
          : `The ${identity.shipName} presses closer, ready for violence.`,
        'warning',
      );
    };
    window.addEventListener('npc-warning-response', handler);
    return () => window.removeEventListener('npc-warning-response', handler);
  }, [alertDuration, committedHostile, hostileContact, hullRef, identity, setCombatPosture]);
}

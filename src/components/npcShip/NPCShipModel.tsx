import type { NPCShipIdentity } from '../../utils/npcShipGenerator';
import type { NPCShipDetailLevel } from './detailLevel';
import { DhowLikeModel } from './DhowLikeModel';
import { EuropeanModel } from './EuropeanModel';
import { JunkModel } from './JunkModel';
import { PrauModel } from './PrauModel';

export function NPCShipModel({ identity, detailLevel = 'near' }: { identity: NPCShipIdentity; detailLevel?: NPCShipDetailLevel }) {
  switch (identity.visual.family) {
    case 'junk':
      return <JunkModel visual={identity.visual} detailLevel={detailLevel} />;
    case 'prau':
      return <PrauModel visual={identity.visual} shipType={identity.shipType} detailLevel={detailLevel} />;
    case 'european':
      return <EuropeanModel visual={identity.visual} shipType={identity.shipType} detailLevel={detailLevel} />;
    case 'dhow':
    default:
      return <DhowLikeModel visual={identity.visual} shipType={identity.shipType} detailLevel={detailLevel} />;
  }
}

export type NPCShipDetailLevel = 'near' | 'mid' | 'far';

export function detailLevelForDistance(distance: number): NPCShipDetailLevel {
  if (distance > 180) return 'far';
  if (distance > 90) return 'mid';
  return 'near';
}

export function showNpcShipDetail(level: NPCShipDetailLevel, min: NPCShipDetailLevel) {
  const rank: Record<NPCShipDetailLevel, number> = {
    far: 0,
    mid: 1,
    near: 2,
  };
  return rank[level] >= rank[min];
}

import type { CaptainAbility, CaptainTrait, CrewMember, CrewRole, CrewStats } from './gameStore';

export const HEARTS_BASE_MAX = 3;

export function maxHeartsForLevel(level: number): number {
  return HEARTS_BASE_MAX + Math.max(0, level - 1);
}

export function initialHearts(level: number) {
  const max = maxHeartsForLevel(level);
  return { current: max, max };
}

export function getCaptain(state: { crew: CrewMember[] }): CrewMember | undefined {
  return state.crew.find(c => c.role === 'Captain') ?? state.crew[0];
}

export function getCrewByRole(state: { crew: CrewMember[] }, role: CrewRole): CrewMember | undefined {
  return state.crew.find(c => c.role === role);
}

export function getRoleBonus(state: { crew: CrewMember[] }, role: CrewRole, stat: keyof CrewStats): number {
  const member = getCrewByRole(state, role);
  if (!member) return 1.0;
  return 1.0 + (member.stats[stat] / 200);
}

export function captainHasTrait(state: { crew: CrewMember[] }, trait: CaptainTrait): boolean {
  return getCaptain(state)?.traits.includes(trait) ?? false;
}

export function captainHasAbility(state: { crew: CrewMember[] }, ability: CaptainAbility): boolean {
  return getCaptain(state)?.abilities.includes(ability) ?? false;
}

export function updateCrewMember(
  crew: CrewMember[], id: string, updater: (m: CrewMember) => CrewMember
): CrewMember[] {
  return crew.map(c => c.id === id ? updater(c) : c);
}

export function grantCrewXp(
  crew: CrewMember[], memberId: string, xp: number
): { crew: CrewMember[]; levelledUp: string | null; newLevel: number } {
  let levelledUp: string | null = null;
  let newLevel = 0;
  const updated = crew.map(c => {
    if (c.id !== memberId) return c;
    const totalXp = c.xp + xp;
    if (totalXp >= c.xpToNext) {
      const skillBump = 2 + Math.floor(Math.random() * 3);
      const statKeys: (keyof CrewStats)[] = ['strength', 'perception', 'charisma', 'luck'];
      const bumpStat = statKeys[Math.floor(Math.random() * statKeys.length)];
      levelledUp = c.name;
      newLevel = c.level + 1;
      const newMaxHearts = maxHeartsForLevel(newLevel);
      return {
        ...c,
        xp: totalXp - c.xpToNext,
        level: c.level + 1,
        xpToNext: Math.floor(c.xpToNext * 1.5),
        skill: Math.min(100, c.skill + skillBump),
        stats: { ...c.stats, [bumpStat]: Math.min(20, c.stats[bumpStat] + 1) },
        hearts: { current: newMaxHearts, max: newMaxHearts },
      };
    }
    return { ...c, xp: totalXp };
  });
  return { crew: updated, levelledUp, newLevel };
}

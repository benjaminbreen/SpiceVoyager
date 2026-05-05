import type { Building, BuildingInstitution, BuildingType } from '../store/gameStore';

export type PortRole =
  | 'imperial-capital'
  | 'fortress-factory'
  | 'customs-entrepot'
  | 'company-factory'
  | 'sultanate-emporium'
  | 'regional-market'
  | 'naval-provisioning'
  | 'waystation'
  | 'frontier-settlement';

type CountMap = Record<BuildingType, number>;

export interface PortRoleProfile {
  countMultipliers?: Partial<Record<BuildingType, number>>;
  countOverrides?: Partial<Record<BuildingType, number>>;
  institutions?: Partial<Record<BuildingType, readonly BuildingInstitution[]>>;
}

export const PORT_ROLE: Record<string, PortRole> = {
  goa: 'imperial-capital',
  lisbon: 'imperial-capital',
  seville: 'imperial-capital',
  manila: 'imperial-capital',
  salvador: 'imperial-capital',

  diu: 'fortress-factory',
  muscat: 'fortress-factory',
  mombasa: 'fortress-factory',
  elmina: 'fortress-factory',

  hormuz: 'customs-entrepot',
  aden: 'customs-entrepot',
  mocha: 'customs-entrepot',
  surat: 'customs-entrepot',
  masulipatnam: 'customs-entrepot',
  cartagena: 'customs-entrepot',
  havana: 'customs-entrepot',
  veracruz: 'customs-entrepot',
  colombo: 'customs-entrepot',

  amsterdam: 'company-factory',
  london: 'company-factory',
  macau: 'company-factory',
  nagasaki: 'company-factory',

  calicut: 'sultanate-emporium',
  bantam: 'sultanate-emporium',
  zanzibar: 'sultanate-emporium',

  malacca: 'regional-market',
  venice: 'regional-market',

  luanda: 'naval-provisioning',

  socotra: 'waystation',
  cape: 'waystation',

  jamestown: 'frontier-settlement',
};

const PORT_ROLE_PROFILES: Record<PortRole, PortRoleProfile> = {
  'imperial-capital': {
    countMultipliers: {
      estate: 1.25,
      market: 1.15,
      plaza: 1.25,
      house: 1.10,
      shack: 0.85,
      farmhouse: 0.80,
    },
    institutions: {
      palace: ['authority'],
      warehouse: ['treasury'],
    },
  },
  'fortress-factory': {
    countMultipliers: {
      dock: 1.20,
      warehouse: 1.50,
      fort: 1.35,
      estate: 0.50,
      plaza: 0.65,
      house: 0.48,
      shack: 0.85,
      farmhouse: 0.35,
    },
    institutions: {
      fort: ['captaincy'],
      warehouse: ['factory'],
    },
  },
  'customs-entrepot': {
    countMultipliers: {
      dock: 1.15,
      warehouse: 1.45,
      market: 1.20,
      estate: 0.85,
      house: 0.92,
      farmhouse: 0.65,
    },
    institutions: {
      fort: ['captaincy'],
      warehouse: ['customs', 'factory'],
    },
  },
  'company-factory': {
    countMultipliers: {
      dock: 1.10,
      warehouse: 1.35,
      market: 1.10,
      plaza: 0.90,
      house: 1.05,
      farmhouse: 0.70,
    },
    institutions: {
      warehouse: ['company-house', 'factory'],
    },
  },
  'sultanate-emporium': {
    countMultipliers: {
      dock: 1.15,
      warehouse: 1.20,
      market: 1.35,
      estate: 1.10,
      plaza: 1.10,
      house: 1.05,
      farmhouse: 0.75,
    },
    institutions: {
      palace: ['authority'],
      warehouse: ['customs'],
    },
  },
  'regional-market': {
    countMultipliers: {
      warehouse: 1.10,
      market: 1.15,
      house: 1.00,
    },
    institutions: {
      warehouse: ['customs'],
    },
  },
  'naval-provisioning': {
    countMultipliers: {
      dock: 1.30,
      warehouse: 1.35,
      fort: 1.25,
      market: 0.90,
      estate: 0.60,
      house: 0.55,
      shack: 0.80,
      farmhouse: 0.45,
    },
    institutions: {
      fort: ['captaincy'],
      warehouse: ['customs'],
    },
  },
  'waystation': {
    countMultipliers: {
      dock: 0.80,
      warehouse: 0.80,
      fort: 0.70,
      estate: 0.40,
      market: 0.65,
      plaza: 0.50,
      house: 0.55,
      shack: 0.80,
      farmhouse: 0.60,
    },
  },
  'frontier-settlement': {
    countMultipliers: {
      dock: 0.80,
      warehouse: 0.65,
      fort: 0.65,
      estate: 0.35,
      market: 0.50,
      plaza: 0.50,
      house: 0.55,
      shack: 1.10,
      farmhouse: 1.20,
    },
  },
};

export function roleForPort(portId?: string): PortRole | null {
  return portId ? PORT_ROLE[portId] ?? null : null;
}

export function applyPortRoleCounts(baseCounts: CountMap, portId?: string): CountMap {
  const role = roleForPort(portId);
  if (!role) return { ...baseCounts };

  const profile = PORT_ROLE_PROFILES[role];
  const counts: CountMap = { ...baseCounts };

  for (const [type, multiplier] of Object.entries(profile.countMultipliers ?? {}) as [BuildingType, number][]) {
    counts[type] = Math.max(0, Math.round(counts[type] * multiplier));
  }

  for (const [type, count] of Object.entries(profile.countOverrides ?? {}) as [BuildingType, number][]) {
    counts[type] = Math.max(0, Math.round(count));
  }

  return counts;
}

export function applyPortRoleInstitutions(
  buildings: Building[],
  centerX: number,
  centerZ: number,
  portId?: string,
): void {
  const role = roleForPort(portId);
  if (!role) return;

  const institutions = PORT_ROLE_PROFILES[role].institutions;
  if (!institutions) return;

  for (const [type, tags] of Object.entries(institutions) as [BuildingType, readonly BuildingInstitution[]][]) {
    const candidates = buildings
      .filter((building) => building.type === type && !building.institution)
      .sort((a, b) => {
        const da = Math.hypot(a.position[0] - centerX, a.position[2] - centerZ);
        const db = Math.hypot(b.position[0] - centerX, b.position[2] - centerZ);
        return da - db;
      });

    for (let i = 0; i < tags.length && i < candidates.length; i++) {
      candidates[i].institution = tags[i];
    }
  }
}

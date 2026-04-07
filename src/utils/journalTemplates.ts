import type { Commodity } from '../store/gameStore';

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function commerceBuyTemplate(commodity: Commodity, amount: number, totalCost: number, portName: string): string {
  return pick([
    `Bought ${amount} ${commodity} for ${totalCost}g at ${portName}.`,
    `Acquired ${amount} ${commodity} at ${portName} — ${totalCost}g total.`,
    `Purchased ${amount} ${commodity} from the merchants of ${portName} for ${totalCost} gold.`,
    `Loaded ${amount} ${commodity} into the hold at ${portName}. Cost: ${totalCost}g.`,
  ]);
}

export function commerceSellTemplate(commodity: Commodity, amount: number, totalGain: number, portName: string): string {
  return pick([
    `Sold ${amount} ${commodity} for ${totalGain}g at ${portName}.`,
    `Offloaded ${amount} ${commodity} at ${portName} — earned ${totalGain}g.`,
    `The merchants of ${portName} bought ${amount} ${commodity} for ${totalGain} gold.`,
    `Sold off ${amount} ${commodity} at ${portName}. ${totalGain}g added to the coffers.`,
  ]);
}

export function shipDamageTemplate(amount: number, hullRemaining: number): string {
  return pick([
    `Hull damaged! Lost ${amount} integrity — now at ${hullRemaining}.`,
    `Collision! Hull took ${amount} damage, down to ${hullRemaining}.`,
    `Impact — hull integrity dropped by ${amount} to ${hullRemaining}.`,
  ]);
}

export function shipRepairTemplate(amount: number, cost: number, portName: string): string {
  return pick([
    `Repaired ${amount} hull at ${portName} for ${cost}g.`,
    `Shipyard at ${portName} patched ${amount} hull damage — ${cost}g.`,
    `Paid ${cost}g for hull repairs at ${portName}. +${amount} integrity.`,
  ]);
}

export function portDiscoverTemplate(portName: string): string {
  return pick([
    `Discovered ${portName}.`,
    `Sighted ${portName} on the horizon.`,
    `New port discovered: ${portName}.`,
    `${portName} — a new port added to our charts.`,
  ]);
}

export function tavernTemplate(portName: string): string {
  return pick([
    `Bought the crew drinks at ${portName}'s tavern.`,
    `A round of drinks for the crew at ${portName}. Spirits lifted.`,
    `Visited the tavern at ${portName} — the crew is in better humor.`,
  ]);
}

export function disembarkTemplate(portName?: string): string {
  if (portName) {
    return pick([
      `Went ashore at ${portName}.`,
      `Disembarked at ${portName}.`,
      `Set foot on land at ${portName}.`,
    ]);
  }
  return pick([
    `Went ashore.`,
    `Disembarked to explore the coast.`,
    `Left the ship to walk the shore.`,
  ]);
}

export function embarkTemplate(): string {
  return pick([
    `Returned to the ship.`,
    `Back aboard. Ready to sail.`,
    `Embarked and prepared to set sail.`,
  ]);
}

export function encounterTemplate(): string {
  return pick([
    `Near collision with a merchant vessel.`,
    `Close call with another ship — no damage.`,
    `Narrowly avoided a passing vessel.`,
  ]);
}

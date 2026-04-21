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

/** On-sale reveal that a previously-unknown stack was a period-accurate substitute. */
export function fraudRevealTemplate(
  claimed: Commodity,
  actual: Commodity,
  amount: number,
  acquiredPort: string,
  sellPort: string,
  lossVsClaimed: number,
): string {
  return pick([
    `The ${sellPort} buyer examines the ${claimed} we took on at ${acquiredPort}, turns a piece in his fingers, and shakes his head. "${actual}, Captain — not ${claimed}." We lose ${lossVsClaimed}g on ${amount} units.`,
    `Our "${claimed}" from ${acquiredPort} turns out to be ${actual}. The buyer at ${sellPort} is unimpressed, though he takes it for ${lossVsClaimed}g less than the true article would fetch.`,
    `${actual} sold to us as ${claimed}. The fraud surfaces at ${sellPort} — ${lossVsClaimed}g lost on ${amount} units. We note the ${acquiredPort} seller for future reference.`,
    `At ${sellPort}, the merchant snaps one of the pieces and laughs without humor. "This is ${actual}, not ${claimed}. Who sold it to you?" ${acquiredPort}, as it happens. ${lossVsClaimed}g short of what we'd hoped.`,
  ]);
}

/** On-sale reveal that a previously-unknown stack was something BETTER than claimed. */
export function windfallRevealTemplate(
  claimed: Commodity,
  actual: Commodity,
  amount: number,
  acquiredPort: string,
  sellPort: string,
  gainVsClaimed: number,
): string {
  return pick([
    `The ${sellPort} buyer goes still when he opens the bale. "Captain — do you know what this is?" The parcel we bought as ${claimed} at ${acquiredPort} is in fact ${actual}. ${amount} units, paid a pittance, sold for ${gainVsClaimed}g beyond the claimed price.`,
    `${actual}, sold to us as ${claimed} at ${acquiredPort}. The seller evidently did not know what he had — and we did not either, until the ${sellPort} buyer's face told us. +${gainVsClaimed}g beyond expectation.`,
    `A dockside peddler at ${acquiredPort} took us for fools and charged the price of ${claimed}. It was, in truth, ${actual}. At ${sellPort} the true buyer's price is ${gainVsClaimed}g above what we'd reckoned.`,
    `We took on ${amount} units of "${claimed}" at ${acquiredPort} on a gamble. The ${sellPort} merchant identifies the goods as ${actual} and pays accordingly — ${gainVsClaimed}g more than the ledger promised.`,
  ]);
}

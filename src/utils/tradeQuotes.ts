import type { CargoStack, CrewMember, Port } from '../store/gameStore';
import {
  type Commodity,
  COMMODITY_DEFS,
  supplyDemandModifier,
} from './commodities';
import {
  getEffectiveKnowledge,
  getMasterySellBonus,
  getUnknownBuyDiscount,
  type KnowledgeLevel,
} from './knowledgeSystem';

export type TradeBlockReason =
  | 'no-port'
  | 'no-gold'
  | 'no-space'
  | 'no-stock'
  | 'none-aboard'
  | 'hold-cap';

export interface TradeQuote {
  commodity: Commodity;
  amount: number;
  unitPrice: number;
  total: number;
  maxAmount: number;
  cargoAfter: number;
  knowledgeLevel: KnowledgeLevel;
  displayName: string;
  blockReason: TradeBlockReason | null;
}

export interface TradeQuoteInput {
  commodity: Commodity;
  amount: number;
  port: Port | null;
  cargo: Record<Commodity, number>;
  cargoWeight: number;
  cargoCapacity: number;
  gold: number;
  crew: CrewMember[];
  knowledgeState: Record<string, KnowledgeLevel>;
}

export interface SellSettlement {
  total: number;
  consumed: { stack: CargoStack; taken: number }[];
  provenanceAfter: CargoStack[];
  reveals: {
    stack: CargoStack;
    taken: number;
    claimedUnitPrice: number;
    actualUnitPrice: number;
  }[];
  knowledgeAfter: Record<string, KnowledgeLevel>;
}

function clampAmount(value: number) {
  return Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
}

function cargoSpaceLeft(input: TradeQuoteInput) {
  return Math.max(0, input.cargoCapacity - input.cargoWeight);
}

function roleBonus(crew: CrewMember[], role: string, stat: 'charisma') {
  const member = crew.find(c => c.role === role);
  if (!member) return 1.0;
  return 1.0 + (member.stats[stat] / 200);
}

function captainHasSilverTongue(crew: CrewMember[]) {
  return crew.some(c => c.role === 'Captain' && c.traits.includes('Silver Tongue'));
}

function displayNameFor(commodity: Commodity, knowledgeLevel: KnowledgeLevel) {
  return knowledgeLevel >= 1 ? commodity : COMMODITY_DEFS[commodity].physicalDescription;
}

export function quoteBuyCommodity(input: TradeQuoteInput): TradeQuote {
  const amount = clampAmount(input.amount);
  const def = COMMODITY_DEFS[input.commodity];
  const knowledgeLevel = getEffectiveKnowledge(input.commodity, input.knowledgeState, input.crew);
  if (!input.port) {
    return {
      commodity: input.commodity,
      amount,
      unitPrice: 0,
      total: 0,
      maxAmount: 0,
      cargoAfter: input.cargoWeight,
      knowledgeLevel,
      displayName: displayNameFor(input.commodity, knowledgeLevel),
      blockReason: 'no-port',
    };
  }

  const sdMod = supplyDemandModifier(
    input.port.inventory[input.commodity],
    input.port.baseInventory[input.commodity],
  );
  const effectiveBase = Math.max(1, Math.round(input.port.basePrices[input.commodity] * sdMod));
  const factorDiscount = roleBonus(input.crew, 'Factor', 'charisma');
  const traitDiscount = captainHasSilverTongue(input.crew) ? 0.95 : 1.0;
  const unknownDiscount = knowledgeLevel === 0 ? getUnknownBuyDiscount() : 1.0;
  const unitPrice = Math.max(1, Math.floor(effectiveBase / factorDiscount * traitDiscount * unknownDiscount));
  const maxByGold = unitPrice > 0 ? Math.floor(input.gold / unitPrice) : 0;
  const maxBySpace = def.weight > 0 ? Math.floor(cargoSpaceLeft(input) / def.weight) : 0;
  const playerInv = input.cargo[input.commodity] ?? 0;
  const maxByHoldCap = input.commodity === 'War Rockets' ? Math.max(0, 20 - playerInv) : Infinity;
  const maxAmount = Math.max(0, Math.min(maxByGold, maxBySpace, input.port.inventory[input.commodity] ?? 0, maxByHoldCap));
  const tradeAmount = Math.min(amount, maxAmount);
  const total = tradeAmount * unitPrice;

  let blockReason: TradeBlockReason | null = null;
  if (input.port.inventory[input.commodity] <= 0) blockReason = 'no-stock';
  else if (maxByHoldCap <= 0) blockReason = 'hold-cap';
  else if (maxBySpace <= 0) blockReason = 'no-space';
  else if (maxByGold <= 0) blockReason = 'no-gold';

  return {
    commodity: input.commodity,
    amount: tradeAmount,
    unitPrice,
    total,
    maxAmount,
    cargoAfter: input.cargoWeight + tradeAmount * def.weight,
    knowledgeLevel,
    displayName: displayNameFor(input.commodity, knowledgeLevel),
    blockReason,
  };
}

export function sellUnitPrice(
  commodity: Commodity,
  input: Pick<TradeQuoteInput, 'port' | 'crew' | 'knowledgeState'>,
): number {
  if (!input.port) return 0;
  const level = getEffectiveKnowledge(commodity, input.knowledgeState, input.crew);
  const portHas = input.port.basePrices[commodity] > 0;
  const sdMod = portHas
    ? supplyDemandModifier(input.port.inventory[commodity], input.port.baseInventory[commodity])
    : 1.0;
  const base = portHas
    ? Math.max(1, Math.round(input.port.basePrices[commodity] * sdMod))
    : Math.max(1, Math.round(
        (COMMODITY_DEFS[commodity].basePrice[0] + COMMODITY_DEFS[commodity].basePrice[1]) / 2 * 0.5
      ));
  const factorBonus = roleBonus(input.crew, 'Factor', 'charisma');
  const traitBonus = captainHasSilverTongue(input.crew) ? 1.05 : 1.0;
  const mastery = level >= 2 ? getMasterySellBonus() : 1.0;
  return Math.max(1, Math.floor(base * 0.8 * factorBonus * traitBonus * mastery));
}

export function quoteSellCommodity(input: TradeQuoteInput): TradeQuote {
  const amount = clampAmount(input.amount);
  const def = COMMODITY_DEFS[input.commodity];
  const knowledgeLevel = getEffectiveKnowledge(input.commodity, input.knowledgeState, input.crew);
  const playerInv = input.cargo[input.commodity] ?? 0;
  const maxAmount = Math.max(0, playerInv);
  const tradeAmount = Math.min(amount, maxAmount);
  const unitPrice = sellUnitPrice(input.commodity, input);
  const total = tradeAmount * unitPrice;

  return {
    commodity: input.commodity,
    amount: tradeAmount,
    unitPrice,
    total,
    maxAmount,
    cargoAfter: input.cargoWeight - tradeAmount * def.weight,
    knowledgeLevel,
    displayName: displayNameFor(input.commodity, knowledgeLevel),
    blockReason: maxAmount <= 0 ? 'none-aboard' : null,
  };
}

export function settleSellCommodity(
  input: Pick<TradeQuoteInput, 'commodity' | 'amount' | 'port' | 'crew' | 'knowledgeState'> & {
    cargoProvenance: CargoStack[];
  },
): SellSettlement {
  const amount = clampAmount(input.amount);
  const consumed: { stack: CargoStack; taken: number }[] = [];
  const provenanceAfter: CargoStack[] = [];
  let remaining = amount;

  for (const stack of input.cargoProvenance) {
    if (stack.commodity !== input.commodity || remaining <= 0) {
      provenanceAfter.push(stack);
      continue;
    }
    const take = Math.min(stack.amount, remaining);
    consumed.push({ stack, taken: take });
    remaining -= take;
    const left = stack.amount - take;
    if (left > 0) provenanceAfter.push({ ...stack, amount: left });
  }

  if (remaining > 0) {
    consumed.push({
      stack: {
        id: 'synthetic',
        commodity: input.commodity,
        actualCommodity: input.commodity,
        amount: remaining,
        acquiredPort: 'unknown',
        acquiredPortName: 'unknown',
        acquiredDay: 0,
        purchasePrice: 0,
        knowledgeAtPurchase: 1,
      },
      taken: remaining,
    });
  }

  let total = 0;
  const reveals: SellSettlement['reveals'] = [];
  const claimedUnitPrice = sellUnitPrice(input.commodity, input);
  const knowledgeAfter = { ...input.knowledgeState };

  for (const { stack, taken } of consumed) {
    const actual = stack.actualCommodity;
    if (actual === input.commodity) {
      total += claimedUnitPrice * taken;
      continue;
    }
    const actualUnitPrice = sellUnitPrice(actual, input);
    total += actualUnitPrice * taken;
    reveals.push({ stack, taken, claimedUnitPrice, actualUnitPrice });
    if ((knowledgeAfter[actual] ?? 0) < 1) knowledgeAfter[actual] = 1;
  }

  return { total, consumed, provenanceAfter, reveals, knowledgeAfter };
}

import { useEffect, useMemo, useState } from 'react';
import { Anchor, Coins } from 'lucide-react';
import { useGameStore } from '../store/gameStore';
import type { Commodity } from '../utils/commodities';
import {
  ALL_COMMODITIES,
  COMMODITY_DEFS,
  TIER_LABELS,
  getGlobalAveragePrice,
  getTradeRole,
  type CommodityTier,
} from '../utils/commodities';
import { sfxCoin, sfxClick, sfxHover } from '../audio/SoundEffects';
import { getEffectiveKnowledge, type KnowledgeLevel } from '../utils/knowledgeSystem';
import { MARKET_TRUST } from '../utils/worldPorts';
import { ValueFlash } from './ValueFlash';
import { quoteBuyCommodity, quoteSellCommodity } from '../utils/tradeQuotes';
import { cargoUnitWeight } from '../utils/cargoWeight';

export interface MarketTabLedgerProps {
  port: NonNullable<ReturnType<typeof useGameStore.getState>['activePort']>;
  cargo: Record<Commodity, number>;
  gold: number;
  cargoWeight: number;
  cargoCapacity: number;
  ports: ReturnType<typeof useGameStore.getState>['ports'];
  buyCommodity: (c: Commodity, amount: number) => void;
  sellCommodity: (c: Commodity, amount: number) => void;
}

type TradeSignal = 'low' | 'fair' | 'high';
type MarketFilter = 'all' | 'sell' | 'buy' | 'wanted' | 'unknown';

interface MarketRow {
  commodity: Commodity;
  tier: CommodityTier;
  price: number;
  sellPrice: number;
  avg: number;
  ratio: number;
  signal: TradeSignal;
  role: ReturnType<typeof getTradeRole>;
  portInv: number;
  playerInv: number;
  maxBuy: number;
  maxSell: number;
  knowledgeLevel: KnowledgeLevel;
  displayName: string;
}

const TIERS: CommodityTier[] = [1, 2, 3, 4, 5];

const FILTERS: { key: MarketFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'sell', label: 'Sell' },
  { key: 'buy', label: 'Buy' },
  { key: 'wanted', label: 'Wanted' },
  { key: 'unknown', label: 'Unknown' },
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function formatPrice(value: number) {
  return `${value.toLocaleString()}g`;
}

function getSignal(ratio: number): TradeSignal {
  if (ratio < 0.75) return 'low';
  if (ratio > 1.25) return 'high';
  return 'fair';
}

function getRoleLabel(role: MarketRow['role']) {
  if (role === 'produces') return { label: 'Local', className: 'text-emerald-400 bg-emerald-400/[0.08] border-emerald-400/20' };
  if (role === 'demands') return { label: 'Wanted', className: 'text-[#fbbf24] bg-[#fbbf24]/[0.08] border-[#fbbf24]/20' };
  if (role === 'trades') return { label: 'Traded', className: 'text-slate-500 bg-white/[0.03] border-white/[0.06]' };
  return { label: 'Foreign', className: 'text-slate-600 bg-white/[0.02] border-white/[0.04]' };
}

function getSignalLabel(signal: TradeSignal) {
  if (signal === 'low') return { label: 'Low', className: 'text-emerald-400 bg-emerald-400/[0.08] border-emerald-400/20' };
  if (signal === 'high') return { label: 'High', className: 'text-red-400 bg-red-400/[0.08] border-red-400/20' };
  return { label: 'Fair', className: 'text-slate-500 bg-white/[0.03] border-white/[0.06]' };
}

function getCommodityImage(commodity: Commodity) {
  return COMMODITY_DEFS[commodity].iconImage;
}

function quantityUnit(amount: number) {
  return amount === 1 ? 'unit' : 'units';
}

function commodityTestId(commodity: Commodity) {
  return commodity.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function marketPrice(row: MarketRow, side: 'buy' | 'sell') {
  if (side === 'buy') return row.portInv > 0 && row.price > 0 ? formatPrice(row.price) : '--';
  return row.playerInv > 0 && row.sellPrice > 0 ? formatPrice(row.sellPrice) : '--';
}

export function MarketTabLedger({
  port,
  cargo,
  gold,
  cargoWeight,
  cargoCapacity,
  ports,
  buyCommodity,
  sellCommodity,
}: MarketTabLedgerProps) {
  const [selectedCommodity, setSelectedCommodity] = useState<Commodity | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [filter, setFilter] = useState<MarketFilter>('all');

  const knowledgeState = useGameStore(s => s.knowledgeState);
  const crew = useGameStore(s => s.crew);

  const rows = useMemo<MarketRow[]>(() => {
    const averageFor = (commodity: Commodity) => {
      const knownPorts = ports.filter(p => p.prices[commodity] > 0);
      if (knownPorts.length > 1) {
        return knownPorts.reduce((sum, p) => sum + p.prices[commodity], 0) / knownPorts.length;
      }
      return getGlobalAveragePrice(commodity);
    };

    return ALL_COMMODITIES.flatMap((commodity) => {
      const def = COMMODITY_DEFS[commodity];
      const portInv = port.inventory[commodity] ?? 0;
      const playerInv = cargo[commodity] ?? 0;
      const price = port.prices[commodity] ?? 0;
      const role = getTradeRole(port.id, commodity);
      // "demands" rows only appear if the player is actually carrying the good.
      // Stray leftover port stock is a simulation artifact — conceptually a port
      // that demands pepper is a buyer of it, not a seller of it.
      const available = role === 'demands'
        ? playerInv > 0
        : price > 0 || portInv > 0 || playerInv > 0;
      if (!available) return [];

      const kLevel = getEffectiveKnowledge(commodity, knowledgeState, crew);
      const displayName = kLevel >= 1 ? commodity : def.physicalDescription;

      const avg = averageFor(commodity);
      const buyQuote = quoteBuyCommodity({
        commodity,
        amount: Number.MAX_SAFE_INTEGER,
        port,
        cargo,
        cargoWeight,
        cargoCapacity,
        gold,
        crew,
        knowledgeState,
      });
      const sellQuote = quoteSellCommodity({
        commodity,
        amount: Number.MAX_SAFE_INTEGER,
        port,
        cargo,
        cargoWeight,
        cargoCapacity,
        gold,
        crew,
        knowledgeState,
      });
      const ratio = avg > 0 && price > 0 ? price / avg : 1;

      return [{
        commodity,
        tier: def.tier,
        price: buyQuote.unitPrice,
        sellPrice: sellQuote.unitPrice,
        avg,
        ratio,
        signal: getSignal(ratio),
        role,
        portInv,
        playerInv,
        maxBuy: buyQuote.maxAmount,
        maxSell: sellQuote.maxAmount,
        knowledgeLevel: kLevel,
        displayName,
      }];
    });
  }, [cargo, gold, port, port.id, port.inventory, port.prices, ports, cargoWeight, cargoCapacity, knowledgeState, crew]);

  const visibleRows = useMemo(() => {
    return rows.filter((row) => {
      if (filter === 'sell') return row.maxSell > 0;
      if (filter === 'buy') return row.portInv > 0 && row.price > 0;
      if (filter === 'wanted') return row.role === 'demands';
      if (filter === 'unknown') return row.knowledgeLevel === 0;
      return true;
    });
  }, [filter, rows]);

  const rowsByTier = useMemo(() => {
    const grouped = new Map<CommodityTier, MarketRow[]>();
    for (const row of visibleRows) {
      const list = grouped.get(row.tier) ?? [];
      list.push(row);
      grouped.set(row.tier, list);
    }
    return grouped;
  }, [visibleRows]);

  useEffect(() => {
    if (visibleRows.length === 0 && rows.length > 0 && filter !== 'all') {
      setFilter('all');
      return;
    }
    if (visibleRows.length === 0) {
      setSelectedCommodity(null);
      return;
    }
    if (!selectedCommodity || !visibleRows.some(row => row.commodity === selectedCommodity)) {
      setSelectedCommodity(visibleRows[0].commodity);
      setQuantity(1);
    }
  }, [filter, rows.length, visibleRows, selectedCommodity]);

  const selected = visibleRows.find(row => row.commodity === selectedCommodity) ?? visibleRows[0];
  const maxSelectedQuantity = selected ? Math.max(selected.maxBuy, selected.maxSell, 1) : 1;
  const clampedQuantity = clamp(quantity, 1, maxSelectedQuantity);

  useEffect(() => {
    if (quantity !== clampedQuantity) setQuantity(clampedQuantity);
  }, [clampedQuantity, quantity]);

  const buyQty = selected ? Math.min(clampedQuantity, selected.maxBuy) : 0;
  const sellQty = selected ? Math.min(clampedQuantity, selected.maxSell) : 0;
  const buyTotal = selected ? buyQty * selected.price : 0;
  const sellTotal = selected ? sellQty * selected.sellPrice : 0;
  const selectedCargoWeight = selected ? cargoUnitWeight(selected.commodity) : 0;
  const holdAfterBuy = selected ? cargoWeight + buyQty * selectedCargoWeight : cargoWeight;
  const holdAfterSell = selected ? cargoWeight - sellQty * selectedCargoWeight : cargoWeight;

  const executeTrade = (isBuy: boolean) => {
    if (!selected) return;
    const amount = isBuy ? buyQty : sellQty;
    const total = isBuy ? buyTotal : sellTotal;
    if (amount <= 0) return;
    sfxCoin(total);
    if (isBuy) buyCommodity(selected.commodity, amount);
    else sellCommodity(selected.commodity, amount);
  };

  if (!selected) {
    return (
      <div className="rounded-lg border border-white/[0.05] bg-white/[0.018] px-4 py-6 text-center">
        <div className="text-[9px] font-bold tracking-[0.15em] uppercase text-slate-500" style={{ fontFamily: '"DM Sans", sans-serif' }}>
          Market Ledger
        </div>
        <p className="mt-2 text-[12px] text-slate-500" style={{ fontFamily: '"Fraunces", serif', fontStyle: 'italic' }}>
          No goods are changing hands in this harbor today.
        </p>
      </div>
    );
  }

  const selectedDef = COMMODITY_DEFS[selected.commodity];
  const selectedRole = getRoleLabel(selected.role);
  const selectedSignal = getSignalLabel(selected.signal);
  const selectedImage = getCommodityImage(selected.commodity);
  const priceMeterPct = Math.round(clamp(selected.ratio / 2, 0.06, 1) * 100);

  return (
    <div data-testid="market-ledger" className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.46fr)]">
      <div
        data-testid="mobile-market-trade-dock"
        className={`-mx-1 rounded-lg border p-3 shadow-[0_10px_28px_rgba(0,0,0,0.45)] backdrop-blur-xl md:hidden ${
          selected.knowledgeLevel === 0
            ? 'border-amber-400/20 bg-[#1a1208]/92'
            : 'border-white/[0.08] bg-[#080c14]/94'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div
              className={`truncate text-[17px] font-bold leading-tight ${
                selected.knowledgeLevel === 0 ? 'italic text-amber-200/75' : selected.knowledgeLevel >= 2 ? 'text-emerald-200' : 'text-slate-100'
              }`}
              style={{ fontFamily: '"Fraunces", serif' }}
            >
              {selected.displayName}
            </div>
            <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500" style={{ fontFamily: '"DM Sans", sans-serif' }}>
              {selected.knowledgeLevel === 0 ? 'Unidentified' : `${selectedRole.label} · ${selectedSignal.label}`}
            </div>
          </div>
          <div className="shrink-0 text-right font-mono text-[13px] text-slate-400">
            <div>{cargoWeight}<span className="text-slate-600">/{cargoCapacity}</span></div>
            <div className="mt-1 text-[#d8c47a]">{gold.toLocaleString()}g</div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-[38px_minmax(0,1fr)_38px_54px] gap-2">
          <button
            type="button"
            aria-label="Decrease quantity"
            disabled={clampedQuantity <= 1}
            onClick={() => { sfxClick(); setQuantity(q => clamp(q - 1, 1, maxSelectedQuantity)); }}
            className="h-10 rounded-lg border border-white/[0.08] bg-white/[0.04] text-base font-bold text-slate-300 disabled:cursor-not-allowed disabled:text-slate-700"
          >
            -
          </button>
          <div className="flex h-10 items-center justify-center rounded-lg border border-[#fbbf24]/18 bg-white/[0.04] text-center font-mono text-[14px] font-bold text-slate-100">
            {clampedQuantity} {quantityUnit(clampedQuantity)}
          </div>
          <button
            type="button"
            aria-label="Increase quantity"
            disabled={clampedQuantity >= maxSelectedQuantity}
            onClick={() => { sfxClick(); setQuantity(q => clamp(q + 1, 1, maxSelectedQuantity)); }}
            className="h-10 rounded-lg border border-white/[0.08] bg-white/[0.04] text-base font-bold text-slate-300 disabled:cursor-not-allowed disabled:text-slate-700"
          >
            +
          </button>
          <button
            type="button"
            disabled={clampedQuantity >= maxSelectedQuantity}
            onClick={() => { sfxClick(); setQuantity(maxSelectedQuantity); }}
            className="h-10 rounded-lg border border-white/[0.08] bg-white/[0.04] text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400 disabled:cursor-not-allowed disabled:text-slate-700"
            style={{ fontFamily: '"DM Sans", sans-serif' }}
          >
            Max
          </button>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]" style={{ fontFamily: '"DM Sans", sans-serif' }}>
          <div>
            <div className="font-bold uppercase tracking-[0.12em] text-slate-600">Sell</div>
            <div className="mt-0.5 font-mono text-[13px] font-bold text-slate-200">
              {sellQty > 0 ? `${sellQty} for ${formatPrice(sellTotal)}` : 'Unavailable'}
            </div>
            <div className="mt-0.5 font-mono text-slate-500">After sale {holdAfterSell}/{cargoCapacity}</div>
          </div>
          <div>
            <div className="font-bold uppercase tracking-[0.12em] text-slate-600">Buy</div>
            <div className="mt-0.5 font-mono text-[13px] font-bold text-slate-200">
              {buyQty > 0 ? `${buyQty} for ${formatPrice(buyTotal)}` : 'Unavailable'}
            </div>
            <div className={holdAfterBuy > cargoCapacity ? 'mt-0.5 font-mono text-red-400' : 'mt-0.5 font-mono text-slate-500'}>
              After purchase {holdAfterBuy}/{cargoCapacity}
            </div>
          </div>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            data-testid="mobile-market-sell-button"
            type="button"
            disabled={sellQty <= 0}
            onClick={() => executeTrade(false)}
            className="h-11 rounded-lg border border-amber-300/30 bg-amber-400/[0.10] text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200/90 disabled:cursor-not-allowed disabled:border-white/[0.04] disabled:bg-white/[0.015] disabled:text-slate-700"
            style={{ fontFamily: '"DM Sans", sans-serif' }}
          >
            Sell {sellQty}
          </button>
          <button
            data-testid="mobile-market-buy-button"
            type="button"
            disabled={buyQty <= 0}
            onClick={() => executeTrade(true)}
            className="h-11 rounded-lg border border-emerald-300/30 bg-emerald-400/[0.10] text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-200/90 disabled:cursor-not-allowed disabled:border-white/[0.04] disabled:bg-white/[0.015] disabled:text-slate-700"
            style={{ fontFamily: '"DM Sans", sans-serif' }}
          >
            Buy {buyQty}
          </button>
        </div>

        <div className="mt-2 flex items-center justify-between gap-2 text-[9px] font-bold uppercase tracking-[0.12em] text-slate-700" style={{ fontFamily: '"DM Sans", sans-serif' }}>
          <span>{selected.knowledgeLevel >= 1 ? `Avg ${Math.round(selected.avg)}g` : 'Fair price unknown'}</span>
          <span>{selected.knowledgeLevel >= 1 ? selectedSignal.label : 'Unknown risk'}</span>
        </div>
        {selected.knowledgeLevel === 0 && (MARKET_TRUST[port.id] ?? 0.5) < 0.5 && (
          <p className="mt-1 text-[11px] leading-snug text-amber-500/80" style={{ fontFamily: '"Fraunces", serif', fontStyle: 'italic' }}>
            Traders here have a reputation for counterfeits.
          </p>
        )}
      </div>

      <section className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3 px-1" style={{ fontFamily: '"DM Sans", sans-serif' }}>
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <div className="text-[9px] font-bold tracking-[0.15em] uppercase text-slate-500">
              Market
            </div>
            <div className="flex overflow-hidden rounded-md border border-white/[0.06] bg-white/[0.018]">
              {FILTERS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => { sfxClick(); setFilter(key); }}
                  className={`border-r border-white/[0.05] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.11em] transition-colors last:border-r-0 ${
                    filter === key
                      ? 'bg-[#c9a84c]/12 text-[#f2d37a]'
                      : 'text-slate-500 hover:bg-white/[0.035] hover:text-slate-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600">
            <span className="flex items-center gap-1.5">
              <Coins size={12} className="text-[#c9a84c]" />
              <span>Gold</span>
              <span className="font-mono text-[13px] text-[#d8c47a]">
                <ValueFlash value={gold} upColor="#fde68a" downColor="#f59e0b">
                  {gold.toLocaleString()}
                </ValueFlash>
                g
              </span>
            </span>
            <span className="flex items-center gap-1.5">
              <Anchor size={12} className={cargoWeight >= cargoCapacity ? 'text-red-400' : 'text-slate-500'} />
              <span>Hold</span>
              <span className={`font-mono text-[13px] ${cargoWeight >= cargoCapacity ? 'text-red-400' : 'text-slate-300'}`}>
                <ValueFlash value={cargoWeight} upColor="#fbbf24" downColor="#38bdf8">
                  {cargoWeight}
                </ValueFlash>
                <span className="text-slate-600">/{cargoCapacity}</span>
              </span>
            </span>
          </div>
        </div>

        <div className="pr-1">
          <div className="sticky top-0 z-10 hidden grid-cols-[minmax(220px,1.7fr)_58px_58px_78px_62px_62px] gap-3 rounded-t-md border border-white/[0.045] bg-[#080c14]/95 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-600 backdrop-blur md:grid" style={{ fontFamily: '"DM Sans", sans-serif' }}>
            <span>Ware</span>
            <span className="text-right">Buy</span>
            <span className="text-right">Sell</span>
            <span>Market</span>
            <span className="text-right">You</span>
            <span className="text-right">Port</span>
          </div>

          {TIERS.map((tier) => {
            const tierRows = rowsByTier.get(tier);
            if (!tierRows?.length) return null;

            return (
              <div key={tier} className="mb-2">
                <div className="px-1 py-2 text-[9px] font-bold uppercase tracking-[0.15em] text-slate-600" style={{ fontFamily: '"DM Sans", sans-serif' }}>
                  {TIER_LABELS[tier]} <span className="font-normal text-slate-700">/ {tierRows.length} goods</span>
                </div>

                <div className="overflow-hidden rounded-lg border border-white/[0.05] bg-white/[0.018]">
                  {tierRows.map((row) => {
                    const def = COMMODITY_DEFS[row.commodity];
                    const isSelected = row.commodity === selected.commodity;
                    const signal = getSignalLabel(row.signal);
                    const role = getRoleLabel(row.role);
                    const isUnknown = row.knowledgeLevel === 0;
                    const isMastered = row.knowledgeLevel >= 2;
                    const image = getCommodityImage(row.commodity);
                    const meterPct = Math.round(clamp(row.ratio / 2, 0.06, 1) * 100);

                    return (
                      <button
                        key={row.commodity}
                        data-testid={`market-row-${commodityTestId(row.commodity)}`}
                        type="button"
                        aria-selected={isSelected}
                        onMouseEnter={() => sfxHover()}
                        onClick={() => {
                          sfxClick();
                          setSelectedCommodity(row.commodity);
                          setQuantity(Math.min(Math.max(quantity, 1), Math.max(row.maxBuy, row.maxSell, 1)));
                        }}
                        className={`group grid min-h-[72px] w-full grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-white/[0.04] px-3 py-2 text-left transition-all last:border-b-0 md:grid-cols-[minmax(220px,1.7fr)_58px_58px_78px_62px_62px] md:items-center ${
                          isSelected ? 'bg-white/[0.045] shadow-[inset_2px_0_0_rgba(201,168,76,0.7)]' : 'bg-transparent hover:bg-white/[0.03]'
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          {image ? (
                            <span
                              className={`flex h-[52px] w-[52px] shrink-0 items-center justify-center overflow-hidden rounded-lg border transition-all duration-200 ${
                                isUnknown
                                  ? 'border-amber-400/15 bg-amber-400/[0.04] opacity-65 saturate-50'
                                  : isSelected
                                    ? 'border-white/[0.14] bg-white/[0.05]'
                                    : 'border-white/[0.07] bg-white/[0.03] group-hover:border-white/[0.12] group-hover:bg-white/[0.05]'
                              }`}
                              style={isSelected ? { boxShadow: `inset 0 0 0 1px ${def.color}40, 0 0 12px ${def.color}25` } : undefined}
                            >
                              <img
                                src={image}
                                alt=""
                                className={`h-[110%] w-[110%] object-cover transition-transform duration-200 ${isSelected ? 'scale-[1.05]' : 'group-hover:scale-[1.14]'}`}
                              />
                            </span>
                          ) : (
                            <span
                              className={`flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-lg border text-xl transition-colors duration-200 ${
                                isUnknown
                                  ? 'border-amber-400/15 bg-amber-400/[0.05]'
                                  : isSelected
                                    ? 'border-white/[0.14] bg-white/[0.05]'
                                    : 'border-white/[0.07] bg-white/[0.03] group-hover:border-white/[0.12]'
                              }`}
                              style={{ color: isUnknown ? '#d4a054' : def.color }}
                            >
                              {def.icon}
                            </span>
                          )}
                          <span className="min-w-0">
                            <span
                              className={`block text-[15px] leading-tight ${
                                isUnknown
                                  ? 'font-medium italic text-amber-500/80 line-clamp-2'
                                  : `truncate font-bold ${isMastered ? 'text-emerald-200' : 'text-slate-200'}`
                              }`}
                              style={{ fontFamily: '"Fraunces", serif' }}
                            >
                              {row.displayName}
                            </span>
                            <span className="mt-1 flex flex-wrap items-center gap-1.5">
                              {isUnknown ? (
                                <span className="rounded-full border border-amber-400/20 bg-amber-400/[0.08] px-2 py-[3px] text-[10px] font-bold uppercase tracking-[0.12em] text-amber-300" style={{ fontFamily: '"DM Sans", sans-serif' }}>
                                  Unknown
                                </span>
                              ) : (
                                <>
                                  <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500" style={{ fontFamily: '"DM Sans", sans-serif' }}>
                                    {role.label}
                                  </span>
                                  {isMastered && (
                                    <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-300" style={{ fontFamily: '"DM Sans", sans-serif' }}>
                                      Mastered
                                    </span>
                                  )}
                                </>
                              )}
                              <span className="hidden truncate text-[10px] text-slate-600 sm:inline" style={{ fontFamily: '"DM Sans", sans-serif' }}>
                                {isUnknown ? 'You do not recognize this good.' : def.description}
                              </span>
                            </span>
                          </span>
                        </span>

                        <span className="text-right font-mono text-[13px] font-bold text-slate-200 md:text-[15px]">
                          <span className="md:hidden">
                            <span className="block">Buy {marketPrice(row, 'buy')}</span>
                            <span className="mt-0.5 block text-slate-500">Sell {marketPrice(row, 'sell')}</span>
                          </span>
                          <span className="hidden md:inline">{marketPrice(row, 'buy')}</span>
                        </span>

                        <span className="hidden text-right font-mono text-[15px] font-bold text-slate-200 md:block">
                          {marketPrice(row, 'sell')}
                        </span>

                        <span className="hidden md:block">
                          <span className={`inline-flex min-w-[64px] justify-center rounded-full border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] ${signal.className}`} style={{ fontFamily: '"DM Sans", sans-serif' }}>
                            {signal.label}
                          </span>
                          <span className="mt-1 block h-[3px] overflow-hidden rounded-full bg-white/[0.06]">
                            <span className={`block h-full rounded-full ${row.signal === 'low' ? 'bg-emerald-400/45' : row.signal === 'high' ? 'bg-red-400/40' : 'bg-slate-500/35'}`} style={{ width: `${meterPct}%` }} />
                          </span>
                        </span>

                        <span className="hidden text-right md:block">
                          <span className="font-mono text-[15px] font-bold text-slate-300">{row.playerInv}</span>
                          <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400" style={{ fontFamily: '"DM Sans", sans-serif' }}>you</span>
                        </span>

                        <span className="hidden text-right md:block">
                          <span className="font-mono text-[15px] font-bold text-slate-300">{row.portInv}</span>
                          <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400" style={{ fontFamily: '"DM Sans", sans-serif' }}>port</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <aside className={`hidden rounded-lg border p-4 md:block ${selected.knowledgeLevel === 0 ? 'border-amber-400/15 bg-amber-950/[0.15]' : 'border-white/[0.05] bg-white/[0.018]'}`}>
        <div className="flex items-start gap-4">
          {selectedImage ? (
            <span
              className={`relative flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl border ${
                selected.knowledgeLevel === 0
                  ? 'border-amber-400/15 opacity-65 saturate-50'
                  : 'border-white/[0.08]'
              }`}
              style={
                selected.knowledgeLevel === 0
                  ? undefined
                  : {
                      background: `radial-gradient(circle at 32% 28%, color-mix(in srgb, ${selectedDef.color} 18%, #ece2cc) 0%, color-mix(in srgb, ${selectedDef.color} 10%, #c8bea7) 70%, color-mix(in srgb, ${selectedDef.color} 6%, #a89e88) 100%)`,
                      boxShadow: `inset 0 1px 1px rgba(255,255,255,0.25), inset 0 -2px 6px rgba(0,0,0,0.18), 0 2px 12px rgba(0,0,0,0.25), 0 0 24px ${selectedDef.color}1f`,
                    }
              }
            >
              <img src={selectedImage} alt="" className="h-[116%] w-[116%] object-cover" />
              {selected.knowledgeLevel !== 0 && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-[inherit]"
                  style={{ boxShadow: `inset 0 0 0 1px ${selectedDef.color}30, inset 0 0 0 2px rgba(255,255,255,0.05)` }}
                />
              )}
            </span>
          ) : (
            <div className={`flex h-28 w-28 shrink-0 items-center justify-center rounded-xl border text-4xl ${selected.knowledgeLevel === 0 ? 'border-amber-400/15 bg-amber-400/[0.05]' : 'border-white/[0.08] bg-white/[0.025]'}`} style={{ color: selected.knowledgeLevel === 0 ? '#d4a054' : selectedDef.color }}>
              {selectedDef.icon}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h3 className={`mt-1 text-xl font-bold leading-tight ${selected.knowledgeLevel === 0 ? 'italic text-amber-200/70' : selected.knowledgeLevel >= 2 ? 'text-emerald-200' : 'text-slate-100'}`} style={{ fontFamily: '"Fraunces", serif' }}>
              {selected.displayName}
            </h3>
            <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500" style={{ fontFamily: '"DM Sans", sans-serif' }}>
              {selected.knowledgeLevel === 0
                ? 'Unidentified'
                : `${selectedRole.label} · ${selectedSignal.label}${selected.knowledgeLevel >= 2 ? ' · Mastered' : ''}`}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[12px] text-slate-400">
              <span>Buy {marketPrice(selected, 'buy')}</span>
              <span>Sell {marketPrice(selected, 'sell')}</span>
              <span>You {selected.playerInv}</span>
              <span>Port {selected.portInv}</span>
            </div>
          </div>
        </div>

        <p className="mt-4 text-[15px] leading-relaxed text-slate-400" style={{ fontFamily: '"Fraunces", serif', fontStyle: 'italic' }}>
          {selected.knowledgeLevel === 0
            ? 'You do not recognize this substance. Buying it is a gamble — it could be worthless, or extraordinarily valuable.'
            : selected.knowledgeLevel >= 2
              ? `${selectedDef.description} You know the best markets for this good.`
              : selectedDef.description
          }
        </p>
        {selected.knowledgeLevel === 0 && (MARKET_TRUST[port.id] ?? 0.5) < 0.5 && (
          <p className="mt-2 text-[12px] leading-relaxed text-amber-500/80" style={{ fontFamily: '"Fraunces", serif', fontStyle: 'italic' }}>
            Risk: counterfeits reported in this market.
          </p>
        )}

        <div className="mt-3 h-[4px] overflow-hidden rounded-full bg-white/[0.06]">
          <div className={`h-full rounded-full ${selected.signal === 'low' ? 'bg-emerald-400/45' : selected.signal === 'high' ? 'bg-red-400/40' : 'bg-slate-500/35'}`} style={{ width: `${priceMeterPct}%` }} />
        </div>
        <div className="mt-1 flex justify-between text-[9px] font-bold uppercase tracking-[0.12em] text-slate-700" style={{ fontFamily: '"DM Sans", sans-serif' }}>
          <span>Cheap</span>
          {selected.knowledgeLevel >= 1
            ? <span>Average {Math.round(selected.avg)}g</span>
            : <span>You cannot judge the fair price</span>
          }
          <span>Dear</span>
        </div>

        <div className="mt-4 grid grid-cols-[36px_minmax(0,1fr)_36px_50px] gap-2">
          <button
            type="button"
            aria-label="Decrease quantity"
            disabled={clampedQuantity <= 1}
            onClick={() => { sfxClick(); setQuantity(q => clamp(q - 1, 1, maxSelectedQuantity)); }}
            className="h-9 rounded-md border border-white/[0.06] bg-white/[0.025] text-base font-bold text-slate-300 transition-colors hover:bg-white/[0.055] disabled:cursor-not-allowed disabled:text-slate-700 disabled:hover:bg-white/[0.025]"
          >
            -
          </button>
          <div className="flex h-9 items-center justify-center rounded-md border border-white/[0.07] bg-white/[0.025] text-center font-mono text-[15px] font-bold text-slate-100">
            {clampedQuantity} {quantityUnit(clampedQuantity)}
          </div>
          <button
            type="button"
            aria-label="Increase quantity"
            disabled={clampedQuantity >= maxSelectedQuantity}
            onClick={() => { sfxClick(); setQuantity(q => clamp(q + 1, 1, maxSelectedQuantity)); }}
            className="h-9 rounded-md border border-white/[0.06] bg-white/[0.025] text-base font-bold text-slate-300 transition-colors hover:bg-white/[0.055] disabled:cursor-not-allowed disabled:text-slate-700 disabled:hover:bg-white/[0.025]"
          >
            +
          </button>
          <button
            type="button"
            disabled={clampedQuantity >= maxSelectedQuantity}
            onClick={() => { sfxClick(); setQuantity(maxSelectedQuantity); }}
            className="h-9 rounded-md border border-white/[0.06] bg-white/[0.025] text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400 transition-colors hover:bg-white/[0.055] hover:text-slate-200 disabled:cursor-not-allowed disabled:text-slate-700 disabled:hover:bg-white/[0.025]"
            style={{ fontFamily: '"DM Sans", sans-serif' }}
          >
            Max
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 text-[11px]" style={{ fontFamily: '"DM Sans", sans-serif' }}>
          <div>
            <div className="font-bold uppercase tracking-[0.14em] text-slate-600">Sell</div>
            <div className="mt-1 font-mono text-[14px] font-bold text-slate-200">
              {sellQty > 0 ? `${sellQty} ${quantityUnit(sellQty)} for ${formatPrice(sellTotal)}` : 'Unavailable'}
            </div>
            <div className="mt-1 font-mono text-slate-500">After sale {holdAfterSell}/{cargoCapacity}</div>
          </div>
          <div>
            <div className="font-bold uppercase tracking-[0.14em] text-slate-600">Buy</div>
            <div className="mt-1 font-mono text-[14px] font-bold text-slate-200">
              {buyQty > 0 ? `${buyQty} ${quantityUnit(buyQty)} for ${formatPrice(buyTotal)}` : 'Unavailable'}
            </div>
            <div className={holdAfterBuy > cargoCapacity ? 'mt-1 font-mono text-red-400' : 'mt-1 font-mono text-slate-500'}>
              After purchase {holdAfterBuy}/{cargoCapacity}
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            data-testid="market-sell-button"
            type="button"
            disabled={sellQty <= 0}
            onClick={() => executeTrade(false)}
            className="h-10 rounded-md border border-amber-300/25 bg-amber-300/[0.08] text-[11px] font-bold uppercase tracking-[0.14em] text-amber-100/85 transition-colors hover:bg-amber-300/[0.12] active:scale-[0.99] disabled:cursor-not-allowed disabled:border-white/[0.04] disabled:bg-white/[0.015] disabled:text-slate-700 disabled:hover:bg-white/[0.015]"
            style={{ fontFamily: '"DM Sans", sans-serif' }}
          >
            Sell {sellQty}
          </button>
          <button
            data-testid="market-buy-button"
            type="button"
            disabled={buyQty <= 0}
            onClick={() => executeTrade(true)}
            className="h-10 rounded-md border border-emerald-300/25 bg-emerald-300/[0.08] text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-100/85 transition-colors hover:bg-emerald-300/[0.12] active:scale-[0.99] disabled:cursor-not-allowed disabled:border-white/[0.04] disabled:bg-white/[0.015] disabled:text-slate-700 disabled:hover:bg-white/[0.015]"
            style={{ fontFamily: '"DM Sans", sans-serif' }}
          >
            Buy {buyQty}
          </button>
        </div>
      </aside>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore, type CargoStack, type Port } from '../store/gameStore';
import type { NPCShipIdentity } from '../utils/npcShipGenerator';
import { COMMODITY_DEFS, type Commodity } from '../utils/commodities';
import { ConfigPortrait, tavernNpcToPortraitConfig } from './CrewPortrait';
import { FactionFlag } from './FactionFlag';
import { sfxClick, sfxHover } from '../audio/SoundEffects';
import { floatingPanelMotion } from '../utils/uiMotion';
import { getLiveShipTransform } from '../utils/livePlayerTransform';
import { useIsMobile } from '../utils/useIsMobile';
import {
  BARTER_CANDIDATE_POOL,
  DEFAULT_BARTER_QTY,
  LANGUAGE_COLOR,
  UNTRANSLATED_HAIL,
  bearingFromTo,
  buildImpression,
  commodityUnitValue,
  dominantCommodity,
  getBarterCounterOffer,
  getBarterDialogue,
  getHailGreeting,
  getHailMood,
  getHailMoodColor,
  hasAwardedTranslation,
  markAwardedTranslation,
  pickStable,
  pickTranslator,
  type BarterCounterOffer,
  type HailAction,
  type HailMood,
} from '../utils/hail';

void BARTER_CANDIDATE_POOL; // re-exported for tests

const DISPOSITION_PILL_W = 22;
const DISPOSITION_GAP = 3;

function DispositionBar({ mood }: { mood: HailMood }) {
  const buckets: HailMood[] = ['HOSTILE', 'COLD', 'WARY', 'CORDIAL', 'WARM'];
  const idx = buckets.indexOf(mood);
  const moodColor = getHailMoodColor(mood);
  const targetX = idx * (DISPOSITION_PILL_W + DISPOSITION_GAP);
  const trackWidth = buckets.length * DISPOSITION_PILL_W + (buckets.length - 1) * DISPOSITION_GAP;

  return (
    <div
      className="flex flex-col items-end gap-1.5"
      style={{ fontFamily: '"DM Sans", sans-serif' }}
    >
      <div
        className="relative"
        style={{ width: trackWidth, height: 6 }}
      >
        {/* dim background track */}
        <div className="absolute inset-0 flex items-center gap-[3px]">
          {buckets.map((b) => (
            <div
              key={b}
              className="h-[4px] w-[22px] rounded-full bg-[#2a2d36]"
            />
          ))}
        </div>
        {/* active indicator — springs from left and overshoots to its bucket */}
        <motion.div
          className="absolute rounded-full"
          style={{
            width: DISPOSITION_PILL_W,
            height: 5,
            top: 0.5,
            backgroundColor: moodColor,
            boxShadow: `0 0 12px ${moodColor}a0, 0 0 3px ${moodColor}`,
          }}
          initial={{ x: -DISPOSITION_PILL_W, opacity: 0, scaleY: 0.6 }}
          animate={{ x: targetX, opacity: 1, scaleY: 1.25 }}
          transition={{
            x: { type: 'spring', stiffness: 180, damping: 11, mass: 1, delay: 0.22 },
            opacity: { duration: 0.25, delay: 0.22 },
            scaleY: { duration: 0.45, delay: 0.22 },
          }}
        />
      </div>
      <motion.span
        initial={{ opacity: 0, y: -2 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55, duration: 0.32 }}
        className="font-mono text-[9.5px] uppercase tracking-[0.22em] font-semibold"
        style={{ color: moodColor, textShadow: `0 0 6px ${moodColor}40` }}
      >
        {mood.toLowerCase()}
      </motion.span>
    </div>
  );
}

type HailActionEntry = {
  id: HailAction;
  label: string;
  detail?: string;
};

function BarterTray({
  playerHeld,
  yourGood,
  yourQty,
  counterOffer,
  canAccept,
  onPickGood,
  onChangeQty,
  onAccept,
  onCancel,
}: {
  playerHeld: [Commodity, number][];
  yourGood: Commodity | null;
  yourQty: number;
  counterOffer: BarterCounterOffer | null;
  canAccept: boolean;
  onPickGood: (c: Commodity) => void;
  onChangeQty: (delta: number) => void;
  onAccept: () => void;
  onCancel: () => void;
}) {
  const yourDef = yourGood ? COMMODITY_DEFS[yourGood] : null;
  const theirDef = counterOffer ? COMMODITY_DEFS[counterOffer.theirGood] : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="mx-5 mt-4 mb-1 rounded-xl border border-[#2a2d3a]/60 bg-[#0a0e18]/60 p-4"
      style={{ fontFamily: '"DM Sans", sans-serif' }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-[9.5px] font-bold uppercase tracking-[0.2em] text-slate-500">
          Barter
        </span>
        <span className="text-[9.5px] font-bold uppercase tracking-[0.18em]" style={{ color: '#e2c87a' }}>
          pick from your hold
        </span>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-3">
        <div
          className="rounded-lg border bg-[#07090f] p-3 flex flex-col gap-2"
          style={{ borderColor: yourGood ? `${yourDef!.color}55` : 'rgba(42,45,58,0.5)' }}
        >
          <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500">
            You offer
          </div>
          {yourGood && yourDef ? (
            <>
              <div className="flex items-center gap-2">
                <span className="text-[20px] leading-none select-none" title={yourGood}>
                  {yourDef.icon}
                </span>
                <span
                  className="text-[13px] font-semibold truncate"
                  style={{ color: yourDef.color }}
                >
                  {yourGood}
                </span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <button
                  onClick={() => onChangeQty(-1)}
                  disabled={yourQty <= 1}
                  className="w-7 h-7 rounded-md border border-white/10 bg-white/[0.03] text-slate-300 hover:text-amber-300 hover:border-amber-400/40 hover:bg-amber-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-mono text-[13px] leading-none"
                >
                  −
                </button>
                <span className="font-mono tabular-nums text-[15px] font-bold text-slate-100">
                  {yourQty}
                </span>
                <button
                  onClick={() => onChangeQty(1)}
                  className="w-7 h-7 rounded-md border border-white/10 bg-white/[0.03] text-slate-300 hover:text-amber-300 hover:border-amber-400/40 hover:bg-amber-500/10 transition-colors font-mono text-[13px] leading-none"
                >
                  +
                </button>
              </div>
            </>
          ) : (
            <div className="text-[11px] italic text-slate-600 py-2">
              {playerHeld.length === 0 ? 'your hold is empty' : 'pick a commodity below'}
            </div>
          )}
        </div>

        <div className="flex items-center justify-center px-1">
          <span
            className="text-[22px] leading-none select-none"
            style={{ color: counterOffer ? '#e2c87a' : '#3a3f4d' }}
          >
            ⇄
          </span>
        </div>

        <div
          className="rounded-lg border bg-[#07090f] p-3 flex flex-col gap-2"
          style={{ borderColor: counterOffer ? `${theirDef!.color}55` : 'rgba(42,45,58,0.5)' }}
        >
          <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500">
            They offer
          </div>
          <AnimatePresence mode="wait">
            {counterOffer && theirDef ? (
              <motion.div
                key={counterOffer.theirGood}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.22 }}
                className="flex flex-col gap-2"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[20px] leading-none select-none" title={counterOffer.theirGood}>
                    {theirDef.icon}
                  </span>
                  <span
                    className="text-[13px] font-semibold truncate"
                    style={{ color: theirDef.color }}
                  >
                    {counterOffer.theirGood}
                  </span>
                </div>
                <div className="flex items-center justify-center mt-1">
                  <span className="font-mono tabular-nums text-[15px] font-bold text-slate-100">
                    {counterOffer.theirQty}
                  </span>
                  <span className="ml-1.5 text-[10px] text-slate-500 uppercase tracking-[0.15em]">
                    units
                  </span>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-[11px] italic text-slate-600 py-2 text-center"
              >
                {yourGood ? 'they have nothing to spare' : '…awaiting your offer'}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {playerHeld.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {playerHeld.map(([c, qty]) => {
            const def = COMMODITY_DEFS[c];
            const active = c === yourGood;
            return (
              <button
                key={c}
                onClick={() => onPickGood(c)}
                onMouseEnter={() => sfxHover()}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] transition-all"
                style={{
                  borderColor: active ? def.color : 'rgba(255,255,255,0.08)',
                  backgroundColor: active ? `${def.color}15` : 'rgba(255,255,255,0.02)',
                  color: active ? def.color : '#94a3b8',
                }}
              >
                <span className="text-[13px] leading-none">{def.icon}</span>
                <span className="font-semibold">{c}</span>
                <span className="text-[10px] text-slate-500 tabular-nums">{qty}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          onClick={onCancel}
          className="px-3.5 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400 hover:text-slate-200 transition-colors"
        >
          cancel
        </button>
        <button
          onClick={onAccept}
          disabled={!canAccept}
          className="px-4 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-[0.14em] transition-colors border disabled:opacity-30 disabled:cursor-not-allowed"
          style={{
            color: canAccept ? '#fbbf24' : '#64748b',
            borderColor: canAccept ? 'rgba(251,191,36,0.4)' : 'rgba(100,116,139,0.2)',
            backgroundColor: canAccept ? 'rgba(251,191,36,0.08)' : 'transparent',
          }}
        >
          accept trade
        </button>
      </div>
    </motion.div>
  );
}

export function HailPanel({ npc, onClose }: { npc: NPCShipIdentity; onClose: () => void }) {
  const rep = useGameStore((state) => state.getReputation(npc.flag));
  const cargo = useGameStore((state) => state.cargo);
  const crew = useGameStore((state) => state.crew);
  const cargoCapacity = useGameStore((state) => state.stats.cargoCapacity);
  const { isMobile } = useIsMobile();

  // Auto-close if the NPC is destroyed or leaves the active set.
  const npcStillAlive = useGameStore((state) =>
    state.npcShips.some((s) => s.id === npc.id),
  );
  useEffect(() => {
    if (!npcStillAlive) onClose();
  }, [npcStillAlive, onClose]);

  const hailLanguage = npc.hailLanguage ?? 'Portuguese';
  const translator = useMemo(() => pickTranslator(crew, hailLanguage), [crew, hailLanguage]);
  const canUnderstand = Boolean(translator);
  const mood = getHailMood(rep);
  const greeting = useMemo(() => getHailGreeting(npc, mood), [npc, mood]);
  const impression = useMemo(() => buildImpression(npc, mood), [npc, mood]);
  const languageColor = LANGUAGE_COLOR[hailLanguage] ?? '#e2c87a';

  const playerHeld = useMemo(
    () => (Object.entries(cargo) as [Commodity, number][])
      .filter(([c, qty]) => qty > 0 && c !== 'War Rockets'),
    [cargo],
  );

  const captainPortrait = useMemo(
    () => tavernNpcToPortraitConfig({
      id: npc.id,
      name: npc.captainName,
      nationality: npc.flag,
      isFemale: false,
      roleTitle: 'factor',
    }),
    [npc.id, npc.captainName, npc.flag],
  );

  const [used, setUsed] = useState<Record<string, boolean>>({});
  const [result, setResult] = useState<{ tone: 'good' | 'warn' | 'neutral'; text: string; impact?: string } | null>(null);
  const [barterMode, setBarterMode] = useState<{ yourGood: Commodity | null; yourQty: number } | null>(null);

  const counterOffer = useMemo(() => {
    if (!barterMode?.yourGood) return null;
    return getBarterCounterOffer(npc, barterMode.yourGood, barterMode.yourQty, mood);
  }, [npc, barterMode, mood]);

  const barterDialogue = useMemo(() => {
    if (!barterMode) return null;
    return getBarterDialogue(mood, barterMode.yourGood, barterMode.yourQty, counterOffer);
  }, [mood, barterMode, counterOffer]);

  // Award translation XP/rep exactly once per NPC per session.
  // Previously lived in a component-local ref, which reset on every reopen
  // and let the player farm reputation by pressing T repeatedly.
  const [xpChipVisible, setXpChipVisible] = useState(false);
  useEffect(() => {
    if (!translator) return;
    if (hasAwardedTranslation(npc.id)) return;
    markAwardedTranslation(npc.id);
    setXpChipVisible(true);

    useGameStore.getState().adjustReputation(npc.flag, 1);
    useGameStore.setState((state) => ({
      crew: state.crew.map((member) => member.id === translator.id
        ? {
            ...member,
            xp: member.xp + 1,
            history: [
              ...member.history,
              { day: state.dayCount, event: `Translated ${hailLanguage} during a hail with a ${npc.flag} ${npc.shipType}` },
            ],
          }
        : member
      ),
    }));
    const timer = setTimeout(() => setXpChipVisible(false), 2400);
    return () => clearTimeout(timer);
  }, [hailLanguage, npc.id, npc.flag, npc.shipType, translator]);

  const canBarter = canUnderstand && mood !== 'HOSTILE' && mood !== 'COLD'
    && dominantCommodity(npc.cargo) !== null;
  const barterDetail = useMemo(() => {
    if (!canBarter) return undefined;
    return playerHeld.length > 0 ? 'open the trade' : 'your hold is empty';
  }, [canBarter, playerHeld.length]);

  const availableActions = useMemo<HailActionEntry[]>(() => {
    const entries: (HailActionEntry | null)[] = [
      canUnderstand && !used.news ? { id: 'news', label: 'ask what news he carries' } : null,
      canBarter && !used.trade ? { id: 'trade', label: 'barter cargo', detail: barterDetail } : null,
      canUnderstand && !used.bearing ? { id: 'bearing', label: 'ask bearing to nearest port' } : null,
    ];
    return entries.filter((e): e is HailActionEntry => e !== null);
  }, [canBarter, canUnderstand, used, barterDetail]);

  const resolveAction = useCallback((action: HailAction) => {
    sfxClick();
    const state = useGameStore.getState();

    if (action === 'leave') {
      onClose();
      return;
    }

    if (!canUnderstand) return;
    setXpChipVisible(false);

    if (action === 'news') {
      const news = pickStable([
        `${npc.flag} captains report patrols searching holds near the next busy anchorage.`,
        `A damaged trader was seen drifting downwind before dawn. Gulls marked the water behind her.`,
        `Fresh water is dear along this coast. Captains are paying hard coin for sound casks.`,
        `Two armed sails were seen shadowing merchantmen beyond the headland.`,
        `The monsoon has been holding steady. Fast passages favor captains who trim their canvas cleanly.`,
      ], npc.id + state.dayCount + 'news');
      state.addJournalEntry('encounter', `Hailed the ${npc.shipName}: ${news}`);
      setUsed((prev) => ({ ...prev, news: true }));
      setResult({ tone: 'good', text: news, impact: '+ journal updated' });
      return;
    }

    if (action === 'bearing') {
      const shipPos = getLiveShipTransform().pos;
      const byDistance = (a: Port, b: Port) => {
        const adx = a.position[0] - shipPos[0];
        const adz = a.position[2] - shipPos[2];
        const bdx = b.position[0] - shipPos[0];
        const bdz = b.position[2] - shipPos[2];
        return adx * adx + adz * adz - (bdx * bdx + bdz * bdz);
      };
      const target = state.ports
        .filter((port) => !state.discoveredPorts.includes(port.id))
        .sort(byDistance)[0] ?? state.ports
        .filter((port) => port.id !== state.currentWorldPortId)
        .sort(byDistance)[0];

      if (!target) {
        setResult({ tone: 'neutral', text: `No useful bearing. Only open water from here.` });
        return;
      }

      const bearing = bearingFromTo(shipPos, target.position);
      const line = `They mark ${target.name} ${bearing} by their reckoning.`;
      state.addJournalEntry('navigation', `Bearing from the ${npc.shipName}: ${target.name} lies ${bearing}.`, target.name);
      setUsed((prev) => ({ ...prev, bearing: true }));
      setResult({ tone: 'good', text: line, impact: '+ bearing noted' });
      return;
    }

    if (action === 'trade') {
      if (!canBarter) {
        setResult({ tone: 'warn', text: `Not today. Keep clear.` });
        return;
      }
      const firstGood = playerHeld[0]?.[0] ?? null;
      const firstQty = firstGood ? Math.min(playerHeld[0][1], DEFAULT_BARTER_QTY) : 0;
      setBarterMode({ yourGood: firstGood, yourQty: firstQty });
      setResult(null);
    }
  }, [canBarter, canUnderstand, npc, onClose, playerHeld]);

  const cancelBarter = useCallback(() => {
    sfxClick();
    setBarterMode(null);
  }, []);

  const acceptBarter = useCallback(() => {
    if (!barterMode?.yourGood || !counterOffer) return;
    sfxClick();
    const state = useGameStore.getState();
    const { yourGood, yourQty } = barterMode;
    const { theirGood, theirQty } = counterOffer;

    if ((state.cargo[yourGood] ?? 0) < yourQty) {
      setResult({ tone: 'warn', text: `You no longer carry enough ${yourGood}.` });
      setBarterMode(null);
      return;
    }

    const theirDef = COMMODITY_DEFS[theirGood];
    const yourDef = COMMODITY_DEFS[yourGood];
    const currentWeight = (Object.entries(state.cargo) as [Commodity, number][])
      .reduce((sum, [c, qty]) => sum + qty * COMMODITY_DEFS[c].weight, 0);
    const projected = currentWeight - yourDef.weight * yourQty + theirDef.weight * theirQty;
    if (projected > cargoCapacity) {
      setResult({ tone: 'warn', text: `No room in your hold for what they'd trade.` });
      setBarterMode(null);
      return;
    }

    const stack: CargoStack = {
      id: Math.random().toString(36).substring(2, 9),
      commodity: theirGood,
      actualCommodity: theirGood,
      amount: theirQty,
      acquiredPort: `ship:${npc.id}`,
      acquiredPortName: `the ${npc.shipName}`,
      acquiredDay: state.dayCount,
      purchasePrice: Math.round(commodityUnitValue(theirGood)),
      knowledgeAtPurchase: 1,
    };

    useGameStore.setState((prev) => {
      const nextCargo = { ...prev.cargo };
      nextCargo[theirGood] = (nextCargo[theirGood] ?? 0) + theirQty;
      nextCargo[yourGood] = (nextCargo[yourGood] ?? 0) - yourQty;
      return {
        cargo: nextCargo,
        cargoProvenance: [...prev.cargoProvenance, stack],
      };
    });

    const impactText = `+${theirQty} ${theirGood} · −${yourQty} ${yourGood}`;
    state.addJournalEntry('commerce', `Bartered with the ${npc.shipName}: ${impactText}.`);
    setUsed((prev) => ({ ...prev, trade: true }));
    setResult({
      tone: 'good',
      text: `Fair trade. May your passage be smooth.`,
      impact: impactText,
    });
    setBarterMode(null);
  }, [barterMode, counterOffer, cargoCapacity, npc]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (barterMode) {
          cancelBarter();
          return;
        }
        onClose();
        return;
      }
      if (barterMode) return;
      const idx = Number(e.key) - 1;
      if (!Number.isInteger(idx) || idx < 0 || idx >= availableActions.length) return;
      e.preventDefault();
      resolveAction(availableActions[idx].id);
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [availableActions, onClose, resolveAction, barterMode, cancelBarter]);

  const resultColor = result?.tone === 'warn' ? '#f59e0b' : result?.tone === 'good' ? '#86efac' : '#cbd5e1';
  const spokenText = barterMode && canUnderstand && barterDialogue
    ? barterDialogue
    : canUnderstand
    ? (result ? result.text : greeting)
    : UNTRANSLATED_HAIL[hailLanguage];

  // The captain's name is only legible once someone aboard can translate.
  // Without a translator the master is a stranger at shouting distance.
  const captainKnown = canUnderstand;

  return (
    <motion.div
      {...floatingPanelMotion}
      className={isMobile
        ? 'absolute bottom-24 left-1/2 z-40 w-[min(580px,calc(100vw-2rem))] -translate-x-1/2 pointer-events-auto'
        : 'absolute bottom-24 left-1/2 z-40 w-[min(880px,calc(100vw-3rem))] -translate-x-1/2 pointer-events-auto'}
    >
      <div
        className="bg-[#0a0e18]/92 backdrop-blur-xl border border-[#2a2d3a]/55 rounded-2xl overflow-hidden"
        style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)' }}
      >
        {/* ── HEADER BAR ─────────────────────────────────── */}
        <div className="flex items-center justify-between gap-4 px-5 pt-4 pb-3 border-b border-[#2a2d3a]/40">
          <div className="flex items-center gap-2.5 min-w-0">
            <FactionFlag nationality={npc.flag} size={13} />
            <span
              className="font-bold text-[10px] uppercase tracking-[0.18em] text-slate-400"
              style={{ fontFamily: '"DM Sans", sans-serif' }}
            >
              Hail
            </span>
            <span className="h-3 w-px bg-[#2a2d3a]" />
            <span
              className="font-bold text-[10px] uppercase tracking-[0.14em] text-amber-200/80 truncate"
              style={{ fontFamily: '"DM Sans", sans-serif' }}
            >
              {npc.flag} {npc.shipType}
            </span>
          </div>
          <DispositionBar mood={mood} />
        </div>

        {/* ── BODY ──
             Desktop: two columns (portrait/impression | dialogue/actions).
             Mobile:  single stacked column, as before. */}
        <div className={isMobile ? '' : 'grid grid-cols-[232px_1fr]'}>

        {/* ── LEFT COL: portrait + impression ─────────────── */}
        <div className={isMobile
          ? 'flex items-start gap-4 px-5 pt-4'
          : 'flex flex-col items-center gap-3 px-5 pt-5 pb-4 border-r border-[#2a2d3a]/40'}>
          <motion.div
            className="shrink-0 rounded-lg overflow-hidden bg-[#0a0e18] cursor-default"
            style={{
              border: '1px solid rgba(226,200,122,0.22)',
              boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.4), 0 2px 10px rgba(0,0,0,0.4)',
              width: isMobile ? 72 : 96,
              height: isMobile ? 72 : 96,
              transformOrigin: 'center',
            }}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.38, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            whileHover={{
              scale: 1.08,
              boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.4), 0 6px 22px rgba(226,200,122,0.25)',
              transition: { type: 'spring', stiffness: 260, damping: 18 },
            }}
          >
            <ConfigPortrait config={captainPortrait} size={isMobile ? 72 : 96} square showBackground />
          </motion.div>
          <motion.div
            className={isMobile
              ? 'flex-1 min-w-0 text-[13.5px] leading-[1.55] text-slate-300 italic'
              : 'w-full text-[12.5px] leading-[1.55] text-slate-300 italic text-center'}
            style={{ fontFamily: '"Fraunces", serif' }}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.18 }}
          >
            <div>{impression.sight}</div>
            <div className="mt-1 text-slate-400/90">{impression.posture}</div>
          </motion.div>
        </div>

        {/* ── RIGHT COL: speech + translator + actions ────── */}
        <div className={isMobile ? '' : 'flex flex-col min-w-0'}>

        {/* ── SPEECH ─────────────────────────────────────── */}
        <motion.div
          className={isMobile ? 'px-5 pt-4' : 'px-5 pt-5'}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.32 }}
        >
          <div
            className="pl-4 relative"
            style={{ borderLeft: `2px solid ${result?.tone === 'warn' ? 'rgba(245,158,11,0.35)' : 'rgba(226,200,122,0.35)'}` }}
          >
            <div
              className={canUnderstand
                ? 'text-[17px] leading-[1.55] text-slate-50'
                : 'text-[17px] leading-[1.7] text-slate-200 italic'}
              style={{ fontFamily: '"Fraunces", serif', fontWeight: 400 }}
            >
              <span
                aria-hidden
                className="text-slate-400/35"
                style={{
                  fontSize: '1.6em',
                  lineHeight: 0,
                  marginRight: '0.28em',
                  verticalAlign: '-0.18em',
                  fontFamily: '"Fraunces", serif',
                }}
              >
                “
              </span>
              {spokenText}
              <span
                aria-hidden
                className="text-slate-400/35"
                style={{
                  fontSize: '1.6em',
                  lineHeight: 0,
                  marginLeft: '0.28em',
                  verticalAlign: '-0.32em',
                  fontFamily: '"Fraunces", serif',
                }}
              >
                ”
              </span>
            </div>
            {captainKnown && !barterMode && !result && (
              <motion.div
                className="mt-2 text-[11.5px] text-slate-500"
                style={{ fontFamily: '"Fraunces", serif', fontStyle: 'italic' }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.7 }}
              >
                — Capt. {npc.captainName}
              </motion.div>
            )}
          </div>
        </motion.div>

        {/* ── TRANSLATOR / STATUS LINE ───────────────────── */}
        <motion.div
          className="px-5 pt-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.55 }}
        >
          {canUnderstand && translator ? (
            <div
              className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-slate-400"
              style={{ fontFamily: '"DM Sans", sans-serif' }}
            >
              <span>Your crewman</span>
              <span className="font-semibold" style={{ color: '#9ec89f' }}>{translator.name}</span>
              <span>speaks</span>
              <span className="font-semibold" style={{ color: languageColor }}>{hailLanguage}</span>
              <span className="text-slate-500">— translating.</span>
              <AnimatePresence mode="wait">
                {result?.impact ? (
                  <motion.span
                    key="impact"
                    initial={{ opacity: 0, y: -2 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="ml-auto inline-flex items-center rounded-sm border px-2 py-[1px] font-mono text-[10px] font-semibold uppercase tracking-[0.12em]"
                    style={{
                      color: resultColor,
                      borderColor: `${resultColor}55`,
                      backgroundColor: `${resultColor}14`,
                    }}
                  >
                    {result.impact}
                  </motion.span>
                ) : xpChipVisible ? (
                  <motion.span
                    key="xp"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.6 } }}
                    transition={{ duration: 0.35, delay: 0.4 }}
                    className="ml-auto inline-flex items-center rounded-sm border border-emerald-400/30 bg-emerald-400/10 px-2 py-[1px] font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-300"
                  >
                    +1 xp
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </div>
          ) : (
            <div
              className="text-[12px] text-amber-300/85 flex items-center gap-1.5"
              style={{ fontFamily: '"DM Sans", sans-serif' }}
            >
              <span>No one aboard speaks</span>
              <span className="font-semibold" style={{ color: languageColor }}>{hailLanguage}</span>
              <span className="text-amber-200/70">— his words pass you by.</span>
            </div>
          )}
        </motion.div>

        {/* ── ACTIONS or BARTER TRAY ─────────────────────── */}
        {barterMode ? (
          <BarterTray
            playerHeld={playerHeld}
            yourGood={barterMode.yourGood}
            yourQty={barterMode.yourQty}
            counterOffer={counterOffer}
            canAccept={Boolean(barterMode.yourGood && counterOffer && (cargo[barterMode.yourGood] ?? 0) >= barterMode.yourQty)}
            onPickGood={(c) => {
              sfxClick();
              const have = cargo[c] ?? 0;
              setBarterMode({ yourGood: c, yourQty: Math.min(have, Math.max(1, barterMode.yourQty)) });
            }}
            onChangeQty={(delta) => {
              if (!barterMode.yourGood) return;
              const have = cargo[barterMode.yourGood] ?? 0;
              const next = Math.max(1, Math.min(have, barterMode.yourQty + delta));
              if (next !== barterMode.yourQty) {
                sfxClick();
                setBarterMode({ ...barterMode, yourQty: next });
              }
            }}
            onAccept={acceptBarter}
            onCancel={cancelBarter}
          />
        ) : availableActions.length > 0 && (
          <div className="px-5 pt-4 pb-1 flex flex-col gap-1.5">
            {availableActions.map((action, index) => (
              <motion.button
                key={action.id}
                onClick={() => resolveAction(action.id)}
                onMouseEnter={() => sfxHover()}
                className="group flex items-baseline gap-3 text-left px-3 py-1.5 -mx-3 rounded-md hover:bg-amber-500/[0.06] transition-colors"
                style={{ fontFamily: '"DM Sans", sans-serif' }}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.32, delay: 0.7 + index * 0.07, ease: [0.22, 1, 0.36, 1] }}
              >
                <span
                  className="font-mono text-[12px] font-bold transition-colors"
                  style={{ color: '#e2c87a' }}
                >
                  {index + 1}
                  <span className="ml-1 text-[10px] text-slate-500 group-hover:text-amber-300 transition-colors">❯</span>
                </span>
                <span className="text-[13px] text-slate-200 group-hover:text-amber-200 transition-colors flex-1">
                  {action.label}
                  {action.detail && (
                    <span className="ml-2 text-[11px] text-slate-500 group-hover:text-amber-300/70 transition-colors">
                      {action.detail}
                    </span>
                  )}
                </span>
              </motion.button>
            ))}
          </div>
        )}

        </div>{/* end right col */}
        </div>{/* end body grid */}

        {/* ── FOOTER ─────────────────────────────────────── */}
        <div className="px-5 pt-3 pb-4 flex justify-end border-t border-[#2a2d3a]/40">
          <button
            onClick={onClose}
            className="group font-bold font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500 hover:text-amber-300 transition-colors"
          >
            sail on
            <span className="ml-2 text-slate-600 group-hover:text-amber-400 transition-colors">[esc]</span>
          </button>
        </div>
      </div>
    </motion.div>
  );
}

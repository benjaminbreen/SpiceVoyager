import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore, type CargoStack, type Port } from '../store/gameStore';
import { PORT_INTEL } from '../utils/portIntel';
import type { NPCShipIdentity } from '../utils/npcShipGenerator';
import { COMMODITY_DEFS, type Commodity } from '../utils/commodities';
import { ConfigPortrait, tavernNpcToPortraitConfig } from './CrewPortrait';
import { FactionFlag } from './FactionFlag';
import { sfxClick, sfxHover } from '../audio/SoundEffects';
import { floatingPanelMotion } from '../utils/uiMotion';
import { useIsMobile } from '../utils/useIsMobile';
import { effectiveFactionReputation, sharesFactionLanguage } from '../utils/factionRelations';
import { COLLISION_REPUTATION_TARGET, type CollisionResponse, type WarningResponse } from '../utils/npcCombat';
import {
  BARTER_CANDIDATE_POOL,
  DEFAULT_BARTER_QTY,
  LANGUAGE_COLOR,
  UNTRANSLATED_HAIL,
  buildImpression,
  commodityUnitValue,
  dominantCommodity,
  getBarterCounterOffer,
  getBarterDialogue,
  getCollisionHail,
  getRememberedCollisionGreeting,
  getHailGreeting,
  getHailMood,
  getHailMoodColor,
  getPortPickerPrompt,
  hasAwardedTranslation,
  markAwardedTranslation,
  pickStable,
  pickTranslator,
  recordCollisionGrievance,
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

export type HailContext = 'normal' | 'collision' | 'warning';

export function HailPanel({ npc, onClose, context = 'normal' }: { npc: NPCShipIdentity; onClose: () => void; context?: HailContext }) {
  const rep = useGameStore((state) => state.getReputation(npc.flag));
  const cargo = useGameStore((state) => state.cargo);
  const crew = useGameStore((state) => state.crew);
  const cargoCapacity = useGameStore((state) => state.stats.cargoCapacity);
  const gold = useGameStore((state) => state.gold);
  const playerFlag = useGameStore((state) => state.ship.flag);
  const timeOfDay = useGameStore((state) => state.timeOfDay);
  const { isMobile } = useIsMobile();

  // Auto-close if the NPC is destroyed or leaves the active set.
  const npcStillAlive = useGameStore((state) =>
    state.npcShips.some((s) => s.id === npc.id),
  );
  useEffect(() => {
    if (!npcStillAlive) onClose();
  }, [npcStillAlive, onClose]);

  const hailLanguage = npc.hailLanguage ?? 'Portuguese';
  const understandsByFaction = sharesFactionLanguage(playerFlag, npc.flag, hailLanguage);
  const translator = useMemo(() => understandsByFaction ? null : pickTranslator(crew, hailLanguage), [crew, hailLanguage, understandsByFaction]);
  const canUnderstand = understandsByFaction || Boolean(translator);
  const effectiveRep = useMemo(() => effectiveFactionReputation(rep, playerFlag, npc.flag), [npc.flag, playerFlag, rep]);
  const baseMood = getHailMood(effectiveRep);
  const [collisionMood, setCollisionMood] = useState<HailMood | null>(context === 'collision' || context === 'warning' ? 'HOSTILE' : null);
  const mood = collisionMood ?? baseMood;
  const rememberedCollisionGreeting = useMemo(
    () => context === 'normal' ? getRememberedCollisionGreeting(npc, canUnderstand) : null,
    [canUnderstand, context, npc],
  );
  const greeting = useMemo(
    () => rememberedCollisionGreeting ?? getHailGreeting(npc, mood, { timeOfDay }),
    [rememberedCollisionGreeting, npc, mood, timeOfDay],
  );
  const collisionGreeting = useMemo(() => getCollisionHail(npc, canUnderstand), [npc, canUnderstand]);
  const warningGreeting = useMemo(() => {
    if (!canUnderstand) return getCollisionHail(npc, false);
    return pickStable([
      `HEAVE OFF AND SHOW YOUR INTENT!! KEEP THAT COURSE AND WE TAKE YOU FOR PREY OR ENEMY!!`,
      `STAND CLEAR!! ALTER COURSE NOW, OR WE WILL MAKE YOU ANSWER FOR IT!!`,
      `YOU ARE TOO CLOSE AND TOO RICHLY LADEN!! TURN AWAY, PAY PASSAGE, OR FACE OUR GUNS!!`,
      `WE KNOW YOUR FLAG. KEEP OFF, OR BY GOD WE OPEN FIRE!!`,
    ], npc.id + 'warning-hail');
  }, [canUnderstand, npc]);
  const impression = useMemo(() => buildImpression(npc, mood, { timeOfDay }), [npc, mood, timeOfDay]);
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

  const collisionAnswered = Boolean(
    used.collision_apologize ||
    used.collision_pay ||
    used.collision_ignore ||
    used.collision_threaten,
  );
  const warningAnswered = Boolean(
    used.warning_alter_course ||
    used.warning_pay_toll ||
    used.warning_ignore ||
    used.warning_threaten,
  );

  const setFactionReputation = useCallback((target: number) => {
    const state = useGameStore.getState();
    state.adjustReputation(npc.flag, target - state.getReputation(npc.flag));
  }, [npc.flag]);

  const dispatchCollisionResponse = useCallback((response: CollisionResponse) => {
    window.dispatchEvent(new CustomEvent('npc-collision-response', {
      detail: { npcId: npc.id, response },
    }));
  }, [npc.id]);

  const dispatchWarningResponse = useCallback((response: WarningResponse) => {
    window.dispatchEvent(new CustomEvent('npc-warning-response', {
      detail: { npcId: npc.id, response },
    }));
  }, [npc.id]);

  const counterOffer = useMemo(() => {
    if (!barterMode?.yourGood) return null;
    return getBarterCounterOffer(npc, barterMode.yourGood, barterMode.yourQty, mood);
  }, [npc, barterMode, mood]);

  const barterDialogue = useMemo(() => {
    if (!barterMode) return null;
    return getBarterDialogue(mood, barterMode.yourGood, barterMode.yourQty, counterOffer, npc);
  }, [mood, barterMode, counterOffer]);

  // Award translation XP/rep exactly once per NPC per session.
  // Previously lived in a component-local ref, which reset on every reopen
  // and let the player farm reputation by pressing T repeatedly.
  const [xpChipVisible, setXpChipVisible] = useState(false);
  useEffect(() => {
    if (context !== 'normal') return;
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
  }, [context, hailLanguage, npc.id, npc.flag, npc.shipType, translator]);

  const canBarter = canUnderstand && mood !== 'HOSTILE' && mood !== 'COLD'
    && dominantCommodity(npc.cargo) !== null;
  const barterDetail = useMemo(() => {
    if (!canBarter) return undefined;
    return playerHeld.length > 0 ? 'open the trade' : 'your hold is empty';
  }, [canBarter, playerHeld.length]);

  // Ports the NPC has touched that the player has not yet discovered.
  // The intel action only appears if there's something genuinely new to learn.
  const discoveredPorts = useGameStore((state) => state.discoveredPorts);
  const portsById = useGameStore((state) => state.ports);
  const intelCandidates = useMemo<Port[]>(() => {
    const known = new Set(discoveredPorts);
    const visited = npc.visitedPorts ?? [];
    return visited
      .filter((id) => !known.has(id))
      .map((id) => portsById.find((p) => p.id === id))
      .filter((p): p is Port => Boolean(p));
  }, [discoveredPorts, npc.visitedPorts, portsById]);

  const [portPicker, setPortPicker] = useState(false);

  const availableActions = useMemo<HailActionEntry[]>(() => {
    if (context === 'collision') {
      return [
        { id: 'collision_apologize', label: canUnderstand ? 'shout an apology' : 'make apology gestures', detail: canUnderstand ? 'claim accident' : 'hands open, head bowed' },
        { id: 'collision_pay', label: 'offer compensation', detail: gold >= 25 ? '25 gold' : 'not enough gold' },
        { id: 'collision_ignore', label: 'sail on without answering' },
        { id: 'collision_threaten', label: canUnderstand ? 'answer with threats' : 'gesture toward your guns' },
      ];
    }
    if (context === 'warning') {
      return [
        { id: 'warning_alter_course', label: canUnderstand ? 'alter course and answer politely' : 'turn away with open hands' },
        { id: 'warning_pay_toll', label: npc.role === 'privateer' ? 'offer a toll' : 'offer coin anyway', detail: gold >= 30 ? '30 gold' : 'not enough gold' },
        { id: 'warning_ignore', label: 'hold your course' },
        { id: 'warning_threaten', label: canUnderstand ? 'threaten them back' : 'gesture toward your guns' },
      ];
    }
    const entries: (HailActionEntry | null)[] = [
      canUnderstand && !used.news ? { id: 'news', label: 'ask what news he carries' } : null,
      canBarter && !used.trade ? { id: 'trade', label: 'barter cargo', detail: barterDetail } : null,
      canUnderstand && !used.portIntel && intelCandidates.length > 0
        ? { id: 'portIntel', label: 'ask about a port he has visited', detail: `${intelCandidates.length} new to you` }
        : null,
    ];
    return entries.filter((e): e is HailActionEntry => e !== null);
  }, [canBarter, canUnderstand, used, barterDetail, context, gold, intelCandidates, npc.role]);

  const resolveAction = useCallback((action: HailAction) => {
    sfxClick();
    const state = useGameStore.getState();

    if (action === 'leave') {
      onClose();
      return;
    }

    if (context === 'collision') {
      if (action === 'collision_apologize') {
        recordCollisionGrievance(npc.id, state.dayCount);
        setFactionReputation(COLLISION_REPUTATION_TARGET.apologize);
        state.addJournalEntry('encounter', `After a collision with the ${npc.shipName}, we shouted apology across the water.`);
        setResult({
          tone: 'warn',
          text: canUnderstand
            ? `See that it was an accident. Keep clear, or we take it for an attack!!`
            : getCollisionHail(npc, false),
          impact: 'reputation: hostile',
        });
        setCollisionMood('COLD');
        setUsed((prev) => ({ ...prev, collision_apologize: true }));
        dispatchCollisionResponse('apologize');
        return;
      }
      if (action === 'collision_pay') {
        if (state.gold < 25) {
          setResult({ tone: 'warn', text: canUnderstand ? `You offer words, not coin. Keep away from us!!` : getCollisionHail(npc, false), impact: 'no gold' });
          return;
        }
        recordCollisionGrievance(npc.id, state.dayCount);
        useGameStore.setState((prev) => ({ gold: prev.gold - 25 }));
        setFactionReputation(COLLISION_REPUTATION_TARGET.pay);
        state.addJournalEntry('encounter', `Paid 25 gold compensation after ramming the ${npc.shipName}.`);
        setResult({
          tone: 'good',
          text: canUnderstand
            ? `Coin mends less than timber, but it will serve. Keep your cursed bowsprit away from us!!`
            : getCollisionHail(npc, false),
          impact: '-25 gold · reputation: cold',
        });
        setCollisionMood('COLD');
        setUsed((prev) => ({ ...prev, collision_pay: true }));
        dispatchCollisionResponse('pay');
        return;
      }
      if (action === 'collision_ignore') {
        recordCollisionGrievance(npc.id, state.dayCount);
        setFactionReputation(COLLISION_REPUTATION_TARGET.ignore);
        state.addJournalEntry('encounter', `Ignored the ${npc.shipName} after a damaging collision.`);
        dispatchCollisionResponse('ignore');
        onClose();
        return;
      }
      if (action === 'collision_threaten') {
        recordCollisionGrievance(npc.id, state.dayCount);
        setFactionReputation(COLLISION_REPUTATION_TARGET.threaten);
        state.addJournalEntry('encounter', `Threatened the ${npc.shipName} after ramming her.`);
        dispatchCollisionResponse('threaten');
        onClose();
        return;
      }
    }

    if (context === 'warning') {
      if (action === 'warning_alter_course') {
        state.addJournalEntry('encounter', `Altered course after a warning from the ${npc.shipName}.`);
        setUsed((prev) => ({ ...prev, warning_alter_course: true }));
        dispatchWarningResponse('alterCourse');
        onClose();
        return;
      }
      if (action === 'warning_pay_toll') {
        if (npc.role !== 'privateer') {
          setResult({
            tone: 'warn',
            text: canUnderstand ? `We are no thief to be bought off. Stand clear and alter course!!` : getCollisionHail(npc, false),
            impact: 'toll refused',
          });
          return;
        }
        if (state.gold < 30) {
          setResult({ tone: 'warn', text: canUnderstand ? `You offer empty hands. Turn away now!!` : getCollisionHail(npc, false), impact: 'no gold' });
          return;
        }
        useGameStore.setState((prev) => ({ gold: prev.gold - 30 }));
        state.addJournalEntry('encounter', `Paid 30 gold to make the ${npc.shipName} break off.`);
        setUsed((prev) => ({ ...prev, warning_pay_toll: true }));
        dispatchWarningResponse('payToll');
        onClose();
        return;
      }
      if (action === 'warning_ignore') {
        state.adjustReputation(npc.flag, -10);
        state.addJournalEntry('encounter', `Ignored a warning from the ${npc.shipName}.`);
        setUsed((prev) => ({ ...prev, warning_ignore: true }));
        dispatchWarningResponse('ignore');
        onClose();
        return;
      }
      if (action === 'warning_threaten') {
        state.adjustReputation(npc.flag, -15);
        state.addJournalEntry('encounter', `Threatened the ${npc.shipName} after she warned us off.`);
        setUsed((prev) => ({ ...prev, warning_threaten: true }));
        dispatchWarningResponse('threaten');
        onClose();
        return;
      }
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

    if (action === 'portIntel') {
      // Open the inline port picker — actual resolution happens on port click.
      if (intelCandidates.length === 0) return;
      setPortPicker(true);
      setResult(null);
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
  }, [canBarter, canUnderstand, context, dispatchCollisionResponse, dispatchWarningResponse, intelCandidates.length, npc, onClose, playerHeld, setFactionReputation]);

  const resolvePortIntel = useCallback((port: Port) => {
    sfxClick();
    const state = useGameStore.getState();
    const intel = PORT_INTEL[port.id];
    const detail = intel
      ? `Capt. ${npc.captainName} of the ${npc.shipName} on ${port.name}: ${intel}`
      : `Capt. ${npc.captainName} speaks of ${port.name}, but adds little we can verify.`;
    state.addJournalEntry('encounter', detail, port.name);
    state.adjustReputation(npc.flag, 1);
    // TODO: when a fog-of-war minimap lands, also reveal `port.id` here so the
    // intel translates into navigation knowledge.
    setUsed((prev) => ({ ...prev, portIntel: true }));
    setPortPicker(false);
    setResult({
      tone: 'good',
      text: `He recounts ${port.name}. We have it down in the log.`,
      impact: `+ ${npc.flag} rep · port intel logged`,
    });
  }, [npc.captainName, npc.flag, npc.shipName]);

  const cancelBarter = useCallback(() => {
    sfxClick();
    setBarterMode(null);
  }, []);

  const closePanel = useCallback(() => {
    if (context === 'collision' && !collisionAnswered) {
      const state = useGameStore.getState();
      recordCollisionGrievance(npc.id, state.dayCount);
      setFactionReputation(COLLISION_REPUTATION_TARGET.ignore);
      state.addJournalEntry('encounter', `Sailed on without answering the ${npc.shipName}'s protest after a collision.`);
      state.addNotification(`Ignored the ${npc.shipName}'s protest. Reputation with ${npc.flag} worsened.`, 'warning');
      dispatchCollisionResponse('ignore');
    }
    if (context === 'warning' && !warningAnswered) {
      const state = useGameStore.getState();
      state.adjustReputation(npc.flag, -10);
      state.addJournalEntry('encounter', `Held course after a warning from the ${npc.shipName}.`);
      dispatchWarningResponse('ignore');
    }
    onClose();
  }, [collisionAnswered, context, dispatchCollisionResponse, dispatchWarningResponse, npc.id, npc.flag, npc.shipName, onClose, setFactionReputation, warningAnswered]);

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
        if (portPicker) {
          setPortPicker(false);
          return;
        }
        if (barterMode) {
          cancelBarter();
          return;
        }
        closePanel();
        return;
      }
      if (barterMode) return;
      const idx = Number(e.key) - 1;
      if (!Number.isInteger(idx)) return;
      if (portPicker) {
        if (idx < 0 || idx >= intelCandidates.length) return;
        e.preventDefault();
        resolvePortIntel(intelCandidates[idx]);
        return;
      }
      if (idx < 0 || idx >= availableActions.length) return;
      e.preventDefault();
      resolveAction(availableActions[idx].id);
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [availableActions, closePanel, resolveAction, barterMode, cancelBarter, portPicker, intelCandidates, resolvePortIntel]);

  const resultColor = result?.tone === 'warn' ? '#f59e0b' : result?.tone === 'good' ? '#86efac' : '#cbd5e1';
  const pickerPrompt = useMemo(
    () => (portPicker ? getPortPickerPrompt(npc, mood) : null),
    [portPicker, npc, mood],
  );
  const spokenText = barterMode && canUnderstand && barterDialogue
    ? barterDialogue
    : context === 'collision'
    ? (result ? result.text : collisionGreeting)
    : context === 'warning'
    ? (result ? result.text : warningGreeting)
    : portPicker && canUnderstand && pickerPrompt
    ? pickerPrompt
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
            {captainKnown && npc.shipName && (
              <motion.span
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.45, delay: 0.3 }}
                className="flex items-baseline gap-[3px] text-amber-100/90 min-w-0"
              >
                <span
                  className="text-[10px] text-amber-100/55"
                  style={{ fontFamily: '"Fraunces", serif' }}
                >
                  the
                </span>
                <span
                  className="italic text-[13px] truncate"
                  style={{ fontFamily: '"Fraunces", serif', fontWeight: 500 }}
                >
                  {npc.shipName}
                </span>
              </motion.span>
            )}
            {impression.sense && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.5 }}
                className="hidden md:flex items-center gap-1.5 ml-2 pl-3 border-l border-[#2a2d3a] text-[11.5px] italic text-slate-400/90 min-w-0"
                style={{ fontFamily: '"Fraunces", serif' }}
                title={
                  impression.sense.kind === 'smell' ? 'scent on the air'
                  : impression.sense.kind === 'sound' ? 'a sound carrying across'
                  : 'something you can see across the water'
                }
              >
                <span aria-hidden className="text-[12px]">
                  {impression.sense.kind === 'smell' ? '❦' : impression.sense.kind === 'sound' ? '♪' : '◉'}
                </span>
                <span className="truncate">{impression.sense.text}</span>
              </motion.span>
            )}
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
              className={context === 'collision' || context === 'warning'
                ? 'text-[18px] leading-[1.45] text-red-100 uppercase tracking-[0.035em]'
                : canUnderstand
                ? 'text-[17px] leading-[1.55] text-slate-50'
                : 'text-[17px] leading-[1.7] text-slate-200 italic'}
              style={{
                fontFamily: context === 'collision' || context === 'warning' ? '"DM Sans", sans-serif' : '"Fraunces", serif',
                fontWeight: context === 'collision' || context === 'warning' ? 800 : 400,
                textShadow: context === 'collision' || context === 'warning' ? '0 0 14px rgba(248,113,113,0.25)' : undefined,
              }}
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
                className="mt-2 flex items-baseline gap-1 text-slate-300"
                style={{ fontFamily: '"DM Sans", sans-serif' }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.7 }}
              >
                <span className="text-slate-600 mr-1" aria-hidden>—</span>
                <span className="text-[9px] font-semibold tracking-[0.14em] uppercase text-slate-500">
                  Capt.
                </span>
                <span className="font-medium text-[12px]">{npc.captainName}</span>
              </motion.div>
            )}
          </div>
        </motion.div>

        {/* ── TRANSLATOR / STATUS LINE ───────────────────── */}
        <motion.div
          className="relative px-5 pt-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.55 }}
        >
          <AnimatePresence>
            {xpChipVisible && (
              <motion.div
                key="xp-splat"
                initial={{ opacity: 0, y: 6, scale: 0.8 }}
                animate={{ opacity: 1, y: -18, scale: 1 }}
                exit={{ opacity: 0, y: -42, scale: 0.95, transition: { duration: 0.7, ease: 'easeOut' } }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="pointer-events-none absolute right-5 top-2 z-10 font-mono text-[13px] font-bold tracking-[0.1em] text-emerald-300"
                style={{ textShadow: '0 0 10px rgba(134,239,172,0.6), 0 1px 2px rgba(0,0,0,0.8)' }}
              >
                +1 XP
              </motion.div>
            )}
          </AnimatePresence>
          {understandsByFaction ? (
            <div
              className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-slate-400"
              style={{ fontFamily: '"DM Sans", sans-serif' }}
            >
              <span>You and the captain sail under the</span>
              <span className="font-semibold" style={{ color: languageColor }}>{npc.flag}</span>
              <span>flag.</span>
              <span className="text-slate-500">No translation needed.</span>
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
                ) : null}
              </AnimatePresence>
            </div>
          ) : canUnderstand && translator ? (
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
        ) : portPicker ? (
          <div className="px-5 pt-4 pb-1 flex flex-col gap-1.5">
            <div
              className="px-3 -mx-3 mb-1 text-[11px] uppercase tracking-[0.16em] text-slate-500"
              style={{ fontFamily: '"DM Sans", sans-serif' }}
            >
              He has touched these ports —
            </div>
            {intelCandidates.map((port, index) => (
              <motion.button
                key={port.id}
                onClick={() => resolvePortIntel(port)}
                onMouseEnter={() => sfxHover()}
                className="group flex items-baseline gap-3 text-left px-3 py-1.5 -mx-3 rounded-md hover:bg-amber-500/[0.06] transition-colors"
                style={{ fontFamily: '"DM Sans", sans-serif' }}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.28, delay: 0.05 + index * 0.05, ease: [0.22, 1, 0.36, 1] }}
              >
                <span
                  className="font-mono text-[12px] font-bold transition-colors"
                  style={{ color: '#e2c87a' }}
                >
                  {index + 1}
                  <span className="ml-1 text-[10px] text-slate-500 group-hover:text-amber-300 transition-colors">❯</span>
                </span>
                <span className="text-[13px] text-slate-200 group-hover:text-amber-200 transition-colors flex-1">
                  {port.name}
                </span>
              </motion.button>
            ))}
            <button
              onClick={() => { sfxClick(); setPortPicker(false); }}
              onMouseEnter={() => sfxHover()}
              className="group flex items-baseline gap-3 text-left px-3 py-1 -mx-3 mt-0.5 rounded-md hover:bg-slate-500/[0.06] transition-colors"
              style={{ fontFamily: '"DM Sans", sans-serif' }}
            >
              <span className="font-mono text-[10px] font-bold text-slate-500 group-hover:text-slate-300 tracking-[0.18em] uppercase">
                esc
              </span>
              <span className="text-[12px] text-slate-500 group-hover:text-slate-300 transition-colors flex-1">
                back
              </span>
            </button>
          </div>
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
            onClick={closePanel}
            className="group font-bold font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500 hover:text-amber-300 transition-colors"
          >
            {context === 'collision' && !collisionAnswered ? 'ignore and sail on' : context === 'warning' && !warningAnswered ? 'hold course' : 'sail on'}
            <span className="ml-2 text-slate-600 group-hover:text-amber-400 transition-colors">[esc]</span>
          </button>
        </div>
      </div>
    </motion.div>
  );
}

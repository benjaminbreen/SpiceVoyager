// ── POIModal ─────────────────────────────────────────────────────────────────
//
// Walk-up modal for a Point of Interest. Two tabs:
//   - Learn    : pay a fixed cost to identify (level 0 → 1) or master
//                (level 1 → 2) a commodity in the POI's knowledgeDomain.
//                Identification uses gameStore.learnAboutCommodity which
//                surfaces the same dramatic reveal/journal entry as tavern
//                identifications — POIs feed the same pipeline.
//   - Converse : Gemini-powered NPC roleplay parameterized on POI lore.
//                Mirrors TavernTab's flow but simpler — single NPC, no
//                approach phase, no item-show suggestions surfaced as a
//                separate command.
//
// Phase 1: bespoke POIs only. Procedural archetypes (shrine / ruin / etc.)
// will reuse this modal once `archetype` + `variant` data lands.

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../store/gameStore';
import type { POIDefinition } from '../utils/poiDefinitions';
import { COMMODITY_DEFS, type Commodity } from '../utils/commodities';
import { SEMANTIC_STYLE } from '../utils/semanticClasses';
import { sfxClick, sfxClose } from '../audio/SoundEffects';
import {
  buildPOISystemPrompt,
  buildPOIInitialSceneMessage,
  callGeminiPOI,
  resetPOIRateLimiter,
  type POIConversationMessage,
  type POISuggestedResponse,
} from '../utils/poiConversation';

type Tab = 'learn' | 'converse';

export function POIModal({
  poi,
  onDismiss,
}: {
  poi: POIDefinition;
  onDismiss: () => void;
}) {
  const [tab, setTab] = useState<Tab>('learn');
  const style = SEMANTIC_STYLE[poi.class];

  // Resolve the port the POI belongs to so we can pass cultural / faction
  // context into the LLM prompt and label the modal header.
  const port = useGameStore((state) =>
    poi.port ? state.ports.find((p) => p.id === poi.port) ?? null : null,
  );
  const markPOIDiscovered = useGameStore((state) => state.markPOIDiscovered);

  // Opening the modal counts as discovery. Idempotent on the store side.
  useEffect(() => {
    markPOIDiscovered(poi.id);
  }, [poi.id, markPOIDiscovered]);

  return (
    <AnimatePresence>
      <motion.div
        key={poi.id}
        className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-auto"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            sfxClose();
            onDismiss();
          }
        }}
      >
        <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" />

        <motion.div
          initial={{ scale: 0.96, y: 8 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.96, y: 8 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          className="relative w-[min(640px,calc(100vw-2rem))] max-h-[min(720px,calc(100vh-2rem))]
            bg-[#0a0e18]/95 backdrop-blur-xl border border-[#2a2d3a]/60 rounded-xl
            shadow-[0_24px_60px_rgba(0,0,0,0.7)] flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="px-5 py-4 border-b border-white/[0.06] flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div
                className="text-[10px] font-bold tracking-[0.22em] uppercase mb-1"
                style={{ color: style.color, textShadow: `0 0 8px ${style.color}55` }}
              >
                {style.eyebrow}
              </div>
              <div className="text-lg font-semibold text-white/90 truncate" style={{ fontFamily: '"DM Sans", sans-serif' }}>
                {poi.name}
              </div>
              {poi.sub && (
                <div className="text-[12px] text-slate-400/80 mt-0.5">
                  {poi.sub}
                  {port && <span className="text-slate-500"> · {port.name}</span>}
                </div>
              )}
            </div>
            <button
              onClick={() => { sfxClose(); onDismiss(); }}
              className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center
                text-slate-500 hover:text-white/80 hover:bg-white/[0.06] transition-all"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 px-3 py-2 border-b border-white/[0.04]">
            {(['learn', 'converse'] as const).map((t) => (
              <button
                key={t}
                onClick={() => { sfxClick(); setTab(t); }}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all
                  ${tab === t
                    ? 'bg-white/[0.08] text-white/90'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.04]'}`}
              >
                {t === 'learn' ? 'Learn' : 'Converse'}
              </button>
            ))}
          </div>

          {/* Body */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {tab === 'learn' && <LearnTab poi={poi} />}
            {tab === 'converse' && port && <ConverseTab poi={poi} port={port} />}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Learn tab ────────────────────────────────────────────────────────────────

function LearnTab({ poi }: { poi: POIDefinition }) {
  const knowledgeState = useGameStore((s) => s.knowledgeState);
  const gold = useGameStore((s) => s.gold);
  const cargo = useGameStore((s) => s.cargo);
  const learnAboutCommodity = useGameStore((s) => s.learnAboutCommodity);

  const cost = poi.cost;
  const costLabel = useMemo(() => {
    switch (cost.type) {
      case 'gold': return `${cost.amount ?? 0} gold per lesson`;
      case 'commodity': {
        const id = cost.commodityId;
        return `${cost.amount ?? 1} × ${id} as offering`;
      }
      case 'reputation': return `requires standing of ${cost.amount ?? 0}`;
    }
  }, [cost]);

  // Whether the player can currently pay the cost.
  const canAfford = useMemo(() => {
    if (cost.type === 'gold') return gold >= (cost.amount ?? 0);
    if (cost.type === 'commodity' && cost.commodityId) {
      return (cargo[cost.commodityId] ?? 0) >= (cost.amount ?? 1);
    }
    if (cost.type === 'reputation') return true; // reputation gating not enforced in Phase 1
    return false;
  }, [cost, gold, cargo]);

  function attemptLearn(commodityId: Commodity, targetLevel: 1 | 2) {
    if (!canAfford) return;
    const current = (knowledgeState[commodityId] as 0 | 1 | 2 | undefined) ?? 0;
    if (targetLevel <= current) return;

    // Deduct cost via direct store mutation. Mirrors the inline patterns used
    // by other commerce actions (lodging, weapons, upgrades).
    if (cost.type === 'gold' && cost.amount) {
      useGameStore.setState((state) => ({ gold: state.gold - cost.amount! }));
    } else if (cost.type === 'commodity' && cost.commodityId && cost.amount) {
      const id = cost.commodityId;
      useGameStore.setState((state) => ({
        cargo: { ...state.cargo, [id]: (state.cargo[id] ?? 0) - cost.amount! },
      }));
    }

    sfxClick();
    learnAboutCommodity(commodityId, targetLevel, `${poi.npcName} at ${poi.name}`);
  }

  return (
    <div className="h-full overflow-y-auto px-5 py-4 space-y-4">
      {/* Lore blurb */}
      <p className="text-[13px] text-slate-300/80 leading-relaxed">
        {poi.lore}
      </p>

      {/* Cost line */}
      <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.05]">
        <span className="text-[11px] font-semibold tracking-[0.12em] uppercase text-slate-400">
          Cost
        </span>
        <span className={`text-[12px] font-semibold ${canAfford ? 'text-amber-300/90' : 'text-rose-300/80'}`}>
          {costLabel}
        </span>
      </div>

      {/* Knowledge domain list */}
      <div className="space-y-1.5">
        <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-slate-500 mb-2">
          Materia at this site
        </div>
        {poi.knowledgeDomain.map((commodityId) => {
          const def = COMMODITY_DEFS[commodityId];
          const level = (knowledgeState[commodityId] as 0 | 1 | 2 | undefined) ?? 0;
          const isMastery = poi.masteryGoods.includes(commodityId);
          const nextLevel: 1 | 2 | null = level === 0
            ? 1
            : level === 1 && isMastery
              ? 2
              : null;
          const action = nextLevel === 1 ? 'Identify' : nextLevel === 2 ? 'Master' : 'Known';
          return (
            <div
              key={commodityId}
              className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg
                bg-white/[0.02] border border-white/[0.04]"
            >
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-white/85 truncate">
                  {level === 0 ? def?.physicalDescription ?? 'Unknown specimen' : commodityId}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-wider">
                  {level === 0 ? 'Unknown' : level === 1 ? 'Identified' : 'Mastered'}
                  {isMastery && level < 2 && ' · mastery available'}
                </div>
              </div>
              <button
                disabled={!nextLevel || !canAfford}
                onClick={() => nextLevel && attemptLearn(commodityId, nextLevel)}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-semibold tracking-wider uppercase
                  border transition-all
                  ${!nextLevel
                    ? 'bg-white/[0.02] border-white/[0.04] text-slate-600 cursor-default'
                    : canAfford
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-200/90 hover:bg-amber-500/25 cursor-pointer'
                      : 'bg-white/[0.02] border-white/[0.05] text-slate-600 cursor-not-allowed'}`}
              >
                {action}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Converse tab ─────────────────────────────────────────────────────────────

function ConverseTab({ poi, port }: { poi: POIDefinition; port: import('../store/gameStore').Port }) {
  const [history, setHistory] = useState<POIConversationMessage[]>([]);
  const [suggestions, setSuggestions] = useState<POISuggestedResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [playerInput, setPlayerInput] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  const systemPrompt = useMemo(() => buildPOISystemPrompt(poi, port), [poi, port]);

  // Open the conversation with a scene-setting message that triggers the NPC's
  // first line. Reset rate limiter so each POI visit is a fresh budget.
  useEffect(() => {
    resetPOIRateLimiter();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);
    const sceneMsg = buildPOIInitialSceneMessage(poi, port);

    callGeminiPOI(systemPrompt, [], sceneMsg, controller.signal)
      .then((res) => {
        if (controller.signal.aborted) return;
        setHistory([{ role: 'model', text: res.npcDialogue }]);
        setSuggestions(res.suggestedResponses);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error('POI initial response failed:', err);
        setHistory([{ role: 'model', text: 'Your host glances up but says nothing.' }]);
        setSuggestions([{ label: 'Take your leave', type: 'farewell' }]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [poi, port, systemPrompt]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, isLoading]);

  async function send(text: string, type?: POISuggestedResponse['type']) {
    if (!text.trim() || isLoading) return;
    const userMsg: POIConversationMessage = { role: 'user', text };
    const newHistory = [...history, userMsg];
    setHistory(newHistory);
    setSuggestions([]);
    setPlayerInput('');

    if (type === 'farewell') {
      // Local fallback — let the LLM still respond if it wants to, but we
      // give the player a clean exit either way.
      setSuggestions([]);
    }

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    setIsLoading(true);

    try {
      const res = await callGeminiPOI(systemPrompt, history, text, controller.signal);
      if (controller.signal.aborted) return;
      setHistory([...newHistory, { role: 'model', text: res.npcDialogue }]);
      setSuggestions(res.suggestedResponses);
    } catch (err) {
      if (!controller.signal.aborted) {
        console.error('POI reply failed:', err);
        setSuggestions([{ label: 'Take your leave', type: 'farewell' }]);
      }
    } finally {
      if (!controller.signal.aborted) setIsLoading(false);
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Transcript */}
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-3">
        {history.map((msg, i) => (
          <div
            key={i}
            className={`text-[13px] leading-relaxed ${
              msg.role === 'model'
                ? 'text-slate-200/95'
                : 'text-amber-200/70 italic pl-4 border-l border-amber-500/30'
            }`}
          >
            {msg.text}
          </div>
        ))}
        {isLoading && (
          <div className="text-[12px] text-slate-500/70 italic">…</div>
        )}
        <div ref={transcriptEndRef} />
      </div>

      {/* Suggested responses + input */}
      <div className="border-t border-white/[0.05] px-4 py-3 space-y-2">
        {suggestions.length > 0 && !isLoading && (
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => send(s.label, s.type)}
                disabled={isLoading}
                className="px-2.5 py-1 rounded-md bg-white/[0.04] hover:bg-white/[0.08]
                  border border-white/[0.06] text-[11px] text-slate-300 hover:text-white/90
                  transition-all disabled:opacity-40"
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(playerInput);
          }}
          className="flex items-center gap-2"
        >
          <input
            value={playerInput}
            onChange={(e) => setPlayerInput(e.target.value)}
            disabled={isLoading}
            placeholder={isLoading ? 'Waiting...' : 'Say something...'}
            className="flex-1 bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-1.5
              text-[13px] text-white/90 placeholder:text-slate-600 focus:outline-none
              focus:border-amber-500/40 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isLoading || !playerInput.trim()}
            className="px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25
              border border-amber-500/40 text-[11px] font-semibold text-amber-200/90
              uppercase tracking-wider disabled:opacity-40 transition-all"
          >
            Speak
          </button>
        </form>
      </div>
    </div>
  );
}

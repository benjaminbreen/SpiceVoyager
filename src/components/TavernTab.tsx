import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Beer, MessageCircle, Send, Loader2 } from 'lucide-react';
import { useGameStore, getCaptain } from '../store/gameStore';
import type { Port, Nationality } from '../store/gameStore';
import type { Commodity } from '../utils/commodities';
import { COMMODITY_DEFS } from '../utils/commodities';
import { generateTavernNpcs, type TavernNpc } from '../utils/tavernNpcGenerator';
import { getEffectiveKnowledge } from '../utils/knowledgeSystem';
import { sfxCoin, sfxClick, sfxHover, sfxDiscovery } from '../audio/SoundEffects';
import { ConfigPortrait } from './CrewPortrait';
import {
  buildNpcSystemPrompt,
  buildUserMessage,
  buildInitialSceneMessage,
  callGeminiTavern,
  resetRateLimiter,
  setCurrentNpcDomain,
  type ConversationMessage,
  type SuggestedResponse,
  type TavernLLMResponse,
} from '../utils/tavernConversation';

interface TavernTabProps {
  port: Port;
}

// ── Chat message types ──

interface ChatMessage {
  id: string;
  sender: 'npc' | 'player' | 'system';
  text: string;
}

export function TavernTab({ port }: TavernTabProps) {
  const gold = useGameStore(s => s.gold);
  const cargo = useGameStore(s => s.cargo);
  const crew = useGameStore(s => s.crew);
  const ship = useGameStore(s => s.ship);
  const timeOfDay = useGameStore(s => s.timeOfDay);
  const dayCount = useGameStore(s => s.dayCount);
  const reputation = useGameStore(s => s.reputation);
  const knowledgeState = useGameStore(s => s.knowledgeState);
  const learnAboutCommodity = useGameStore(s => s.learnAboutCommodity);
  const addJournalEntry = useGameStore(s => s.addJournalEntry);
  const adjustReputation = useGameStore(s => s.adjustReputation);

  const [npcs, setNpcs] = useState<TavernNpc[]>([]);
  const [roundsBought, setRoundsBought] = useState(0);
  const [activeNpcId, setActiveNpcId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [pendingApproach, setPendingApproach] = useState<string | null>(null);
  const [revealedGoods, setRevealedGoods] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [playerInput, setPlayerInput] = useState('');
  const [suggestedResponses, setSuggestedResponses] = useState<SuggestedResponse[]>([]);
  const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([]);
  const [playerHasIntroduced, setPlayerHasIntroduced] = useState(false);
  const [npcHasIntroduced, setNpcHasIntroduced] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Generate NPCs on mount + reset rate limiter
  useEffect(() => {
    setNpcs(generateTavernNpcs(port, timeOfDay));
    setRoundsBought(0);
    setActiveNpcId(null);
    setChatMessages([]);
    setPendingApproach(null);
    setRevealedGoods(new Set());
    setSuggestedResponses([]);
    setConversationHistory([]);
    setPlayerHasIntroduced(false);
    setNpcHasIntroduced(false);
    setPlayerInput('');
    resetRateLimiter();

    // Abort any in-flight request on unmount or port change
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [port.id]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Focus input when conversation starts
  useEffect(() => {
    if (activeNpcId && inputRef.current) {
      inputRef.current.focus();
    }
  }, [activeNpcId]);

  const activeNpc = npcs.find(n => n.id === activeNpcId);

  const addMsg = useCallback((sender: ChatMessage['sender'], text: string) => {
    setChatMessages(prev => [...prev, {
      id: Math.random().toString(36).substring(2, 9),
      sender,
      text,
    }]);
  }, []);

  // ── Process LLM response side effects ──
  const processLLMResponse = useCallback((response: TavernLLMResponse, npc: TavernNpc) => {
    // Knowledge reveal
    if (response.knowledgeReveal) {
      const { commodityId, level } = response.knowledgeReveal;
      const effectiveLevel = getEffectiveKnowledge(commodityId, knowledgeState, crew);
      if (level > effectiveLevel) {
        learnAboutCommodity(commodityId, level, `a ${npc.role.title} in ${port.name}`);
        setRevealedGoods(prev => new Set([...prev, commodityId]));
        sfxDiscovery();
        addJournalEntry(
          'commerce',
          `Through a ${npc.role.title} named ${npc.name} in ${port.name}, we learned about ${commodityId}. ${COMMODITY_DEFS[commodityId as Commodity]?.description ?? ''}`,
          port.name,
        );
      }
    }

    // Reputation shift
    if (response.reputationShift) {
      const { nationality, delta } = response.reputationShift;
      adjustReputation(nationality as Nationality, delta);
    }

    // Check if NPC introduced themselves (name mentioned in their own dialogue)
    if (response.npcDialogue.includes(npc.name)) {
      setNpcHasIntroduced(true);
      // Reveal the NPC in the list
      setNpcs(prev => prev.map(n =>
        n.id === npc.id ? { ...n, revealed: true } : n
      ));
    }

    // Update suggested responses
    setSuggestedResponses(response.suggestedResponses);
  }, [knowledgeState, crew, learnAboutCommodity, port.name, addJournalEntry, adjustReputation]);

  // ── Send message to LLM ──
  const sendToLLM = useCallback(async (
    npc: TavernNpc,
    userText: string,
    showingItem?: Commodity,
  ) => {
    setIsLoading(true);
    setSuggestedResponses([]);

    // Abort any previous in-flight request
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Set NPC domain so the validator can guard knowledge reveals
    setCurrentNpcDomain(npc.role.knowledgeDomain);

    const systemPrompt = buildNpcSystemPrompt(npc, port, {
      ship,
      crew,
      cargo,
      knowledgeState,
      gold,
      timeOfDay,
      dayCount,
      reputation,
    }, {
      playerHasIntroduced,
      npcHasIntroduced,
      revealedGoods,
      roundsBought,
    });

    const message = buildUserMessage(userText, showingItem);

    try {
      const response = await callGeminiTavern(systemPrompt, conversationHistory, message, controller.signal);

      // If aborted while waiting, don't process
      if (controller.signal.aborted) return;

      // Add to conversation history (keep last 10 exchanges)
      setConversationHistory(prev => {
        const updated = [
          ...prev,
          { role: 'user' as const, text: message },
          { role: 'model' as const, text: response.npcDialogue },
        ];
        // Keep last 20 messages (10 exchanges)
        return updated.slice(-20);
      });

      // Display the NPC's response
      addMsg('npc', response.npcDialogue);

      // Process side effects
      processLLMResponse(response, npc);
    } catch (err) {
      // Don't show errors for aborted requests (user switched NPCs or left tavern)
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error('Tavern conversation error:', err);
      addMsg('npc', 'He seems distracted and does not respond clearly.');
      setSuggestedResponses([
        { label: 'Try again', type: 'question' },
        { label: 'Walk away', type: 'farewell' },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [port, ship, crew, cargo, knowledgeState, gold, timeOfDay, dayCount, reputation,
      playerHasIntroduced, npcHasIntroduced, revealedGoods, roundsBought,
      conversationHistory, addMsg, processLLMResponse]);

  // ── Start a conversation with an NPC ──
  const startConversation = useCallback(async (npc: TavernNpc) => {
    // Abort any previous in-flight request
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setActiveNpcId(npc.id);
    setChatMessages([]);
    setConversationHistory([]);
    setSuggestedResponses([]);
    setPlayerHasIntroduced(false);
    setNpcHasIntroduced(false);
    setIsLoading(true);

    setCurrentNpcDomain(npc.role.knowledgeDomain);

    const systemPrompt = buildNpcSystemPrompt(npc, port, {
      ship, crew, cargo, knowledgeState, gold, timeOfDay, dayCount, reputation,
    }, {
      playerHasIntroduced: false,
      npcHasIntroduced: false,
      revealedGoods,
      roundsBought,
    });

    const sceneMessage = buildInitialSceneMessage(npc, port);

    try {
      const response = await callGeminiTavern(systemPrompt, [], sceneMessage, controller.signal);
      if (controller.signal.aborted) return;

      // Seed the conversation history
      setConversationHistory([
        { role: 'user', text: sceneMessage },
        { role: 'model', text: response.npcDialogue },
      ]);

      addMsg('npc', response.npcDialogue);

      if (response.npcDialogue.includes(npc.name)) {
        setNpcHasIntroduced(true);
        setNpcs(prev => prev.map(n =>
          n.id === npc.id ? { ...n, revealed: true } : n
        ));
      }

      setSuggestedResponses(response.suggestedResponses);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error('Failed to start conversation:', err);
      addMsg('npc', npc.approachLine);
      setSuggestedResponses([
        { label: '"Who are you?"', type: 'question' },
        { label: 'Ask about trade in the region', type: 'question' },
        { label: 'Nod politely', type: 'farewell' },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [port, ship, crew, cargo, knowledgeState, gold, timeOfDay, dayCount, reputation,
      revealedGoods, roundsBought, addMsg]);

  // ── Handle player actions ──

  const handleSuggestedResponse = async (response: SuggestedResponse) => {
    if (!activeNpc || isLoading) return;
    sfxClick();

    if (response.type === 'farewell') {
      addMsg('player', response.label);
      addMsg('system', `${activeNpc.revealed ? activeNpc.name : 'The stranger'} nods and returns to their drink.`);
      setActiveNpcId(null);
      setSuggestedResponses([]);
      return;
    }

    if (response.type === 'buy_drink') {
      if (gold < 3) {
        addMsg('system', 'You do not have enough gold.');
        return;
      }
      sfxCoin(3);
      useGameStore.setState({ gold: gold - 3 });
      addMsg('player', response.label);
      await sendToLLM(activeNpc, `[The player buys you a drink, spending 3 gold. React warmly to this gesture.] "${response.label}"`);
      return;
    }

    // Check if player is introducing themselves
    const captain = getCaptain({ crew });
    if (captain && response.type === 'share_info') {
      setPlayerHasIntroduced(true);
    }

    // Show item flow
    if (response.type === 'show_item' && response.itemId) {
      const def = COMMODITY_DEFS[response.itemId as Commodity];
      if (def) {
        addMsg('player', `I show them the ${def.physicalDescription.toLowerCase()}.`);
        await sendToLLM(activeNpc, `I show them the ${def.physicalDescription.toLowerCase()}. What is this?`, response.itemId as Commodity);
        return;
      }
    }

    addMsg('player', response.label);
    await sendToLLM(activeNpc, response.label);
  };

  const handleFreeTextSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeNpc || !playerInput.trim() || isLoading) return;

    const text = playerInput.trim();
    setPlayerInput('');
    sfxClick();

    // Check if the player is introducing themselves
    const captain = getCaptain({ crew });
    if (captain) {
      const nameLower = captain.name.toLowerCase();
      if (text.toLowerCase().includes(nameLower) || text.toLowerCase().includes('my name is') || text.toLowerCase().includes('i am called')) {
        setPlayerHasIntroduced(true);
      }
    }

    addMsg('player', text);
    await sendToLLM(activeNpc, text);
  };

  // ── Buy a round ──
  const handleBuyRound = () => {
    if (gold < 5 || pendingApproach) return;
    sfxCoin(5);
    useGameStore.setState({ gold: gold - 5 });
    setRoundsBought(r => r + 1);

    // Find an NPC who will approach
    const approacher = npcs.find(n => n.willApproach && !n.revealed);
    if (approacher) {
      setPendingApproach(approacher.id);
      setTimeout(() => {
        setPendingApproach(null);
        setNpcs(prev => prev.map(n =>
          n.id === approacher.id ? { ...n, revealed: true } : n
        ));
        startConversation(approacher);
      }, 1200);
    } else {
      const unrevealed = npcs.filter(n => !n.revealed);
      if (unrevealed.length > 0) {
        const chosen = unrevealed[Math.floor(Math.random() * unrevealed.length)];
        setNpcs(prev => prev.map(n =>
          n.id === chosen.id ? { ...n, willApproach: true } : n
        ));
        setPendingApproach(chosen.id);
        setTimeout(() => {
          setPendingApproach(null);
          setNpcs(prev => prev.map(n =>
            n.id === chosen.id ? { ...n, revealed: true } : n
          ));
          startConversation(chosen);
        }, 1200);
      } else {
        // All NPCs already revealed — re-engage a random one
        const randomNpc = npcs[Math.floor(Math.random() * npcs.length)];
        if (randomNpc) {
          startConversation(randomNpc);
        } else {
          addMsg('system', 'The room stirs, but no one new approaches.');
        }
      }
    }
  };

  // ── Build dynamic show-item suggestions ──
  // These are always available in addition to LLM suggestions
  function getShowItemOptions(): SuggestedResponse[] {
    if (!activeNpc) return [];
    const options: SuggestedResponse[] = [];

    const unknownInCargo = Object.entries(cargo)
      .filter(([c, qty]) => qty > 0 && getEffectiveKnowledge(c, knowledgeState, crew) === 0)
      .map(([c]) => c as Commodity)
      .filter(c => !revealedGoods.has(c))
      .filter(c => activeNpc.role.knowledgeDomain.includes(c));

    for (const good of unknownInCargo.slice(0, 2)) {
      const def = COMMODITY_DEFS[good];
      options.push({
        label: `Show them the ${def.physicalDescription.toLowerCase()}`,
        type: 'show_item',
        itemId: good,
      });
    }

    return options;
  }

  // Merge LLM suggestions with always-available item options
  const allSuggestions = (() => {
    const itemOpts = getShowItemOptions();
    // Filter out any LLM show_item suggestions (we generate better ones from game state)
    const llmFiltered = suggestedResponses.filter(r => r.type !== 'show_item');
    // Put item options first, then LLM suggestions
    return [...itemOpts, ...llmFiltered].slice(0, 5);
  })();

  return (
    <motion.div
      key="tavern"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <div className="grid gap-3 xl:grid-cols-[minmax(0,0.48fr)_minmax(0,1fr)]" style={{ fontFamily: '"DM Sans", sans-serif' }}>
        {/* ── Left column: NPC list + buy round ── */}
        <div className="flex flex-col gap-3">
          {/* NPCs in the room */}
          <div className="rounded-lg border border-white/[0.04] bg-white/[0.015] px-4 py-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[12px] font-bold tracking-[0.12em] uppercase text-slate-500">
                The Room
                <span className="ml-2 font-normal text-slate-600">
                  {timeOfDay >= 17 || timeOfDay < 6 ? 'evening' : timeOfDay >= 12 ? 'afternoon' : 'morning'}
                </span>
              </div>
              <div className="text-[12px] text-slate-600">
                {npcs.length} {npcs.length === 1 ? 'figure' : 'figures'}
              </div>
            </div>

            <div className="space-y-2">
              <AnimatePresence>
                {npcs.map((npc) => {
                  const isActive = npc.id === activeNpcId;
                  const isPending = npc.id === pendingApproach;
                  return (
                    <motion.button
                      key={npc.id}
                      type="button"
                      initial={{ opacity: 0, x: -8 }}
                      animate={{
                        opacity: 1,
                        x: 0,
                        backgroundColor: isPending ? 'rgba(251,191,36,0.06)' : isActive ? 'rgba(255,255,255,0.04)' : 'transparent',
                      }}
                      transition={{ duration: 0.2 }}
                      onMouseEnter={() => sfxHover()}
                      onClick={() => {
                        if (isActive) return;
                        if (npc.revealed) {
                          sfxClick();
                          startConversation(npc);
                        }
                      }}
                      className={`group flex w-full items-start gap-3 rounded-lg border px-3 py-3 text-left transition-all ${
                        isActive
                          ? 'border-amber-400/40 bg-amber-400/[0.06] shadow-[0_0_12px_rgba(201,168,76,0.15)]'
                          : isPending
                            ? 'border-amber-400/15'
                            : npc.revealed
                              ? 'border-white/[0.04] hover:border-white/[0.08] cursor-pointer'
                              : 'border-white/[0.03] cursor-default'
                      }`}
                    >
                      {/* Portrait */}
                      <div
                        className={`flex shrink-0 items-center justify-center rounded-lg border-2 overflow-hidden transition-all ${
                          isPending ? 'animate-pulse border-amber-400/40' :
                          isActive ? 'border-amber-400/50 shadow-[0_0_8px_rgba(201,168,76,0.25)]' :
                          'border-white/[0.08] hover:border-white/[0.14]'
                        }`}
                      >
                        <ConfigPortrait
                          config={npc.portraitConfig}
                          size={64}
                          square
                        />
                      </div>

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        {npc.revealed ? (
                          <>
                            <div className="flex items-center gap-2">
                              <span className="text-[16px] font-bold text-slate-200">
                                {npc.name}
                              </span>
                              <span className="rounded-full border border-white/[0.06] bg-white/[0.03] px-2 py-0.5 text-[12px] text-slate-500">
                                {npc.nationality} {npc.role.title}
                              </span>
                            </div>
                            {isActive && (
                              <div className="mt-1 flex items-center gap-1 text-[12px] text-amber-300/60">
                                <MessageCircle size={11} /> talking to you
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            <div className="text-[14px] leading-snug text-slate-300">
                              {npc.appearance}
                            </div>
                            <div className="mt-1 text-[13px] text-slate-500 italic">
                              {isPending ? (
                                <span className="text-amber-300/70 not-italic font-medium">Approaching you...</span>
                              ) : (
                                npc.idleAction
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </motion.button>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>

          {/* Buy a round */}
          <div className="rounded-lg border border-white/[0.04] bg-white/[0.015] px-4 py-4">
            <button
              type="button"
              onClick={handleBuyRound}
              disabled={gold < 5 || isLoading || !!pendingApproach}
              onMouseEnter={() => sfxHover()}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.06] px-4 py-3 text-[13px] font-bold text-emerald-200/80 transition-all hover:border-emerald-400/35 hover:bg-emerald-400/[0.10] hover:text-emerald-100 active:scale-[0.98] disabled:cursor-not-allowed disabled:border-white/[0.04] disabled:bg-white/[0.015] disabled:text-slate-700"
            >
              <Beer size={16} />
              Buy a round — 5g
            </button>
            {roundsBought > 0 && (
              <div className="mt-2.5 text-center text-[13px] text-slate-500">
                {roundsBought} {roundsBought === 1 ? 'round' : 'rounds'} bought tonight
              </div>
            )}
          </div>
        </div>

        {/* ── Right column: conversation ── */}
        <div className="flex flex-col rounded-lg border border-white/[0.04] bg-white/[0.015]">
          {activeNpc ? (
            <>
              {/* Chat header with portrait */}
              <div className="shrink-0 border-b border-white/[0.04] px-5 py-3 flex items-center gap-3">
                <div className="rounded-lg border-2 border-amber-400/30 overflow-hidden shadow-[0_0_10px_rgba(201,168,76,0.15)]">
                  <ConfigPortrait
                    config={activeNpc.portraitConfig}
                    size={44}
                    square
                  />
                </div>
                <div>
                  <div className="text-[15px] font-bold text-slate-200">
                    {activeNpc.revealed ? activeNpc.name : 'A stranger'}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {activeNpc.revealed ? `${activeNpc.nationality} ${activeNpc.role.title}` : activeNpc.appearance}
                  </div>
                </div>
              </div>

              {/* Chat messages */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 max-h-[40vh] scrollbar-thin scrollbar-thumb-white/10">
                <AnimatePresence>
                  {chatMessages.map((msg) => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25 }}
                      className={
                        msg.sender === 'system'
                          ? 'text-center py-1'
                          : msg.sender === 'npc'
                            ? 'pr-6'
                            : 'pl-6 text-right'
                      }
                    >
                      {msg.sender === 'system' ? (
                        <span className="text-[13px] italic text-slate-600">
                          {msg.text}
                        </span>
                      ) : msg.sender === 'npc' ? (
                        <div className="inline-block rounded-lg rounded-tl-none border border-white/[0.06] bg-white/[0.03] px-4 py-3">
                          <p className="text-[17px] leading-[1.7] text-slate-300">
                            {msg.text}
                          </p>
                        </div>
                      ) : (
                        <div className="inline-block rounded-lg rounded-tr-none border border-amber-400/15 bg-amber-400/[0.04] px-4 py-3">
                          <p className="text-[17px] leading-[1.7] text-amber-200/70">
                            {msg.text}
                          </p>
                        </div>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>

                {/* Loading indicator */}
                {isLoading && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="pr-6"
                  >
                    <div className="inline-flex items-center gap-2 rounded-lg rounded-tl-none border border-white/[0.06] bg-white/[0.03] px-4 py-3">
                      <Loader2 size={14} className="animate-spin text-slate-500" />
                      <span className="text-[13px] italic text-slate-500">
                        {activeNpc.revealed ? activeNpc.name : 'The stranger'} considers...
                      </span>
                    </div>
                  </motion.div>
                )}

                <div ref={chatEndRef} />
              </div>

              {/* Suggested responses */}
              {!isLoading && allSuggestions.length > 0 && (
                <div className="shrink-0 border-t border-white/[0.04] px-5 py-3">
                  <div className="space-y-1.5">
                    {allSuggestions.map((opt, i) => (
                      <button
                        key={`${opt.label}-${i}`}
                        type="button"
                        onMouseEnter={() => sfxHover()}
                        onClick={() => handleSuggestedResponse(opt)}
                        disabled={isLoading}
                        className={`group flex w-full items-center gap-2.5 rounded-lg border px-4 py-2.5 text-left text-[14px] transition-all active:scale-[0.99] disabled:opacity-40 ${
                          opt.type === 'show_item'
                            ? 'border-sky-400/15 bg-sky-400/[0.03] text-sky-300/70 hover:border-sky-400/25 hover:bg-sky-400/[0.06] hover:text-sky-200'
                            : opt.type === 'farewell'
                              ? 'border-white/[0.03] bg-transparent text-slate-500 hover:border-white/[0.06] hover:text-slate-400'
                              : opt.type === 'buy_drink'
                                ? 'border-emerald-400/15 bg-emerald-400/[0.03] text-emerald-300/70 hover:border-emerald-400/25 hover:bg-emerald-400/[0.06] hover:text-emerald-200'
                                : 'border-white/[0.04] bg-white/[0.02] text-slate-400 hover:border-white/[0.08] hover:bg-white/[0.04] hover:text-slate-200'
                        }`}
                      >
                        <span className={`text-[13px] ${
                          opt.type === 'show_item' ? 'text-sky-500/50 group-hover:text-sky-400/60'
                          : opt.type === 'buy_drink' ? 'text-emerald-500/50 group-hover:text-emerald-400/60'
                          : 'text-slate-600 group-hover:text-amber-300/50'
                        }`}>
                          {opt.type === 'show_item' ? '\u25cb' : opt.type === 'buy_drink' ? '\u25cb' : '>'}
                        </span>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Free text input */}
              <div className="shrink-0 border-t border-white/[0.04] px-5 py-3">
                <form onSubmit={handleFreeTextSubmit} className="flex gap-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={playerInput}
                    onChange={e => setPlayerInput(e.target.value)}
                    disabled={isLoading}
                    placeholder={isLoading ? 'Waiting...' : 'Say something...'}
                    className="flex-1 rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-2.5 text-[14px] text-slate-200 placeholder-slate-600 outline-none transition-all focus:border-amber-400/30 focus:bg-white/[0.04] focus:shadow-[0_0_12px_rgba(201,168,76,0.08)] disabled:opacity-40"
                  />
                  <button
                    type="submit"
                    disabled={isLoading || !playerInput.trim()}
                    className="flex items-center justify-center rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2.5 text-amber-300/70 transition-all hover:border-amber-400/35 hover:bg-amber-400/[0.10] hover:text-amber-200 active:scale-[0.96] disabled:cursor-not-allowed disabled:border-white/[0.04] disabled:bg-white/[0.015] disabled:text-slate-700"
                  >
                    <Send size={14} />
                  </button>
                </form>
              </div>
            </>
          ) : (
            /* Empty state — no conversation yet */
            <div className="flex flex-1 flex-col items-center justify-center px-8 py-16 text-center">
              <Beer size={30} className="mb-4 text-slate-700/40" />
              <div className="text-[15px] font-bold text-slate-600" style={{ fontFamily: '"Fraunces", serif' }}>
                {roundsBought === 0
                  ? 'No one has spoken to you yet'
                  : pendingApproach
                    ? 'Someone stirs...'
                    : 'Buy a round to loosen tongues'
                }
              </div>
              <p className="mt-2 max-w-[300px] text-[14px] leading-relaxed text-slate-600">
                {roundsBought === 0
                  ? 'The room hums with conversation in several languages. A round of drinks might draw someone out.'
                  : 'The barkeep watches you. Another drink might help.'
                }
              </p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

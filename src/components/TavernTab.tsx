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
  type TavernOffer,
} from '../utils/tavernConversation';
import { buildLeadFromTavernOffer } from '../utils/tavernOffers';
import { TavernOfferCard } from './quests/TavernOfferCard';

const TAVERN_LEAD_CAP = 2;

interface TavernTabProps {
  port: Port;
}

/** "a" / "an" by leading vowel sound. Approximate; covers nationality words. */
function indefiniteArticle(word: string): string {
  return /^[aeiouAEIOU]/.test(word) ? 'an' : 'a';
}

/** Inline-only markdown for NPC dialogue: **bold** and *italic*. The LLM
 *  occasionally emits these (e.g. *he frowns* as an action beat) and they
 *  used to show as raw asterisks. Keeps things light — no block-level
 *  parsing, no links, no code. */
function renderInlineMarkdown(text: string): React.ReactNode {
  const out: React.ReactNode[] = [];
  let i = 0;
  let buf = '';
  let key = 0;
  const flush = () => { if (buf) { out.push(buf); buf = ''; } };
  while (i < text.length) {
    if (text[i] === '*' && text[i + 1] === '*') {
      const end = text.indexOf('**', i + 2);
      if (end > i + 2) {
        flush();
        out.push(<strong key={key++} className="font-semibold">{text.slice(i + 2, end)}</strong>);
        i = end + 2;
        continue;
      }
    }
    if (text[i] === '*') {
      const end = text.indexOf('*', i + 1);
      if (end > i + 1) {
        flush();
        out.push(<em key={key++}>{text.slice(i + 1, end)}</em>);
        i = end + 1;
        continue;
      }
    }
    buf += text[i++];
  }
  flush();
  return out;
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
  const addLead = useGameStore(s => s.addLead);
  const activeTavernLeadCount = useGameStore(s =>
    s.leads.filter(l => l.source === 'tavern' && l.status === 'active').length
  );

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
  // The current tavern errand offer awaiting Accept/Decline. Keyed by the
  // chat message id so the affordance renders inline after the NPC turn
  // that produced it. At most one outstanding offer at a time.
  const [pendingOffer, setPendingOffer] = useState<{ messageId: string; offer: TavernOffer } | null>(null);
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
    setPendingOffer(null);
    resetRateLimiter();

    // Abort any in-flight request on unmount or port change
    return () => {
      abortControllerRef.current?.abort();
    };
    // dayCount in deps so resting at the inn (which advances the day) also
    // refreshes the tavern crowd for the new morning.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [port.id, dayCount]);

  // Auto-scroll the chat container only — never the modal body. `scrollIntoView`
  // walks all scrollable ancestors which used to push the NPC name/portrait
  // header off the top of the modal.
  const chatScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [chatMessages, pendingOffer]);

  // Focus input when conversation starts
  useEffect(() => {
    if (activeNpcId && inputRef.current) {
      inputRef.current.focus();
    }
  }, [activeNpcId]);

  const activeNpc = npcs.find(n => n.id === activeNpcId);

  const addMsg = useCallback((sender: ChatMessage['sender'], text: string): string => {
    const id = Math.random().toString(36).substring(2, 9);
    setChatMessages(prev => [...prev, { id, sender, text }]);
    return id;
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
      const npcMsgId = addMsg('npc', response.npcDialogue);

      // Process side effects
      processLLMResponse(response, npc);

      // Attach an offer affordance to this NPC turn, if present.
      if (response.offer) {
        setPendingOffer({ messageId: npcMsgId, offer: response.offer });
      }
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
    setPendingOffer(null);
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

      const npcMsgId = addMsg('npc', response.npcDialogue);

      if (response.npcDialogue.includes(npc.name)) {
        setNpcHasIntroduced(true);
        setNpcs(prev => prev.map(n =>
          n.id === npc.id ? { ...n, revealed: true } : n
        ));
      }

      setSuggestedResponses(response.suggestedResponses);

      if (response.offer) {
        setPendingOffer({ messageId: npcMsgId, offer: response.offer });
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error('Failed to start conversation:', err);
      addMsg('npc', npc.approachLine);
      setSuggestedResponses([
        { label: 'Who are you?', type: 'question' },
        { label: 'What is the trade like in these waters?', type: 'question' },
        { label: 'Bid them a quiet good day', type: 'farewell' },
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
      setPendingOffer(null);
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

  const handleAcceptOffer = useCallback(() => {
    if (!pendingOffer || !activeNpc) return;
    const lead = buildLeadFromTavernOffer({
      offer: pendingOffer.offer,
      giverName: activeNpc.name,
      giverNationality: activeNpc.nationality,
      giverPortId: port.id,
      sourceQuote: chatMessages.find(m => m.id === pendingOffer.messageId)?.text ?? pendingOffer.offer.task,
      currentDay: dayCount,
    });
    addLead(lead);
    addMsg('system', 'You accept the errand.');
    setPendingOffer(null);
    sfxClick();
  }, [pendingOffer, activeNpc, port.id, chatMessages, dayCount, addLead, addMsg]);

  const handleDeclineOffer = useCallback(() => {
    if (!pendingOffer) return;
    addMsg('system', 'You wave it off.');
    setPendingOffer(null);
    sfxClick();
  }, [pendingOffer, addMsg]);

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
      className="relative flex-1 min-h-0 flex flex-col"
    >
      <div className="grid gap-3 xl:grid-cols-[minmax(0,0.48fr)_minmax(0,1fr)] flex-1 min-h-0" style={{ fontFamily: '"DM Sans", sans-serif' }}>
        {/* ── Left column: scrollable NPC list + pinned Buy a round ── */}
        <div className="flex flex-col gap-3 min-h-0">
          {/* NPCs in the room. The card itself is the scroll container so
              the list scrolls inside while Buy a round stays pinned below. */}
          <div className="rounded-lg border border-white/[0.04] bg-white/[0.015] px-3 py-3 flex-1 min-h-0 flex flex-col">
            <div className="space-y-2 overflow-y-auto flex-1 min-h-0 scrollbar-thin -mr-1 pr-1">
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
                      className={`group flex w-full items-stretch rounded-lg border overflow-hidden text-left transition-all ${
                        isActive
                          ? 'border-amber-400/40 bg-amber-400/[0.06] shadow-[0_0_12px_rgba(201,168,76,0.15)]'
                          : isPending
                            ? 'border-amber-400/15'
                            : npc.revealed
                              ? 'border-white/[0.04] hover:border-white/[0.08] cursor-pointer'
                              : 'border-white/[0.03] cursor-default'
                      }`}
                    >
                      {/* Portrait — flush to card edges, no border. */}
                      <div
                        className={`shrink-0 self-stretch overflow-hidden ${
                          isPending ? 'animate-pulse' : ''
                        }`}
                        style={{ width: 104 }}
                      >
                        <ConfigPortrait
                          config={npc.portraitConfig}
                          size={104}
                          square
                        />
                      </div>

                      {/* Info — name in Fraunces serif, role as italic
                          stage-direction. Idle pose in sans-serif so the
                          two italic registers don't blur together. */}
                      <div className="min-w-0 flex-1 px-4 py-3 self-center">
                        {npc.revealed ? (
                          <>
                            <div
                              className="text-[18.5px] text-slate-100 leading-tight"
                              style={{
                                fontFamily: '"Fraunces", serif',
                                fontWeight: 560,
                                letterSpacing: '0.005em',
                                fontVariationSettings: '"opsz" 36',
                              }}
                            >
                              {npc.name}
                            </div>
                            <div
                              className="mt-0.5 text-[13.5px] text-slate-400/90 italic leading-tight"
                              style={{ fontFamily: '"Fraunces", serif' }}
                            >
                              {indefiniteArticle(npc.nationality)} {npc.nationality} {npc.role.title.toLowerCase()}
                            </div>
                            {isActive && (
                              <div className="mt-1.5 flex items-center gap-1 text-[12px] text-amber-300/75">
                                <MessageCircle size={11} /> speaking with you
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            <div
                              className="text-[14.5px] leading-[1.4] text-slate-300/90 italic line-clamp-2"
                              style={{ fontFamily: '"Fraunces", serif' }}
                            >
                              {npc.appearance}
                            </div>
                            <div className="mt-1 text-[12.5px] text-slate-500/90 italic leading-tight line-clamp-1">
                              {isPending ? (
                                <span className="text-amber-300/80 not-italic font-medium tracking-wide">
                                  approaching you&hellip;
                                </span>
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

          {/* Buy a round — pinned at the bottom of the left column. */}
          <div className="shrink-0 rounded-lg border border-white/[0.04] bg-white/[0.015] px-4 py-3">
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

        {/* ── Right column: conversation. Always fits the viewport — chat
            scrolls internally; header / suggestions / input stay put. ── */}
        <div className="flex flex-col rounded-lg border border-white/[0.04] bg-white/[0.015] min-h-0">
          {activeNpc ? (
            <>
              {/* Chat header with portrait — name + a stage-direction-style
                  role line in italic Fraunces. Avoids database-chip chrome. */}
              <div className="shrink-0 border-b border-white/[0.04] px-5 py-3 flex items-center gap-3.5">
                <div className="rounded-lg border-2 border-amber-400/30 overflow-hidden shadow-[0_0_10px_rgba(201,168,76,0.15)]">
                  <ConfigPortrait
                    config={activeNpc.portraitConfig}
                    size={44}
                    square
                  />
                </div>
                <div className="min-w-0">
                  <div
                    className="text-[17px] text-slate-100 leading-tight"
                    style={{
                      fontFamily: '"Fraunces", serif',
                      fontWeight: 550,
                      letterSpacing: '0.01em',
                      fontVariationSettings: '"opsz" 36',
                    }}
                  >
                    {activeNpc.revealed ? activeNpc.name : 'A stranger'}
                  </div>
                  <div
                    className="mt-0.5 text-[13px] text-slate-400 italic"
                    style={{ fontFamily: '"Fraunces", serif' }}
                  >
                    {activeNpc.revealed
                      ? `a ${activeNpc.nationality} ${activeNpc.role.title.toLowerCase()}`
                      : activeNpc.appearance}
                  </div>
                </div>
              </div>

              {/* Chat messages */}
              <div ref={chatScrollRef}
                className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4 scrollbar-thin scrollbar-thumb-white/10">
                <AnimatePresence>
                  {chatMessages.map((msg) => (
                    <div key={msg.id}>
                      <motion.div
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
                          <span
                            className="text-[13px] italic text-slate-600"
                            style={{ fontFamily: '"Fraunces", serif' }}
                          >
                            {msg.text}
                          </span>
                        ) : msg.sender === 'npc' ? (
                          // Period dialogue panel. Flat-edged with a thin
                          // top rule (slate, not amber — amber on amber was
                          // the AI tell). Markdown rendered inline so NPC
                          // can italicize action beats etc.
                          <div className="inline-block rounded-md border border-white/[0.07] border-t-slate-500/40 bg-white/[0.03] px-5 py-3.5">
                            <p
                              className="text-[16.5px] leading-[1.65]"
                              style={{
                                fontFamily: '"Fraunces", serif',
                                fontWeight: 400,
                                color: '#d4cdb8',
                              }}
                            >
                              {renderInlineMarkdown(msg.text)}
                            </p>
                          </div>
                        ) : (
                          <div className="inline-block rounded-md border border-white/[0.06] bg-white/[0.025] px-5 py-3">
                            <p
                              className="text-[15.5px] leading-[1.6] italic text-slate-300/80"
                              style={{ fontFamily: '"Fraunces", serif' }}
                            >
                              {msg.text}
                            </p>
                          </div>
                        )}
                      </motion.div>
                      {pendingOffer && pendingOffer.messageId === msg.id && (
                        <TavernOfferCard
                          offer={pendingOffer.offer}
                          capReached={activeTavernLeadCount >= TAVERN_LEAD_CAP}
                          onAccept={handleAcceptOffer}
                          onDecline={handleDeclineOffer}
                        />
                      )}
                    </div>
                  ))}
                </AnimatePresence>

                {/* Loading indicator */}
                {isLoading && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="pr-6"
                  >
                    <div className="inline-flex items-center gap-2 rounded-md border border-white/[0.06] border-t-slate-500/30 bg-white/[0.02] px-4 py-3">
                      <Loader2 size={14} className="animate-spin text-slate-500" />
                      <span
                        className="text-[14px] italic text-slate-500"
                        style={{ fontFamily: '"Fraunces", serif' }}
                      >
                        {activeNpc.revealed ? activeNpc.name : 'The stranger'} considers&hellip;
                      </span>
                    </div>
                  </motion.div>
                )}

                <div ref={chatEndRef} />
              </div>

              {/* Suggested responses \u2014 DM Sans, compact, no leader glyph.
                  Per-type accent color is the only visual differentiator;
                  the label itself does the work. */}
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
                        className={`flex w-full items-center rounded-lg border px-4 py-2.5 text-left text-[14px] leading-tight transition-all active:scale-[0.99] disabled:opacity-40 ${
                          opt.type === 'show_item'
                            ? 'border-sky-400/15 bg-sky-400/[0.03] text-sky-300/80 hover:border-sky-400/25 hover:bg-sky-400/[0.06] hover:text-sky-200'
                            : opt.type === 'farewell'
                              ? 'border-white/[0.03] bg-transparent text-slate-500 hover:border-white/[0.06] hover:text-slate-300'
                              : opt.type === 'buy_drink'
                                ? 'border-emerald-400/15 bg-emerald-400/[0.03] text-emerald-300/80 hover:border-emerald-400/25 hover:bg-emerald-400/[0.06] hover:text-emerald-200'
                                : 'border-white/[0.04] bg-white/[0.02] text-slate-300 hover:border-white/[0.10] hover:bg-white/[0.04] hover:text-slate-100'
                        }`}
                      >
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

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Beer, MessageCircle } from 'lucide-react';
import { useGameStore } from '../store/gameStore';
import type { Port } from '../store/gameStore';
import type { Commodity } from '../utils/commodities';
import { COMMODITY_DEFS } from '../utils/commodities';
import { generateTavernNpcs, type TavernNpc } from '../utils/tavernNpcGenerator';
import { getEffectiveKnowledge } from '../utils/knowledgeSystem';
import { sfxCoin, sfxClick, sfxHover, sfxDiscovery } from '../audio/SoundEffects';
import { ConfigPortrait } from './CrewPortrait';

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
  const timeOfDay = useGameStore(s => s.timeOfDay);
  const knowledgeState = useGameStore(s => s.knowledgeState);
  const learnAboutCommodity = useGameStore(s => s.learnAboutCommodity);
  const addJournalEntry = useGameStore(s => s.addJournalEntry);

  const [npcs, setNpcs] = useState<TavernNpc[]>([]);
  const [roundsBought, setRoundsBought] = useState(0);
  const [activeNpcId, setActiveNpcId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [pendingApproach, setPendingApproach] = useState<string | null>(null);
  const [revealedGoods, setRevealedGoods] = useState<Set<string>>(new Set());
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Generate NPCs on mount
  useEffect(() => {
    setNpcs(generateTavernNpcs(port, timeOfDay));
    setRoundsBought(0);
    setActiveNpcId(null);
    setChatMessages([]);
    setPendingApproach(null);
    setRevealedGoods(new Set());
  }, [port.id]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const activeNpc = npcs.find(n => n.id === activeNpcId);

  const addMsg = useCallback((sender: ChatMessage['sender'], text: string) => {
    setChatMessages(prev => [...prev, {
      id: Math.random().toString(36).substring(2, 9),
      sender,
      text,
    }]);
  }, []);

  // ── Buy a round ──
  const handleBuyRound = () => {
    if (gold < 5) return;
    sfxCoin(5);
    useGameStore.setState({ gold: gold - 5 });
    setRoundsBought(r => r + 1);

    // Find an NPC who will approach
    const approacher = npcs.find(n => n.willApproach && !n.revealed);
    if (approacher) {
      // Delay the approach for drama
      setPendingApproach(approacher.id);
      setTimeout(() => {
        setPendingApproach(null);
        setActiveNpcId(approacher.id);
        setNpcs(prev => prev.map(n =>
          n.id === approacher.id ? { ...n, revealed: true } : n
        ));
        setChatMessages([{
          id: Math.random().toString(36).substring(2, 9),
          sender: 'npc',
          text: approacher.approachLine,
        }]);
      }, 1200);
    } else {
      // No one approaches — pick a random unrevealed NPC, or add ambient text
      const unrevealed = npcs.filter(n => !n.revealed);
      if (unrevealed.length > 0) {
        const chosen = unrevealed[Math.floor(Math.random() * unrevealed.length)];
        // Mark them as willing to approach next time
        setNpcs(prev => prev.map(n =>
          n.id === chosen.id ? { ...n, willApproach: true } : n
        ));
        setPendingApproach(chosen.id);
        setTimeout(() => {
          setPendingApproach(null);
          setActiveNpcId(chosen.id);
          setNpcs(prev => prev.map(n =>
            n.id === chosen.id ? { ...n, revealed: true } : n
          ));
          setChatMessages([{
            id: Math.random().toString(36).substring(2, 9),
            sender: 'npc',
            text: chosen.approachLine,
          }]);
        }, 1200);
      } else {
        addMsg('system', 'The room stirs, but no one new approaches.');
      }
    }
  };

  // ── Conversation options ──

  function getConversationOptions(): { label: string; action: () => void }[] {
    if (!activeNpc) return [];
    const options: { label: string; action: () => void }[] = [];

    // Find unknown goods in cargo that this NPC could identify
    const unknownInCargo = Object.entries(cargo)
      .filter(([c, qty]) => qty > 0 && getEffectiveKnowledge(c, knowledgeState, crew) === 0)
      .map(([c]) => c as Commodity)
      .filter(c => activeNpc.role.knowledgeDomain.includes(c));

    // Find unknown goods at port that NPC knows
    const unknownAtPort = Object.entries(port.inventory)
      .filter(([c, qty]) => qty > 0 && getEffectiveKnowledge(c, knowledgeState, crew) === 0)
      .map(([c]) => c as Commodity)
      .filter(c => activeNpc.role.knowledgeDomain.includes(c))
      .filter(c => !unknownInCargo.includes(c));

    if (unknownInCargo.length > 0 && !revealedGoods.has(unknownInCargo[0])) {
      const good = unknownInCargo[0];
      const def = COMMODITY_DEFS[good];
      options.push({
        label: `Show them the ${def.physicalDescription.toLowerCase()}`,
        action: () => handleIdentifyCargo(good),
      });
    }

    if (unknownAtPort.length > 0 && !revealedGoods.has(unknownAtPort[0])) {
      const good = unknownAtPort[0];
      const def = COMMODITY_DEFS[good];
      options.push({
        label: `Ask about the ${def.physicalDescription.toLowerCase()} in the market`,
        action: () => handleIdentifyMarketGood(good),
      });
    }

    // General conversation
    const topic = activeNpc.role.conversationTopics[
      Math.floor(Math.random() * activeNpc.role.conversationTopics.length)
    ];
    options.push({
      label: `Ask about ${topic}`,
      action: () => handleGeneralChat(topic),
    });

    if (!activeNpc.revealed || chatMessages.length <= 1) {
      options.push({
        label: '"Who are you?"',
        action: () => handleAskIdentity(),
      });
    }

    options.push({
      label: 'End conversation',
      action: () => {
        sfxClick();
        addMsg('system', `${activeNpc!.revealed ? activeNpc!.name : 'The stranger'} nods and returns to their drink.`);
        setActiveNpcId(null);
      },
    });

    return options;
  }

  function handleAskIdentity() {
    if (!activeNpc) return;
    sfxClick();
    addMsg('player', 'Who are you?');
    setNpcs(prev => prev.map(n =>
      n.id === activeNpc.id ? { ...n, revealed: true } : n
    ));
    setTimeout(() => {
      const pronoun = activeNpc.isFemale ? 'She' : 'He';
      addMsg('npc', `${pronoun} introduces ${activeNpc.isFemale ? 'herself' : 'himself'}. "${activeNpc.name}. I am a ${activeNpc.role.title} — been in ${port.name} for some time now."`);
    }, 400);
  }

  function handleIdentifyCargo(good: Commodity) {
    if (!activeNpc) return;
    sfxClick();
    const def = COMMODITY_DEFS[good];
    addMsg('player', `I show them the ${def.physicalDescription.toLowerCase()}.`);

    setTimeout(() => {
      // 80% chance of correct identification, 20% wrong (tavern gossip is unreliable)
      const isCorrect = Math.random() < 0.80;
      if (isCorrect) {
        const pronoun = activeNpc.isFemale ? 'She' : 'He';
        addMsg('npc', `${pronoun} turns it over in ${activeNpc.isFemale ? 'her' : 'his'} hands. "Ah, this I know. This is ${good}. ${def.description}"`);
        learnAboutCommodity(good, 1, `a ${activeNpc.role.title} in ${port.name}`);
        setRevealedGoods(prev => new Set([...prev, good]));
        sfxDiscovery();
      } else {
        // Misidentification — gives wrong info
        const wrongGoods = activeNpc.role.knowledgeDomain.filter(g => g !== good);
        const wrongGood = wrongGoods.length > 0 ? wrongGoods[Math.floor(Math.random() * wrongGoods.length)] : good;
        const wrongDef = COMMODITY_DEFS[wrongGood];
        addMsg('npc', `"Yes, yes — I believe this is ${wrongGood}. ${wrongDef.description}" (The identification seems uncertain.)`);
        setRevealedGoods(prev => new Set([...prev, good]));
      }
    }, 600);
  }

  function handleIdentifyMarketGood(good: Commodity) {
    if (!activeNpc) return;
    sfxClick();
    const def = COMMODITY_DEFS[good];
    addMsg('player', `"I saw ${def.physicalDescription.toLowerCase()} for sale at the market. Do you know what it is?"`);

    setTimeout(() => {
      const isCorrect = Math.random() < 0.80;
      if (isCorrect) {
        addMsg('npc', `"That would be ${good}. ${def.description} You should consider buying some — it trades well."`);
        learnAboutCommodity(good, 1, `a ${activeNpc.role.title} in ${port.name}`);
        setRevealedGoods(prev => new Set([...prev, good]));
        sfxDiscovery();
      } else {
        addMsg('npc', `"Hmm, I am not entirely sure, but I believe that is something from the south. Valuable, they say." (Doesn't seem very confident.)`);
        setRevealedGoods(prev => new Set([...prev, good]));
      }
    }, 600);
  }

  function handleGeneralChat(topic: string) {
    if (!activeNpc) return;
    sfxClick();
    addMsg('player', `I ask about ${topic}.`);

    setTimeout(() => {
      const responses = generateTopicResponse(activeNpc, topic, port);
      addMsg('npc', responses);
    }, 500);
  }

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
              <div className="text-[11px] font-bold tracking-[0.12em] uppercase text-slate-500">
                The Room
                <span className="ml-2 font-normal text-slate-600">
                  {timeOfDay >= 17 || timeOfDay < 6 ? 'evening' : timeOfDay >= 12 ? 'afternoon' : 'morning'}
                </span>
              </div>
              <div className="text-[11px] text-slate-600">
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
                        if (npc.revealed && !isActive) {
                          sfxClick();
                          setActiveNpcId(npc.id);
                          if (!chatMessages.length || chatMessages[chatMessages.length - 1]?.sender === 'system') {
                            setChatMessages([{
                              id: Math.random().toString(36).substring(2, 9),
                              sender: 'npc',
                              text: `"Yes? What do you want?"`,
                            }]);
                          }
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
                          size={52}
                          square
                        />
                      </div>

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        {npc.revealed ? (
                          <>
                            <div className="flex items-center gap-2">
                              <span className="text-[14px] font-bold text-slate-200">
                                {npc.name}
                              </span>
                              <span className="rounded-full border border-white/[0.06] bg-white/[0.03] px-2 py-0.5 text-[10px] text-slate-500">
                                {npc.nationality} {npc.role.title}
                              </span>
                            </div>
                            {isActive && (
                              <div className="mt-1 flex items-center gap-1 text-[11px] text-amber-300/60">
                                <MessageCircle size={10} /> talking to you
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            <div className="text-[13px] leading-snug text-slate-300">
                              {npc.appearance}
                            </div>
                            <div className="mt-1 text-[12px] text-slate-500 italic">
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
              disabled={gold < 5}
              onMouseEnter={() => sfxHover()}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.06] px-4 py-3 text-[13px] font-bold text-emerald-200/80 transition-all hover:border-emerald-400/35 hover:bg-emerald-400/[0.10] hover:text-emerald-100 active:scale-[0.98] disabled:cursor-not-allowed disabled:border-white/[0.04] disabled:bg-white/[0.015] disabled:text-slate-700"
            >
              <Beer size={15} />
              Buy a round — 5g
            </button>
            {roundsBought > 0 && (
              <div className="mt-2.5 text-center text-[12px] text-slate-500">
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
                  <div className="text-[13px] font-bold text-slate-200">
                    {activeNpc.revealed ? activeNpc.name : 'A stranger'}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {activeNpc.revealed ? `${activeNpc.nationality} ${activeNpc.role.title}` : activeNpc.appearance}
                  </div>
                </div>
              </div>

              {/* Chat messages */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 max-h-[45vh] scrollbar-thin scrollbar-thumb-white/10">
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
                        <span className="text-[12px] italic text-slate-600">
                          {msg.text}
                        </span>
                      ) : msg.sender === 'npc' ? (
                        <div className="inline-block rounded-lg rounded-tl-none border border-white/[0.06] bg-white/[0.03] px-4 py-3">
                          <p className="text-[13px] leading-relaxed text-slate-300">
                            {msg.text}
                          </p>
                        </div>
                      ) : (
                        <div className="inline-block rounded-lg rounded-tr-none border border-amber-400/15 bg-amber-400/[0.04] px-4 py-3">
                          <p className="text-[13px] leading-relaxed text-amber-200/70">
                            {msg.text}
                          </p>
                        </div>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
                <div ref={chatEndRef} />
              </div>

              {/* Response options */}
              <div className="shrink-0 border-t border-white/[0.04] px-5 py-4">
                <div className="space-y-2">
                  {getConversationOptions().map((opt, i) => (
                    <button
                      key={i}
                      type="button"
                      onMouseEnter={() => sfxHover()}
                      onClick={opt.action}
                      className="group flex w-full items-center gap-2.5 rounded-lg border border-white/[0.04] bg-white/[0.02] px-4 py-2.5 text-left text-[13px] text-slate-400 transition-all hover:border-white/[0.08] hover:bg-white/[0.04] hover:text-slate-200 active:scale-[0.99]"
                    >
                      <span className="text-[12px] text-slate-600 group-hover:text-amber-300/50">{'>'}</span>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            /* Empty state — no conversation yet */
            <div className="flex flex-1 flex-col items-center justify-center px-8 py-16 text-center">
              <Beer size={28} className="mb-4 text-slate-700/40" />
              <div className="text-[13px] font-bold text-slate-600">
                {roundsBought === 0
                  ? 'No one has spoken to you yet'
                  : pendingApproach
                    ? 'Someone stirs...'
                    : 'Buy a round to loosen tongues'
                }
              </div>
              <p className="mt-2 max-w-[280px] text-[13px] leading-relaxed text-slate-600">
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

// ── Topic response generation ──
// Procedural responses based on NPC role, topic, and port context.

function generateTopicResponse(npc: TavernNpc, topic: string, port: Port): string {
  const pronoun = npc.isFemale ? 'She' : 'He';
  const possessive = npc.isFemale ? 'her' : 'his';

  const portName = port.name;

  const responses: Record<string, string[]> = {
    'spice prices': [
      `${pronoun} lowers ${possessive} voice. "Pepper is cheap here but sells for three times the price in the west. The real money is in the fine spices — cloves, nutmeg. If you can get them."`,
      `"Prices shift with the monsoon. Buy now, before the winds change and the ships from the west arrive. They drive everything up."`,
      `${pronoun} shrugs. "Everyone wants pepper. But the margins are thin now — too many ships. The wise trader looks to rarer goods."`,
    ],
    'trade routes': [
      `"The route from ${portName} to the west is long but profitable. The trick is knowing when the winds favor you."`,
      `${pronoun} traces a line on the table with ${possessive} finger. "Follow the coast. The open water is faster but the storms will kill you."`,
      `"I have heard that the Dutch are pushing into new waters. The old routes may not be safe much longer."`,
    ],
    'the monsoon': [
      `"The southwest monsoon comes soon. After that, no ship sails west for months. Plan accordingly."`,
      `${pronoun} glances toward the harbor. "The winds are everything. Miss the monsoon and you wait half a year."`,
    ],
    'medicinal uses': [
      `${pronoun} becomes animated. "Half of what they sell at market is useless — or worse, adulterated. You must know what you are buying."`,
      `"The physicians here use things that would astonish a European doctor. Some of it works. Some of it kills you."`,
    ],
    'adulteration': [
      `${pronoun} scowls. "Trust nothing you buy from a stranger. Saffron cut with safflower, cinnamon that is really cassia. The fraud is everywhere."`,
      `"I have seen bezoar stones that were nothing but painted clay. The only defense is knowledge — or a trustworthy factor."`,
    ],
    'pirates': [
      `"The waters south of here are dangerous. Ships disappear. The Portuguese claim to patrol, but..." ${pronoun} trails off.`,
      `${pronoun} drops ${possessive} voice. "There is a captain — I will not say his name — who takes what he wants between here and the straits."`,
    ],
    'the sea': [
      `${pronoun} stares at nothing. "I have sailed these waters for twenty years. The sea takes what it wants."`,
      `"The currents here shift with the season. What is safe in January will drown you in June."`,
    ],
    'distant ports': [
      `"I was in Hormuz last year. The Persians trade in pearls and rose water — beautiful things, and profitable if you can get them here."`,
      `"Have you been to Macau? The Chinese goods there — porcelain, silk, medicines — fetch extraordinary prices in the west."`,
    ],
    'the garrison': [
      `${pronoun} glances around. "The garrison is undermanned and underpaid. The soldiers are more interested in trade than defense."`,
      `"The fort looks strong from the sea, but inside it is rotting. The governor knows, but what can he do without funds?"`,
    ],
    'local politics': [
      `"There are tensions here that a stranger would not see. Be careful whose favor you seek — it may cost you elsewhere."`,
      `${pronoun} says nothing for a moment. "Power changes hands in this port more often than you think. Stay flexible."`,
    ],
    'natural philosophy': [
      `${pronoun}'s eyes light up. "The materia medica of the East is far richer than anything in Dioscorides. I have seen remedies here that work when European medicine fails."`,
      `"Classification is the great challenge. The same substance goes by ten names in ten ports. One must learn to see past the name to the thing itself."`,
    ],
    'cures': [
      `"China root — they swear by it for the French disease. Whether it truly works..." ${pronoun} tilts ${possessive} hand uncertainly.`,
      `"Bezoar stones are the fashion in every court from Isfahan to Lisbon. Supposed to cure any poison. Most of them are fake."`,
    ],
  };

  const topicResponses = responses[topic];
  if (topicResponses) {
    return topicResponses[Math.floor(Math.random() * topicResponses.length)];
  }

  // Fallback
  return `${pronoun} considers the question. "I know a little about ${topic}, but not enough to say anything useful. You might ask someone else."`;
}

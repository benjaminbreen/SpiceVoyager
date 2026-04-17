// ── Tavern Conversation Service ──
//
// Integrates Gemini Flash Lite to power NPC conversations in taverns.
// Builds rich context from NPC personality, game state, and information
// asymmetry so NPCs feel like real people — not trade-info dispensers.

import type { Port, CrewMember, Nationality } from '../store/gameStore';
import type { Commodity } from './commodities';
import { COMMODITY_DEFS } from './commodities';
import type { TavernNpc } from './tavernNpcGenerator';
import type { KnowledgeLevel } from './knowledgeSystem';
import { getEffectiveKnowledge } from './knowledgeSystem';

// ── Types ──

export interface ConversationMessage {
  role: 'user' | 'model';
  text: string;
}

export interface SuggestedResponse {
  label: string;
  type: 'question' | 'show_item' | 'share_info' | 'farewell' | 'buy_drink';
  itemId?: Commodity;       // for show_item type — which cargo item to show
}

export interface TavernLLMResponse {
  npcDialogue: string;
  suggestedResponses: SuggestedResponse[];
  knowledgeReveal?: {
    commodityId: Commodity;
    level: 1 | 2;
  };
  reputationShift?: {
    nationality: Nationality;
    delta: number;           // small shifts: -2 to +2
  };
}

// ── Context Builder ──

/**
 * Builds the system instruction for a tavern NPC conversation.
 * This is the most important part — it defines who the NPC is and what they
 * can perceive about the player.
 */
export function buildNpcSystemPrompt(
  npc: TavernNpc,
  port: Port,
  playerState: {
    ship: { name: string; type: string; flag: Nationality; armed: boolean };
    crew: CrewMember[];
    cargo: Record<string, number>;
    knowledgeState: Record<string, KnowledgeLevel>;
    gold: number;
    timeOfDay: number;
    dayCount: number;
    reputation: Partial<Record<Nationality, number>>;
  },
  conversationState: {
    playerHasIntroduced: boolean;
    npcHasIntroduced: boolean;
    revealedGoods: Set<string>;
    roundsBought: number;
  },
): string {
  const { personality } = npc;
  const pronoun = npc.isFemale ? 'she' : 'he';
  const possessive = npc.isFemale ? 'her' : 'his';
  const captain = playerState.crew.find(c => c.role === 'Captain') ?? playerState.crew[0];

  // Time context
  const hour = playerState.timeOfDay;
  const timeDesc = hour >= 20 || hour < 5 ? 'late at night'
    : hour >= 17 ? 'in the evening'
    : hour >= 12 ? 'in the afternoon'
    : hour >= 8 ? 'in the morning'
    : 'in the early morning';

  // What the NPC can observe about the player's ship at the dock
  const shipDesc = `${playerState.ship.armed ? 'an armed' : 'a'} ${playerState.ship.type} flying ${playerState.ship.flag} colors called "${playerState.ship.name}"`;

  // Crew composition the NPC could observe
  const crewNats = playerState.crew.reduce((acc, c) => {
    acc[c.nationality] = (acc[c.nationality] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const crewDesc = Object.entries(crewNats)
    .map(([nat, count]) => `${count} ${nat}`)
    .join(', ');

  // Unknown goods in the NPC's domain that the player carries — used ONLY
  // for the response-format hint so the LLM can generate show_item suggestions.
  // We do NOT tell the NPC what the player is carrying; the NPC only sees items
  // when the player explicitly shows them.
  const unknownCargoInDomain = Object.entries(playerState.cargo)
    .filter(([c, qty]) => qty > 0
      && getEffectiveKnowledge(c, playerState.knowledgeState, playerState.crew) === 0
      && npc.role.knowledgeDomain.includes(c as Commodity))
    .map(([c]) => c as Commodity);

  // Reputation the NPC's faction has toward the player
  const factionRep = playerState.reputation[npc.nationality] ?? 0;
  const repDesc = factionRep <= -60 ? 'deeply hostile'
    : factionRep <= -25 ? 'suspicious and unfriendly'
    : factionRep <= 10 ? 'neutral'
    : factionRep <= 40 ? 'warm and welcoming'
    : 'very friendly, like an old ally';

  // Build the prompt
  return `You are roleplaying as ${npc.name}, a ${npc.nationality} ${npc.role.title} in a tavern in ${port.name}. The year is approximately 1600-1620. This is a historically grounded simulation of Indian Ocean maritime trade.

CHARACTER:
- Name: ${npc.name}
- Nationality: ${npc.nationality}
- Role: ${npc.role.title}
- Gender: ${npc.isFemale ? 'female' : 'male'} (use ${pronoun}/${possessive} pronouns for yourself)
- Appearance: ${npc.appearance}
- Temperament: ${personality.temperament}
- Speech style: ${personality.speechStyle}
- Personal quirk: ${personality.quirk}
- Background: ${personality.backstoryHook}
- Current preoccupation: ${personality.preoccupation}
- Drinking habit: ${personality.drinkingHabit}
- Attitude toward strangers: ${personality.attitude}

EXPERTISE:
- Trade knowledge: ${npc.role.knowledgeDomain.join(', ')}
- Conversation topics: ${npc.role.conversationTopics.join(', ')}
- You can identify goods in your knowledge domain if shown physical specimens.

SETTING:
- Location: A tavern in ${port.name}, ${timeDesc}
- Port culture: ${port.culture || 'cosmopolitan trading port'}
${conversationState.roundsBought > 0 ? `- The stranger has bought ${conversationState.roundsBought} round(s) of drinks for the tavern.` : ''}

WHAT YOU CAN OBSERVE ABOUT THE STRANGER:
- Their ship: ${shipDesc} is docked at the harbor
- Their crew appears to be: ${crewDesc} (${playerState.crew.length} total)
- The ${npc.nationality} generally feel ${repDesc} toward this person's kind
${conversationState.playerHasIntroduced && captain ? `- They introduced themselves as ${captain.name}` : '- You do NOT know their name yet'}
${!conversationState.playerHasIntroduced ? '- You do NOT know where they are from or where they have sailed' : ''}

IMPORTANT RULES:
1. Stay in character at all times. You are a real person in 1600, not an AI.
2. Be concise — 1-3 sentences per response typically. Occasionally longer for stories or important reveals.
3. Mix trade-relevant conversation with personal details naturally. You are a person first, a trade source second.
4. Your personality traits should color everything you say. If you are melancholic, show it. If you drink heavily, let it affect your speech.
5. You do NOT know: the player's exact gold, their cargo manifest (unless shown), game mechanics, anything anachronistic.
6. You CAN: share trade knowledge from your domain, tell stories, ask personal questions, react emotionally, refuse to help, be unreliable.
7. Do not use modern language or anachronisms. Speak as a person of this era would.
8. Do not be a mere information dispenser. Have your own agenda, moods, and concerns.
9. If someone shows you a good from your knowledge domain, you may identify it — but you are not always 100% certain.
10. React naturally to social cues: if the player is rude, get offended. If generous, warm up.

RESPONSE FORMAT:
You must respond with valid JSON only (no markdown, no code fences). Use this exact structure:
{
  "npcDialogue": "What you say (in character, 1-3 sentences usually)",
  "suggestedResponses": [
    {"label": "Short button text for a suggested player response", "type": "question"},
    {"label": "Another option", "type": "question"}
  ],
  "knowledgeReveal": null,
  "reputationShift": null
}

For suggestedResponses, always include 2-3 options. Types can be:
- "question": a question or conversational response
- "show_item": showing a cargo item (include "itemId" field with the commodity name). Only suggest this when the player has actively shown you a physical item. Items you could identify from your expertise: ${unknownCargoInDomain.length > 0 ? unknownCargoInDomain.map(c => `"${c}"`).join(', ') : 'none currently relevant'}
- "share_info": the player volunteers personal information
- "farewell": ending the conversation
- "buy_drink": offering to buy you a drink

For knowledgeReveal, set this ONLY when you have examined a physical specimen and are giving a confident identification. Use the real commodity name as commodityId. Set to null otherwise. Format: {"commodityId": "Black Pepper", "level": 1}

For reputationShift, set this ONLY when the conversation significantly shifts your opinion of this person — if they insult your people, are very generous, share important news, etc. Small shifts only (-2 to +2). Use YOUR nationality. Format: {"nationality": "${npc.nationality}", "delta": 1}. Set to null otherwise.`;
}

// ── Build user message with game context ──

/**
 * Wraps the player's message with any relevant context the NPC would perceive.
 */
export function buildUserMessage(
  playerText: string,
  showingItem?: Commodity,
): string {
  if (showingItem) {
    const def = COMMODITY_DEFS[showingItem];
    if (def) {
      return `[The player shows you a physical specimen: ${def.physicalDescription}. They want to know what it is.]\n\nPlayer says: "${playerText}"`;
    }
  }
  return playerText;
}

// ── Rate Limiter ──

const RATE_LIMIT = {
  minIntervalMs: 2000,       // minimum 2s between calls
  maxPerMinute: 12,          // max 12 calls per minute
  maxPerSession: 100,        // hard cap per tavern visit
};

let _lastCallTime = 0;
let _callTimestamps: number[] = [];
let _sessionCallCount = 0;

/** Reset rate limiter state (call when entering a new tavern) */
export function resetRateLimiter() {
  _lastCallTime = 0;
  _callTimestamps = [];
  _sessionCallCount = 0;
}

function checkRateLimit(): string | null {
  const now = Date.now();

  if (_sessionCallCount >= RATE_LIMIT.maxPerSession) {
    return 'You have been talking for a very long time. The tavern is closing.';
  }

  if (now - _lastCallTime < RATE_LIMIT.minIntervalMs) {
    return null; // silent skip — will be caught by isLoading guard anyway
  }

  // Prune timestamps older than 60s
  _callTimestamps = _callTimestamps.filter(t => now - t < 60_000);
  if (_callTimestamps.length >= RATE_LIMIT.maxPerMinute) {
    return 'You are speaking too quickly. Take a breath.';
  }

  return null;
}

function recordCall() {
  const now = Date.now();
  _lastCallTime = now;
  _callTimestamps.push(now);
  _sessionCallCount++;
}

// ── API Call ──

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent';
const REQUEST_TIMEOUT_MS = 15_000; // 15 second timeout

export async function callGeminiTavern(
  systemPrompt: string,
  conversationHistory: ConversationMessage[],
  userMessage: string,
  abortSignal?: AbortSignal,
): Promise<TavernLLMResponse> {
  // Rate limit check
  const rateLimitMsg = checkRateLimit();
  if (rateLimitMsg) {
    return {
      npcDialogue: rateLimitMsg,
      suggestedResponses: [
        { label: 'Take a moment', type: 'question' },
        { label: 'Walk away', type: 'farewell' },
      ],
    };
  }

  // Vite replaces process.env.GEMINI_API_KEY at build time via the `define` in vite.config.ts
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return {
      npcDialogue: '"I have nothing more to say right now." He stares into his drink.',
      suggestedResponses: [
        { label: 'Ask about trade in the region', type: 'question' },
        { label: 'Take your leave', type: 'farewell' },
      ],
    };
  }

  recordCall();

  // Build the Gemini request with conversation history
  const contents = [
    ...conversationHistory.map(msg => ({
      role: msg.role,
      parts: [{ text: msg.text }],
    })),
    {
      role: 'user' as const,
      parts: [{ text: userMessage }],
    },
  ];

  const body = {
    system_instruction: {
      parts: [{ text: systemPrompt }],
    },
    contents,
    generationConfig: {
      temperature: 1.0,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 400,
      responseMimeType: 'application/json',
    },
  };

  // Timeout via AbortController if no external signal provided
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);
  const signal = abortSignal
    ? mergeAbortSignals(abortSignal, timeoutController.signal)
    : timeoutController.signal;

  try {
    const res = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Gemini API error:', res.status, errText);
      return {
        npcDialogue: 'He seems distracted and does not respond clearly.',
        suggestedResponses: [
          { label: 'Try again', type: 'question' },
          { label: 'Walk away', type: 'farewell' },
        ],
      };
    }

    const data = await res.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      return {
        npcDialogue: 'He murmurs something you cannot quite make out.',
        suggestedResponses: [
          { label: 'Ask him to repeat himself', type: 'question' },
          { label: 'Nod and walk away', type: 'farewell' },
        ],
      };
    }

    return parseGeminiResponse(rawText);
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Merge two AbortSignals — aborts when either fires. */
function mergeAbortSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  a.addEventListener('abort', onAbort, { once: true });
  b.addEventListener('abort', onAbort, { once: true });
  return controller.signal;
}

// ── Response Parser ──

function parseGeminiResponse(rawText: string): TavernLLMResponse {
  try {
    // Try direct JSON parse
    const parsed = JSON.parse(rawText);
    return validateResponse(parsed);
  } catch {
    // Try to extract JSON from markdown fences or surrounding text
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return validateResponse(parsed);
      } catch { /* fall through */ }
    }

    // If all parsing fails, use the raw text as dialogue
    return {
      npcDialogue: rawText.slice(0, 500),
      suggestedResponses: [
        { label: 'Continue the conversation', type: 'question' },
        { label: 'Take your leave', type: 'farewell' },
      ],
    };
  }
}

/**
 * Optional NPC context for validating knowledge reveals against
 * the NPC's actual expertise domain.
 */
let _currentNpcDomain: Commodity[] = [];

/** Call before sending a request to set the NPC's knowledge domain for validation. */
export function setCurrentNpcDomain(domain: Commodity[]) {
  _currentNpcDomain = domain;
}

function validateResponse(parsed: any): TavernLLMResponse {
  const result: TavernLLMResponse = {
    npcDialogue: typeof parsed.npcDialogue === 'string'
      ? parsed.npcDialogue
      : 'He nods silently.',
    suggestedResponses: [],
  };

  // Validate suggested responses
  if (Array.isArray(parsed.suggestedResponses)) {
    result.suggestedResponses = parsed.suggestedResponses
      .filter((r: any) => r && typeof r.label === 'string')
      .slice(0, 4)
      .map((r: any) => ({
        label: r.label.slice(0, 120),
        type: ['question', 'show_item', 'share_info', 'farewell', 'buy_drink'].includes(r.type) ? r.type : 'question',
        ...(r.itemId ? { itemId: r.itemId } : {}),
      }));
  }

  // Ensure we always have at least a farewell option
  if (result.suggestedResponses.length === 0) {
    result.suggestedResponses = [
      { label: 'Continue talking', type: 'question' },
      { label: 'Take your leave', type: 'farewell' },
    ];
  }

  // Validate knowledge reveal — must be a real commodity AND in the NPC's domain
  if (parsed.knowledgeReveal && typeof parsed.knowledgeReveal === 'object') {
    const kr = parsed.knowledgeReveal;
    if (typeof kr.commodityId === 'string'
      && COMMODITY_DEFS[kr.commodityId as Commodity]
      && (_currentNpcDomain.length === 0 || _currentNpcDomain.includes(kr.commodityId as Commodity))
    ) {
      result.knowledgeReveal = {
        commodityId: kr.commodityId as Commodity,
        level: kr.level === 2 ? 2 : 1,
      };
    }
  }

  // Validate reputation shift
  if (parsed.reputationShift && typeof parsed.reputationShift === 'object') {
    const rs = parsed.reputationShift;
    if (typeof rs.nationality === 'string' && typeof rs.delta === 'number') {
      result.reputationShift = {
        nationality: rs.nationality as Nationality,
        delta: Math.max(-2, Math.min(2, Math.round(rs.delta))),
      };
    }
  }

  return result;
}

// ── Build initial greeting context ──

/**
 * Creates the first message to send to Gemini when the NPC approaches.
 * The NPC initiates the conversation, so we send a "user" message that
 * describes the scene rather than dialogue.
 */
export function buildInitialSceneMessage(npc: TavernNpc, port: Port): string {
  return `[Scene: You are sitting in a tavern in ${port.name}. A stranger has just entered — or perhaps bought a round of drinks. You notice them and decide to approach or respond. Begin the conversation in character. Remember: you don't know who they are yet. Open naturally based on your personality and what you can observe about them.]`;
}

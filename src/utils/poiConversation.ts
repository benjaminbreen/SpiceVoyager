// ── POI Conversation Service ────────────────────────────────────────────────
//
// Gemini-powered roleplay for the POI Converse tab. Mirrors
// tavernConversation.ts but parameterized on POIDefinition rather than a
// procedural TavernNpc — POIs have a single, fixed NPC per site (the
// apothecary, the priest, the foreman) whose persona comes from the POI's
// hand-authored `lore`, `npcName`, `npcRole`, semantic class, and port.
//
// Same pattern as tavern: build a system prompt, send conversation history
// + new user message, validate JSON response. Rate limiter is per-session
// (per POI visit) — call resetRateLimiter() when opening the modal.

import type { Port } from '../store/gameStore';
import type { POIDefinition } from './poiDefinitions';
import { COMMODITY_DEFS } from './commodities';

// ── Types ──

export interface POIConversationMessage {
  role: 'user' | 'model';
  text: string;
}

export interface POISuggestedResponse {
  label: string;
  type: 'question' | 'farewell' | 'request_lesson' | 'show_item';
}

export interface POILLMResponse {
  npcDialogue: string;
  suggestedResponses: POISuggestedResponse[];
}

// ── System prompt builder ──

export function buildPOISystemPrompt(poi: POIDefinition, port: Port): string {
  const knowledgeList = poi.knowledgeDomain
    .map((c) => COMMODITY_DEFS[c]?.id ?? c)
    .join(', ');

  const masteryList = poi.masteryGoods.length
    ? poi.masteryGoods.map((c) => COMMODITY_DEFS[c]?.id ?? c).join(', ')
    : '(none)';

  const classFlavor: Record<string, string> = {
    religious: 'You are a religious figure. Spiritual concerns shape your speech; you are not eager to be a trade-information dispenser. Hospitality and sacrament come before commerce.',
    learned: 'You are a scholar. You speak with the precision of someone who reads, names, and grades materia medica. You distrust unsupported claims and enjoy being asked specific questions.',
    mercantile: 'You are a merchant or factor. Time is money; you are friendly but transactional. You may show off your expertise to a paying customer.',
    civic: 'You are a civic official. You speak with care about jurisdiction, custom, and protocol.',
    royal: 'You are a court figure. You expect deference. You are exquisitely sensitive to rank and station.',
  };

  return `You are roleplaying as ${poi.npcName}, ${poi.npcRole}, at ${poi.name} in ${port.name}. The year is 1612. This is a historically grounded simulation of Indian Ocean maritime trade.

CHARACTER & SETTING:
${poi.lore}

CLASS REGISTER:
${classFlavor[poi.class] ?? ''}

YOUR EXPERTISE:
- Goods you can identify and discuss: ${knowledgeList}
- Goods you have deep mastery of: ${masteryList}
- You can grade samples shown to you in your domain. You should not casually offer information about goods outside your expertise.

LOCATION:
- Site: ${poi.name}${poi.sub ? ` — ${poi.sub}` : ''}
- Port: ${port.name}
- Local culture: ${port.culture || 'cosmopolitan'}

VISITOR:
- A foreign captain has arrived at your door. Treat them as a stranger unless they earn your trust.
- They may be ignorant of local custom; correct them gently or sharply depending on your character.

RULES:
1. Stay in character. You are a real person of 1612, not an AI.
2. Be concise — 1-3 sentences typically. Longer only when telling a story or explaining a process.
3. Speak in the register appropriate to your role and culture. No modern language, no anachronisms.
4. Do not be a vending machine for trade information — be a *person* whose expertise the visitor must work to access.
5. The Learn tab handles formal knowledge transactions for a fee. In Converse you may hint, demonstrate, or refuse. You do NOT need to teach commodity identification through dialogue — that is the Learn tab's job.
6. React to rudeness, ignorance, or generosity in character.

RESPONSE FORMAT:
Respond with valid JSON only (no markdown, no code fences). Exact structure:
{
  "npcDialogue": "What you say in character (1-3 sentences typically)",
  "suggestedResponses": [
    {"label": "Short button text", "type": "question"},
    {"label": "Another option", "type": "question"}
  ]
}

Always include 2-3 suggested responses. Types:
- "question": ask something or continue conversation
- "request_lesson": the visitor asks for formal instruction (steers toward the Learn tab)
- "show_item": the visitor offers a sample (only suggest if it would make sense in this conversation)
- "farewell": end the conversation`;
}

export function buildPOIInitialSceneMessage(poi: POIDefinition, port: Port): string {
  return `[Scene: A foreign captain has just arrived at ${poi.name} in ${port.name}. They have stepped inside the threshold and are looking around. You are ${poi.npcName}. Begin the conversation in character — greet them, observe them, or continue whatever you were doing. Use what you can plausibly perceive about them.]`;
}

// ── Rate limiter ──

const RATE_LIMIT = {
  minIntervalMs: 2000,
  maxPerMinute: 12,
  maxPerSession: 60,
};

let _lastCallTime = 0;
let _callTimestamps: number[] = [];
let _sessionCallCount = 0;

export function resetPOIRateLimiter() {
  _lastCallTime = 0;
  _callTimestamps = [];
  _sessionCallCount = 0;
}

function checkRateLimit(): string | null {
  const now = Date.now();
  if (_sessionCallCount >= RATE_LIMIT.maxPerSession) {
    return 'You have spoken at length. The hour grows late and your host needs rest.';
  }
  if (now - _lastCallTime < RATE_LIMIT.minIntervalMs) return null;
  _callTimestamps = _callTimestamps.filter((t) => now - t < 60_000);
  if (_callTimestamps.length >= RATE_LIMIT.maxPerMinute) {
    return 'You speak too quickly. Pause, and try again.';
  }
  return null;
}

function recordCall() {
  const now = Date.now();
  _lastCallTime = now;
  _callTimestamps.push(now);
  _sessionCallCount++;
}

// ── API call ──

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent';
const REQUEST_TIMEOUT_MS = 15_000;

export async function callGeminiPOI(
  systemPrompt: string,
  conversationHistory: POIConversationMessage[],
  userMessage: string,
  abortSignal?: AbortSignal,
): Promise<POILLMResponse> {
  const rateLimitMsg = checkRateLimit();
  if (rateLimitMsg) {
    return {
      npcDialogue: rateLimitMsg,
      suggestedResponses: [
        { label: 'Bow your head and depart', type: 'farewell' },
      ],
    };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return {
      npcDialogue: '"I have nothing more to say to you today." Your host turns away.',
      suggestedResponses: [
        { label: 'Take your leave', type: 'farewell' },
      ],
    };
  }

  recordCall();

  const contents = [
    ...conversationHistory.map((msg) => ({
      role: msg.role,
      parts: [{ text: msg.text }],
    })),
    { role: 'user' as const, parts: [{ text: userMessage }] },
  ];

  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: {
      temperature: 0.95,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 360,
      responseMimeType: 'application/json',
    },
  };

  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);
  const signal = abortSignal
    ? mergeSignals(abortSignal, timeoutController.signal)
    : timeoutController.signal;

  try {
    const res = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      console.error('Gemini POI error:', res.status, await res.text());
      return {
        npcDialogue: 'Your host seems distracted and does not respond.',
        suggestedResponses: [
          { label: 'Try again', type: 'question' },
          { label: 'Take your leave', type: 'farewell' },
        ],
      };
    }

    const data = await res.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      return {
        npcDialogue: 'A long silence. Your host says nothing.',
        suggestedResponses: [
          { label: 'Wait', type: 'question' },
          { label: 'Take your leave', type: 'farewell' },
        ],
      };
    }
    return parseResponse(rawText);
  } finally {
    clearTimeout(timeoutId);
  }
}

function mergeSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  a.addEventListener('abort', onAbort, { once: true });
  b.addEventListener('abort', onAbort, { once: true });
  return controller.signal;
}

function parseResponse(rawText: string): POILLMResponse {
  try {
    return validateResponse(JSON.parse(rawText));
  } catch {
    const match = rawText.match(/\{[\s\S]*\}/);
    if (match) {
      try { return validateResponse(JSON.parse(match[0])); } catch { /* fall through */ }
    }
    return {
      npcDialogue: rawText.slice(0, 500),
      suggestedResponses: [
        { label: 'Continue', type: 'question' },
        { label: 'Take your leave', type: 'farewell' },
      ],
    };
  }
}

function validateResponse(parsed: any): POILLMResponse {
  const result: POILLMResponse = {
    npcDialogue: typeof parsed.npcDialogue === 'string'
      ? parsed.npcDialogue
      : 'Your host nods silently.',
    suggestedResponses: [],
  };
  if (Array.isArray(parsed.suggestedResponses)) {
    result.suggestedResponses = parsed.suggestedResponses
      .filter((r: any) => r && typeof r.label === 'string')
      .slice(0, 4)
      .map((r: any) => ({
        label: r.label.slice(0, 120),
        type: ['question', 'farewell', 'request_lesson', 'show_item'].includes(r.type) ? r.type : 'question',
      }));
  }
  if (result.suggestedResponses.length === 0) {
    result.suggestedResponses = [
      { label: 'Continue', type: 'question' },
      { label: 'Take your leave', type: 'farewell' },
    ];
  }
  return result;
}

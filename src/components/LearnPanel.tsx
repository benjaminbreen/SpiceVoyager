import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ExternalLink, GraduationCap, X } from 'lucide-react';
import { useGameStore } from '../store/gameStore';
import { resolveLearnTopics, type ResolvedLearnTopic } from '../utils/learnTopics';

interface LearnPanelProps {
  open: boolean;
  onClose: () => void;
}

interface WikipediaArticleSection {
  heading: string | null;
  paragraphs: string[];
}

interface WikipediaArticle {
  title: string;
  sections: WikipediaArticleSection[];
  thumbnail?: string;
  source: 'article' | 'summary';
}

const ARTICLE_CACHE_PREFIX = 'spice-voyager-wikipedia-article-v2:';
const MAX_ARTICLE_PARAGRAPHS = 10;
const STOP_HEADINGS = new Set([
  'See also',
  'References',
  'Notes',
  'Bibliography',
  'Further reading',
  'External links',
]);

function cacheKey(topic: ResolvedLearnTopic) {
  return `${ARTICLE_CACHE_PREFIX}${topic.wikipediaTitle}`;
}

function wikiApiTitle(topic: ResolvedLearnTopic) {
  try {
    return decodeURIComponent(topic.wikipediaTitle).replace(/_/g, ' ');
  } catch {
    return topic.wikipediaTitle.replace(/_/g, ' ');
  }
}

function cleanParagraph(text: string) {
  return text
    .replace(/\[\d+\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseArticleHtml(title: string, html: string): WikipediaArticle {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const content = doc.querySelector('.mw-parser-output');
  const sections: WikipediaArticleSection[] = [];
  let current: WikipediaArticleSection = { heading: null, paragraphs: [] };
  let count = 0;

  const pushCurrent = () => {
    if (current.paragraphs.length > 0) sections.push(current);
  };

  for (const child of Array.from(content?.children ?? [])) {
    if (count >= MAX_ARTICLE_PARAGRAPHS) break;
    if (child.classList.contains('mw-empty-elt')) continue;

    const heading = child.matches('h2, h3')
      ? cleanParagraph(child.textContent ?? '').replace(/\[edit\]$/i, '').trim()
      : '';
    if (heading) {
      if (STOP_HEADINGS.has(heading)) break;
      pushCurrent();
      current = { heading, paragraphs: [] };
      continue;
    }

    if (!child.matches('p')) continue;
    const text = cleanParagraph(child.textContent ?? '');
    if (text.length < 80) continue;
    current.paragraphs.push(text);
    count += 1;
  }

  pushCurrent();
  return { title, sections, source: 'article' };
}

async function fetchWikipediaSummary(topic: ResolvedLearnTopic): Promise<WikipediaArticle> {
  const response = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${topic.wikipediaTitle}`);
  if (!response.ok) throw new Error(`Wikipedia summary failed: ${response.status}`);
  const json = await response.json() as { title?: string; extract?: string; thumbnail?: { source?: string } };
  return {
    title: json.title || topic.title,
    sections: json.extract ? [{ heading: null, paragraphs: [json.extract] }] : [],
    thumbnail: json.thumbnail?.source,
    source: 'summary',
  };
}

async function fetchWikipediaArticle(topic: ResolvedLearnTopic): Promise<WikipediaArticle> {
  const cached = window.localStorage.getItem(cacheKey(topic));
  if (cached) return JSON.parse(cached) as WikipediaArticle;

  const params = new URLSearchParams({
    action: 'parse',
    page: wikiApiTitle(topic),
    prop: 'text|displaytitle',
    format: 'json',
    origin: '*',
    redirects: '1',
  });
  const response = await fetch(`https://en.wikipedia.org/w/api.php?${params.toString()}`);
  if (!response.ok) throw new Error(`Wikipedia article failed: ${response.status}`);
  const json = await response.json() as { parse?: { title?: string; text?: { '*': string } }; error?: unknown };
  if (json.error || !json.parse?.text?.['*']) throw new Error('Wikipedia article parse missing text');

  const article = parseArticleHtml(json.parse.title || topic.title, json.parse.text['*']);
  const finalArticle = article.sections.length > 0 ? article : await fetchWikipediaSummary(topic);
  window.localStorage.setItem(cacheKey(topic), JSON.stringify(finalArticle));
  return finalArticle;
}

export function LearnPanel({ open, onClose }: LearnPanelProps) {
  const currentWorldPortId = useGameStore((s) => s.currentWorldPortId);
  const cargo = useGameStore((s) => s.cargo);
  const nearestHailableNpc = useGameStore((s) => s.nearestHailableNpc);
  const topics = useMemo(
    () => resolveLearnTopics({ currentWorldPortId, cargo, nearestHailableNpc }),
    [cargo, currentWorldPortId, nearestHailableNpc]
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = topics.find((topic) => topic.id === selectedId) ?? topics[0] ?? null;
  const [article, setArticle] = useState<WikipediaArticle | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedId((prev) => topics.some((topic) => topic.id === prev) ? prev : (topics[0]?.id ?? null));
  }, [open, topics]);

  useEffect(() => {
    if (!open || !selected) return;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setArticle(null);

    fetchWikipediaArticle(selected)
      .then((next) => {
        if (!cancelled) setArticle(next);
      })
      .catch(async () => {
        try {
          const fallback = await fetchWikipediaSummary(selected);
          if (!cancelled) setArticle(fallback);
        } catch {
          if (!cancelled) setFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, selected]);

  return (
    <AnimatePresence>
      {open && selected && (
        <motion.div
          initial={{ opacity: 0, y: 14, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 14, scale: 0.98 }}
          transition={{ duration: 0.22, ease: [0.2, 0.8, 0.25, 1] }}
          className="absolute left-1/2 bottom-[4.6rem] z-40 flex max-h-[min(680px,calc(100vh-8rem))] w-[760px] max-w-[calc(100vw-2rem)] -translate-x-1/2 overflow-hidden rounded-xl border border-[#2a3650]/70 bg-[#08101d]/86 text-slate-100 shadow-[0_18px_60px_rgba(0,0,0,0.62)] backdrop-blur-xl pointer-events-auto"
        >
          <div className="w-[230px] shrink-0 border-r border-white/[0.07] bg-black/16">
            <div className="flex items-center gap-3 border-b border-white/[0.07] px-4 py-3.5">
              <GraduationCap size={15} className="text-sky-300/90" strokeWidth={1.7} />
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-sky-200">Learn</div>
                <div className="mt-0.5 text-[10px] text-slate-500">Wikipedia context</div>
              </div>
            </div>
            <div className="max-h-[610px] overflow-y-auto p-2">
              {topics.map((topic) => (
                <button
                  key={topic.id}
                  onClick={() => setSelectedId(topic.id)}
                  className={`mb-1 w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    topic.id === selected.id
                      ? 'border-sky-300/45 bg-sky-400/10 text-sky-50'
                      : 'border-transparent text-slate-300 hover:border-white/10 hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="text-[12px] font-semibold leading-tight">{topic.title}</div>
                  <div className="mt-1 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">{topic.reason}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-start justify-between gap-4 border-b border-white/[0.07] px-5 py-4">
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-300">Wikipedia</div>
                <h2 className="mt-1 truncate text-[22px] font-semibold text-[#f8ead0]" style={{ fontFamily: '"Fraunces", serif' }}>
                  {article?.title || selected.title}
                </h2>
                <div className="mt-1 text-[11px] text-slate-400">{selected.reason}</div>
              </div>
              <button
                onClick={onClose}
                className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-slate-400 transition-colors hover:text-slate-100"
                aria-label="Close Learn panel"
              >
                <X size={13} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {loading && (
                <div className="rounded-lg border border-white/[0.07] bg-white/[0.035] p-4 text-[13px] text-slate-400">
                  Loading Wikipedia article...
                </div>
              )}
              {!loading && failed && (
                <div className="rounded-lg border border-amber-300/20 bg-amber-400/8 p-4 text-[13px] leading-relaxed text-amber-100/90">
                  Wikipedia could not be reached from the browser. The curated article link is still available below.
                </div>
              )}
              {!loading && selected.contextNote && (
                <div className="mb-4 rounded-lg border border-amber-300/20 bg-amber-400/8 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300">1612 Context</div>
                  <p className="mt-2 text-[13px] leading-6 text-amber-50/90">{selected.contextNote}</p>
                </div>
              )}
              {!loading && !failed && article && article.sections.length > 0 && (
                <div className="space-y-5 text-[14px] leading-7 text-slate-200">
                  {article.sections.map((section, sectionIndex) => (
                    <section key={`${section.heading ?? 'intro'}-${sectionIndex}`}>
                      {section.heading && (
                        <h3 className="mb-2 font-serif text-[16px] font-semibold text-[#f8ead0]">{section.heading}</h3>
                      )}
                      <div className="space-y-3">
                        {section.paragraphs.map((paragraph) => (
                          <p key={paragraph}>{paragraph}</p>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
              {!loading && (!article || article.sections.length === 0) && !failed && (
                <div className="rounded-lg border border-white/[0.07] bg-white/[0.035] p-4 text-[13px] text-slate-400">
                  No article text is available for this topic.
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-white/[0.07] px-5 py-3">
              <div className="truncate text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                {selected.category}{article?.source === 'summary' ? ' / summary fallback' : ''}
              </div>
              <a
                href={selected.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-md border border-sky-300/25 bg-sky-400/10 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-sky-100 transition-colors hover:bg-sky-400/16"
              >
                Read full article
                <ExternalLink size={12} />
              </a>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

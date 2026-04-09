import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore, JournalCategory, JournalEntry } from '../store/gameStore';
import {
  X, Pencil, Anchor, Coins, Shield, Users, Swords,
  StickyNote, ChevronRight,
} from 'lucide-react';
import { JournalModal } from './JournalModal';

const CATEGORY_CONFIG: Record<JournalCategory, { icon: typeof Anchor; color: string; label: string }> = {
  navigation: { icon: Anchor, color: '#60a5fa', label: 'Nav' },
  commerce:   { icon: Coins,  color: '#fbbf24', label: 'Trade' },
  ship:       { icon: Shield, color: '#f87171', label: 'Ship' },
  crew:       { icon: Users,  color: '#a78bfa', label: 'Crew' },
  encounter:  { icon: Swords, color: '#34d399', label: 'Event' },
};

const FILTERS: (JournalCategory | 'all')[] = ['all', 'navigation', 'commerce', 'ship', 'crew', 'encounter'];

function formatGameTime(t: number): string {
  const hours = Math.floor(t) % 24;
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours % 12 || 12;
  return `${displayHour} ${period}`;
}

export function JournalPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const journalEntries = useGameStore(s => s.journalEntries);
  const [filter, setFilter] = useState<JournalCategory | 'all'>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalEntry, setModalEntry] = useState<JournalEntry | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const filtered = filter === 'all'
    ? journalEntries
    : journalEntries.filter(e => e.category === filter);

  // Group by day, newest first
  const grouped = [...filtered].reverse().reduce<Record<number, JournalEntry[]>>((acc, e) => {
    (acc[e.day] ??= []).push(e);
    return acc;
  }, {});

  const days = Object.keys(grouped).map(Number).sort((a, b) => b - a);

  // Scroll to top when new entries arrive
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [journalEntries.length]);

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-[4.5rem] left-4 w-[310px] max-h-[420px] flex flex-col
              bg-[#0a0e18]/70 backdrop-blur-xl border border-[#2a2d3a]/50 rounded-xl
              shadow-[0_8px_32px_rgba(0,0,0,0.5)] pointer-events-auto z-30 overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/[0.06]">
              <span className="text-[11px] font-bold tracking-[0.15em] uppercase text-slate-400" style={{ fontFamily: '"DM Sans", sans-serif' }}>
                Captain's Log
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => { setModalEntry(null); setModalOpen(true); }}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-slate-500 hover:text-amber-400 hover:bg-white/[0.06] transition-all"
                  title="Open full journal"
                >
                  <Pencil size={12} />
                </button>
                <button
                  onClick={onClose}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-all"
                >
                  <X size={12} />
                </button>
              </div>
            </div>

            {/* Filter pills */}
            <div className="flex items-center gap-1 px-3 py-2 border-b border-white/[0.04] overflow-x-auto">
              {FILTERS.map(f => {
                const active = filter === f;
                const cfg = f === 'all' ? null : CATEGORY_CONFIG[f];
                return (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider transition-all whitespace-nowrap
                      ${active
                        ? 'text-white shadow-[0_0_8px_rgba(255,255,255,0.1)]'
                        : 'text-slate-500 hover:text-slate-300'
                      }`}
                    style={active && cfg ? { backgroundColor: cfg.color + '25', color: cfg.color } : active ? { backgroundColor: 'rgba(255,255,255,0.1)' } : undefined}
                  >
                    {f === 'all' ? 'All' : cfg!.label}
                  </button>
                );
              })}
            </div>

            {/* Entries */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0 px-3 py-2 space-y-3 scrollbar-thin">
              {days.length === 0 && (
                <div className="text-center py-8 text-slate-600 text-xs italic">
                  No entries yet. Your journey awaits.
                </div>
              )}
              {days.map(day => (
                <div key={day}>
                  <div className="text-[9px] font-bold tracking-[0.15em] uppercase text-slate-500 mb-1.5">
                    Day {day}
                  </div>
                  <div className="space-y-1">
                    {grouped[day].map(entry => {
                      const cfg = CATEGORY_CONFIG[entry.category];
                      const Icon = cfg.icon;
                      return (
                        <button
                          key={entry.id}
                          onClick={() => { setModalEntry(entry); setModalOpen(true); }}
                          className="group w-full text-left flex items-start gap-2 px-2 py-1.5 rounded-lg
                            hover:bg-white/[0.04] transition-all cursor-pointer"
                        >
                          <div
                            className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                            style={{ backgroundColor: cfg.color + '15', color: cfg.color }}
                          >
                            <Icon size={10} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] text-slate-300 leading-snug truncate">
                              {entry.message}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[9px] text-slate-600">
                                {formatGameTime(entry.timeOfDay)}
                              </span>
                              {entry.notes.length > 0 && (
                                <span className="flex items-center gap-0.5 text-[9px] text-amber-600">
                                  <StickyNote size={8} /> {entry.notes.length}
                                </span>
                              )}
                            </div>
                          </div>
                          <ChevronRight size={10} className="text-slate-700 group-hover:text-slate-400 mt-1.5 shrink-0 transition-colors" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Full modal */}
      <JournalModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        initialEntry={modalEntry}
      />
    </>
  );
}

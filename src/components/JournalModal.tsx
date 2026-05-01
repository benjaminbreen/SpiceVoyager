import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore, JournalCategory, JournalEntry } from '../store/gameStore';
import {
  X, Anchor, Coins, Shield, Users, Swords,
  StickyNote, Send, ScrollText,
} from 'lucide-react';
import { COMMODITY_DEFS, type Commodity } from '../utils/commodities';
import { modalBackdropMotion, modalPanelMotion } from '../utils/uiMotion';

const CATEGORY_CONFIG: Record<JournalCategory, { icon: typeof Anchor; color: string; label: string }> = {
  navigation: { icon: Anchor, color: '#60a5fa', label: 'Navigation' },
  commerce:   { icon: Coins,  color: '#fbbf24', label: 'Commerce' },
  ship:       { icon: Shield, color: '#f87171', label: 'Ship' },
  crew:       { icon: Users,  color: '#a78bfa', label: 'Crew' },
  encounter:  { icon: Swords, color: '#34d399', label: 'Encounter' },
};

const FILTERS: (JournalCategory | 'all')[] = ['all', 'navigation', 'commerce', 'ship', 'crew', 'encounter'];

function formatGameTime(t: number): string {
  const hours = Math.floor(t) % 24;
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours % 12 || 12;
  return `${displayHour} ${period}`;
}

export function JournalModal({ open, onClose, initialEntry }: {
  open: boolean;
  onClose: () => void;
  initialEntry: JournalEntry | null;
}) {
  const journalEntries = useGameStore(s => s.journalEntries);
  const addJournalNote = useGameStore(s => s.addJournalNote);
  const gold = useGameStore(s => s.gold);
  const cargo = useGameStore(s => s.cargo);
  const stats = useGameStore(s => s.stats);
  const obligations = useGameStore(s => s.obligations);
  const [filter, setFilter] = useState<JournalCategory | 'all'>('all');
  const [view, setView] = useState<'log' | 'ledger'>('log');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Set initial entry when modal opens
  useEffect(() => {
    if (open && initialEntry) {
      setSelectedId(initialEntry.id);
    } else if (open && !initialEntry && journalEntries.length > 0) {
      setSelectedId(journalEntries[journalEntries.length - 1].id);
    }
  }, [open, initialEntry, journalEntries]);

  const filtered = filter === 'all'
    ? journalEntries
    : journalEntries.filter(e => e.category === filter);

  const grouped = [...filtered].reverse().reduce<Record<number, JournalEntry[]>>((acc, e) => {
    (acc[e.day] ??= []).push(e);
    return acc;
  }, {});
  const days = Object.keys(grouped).map(Number).sort((a, b) => b - a);

  // Get the live version of the selected entry from store
  const selectedEntry = selectedId ? journalEntries.find(e => e.id === selectedId) ?? null : null;
  const activeObligations = obligations.filter(o => o.status === 'active');
  const settledObligations = obligations.filter(o => o.status === 'settled');
  const cargoWeight = Object.entries(cargo).reduce(
    (sum, [commodity, qty]) => sum + qty * (COMMODITY_DEFS[commodity as Commodity]?.weight ?? 1),
    0,
  );

  const handleSubmitNote = () => {
    if (!selectedEntry || !noteText.trim()) return;
    addJournalNote(selectedEntry.id, noteText.trim());
    setNoteText('');
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmitNote();
    }
  };

  if (!open) return null;

  return (
    <motion.div
      {...modalBackdropMotion}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6 pointer-events-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        {...modalPanelMotion}
        className="w-full max-w-6xl h-[88vh] flex rounded-xl overflow-hidden shadow-[0_16px_64px_rgba(0,0,0,0.6)] border border-[#2a2d3a]/50"
      >
        {/* LEFT PANE — Event Log (sleek dark) */}
        <div className="w-[380px] bg-[#0c1019]/95 backdrop-blur-xl flex flex-col border-r border-white/[0.06]">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
            <span className="text-xs font-bold tracking-[0.15em] uppercase text-slate-400" style={{ fontFamily: '"DM Sans", sans-serif' }}>
              Ship's Log
            </span>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-all"
            >
              <X size={14} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-1 px-3 py-2 border-b border-white/[0.04]">
            <button
              type="button"
              onClick={() => setView('log')}
              className={`min-h-9 rounded-lg text-[10px] font-bold uppercase tracking-[0.12em] transition-all ${view === 'log' ? 'bg-white/[0.08] text-slate-200' : 'text-slate-500 hover:text-slate-300'}`}
              style={{ fontFamily: '"DM Sans", sans-serif' }}
            >
              Log
            </button>
            <button
              type="button"
              onClick={() => setView('ledger')}
              className={`min-h-9 rounded-lg text-[10px] font-bold uppercase tracking-[0.12em] transition-all ${view === 'ledger' ? 'bg-white/[0.08] text-amber-200' : 'text-slate-500 hover:text-slate-300'}`}
              style={{ fontFamily: '"DM Sans", sans-serif' }}
            >
              Ledger
            </button>
          </div>

          {/* Filter pills */}
          <div className="flex items-center gap-1 px-4 py-2 border-b border-white/[0.04] overflow-x-auto">
            {FILTERS.map(f => {
              const active = filter === f;
              const cfg = f === 'all' ? null : CATEGORY_CONFIG[f];
              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap
                    ${active
                      ? 'text-white'
                      : 'text-slate-500 hover:text-slate-300'
                    }`}
                  style={active && cfg ? { backgroundColor: cfg.color + '20', color: cfg.color } : active ? { backgroundColor: 'rgba(255,255,255,0.08)' } : undefined}
                >
                  {f === 'all' ? 'All' : cfg!.label}
                </button>
              );
            })}
          </div>

          {/* Event list */}
          <div className="flex-1 overflow-y-auto min-h-0 px-3 py-2 space-y-3">
            {days.length === 0 && (
              <div className="text-center py-12 text-slate-600 text-xs italic">
                No entries recorded yet.
              </div>
            )}
            {days.map(day => (
              <div key={day}>
                <div className="text-[9px] font-bold tracking-[0.15em] uppercase text-slate-500 mb-1.5 px-1">
                  Day {day}
                </div>
                <div className="space-y-0.5">
                  {grouped[day].map(entry => {
                    const cfg = CATEGORY_CONFIG[entry.category];
                    const Icon = cfg.icon;
                    const isSelected = entry.id === selectedId;
                    return (
                      <button
                        key={entry.id}
                        onClick={() => setSelectedId(entry.id)}
                        className={`group w-full text-left flex items-start gap-2.5 px-2.5 py-2 rounded-lg transition-all
                          ${isSelected
                            ? 'bg-white/[0.07] border border-white/[0.08]'
                            : 'hover:bg-white/[0.03] border border-transparent'
                          }`}
                      >
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                          style={{ backgroundColor: cfg.color + '15', color: cfg.color }}
                        >
                          <Icon size={11} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={`text-[12px] leading-snug ${isSelected ? 'text-slate-200' : 'text-slate-400'}`}>
                            {entry.message}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[9px] text-slate-600">
                              {formatGameTime(entry.timeOfDay)}
                            </span>
                            {entry.portName && (
                              <span className="text-[9px] text-slate-600">
                                {entry.portName}
                              </span>
                            )}
                            {entry.notes.length > 0 && (
                              <span className="flex items-center gap-0.5 text-[9px] text-amber-600">
                                <StickyNote size={8} /> {entry.notes.length}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT PANE — Annotations / Ledger (parchment) */}
        <div className="flex-1 flex flex-col"
          style={{
            background: 'linear-gradient(135deg, #f4edd8 0%, #e8ddc4 40%, #f0e6ce 100%)',
          }}
        >
          {view === 'ledger' ? (
            <div className="flex-1 overflow-y-auto p-7">
              <div className="flex items-start justify-between gap-4 border-b border-[#c8b98a]/40 pb-4">
                <div>
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#8a7a5a]">
                    <ScrollText size={14} /> Ledger
                  </div>
                  <h2 className="mt-2 text-2xl font-bold text-[#302718]" style={{ fontFamily: '"IM Fell English", Georgia, serif' }}>
                    Accounts and obligations
                  </h2>
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[#8a7a5a] hover:text-[#3a3020] hover:bg-[#3a3020]/10 transition-all"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-[#c8b98a]/35 bg-white/35 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#8a7a5a]">Cash</div>
                  <div className="mt-1 font-mono text-2xl font-bold text-[#3a3020]">{gold.toLocaleString()}g</div>
                </div>
                <div className="rounded-lg border border-[#c8b98a]/35 bg-white/35 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#8a7a5a]">Hold</div>
                  <div className="mt-1 font-mono text-2xl font-bold text-[#3a3020]">{cargoWeight}/{stats.cargoCapacity}</div>
                </div>
                <div className="rounded-lg border border-[#c8b98a]/35 bg-white/35 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#8a7a5a]">Open Accounts</div>
                  <div className="mt-1 font-mono text-2xl font-bold text-[#3a3020]">{activeObligations.length}</div>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#8a7a5a]">Open</h3>
                {activeObligations.length === 0 ? (
                  <div className="rounded-lg border border-[#c8b98a]/30 bg-white/25 p-5 text-sm italic text-[#8a7a5a]" style={{ fontFamily: '"IM Fell English", Georgia, serif' }}>
                    No active debts or commission accounts.
                  </div>
                ) : activeObligations.map((obligation) => {
                  const remaining = Math.max(0, obligation.amountDue - obligation.settledGold);
                  return (
                    <div key={obligation.id} className="rounded-lg border border-[#c8b98a]/35 bg-white/35 p-4">
                      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9a6f3a]">
                            {obligation.type === 'credit' ? 'Credit' : 'Commission Cargo'}
                          </div>
                          <div className="mt-1 text-lg font-bold text-[#302718]" style={{ fontFamily: '"IM Fell English", Georgia, serif' }}>
                            {obligation.patron}
                          </div>
                          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[#6b5a3d]" style={{ fontFamily: '"IM Fell English", Georgia, serif' }}>
                            {obligation.note}
                          </p>
                        </div>
                        <div className="font-mono text-sm text-[#3a3020] md:text-right">
                          <div>{obligation.settledGold}/{obligation.amountDue}g</div>
                          <div className={remaining > 0 ? 'text-[#8a2d24]' : 'text-[#2f6b45]'}>
                            {remaining > 0 ? `${remaining}g remaining` : 'Ready to settle'}
                          </div>
                          <div className="text-[#8a7a5a]">Due Day {obligation.dueDay}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {settledObligations.length > 0 && (
                <div className="mt-6 space-y-2">
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#8a7a5a]">Settled</h3>
                  {settledObligations.slice(-5).reverse().map((obligation) => (
                    <div key={obligation.id} className="rounded-lg border border-[#c8b98a]/25 bg-white/20 px-4 py-3 text-sm text-[#6b5a3d]">
                      {obligation.patron} · {obligation.amountDue}g settled
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
          <>
          {/* Annotation header */}
          <div className="px-7 py-5 border-b border-[#c8b98a]/40">
            {selectedEntry ? (
              <div>
                <div className="flex items-center gap-2 mb-1">
                  {(() => {
                    const cfg = CATEGORY_CONFIG[selectedEntry.category];
                    const Icon = cfg.icon;
                    return (
                      <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: cfg.color + '25', color: cfg.color }}>
                        <Icon size={10} />
                      </div>
                    );
                  })()}
                  <span className="text-[10px] font-bold tracking-[0.12em] uppercase text-[#8a7a5a]">
                    Day {selectedEntry.day} &middot; {formatGameTime(selectedEntry.timeOfDay)}
                    {selectedEntry.portName && ` \u00b7 ${selectedEntry.portName}`}
                  </span>
                </div>
                <p className="text-[#3a3020] text-sm font-medium" style={{ fontFamily: '"IM Fell English", Georgia, serif' }}>
                  {selectedEntry.message}
                </p>
              </div>
            ) : (
              <p className="text-[#8a7a5a] text-sm italic" style={{ fontFamily: '"IM Fell English", Georgia, serif' }}>
                Select an entry to view or add notes.
              </p>
            )}
          </div>

          {/* Notes area */}
          <div className="flex-1 overflow-y-auto px-7 py-5 space-y-4 min-h-0">
            {selectedEntry && selectedEntry.notes.length === 0 && (
              <div className="text-center py-8">
                <StickyNote size={24} className="mx-auto mb-2 text-[#b8a880]" />
                <p className="text-[#9a8a6a] text-sm italic" style={{ fontFamily: '"IM Fell English", Georgia, serif' }}>
                  No annotations yet. Write your thoughts below.
                </p>
              </div>
            )}
            {selectedEntry?.notes.map(note => (
              <div key={note.id} className="pl-4 border-l-2 border-[#c8b080]/50">
                <p className="text-[#3a3020] text-[15px] leading-relaxed whitespace-pre-wrap"
                   style={{ fontFamily: '"IM Fell English", Georgia, serif' }}>
                  {note.text}
                </p>
                <p className="text-[9px] text-[#a09070] mt-1 uppercase tracking-wider">
                  {new Date(note.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            ))}
          </div>

          {/* Note input */}
          {selectedEntry && (
            <div className="px-5 py-4 border-t border-[#c8b98a]/40 bg-[#efe5cc]/80">
              <div className="flex gap-2">
                <textarea
                  ref={textareaRef}
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Write a note..."
                  rows={2}
                  className="flex-1 bg-white/60 border border-[#c8b98a]/50 rounded-lg px-3 py-2
                    text-[#3a3020] text-sm placeholder-[#b0a080]
                    focus:outline-none focus:border-[#a08850] focus:bg-white/80 resize-none transition-all"
                  style={{ fontFamily: '"IM Fell English", Georgia, serif' }}
                />
                <button
                  onClick={handleSubmitNote}
                  disabled={!noteText.trim()}
                  className="self-end w-9 h-9 rounded-full flex items-center justify-center
                    bg-[#8a7040] text-[#f4edd8] hover:bg-[#7a6030]
                    disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  <Send size={14} />
                </button>
              </div>
              <p className="text-[8px] text-[#b0a080] mt-1 tracking-wider uppercase">
                Enter to save &middot; Shift+Enter for new line
              </p>
            </div>
          )}
          </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

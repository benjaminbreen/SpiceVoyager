import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useGameStore, type CrewMember, type HealthFlag } from '../store/gameStore';
import { sfxFuneralBell } from '../audio/SoundEffects';

// ── Colors (matches EventModalASCII palette) ────────────────────────────────
const GOLD     = '#c9a84c';
const DIM_GOLD = '#8a7a4a';
const WARM     = '#b89a6a';
const CRIMSON  = '#a05050';
const RULE     = '#3a3528';
const RULE_LT  = '#4a4538';
const DIM      = '#5a5445';
const TXT      = '#9a9080';
const BRIGHT   = '#d8ccb0';

function C({ c, children }: { c: string; children: React.ReactNode }) {
  return <span style={{ color: c }}>{children}</span>;
}

function sp(n: number) { return ' '.repeat(Math.max(0, n)); }

// ── Procedural eulogy based on crew member traits ───────────────────────────

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

function generateEulogy(m: CrewMember): string {
  const lines: string[] = [];

  // Personality based on stats
  if (m.stats.charisma >= 14) {
    lines.push(pick([
      'He had a way with words that could calm a mutinous deck or charm a harbormaster.',
      'Quick to laugh and quicker to befriend, he was beloved by the crew.',
      'His silver tongue settled more disputes than any bosun\'s fist.',
    ]));
  } else if (m.stats.strength >= 14) {
    lines.push(pick([
      'A man of uncommon strength, he could haul anchor with his bare hands.',
      'Built like an ox and tireless in his labors, he was the backbone of the watch.',
      'His powerful frame made light work of the heaviest tasks aboard.',
    ]));
  } else if (m.stats.perception >= 14) {
    lines.push(pick([
      'He possessed a keen eye that could read the weather before the barometer.',
      'Sharp-witted and observant, little escaped his notice on deck or horizon.',
      'His instinct for the sea was uncanny, as if he could feel the currents in his bones.',
    ]));
  } else if (m.stats.luck >= 14) {
    lines.push(pick([
      'Fortune favored him in all things — until the end.',
      'A charmed life, the crew used to say. They said it less, after today.',
      'He always seemed to land on his feet, no matter the tempest.',
    ]));
  } else {
    lines.push(pick([
      'A quiet man who did his duty without complaint or fanfare.',
      'He was steady and dependable, the sort every captain prays for.',
      'Not one for speeches, he let his work speak in his stead.',
    ]));
  }

  // Morale-based line
  if (m.morale < 20) {
    lines.push(pick([
      'In his final days, a deep melancholy had settled upon him.',
      'The light had gone from his eyes long before the end came.',
      'He had spoken of home with increasing desperation these past weeks.',
    ]));
  } else if (m.morale > 70) {
    lines.push(pick([
      'Even unto the last, he carried himself with good spirits.',
      'He met his fate with the same steady cheer he brought to every watch.',
      'The crew will remember his laughter most of all.',
    ]));
  }

  // Role-specific
  const roleLines: Record<string, string[]> = {
    Captain: ['Under his command, we sailed through trials that would have broken lesser men.'],
    Navigator: ['He guided us true by the stars, and now the stars have called him home.'],
    Gunner: ['His eye was steady and his aim was true. The guns fall silent in his honor.'],
    Surgeon: ['He eased the suffering of many. There was none to ease his own.'],
    Factor: ['The ledgers will show his worth in gold, but his true value was beyond measure.'],
    Sailor: ['He was the salt of our crew, and the sea has reclaimed her own.'],
  };
  const roleLine = roleLines[m.role];
  if (roleLine) lines.push(pick(roleLine));

  return lines.join(' ');
}

function healthDescription(h: HealthFlag): string {
  switch (h) {
    case 'scurvy': return 'scurvy';
    case 'fevered': return 'fever';
    case 'sick': return 'illness';
    case 'injured': return 'wounds';
    default: return 'unknown causes';
  }
}

// ── Animated cross ──────────────────────────────────────────────────────────
function AnimatedCross() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const chars = ['\u2020', '\u2021', '\u271D', '\u2720'];
    let i = 0;
    const id = setInterval(() => {
      if (ref.current) ref.current.textContent = chars[i % chars.length];
      i++;
    }, 800);
    return () => clearInterval(id);
  }, []);
  return <span ref={ref} style={{ color: GOLD }}>{'\u2020'}</span>;
}

// ── Main Component ──────────────────────────────────────────────────────────

export function CrewDeathModal() {
  const deadCrew = useGameStore(s => s.deadCrew);
  const dismissDeadCrew = useGameStore(s => s.dismissDeadCrew);
  const setPaused = useGameStore(s => s.setPaused);
  const dayCount = useGameStore(s => s.dayCount);
  const bellPlayed = useRef(false);

  useEffect(() => {
    if (deadCrew && !bellPlayed.current) {
      bellPlayed.current = true;
      sfxFuneralBell();
    }
    if (!deadCrew) bellPlayed.current = false;
  }, [deadCrew]);

  // Dismiss on any key press
  useEffect(() => {
    if (!deadCrew) return;
    const handleKey = (e: KeyboardEvent) => {
      e.preventDefault();
      dismissDeadCrew();
      setPaused(false);
    };
    // Delay to prevent immediate dismiss from the key that triggered it
    const timeout = setTimeout(() => {
      window.addEventListener('keydown', handleKey);
    }, 500);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener('keydown', handleKey);
    };
  }, [deadCrew, dismissDeadCrew, setPaused]);

  if (!deadCrew) return null;

  const m = deadCrew;
  const eulogy = generateEulogy(m);
  const IW = 52; // inner width between borders
  const dash = '\u2500';
  const dbl = '\u2550';

  const handleDismiss = () => {
    dismissDeadCrew();
    setPaused(false);
  };

  // Stat bar helper
  const statBar = (val: number, max: number, w: number = 8) => {
    const filled = Math.round((val / max) * w);
    return (
      <>
        <C c={WARM}>{'\u2593'.repeat(filled)}</C>
        <C c={RULE}>{'\u2591'.repeat(w - filled)}</C>
      </>
    );
  };

  // Center a line within IW
  const center = (text: string) => {
    const pad = Math.max(0, Math.floor((IW - text.length) / 2));
    return sp(pad) + text + sp(IW - pad - text.length);
  };

  // Word-wrap for the eulogy
  const wrapText = (text: string, width: number): string[] => {
    const words = text.split(' ');
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      if (current.length + word.length + 1 > width) {
        lines.push(current);
        current = word;
      } else {
        current = current ? current + ' ' + word : word;
      }
    }
    if (current) lines.push(current);
    return lines;
  };

  // Line with side borders
  const L = ({ children }: { children: React.ReactNode }) => (
    <span>
      <C c={DIM_GOLD}>{'\u2551 '}</C>
      {children}
      <C c={DIM_GOLD}>{' \u2551'}</C>
      {'\n'}
    </span>
  );

  const divider = (ornChar: string) => {
    const sideLen = Math.floor((IW - 3) / 2);
    const side = (dash + ' ').repeat(Math.floor(sideLen / 2)).slice(0, sideLen);
    return (
      <L>
        <C c={RULE_LT}>{side}</C>
        <C c={GOLD}>{' ' + ornChar + ' '}</C>
        <C c={RULE_LT}>{side}</C>
      </L>
    );
  };

  const padR = (s: string, n: number) => s.length >= n ? s.slice(0, n) : s + sp(n - s.length);

  const daysServed = m.hireDay ? dayCount - m.hireDay : dayCount;
  const commendText = `We commend to the deep the soul of`;
  const nameText = `${m.name},`;
  const roleText = `${m.role}, a native of ${m.birthplace}.`;
  const healthCause = healthDescription(m.health);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8 }}
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(2, 1, 0, 0.85)' }}
      onClick={handleDismiss}
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, delay: 0.3, ease: 'easeOut' }}
        onClick={e => e.stopPropagation()}
        className="relative"
      >
        <pre
          className="select-none leading-[1.35] px-2"
          style={{
            fontFamily: '"SF Mono", "Fira Code", "Cascadia Code", "Consolas", monospace',
            fontSize: '11px',
            color: TXT,
            textShadow: `0 0 20px rgba(201, 168, 76, 0.08)`,
          }}
        >
          {/* Top border */}
          <C c={DIM_GOLD}>{'\u2554' + dbl.repeat(IW + 2) + '\u2557'}</C>{'\n'}

          {/* Empty line */}
          <L><C c={DIM}>{sp(IW)}</C></L>

          {/* Cross ornament */}
          <L>
            <C c={DIM}>{sp(Math.floor(IW / 2))}</C>
            <AnimatedCross />
            <C c={DIM}>{sp(IW - Math.floor(IW / 2) - 1)}</C>
          </L>

          <L><C c={DIM}>{sp(IW)}</C></L>

          {/* Title */}
          <L><C c={CRIMSON}>{center('IN MEMORIAM')}</C></L>

          <L><C c={DIM}>{sp(IW)}</C></L>

          {divider('\u2726')}

          <L><C c={DIM}>{sp(IW)}</C></L>

          {/* Commendation text */}
          <L><C c={TXT}>{center(commendText)}</C></L>
          <L><C c={BRIGHT}>{center(nameText)}</C></L>
          <L><C c={TXT}>{center(roleText)}</C></L>

          <L><C c={DIM}>{sp(IW)}</C></L>

          <L><C c={DIM}>{center(`Taken by ${healthCause} on day ${dayCount} of our voyage.`)}</C></L>

          <L><C c={DIM}>{sp(IW)}</C></L>

          {divider('\u00b7')}

          <L><C c={DIM}>{sp(IW)}</C></L>

          {/* Eulogy */}
          {wrapText(eulogy, IW - 4).map((line, i) => (
            <L key={i}><C c={WARM}>{'  '}{padR(line, IW - 2)}</C></L>
          ))}

          <L><C c={DIM}>{sp(IW)}</C></L>

          {divider('\u2726')}

          <L><C c={DIM}>{sp(IW)}</C></L>

          {/* Stats block */}
          <L>
            <C c={DIM}>{' Age: '}</C><C c={BRIGHT}>{padR(String(m.age), 6)}</C>
            <C c={DIM}>{'Nationality: '}</C><C c={BRIGHT}>{padR(m.nationality, IW - 27)}</C>
          </L>
          <L>
            <C c={DIM}>{' Skill: '}</C>{statBar(m.skill, 100)}{' '}
            <C c={DIM}>{'Morale: '}</C>{statBar(m.morale, 100)}
            <C c={DIM}>{sp(IW - 36)}</C>
          </L>
          <L>
            <C c={DIM}>{' STR: '}</C>{statBar(m.stats.strength, 20, 5)}{' '}
            <C c={DIM}>{'PER: '}</C>{statBar(m.stats.perception, 20, 5)}{' '}
            <C c={DIM}>{'CHA: '}</C>{statBar(m.stats.charisma, 20, 5)}{' '}
            <C c={DIM}>{'LCK: '}</C>{statBar(m.stats.luck, 20, 5)}
            <C c={DIM}>{sp(IW - 48)}</C>
          </L>
          <L>
            <C c={DIM}>{' Days served: '}</C><C c={BRIGHT}>{padR(String(daysServed), 6)}</C>
            <C c={DIM}>{'Quality: '}</C><C c={m.quality === 'legendary' ? GOLD : m.quality === 'rare' ? WARM : DIM}>{padR(m.quality, IW - 31)}</C>
          </L>

          {/* History */}
          {m.history.length > 0 && (
            <>
              <L><C c={DIM}>{sp(IW)}</C></L>
              {divider('\u00b7')}
              <L><C c={DIM_GOLD}>{center('SERVICE RECORD')}</C></L>
              {m.history.slice(-5).map((h, i) => (
                <L key={i}>
                  <C c={DIM}>{' Day '}{padR(String(h.day), 4)}</C>
                  <C c={TXT}>{padR(h.event, IW - 10)}</C>
                </L>
              ))}
            </>
          )}

          <L><C c={DIM}>{sp(IW)}</C></L>

          {/* Dismiss prompt */}
          <L><C c={DIM}>{center('[ Press any key or click to continue ]')}</C></L>

          <L><C c={DIM}>{sp(IW)}</C></L>

          {/* Bottom border */}
          <C c={DIM_GOLD}>{'\u255A' + dbl.repeat(IW + 2) + '\u255D'}</C>{'\n'}
        </pre>
      </motion.div>
    </motion.div>
  );
}

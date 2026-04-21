import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore, WEAPON_DEFS, PORT_FACTION, type Nationality, type CrewRole, type CrewMember, type CrewQuality, type Humours } from '../store/gameStore';
import { sfxTab, sfxClose, sfxHover } from '../audio/SoundEffects';
import { FactionFlag } from './FactionFlag';
import { CrewPortraitSquare } from './CrewPortrait';
import { PortraitModal } from './PortraitModal';
import { FACTIONS, pickFlagColor } from '../constants/factions';
import { sfxClick } from '../audio/SoundEffects';
import { modalBackdropMotion, modalPanelMotion } from '../utils/uiMotion';
import {
  ASCII_COLORS as CLR,
  C,
  useSparkle,
  hullColor, moraleColor, cargoColor,
  BaroqueBorder,
} from './ascii-ui-kit';
import { ShipView } from './ShipView';

// ═══════════════════════════════════════════════════════════════════════════
// ASCII Dashboard — baroque-framed game UI with tabbed panels
// ═══════════════════════════════════════════════════════════════════════════

type DashTab = 'overview' | 'ship' | 'crew' | 'cargo' | 'reputation';

const TABS: { id: DashTab; label: string; accent: string }[] = [
  { id: 'overview',   label: 'Overview',    accent: CLR.tabOverview },
  { id: 'ship',       label: 'Ship',        accent: CLR.tabShip },
  { id: 'crew',       label: 'Crew',        accent: CLR.tabCrew },
  { id: 'cargo',      label: 'Cargo',       accent: CLR.tabCargo },
  { id: 'reputation', label: 'Reputation',  accent: CLR.tabReputation },
];

const MONO = '"SF Mono", "Fira Code", "Cascadia Code", "Consolas", monospace';
const SERIF = '"Fraunces", serif';
const SANS = '"DM Sans", sans-serif';

// ── Health flag styling ──────────────────────────────────────────────────

const HEALTH_STYLE: Record<string, { label: string; color: string }> = {
  healthy: { label: 'Fit', color: CLR.green },
  sick:    { label: 'Sick', color: CLR.yellow },
  injured: { label: 'Injured', color: CLR.red },
  scurvy:  { label: 'Scurvy', color: CLR.orange },
  fevered: { label: 'Fever', color: CLR.red },
};

const ROLE_COLOR: Record<string, string> = {
  Captain:   CLR.gold,
  Navigator: CLR.cyan,
  Gunner:    CLR.red,
  Sailor:    CLR.txt,
  Factor:    CLR.teal,
  Surgeon:   '#ec4899',
};

// ── Crew dialogue lines (keyed by role × morale band × region) ──────────

type MoraleBand = 'high' | 'mid' | 'low';
type RegionKey = 'european' | 'indian' | 'southeast_asian' | 'east_asian' | 'african';

const NATIONALITY_REGION: Record<string, RegionKey> = {
  English: 'european', Portuguese: 'european', Dutch: 'european', Spanish: 'european', French: 'european', Danish: 'european',
  Mughal: 'indian', Gujarati: 'indian', Persian: 'indian',
  Ottoman: 'indian', Omani: 'indian',
  Swahili: 'african',
  Malay: 'southeast_asian', Acehnese: 'southeast_asian', Javanese: 'southeast_asian', Moluccan: 'southeast_asian', Siamese: 'southeast_asian',
  Japanese: 'east_asian', Chinese: 'east_asian',
};

const CREW_DIALOGUE: Record<string, Record<MoraleBand, Record<RegionKey, string[]>>> = {
  Captain: {
    high: {
      european: ["The wind favours the bold today.", "I can smell profit on the breeze.", "A fine day to be at sea, wouldn't you say?"],
      indian: ["The monsoon is with us. God is generous.", "I have sailed these waters since I was a boy — they welcome us.", "Fortune smiles. Let us not waste her favour."],
      southeast_asian: ["The straits are calm. We move swiftly.", "I know these channels like the lines on my palm.", "A good omen — the sea eagles circle high."],
      east_asian: ["The currents flow in our favour.", "Steady hands, steady course — we will prosper.", "The heavens align for profitable trade."],
      african: ["The coast speaks well of our coming.", "I have traded along these shores many times. We are welcome.", "A strong tide carries us forward."],
    },
    mid: {
      european: ["We press on. There's nothing else for it.", "I've seen worse seas than these.", "Keep your wits about you. The ocean has moods."],
      indian: ["The sea tests us. We must be patient.", "Not every voyage is blessed, but we endure.", "These waters are fickle. Stay alert."],
      southeast_asian: ["Watch the shallows. Many a ship has come to grief here.", "We are not the only ones on these waters. Stay wary.", "The heat weighs on us all, but we carry on."],
      east_asian: ["The sea neither helps nor hinders. We rely on ourselves.", "A captain's burden is to choose well and wait.", "Discipline will see us through."],
      african: ["The shore offers little shelter here. We press on.", "I know these currents. Patience is required.", "We have enough to continue. That will suffice."],
    },
    low: {
      european: ["If we don't find port soon, I fear the worst.", "This venture may be my last. God help us.", "The crew grows restless. I cannot blame them."],
      indian: ["We are far from home and the ship suffers.", "I pray to God we see land before the water runs dry.", "The men look at me with hollow eyes. I have no comfort to give."],
      southeast_asian: ["These waters will swallow us if we are not careful.", "I have led us into misfortune. I must find a way out.", "The crew whispers of turning back. Perhaps they are right."],
      east_asian: ["Even the strongest vessel has its limits.", "We have strayed too far. I feel it in my bones.", "The silence among the crew troubles me more than any storm."],
      african: ["This coast is unforgiving to the desperate.", "I did not come this far to perish, but the sea cares nothing for resolve.", "We must find harbour. There is no other choice."],
    },
  },
  Navigator: {
    high: {
      european: ["The charts are clear and the stars are bright.", "I've plotted a course that will shave two days off our passage.", "Excellent visibility. Even a blind man could navigate today."],
      indian: ["I know these constellations well. We are exactly where we should be.", "The Pole Star guides us true tonight.", "My calculations put us ahead of schedule."],
      southeast_asian: ["The islands ahead match my charts perfectly.", "I've navigated these straits a dozen times. Trust the heading.", "The reef lines up with my markings. We pass safely."],
      east_asian: ["The compass holds steady. A good sign.", "These waters are well-charted. We will not stray.", "By my reckoning, we arrive within the week."],
      african: ["The coastline confirms our position. All is well.", "I've studied these currents for years. We are on course.", "The stars and the shore agree — we make good progress."],
    },
    mid: {
      european: ["Cloud cover is making the stars difficult tonight.", "The charts disagree with what I see. I'm recalculating.", "We should be cautious. These waters aren't well mapped."],
      indian: ["Monsoon clouds obscure the heavens. I navigate by instinct.", "The currents have shifted. I'm adjusting our heading.", "I've seen these waters behave strangely before."],
      southeast_asian: ["Too many islands, too few landmarks. I must be careful.", "The shallows here are treacherous. I need silence to concentrate.", "My charts show open water where I see reefs. Troubling."],
      east_asian: ["The fog makes it difficult to sight land.", "I am uncertain of our longitude. We must wait for clear skies.", "The magnetic compass wavers near these shores."],
      african: ["The coast here all looks the same. I must study the depth.", "An unfamiliar current pushes us. I'm compensating.", "I will need to take soundings before we proceed."],
    },
    low: {
      european: ["I confess I no longer know precisely where we are.", "The charts are useless here. We sail blind.", "If I've miscalculated, we are in grave danger."],
      indian: ["The stars hide from us, and so does our course.", "I fear we have drifted far from any safe route.", "I cannot find our position. The sea has swallowed every landmark."],
      southeast_asian: ["These reefs could tear the hull apart. I need better charts.", "I am lost. The islands all blur together.", "One wrong heading and we run aground. I need rest to think clearly."],
      east_asian: ["The compass spins without reason. I cannot explain it.", "We are adrift in unknown waters.", "I have failed in my duty. I cannot find the way."],
      african: ["The coastline here is not on any chart I possess.", "I fear we have passed our destination days ago.", "Every heading leads to more open water. I see no landfall."],
    },
  },
  Gunner: {
    high: {
      european: ["The powder is dry and the cannons gleam. Let them come.", "I've drilled the gun crews until they can fire in their sleep.", "A broadside from this ship would ruin any pirate's day."],
      indian: ["Our guns are loaded and ready. No corsair will catch us unaware.", "I have seen battle and I do not fear it. We are prepared.", "The weapons are in fine order. I am proud of my work."],
      southeast_asian: ["Pirates think twice before approaching a well-armed ship.", "I've faced Malay raiders before. Our guns outmatch theirs.", "Every cannon is cleaned and loaded. We are ready for anything."],
      east_asian: ["The weapons are maintained to perfection.", "I keep the powder dry and the shot sorted. Discipline wins battles.", "Let the pirates come. They will find us prepared."],
      african: ["These waters breed corsairs, but we are well armed.", "I've rigged the swivel guns for close quarters. Nothing gets through.", "Our firepower is our shield. I keep it sharp."],
    },
    mid: {
      european: ["We're running low on good powder. I'll make do.", "The guns need maintenance, but they'll fire when needed.", "I wish we had more shot, but what we have will serve."],
      indian: ["The humidity is ruining the powder stores. I do what I can.", "We could use fresh supplies, but the guns still work.", "I keep the crew ready, but they need more practice."],
      southeast_asian: ["Salt air eats at the iron. I'm fighting a losing battle with rust.", "We have enough powder for a fight, but not a war.", "The heat warps the carriages. I patch what I can."],
      east_asian: ["Supplies are adequate but not ideal.", "I would prefer more powder, but we will manage.", "The guns function. That is all I can promise."],
      african: ["The damp gets into everything. I keep the powder raised above the bilge.", "We are armed, but barely. I would not seek a fight.", "One engagement is all our stores will support."],
    },
    low: {
      european: ["The cannons are in a sorry state. I'd be surprised if half of them fire.", "We have almost no powder left. We're defenceless.", "If pirates find us now, God help us. The guns won't."],
      indian: ["The weapons are corroded beyond my ability to repair.", "I cannot promise these guns will fire. The powder is damp.", "We are a merchant ship with the teeth of a kitten."],
      southeast_asian: ["The guns are little more than decoration at this point.", "Rust has claimed two cannons already. The rest may follow.", "I have nothing to work with. No powder, no shot, no hope of a fight."],
      east_asian: ["I am ashamed of the state of our armaments.", "The guns cannot fire. We must rely on speed alone.", "Even pirates would pity our defences."],
      african: ["The cannons are seized with rust. We are unarmed in hostile waters.", "I have failed to keep the weapons ready. I accept the blame.", "If we are attacked, all I can offer is a cutlass and a prayer."],
    },
  },
  Sailor: {
    high: {
      european: ["Fair winds and following seas — what more could a sailor ask?", "The rigging is tight and the sails are full. A good day's work.", "I've served on worse ships. This one handles well."],
      indian: ["The ship sings when the sails catch the monsoon.", "A strong vessel and honest work. I am content.", "The sea provides for those who respect her."],
      southeast_asian: ["These warm waters are kind to a working man.", "The ship moves well. I take pride in my part of that.", "Good weather, good crew. It is enough."],
      east_asian: ["The sails are mended and the deck is clean.", "Honest labour under an open sky. I ask for nothing more.", "The ship is in good order. The crew works well together."],
      african: ["The wind carries us true. I trust this ship.", "I know the ropes and they know me. All is well.", "A sailor's life is hard but fair. Today it is fair."],
    },
    mid: {
      european: ["Another watch, another league. The sea doesn't care about tired bones.", "Could use a proper meal and a dry hammock, but I'll manage.", "The work is hard but steady. I've known worse."],
      indian: ["The heat makes the ropes burn. My hands are raw.", "We work and we wait. Such is a sailor's lot.", "I miss the shore, but the ship needs me."],
      southeast_asian: ["The humidity makes everything twice as heavy.", "I do my work and keep my head down. That's all one can do.", "The days blur together out here."],
      east_asian: ["The routine continues. I do not complain.", "There is always something to mend, something to haul.", "Work keeps the dark thoughts at bay."],
      african: ["The salt stings the eyes, but we carry on.", "I have known harder voyages than this.", "The watch is long tonight. I keep my eyes open."],
    },
    low: {
      european: ["How much longer must we suffer on this cursed voyage?", "The food is rotten and the water tastes of bilge.", "I didn't sign on for this. None of us did."],
      indian: ["My hands bleed and my belly is empty. Is this what I left home for?", "The ship groans and so do we.", "Some of the men talk of mutiny. I say nothing."],
      southeast_asian: ["The heat is killing us faster than any enemy could.", "I dream of solid ground and shade.", "We are worked like mules and fed like dogs."],
      east_asian: ["This voyage has taken everything from us.", "I cannot remember the last time I slept a full night.", "The crew is broken. We need port or we need a miracle."],
      african: ["Every day on this ship is worse than the last.", "I did not think I would die at sea, but now I wonder.", "There is nothing left in us. Only habit keeps us moving."],
    },
  },
  Factor: {
    high: {
      european: ["The ledgers balance perfectly. We stand to make a handsome profit.", "I've found buyers willing to pay twice what we paid for this cargo.", "Markets favour the prepared. And we are very well prepared."],
      indian: ["The spice prices are excellent. Our timing could not be better.", "I have contacts at the next port who will deal fairly with us.", "Every crate in the hold represents profit. I've ensured it."],
      southeast_asian: ["Cloves and nutmeg at these prices? We'll be rich men.", "The trading houses here know quality when they see it.", "I've negotiated terms that would make a Venetian weep with envy."],
      east_asian: ["Silk and porcelain — the margins are extraordinary.", "My calculations show a return of three hundred percent on this cargo.", "The merchants here are shrewd, but I am shrewder."],
      african: ["Gold and ivory at fair prices. The hold is full of fortune.", "I know the value of every item aboard. We are wealthy men.", "The trade networks here are ancient and reliable. We profit from them."],
    },
    mid: {
      european: ["The margins are thin but we'll turn a profit. Barely.", "I've seen better markets, but also worse. We'll manage.", "The competition is fierce. Everyone wants the same goods."],
      indian: ["Prices have shifted since we loaded. I must recalculate.", "The brokers here drive a hard bargain. I hold my ground.", "Some of the cargo has spoiled. Our profits suffer."],
      southeast_asian: ["The local traders are suspicious of outsiders. It takes time.", "We'll sell, but not at the price I hoped for.", "Tariffs eat into everything. The customs officers are relentless."],
      east_asian: ["The market is saturated with goods like ours.", "I am negotiating, but progress is slow.", "We will break even. That is the best I can promise."],
      african: ["The exchange rates here are unfavourable.", "I must find the right buyer. It requires patience.", "Our goods are desired, but no one wants to pay what they're worth."],
    },
    low: {
      european: ["We are haemorrhaging money. This cargo is worth less than the wood it sits on.", "I cannot sell these goods at any price. The market has collapsed.", "We should have stayed in port. This voyage is a financial disaster."],
      indian: ["The spices have spoiled. Months of investment, ruined.", "No one will trade with us. Our reputation precedes us, it seems.", "I cannot make coin from nothing, yet that is what I am asked to do."],
      southeast_asian: ["The customs officials have seized half our cargo.", "We owe more in port fees than we can earn from what remains.", "This is ruin. There is no other word for it."],
      east_asian: ["The merchants here will not deal with us at all.", "Every calculation I make ends in loss.", "I have failed the ship. The numbers do not lie."],
      african: ["There is no market for what we carry. We sail for nothing.", "Spoilage, theft, and bad luck have emptied our coffers.", "I would resign my post if there were anywhere to go."],
    },
  },
  Surgeon: {
    high: {
      european: ["The crew is in excellent health. My medicines are well stocked.", "No fevers, no scurvy. I run a clean ship, medically speaking.", "I've treated a blister and a splinter today. If only every day were so easy."],
      indian: ["I've learned remedies from the local physicians that European doctors would envy.", "The crew's health is my pride. Every man is fit for duty.", "Good food, clean water, and proper rest — the best medicine there is."],
      southeast_asian: ["The tropical herbs here are remarkable. I've restocked my supplies.", "Heat sickness is the main concern, but I've prepared for it.", "A healthy crew is a happy crew. I keep both."],
      east_asian: ["I've studied the local medical texts. Fascinating and practical.", "The crew's constitution is strong. I monitor them closely.", "Prevention is my art. When I do my job well, no one notices."],
      african: ["I have salves and tinctures enough for any malady.", "The crew is strong and well-fed. My work is easy.", "I keep a watchful eye. Disease is easier to prevent than to cure."],
    },
    mid: {
      european: ["A few men are feeling poorly. Nothing serious yet, but I'm watching closely.", "My supplies are adequate, though I could use fresh lemon juice.", "The usual ailments — blisters, strains, the odd tooth. Manageable."],
      indian: ["The tropical heat breeds fevers. I do what I can to keep them at bay.", "We need fresh provisions. Dried meat and biscuit won't keep scurvy away forever.", "I've treated three men this week. The work is steady."],
      southeast_asian: ["Infections spread fast in this humidity. I must be vigilant.", "Several men show early signs of scurvy. I need citrus fruit.", "The mosquitoes here carry sickness. I've prepared poultices, but they're crude."],
      east_asian: ["The damp quarters breed illness. I've ordered the berths aired out.", "My supplies are running low. I ration what remains.", "A surgeon without medicines is just a man with a knife. I need to restock."],
      african: ["Fevers are the enemy here. I fight them with what little I have.", "Two men are bedridden. I expect they'll recover, but slowly.", "I need quinine. Without it, the fevers will only get worse."],
    },
    low: {
      european: ["Half the crew is sick and my medicine chest is empty.", "I cannot cure what I cannot treat. We need port immediately.", "Men are dying and I can do nothing but watch. It is unbearable."],
      indian: ["The fever has taken hold. I've lost two men already.", "I have nothing left — no laudanum, no quinine, no salves. Just prayers.", "The ship has become a hospital. And a poor one at that."],
      southeast_asian: ["Tropical disease is ravaging the crew. My remedies are exhausted.", "I amputated a man's leg this morning with a carpenter's saw. This is not medicine.", "We are dying by degrees. Only landfall can save us now."],
      east_asian: ["The sickness spreads faster than I can treat it.", "I mix water and hope and call it medicine. It fools no one.", "If we do not find port within days, I will lose more men."],
      african: ["The fevers are beyond my skill to treat. I am overwhelmed.", "My hands shake from exhaustion. I have not slept in three days.", "There is a sickness aboard that I do not recognize. God help us all."],
    },
  },
};

function getCrewDialogue(member: CrewMember): string {
  const band: MoraleBand = member.morale > 60 ? 'high' : member.morale > 30 ? 'mid' : 'low';
  const region = NATIONALITY_REGION[member.nationality] ?? 'european';
  const lines = CREW_DIALOGUE[member.role]?.[band]?.[region];
  if (!lines || lines.length === 0) return 'I have nothing to say.';
  return lines[Math.floor(Math.random() * lines.length)];
}

// ═══════════════════════════════════════════════════════════════════════════
// ANIMATED WAVE DIVIDER
// ═══════════════════════════════════════════════════════════════════════════

function WaveDivider({ width = 48 }: { width?: number }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let animId: number;
    let last = 0;
    const frame = (time: number) => {
      animId = requestAnimationFrame(frame);
      if (time - last < 100) return;
      last = time;
      setTick(t => t + 1);
    };
    animId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animId);
  }, []);

  const chars: React.ReactNode[] = [];
  const waveChars = [' ', '\u00b7', '~', '\u223c', '\u2248'];
  const colors = ['#142830', '#1a3a4a', '#2a5a6a', '#3a7a8a', '#4a8a9a'];
  for (let i = 0; i < width; i++) {
    const t = tick * 0.15;
    const wave = Math.sin(i * 0.4 + t) * 0.4 + Math.sin(i * 0.15 - t * 0.6) * 0.35 + Math.sin(i * 0.8 + t * 1.3) * 0.25;
    const idx = Math.max(0, Math.min(waveChars.length - 1, Math.floor((wave + 1) * 0.5 * waveChars.length)));
    chars.push(<span key={i} style={{ color: colors[idx] }}>{waveChars[idx]}</span>);
  }

  return (
    <pre className="text-[11px] leading-[1.2] whitespace-pre text-center select-none overflow-hidden" style={{ fontFamily: MONO }}>
      {chars}
    </pre>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ORNATE RULE DIVIDER
// ═══════════════════════════════════════════════════════════════════════════

function OrnateRule({ sparkle, width = 44, className = '' }: { sparkle: (n: number) => string; width?: number; className?: string }) {
  const half = Math.floor((width - 5) / 2);
  return (
    <pre className={`text-[11px] whitespace-pre text-center select-none ${className}`} style={{ fontFamily: MONO }}>
      <C c={CLR.rule}>{'\u2576\u2500'}</C>
      <C c={CLR.rule}>{'\u2500'.repeat(half)}</C>
      <C c={CLR.dimGold}>{` ${sparkle(0)} `}</C>
      <C c={CLR.rule}>{'\u2500'.repeat(half)}</C>
      <C c={CLR.rule}>{'\u2500\u2574'}</C>
    </pre>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STAT GAUGE — polished bar with label + value
// ═══════════════════════════════════════════════════════════════════════════

function StatGauge({ label, value, numericValue, max, color, suffix, delay = 0 }: {
  label: string; value: string; numericValue: number; max: number; color: string; suffix?: string; delay?: number;
}) {
  const pct = Math.min(100, Math.max(0, (numericValue / max) * 100));

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35, delay, ease: [0.22, 1, 0.36, 1] }}
      className="flex items-center gap-3"
    >
      <span
        className="text-[10px] tracking-[0.18em] uppercase w-[52px] text-right shrink-0"
        style={{ color: CLR.dim, fontFamily: SANS, fontWeight: 500 }}
      >
        {label}
      </span>
      <div
        className="relative flex-1 h-[6px] rounded-full overflow-hidden"
        style={{
          backgroundColor: 'rgba(0,0,0,0.45)',
          boxShadow: `inset 0 1px 2px rgba(0,0,0,0.5)`,
        }}
      >
        {/* 50% tick */}
        <div
          aria-hidden
          className="absolute top-0 bottom-0 w-[1px] z-[1]"
          style={{ left: '50%', backgroundColor: CLR.rule + '70' }}
        />
        <motion.div
          className="h-full rounded-full relative z-[2]"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, delay: delay + 0.1, ease: [0.22, 1, 0.36, 1] }}
          style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}40` }}
        />
      </div>
      <span
        className="text-[12px] tabular-nums w-[56px] text-right shrink-0"
        style={{ color: CLR.bright, fontFamily: MONO }}
      >
        {value}
      </span>
      {suffix && (
        <span className="text-[10px] shrink-0" style={{ color: CLR.dim, fontFamily: SANS }}>{suffix}</span>
      )}
    </motion.div>
  );
}

// ── Shared section header: uppercase label left, optional stat right ─────

function SectionHeader({ label, stat, accent = CLR.dimGold }: {
  label: string; stat?: string; accent?: string;
}) {
  return (
    <div className="flex items-center justify-between mb-2">
      <h3
        className="text-[13px] tracking-[0.2em] uppercase"
        style={{ color: accent, fontFamily: SANS, fontWeight: 600 }}
      >
        {label}
      </h3>
      {stat && (
        <span className="text-[11px]" style={{ color: CLR.dim, fontFamily: SANS }}>
          {stat}
        </span>
      )}
    </div>
  );
}

// ── Tiered alert panel ──────────────────────────────────────────────────

function AlertPanel({ tier, alerts }: { tier: 'critical' | 'warning'; alerts: string[] }) {
  const color = tier === 'critical' ? CLR.red : CLR.yellow;
  const heading = tier === 'critical' ? 'Critical' : 'Warnings';
  const bg = tier === 'critical' ? `${color}10` : `${color}08`;
  return (
    <div
      className="rounded-lg p-3"
      style={{
        backgroundColor: bg,
        border: `1px solid ${color}${tier === 'critical' ? '55' : '2a'}`,
        boxShadow: tier === 'critical' ? `0 0 14px ${color}18, inset 0 1px 0 ${color}15` : undefined,
      }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[11px]" style={{ color }}>{tier === 'critical' ? '\u26a0' : '\u25b2'}</span>
        <span
          className="text-[10px] tracking-[0.2em] uppercase"
          style={{ color, fontFamily: SANS, fontWeight: 700 }}
        >
          {heading}
        </span>
      </div>
      <div className="space-y-1">
        {alerts.map((msg, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="text-[10px] mt-[2px] shrink-0" style={{ color: color + 'b0' }}>&bull;</span>
            <span className="text-[12px] leading-snug" style={{ color: CLR.bright, fontFamily: SANS }}>{msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MINI SHIP SCHEMATICS
// ═══════════════════════════════════════════════════════════════════════════

function MiniShipSchematic({ shipType }: { shipType: string }) {
  const s = CLR.sail;
  const h = CLR.hull;
  const m = CLR.mast;

  const ships: Record<string, React.ReactNode> = {
    Dhow: (
      <>
        <C c={m}>{'       |'}</C>{'\n'}
        <C c={s}>{'      /|'}</C>{'\n'}
        <C c={s}>{'     / |'}</C>{'\n'}
        <C c={h}>{'   ════════'}</C>
      </>
    ),
    Junk: (
      <>
        <C c={m}>{'      |   |'}</C>{'\n'}
        <C c={s}>{'     ┤│  ┤│'}</C>{'\n'}
        <C c={s}>{'     ┤│  ┤│'}</C>{'\n'}
        <C c={h}>{'   ══════════'}</C>
      </>
    ),
    Pinnace: (
      <>
        <C c={m}>{'        |'}</C>{'\n'}
        <C c={s}>{'       )|'}</C>{'\n'}
        <C c={s}>{'      )_)'}</C>{'\n'}
        <C c={h}>{'    ═══════'}</C>
      </>
    ),
    Galleon: (
      <>
        <C c={m}>{'       |    |    |    |'}</C>{'\n'}
        <C c={s}>{'      )_)  )_)  )_)  )_)'}</C>{'\n'}
        <C c={s}>{'     )___))___))___))___)'}</C><C c={h}>{'\\'}</C>{'\n'}
        <C c={h}>{'   ══════════════════════'}</C>
      </>
    ),
  };

  const carrack = (
    <>
      <C c={m}>{'        |    |    |'}</C>{'\n'}
      <C c={s}>{'       )_)  )_)  )_)'}</C>{'\n'}
      <C c={s}>{'      )___))___))___)'}</C><C c={h}>{'\\'}</C>{'\n'}
      <C c={h}>{'    ════════════════════'}</C>
    </>
  );

  return (
    <pre className="text-[11px] leading-[1.4] whitespace-pre text-center select-none" style={{ fontFamily: MONO }}>
      {ships[shipType] ?? carrack}
    </pre>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CREW MEMBER ROW
// ═══════════════════════════════════════════════════════════════════════════

function CrewRow({ member, delay }: {
  member: CrewMember; delay: number;
}) {
  const { name, role, health, morale, nationality } = member;
  const hs = HEALTH_STYLE[health] ?? HEALTH_STYLE.healthy;
  const moraleColor_ = morale > 60 ? CLR.green : morale > 30 ? CLR.yellow : CLR.red;
  const roleColor = ROLE_COLOR[role] ?? CLR.txt;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay }}
      onMouseEnter={(e) => {
        sfxHover();
        e.currentTarget.style.backgroundColor = CLR.bright + '06';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'transparent';
      }}
      className="group flex items-center gap-2.5 py-[7px] px-2 -mx-2 rounded-md border-b transition-colors duration-150"
      style={{ borderColor: CLR.rule + '30' }}
    >
      {/* Portrait */}
      <div
        className="w-[44px] h-[44px] rounded-full shrink-0 overflow-hidden flex items-center justify-center transition-transform duration-200 ease-out group-hover:scale-110"
        style={{
          border: `2px solid ${roleColor}60`,
          backgroundColor: roleColor + '10',
          boxShadow: `inset 0 1px 3px rgba(0,0,0,0.4), 0 0 6px ${roleColor}15`,
        }}
      >
        <CrewPortraitSquare member={member} size={44} />
      </div>
      {/* Name + flag */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        <span
          className="text-[13px] truncate"
          style={{ color: CLR.bright, fontFamily: SANS, fontWeight: 500 }}
        >
          {name}
        </span>
        <span className="shrink-0 opacity-80">
          <FactionFlag nationality={nationality} size={14} />
        </span>
      </div>
      {/* Role */}
      <span
        className="text-[12px] w-[76px] shrink-0"
        style={{ color: roleColor, fontFamily: SANS, fontWeight: 600 }}
      >
        {role}
      </span>
      {/* Health */}
      <span
        className="text-[11px] w-[52px] shrink-0 text-right"
        style={{ color: hs.color, fontFamily: SANS, fontWeight: 600 }}
      >
        {hs.label}
      </span>
      {/* Morale mini bar */}
      <div className="w-[42px] h-[4px] rounded-full overflow-hidden shrink-0" style={{ backgroundColor: CLR.rule + '50' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${morale}%`, backgroundColor: moraleColor_ }}
        />
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// OVERVIEW TAB
// ═══════════════════════════════════════════════════════════════════════════

function reputationTier(rep: number): { label: string; color: string } {
  if (rep >= 50) return { label: 'Allied', color: '#22c55e' };
  if (rep >= 25) return { label: 'Friendly', color: '#4ade80' };
  if (rep >= 5)  return { label: 'Favorable', color: '#86efac' };
  if (rep > -5)  return { label: 'Neutral', color: CLR.txt };
  if (rep > -25) return { label: 'Wary', color: '#fbbf24' };
  if (rep > -50) return { label: 'Hostile', color: '#f97316' };
  return { label: 'Enemy', color: '#ef4444' };
}

function OverviewTab() {
  const ship = useGameStore(s => s.ship);
  const stats = useGameStore(s => s.stats);
  const crew = useGameStore(s => s.crew);
  const cargo = useGameStore(s => s.cargo);
  const gold = useGameStore(s => s.gold);
  const provisions = useGameStore(s => s.provisions);
  const ports = useGameStore(s => s.ports);
  const playerPos = useGameStore(s => s.playerPos);
  const getReputation = useGameStore(s => s.getReputation);
  const captain = crew.find(c => c.role === 'Captain') ?? crew[0];
  const sparkle = useSparkle();
  const hullPct = Math.round((stats.hull / stats.maxHull) * 100);
  const sailsPct = Math.round((stats.sails / stats.maxSails) * 100);
  const avgMorale = Math.round(crew.reduce((a, c) => a + c.morale, 0) / (crew.length || 1));
  const currentCargo = Object.entries(cargo).reduce(
    (sum, [c, qty]) => sum + qty * (COMMODITY_DEFS[c as Commodity]?.weight ?? 1), 0
  );
  const cargoPct = Math.round((currentCargo / stats.cargoCapacity) * 100);
  const sickCrew = crew.filter(c => c.health !== 'healthy');

  // Nearest port + its controlling faction
  const nearestPort = ports.reduce<{ name: string; id: string; dist: number } | null>((best, p) => {
    const dx = playerPos[0] - p.position[0];
    const dz = playerPos[2] - p.position[2];
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (!best || dist < best.dist) return { name: p.name, id: p.id, dist };
    return best;
  }, null);

  const locationStr = nearestPort
    ? nearestPort.dist < 30 ? `at ${nearestPort.name}`
      : nearestPort.dist < 150 ? `near ${nearestPort.name}`
      : `open sea \u2014 nearest port: ${nearestPort.name}`
    : 'open sea';

  // Contextual reputation — faction controlling nearest port
  const nearFaction = nearestPort ? PORT_FACTION[nearestPort.id] : null;
  const nearRep = nearFaction ? getReputation(nearFaction) : 0;
  const nearRepTier = nearFaction ? reputationTier(nearRep) : null;

  // Weapon summary
  const weaponCounts: Record<string, number> = {};
  stats.armament.forEach(w => {
    const name = WEAPON_DEFS[w].name;
    weaponCounts[name] = (weaponCounts[name] || 0) + 1;
  });
  const weaponStr = Object.entries(weaponCounts).map(([name, count]) =>
    count > 1 ? `${count}\u00d7 ${name}` : name
  ).join(', ') || 'Unarmed';

  // Alerts — tiered into critical vs warning
  type Alert = { msg: string; tier: 'critical' | 'warning' };
  const alerts: Alert[] = [];
  if (stats.hull < stats.maxHull * 0.2) {
    alerts.push({ msg: `Hull critical \u2014 ${stats.maxHull - stats.hull} pts repair needed`, tier: 'critical' });
  } else if (stats.hull < stats.maxHull * 0.5) {
    alerts.push({ msg: `Hull damaged \u2014 ${stats.maxHull - stats.hull} pts repair needed`, tier: 'warning' });
  } else if (stats.hull < stats.maxHull) {
    alerts.push({ msg: `Hull scuffed \u2014 ${stats.maxHull - stats.hull} pts repair needed`, tier: 'warning' });
  }
  if (provisions < 5) {
    alerts.push({ msg: `Starvation imminent: ${provisions} provisions remaining`, tier: 'critical' });
  } else if (provisions < 10) {
    alerts.push({ msg: `Provisions dangerously low: ${provisions} remaining`, tier: 'warning' });
  }
  sickCrew.forEach(c => {
    alerts.push({ msg: `${c.name}: ${c.health}`, tier: c.health === 'injured' || c.health === 'fevered' ? 'critical' : 'warning' });
  });
  if (stats.sails < stats.maxSails * 0.5) {
    alerts.push({ msg: `Sails damaged \u2014 ${stats.maxSails - stats.sails} pts repair needed`, tier: 'warning' });
  }
  const criticalAlerts = alerts.filter(a => a.tier === 'critical');
  const warningAlerts = alerts.filter(a => a.tier === 'warning');

  return (
    <motion.div
      key="overview"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center w-full"
    >
      {/* ── Ship name + flag + type ── */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05 }}
        className="text-center mt-1"
      >
        <div className="flex items-center justify-center gap-3">
          <span className="shrink-0" style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.5))' }}>
            <FactionFlag nationality={ship.flag as Nationality} size={28} />
          </span>
          <h2
            className="text-[22px] md:text-[26px] tracking-[0.2em] uppercase"
            style={{ color: CLR.gold, fontFamily: MONO, fontWeight: 400 }}
          >
            {ship.name}
          </h2>
        </div>
        <p
          className="text-[13px] mt-1.5 tracking-wide"
          style={{ color: CLR.txt, fontFamily: SERIF, fontStyle: 'italic' }}
        >
          {ship.flag} {ship.type}
          {captain && <> &middot; Captain {captain.name}</>}
        </p>
      </motion.div>

      {/* ── Ornate rule ── */}
      <motion.div
        initial={{ opacity: 0, scaleX: 0.4 }}
        animate={{ opacity: 1, scaleX: 1 }}
        transition={{ duration: 0.4, delay: 0.15 }}
        className="mt-3 w-full max-w-md"
      >
        <OrnateRule sparkle={sparkle} width={50} />
      </motion.div>

      {/* ── SHIP + FLANKING STATS (desktop) ── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="mt-4 w-full max-w-3xl"
      >
        {/* Desktop: three-column — stats | ship | stats */}
        <div className="hidden md:grid grid-cols-[1fr_auto_1fr] gap-10 items-center px-4">
          {/* Left column stats */}
          <div className="space-y-3">
            <StatGauge label="Hull" value={`${stats.hull}/${stats.maxHull}`} numericValue={stats.hull} max={stats.maxHull} color={hullColor(hullPct)} delay={0.25} />
            <StatGauge label="Sails" value={`${stats.sails}/${stats.maxSails}`} numericValue={stats.sails} max={stats.maxSails} color={sailsPct > 50 ? CLR.txt : CLR.yellow} delay={0.3} />
            <StatGauge label="Speed" value={`${stats.speed}`} numericValue={stats.speed} max={25} color={CLR.cyan} delay={0.35} />
          </div>

          {/* Center: ship schematic — live procedural renderer */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="flex flex-col items-center px-4"
          >
            <ShipView
              shipType={ship.type}
              hull={stats.hull}
              maxHull={stats.maxHull}
              sails={stats.sails}
              maxSails={stats.maxSails}
              wind={0.6}
              flagColor={pickFlagColor(ship.flag as Nationality)}
              size="small"
              view="exterior"
              showToggle={false}
            />
            <div className="mt-1">
              <WaveDivider width={30} />
            </div>
          </motion.div>

          {/* Right column stats */}
          <div className="space-y-3">
            <StatGauge label="Morale" value={`${avgMorale}%`} numericValue={avgMorale} max={100} color={moraleColor(avgMorale)} delay={0.25} />
            <StatGauge label="Cargo" value={`${currentCargo}/${stats.cargoCapacity}`} numericValue={currentCargo} max={stats.cargoCapacity} color={cargoColor(cargoPct)} delay={0.3} />
            <StatGauge label="Food" value={`${provisions}`} numericValue={provisions} max={60} color={provisions < 10 ? CLR.red : CLR.warm} suffix="-2/day" delay={0.35} />
          </div>
        </div>

        {/* Mobile: ship on top, stats below */}
        <div className="md:hidden flex flex-col items-center">
          <ShipView
            shipType={ship.type}
            hull={stats.hull}
            maxHull={stats.maxHull}
            sails={stats.sails}
            maxSails={stats.maxSails}
            wind={0.6}
            flagColor={pickFlagColor(ship.flag as Nationality)}
            size="small"
            view="exterior"
            showToggle={false}
          />
          <div className="mt-1 w-full">
            <WaveDivider width={36} />
          </div>
          <div className="mt-4 w-full space-y-2.5 px-2">
            <StatGauge label="Hull" value={`${stats.hull}/${stats.maxHull}`} numericValue={stats.hull} max={stats.maxHull} color={hullColor(hullPct)} delay={0.2} />
            <StatGauge label="Sails" value={`${stats.sails}/${stats.maxSails}`} numericValue={stats.sails} max={stats.maxSails} color={sailsPct > 50 ? CLR.txt : CLR.yellow} delay={0.25} />
            <StatGauge label="Speed" value={`${stats.speed}`} numericValue={stats.speed} max={25} color={CLR.cyan} delay={0.3} />
            <StatGauge label="Morale" value={`${avgMorale}%`} numericValue={avgMorale} max={100} color={moraleColor(avgMorale)} delay={0.35} />
            <StatGauge label="Cargo" value={`${currentCargo}/${stats.cargoCapacity}`} numericValue={currentCargo} max={stats.cargoCapacity} color={cargoColor(cargoPct)} delay={0.4} />
            <StatGauge label="Food" value={`${provisions}`} numericValue={provisions} max={60} color={provisions < 10 ? CLR.red : CLR.warm} suffix="-2/day" delay={0.45} />
          </div>
        </div>
      </motion.div>

      {/* ── Location + contextual reputation ── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.4 }}
        className="mt-4 text-center"
      >
        <p className="text-[13px]" style={{ color: CLR.dim, fontFamily: SERIF, fontStyle: 'italic' }}>
          ~ {locationStr} ~
        </p>
        {nearFaction && nearRepTier && nearestPort && nearestPort.dist < 200 && (
          <div className="flex items-center justify-center gap-2 mt-2">
            <FactionFlag nationality={nearFaction} size={14} />
            <span className="text-[12px]" style={{ color: CLR.dim, fontFamily: SANS }}>
              Standing with <span style={{ color: CLR.txt, fontWeight: 500 }}>{nearFaction}</span>:
            </span>
            <span
              className="text-[12px] font-semibold px-2 py-0.5 rounded"
              style={{
                color: nearRepTier.color,
                backgroundColor: nearRepTier.color + '12',
                border: `1px solid ${nearRepTier.color}25`,
                fontFamily: SANS,
              }}
            >
              {nearRepTier.label}
            </span>
            <span className="text-[10px] tabular-nums" style={{ color: CLR.dim, fontFamily: MONO }}>
              {nearRep > 0 ? '+' : ''}{nearRep}
            </span>
          </div>
        )}
      </motion.div>

      {/* ── Gold / Armament / Captain summary cards ── */}
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.42 }}
        className="mt-4 w-full max-w-lg px-2 md:px-4"
      >
        <div className="grid grid-cols-3 gap-2 md:gap-3">
          {/* Gold */}
          <div
            className="flex flex-col items-center py-2.5 px-2 rounded-lg"
            style={{ backgroundColor: CLR.gold + '08', border: `1px solid ${CLR.gold}20` }}
          >
            <span className="text-[10px] tracking-[0.18em] uppercase mb-1" style={{ color: CLR.dimGold, fontFamily: SANS, fontWeight: 500 }}>
              Treasury
            </span>
            <span className="text-[18px] md:text-[20px] tabular-nums" style={{ color: CLR.gold, fontFamily: MONO, fontWeight: 400 }}>
              {gold.toLocaleString()}
            </span>
            <span className="text-[10px] mt-0.5" style={{ color: CLR.dim, fontFamily: SANS }}>gold</span>
          </div>

          {/* Armament */}
          <div
            className="flex flex-col items-center py-2.5 px-2 rounded-lg"
            style={{ backgroundColor: CLR.red + '06', border: `1px solid ${CLR.red}15` }}
          >
            <span className="text-[10px] tracking-[0.18em] uppercase mb-1" style={{ color: CLR.dim, fontFamily: SANS, fontWeight: 500 }}>
              Armament
            </span>
            <span className="text-[14px] md:text-[15px] text-center leading-tight" style={{ color: CLR.bright, fontFamily: SANS, fontWeight: 500 }}>
              {weaponStr}
            </span>
            <span className="text-[10px] mt-0.5" style={{ color: CLR.dim, fontFamily: SANS }}>
              {stats.cannons > 0 ? `${stats.cannons} broadside` : 'no broadside'}
            </span>
          </div>

          {/* Captain / XP */}
          {captain && (
            <div
              className="flex flex-col items-center py-2.5 px-2 rounded-lg"
              style={{ backgroundColor: CLR.cyan + '06', border: `1px solid ${CLR.cyan}15` }}
            >
              <span className="text-[10px] tracking-[0.18em] uppercase mb-1" style={{ color: CLR.dim, fontFamily: SANS, fontWeight: 500 }}>
                Captain
              </span>
              <span className="text-[16px] md:text-[18px] tabular-nums" style={{ color: CLR.cyan, fontFamily: MONO }}>
                Lvl {captain?.level ?? 1}
              </span>
              <div className="w-full mt-1.5 px-1">
                <div className="h-[3px] rounded-full overflow-hidden" style={{ backgroundColor: CLR.rule + '50' }}>
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${Math.min(100, ((captain?.xp ?? 0) / (captain?.xpToNext ?? 100)) * 100)}%`,
                      backgroundColor: CLR.cyan,
                      boxShadow: `0 0 6px ${CLR.cyan}40`,
                    }}
                  />
                </div>
                <p className="text-[9px] text-center mt-1 tabular-nums" style={{ color: CLR.dim, fontFamily: MONO }}>
                  {captain?.xp ?? 0}/{captain?.xpToNext ?? 100} XP
                </p>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* ── Wave divider ── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.45 }}
        className="mt-4 w-full max-w-lg"
      >
        <WaveDivider width={56} />
      </motion.div>

      {/* ── Crew roster ── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.5 }}
        className="mt-3 w-full max-w-lg px-2 md:px-4"
      >
        <SectionHeader
          label={`Crew \u00b7 ${crew.length} Souls`}
          stat={`Avg morale ${avgMorale}%`}
        />

        {crew.map((c, i) => (
          <CrewRow
            key={c.id}
            member={c}
            delay={0.52 + i * 0.04}
          />
        ))}
      </motion.div>

      {/* ── Alerts ── */}
      {alerts.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.65 }}
          className="mt-4 w-full max-w-lg px-2 md:px-4 space-y-2"
        >
          {criticalAlerts.length > 0 && (
            <AlertPanel tier="critical" alerts={criticalAlerts.map(a => a.msg)} />
          )}
          {warningAlerts.length > 0 && (
            <AlertPanel tier="warning" alerts={warningAlerts.map(a => a.msg)} />
          )}
        </motion.div>
      )}

      {/* Bottom breathing room */}
      <div className="h-4" />
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// REPUTATION TAB
// ═══════════════════════════════════════════════════════════════════════════

const FACTION_REGIONS: { label: string; factions: Nationality[] }[] = [
  { label: 'European Powers', factions: ['English', 'Portuguese', 'Dutch', 'Spanish', 'French', 'Danish'] },
  { label: 'Indian Subcontinent', factions: ['Mughal', 'Gujarati'] },
  { label: 'Middle East & East Africa', factions: ['Persian', 'Ottoman', 'Omani', 'Swahili'] },
  { label: 'Southeast Asia', factions: ['Malay', 'Acehnese', 'Javanese', 'Moluccan'] },
  { label: 'East Asia', factions: ['Siamese', 'Japanese', 'Chinese'] },
];

// Reverse lookup: which ports does each faction control?
const FACTION_PORTS: Partial<Record<Nationality, string[]>> = {};
for (const [portId, faction] of Object.entries(PORT_FACTION)) {
  if (!FACTION_PORTS[faction]) FACTION_PORTS[faction] = [];
  FACTION_PORTS[faction]!.push(portId.charAt(0).toUpperCase() + portId.slice(1));
}

function ReputationTab() {
  const ship = useGameStore(s => s.ship);
  const reputation = useGameStore(s => s.reputation);
  const getReputation = useGameStore(s => s.getReputation);
  const sparkle = useSparkle();
  const [expanded, setExpanded] = useState<string | null>(null);

  const playerFaction = ship.flag as Nationality;

  // Split factions into encountered (non-zero rep or own faction) and unknown
  const encountered = new Set<Nationality>();
  encountered.add(playerFaction);
  for (const [nat, val] of Object.entries(reputation)) {
    if (val !== 0) encountered.add(nat as Nationality);
  }

  return (
    <motion.div
      key="reputation"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center w-full"
    >
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05 }}
        className="text-center mt-1"
      >
        <h2
          className="text-[20px] md:text-[22px] tracking-[0.25em] uppercase"
          style={{ color: CLR.tabReputation, fontFamily: MONO }}
        >
          Reputation
        </h2>
        <p className="text-[13px] mt-1" style={{ color: CLR.txt, fontFamily: SERIF, fontStyle: 'italic' }}>
          Your standing among the nations of the Indian Ocean
        </p>
      </motion.div>

      {/* Your allegiance */}
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.12 }}
        className="mt-4 w-full max-w-xl px-2 md:px-4"
      >
        <div
          className="flex items-center gap-3 p-3 rounded-lg"
          style={{
            backgroundColor: CLR.gold + '08',
            border: `1px solid ${CLR.gold}25`,
          }}
        >
          <FactionFlag nationality={playerFaction} size={24} />
          <div className="flex-1 min-w-0">
            <span className="text-[10px] tracking-[0.18em] uppercase" style={{ color: CLR.dimGold, fontFamily: SANS, fontWeight: 500 }}>
              Your Allegiance
            </span>
            <p className="text-[14px] mt-0.5" style={{ color: CLR.gold, fontFamily: SANS, fontWeight: 600 }}>
              {FACTIONS[playerFaction].displayName}
            </p>
          </div>
          <FactionFlag nationality={playerFaction} size={24} />
        </div>
      </motion.div>

      {/* Faction regions */}
      {FACTION_REGIONS.map((region, ri) => {
        const regionFactions = region.factions.filter(f => encountered.has(f));
        const unknownFactions = region.factions.filter(f => !encountered.has(f));
        if (regionFactions.length === 0 && unknownFactions.length === 0) return null;

        return (
          <motion.div
            key={region.label}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.18 + ri * 0.06 }}
            className="mt-5 w-full max-w-xl px-2 md:px-4"
          >
            {/* Region header */}
            <div className="flex items-center gap-3 mb-2">
              <pre className="text-[11px] whitespace-pre select-none" style={{ fontFamily: MONO }}>
                <C c={CLR.rule}>{'\u2500'.repeat(4)}</C>
                <C c={CLR.dimGold}>{` ${sparkle(ri)} `}</C>
                <C c={CLR.rule}>{'\u2500'.repeat(4)}</C>
              </pre>
              <span
                className="text-[11px] tracking-[0.18em] uppercase shrink-0"
                style={{ color: CLR.dimGold, fontFamily: SANS, fontWeight: 600 }}
              >
                {region.label}
              </span>
              <div className="flex-1 h-[1px]" style={{ background: `linear-gradient(90deg, ${CLR.rule}60, transparent)` }} />
            </div>

            {/* Encountered factions */}
            <div className="space-y-1">
              {regionFactions.map((factionId, fi) => (
                <FactionRow
                  key={factionId}
                  factionId={factionId}
                  isPlayerFaction={factionId === playerFaction}
                  rep={getReputation(factionId)}
                  expanded={expanded === factionId}
                  onToggle={() => { sfxClick(); setExpanded(expanded === factionId ? null : factionId); }}
                  delay={0.2 + ri * 0.06 + fi * 0.03}
                />
              ))}
            </div>

            {/* Unknown factions */}
            {unknownFactions.length > 0 && (
              <div className="mt-2 space-y-0.5">
                {unknownFactions.map(factionId => (
                  <div
                    key={factionId}
                    className="flex items-center gap-2.5 py-[5px] px-2 rounded opacity-40"
                  >
                    <FactionFlag nationality={factionId} size={16} />
                    <span className="text-[12px]" style={{ color: CLR.dim, fontFamily: SANS }}>
                      {FACTIONS[factionId].shortName}
                    </span>
                    <span className="text-[10px] ml-auto" style={{ color: CLR.rule, fontFamily: SERIF, fontStyle: 'italic' }}>
                      unknown
                    </span>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        );
      })}

      {/* Effects explanation */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.6 }}
        className="mt-6 w-full max-w-xl px-2 md:px-4 mb-4"
      >
        <div className="p-3 rounded-lg" style={{ backgroundColor: CLR.rule + '15', border: `1px solid ${CLR.rule}25` }}>
          <p className="text-[10px] tracking-[0.15em] uppercase mb-2" style={{ color: CLR.dimGold, fontFamily: SANS, fontWeight: 600 }}>
            How Reputation Works
          </p>
          <div className="space-y-1.5">
            {[
              { tier: 'Allied', color: '#22c55e', effect: 'Best trade prices, safe passage, access to exclusive goods' },
              { tier: 'Friendly', color: '#4ade80', effect: 'Better prices, ships will not attack' },
              { tier: 'Neutral', color: CLR.txt, effect: 'Standard trade terms, unpredictable encounters' },
              { tier: 'Hostile', color: '#f97316', effect: 'Poor prices, ships may attack on sight' },
              { tier: 'Enemy', color: '#ef4444', effect: 'Ports closed, ships will attack' },
            ].map(row => (
              <div key={row.tier} className="flex items-start gap-2">
                <span
                  className="text-[10px] font-semibold w-[56px] shrink-0 text-right px-1.5 py-0.5 rounded"
                  style={{ color: row.color, backgroundColor: row.color + '12', border: `1px solid ${row.color}20`, fontFamily: SANS }}
                >
                  {row.tier}
                </span>
                <span className="text-[11px] leading-relaxed" style={{ color: CLR.dim, fontFamily: SANS }}>
                  {row.effect}
                </span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      <div className="h-4" />
    </motion.div>
  );
}

// ── Faction row with expandable detail ───────────────────────────────────

function FactionRow({ factionId, isPlayerFaction, rep, expanded, onToggle, delay }: {
  factionId: Nationality; isPlayerFaction: boolean; rep: number; expanded: boolean; onToggle: () => void; delay: number;
}) {
  const faction = FACTIONS[factionId];
  const tier = reputationTier(rep);
  const ports = FACTION_PORTS[factionId];

  // Bar: -100 to +100 mapped to 0-100% with center at 50%

  return (
    <motion.div
      initial={{ opacity: 0, y: 3 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay }}
    >
      <button
        onClick={onToggle}
        className="w-full text-left rounded-lg px-3 py-2.5 transition-colors hover:bg-white/[0.02]"
        style={{
          backgroundColor: expanded ? 'rgba(255,255,255,0.02)' : 'transparent',
          border: expanded ? `1px solid ${tier.color}20` : '1px solid transparent',
        }}
      >
        <div className="flex items-center gap-2.5">
          {/* Flag */}
          <FactionFlag nationality={factionId} size={20} />

          {/* Name */}
          <span
            className="text-[13px] flex-1 min-w-0 truncate"
            style={{ color: isPlayerFaction ? CLR.gold : CLR.bright, fontFamily: SANS, fontWeight: isPlayerFaction ? 600 : 400 }}
          >
            {faction.shortName}
            {isPlayerFaction && (
              <span className="text-[9px] ml-1.5 tracking-wider uppercase" style={{ color: CLR.dimGold }}>
                (you)
              </span>
            )}
          </span>

          {/* Tier badge */}
          <span
            className="text-[10px] font-semibold px-2 py-0.5 rounded shrink-0"
            style={{
              color: tier.color,
              backgroundColor: tier.color + '12',
              border: `1px solid ${tier.color}25`,
              fontFamily: SANS,
            }}
          >
            {tier.label}
          </span>

          {/* Numeric value */}
          <span
            className="text-[11px] w-[32px] text-right tabular-nums shrink-0"
            style={{ color: tier.color, fontFamily: MONO }}
          >
            {rep > 0 ? '+' : ''}{rep}
          </span>

          {/* Expand chevron */}
          <span
            className="text-[10px] transition-transform duration-200 shrink-0"
            style={{ color: CLR.dim, transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
          >
            ▸
          </span>
        </div>

        {/* Reputation bar — centered at zero */}
        <div className="mt-2 flex items-center gap-2">
          <span className="text-[8px] tabular-nums w-[20px] text-right" style={{ color: CLR.rule, fontFamily: MONO }}>-100</span>
          <div className="flex-1 h-[5px] rounded-full overflow-hidden relative" style={{ backgroundColor: CLR.rule + '40' }}>
            {/* Center line */}
            <div className="absolute left-1/2 top-0 bottom-0 w-[1px]" style={{ backgroundColor: CLR.dim + '60' }} />
            {/* Fill bar */}
            {rep >= 0 ? (
              <div
                className="absolute top-0 bottom-0 rounded-r-full transition-all duration-700"
                style={{
                  left: '50%',
                  width: `${(rep / 100) * 50}%`,
                  backgroundColor: tier.color,
                  boxShadow: `0 0 6px ${tier.color}30`,
                }}
              />
            ) : (
              <div
                className="absolute top-0 bottom-0 rounded-l-full transition-all duration-700"
                style={{
                  right: '50%',
                  width: `${(Math.abs(rep) / 100) * 50}%`,
                  backgroundColor: tier.color,
                  boxShadow: `0 0 6px ${tier.color}30`,
                }}
              />
            )}
          </div>
          <span className="text-[8px] tabular-nums w-[20px]" style={{ color: CLR.rule, fontFamily: MONO }}>+100</span>
        </div>
      </button>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-1 space-y-2">
              {/* Description */}
              <p className="text-[12px] leading-relaxed" style={{ color: CLR.txt, fontFamily: SERIF, fontStyle: 'italic' }}>
                {faction.description}
              </p>

              {/* Controlled ports */}
              {ports && ports.length > 0 && (
                <div className="flex items-start gap-2">
                  <span className="text-[10px] tracking-wider uppercase shrink-0 mt-0.5" style={{ color: CLR.dim, fontFamily: SANS, fontWeight: 500 }}>
                    Controls
                  </span>
                  <span className="text-[11px] leading-relaxed" style={{ color: CLR.warm, fontFamily: SANS }}>
                    {ports.join(', ')}
                  </span>
                </div>
              )}

              {/* Mechanical effect hint */}
              <p className="text-[10px]" style={{ color: CLR.dim, fontFamily: SANS }}>
                {rep >= 25
                  ? 'Their ports offer you favorable trade prices.'
                  : rep >= 5
                    ? 'You are welcome in their waters.'
                    : rep > -5
                      ? 'They regard you with indifference.'
                      : rep > -25
                        ? 'Their merchants charge you premium rates.'
                        : 'Their ships may attack you on sight.'}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CREW TAB
// ═══════════════════════════════════════════════════════════════════════════

const ASSIGNABLE_ROLES: CrewRole[] = ['Sailor', 'Navigator', 'Gunner', 'Factor', 'Surgeon'];

const QUALITY_STYLE: Record<CrewQuality, { label: string; color: string; bg: string; border: string }> = {
  disaster:  { label: 'Disaster',  color: '#b91c1c', bg: 'rgba(185,28,28,0.10)',   border: 'rgba(185,28,28,0.30)' },
  dud:       { label: 'Dud',       color: '#92400e', bg: 'rgba(120,80,20,0.08)',   border: 'rgba(120,80,20,0.2)' },
  untried:   { label: 'Untried',   color: '#a1a1aa', bg: 'rgba(161,161,170,0.06)', border: 'rgba(161,161,170,0.22)' },
  passable:  { label: 'Passable',  color: CLR.txt,   bg: 'transparent',            border: CLR.rule + '30' },
  able:      { label: 'Able',      color: '#60a5fa', bg: 'rgba(96,165,250,0.06)',  border: 'rgba(96,165,250,0.22)' },
  seasoned:  { label: 'Seasoned',  color: '#34d399', bg: 'rgba(52,211,153,0.06)',  border: 'rgba(52,211,153,0.24)' },
  renowned:  { label: 'Renowned',  color: '#22d3ee', bg: 'rgba(34,211,238,0.06)',  border: 'rgba(34,211,238,0.26)' },
  legendary: { label: 'Legendary', color: '#a78bfa', bg: 'rgba(167,139,250,0.06)', border: 'rgba(167,139,250,0.25)' },
};

function CrewTab({ initialCrewId }: { initialCrewId?: string }) {
  const crew = useGameStore(s => s.crew);
  const setCrewRole = useGameStore(s => s.setCrewRole);
  const [selectedId, setSelectedId] = useState<string | null>(initialCrewId ?? null);

  const selectedMember = selectedId ? crew.find(c => c.id === selectedId) : null;

  // If the selected member was removed (dismissed, etc.), go back to roster
  if (selectedId && !selectedMember) {
    // Can't call setState during render, so use effect pattern
    return <CrewRoster crew={crew} onSelect={(id) => setSelectedId(id)} />;
  }

  if (selectedMember) {
    const sortedCrew = [...crew].sort((a, b) => (ROLE_SORT_ORDER[a.role] ?? 9) - (ROLE_SORT_ORDER[b.role] ?? 9));
    const currentIndex = sortedCrew.findIndex(c => c.id === selectedMember.id);
    return (
      <CrewDetailView
        member={selectedMember}
        onBack={() => setSelectedId(null)}
        onRoleChange={(role) => { setCrewRole(selectedMember.id, role); }}
        onPrev={currentIndex > 0 ? () => { sfxClick(); setSelectedId(sortedCrew[currentIndex - 1].id); } : undefined}
        onNext={currentIndex < sortedCrew.length - 1 ? () => { sfxClick(); setSelectedId(sortedCrew[currentIndex + 1].id); } : undefined}
      />
    );
  }

  return <CrewRoster crew={crew} onSelect={(id) => { sfxClick(); setSelectedId(id); }} />;
}

// ── Crew roster (list view) ─────────────────────────────────────────────

const ROLE_SORT_ORDER: Record<string, number> = {
  Captain: 0, Navigator: 1, Gunner: 2, Factor: 3, Surgeon: 4, Sailor: 5,
};

function CrewRoster({ crew, onSelect }: { crew: CrewMember[]; onSelect: (id: string) => void }) {
  const setCrewRole = useGameStore(s => s.setCrewRole);
  const dayCount = useGameStore(s => s.dayCount);
  const avgSkill = Math.round(crew.reduce((a, c) => a + c.skill, 0) / (crew.length || 1));
  const avgMorale = Math.round(crew.reduce((a, c) => a + c.morale, 0) / (crew.length || 1));
  const healthyCrew = crew.filter(c => c.health === 'healthy').length;
  const sickCrew = crew.filter(c => c.health !== 'healthy');
  const sortedCrew = [...crew].sort((a, b) => (ROLE_SORT_ORDER[a.role] ?? 9) - (ROLE_SORT_ORDER[b.role] ?? 9));

  return (
    <motion.div
      key="crew-roster"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center w-full"
    >
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05 }}
        className="text-center mt-1"
      >
        <h2
          className="text-[20px] md:text-[22px] tracking-[0.25em] uppercase"
          style={{ color: CLR.tabCrew, fontFamily: MONO }}
        >
          Crew
        </h2>
        <p className="text-[13px] mt-1" style={{ color: CLR.txt, fontFamily: SERIF, fontStyle: 'italic' }}>
          {crew.length} souls aboard
        </p>
      </motion.div>

      {/* Ornate divider */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="mt-3 w-full max-w-2xl"
      >
        <WaveDivider width={60} />
      </motion.div>

      {/* Column headers */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2, delay: 0.12 }}
        className="mt-3 w-full max-w-2xl px-3 md:px-5"
      >
        <div className="flex items-center gap-3 px-3 pb-1.5" style={{ borderBottom: `1px solid ${CLR.rule}30` }}>
          {/* Portrait spacer */}
          <div className="w-[48px] shrink-0" />
          {/* Name */}
          <span className="flex-1 text-[9px] tracking-[0.2em] uppercase" style={{ color: CLR.dim, fontFamily: SANS, fontWeight: 500 }}>
            Name
          </span>
          {/* Role */}
          <span className="w-[78px] shrink-0 text-[9px] tracking-[0.2em] uppercase" style={{ color: CLR.dim, fontFamily: SANS, fontWeight: 500 }}>
            Role
          </span>
          {/* Skill */}
          <span className="hidden md:block w-[72px] shrink-0 text-[9px] tracking-[0.2em] uppercase" style={{ color: CLR.dim, fontFamily: SANS, fontWeight: 500 }}>
            Skill
          </span>
          {/* Health */}
          <span className="w-[48px] shrink-0 text-right text-[9px] tracking-[0.2em] uppercase" style={{ color: CLR.dim, fontFamily: SANS, fontWeight: 500 }}>
            Health
          </span>
          {/* Morale */}
          <span className="w-[52px] shrink-0 text-right text-[9px] tracking-[0.2em] uppercase" style={{ color: CLR.dim, fontFamily: SANS, fontWeight: 500 }}>
            Morale
          </span>
          {/* Days */}
          <span className="hidden md:block w-[36px] shrink-0 text-right text-[9px] tracking-[0.2em] uppercase" style={{ color: CLR.dim, fontFamily: SANS, fontWeight: 500 }}>
            Days
          </span>
          {/* Chevron spacer */}
          <div className="w-[14px] shrink-0" />
        </div>
      </motion.div>

      {/* Full crew roster */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.15 }}
        className="mt-1 w-full max-w-2xl px-3 md:px-5"
      >
        <div>
          {sortedCrew.map((m, i) => (
            <CrewRosterRow
              key={m.id}
              member={m}
              index={i}
              dayCount={dayCount}
              onClick={() => onSelect(m.id)}
              onRoleChange={(role) => { sfxClick(); setCrewRole(m.id, role); }}
              delay={0.18 + i * 0.03}
            />
          ))}
        </div>
      </motion.div>

      {/* Summary footer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.4 }}
        className="mt-4 w-full max-w-2xl px-3 md:px-5 mb-4"
      >
        <div
          className="p-3 rounded-lg flex items-center justify-between flex-wrap gap-2"
          style={{ backgroundColor: CLR.rule + '15', border: `1px solid ${CLR.rule}25` }}
        >
          <div className="flex items-center gap-4">
            <SummaryStat label="Avg Skill" value={avgSkill.toString()} color={CLR.cyan} />
            <SummaryStat label="Avg Morale" value={`${avgMorale}%`} color={moraleColor(avgMorale)} />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px]" style={{ color: CLR.green, fontFamily: SANS }}>
              {healthyCrew} fit
            </span>
            {sickCrew.length > 0 && (
              <span className="text-[11px]" style={{ color: CLR.yellow, fontFamily: SANS }}>
                {sickCrew.length} ailing
              </span>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function SummaryStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] tracking-wider uppercase" style={{ color: CLR.dim, fontFamily: SANS }}>{label}</span>
      <span className="text-[13px] tabular-nums font-semibold" style={{ color, fontFamily: MONO }}>{value}</span>
    </div>
  );
}

// ── Captain card ─────────────────────────────────────────────────────────

// ── Shared: Abilities (strength/perception/charisma/luck) ────────────────

const ABILITY_LABELS: { key: keyof import('../store/gameStore').CrewStats; label: string; color: string }[] = [
  { key: 'strength', label: 'Strength', color: '#f87171' },
  { key: 'perception', label: 'Perception', color: '#60a5fa' },
  { key: 'charisma', label: 'Charisma', color: '#fbbf24' },
  { key: 'luck', label: 'Luck', color: '#a78bfa' },
];

function AbilityBlock({ stats }: { stats: import('../store/gameStore').CrewStats }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
      {ABILITY_LABELS.map(({ key, label, color }) => (
        <div key={key} className="flex items-center gap-2">
          <span className="text-[11px] w-[76px] text-right" style={{ color: CLR.dim, fontFamily: SANS, fontWeight: 500 }}>
            {label}
          </span>
          <div className="flex-1 h-[5px] rounded-full overflow-hidden" style={{ backgroundColor: CLR.rule + '40' }}>
            <div
              className="h-full rounded-full"
              style={{ width: `${(stats[key] / 20) * 100}%`, backgroundColor: color, opacity: 0.8 }}
            />
          </div>
          <span className="text-[12px] tabular-nums w-[20px]" style={{ color, fontFamily: MONO, fontWeight: 600 }}>
            {stats[key]}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Temperament (humours) display ────────────────────────────────────────

const HUMOUR_INFO: Record<keyof Humours, { label: string; color: string; description: string }> = {
  sanguine:    { label: 'Sanguine',    color: '#f59e0b', description: 'warm-blooded, sociable, optimistic' },
  choleric:    { label: 'Choleric',    color: '#ef4444', description: 'hot-tempered, ambitious, decisive' },
  melancholic: { label: 'Melancholic', color: '#6366f1', description: 'thoughtful, perceptive, cautious' },
  phlegmatic:  { label: 'Phlegmatic',  color: '#22d3ee', description: 'steady, loyal, patient' },
  curiosity:   { label: 'Curious',     color: '#a3e635', description: 'open-minded, adaptable, inquisitive' },
};

const DEFAULT_HUMOURS: Humours = { sanguine: 5, choleric: 5, melancholic: 5, phlegmatic: 5, curiosity: 5 };

function TemperamentBlock({ humours }: { humours?: Humours }) {
  const h = humours ?? DEFAULT_HUMOURS;
  const entries = (Object.keys(HUMOUR_INFO) as (keyof Humours)[])
    .map(k => ({ key: k, value: h[k], ...HUMOUR_INFO[k] }))
    .sort((a, b) => b.value - a.value);
  const dominant = entries[0];
  const secondary = entries[1].value >= 6 ? entries[1] : null;

  const temperamentLabel = secondary
    ? `${dominant.label} & ${secondary.label}`
    : dominant.label;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] tracking-[0.15em] uppercase" style={{ color: CLR.dim, fontFamily: SANS, fontWeight: 500 }}>
          Temperament
        </span>
        <span className="text-[13px]" style={{ color: dominant.color, fontFamily: SERIF, fontWeight: 600 }}>
          {temperamentLabel}
        </span>
      </div>
      <p className="text-[12px] mb-3" style={{ color: CLR.txt, fontFamily: SANS }}>
        {secondary
          ? `${dominant.description} — with a ${secondary.description} streak`
          : dominant.description
        }
      </p>
      <div className="space-y-1.5">
        {entries.map(({ key, label, color, value }) => (
          <div key={key} className="flex items-center gap-2">
            <span className="text-[10px] w-[72px] text-right" style={{ color: CLR.dim, fontFamily: SANS }}>
              {label}
            </span>
            <div className="flex gap-[3px]">
              {Array.from({ length: 10 }, (_, i) => (
                <div
                  key={i}
                  className="w-[6px] h-[10px] rounded-sm"
                  style={{
                    backgroundColor: i < value ? color : CLR.rule + '30',
                    opacity: i < value ? 0.8 : 1,
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Shared: Event history log ────────────────────────────────────────────

function HistoryLog({ history, maxEntries = 5 }: { history: import('../store/gameStore').CrewHistoryEntry[]; maxEntries?: number }) {
  const recent = history.slice(-maxEntries).reverse();
  if (recent.length === 0) return null;

  return (
    <div>
      <span className="text-[10px] tracking-[0.15em] uppercase" style={{ color: CLR.dim, fontFamily: SANS, fontWeight: 500 }}>
        Recent Events
      </span>
      <div className="mt-1 space-y-0.5">
        {recent.map((entry, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="text-[9px] tabular-nums shrink-0 mt-[2px]" style={{ color: CLR.rule, fontFamily: MONO }}>
              d{entry.day}
            </span>
            <span className="text-[11px] leading-snug" style={{ color: CLR.txt, fontFamily: SANS }}>
              {entry.event}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Crew roster row (clickable, navigates to detail) ────────────────────

function CrewRosterRow({ member, index, dayCount, onClick, onRoleChange, delay }: {
  member: CrewMember; index: number; dayCount: number; onClick: () => void;
  onRoleChange: (role: CrewRole) => void; delay: number;
}) {
  const [roleOpen, setRoleOpen] = useState(false);
  const hs = HEALTH_STYLE[member.health] ?? HEALTH_STYLE.healthy;
  const roleColor = ROLE_COLOR[member.role] ?? CLR.txt;
  const qs = QUALITY_STYLE[member.quality];
  const moraleColor_ = member.morale > 60 ? CLR.green : member.morale > 30 ? CLR.yellow : CLR.red;
  const isCaptain = member.role === 'Captain';
  const daysServed = Math.max(1, dayCount - member.hireDay);
  const isOdd = index % 2 === 1;
  const stripeBg = isOdd && !isCaptain ? CLR.bright + '03' : 'transparent';

  return (
    <motion.div
      initial={{ opacity: 0, y: 3 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay }}
    >
      {/* Separator after captain */}
      {index === 1 && (
        <div className="mx-3 mb-1" style={{ borderTop: `1px solid ${CLR.rule}25` }} />
      )}
      <div
        className={`w-full rounded-lg transition-all duration-150 cursor-pointer group ${isCaptain ? 'px-3 pt-3 pb-2 mb-0.5' : 'px-3 py-2.5'}`}
        style={{
          backgroundColor: isCaptain ? CLR.gold + '0a' : stripeBg,
          border: `1px solid ${isCaptain ? CLR.gold + '22' : 'transparent'}`,
          boxShadow: isCaptain ? `0 2px 12px ${CLR.gold}08` : undefined,
        }}
        onMouseEnter={(e) => {
          sfxHover();
          e.currentTarget.style.backgroundColor = isCaptain ? CLR.gold + '16' : CLR.bright + '0c';
        }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = isCaptain ? CLR.gold + '0a' : stripeBg; }}
        onClick={onClick}
      >
        {/* Main row */}
        <div className="flex items-center gap-3">
          {/* Portrait */}
          <div
            className={`${isCaptain ? 'w-[88px] h-[88px]' : 'w-[64px] h-[64px]'} rounded-full shrink-0 overflow-hidden flex items-center justify-center transition-transform duration-200 ease-out group-hover:scale-[1.08]`}
            style={{
              border: `${isCaptain ? '3' : '2.5'}px solid ${isCaptain ? CLR.gold + '80' : roleColor + '50'}`,
              backgroundColor: (isCaptain ? CLR.gold : roleColor) + '0a',
              boxShadow: isCaptain
                ? `inset 0 2px 6px rgba(0,0,0,0.4), 0 0 16px ${CLR.gold}18`
                : member.quality === 'legendary' ? `0 0 10px ${CLR.purple}25`
                : member.quality === 'renowned'  ? `0 0 9px #22d3ee22`
                : member.quality === 'seasoned'  ? `0 0 8px ${CLR.teal}18`
                : member.quality === 'disaster'  ? `0 0 8px rgba(185,28,28,0.22), inset 0 2px 4px rgba(0,0,0,0.5)`
                : member.quality === 'dud'       ? `inset 0 2px 6px rgba(0,0,0,0.55)`
                : `inset 0 2px 4px rgba(0,0,0,0.35)`,
            }}
          >
            <CrewPortraitSquare member={member} size={isCaptain ? 88 : 64} />
          </div>

          {/* Name + flag + quality */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span
              className={`${isCaptain ? 'text-[17px]' : 'text-[15px]'} truncate`}
              style={{ color: isCaptain ? CLR.gold : CLR.bright, fontFamily: SANS, fontWeight: isCaptain ? 600 : 500 }}
            >
              {member.name}
            </span>
            <FactionFlag nationality={member.nationality} size={isCaptain ? 22 : 18} />
            {(
              <span
                className={`${isCaptain ? 'text-[9px]' : 'text-[8px]'} tracking-wider uppercase px-1.5 py-0.5 rounded shrink-0`}
                style={{ color: qs.color, backgroundColor: qs.bg, border: `1px solid ${qs.border}`, fontFamily: SANS, fontWeight: 600 }}
              >
                {qs.label}
              </span>
            )}
            {isCaptain && (
              <span className="text-[10px] tabular-nums shrink-0" style={{ color: CLR.dimGold, fontFamily: MONO }}>
                Lvl {member.level}
              </span>
            )}
          </div>

          {/* Role — clickable dropdown */}
          <div className="relative w-[78px] shrink-0">
            {isCaptain ? (
              <span className="text-[13px] tracking-wide" style={{ color: roleColor, fontFamily: SANS, fontWeight: 700 }}>
                Captain
              </span>
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); sfxClick(); setRoleOpen(!roleOpen); }}
                className="text-[12px] hover:underline underline-offset-2 transition-colors flex items-center gap-1"
                style={{ color: roleColor, fontFamily: SANS, fontWeight: 500 }}
              >
                {member.role}
                <span className="text-[8px] opacity-50">▾</span>
              </button>
            )}
            {/* Role dropdown */}
            <AnimatePresence>
              {roleOpen && !isCaptain && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className="absolute top-full left-0 mt-1 z-30 rounded-lg py-1 min-w-[100px]"
                  style={{ backgroundColor: '#141210', border: `1px solid ${CLR.rule}50`, boxShadow: '0 8px 24px rgba(0,0,0,0.6)' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {ASSIGNABLE_ROLES.map(role => {
                    const isActive = member.role === role;
                    const rc = ROLE_COLOR[role] ?? CLR.txt;
                    return (
                      <button
                        key={role}
                        onClick={(e) => { e.stopPropagation(); onRoleChange(role); setRoleOpen(false); }}
                        className="w-full text-left px-3 py-1.5 text-[11px] transition-colors hover:bg-white/[0.05]"
                        style={{ color: isActive ? rc : CLR.txt, fontFamily: SANS, fontWeight: isActive ? 600 : 400 }}
                      >
                        {isActive && <span className="mr-1">•</span>}{role}
                      </button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Skill mini bar */}
          <div className="hidden md:flex items-center gap-1.5 w-[72px] shrink-0">
            <div className="flex-1 h-[4px] rounded-full overflow-hidden" style={{ backgroundColor: CLR.rule + '40' }}>
              <div className="h-full rounded-full" style={{ width: `${member.skill}%`, backgroundColor: CLR.cyan }} />
            </div>
            <span className="text-[11px] tabular-nums w-[22px] text-right" style={{ color: CLR.txt, fontFamily: MONO }}>{member.skill}</span>
          </div>

          {/* Health */}
          <span
            className="text-[11px] w-[48px] text-right shrink-0"
            style={{ color: hs.color, fontFamily: SANS, fontWeight: 600 }}
          >
            {hs.label}
          </span>

          {/* Morale bar + value */}
          <div className="flex items-center gap-1.5 w-[52px] shrink-0 justify-end">
            <div className="w-[28px] h-[4px] rounded-full overflow-hidden" style={{ backgroundColor: CLR.rule + '40' }}>
              <div className="h-full rounded-full" style={{ width: `${member.morale}%`, backgroundColor: moraleColor_ }} />
            </div>
            <span className="text-[10px] tabular-nums" style={{ color: moraleColor_, fontFamily: MONO }}>{member.morale}</span>
          </div>

          {/* Days served */}
          <span
            className="hidden md:block text-[10px] tabular-nums w-[36px] text-right shrink-0"
            style={{ color: CLR.dim, fontFamily: MONO }}
          >
            {daysServed}
          </span>

          {/* Navigate chevron — slides on hover */}
          <span
            className="text-[11px] shrink-0 opacity-25 group-hover:opacity-70 group-hover:translate-x-0.5 transition-all duration-150"
            style={{ color: CLR.bright }}
          >
            ▸
          </span>
        </div>

        {/* Captain extras: traits + XP bar */}
        {isCaptain && (
          <div className="mt-2 ml-[100px] flex items-center gap-3 flex-wrap">
            {/* Traits */}
            {member.traits.map(t => (
              <span
                key={t}
                className="text-[9px] tracking-wide px-2 py-0.5 rounded"
                style={{ color: CLR.teal, backgroundColor: CLR.teal + '10', border: `1px solid ${CLR.teal}18`, fontFamily: SANS, fontWeight: 500 }}
              >
                {t}
              </span>
            ))}
            {member.abilities.map(a => (
              <span
                key={a}
                className="text-[9px] tracking-wide px-2 py-0.5 rounded"
                style={{ color: CLR.gold, backgroundColor: CLR.gold + '10', border: `1px solid ${CLR.gold}18`, fontFamily: SANS, fontWeight: 500 }}
              >
                {a}
              </span>
            ))}
            {/* XP bar */}
            <div className="flex items-center gap-1.5 ml-auto">
              <div className="w-[60px] h-[3px] rounded-full overflow-hidden" style={{ backgroundColor: CLR.rule + '40' }}>
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${Math.min(100, (member.xp / member.xpToNext) * 100)}%`,
                    backgroundColor: CLR.gold,
                    boxShadow: `0 0 4px ${CLR.gold}30`,
                  }}
                />
              </div>
              <span className="text-[9px] tabular-nums" style={{ color: CLR.dimGold, fontFamily: MONO }}>
                {member.xp}/{member.xpToNext}
              </span>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── Crew detail view (full-page character sheet) ────────────────────────

function CrewDetailView({ member, onBack, onRoleChange, onPrev, onNext }: {
  member: CrewMember;
  onBack: () => void;
  onRoleChange: (role: CrewRole) => void;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const [portraitModalOpen, setPortraitModalOpen] = useState(false);
  const [dialogue, setDialogue] = useState<string | null>(null);
  const [portraitEnlarged, setPortraitEnlarged] = useState(false);
  const sparkle = useSparkle();

  // Arrow key navigation between crew members
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' && onPrev) { e.preventDefault(); onPrev(); }
      if (e.key === 'ArrowDown' && onNext) { e.preventDefault(); onNext(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onPrev, onNext]);
  const qs = QUALITY_STYLE[member.quality];
  const roleColor = ROLE_COLOR[member.role] ?? CLR.txt;
  const moraleColor_ = member.morale > 60 ? CLR.green : member.morale > 30 ? CLR.yellow : CLR.red;
  const isCaptain = member.role === 'Captain';

  return (
    <motion.div
      key={`crew-detail-${member.id}`}
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -12 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col items-center w-full"
    >
      {/* Breadcrumb */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-xl px-2 md:px-4 mt-1"
      >
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => { sfxClick(); onBack(); }}
            className="text-[11px] tracking-[0.12em] uppercase hover:underline underline-offset-2 transition-colors"
            style={{ color: CLR.tabCrew, fontFamily: SANS, fontWeight: 500 }}
          >
            Crew
          </button>
          <span className="text-[11px]" style={{ color: CLR.dim }}>›</span>
          <span
            className="text-[11px] tracking-[0.08em]"
            style={{ color: CLR.bright, fontFamily: SANS, fontWeight: 500 }}
          >
            {member.name}
          </span>
        </div>
      </motion.div>

      {/* Portrait + Identity */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05 }}
        className="mt-5 w-full max-w-xl px-2 md:px-4 flex flex-col items-center"
      >
        {/* Role/Level/Traits — Portrait — (empty right for balance) */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 w-full">
          {/* Left column: Role + Level + Traits */}
          <div className="flex flex-col items-end gap-1.5">
            <span
              className="text-[10px] tracking-[0.18em] uppercase px-2 py-0.5 rounded"
              style={{
                color: roleColor,
                backgroundColor: roleColor + '15',
                border: `1px solid ${roleColor}30`,
                fontFamily: SANS,
                fontWeight: 600,
              }}
            >
              {member.role}
            </span>
            <span className="text-[11px] tabular-nums" style={{ color: isCaptain ? CLR.gold : CLR.bright, fontFamily: MONO, fontWeight: 600 }}>
              Lvl {member.level}
            </span>
            {member.quality !== 'passable' && (
              <span
                className="text-[9px] tracking-wider uppercase px-1.5 py-0.5 rounded"
                style={{ color: qs.color, backgroundColor: qs.bg, border: `1px solid ${qs.border}`, fontFamily: SANS, fontWeight: 600 }}
              >
                {qs.label}
              </span>
            )}
            {/* Traits & Abilities */}
            {member.traits.map(t => (
              <span
                key={t}
                className="text-[9px] tracking-wide px-2 py-0.5 rounded text-right"
                style={{ color: CLR.teal, backgroundColor: CLR.teal + '12', border: `1px solid ${CLR.teal}20`, fontFamily: SANS, fontWeight: 500 }}
              >
                {t}
              </span>
            ))}
            {member.abilities.map(a => (
              <span
                key={a}
                className="text-[9px] tracking-wide px-2 py-0.5 rounded text-right"
                style={{ color: CLR.gold, backgroundColor: CLR.gold + '12', border: `1px solid ${CLR.gold}20`, fontFamily: SANS, fontWeight: 500 }}
              >
                {a}
              </span>
            ))}
          </div>

          {/* Center column: Portrait — click to speak */}
          <div className="relative">
            <motion.div
              animate={{ scale: portraitEnlarged ? 1.12 : 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            >
              <div
                className="w-[128px] h-[128px] rounded-full overflow-hidden flex items-center justify-center cursor-pointer transition-all hover:scale-105 active:scale-95"
                style={{
                  border: `3px solid ${isCaptain ? CLR.gold : roleColor}60`,
                  backgroundColor: (isCaptain ? CLR.gold : roleColor) + '0c',
                  boxShadow: `inset 0 3px 8px rgba(0,0,0,0.5), 0 0 20px ${(isCaptain ? CLR.gold : roleColor)}15`,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  sfxClick();
                  const line = getCrewDialogue(member);
                  setDialogue(line);
                  setPortraitEnlarged(true);
                  setTimeout(() => setPortraitEnlarged(false), 600);
                }}
                title="Click to hear from this crew member"
              >
                <CrewPortraitSquare member={member} size={128} />
              </div>
            </motion.div>
            {/* Quality glow */}
            {member.quality === 'legendary' && (
              <span className="absolute -top-1 -right-1 text-[12px]" style={{ color: CLR.purple + '80' }}>
                {sparkle(0)}
              </span>
            )}
          </div>

          {/* Right column: Dialogue bubble (desktop) */}
          <div className="hidden md:block">
            <AnimatePresence mode="wait">
              {dialogue && (
                <motion.div
                  key="dialogue"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="w-[200px] z-10"
                >
                  <div
                    className="relative px-4 py-3 rounded-lg"
                    style={{
                      backgroundColor: CLR.bg + 'f0',
                      border: `1px solid ${roleColor}40`,
                      boxShadow: `0 4px 16px rgba(0,0,0,0.4), 0 0 8px ${roleColor}15`,
                    }}
                  >
                    {/* Speech triangle pointing left */}
                    <div
                      className="absolute top-1/2 -left-[6px] -translate-y-1/2 w-0 h-0"
                      style={{
                        borderTop: '6px solid transparent',
                        borderBottom: '6px solid transparent',
                        borderRight: `6px solid ${roleColor}40`,
                      }}
                    />
                    <p
                      className="text-[15px] leading-relaxed"
                      style={{ color: CLR.bright, fontFamily: SERIF, fontStyle: 'italic' }}
                    >
                      &ldquo;{dialogue}&rdquo;
                    </p>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDialogue(null); }}
                      className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] hover:opacity-80"
                      style={{ backgroundColor: CLR.bg, color: CLR.dim, border: `1px solid ${CLR.rule}` }}
                    >
                      ×
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Dialogue bubble — mobile only (below portrait) */}
        <div className="md:hidden w-full">
          <AnimatePresence mode="wait">
            {dialogue && (
              <motion.div
                key="dialogue-mobile"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="mt-3 w-full max-w-sm mx-auto z-10"
              >
                <div
                  className="relative px-4 py-3 rounded-lg"
                  style={{
                    backgroundColor: CLR.bg + 'f0',
                    border: `1px solid ${roleColor}40`,
                    boxShadow: `0 4px 16px rgba(0,0,0,0.4), 0 0 8px ${roleColor}15`,
                  }}
                >
                  {/* Speech triangle pointing up */}
                  <div
                    className="absolute -top-[6px] left-1/2 -translate-x-1/2 w-0 h-0"
                    style={{
                      borderLeft: '6px solid transparent',
                      borderRight: '6px solid transparent',
                      borderBottom: `6px solid ${roleColor}40`,
                    }}
                  />
                  <p
                    className="text-[15px] leading-relaxed text-center"
                    style={{ color: CLR.bright, fontFamily: SERIF, fontStyle: 'italic' }}
                  >
                    &ldquo;{dialogue}&rdquo;
                  </p>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDialogue(null); }}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] hover:opacity-80"
                    style={{ backgroundColor: CLR.bg, color: CLR.dim, border: `1px solid ${CLR.rule}` }}
                  >
                    ×
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Name + flag — clicking name opens portrait modal */}
        <div className="flex items-center gap-2.5 mt-4 flex-wrap justify-center">
          <h2
            className="text-[26px] md:text-[28px] cursor-pointer hover:underline underline-offset-4 decoration-1 transition-colors"
            style={{ color: isCaptain ? CLR.gold : CLR.bright, fontFamily: SANS, fontWeight: 600, textDecorationColor: (isCaptain ? CLR.gold : CLR.bright) + '40' }}
            onClick={() => setPortraitModalOpen(true)}
            title="View full portrait"
          >
            {member.name}
          </h2>
          <FactionFlag nationality={member.nationality} size={20} />
        </div>

        {/* Bio line */}
        <p className="text-[15px] mt-2" style={{ color: CLR.dim, fontFamily: SANS }}>
          {member.nationality} &middot; Age {member.age} &middot; {member.birthplace}
        </p>
      </motion.div>

      {/* Backstory */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.12 }}
        className="mt-4 w-full max-w-xl px-4 md:px-6"
      >
        <p
          className="text-[17px] leading-relaxed text-center"
          style={{ color: CLR.txt, fontFamily: SERIF, fontStyle: 'italic' }}
        >
          &ldquo;{member.backstory}&rdquo;
        </p>
      </motion.div>

      {/* Divider */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2, delay: 0.18 }}
        className="mt-4 w-full max-w-xl"
      >
        <WaveDivider width={48} />
      </motion.div>

      {/* (Traits & Abilities now shown in left column beside portrait) */}

      {/* Stats section */}
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.22 }}
        className="mt-4 w-full max-w-xl px-2 md:px-4"
      >
        {/* Experience + Morale row */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div
            className="p-3 rounded-lg"
            style={{ backgroundColor: CLR.rule + '12', border: `1px solid ${CLR.rule}20` }}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] tracking-[0.15em] uppercase" style={{ color: CLR.dim, fontFamily: SANS, fontWeight: 500 }}>
                Experience
              </span>
              <span className="text-[12px] tabular-nums" style={{ color: CLR.gold, fontFamily: MONO }}>
                {member.xp}/{member.xpToNext} XP
              </span>
            </div>
            <div className="h-[5px] rounded-full overflow-hidden" style={{ backgroundColor: CLR.rule + '40' }}>
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${Math.min(100, (member.xp / member.xpToNext) * 100)}%`,
                  backgroundColor: CLR.gold,
                  boxShadow: `0 0 6px ${CLR.gold}30`,
                }}
              />
            </div>
          </div>
          <div
            className="p-3 rounded-lg"
            style={{ backgroundColor: CLR.rule + '12', border: `1px solid ${CLR.rule}20` }}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] tracking-[0.15em] uppercase" style={{ color: CLR.dim, fontFamily: SANS, fontWeight: 500 }}>
                Morale
              </span>
              <span className="text-[14px] tabular-nums" style={{ color: moraleColor_, fontFamily: MONO, fontWeight: 600 }}>{member.morale}%</span>
            </div>
            <div className="h-[5px] rounded-full overflow-hidden" style={{ backgroundColor: CLR.rule + '40' }}>
              <div className="h-full rounded-full" style={{ width: `${member.morale}%`, backgroundColor: moraleColor_ }} />
            </div>
          </div>
        </div>

        {/* Temperament (humours) */}
        <div
          className="p-3 rounded-lg mb-4"
          style={{ backgroundColor: CLR.rule + '12', border: `1px solid ${CLR.rule}20` }}
        >
          <TemperamentBlock humours={member.humours} />
        </div>

        {/* Abilities */}
        <div
          className="p-3 rounded-lg"
          style={{ backgroundColor: CLR.rule + '12', border: `1px solid ${CLR.rule}20` }}
        >
          <span className="text-[10px] tracking-[0.15em] uppercase block mb-2" style={{ color: CLR.dim, fontFamily: SANS, fontWeight: 500 }}>
            Abilities
          </span>
          <AbilityBlock stats={member.stats} />
        </div>
      </motion.div>

      {/* Divider */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2, delay: 0.28 }}
        className="mt-4 w-full max-w-xl"
      >
        <WaveDivider width={48} />
      </motion.div>

      {/* History log */}
      {member.history.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25, delay: 0.3 }}
          className="mt-3 w-full max-w-xl px-2 md:px-4"
        >
          <HistoryLog history={member.history} maxEntries={10} />
        </motion.div>
      )}

      {/* Role assignment */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25, delay: 0.35 }}
        className="mt-4 w-full max-w-xl px-2 md:px-4 mb-4"
      >
        <div
          className="p-3 rounded-lg"
          style={{ backgroundColor: CLR.rule + '12', border: `1px solid ${CLR.rule}20` }}
        >
          {isCaptain ? (
            <p className="text-[11px]" style={{ color: CLR.dim, fontFamily: SANS, fontStyle: 'italic' }}>
              The captain commands the vessel. To change captains, select another crew member and promote them.
            </p>
          ) : (
            <>
              <span className="text-[10px] tracking-[0.15em] uppercase block mb-2" style={{ color: CLR.dim, fontFamily: SANS, fontWeight: 500 }}>
                Assign Role
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {ASSIGNABLE_ROLES.map(role => {
                  const isActive = member.role === role;
                  const rc = ROLE_COLOR[role] ?? CLR.txt;
                  return (
                    <button
                      key={role}
                      onClick={() => { sfxClick(); onRoleChange(role); }}
                      className="text-[11px] tracking-wide px-2.5 py-1 rounded transition-all"
                      style={{
                        color: isActive ? rc : CLR.dim,
                        backgroundColor: isActive ? rc + '15' : 'transparent',
                        border: `1px solid ${isActive ? rc + '40' : CLR.rule + '30'}`,
                        fontFamily: SANS,
                        fontWeight: isActive ? 600 : 400,
                      }}
                    >
                      {role}
                    </button>
                  );
                })}
              </div>

              {/* Promote to Captain */}
              <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${CLR.rule}25` }}>
                <button
                  onClick={() => { sfxClick(); onRoleChange('Captain' as CrewRole); }}
                  className="text-[11px] tracking-[0.12em] uppercase px-3 py-1.5 rounded transition-all hover:bg-amber-500/10"
                  style={{
                    color: CLR.gold,
                    border: `1px solid ${CLR.gold}30`,
                    fontFamily: SANS,
                    fontWeight: 600,
                  }}
                >
                  Promote to Captain
                </button>
                <p className="text-[10px] mt-1.5" style={{ color: CLR.dim, fontFamily: SANS }}>
                  The current captain will be demoted to Sailor.
                </p>
              </div>
            </>
          )}
        </div>
      </motion.div>

      {/* Portrait modal */}
      <PortraitModal member={member} open={portraitModalOpen} onClose={() => setPortraitModalOpen(false)} />
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SHIP TAB
// ═══════════════════════════════════════════════════════════════════════════

const SHIP_DESCRIPTIONS: Record<string, { tagline: string; description: string }> = {
  Carrack: {
    tagline: 'Three-masted ocean trader',
    description: 'The workhorse of the Indian Ocean trade. Sturdy hull, generous cargo space, and enough deck room for a handful of guns. Slow to turn but reliable in heavy seas.',
  },
  Galleon: {
    tagline: 'Heavy armed merchantman',
    description: 'The largest vessel on these waters. Built for war and treasure hauling, with high castles fore and aft. Devastating broadside but sluggish in shallow waters.',
  },
  Dhow: {
    tagline: 'Lateen-rigged coastal trader',
    description: 'Fast and nimble, with a shallow draft perfect for navigating reefs and coastal shallows. The traditional vessel of Arab and Swahili mariners, rigged to ride the monsoon winds.',
  },
  Junk: {
    tagline: 'Battened-sail cargo vessel',
    description: 'Sturdy watertight compartments and distinctive batten sails make the junk an excellent cargo hauler. Chinese shipbuilding at its finest — reliable, capacious, and surprisingly tough.',
  },
  Pinnace: {
    tagline: 'Swift scout vessel',
    description: 'Small, fast, and maneuverable. Ideal for scouting, coastal trading, and quick getaways. Light armament and limited cargo, but nothing on the water can catch her.',
  },
};

// ── Large ship schematics ────────────────────────────────────────────────

function LargeShipSchematic({ shipType, hullPct, armament }: {
  shipType: string; hullPct: number; armament: string[];
}) {
  const s = CLR.sail;
  const m = CLR.mast;
  const w = CLR.water;
  const wl = CLR.waterLight;

  // Hull color based on damage
  const hc = hullPct > 60 ? CLR.hull : hullPct > 30 ? '#b8860b' : '#8b3a3a';
  // Bow/mid/stern derived from single hull value with slight variation
  const bowPct = Math.min(100, Math.max(0, hullPct + (hullPct > 50 ? -8 : -15)));
  const midPct = Math.min(100, hullPct);
  const sternPct = Math.min(100, Math.max(0, hullPct + (hullPct > 50 ? 5 : -5)));
  const bowC = bowPct > 60 ? CLR.green : bowPct > 30 ? CLR.yellow : CLR.red;
  const midC = midPct > 60 ? CLR.green : midPct > 30 ? CLR.yellow : CLR.red;
  const sternC = sternPct > 60 ? CLR.green : sternPct > 30 ? CLR.yellow : CLR.red;

  // Weapon mount marker
  const hasSwivel = armament.includes('swivelGun');
  const broadsideCount = armament.filter(w => w !== 'swivelGun').length;
  const portMark = (i: number) => i < broadsideCount ? '\u2295' : '\u00b7';

  const schematics: Record<string, React.ReactNode> = {
    Carrack: (
      <>
        <C c={m}>{'                |    |    |'}</C>{'\n'}
        <C c={s}>{'               )_)  )_)  )_)'}</C>{'\n'}
        <C c={s}>{'              )___))___))___)\\'}</C>{'\n'}
        <C c={s}>{'             )____)____)_____)\\\\' }</C>{'\n'}
        <C c={hc}>{'          ╔═══════════════════════╗'}</C>{'\n'}
        <C c={hc}>{'          ║'}</C><C c={bowC}>{hasSwivel ? ' \u2295' : '  '}</C><C c={hc}>{'     '}</C><C c={midC}>{portMark(0)}{' '}{portMark(1)}</C><C c={hc}>{'     '}</C><C c={sternC}>{portMark(2)}</C><C c={hc}>{'       ║'}</C>{'\n'}
        <C c={hc}>{'          ║'}</C><C c={bowC}>{'  '}</C><C c={hc}>{'     '}</C><C c={midC}>{portMark(3)}{' '}{portMark(4)}</C><C c={hc}>{'     '}</C><C c={sternC}>{portMark(5)}</C><C c={hc}>{'       ║'}</C>{'\n'}
        <C c={hc}>{'          ╚═══════════════════════╝'}</C>{'\n'}
        <C c={w}>{'        ≈≈≈≈'}</C><C c={wl}>{'≈≈≈≈≈≈≈≈≈≈≈≈'}</C><C c={w}>{'≈≈≈≈≈≈≈≈≈'}</C>{'\n'}
        <C c={wl}>{'         ∼∼∼   ∼∼∼'}</C><C c={w}>{'   ∼∼∼   ∼∼∼   ∼∼∼'}</C>
      </>
    ),
    Galleon: (
      <>
        <C c={m}>{'             |    |    |    |'}</C>{'\n'}
        <C c={s}>{'            )_)  )_)  )_)  )_)'}</C>{'\n'}
        <C c={s}>{'           )___))___))___))___)\\'}</C>{'\n'}
        <C c={s}>{'          )____)____)____)_____)\\\\' }</C>{'\n'}
        <C c={hc}>{'       ╔══════════════════════════════╗'}</C>{'\n'}
        <C c={hc}>{'       ║'}</C><C c={bowC}>{hasSwivel ? ' \u2295' : '  '}</C><C c={hc}>{'    '}</C><C c={midC}>{portMark(0)}{' '}{portMark(1)}{' '}{portMark(2)}</C><C c={hc}>{'    '}</C><C c={sternC}>{portMark(3)}{' '}{portMark(4)}</C><C c={hc}>{'       ║'}</C>{'\n'}
        <C c={hc}>{'       ║'}</C><C c={bowC}>{'  '}</C><C c={hc}>{'    '}</C><C c={midC}>{portMark(5)}{' '}{portMark(6)}{' '}{portMark(7)}</C><C c={hc}>{'    '}</C><C c={sternC}>{portMark(8)}{' '}{portMark(9)}</C><C c={hc}>{'       ║'}</C>{'\n'}
        <C c={hc}>{'       ╚══════════════════════════════╝'}</C>{'\n'}
        <C c={w}>{'     ≈≈≈≈≈'}</C><C c={wl}>{'≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈'}</C><C c={w}>{'≈≈≈≈≈≈≈≈≈≈≈'}</C>{'\n'}
        <C c={wl}>{'      ∼∼∼   ∼∼∼   ∼∼∼'}</C><C c={w}>{'   ∼∼∼   ∼∼∼   ∼∼∼'}</C>
      </>
    ),
    Dhow: (
      <>
        <C c={m}>{'                  |'}</C>{'\n'}
        <C c={s}>{'                 /|'}</C>{'\n'}
        <C c={s}>{'                / |'}</C>{'\n'}
        <C c={s}>{'               /  |'}</C>{'\n'}
        <C c={s}>{'              /   |'}</C>{'\n'}
        <C c={hc}>{'          ╔═══════════════╗'}</C>{'\n'}
        <C c={hc}>{'          ║'}</C><C c={bowC}>{hasSwivel ? ' \u2295' : '  '}</C><C c={hc}>{'    '}</C><C c={midC}>{portMark(0)}</C><C c={hc}>{'    '}</C><C c={sternC}>{portMark(1)}</C><C c={hc}>{'   ║'}</C>{'\n'}
        <C c={hc}>{'          ╚═══════════════╝'}</C>{'\n'}
        <C c={w}>{'        ≈≈≈≈'}</C><C c={wl}>{'≈≈≈≈≈≈≈≈'}</C><C c={w}>{'≈≈≈≈≈≈≈'}</C>{'\n'}
        <C c={wl}>{'          ∼∼∼   ∼∼∼'}</C><C c={w}>{'   ∼∼∼'}</C>
      </>
    ),
    Junk: (
      <>
        <C c={m}>{'              |     |'}</C>{'\n'}
        <C c={s}>{'             ┤│    ┤│'}</C>{'\n'}
        <C c={s}>{'             ┤│    ┤│'}</C>{'\n'}
        <C c={s}>{'             ┤│    ┤│'}</C>{'\n'}
        <C c={hc}>{'          ╔════════════════════╗'}</C>{'\n'}
        <C c={hc}>{'          ║'}</C><C c={bowC}>{hasSwivel ? ' \u2295' : '  '}</C><C c={hc}>{'    '}</C><C c={midC}>{portMark(0)}{' '}{portMark(1)}</C><C c={hc}>{'    '}</C><C c={sternC}>{portMark(2)}</C><C c={hc}>{'    ║'}</C>{'\n'}
        <C c={hc}>{'          ║'}</C><C c={bowC}>{'  '}</C><C c={hc}>{'    '}</C><C c={midC}>{portMark(3)}{' '}{portMark(4)}</C><C c={hc}>{'    '}</C><C c={sternC}>{portMark(5)}</C><C c={hc}>{'    ║'}</C>{'\n'}
        <C c={hc}>{'          ╚════════════════════╝'}</C>{'\n'}
        <C c={w}>{'        ≈≈≈≈'}</C><C c={wl}>{'≈≈≈≈≈≈≈≈≈≈'}</C><C c={w}>{'≈≈≈≈≈≈≈≈'}</C>{'\n'}
        <C c={wl}>{'          ∼∼∼   ∼∼∼'}</C><C c={w}>{'   ∼∼∼   ∼∼'}</C>
      </>
    ),
    Pinnace: (
      <>
        <C c={m}>{'                 |'}</C>{'\n'}
        <C c={s}>{'                )|'}</C>{'\n'}
        <C c={s}>{'               )_)'}</C>{'\n'}
        <C c={s}>{'              )__)'}</C>{'\n'}
        <C c={hc}>{'          ╔══════════════╗'}</C>{'\n'}
        <C c={hc}>{'          ║'}</C><C c={bowC}>{hasSwivel ? ' \u2295' : '  '}</C><C c={hc}>{'   '}</C><C c={midC}>{portMark(0)}</C><C c={hc}>{'   '}</C><C c={sternC}>{portMark(1)}</C><C c={hc}>{'   ║'}</C>{'\n'}
        <C c={hc}>{'          ╚══════════════╝'}</C>{'\n'}
        <C c={w}>{'        ≈≈≈≈'}</C><C c={wl}>{'≈≈≈≈≈≈≈'}</C><C c={w}>{'≈≈≈≈≈≈'}</C>{'\n'}
        <C c={wl}>{'         ∼∼∼   ∼∼∼'}</C><C c={w}>{'   ∼∼∼'}</C>
      </>
    ),
  };

  return (
    <pre className="text-[11px] leading-[1.4] whitespace-pre text-center select-none" style={{ fontFamily: MONO }}>
      {schematics[shipType] ?? schematics.Carrack}
    </pre>
  );
}

// ── Condition stripe ─────────────────────────────────────────────────────

function ConditionStripe({ hullPct, sailsPct, avgMorale, crewHealthPct }: {
  hullPct: number; sailsPct: number; avgMorale: number; crewHealthPct: number;
}) {
  // Weighted composite: hull matters most, then morale, sails, crew health
  const composite = hullPct * 0.4 + avgMorale * 0.25 + sailsPct * 0.2 + crewHealthPct * 0.15;
  const tiers = [
    { label: 'GOOD', min: 70, color: CLR.green },
    { label: 'FAIR', min: 40, color: CLR.yellow },
    { label: 'POOR', min: 20, color: CLR.orange },
    { label: 'CRITICAL', min: 0, color: CLR.red },
  ];
  const active = tiers.find(t => composite >= t.min) ?? tiers[tiers.length - 1];

  return (
    <div
      className="flex items-center justify-center gap-1 py-2 px-4 rounded-lg"
      style={{ backgroundColor: active.color + '0a', border: `1px solid ${active.color}25` }}
    >
      {tiers.map(t => {
        const isActive = t.label === active.label;
        return (
          <div key={t.label} className="flex items-center gap-1.5 px-2">
            <span
              className="w-[10px] h-[10px] rounded-sm transition-all duration-500"
              style={{
                backgroundColor: isActive ? t.color : CLR.rule + '40',
                boxShadow: isActive ? `0 0 8px ${t.color}40` : 'none',
              }}
            />
            <span
              className="text-[10px] tracking-[0.15em] uppercase transition-colors duration-300"
              style={{
                color: isActive ? t.color : CLR.rule,
                fontFamily: SANS,
                fontWeight: isActive ? 700 : 400,
              }}
            >
              {t.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Ship tab main ────────────────────────────────────────────────────────

function ShipTab() {
  const ship = useGameStore(s => s.ship);
  const stats = useGameStore(s => s.stats);
  const crew = useGameStore(s => s.crew);
  const cargo = useGameStore(s => s.cargo);
  const provisions = useGameStore(s => s.provisions);
  const windSpeed = useGameStore(s => s.windSpeed);
  const sparkle = useSparkle();

  const hullPct = Math.round((stats.hull / stats.maxHull) * 100);
  const sailsPct = Math.round((stats.sails / stats.maxSails) * 100);
  const avgMorale = Math.round(crew.reduce((a, c) => a + c.morale, 0) / (crew.length || 1));
  const healthyCrew = crew.filter(c => c.health === 'healthy').length;
  const crewHealthPct = Math.round((healthyCrew / (crew.length || 1)) * 100);
  const shipDesc = SHIP_DESCRIPTIONS[ship.type] ?? SHIP_DESCRIPTIONS.Carrack;

  const cargoUsed = Object.entries(cargo).reduce(
    (sum, [c, qty]) => sum + qty * (COMMODITY_DEFS[c as Commodity]?.weight ?? 1), 0
  );
  // Rough estimate: a crew berth for each hired crew member plus a few spares.
  const berthsMax = Math.max(crew.length + 2, 6);
  // Powder fill scales with how armed the ship is.
  const powderPct = stats.cannons > 0 ? 0.7 : stats.armament.length > 1 ? 0.4 : 0.15;

  // Weapon summary
  const weaponCounts: Record<string, { count: number; weapon: typeof WEAPON_DEFS[keyof typeof WEAPON_DEFS] }> = {};
  stats.armament.forEach(w => {
    const def = WEAPON_DEFS[w];
    if (!weaponCounts[def.name]) weaponCounts[def.name] = { count: 0, weapon: def };
    weaponCounts[def.name].count++;
  });

  // Damage segments
  const bowPct = Math.min(100, Math.max(0, hullPct + (hullPct > 50 ? -8 : -15)));
  const midPct = Math.min(100, hullPct);
  const sternPct = Math.min(100, Math.max(0, hullPct + (hullPct > 50 ? 5 : -5)));

  return (
    <motion.div
      key="ship"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center w-full"
    >
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05 }}
        className="text-center mt-1"
      >
        <div className="flex items-center justify-center gap-3">
          <FactionFlag nationality={ship.flag as Nationality} size={22} />
          <h2
            className="text-[20px] md:text-[22px] tracking-[0.2em] uppercase"
            style={{ color: CLR.tabShip, fontFamily: MONO }}
          >
            {ship.name}
          </h2>
        </div>
        <p className="text-[13px] mt-1" style={{ color: CLR.txt, fontFamily: SERIF, fontStyle: 'italic' }}>
          {shipDesc.tagline}
        </p>
      </motion.div>

      {/* Large schematic — procedural renderer with exterior / cutaway toggle */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.12 }}
        className="mt-4 w-full flex justify-center"
      >
        <div className="w-full max-w-4xl px-2">
          <ShipView
            shipType={ship.type}
            hull={stats.hull}
            maxHull={stats.maxHull}
            sails={stats.sails}
            maxSails={stats.maxSails}
            wind={Math.max(0.2, Math.min(1, windSpeed))}
            flagColor={pickFlagColor(ship.flag as Nationality)}
            cargoUsed={cargoUsed}
            cargoMax={stats.cargoCapacity}
            crewCount={crew.length}
            berthsMax={berthsMax}
            powderPct={powderPct}
            provisions={provisions}
            provisionsMax={60}
            size="large"
            showToggle
          />
        </div>
      </motion.div>

      {/* Damage segments */}
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.22 }}
        className="mt-3 flex items-center gap-3 md:gap-5"
      >
        <DamageSegment label="Bow" pct={bowPct} />
        <DamageSegment label="Midship" pct={midPct} />
        <DamageSegment label="Stern" pct={sternPct} />
      </motion.div>

      {/* Condition stripe */}
      <motion.div
        initial={{ opacity: 0, scaleX: 0.8 }}
        animate={{ opacity: 1, scaleX: 1 }}
        transition={{ duration: 0.35, delay: 0.28 }}
        className="mt-3 w-full max-w-lg px-2 md:px-4"
      >
        <ConditionStripe hullPct={hullPct} sailsPct={sailsPct} avgMorale={avgMorale} crewHealthPct={crewHealthPct} />
      </motion.div>

      {/* Wave divider */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.32 }}
        className="mt-4 w-full max-w-lg"
      >
        <WaveDivider width={52} />
      </motion.div>

      {/* Stats + Armament in two columns on desktop */}
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.36 }}
        className="mt-4 w-full max-w-xl px-2 md:px-4"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Ship stats */}
          <div
            className="p-3 rounded-lg"
            style={{ backgroundColor: CLR.tabShip + '06', border: `1px solid ${CLR.tabShip}20` }}
          >
            <h3 className="text-[10px] tracking-[0.18em] uppercase mb-2" style={{ color: CLR.dimGold, fontFamily: SANS, fontWeight: 600 }}>
              Condition
            </h3>
            <div className="space-y-2.5">
              <ShipStatRow label="Hull" value={`${stats.hull}/${stats.maxHull}`} pct={hullPct} color={hullColor(hullPct)} />
              <ShipStatRow label="Sails" value={`${stats.sails}/${stats.maxSails}`} pct={sailsPct} color={sailsPct > 50 ? CLR.txt : CLR.yellow} />
              <ShipStatRow label="Speed" value={`${stats.speed} kn`} pct={stats.speed / 25 * 100} color={CLR.cyan} />
              <ShipStatRow label="Turn" value={`${stats.turnSpeed}`} pct={stats.turnSpeed / 3 * 100} color={CLR.cyan} />
              <ShipStatRow label="Cargo" value={`${stats.cargoCapacity} units`} pct={stats.cargoCapacity / 150 * 100} color={CLR.teal} />
            </div>
          </div>

          {/* Armament */}
          <div
            className="p-3 rounded-lg"
            style={{ backgroundColor: CLR.red + '05', border: `1px solid ${CLR.red}15` }}
          >
            <h3 className="text-[10px] tracking-[0.18em] uppercase mb-2" style={{ color: CLR.dimGold, fontFamily: SANS, fontWeight: 600 }}>
              Armament
            </h3>
            {Object.entries(weaponCounts).length > 0 ? (
              <div className="space-y-2">
                {Object.entries(weaponCounts).map(([name, { count, weapon }]) => (
                  <div key={name}>
                    <div className="flex items-center justify-between">
                      <span className="text-[13px]" style={{ color: CLR.bright, fontFamily: SANS }}>
                        {count > 1 && <span style={{ color: CLR.dim }}>{count}\u00d7 </span>}
                        {name}
                      </span>
                      <span className="text-[9px] uppercase tracking-wider" style={{ color: weapon.aimable ? CLR.teal : CLR.dim, fontFamily: SANS }}>
                        {weapon.aimable ? 'Aimable' : 'Broadside'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[10px]" style={{ color: CLR.red, fontFamily: MONO }}>
                        DMG {weapon.damage}
                      </span>
                      <span className="text-[10px]" style={{ color: CLR.cyan, fontFamily: MONO }}>
                        RNG {weapon.range}
                      </span>
                      <span className="text-[10px]" style={{ color: CLR.dim, fontFamily: MONO }}>
                        RLD {weapon.reloadTime}s
                      </span>
                    </div>
                  </div>
                ))}
                {stats.cannons > 0 && (
                  <p className="text-[10px] mt-1" style={{ color: CLR.dim, fontFamily: SANS }}>
                    {stats.cannons} broadside gun{stats.cannons > 1 ? 's' : ''} mounted
                  </p>
                )}
              </div>
            ) : (
              <p className="text-[12px]" style={{ color: CLR.dim, fontFamily: SERIF, fontStyle: 'italic' }}>
                No weapons mounted. Visit a port shipyard.
              </p>
            )}
          </div>
        </div>
      </motion.div>

      {/* Ship description */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.42 }}
        className="mt-4 w-full max-w-xl px-2 md:px-4"
      >
        <div className="flex items-center gap-3 mb-2">
          <pre className="text-[11px] whitespace-pre select-none" style={{ fontFamily: MONO }}>
            <C c={CLR.rule}>{'\u2500'.repeat(4)}</C>
            <C c={CLR.dimGold}>{` ${sparkle(0)} `}</C>
            <C c={CLR.rule}>{'\u2500'.repeat(4)}</C>
          </pre>
          <span className="text-[10px] tracking-[0.18em] uppercase shrink-0" style={{ color: CLR.dimGold, fontFamily: SANS, fontWeight: 600 }}>
            About the {ship.type}
          </span>
          <div className="flex-1 h-[1px]" style={{ background: `linear-gradient(90deg, ${CLR.rule}60, transparent)` }} />
        </div>
        <p className="text-[12px] leading-relaxed" style={{ color: CLR.txt, fontFamily: SERIF, fontStyle: 'italic' }}>
          {shipDesc.description}
        </p>
      </motion.div>

      <div className="h-4" />
    </motion.div>
  );
}

function DamageSegment({ label, pct }: { label: string; pct: number }) {
  const color = pct > 60 ? CLR.green : pct > 30 ? CLR.yellow : CLR.red;
  return (
    <div className="flex flex-col items-center">
      <span className="text-[9px] tracking-[0.15em] uppercase mb-1" style={{ color: CLR.dim, fontFamily: SANS, fontWeight: 500 }}>
        {label}
      </span>
      <div className="w-[60px] md:w-[72px] h-[8px] rounded-full overflow-hidden" style={{ backgroundColor: CLR.rule + '40' }}>
        <motion.div
          className="h-full rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, delay: 0.3 }}
          style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}30` }}
        />
      </div>
      <span className="text-[11px] tabular-nums mt-0.5" style={{ color, fontFamily: MONO }}>{pct}%</span>
    </div>
  );
}

function ShipStatRow({ label, value, pct, color }: { label: string; value: string; pct: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] tracking-[0.12em] uppercase w-[40px] shrink-0" style={{ color: CLR.dim, fontFamily: SANS, fontWeight: 500 }}>
        {label}
      </span>
      <div className="flex-1 h-[5px] rounded-full overflow-hidden" style={{ backgroundColor: CLR.rule + '40' }}>
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, backgroundColor: color }} />
      </div>
      <span className="text-[11px] tabular-nums w-[56px] text-right shrink-0" style={{ color: CLR.bright, fontFamily: MONO }}>
        {value}
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CARGO TAB
// ═══════════════════════════════════════════════════════════════════════════

import { ALL_COMMODITIES_FULL, ALL_COMMODITIES, COMMODITY_DEFS, TIER_LABELS, type Commodity, type CommodityTier } from '../utils/commodities';
import { COMMODITY_HISTORICAL_NOTES } from '../utils/commodityHistoricalNotes';

// Derive colors and icons from the central commodity definitions
const COMMODITY_COLORS: Record<string, string> = Object.fromEntries(
  ALL_COMMODITIES_FULL.map(c => [c, COMMODITY_DEFS[c].color])
);
const COMMODITY_ICONS: Record<string, string> = Object.fromEntries(
  ALL_COMMODITIES_FULL.map(c => [c, COMMODITY_DEFS[c].icon])
);

function CargoTab({ initialCommodity }: { initialCommodity?: string }) {
  const [selectedCommodity, setSelectedCommodity] = useState<Commodity | null>(
    (initialCommodity && ALL_COMMODITIES.includes(initialCommodity as Commodity)) ? (initialCommodity as Commodity) : null
  );
  const cargo = useGameStore(s => s.cargo);
  const ports = useGameStore(s => s.ports);
  const activePort = useGameStore(s => s.activePort);
  const playerPos = useGameStore(s => s.playerPos);
  const stats = useGameStore(s => s.stats);

  const nearPort = activePort ?? ports.reduce<typeof ports[0] | null>((best, p) => {
    const dx = playerPos[0] - p.position[0];
    const dz = playerPos[2] - p.position[2];
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 80 && (!best || dist < Math.sqrt((playerPos[0] - best.position[0]) ** 2 + (playerPos[2] - best.position[2]) ** 2))) return p;
    return best;
  }, null);

  // Build list of held commodities for prev/next navigation
  const heldCommodities = ALL_COMMODITIES.filter(c => (cargo[c as keyof typeof cargo] ?? 0) > 0);

  if (selectedCommodity) {
    const currentIndex = heldCommodities.indexOf(selectedCommodity);
    return (
      <CargoDetailView
        commodity={selectedCommodity}
        onBack={() => setSelectedCommodity(null)}
        onPrev={currentIndex > 0 ? () => { sfxClick(); setSelectedCommodity(heldCommodities[currentIndex - 1]); } : undefined}
        onNext={currentIndex < heldCommodities.length - 1 ? () => { sfxClick(); setSelectedCommodity(heldCommodities[currentIndex + 1]); } : undefined}
        nearPort={nearPort}
      />
    );
  }

  return (
    <CargoManifest
      onSelect={(c) => { sfxClick(); setSelectedCommodity(c); }}
      nearPort={nearPort}
    />
  );
}

// ── Cargo manifest (list view) ────────────────────────────────────────────

function CargoManifest({ onSelect, nearPort }: {
  onSelect: (c: Commodity) => void;
  nearPort: ReturnType<typeof useGameStore.getState>['ports'][0] | null;
}) {
  const cargo = useGameStore(s => s.cargo);
  const stats = useGameStore(s => s.stats);
  const provisions = useGameStore(s => s.provisions);
  const crew = useGameStore(s => s.crew);

  const currentCargo = Object.entries(cargo).reduce(
    (sum, [c, qty]) => sum + qty * (COMMODITY_DEFS[c as Commodity]?.weight ?? 1), 0
  );
  const freeCargo = stats.cargoCapacity - currentCargo;
  const usedPct = Math.round((currentCargo / stats.cargoCapacity) * 100);
  const isEmpty = currentCargo === 0;
  const dailyConsumption = Math.max(1, Math.ceil(crew.length * 0.5));
  const daysRemaining = dailyConsumption > 0 ? Math.floor(provisions / dailyConsumption) : 999;
  const totalValue = nearPort
    ? ALL_COMMODITIES_FULL.reduce((sum, c) => sum + (cargo[c as keyof typeof cargo] ?? 0) * Math.floor((nearPort.prices[c as keyof typeof nearPort.prices] ?? 0) * 0.8), 0)
    : null;

  return (
    <motion.div
      key="cargo"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center w-full"
    >
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05 }}
        className="text-center mt-1"
      >
        <h2
          className="text-[20px] md:text-[22px] tracking-[0.25em] uppercase"
          style={{ color: CLR.tabCargo, fontFamily: MONO }}
        >
          Cargo
        </h2>
        <p className="text-[13px] mt-1" style={{ color: CLR.txt, fontFamily: SERIF, fontStyle: 'italic' }}>
          Hold Manifest &amp; Provisions
        </p>
      </motion.div>

      {/* Hold capacity gauge */}
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.12 }}
        className="mt-4 w-full max-w-xl px-2 md:px-4"
      >
        <div
          className="p-4 rounded-lg"
          style={{ backgroundColor: CLR.tabCargo + '06', border: `1px solid ${CLR.tabCargo}20` }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] tracking-[0.15em] uppercase" style={{ color: CLR.dimGold, fontFamily: SANS, fontWeight: 600 }}>
              Hold Capacity
            </span>
            <span className="text-[14px] tabular-nums" style={{ color: CLR.bright, fontFamily: MONO }}>
              {currentCargo} <span style={{ color: CLR.dim }}>/</span> {stats.cargoCapacity}
            </span>
          </div>

          {/* Segmented hold bar */}
          <div className="h-[10px] rounded-full overflow-hidden flex" style={{ backgroundColor: CLR.rule + '40' }}>
            {ALL_COMMODITIES_FULL.map(c => {
              const qty = cargo[c as keyof typeof cargo] ?? 0;
              if (qty === 0) return null;
              const pct = (qty / stats.cargoCapacity) * 100;
              return (
                <motion.div
                  key={c}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.6, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  className="h-full"
                  style={{ backgroundColor: COMMODITY_COLORS[c], opacity: 0.85 }}
                  title={`${c}: ${qty}`}
                />
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {ALL_COMMODITIES_FULL.map(c => {
              const qty = cargo[c as keyof typeof cargo] ?? 0;
              if (qty === 0) return null;
              return (
                <div key={c} className="flex items-center gap-1">
                  <span className="w-[8px] h-[8px] rounded-sm" style={{ backgroundColor: COMMODITY_COLORS[c] }} />
                  <span className="text-[10px]" style={{ color: CLR.dim, fontFamily: SANS }}>{c}</span>
                </div>
              );
            })}
            {freeCargo > 0 && (
              <span className="text-[10px] ml-auto" style={{ color: CLR.dim, fontFamily: SANS }}>
                {freeCargo} units free ({100 - usedPct}%)
              </span>
            )}
          </div>
        </div>
      </motion.div>

      {/* Commodity manifest */}
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
        className="mt-4 w-full max-w-xl px-2 md:px-4"
      >
        {/* Table header */}
        <div className="flex items-center gap-2 px-3 py-2 mb-1">
          <span className="text-[10px] tracking-[0.15em] uppercase flex-1" style={{ color: CLR.dim, fontFamily: SANS, fontWeight: 500 }}>
            Commodity
          </span>
          <span className="text-[10px] tracking-[0.15em] uppercase w-[100px] text-center hidden md:block" style={{ color: CLR.dim, fontFamily: SANS, fontWeight: 500 }}>
            Load
          </span>
          <span className="text-[10px] tracking-[0.15em] uppercase w-[44px] text-right" style={{ color: CLR.dim, fontFamily: SANS, fontWeight: 500 }}>
            Qty
          </span>
          {nearPort && (
            <span className="text-[10px] tracking-[0.15em] uppercase w-[60px] text-right" style={{ color: CLR.dim, fontFamily: SANS, fontWeight: 500 }}>
              Value
            </span>
          )}
        </div>

        <div className="h-[1px]" style={{ background: `linear-gradient(90deg, transparent, ${CLR.rule}60, transparent)` }} />

        {/* Commodity rows */}
        {ALL_COMMODITIES_FULL.map((c, i) => {
          const qty = cargo[c as keyof typeof cargo] ?? 0;
          const pct = stats.cargoCapacity > 0 ? Math.round((qty / stats.cargoCapacity) * 100) : 0;
          const color = COMMODITY_COLORS[c];
          const icon = COMMODITY_ICONS[c];
          const sellPrice = nearPort ? Math.floor((nearPort.prices[c as keyof typeof nearPort.prices] ?? 0) * 0.8) : null;
          const lineValue = sellPrice !== null && qty > 0 ? qty * sellPrice : null;
          const isClickable = qty > 0;

          return (
            <motion.div
              key={c}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25, delay: 0.22 + i * 0.04 }}
              className={`flex items-center gap-2 px-3 py-2.5 border-b transition-colors ${isClickable ? 'cursor-pointer hover:bg-white/[0.03]' : ''}`}
              style={{
                borderColor: CLR.rule + '20',
                opacity: qty > 0 ? 1 : 0.35,
              }}
              onClick={isClickable ? () => onSelect(c) : undefined}
            >
              {/* Icon + name */}
              <span className="text-[13px] w-[18px] text-center" style={{ color, fontFamily: MONO }}>{icon}</span>
              <span className="text-[13px] flex-1" style={{ color: qty > 0 ? CLR.bright : CLR.dim, fontFamily: SANS }}>
                {c}
                {sellPrice !== null && qty > 0 && (
                  <span className="text-[10px] ml-1.5" style={{ color: CLR.dim }}>
                    @{sellPrice}g
                  </span>
                )}
              </span>

              {/* Mini bar */}
              <div className="w-[100px] hidden md:flex items-center gap-1.5">
                <div className="flex-1 h-[5px] rounded-full overflow-hidden" style={{ backgroundColor: CLR.rule + '40' }}>
                  <motion.div
                    className="h-full rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.5, delay: 0.3 + i * 0.04 }}
                    style={{ backgroundColor: color, boxShadow: qty > 0 ? `0 0 4px ${color}30` : 'none' }}
                  />
                </div>
                <span className="text-[9px] tabular-nums w-[24px] text-right" style={{ color: CLR.dim, fontFamily: MONO }}>
                  {pct}%
                </span>
              </div>

              {/* Quantity */}
              <span
                className="text-[14px] tabular-nums w-[44px] text-right"
                style={{ color: qty > 0 ? CLR.bright : CLR.dim, fontFamily: MONO }}
              >
                {qty}
              </span>

              {/* Sell value at port */}
              {nearPort && (
                <span
                  className="text-[12px] tabular-nums w-[60px] text-right"
                  style={{ color: lineValue ? CLR.gold : CLR.rule, fontFamily: MONO }}
                >
                  {lineValue ? `${lineValue}g` : '\u2014'}
                </span>
              )}
            </motion.div>
          );
        })}

        {/* Total value row */}
        {nearPort && totalValue !== null && totalValue > 0 && (
          <div className="flex items-center gap-2 px-3 py-2.5 mt-1">
            <span className="flex-1 text-[12px]" style={{ color: CLR.dim, fontFamily: SANS }}>
              Total sell value at <span style={{ color: CLR.txt }}>{nearPort.name}</span>
            </span>
            <span className="text-[15px] tabular-nums font-semibold" style={{ color: CLR.gold, fontFamily: MONO }}>
              {totalValue.toLocaleString()}g
            </span>
          </div>
        )}

        {/* Empty state */}
        {isEmpty && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.3 }}
            className="text-center py-8"
          >
            <pre className="text-[11px] whitespace-pre mb-3" style={{ fontFamily: MONO }}>
              <C c={CLR.rule}>{'  \u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510'}</C>{'\n'}
              <C c={CLR.rule}>{'  \u2502'}</C><C c={CLR.dim}>{'  hold empty    '}</C><C c={CLR.rule}>{'\u2502'}</C>{'\n'}
              <C c={CLR.rule}>{'  \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518'}</C>
            </pre>
            <p className="text-[12px]" style={{ color: CLR.dim, fontFamily: SANS }}>
              Visit a port to buy and sell goods.
            </p>
          </motion.div>
        )}
      </motion.div>

      {/* Wave divider */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.4 }}
        className="mt-5 w-full max-w-xl"
      >
        <WaveDivider width={52} />
      </motion.div>

      {/* Provisions section */}
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.45 }}
        className="mt-4 w-full max-w-xl px-2 md:px-4 mb-4"
      >
        <div
          className="p-4 rounded-lg"
          style={{
            backgroundColor: provisions < 10 ? CLR.red + '08' : CLR.warm + '06',
            border: `1px solid ${provisions < 10 ? CLR.red : CLR.warm}20`,
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] tracking-[0.15em] uppercase" style={{ color: CLR.dimGold, fontFamily: SANS, fontWeight: 600 }}>
              Provisions
            </span>
            <span className="text-[14px] tabular-nums" style={{ color: provisions < 10 ? CLR.red : CLR.bright, fontFamily: MONO }}>
              {provisions}
            </span>
          </div>

          {/* Bar */}
          <div className="h-[6px] rounded-full overflow-hidden" style={{ backgroundColor: CLR.rule + '40' }}>
            <motion.div
              className="h-full rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, (provisions / 60) * 100)}%` }}
              transition={{ duration: 0.6, delay: 0.5 }}
              style={{
                backgroundColor: provisions < 10 ? CLR.red : CLR.warm,
                boxShadow: `0 0 6px ${provisions < 10 ? CLR.red : CLR.warm}30`,
              }}
            />
          </div>

          {/* Details */}
          <div className="flex items-center justify-between mt-2">
            <span className="text-[11px]" style={{ color: CLR.dim, fontFamily: SANS }}>
              ~{dailyConsumption}/day for {crew.length} crew
            </span>
            <span
              className="text-[12px] font-semibold"
              style={{ color: daysRemaining < 5 ? CLR.red : daysRemaining < 10 ? CLR.yellow : CLR.txt, fontFamily: SANS }}
            >
              {daysRemaining} days remaining
            </span>
          </div>

          {provisions < 10 && (
            <p className="text-[11px] mt-2" style={{ color: CLR.red, fontFamily: SERIF, fontStyle: 'italic' }}>
              The crew grows restless. Resupply urgently at any port.
            </p>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Cargo detail view (Materia Medica style) ─────────────────────────────

function CargoDetailView({ commodity, onBack, onPrev, onNext, nearPort }: {
  commodity: Commodity;
  onBack: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  nearPort: ReturnType<typeof useGameStore.getState>['ports'][0] | null;
}) {
  const cargo = useGameStore(s => s.cargo);
  const stats = useGameStore(s => s.stats);
  const ports = useGameStore(s => s.ports);

  const def = COMMODITY_DEFS[commodity];
  const qty = cargo[commodity as keyof typeof cargo] ?? 0;
  const totalWeight = qty * def.weight;
  const holdPct = stats.cargoCapacity > 0 ? Math.round((totalWeight / stats.cargoCapacity) * 100) : 0;
  const color = def.color;
  const tierLabel = TIER_LABELS[def.tier];
  const historicalNote = COMMODITY_HISTORICAL_NOTES[commodity];

  // Gather known prices across ports
  const portPrices = ports
    .map(p => ({
      name: p.name,
      price: Math.floor((p.prices[commodity as keyof typeof p.prices] ?? 0) * 0.8),
      isCurrent: nearPort?.name === p.name,
    }))
    .filter(p => p.price > 0)
    .sort((a, b) => a.price - b.price);

  const bestPort = portPrices.length > 0 ? portPrices[portPrices.length - 1] : null;
  const sellHere = nearPort ? Math.floor((nearPort.prices[commodity as keyof typeof nearPort.prices] ?? 0) * 0.8) : null;
  const bestProfit = bestPort && qty > 0 ? qty * bestPort.price : null;

  // Arrow key navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' && onPrev) { e.preventDefault(); onPrev(); }
      if (e.key === 'ArrowDown' && onNext) { e.preventDefault(); onNext(); }
      if (e.key === 'Escape') { e.preventDefault(); onBack(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onPrev, onNext, onBack]);

  // Risk summary text
  const risks: string[] = [];
  if (def.spoilable) risks.push('Spoilable');
  if (def.breakable) risks.push('Fragile');
  if (def.fraudRisk > 0) risks.push(`Fraud ${Math.round(def.fraudRisk * 100)}%`);
  const riskSummary = risks.length > 0 ? risks.join(' \u00b7 ') : 'Stable \u00b7 No spoilage';

  return (
    <motion.div
      key={`cargo-detail-${commodity}`}
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -12 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col items-center w-full"
    >
      {/* Breadcrumb */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-xl px-2 md:px-4 mt-1"
      >
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => { sfxClick(); onBack(); }}
            className="text-[11px] tracking-[0.12em] uppercase hover:underline underline-offset-2 transition-colors"
            style={{ color: CLR.tabCargo, fontFamily: SANS, fontWeight: 500 }}
          >
            Cargo
          </button>
          <span className="text-[11px]" style={{ color: CLR.dim }}>&rsaquo;</span>
          <span
            className="text-[11px] tracking-[0.08em]"
            style={{ color: CLR.bright, fontFamily: SANS, fontWeight: 500 }}
          >
            {commodity}
          </span>
        </div>
      </motion.div>

      {/* Large commodity image */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05 }}
        className="mt-3 w-full max-w-2xl px-3 md:px-6 flex flex-col items-center"
      >
        <div
          className="relative w-[160px] h-[160px] md:w-[190px] md:h-[190px] rounded-full overflow-hidden flex items-center justify-center"
          style={{
            background: `radial-gradient(circle at 35% 30%, color-mix(in srgb, ${color} 22%, #ece2cc) 0%, color-mix(in srgb, ${color} 14%, #d4cbb8) 55%, color-mix(in srgb, ${color} 8%, #b8ad94) 100%)`,
            boxShadow: `inset 0 1px 2px rgba(255,255,255,0.35), inset 0 -2px 8px rgba(0,0,0,0.18), 0 4px 22px rgba(0,0,0,0.28), 0 0 48px ${color}18`,
          }}
        >
          {def.iconImage ? (
            <img
              src={def.iconImage}
              alt={commodity}
              className="w-[124%] h-[124%] object-cover"
              style={{ imageRendering: 'auto', transform: 'scale(1.02)' }}
            />
          ) : (
            <span className="text-[68px] md:text-[80px]" style={{ color: `color-mix(in srgb, ${color} 70%, #3a2a1a)`, fontFamily: MONO }}>{def.icon}</span>
          )}
          {/* inner ring for definition */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{ boxShadow: `inset 0 0 0 1px ${color}30, inset 0 0 0 2px rgba(255,255,255,0.06)` }}
          />
        </div>

        {/* Name */}
        <h2
          className="text-[20px] md:text-[24px] tracking-[0.2em] uppercase mt-3"
          style={{ color: CLR.bright, fontFamily: MONO }}
        >
          {commodity}
        </h2>

        {/* Tier + category line */}
        <p className="text-[12px] mt-1 tracking-[0.08em]" style={{ color: CLR.dim, fontFamily: SANS }}>
          Tier {def.tier} &middot; {tierLabel}
          {def.weight > 1 && <> &middot; Weight: {def.weight} units</>}
        </p>

        {/* Description */}
        <p
          className="text-[13px] mt-2 text-center max-w-md"
          style={{ color: CLR.txt, fontFamily: SANS }}
        >
          {def.description}
        </p>

        {/* Physical description */}
        <p
          className="text-[15px] md:text-[16px] mt-1.5 text-center leading-relaxed max-w-md"
          style={{ color: CLR.txt, fontFamily: SERIF, fontStyle: 'italic' }}
        >
          &ldquo;{def.physicalDescription}&rdquo;
        </p>
      </motion.div>

      {/* In Hold card */}
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.15 }}
        className="mt-3 w-full max-w-2xl px-3 md:px-6"
      >
        <div
          className="px-4 py-3 rounded-lg"
          style={{ backgroundColor: color + '08', border: `1px solid ${color}20` }}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] tracking-[0.15em] uppercase" style={{ color: CLR.dimGold, fontFamily: SANS, fontWeight: 600 }}>
              In Hold
            </span>
            <span className="text-[14px] tabular-nums" style={{ color: CLR.bright, fontFamily: MONO }}>
              {qty} unit{qty !== 1 ? 's' : ''}
              {sellHere !== null && qty > 0 && (
                <span className="text-[11px] ml-2" style={{ color: CLR.gold }}>
                  estimated {(qty * sellHere).toLocaleString()}g
                </span>
              )}
            </span>
          </div>

          {/* Hold share bar */}
          <div className="h-[5px] rounded-full overflow-hidden" style={{ backgroundColor: CLR.rule + '40' }}>
            <motion.div
              className="h-full rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${holdPct}%` }}
              transition={{ duration: 0.5, delay: 0.22 }}
              style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}30` }}
            />
          </div>

          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[10px]" style={{ color: CLR.dim, fontFamily: SANS }}>
              {riskSummary}
            </span>
            <span className="text-[10px] tabular-nums" style={{ color: CLR.dim, fontFamily: MONO }}>
              {holdPct}% of hold
            </span>
          </div>
        </div>
      </motion.div>

      {/* Known Prices */}
      {portPrices.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="mt-3 w-full max-w-2xl px-3 md:px-6"
        >
          <span className="text-[10px] tracking-[0.15em] uppercase block mb-1.5 px-1" style={{ color: CLR.dimGold, fontFamily: SANS, fontWeight: 600 }}>
            Known Prices
          </span>
          <div
            className="rounded-lg overflow-hidden"
            style={{ border: `1px solid ${CLR.rule}20` }}
          >
            {portPrices.map((p, i) => {
              const isBest = bestPort && p.name === bestPort.name;
              const maxPrice = bestPort?.price ?? 1;
              const barPct = Math.round((p.price / maxPrice) * 100);
              return (
                <div
                  key={p.name}
                  className="flex items-center gap-2 px-3 py-1.5"
                  style={{
                    backgroundColor: p.isCurrent ? CLR.tabCargo + '08' : i % 2 === 0 ? 'transparent' : CLR.rule + '06',
                    borderBottom: i < portPrices.length - 1 ? `1px solid ${CLR.rule}15` : 'none',
                  }}
                >
                  <span className="text-[12px] w-[90px] md:w-[120px] truncate" style={{ color: p.isCurrent ? CLR.bright : CLR.txt, fontFamily: SANS }}>
                    {p.name}
                    {p.isCurrent && <span className="text-[9px] ml-1" style={{ color: CLR.tabCargo }}>&larr;</span>}
                  </span>
                  {/* Price bar */}
                  <div className="flex-1 h-[4px] rounded-full overflow-hidden" style={{ backgroundColor: CLR.rule + '30' }}>
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${barPct}%`,
                        backgroundColor: isBest ? CLR.gold : color,
                        boxShadow: isBest ? `0 0 6px ${CLR.gold}30` : 'none',
                      }}
                    />
                  </div>
                  <span
                    className="text-[12px] tabular-nums w-[40px] text-right"
                    style={{ color: isBest ? CLR.gold : CLR.txt, fontFamily: MONO, fontWeight: isBest ? 600 : 400 }}
                  >
                    {p.price}g
                  </span>
                  {isBest && <span className="text-[10px]" style={{ color: CLR.gold }}>&#9733;</span>}
                </div>
              );
            })}
          </div>

          {/* Profit callout */}
          {bestPort && bestProfit !== null && bestProfit > 0 && (
            <p className="text-[11px] mt-1.5 px-1" style={{ color: CLR.gold, fontFamily: SANS }}>
              Profit if sold at {bestPort.name}: <span style={{ fontFamily: MONO, fontWeight: 600 }}>{bestProfit.toLocaleString()}g</span>
            </p>
          )}
        </motion.div>
      )}

      {/* Historical Note */}
      {historicalNote && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.28 }}
          className="mt-3 w-full max-w-2xl px-3 md:px-6 mb-2"
        >
          <div className="h-[1px] mb-3" style={{ background: `linear-gradient(90deg, transparent, ${CLR.rule}40, transparent)` }} />
          <div
            className="px-4 py-3 md:px-5 md:py-4 rounded-lg"
            style={{ backgroundColor: CLR.warm + '06', border: `1px solid ${CLR.warm}15` }}
          >
            <span className="text-[10px] tracking-[0.15em] uppercase block mb-2.5" style={{ color: CLR.dimGold, fontFamily: SANS, fontWeight: 600 }}>
              Historical Note
            </span>
            <p
              className="text-[14px] md:text-[15px] leading-[1.75]"
              style={{ color: CLR.txt, fontFamily: SERIF }}
            >
              {historicalNote.text}
            </p>
            {historicalNote.sources.length > 0 && (
              <div className="mt-3 pt-2.5" style={{ borderTop: `1px solid ${CLR.rule}20` }}>
                <span className="text-[10px] tracking-[0.12em] uppercase block mb-1.5" style={{ color: CLR.dim, fontFamily: SANS, fontWeight: 500 }}>
                  Further Reading
                </span>
                {historicalNote.sources.map((src, i) => (
                  <p key={i} className="text-[12px] leading-normal mb-0.5" style={{ color: CLR.dim, fontFamily: SERIF, fontStyle: 'italic' }}>
                    <span style={{ color: CLR.rule }}>&#9675;</span> {src}
                  </p>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Prev / Next navigation */}
      {(onPrev || onNext) && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2, delay: 0.35 }}
          className="mt-2 mb-3 w-full max-w-2xl px-4 md:px-6 flex items-center justify-between"
        >
          {onPrev ? (
            <button
              onClick={onPrev}
              className="text-[11px] tracking-[0.1em] hover:underline underline-offset-2 transition-colors"
              style={{ color: CLR.tabCargo, fontFamily: SANS, fontWeight: 500 }}
            >
              &laquo; Prev
            </button>
          ) : <span />}
          {onNext ? (
            <button
              onClick={onNext}
              className="text-[11px] tracking-[0.1em] hover:underline underline-offset-2 transition-colors"
              style={{ color: CLR.tabCargo, fontFamily: SANS, fontWeight: 500 }}
            >
              Next &raquo;
            </button>
          ) : <span />}
        </motion.div>
      )}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STUB TABS
// ═══════════════════════════════════════════════════════════════════════════

function TabStub({ tabKey, title, subtitle, accent, description }: {
  tabKey: string; title: string; subtitle: string; accent: string; description: string;
}) {
  const sparkle = useSparkle();
  return (
    <motion.div
      key={tabKey}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col items-center pt-10"
    >
      <h2
        className="text-[20px] tracking-[0.25em] uppercase"
        style={{ color: accent, fontFamily: MONO }}
      >
        {title}
      </h2>
      <p className="text-[13px] mt-1" style={{ color: CLR.txt, fontFamily: SERIF, fontStyle: 'italic' }}>
        {subtitle}
      </p>
      <div className="mt-4">
        <OrnateRule sparkle={sparkle} width={36} />
      </div>
      <p className="text-[12px] mt-4 text-center leading-relaxed max-w-xs" style={{ color: CLR.dim, fontFamily: SANS }}>
        {description}
      </p>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB BAR
// ═══════════════════════════════════════════════════════════════════════════

function ASCIITabBar({ active, onChange }: { active: DashTab; onChange: (tab: DashTab) => void }) {
  const [hovered, setHovered] = useState<DashTab | null>(null);
  return (
    <div className="flex items-end justify-center gap-0 select-none px-2">
      {TABS.map(t => {
        const isActive = t.id === active;
        const isHovered = hovered === t.id;
        return (
          <button
            key={t.id}
            onClick={() => { sfxTab(); onChange(t.id); }}
            onMouseEnter={() => setHovered(t.id)}
            onMouseLeave={() => setHovered(null)}
            className="relative transition-all duration-150 active:scale-[0.97] px-0.5"
          >
            {isActive ? (
              <div
                className="relative px-4 md:px-5 py-2 rounded-t-lg border border-b-0 transition-colors"
                style={{
                  borderColor: t.accent + '55',
                  backgroundColor: t.accent + '10',
                  boxShadow: `0 -1px 14px ${t.accent}22, inset 0 1px 0 ${t.accent}20`,
                }}
              >
                {/* Corner glyphs keyed to accent */}
                <span
                  aria-hidden
                  className="absolute -top-[1px] -left-[1px] text-[9px] leading-none"
                  style={{ color: t.accent + 'cc', fontFamily: MONO }}
                >
                  ╭
                </span>
                <span
                  aria-hidden
                  className="absolute -top-[1px] -right-[1px] text-[9px] leading-none"
                  style={{ color: t.accent + 'cc', fontFamily: MONO }}
                >
                  ╮
                </span>
                <span
                  className="text-[11px] md:text-[12px] tracking-[0.15em] uppercase"
                  style={{
                    color: t.accent,
                    fontFamily: SANS,
                    fontWeight: 600,
                    textShadow: `0 0 8px ${t.accent}55`,
                  }}
                >
                  {t.label}
                </span>
              </div>
            ) : (
              <div
                className="px-4 md:px-5 py-2 border-b transition-colors"
                style={{
                  borderColor: isHovered ? t.accent + '70' : CLR.rule + '40',
                }}
              >
                <span
                  className="text-[11px] md:text-[12px] tracking-[0.12em] uppercase transition-colors"
                  style={{
                    color: isHovered ? t.accent + 'cc' : CLR.dim,
                    fontFamily: SANS,
                    fontWeight: 500,
                  }}
                >
                  {t.label}
                </span>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN DASHBOARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function ASCIIDashboard({ open, onClose, initialTab, initialCrewId, initialCommodity }: { open: boolean; onClose: () => void; initialTab?: string; initialCrewId?: string; initialCommodity?: string }) {
  const [tab, setTab] = useState<DashTab>('overview');
  const activeAccent = TABS.find(t => t.id === tab)?.accent ?? CLR.tabOverview;

  // Escape to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { sfxClose(); onClose(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Reset to requested tab on open (or overview by default)
  useEffect(() => {
    if (open) {
      const valid: DashTab[] = ['overview', 'ship', 'crew', 'cargo', 'reputation'];
      setTab(valid.includes(initialTab as DashTab) ? (initialTab as DashTab) : 'overview');
    }
  }, [open, initialTab]);

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        {...modalBackdropMotion}
        className="fixed inset-0 z-50 flex items-center justify-center p-2 md:p-6 pointer-events-auto"
        style={{ backgroundColor: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(4px)' }}
        onClick={(e) => { if (e.target === e.currentTarget) { sfxClose(); onClose(); } }}
      >
        <motion.div
          {...modalPanelMotion}
          className="relative w-full max-w-5xl h-full max-h-[88vh] overflow-hidden flex flex-col"
          style={{
            background: 'linear-gradient(180deg, #0e0d0a 0%, #0a0908 40%, #080807 100%)',
            boxShadow: `0 30px 100px rgba(0,0,0,0.8), inset 0 1px 0 ${activeAccent}15, 0 0 1px ${activeAccent}20`,
            borderRadius: '6px',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Baroque border */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <BaroqueBorder accentColor={activeAccent} />
          </motion.div>

          {/* Close button */}
          <button
            onClick={() => { sfxClose(); onClose(); }}
            className="absolute top-3 right-4 z-30 flex items-center gap-1.5 px-2.5 py-1 rounded-md border transition-all group"
            style={{
              borderColor: activeAccent + '30',
              backgroundColor: activeAccent + '08',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = activeAccent + '80';
              e.currentTarget.style.backgroundColor = activeAccent + '18';
              e.currentTarget.style.boxShadow = `0 0 10px ${activeAccent}30`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = activeAccent + '30';
              e.currentTarget.style.backgroundColor = activeAccent + '08';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <span
              className="text-[10px] tracking-[0.18em] uppercase transition-colors"
              style={{ color: activeAccent + 'b0', fontFamily: SANS, fontWeight: 600 }}
            >
              ESC
            </span>
            <span className="text-[14px] leading-none transition-colors" style={{ color: activeAccent + 'b0' }}>&times;</span>
          </button>

          {/* Tab bar */}
          <div className="relative z-10 shrink-0 pt-5 md:pt-4">
            <ASCIITabBar active={tab} onChange={setTab} />
            {/* Separator line */}
            <div className="h-[1px] mx-6" style={{ background: `linear-gradient(90deg, transparent, ${activeAccent}25, transparent)` }} />
          </div>

          {/* Content area */}
          <div className="relative z-10 flex-1 overflow-y-auto px-4 md:px-8 py-4 scrollbar-thin">
            <AnimatePresence mode="wait">
              {tab === 'overview' && <OverviewTab />}
              {tab === 'ship' && <ShipTab />}
              {tab === 'crew' && <CrewTab initialCrewId={initialCrewId} />}
              {tab === 'cargo' && <CargoTab initialCommodity={initialCommodity} />}
              {tab === 'reputation' && <ReputationTab />}
            </AnimatePresence>
          </div>

          {/* Bottom gradient fade */}
          <div
            className="absolute bottom-0 left-0 right-0 h-10 pointer-events-none z-10"
            style={{ background: 'linear-gradient(to top, #0a0908, transparent)' }}
          />
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

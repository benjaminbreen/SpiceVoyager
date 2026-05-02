/**
 * PortraitModal — Full portrait view with procedural generation metadata.
 * Opens when clicking the portrait circle in crew detail view.
 */

import { motion, AnimatePresence } from 'framer-motion';
import type { CrewMember } from '../store/gameStore';
import { CrewPortrait, crewToPortraitConfig, getSkin, getEyeColor, getHairColor } from './CrewPortrait';
import { ASCII_COLORS as CLR } from './ascii-ui-kit';
import { modalBackdropMotion, modalPanelMotion } from '../utils/uiMotion';

const MONO = '"SF Mono", "Fira Code", "Cascadia Code", "Consolas", monospace';
const SANS = '"DM Sans", sans-serif';
const SERIF = '"Fraunces", serif';

interface PortraitModalProps {
  member: CrewMember;
  open: boolean;
  onClose: () => void;
}

export function PortraitModal({ member, open, onClose }: PortraitModalProps) {
  const config = crewToPortraitConfig(member);
  const skin = getSkin(config);
  const eyeColor = getEyeColor(config);
  const hairColor = getHairColor(config);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          {...modalBackdropMotion}
          className="fixed inset-0 z-[200] flex items-center justify-center px-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}
          onClick={onClose}
        >
          <motion.div
            {...modalPanelMotion}
            className="relative max-w-[680px] w-full rounded-lg overflow-hidden"
            style={{
              backgroundColor: '#0c0b08',
              border: `1px solid ${CLR.rule}80`,
              boxShadow: `0 20px 60px rgba(0,0,0,0.6), 0 0 40px rgba(0,0,0,0.3)`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-3 right-3 z-10 w-7 h-7 flex items-center justify-center rounded-full transition-colors"
              style={{ backgroundColor: CLR.rule + '40', color: CLR.dim }}
            >
              <span className="text-sm leading-none">&times;</span>
            </button>

            <div className="flex flex-col md:flex-row">
              {/* Portrait */}
              <div
                className="flex items-center justify-center p-6 md:p-8"
                style={{ backgroundColor: '#080808', minWidth: 240 }}
              >
                <CrewPortrait member={member} size={200} showBackground={true} />
              </div>

              {/* Metadata panel */}
              <div className="flex-1 p-5 md:p-6 overflow-y-auto max-h-[70vh]">
                {/* Name + role */}
                <h2 className="text-lg" style={{ color: CLR.bright, fontFamily: SANS, fontWeight: 600 }}>
                  {member.name}
                </h2>
                <p className="text-[12px] mt-1" style={{ color: CLR.dim, fontFamily: SANS }}>
                  {member.nationality} {member.role} &middot; Age {member.age} &middot; {member.birthplace}
                </p>

                {/* Backstory */}
                <p className="text-[12px] mt-3 leading-relaxed" style={{ color: CLR.txt, fontFamily: SERIF, fontStyle: 'italic' }}>
                  &ldquo;{member.backstory}&rdquo;
                </p>

                {/* Divider */}
                <div className="my-4" style={{ borderTop: `1px solid ${CLR.rule}50` }} />

                {/* Procgen metadata */}
                <div className="text-[10px] tracking-[0.15em] uppercase mb-2"
                  style={{ color: CLR.gold, fontFamily: SANS, fontWeight: 600 }}>
                  Portrait Generation
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                  <MetaRow label="Seed" value={config.seed.toString()} />
                  <MetaRow label="Cultural Group" value={config.culturalGroup} />
                  <MetaRow label="Gender" value={config.gender} />
                  <MetaRow label="Age Range" value={config.age} />
                  <MetaRow label="Personality" value={config.personality} />
                  <MetaRow label="Social Class" value={config.socialClass} />
                  <MetaRow label="Quality" value={config.quality} />
                </div>

                {/* Distinguishing features */}
                <div className="mt-3 text-[10px] tracking-[0.12em] uppercase mb-1.5"
                  style={{ color: CLR.dim, fontFamily: SANS, fontWeight: 500 }}>
                  Distinguishing Features
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {config.isScarred && <FeatureTag label="Scarred" />}
                  {config.hasEarring && <FeatureTag label="Earring" />}
                  {config.hasPipe && <FeatureTag label="Clay Pipe" />}
                  {config.hasEyePatch && <FeatureTag label="Eye Patch" />}
                  {config.hasGoldTooth && <FeatureTag label="Gold Tooth" />}
                  {config.hasFacialMark && <FeatureTag label="Mole" />}
                  {config.hasBrokenNose && <FeatureTag label="Broken Nose" />}
                  {config.hasFreckles && <FeatureTag label="Freckles" />}
                  {config.hasNeckKerchief && <FeatureTag label="Kerchief" />}
                  {config.hasNeckJewelry && <FeatureTag label={`Neck: ${config.neckJewelryType}`} />}
                  {config.hasTattoo && <FeatureTag label={`Tattoo: ${config.tattooType}`} />}
                  {!config.isScarred && !config.hasEarring && !config.hasPipe && !config.hasEyePatch &&
                   !config.hasGoldTooth && !config.hasFacialMark && !config.hasBrokenNose &&
                   !config.hasFreckles && !config.hasNeckKerchief && !config.hasNeckJewelry &&
                   !config.hasTattoo && (
                    <span className="text-[10px]" style={{ color: CLR.dim, fontFamily: SANS }}>None</span>
                  )}
                </div>

                {/* Color swatches */}
                <div className="my-4" style={{ borderTop: `1px solid ${CLR.rule}50` }} />

                <div className="text-[10px] tracking-[0.15em] uppercase mb-3"
                  style={{ color: CLR.gold, fontFamily: SANS, fontWeight: 600 }}>
                  Color Palette
                </div>

                <div className="space-y-3">
                  <ColorRow label="Skin" colors={[skin.light, skin.mid, skin.dark, skin.blush]}
                    names={['Highlight', 'Base', 'Shadow', 'Blush']}
                    index={config.skinIndex} />
                  <ColorRow label="Eyes" colors={[eyeColor]}
                    names={['Iris']}
                    index={config.eyeColorIndex} />
                  <ColorRow label="Hair" colors={[hairColor]}
                    names={['Color']}
                    index={config.hairColorIndex} />
                </div>

                {/* Stats that influence portrait */}
                <div className="my-4" style={{ borderTop: `1px solid ${CLR.rule}50` }} />

                <div className="text-[10px] tracking-[0.15em] uppercase mb-2"
                  style={{ color: CLR.gold, fontFamily: SANS, fontWeight: 600 }}>
                  Stats (Influence Expression)
                </div>

                <div className="grid grid-cols-4 gap-2">
                  <StatPill label="STR" value={member.stats.strength} />
                  <StatPill label="PER" value={member.stats.perception} />
                  <StatPill label="CHA" value={member.stats.charisma} />
                  <StatPill label="LCK" value={member.stats.luck} />
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function FeatureTag({ label }: { label: string }) {
  return (
    <span className="text-[9px] tracking-[0.08em] uppercase px-2 py-0.5 rounded"
      style={{
        color: CLR.warm,
        backgroundColor: CLR.warm + '12',
        border: `1px solid ${CLR.warm}25`,
        fontFamily: SANS,
        fontWeight: 500,
      }}>
      {label}
    </span>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2 min-w-0">
      <span className="text-[10px] tracking-[0.1em] uppercase shrink-0"
        style={{ color: CLR.dim, fontFamily: SANS, fontWeight: 500 }}>
        {label}
      </span>
      <span className="text-[11px] min-w-0 break-words"
        style={{ color: CLR.bright, fontFamily: MONO }}>
        {value}
      </span>
    </div>
  );
}

function ColorRow({ label, colors, names, index }: {
  label: string; colors: string[]; names: string[]; index: number;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] tracking-[0.1em] uppercase"
          style={{ color: CLR.dim, fontFamily: SANS, fontWeight: 500 }}>
          {label}
        </span>
        <span className="text-[9px]" style={{ color: CLR.rule, fontFamily: MONO }}>
          idx:{index}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {colors.map((c, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-sm border" style={{
              backgroundColor: c,
              borderColor: 'rgba(255,255,255,0.1)',
            }} />
            <div>
              <span className="text-[8px] block" style={{ color: CLR.dim, fontFamily: SANS }}>{names[i]}</span>
              <span className="text-[8px] block" style={{ color: CLR.txt, fontFamily: MONO }}>{c}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: number }) {
  const pct = (value / 20) * 100;
  const color = value >= 15 ? CLR.green : value >= 10 ? CLR.bright : value >= 5 ? CLR.yellow : CLR.red;
  return (
    <div className="text-center">
      <div className="text-[9px] tracking-[0.15em] uppercase mb-0.5"
        style={{ color: CLR.dim, fontFamily: SANS }}>{label}</div>
      <div className="text-[13px] font-bold" style={{ color, fontFamily: MONO }}>{value}</div>
      <div className="w-full h-[2px] mt-0.5 rounded-full" style={{ backgroundColor: CLR.rule + '40' }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color + '80' }} />
      </div>
    </div>
  );
}

import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useGameStore, type Building, type Port } from '../store/gameStore';
import { DISTRICT_LABELS } from '../utils/cityDistricts';
import { buildingDescription } from '../utils/buildingDescriptions';
import { useBuildingPresence } from '../utils/pedestrianPresence';
import { sfxClose, sfxHover } from '../audio/SoundEffects';
import { PresenceRow } from './PresenceRow';

interface Shell {
  label: string;
  accent: string;
  accentSoft: string;
  medallion: string;
  glyph: string;
}

interface BuildingMedallionAsset {
  key: string;
  path: string;
  label: string;
}

const SHELL_BY_KIND: Record<string, Shell> = {
  religious: {
    label: 'Religious Building',
    accent: '#c4a1ff',
    accentSoft: 'rgba(196,161,255,0.24)',
    medallion: 'radial-gradient(circle at 31% 24%, #dbc7ff 0%, #8d6ac4 34%, #4d3479 68%, #160d25 100%)',
    glyph: '✦',
  },
  civic: {
    label: 'Civic Building',
    accent: '#d5b36a',
    accentSoft: 'rgba(213,179,106,0.24)',
    medallion: 'radial-gradient(circle at 31% 24%, #e2c477 0%, #a77d34 34%, #5a3d16 68%, #1d1305 100%)',
    glyph: '◆',
  },
  learned: {
    label: 'Learned Building',
    accent: '#8fb8c8',
    accentSoft: 'rgba(143,184,200,0.26)',
    medallion: 'radial-gradient(circle at 31% 24%, #d5edf2 0%, #81aebe 30%, #426a78 61%, #12232a 100%)',
    glyph: '✧',
  },
  mercantile: {
    label: 'Mercantile Building',
    accent: '#78b8a8',
    accentSoft: 'rgba(120,184,168,0.26)',
    medallion: 'radial-gradient(circle at 31% 24%, #b9e3d4 0%, #6ba897 30%, #36675c 61%, #10241f 100%)',
    glyph: '◇',
  },
  royal: {
    label: 'Royal Building',
    accent: '#d69a87',
    accentSoft: 'rgba(214,154,135,0.28)',
    medallion: 'radial-gradient(circle at 31% 24%, #e7b4a4 0%, #aa6154 34%, #5c2524 68%, #1b0808 100%)',
    glyph: '✶',
  },
  ordinary: {
    label: 'City Building',
    accent: '#a99a73',
    accentSoft: 'rgba(169,154,115,0.22)',
    medallion: 'radial-gradient(circle at 31% 24%, #d8c891 0%, #8e7841 34%, #4a3b1d 68%, #171107 100%)',
    glyph: '·',
  },
};

export function BuildingDetailModal({
  building,
  port,
  onDismiss,
}: {
  building: Building;
  port: Port;
  onDismiss: () => void;
}) {
  const shell = shellForBuilding(building);
  const medallionAsset = buildingMedallionAsset(building);
  const presentPeople = useBuildingPresence(building.id);
  const timeOfDay = useGameStore((state) => state.timeOfDay);
  const weather = useGameStore((state) => state.weather);

  return (
    <AnimatePresence>
      <motion.div
        key={building.id}
        className="fixed inset-0 z-[100] flex items-center justify-center p-3 pointer-events-auto sm:p-6"
        style={{
          height: 'var(--app-height)',
          paddingTop: 'calc(0.75rem + var(--sai-top))',
          paddingBottom: 'calc(0.75rem + var(--sai-bottom))',
          paddingLeft: 'calc(0.75rem + var(--sai-left))',
          paddingRight: 'calc(0.75rem + var(--sai-right))',
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            sfxClose();
            onDismiss();
          }
        }}
      >
        <div className="absolute inset-0 bg-black/48 backdrop-blur-[2px]" />
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 10 }}
          transition={{ duration: 0.22, ease: [0.2, 0.8, 0.25, 1] }}
          className="relative grid w-[min(760px,calc(100vw-1.5rem))] max-h-[min(680px,calc(var(--app-height)-var(--sai-top)-var(--sai-bottom)-1.5rem))]
            grid-cols-1 overflow-hidden rounded-xl border bg-[#0c0b08]/96
            shadow-[0_22px_70px_rgba(0,0,0,0.72),inset_0_1px_0_rgba(255,232,164,0.08)]
            md:grid-cols-[182px_minmax(0,1fr)]"
          style={{
            borderColor: shell.accentSoft,
            backgroundImage: `linear-gradient(90deg, ${shell.accentSoft}, transparent 32%), linear-gradient(180deg, rgba(255,255,255,0.025), transparent 26%)`,
          }}
        >
          <div className="pointer-events-none absolute inset-[9px] rounded-lg border" style={{ borderColor: shell.accentSoft }} />

          <aside className="relative border-b px-4 py-4 md:border-b-0 md:border-r md:px-5 md:py-7" style={{ borderColor: shell.accentSoft }}>
            <div className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-3 md:block">
              <div
                className="relative mx-auto grid h-16 w-16 place-items-center rounded-full md:h-[104px] md:w-[104px]"
                style={{
                  background: shell.medallion,
                  boxShadow: 'inset 0 3px 4px rgba(255,235,178,0.34), inset 0 -5px 8px rgba(0,0,0,0.52), 0 5px 16px rgba(0,0,0,0.55)',
                }}
              >
                <MedallionImage asset={medallionAsset} />
                <div className="hidden h-12 w-12 place-items-center rounded-full bg-[#090704] text-[24px] md:h-[78px] md:w-[78px] md:text-[34px]"
                  style={{ color: shell.accent, boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.88)' }}
                >
                  {shell.glyph}
                </div>
              </div>
              <div className="md:mt-4 md:text-center">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: shell.accent }}>
                  {shell.label}
                </div>
                <div className="mt-1 text-[13px] italic leading-[1.35] text-[#8e856f]" style={{ fontFamily: '"Fraunces", serif' }}>
                  {port.name}
                </div>
              </div>
            </div>
            <div className="mt-5 hidden border-t pt-5 md:block" style={{ borderColor: shell.accentSoft }}>
              <SidebarFact label="district" value={building.district ? DISTRICT_LABELS[building.district] : 'unmarked quarter'} />
              <SidebarFact label="type" value={typeLabel(building)} />
            </div>
          </aside>

          <section className="relative min-w-0">
            <button
              onClick={() => { sfxClose(); onDismiss(); }}
              onMouseEnter={() => sfxHover()}
              className="absolute right-4 top-4 z-40 flex h-9 w-9 items-center justify-center rounded-full
                border border-[#e8ddbf]/30 bg-[#090806]/82 text-[#f3ead2]
                shadow-[0_6px_18px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.12)]
                backdrop-blur-sm transition-colors hover:border-[#e8ddbf]/55 hover:bg-[#17130c]/92"
              aria-label="Close"
            >
              <X size={17} strokeWidth={2.3} />
            </button>

            <CroppedMedallionOverlay shell={shell} asset={medallionAsset} />
            <header className="relative border-b border-white/[0.08] px-5 py-4 md:px-8 md:py-6">
              <h1
                className="max-w-[calc(100%-2.75rem)] text-[30px] font-[560] leading-[1.02] tracking-[0.005em] text-[#e8ddbf] md:text-[40px]"
                style={{ fontFamily: '"Fraunces", serif', fontVariationSettings: '"opsz" 72, "SOFT" 18, "WONK" 1' }}
              >
                {building.label ?? typeLabel(building)}
              </h1>
              {building.labelSub && (
                <p className="mt-2 max-w-[62ch] text-[13px] italic leading-[1.45] text-[#8e856f] md:text-[14px]" style={{ fontFamily: '"Fraunces", serif' }}>
                  {building.labelSub}
                </p>
              )}
              <div className="mt-4 h-px w-full" style={{ background: `linear-gradient(90deg, ${shell.accent}, ${shell.accentSoft}, transparent)` }} />
            </header>

            <div className="px-5 py-6 md:px-8">
              <p className="max-w-[62ch] text-[15px] leading-[1.68] text-[#d4ccb6] md:text-[16px]"
                style={{ fontFamily: '"Fraunces", serif', fontVariationSettings: '"opsz" 30, "SOFT" 32' }}
              >
                {buildingDescription(building, port, presentPeople, { timeOfDay, weather })}
              </p>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => { sfxClose(); onDismiss(); }}
                  onMouseEnter={() => sfxHover()}
                  className="min-h-[42px] rounded-lg border-2 border-[#4a4535]/60 bg-[#1a1e2e]/70 px-4
                    text-[10px] font-bold uppercase tracking-[0.13em] text-[#8a8060]
                    shadow-[inset_0_2px_4px_rgba(0,0,0,0.5),inset_0_-1px_2px_rgba(255,255,255,0.05),0_2px_8px_rgba(0,0,0,0.45)]
                    transition-all hover:border-[#6a6545]/80 hover:text-[#e8ddbf] active:scale-95"
                >
                  Leave
                </button>
                <PresenceRow people={presentPeople} accent={shell.accent} />
              </div>
            </div>
          </section>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function MedallionImage({ asset }: { asset: BuildingMedallionAsset }) {
  return (
    <img
      src={asset.path}
      alt=""
      className="absolute inset-[3px] h-[calc(100%-6px)] w-[calc(100%-6px)] object-contain"
      draggable={false}
    />
  );
}

function SidebarFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-3 text-center">
      <div className="text-[10px] text-[#5f5748]">{label}</div>
      <div className="mt-1 text-[13px] italic leading-[1.25] text-[#cabf9f]" style={{ fontFamily: '"Fraunces", serif' }}>
        {value}
      </div>
    </div>
  );
}

function CroppedMedallionOverlay({ shell, asset }: { shell: Shell; asset: BuildingMedallionAsset }) {
  return (
    <div
      className="pointer-events-none relative z-10 hidden h-40 w-40 float-right -mr-8 -mt-8 mb-2 ml-5 overflow-hidden rounded-full opacity-[0.18] mix-blend-screen md:block lg:h-48 lg:w-48"
      aria-hidden
      title={asset.label}
      style={{ shapeOutside: 'circle(50%)', shapeMargin: '14px' }}
    >
      <div
        className="absolute inset-0 scale-[1.24] rounded-full"
        style={{
          background: shell.medallion,
          boxShadow: 'inset 0 10px 18px rgba(255,235,178,0.22), inset 0 -18px 30px rgba(0,0,0,0.72), 0 18px 45px rgba(0,0,0,0.55)',
        }}
      >
        <MedallionImage asset={asset} />
      </div>
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `radial-gradient(circle at 34% 26%, rgba(255,255,255,0.08), transparent 25%), linear-gradient(135deg, transparent 48%, ${shell.accentSoft} 100%)`,
        }}
      />
      <span className="sr-only">{asset.path}</span>
    </div>
  );
}

function shellForBuilding(building: Building): Shell {
  const key = building.labelEyebrow?.toLowerCase();
  if (key && SHELL_BY_KIND[key]) return SHELL_BY_KIND[key];
  if (building.type === 'spiritual') return SHELL_BY_KIND.religious;
  if (building.type === 'fort') return SHELL_BY_KIND.civic;
  if (building.type === 'palace') return SHELL_BY_KIND.royal;
  if (building.type === 'market' || building.type === 'warehouse' || building.type === 'dock') return SHELL_BY_KIND.mercantile;
  return SHELL_BY_KIND.ordinary;
}

function typeLabel(building: Building): string {
  if (building.type === 'spiritual' && building.faith) return `${building.faith.replace('-', ' ')} spiritual site`;
  return building.type.replace('-', ' ');
}

function buildingMedallionAsset(building: Building): BuildingMedallionAsset {
  const key = buildingMedallionKey(building);
  return {
    key,
    path: `/building-medallions/${key}.png`,
    label: key.replace(/-/g, ' '),
  };
}

function buildingMedallionKey(building: Building): string {
  if (building.type === 'spiritual') {
    return religiousMedallionKey(building.faith);
  }
  if (building.type === 'landmark') {
    const semantic = building.labelEyebrow?.toLowerCase();
    if (semantic === 'religious') return religiousMedallionKey(building.faith);
    if (semantic === 'learned') return 'learned-college';
    if (semantic === 'mercantile') return 'mercantile-counting-house';
    if (semantic === 'royal') return 'royal-palace';
    return 'civic-courthouse';
  }
  if (building.type === 'palace') {
    return 'royal-palace';
  }
  if (building.type === 'fort') return 'civic-fort';
  if (building.type === 'market') return 'mercantile-warehouse';
  if (building.type === 'warehouse') return 'mercantile-warehouse';
  if (building.type === 'dock') return 'maritime-quay';
  if (building.type === 'estate') return 'residential-merchant';
  if (building.type === 'farmhouse') return 'rural-farmhouse';
  if (building.type === 'shack') return 'residential-poor';
  if (building.type === 'house') return building.housingClass === 'poor' ? 'residential-poor' : 'residential-merchant';
  if (building.type === 'plaza') return 'civic-courthouse';
  return 'residential-merchant';
}

function religiousMedallionKey(faith?: string): string {
  if (faith === 'catholic' || faith === 'protestant') return 'religious-catholic';
  if (faith === 'hindu') return 'religious-hindu';
  if (faith === 'buddhist' || faith === 'chinese-folk') return 'religious-buddhist';
  return 'religious-sunni';
}

export default BuildingDetailModal;

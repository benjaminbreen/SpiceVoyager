// ── POIModalV2 ───────────────────────────────────────────────────────────────
//
// Alternative POI modal with progressive reveal:
//   1. Threshold view: short site description + access choice.
//   2. Interior view: reveal site details + Learn tab.
//   3. Converse tab: reveal NPC portrait + session-local standing.
//
// Access rules are intentionally narrow for this first pass:
//   - commodity cost = offering required to enter
//   - reputation cost = port-faction reputation required to enter
//   - gold cost = lesson cost after entry

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import {
  PORT_FACTION,
  useGameStore,
  type Port,
  type POIRewardClaimResult,
} from '../store/gameStore';
import { COMMODITY_DEFS, type Commodity } from '../utils/commodities';
import type { POIDefinition } from '../utils/poiDefinitions';
import type { SemanticClass } from '../utils/semanticClasses';
import { useBuildingPresence } from '../utils/pedestrianPresence';
import { sfxClick, sfxClose, sfxCoin, sfxHover, sfxPickupLegendary, sfxPickupRare } from '../audio/SoundEffects';
import {
  buildPOIInitialSceneMessage,
  buildPOISystemPrompt,
  callGeminiPOI,
  resetPOIRateLimiter,
  type POIConversationMessage,
  type POISuggestedResponse,
} from '../utils/poiConversation';
import { ConfigPortrait, tavernNpcToPortraitConfig } from './CrewPortrait';
import { hasPOIModelPreview, POIModelPreview } from './POIModelPreview';
import { PresenceRow } from './PresenceRow';
import { poiMedallionAsset, type POIMedallionAsset } from '../utils/poiMedallions';

type Tab = 'learn' | 'converse';
type AccessKind = 'open' | 'offering' | 'reputation';
type NpcStanding = -2 | -1 | 0 | 1 | 2;

const SHELL_BY_CLASS: Record<SemanticClass, {
  label: string;
  accent: string;
  accentSoft: string;
  medallion: string;
  glyph: string;
}> = {
  religious: {
    label: 'Sacred Site',
    accent: '#c9a84c',
    accentSoft: 'rgba(201,168,76,0.24)',
    medallion: 'radial-gradient(circle at 31% 24%, #f2d78e 0%, #c29543 28%, #765622 58%, #2c1d08 100%)',
    glyph: '✦',
  },
  learned: {
    label: 'Learned House',
    accent: '#8fb8c8',
    accentSoft: 'rgba(143,184,200,0.26)',
    medallion: 'radial-gradient(circle at 31% 24%, #d5edf2 0%, #81aebe 30%, #426a78 61%, #12232a 100%)',
    glyph: '✧',
  },
  mercantile: {
    label: 'Counting House',
    accent: '#78b8a8',
    accentSoft: 'rgba(120,184,168,0.26)',
    medallion: 'radial-gradient(circle at 31% 24%, #b9e3d4 0%, #6ba897 30%, #36675c 61%, #10241f 100%)',
    glyph: '◇',
  },
  civic: {
    label: 'Civic Office',
    accent: '#d5b36a',
    accentSoft: 'rgba(213,179,106,0.24)',
    medallion: 'radial-gradient(circle at 31% 24%, #e2c477 0%, #a77d34 34%, #5a3d16 68%, #1d1305 100%)',
    glyph: '◆',
  },
  royal: {
    label: 'Royal Precinct',
    accent: '#d69a87',
    accentSoft: 'rgba(214,154,135,0.28)',
    medallion: 'radial-gradient(circle at 31% 24%, #e7b4a4 0%, #aa6154 34%, #5c2524 68%, #1b0808 100%)',
    glyph: '✶',
  },
};

type POIShell = (typeof SHELL_BY_CLASS)[SemanticClass];

export function POIModalV2({
  poi,
  onDismiss,
}: {
  poi: POIDefinition;
  onDismiss: () => void;
}) {
  const port = useGameStore((state) =>
    poi.port ? state.ports.find((p) => p.id === poi.port) ?? null : null,
  );
  const markPOIDiscovered = useGameStore((state) => state.markPOIDiscovered);
  const claimPOIReward = useGameStore((state) => state.claimPOIReward);
  const claimedPOIRewards = useGameStore((state) => state.claimedPOIRewards);
  const rewardResult = useGameStore((state) => state.poiRewardResults[poi.id]);
  const [entered, setEntered] = useState(false);
  const [tab, setTab] = useState<Tab>('learn');
  const [npcStanding, setNpcStanding] = useState<NpcStanding>(0);

  const hasLearnTab = poi.knowledgeDomain.length > 0;
  const hasConverseTab = !!port && poi.kind !== 'natural' && poi.hasKeeper !== false;
  const hasModelPreview = hasPOIModelPreview(poi);
  const shell = SHELL_BY_CLASS[poi.class];
  const presenceBuildingId = useMemo(() => {
    if (!port) return undefined;
    const poiBuilding = port.buildings.find((b) => b.poiId === poi.id);
    if (poiBuilding) return poiBuilding.id;
    if (poi.location.kind === 'landmark') {
      const { landmarkId } = poi.location;
      return port.buildings.find((b) => b.landmarkId === landmarkId)?.id;
    }
    return undefined;
  }, [poi.id, poi.location, port]);
  const presentPeople = useBuildingPresence(presenceBuildingId);
  const medallionAsset = poiMedallionAsset(poi);

  useEffect(() => {
    markPOIDiscovered(poi.id);
  }, [poi.id, markPOIDiscovered]);

  useEffect(() => {
    if (entered && poi.generated) claimPOIReward(poi);
  }, [claimPOIReward, entered, poi]);

  useEffect(() => {
    setEntered(false);
    setTab(hasLearnTab ? 'learn' : 'converse');
    setNpcStanding(0);
  }, [poi.id, hasLearnTab]);

  const hasRecordView = !hasLearnTab && !hasConverseTab;
  const activeTab = hasLearnTab ? tab : hasConverseTab ? 'converse' : 'learn';
  const rewardClaimed = claimedPOIRewards.includes(poi.id);

  return (
    <AnimatePresence>
      <motion.div
        key={poi.id}
        className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-auto p-3 sm:p-6"
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
        <div className="absolute inset-0 bg-black/68 backdrop-blur-sm" />

        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 10 }}
          transition={{ duration: 0.22, ease: [0.2, 0.8, 0.25, 1] }}
          className="relative grid w-[min(820px,calc(100vw-1.5rem))] max-h-[min(780px,calc(var(--app-height)-var(--sai-top)-var(--sai-bottom)-1.5rem))]
            grid-cols-1 overflow-hidden rounded-xl md:min-h-[min(660px,calc(var(--app-height)-var(--sai-top)-var(--sai-bottom)-3rem))] md:w-[min(1040px,calc(100vw-3rem))] md:grid-cols-[210px_minmax(0,1fr)] md:overflow-visible lg:grid-cols-[230px_minmax(0,1fr)]
            border bg-[#0c0b08]/96 shadow-[0_22px_70px_rgba(0,0,0,0.72),inset_0_1px_0_rgba(255,232,164,0.08)]"
          style={{
            borderColor: shell.accentSoft,
            backgroundImage: `linear-gradient(90deg, ${shell.accentSoft}, transparent 32%), linear-gradient(180deg, rgba(255,255,255,0.025), transparent 26%)`,
          }}
        >
          <div
            className="pointer-events-none absolute inset-[9px] rounded-lg border"
            style={{ borderColor: shell.accentSoft }}
          />

          <POISidebar
            poi={poi}
            shell={shell}
            medallionAsset={medallionAsset}
            entered={entered}
            showPortrait={entered && activeTab === 'converse' && hasConverseTab}
            npcStanding={npcStanding}
            port={port}
          />

          <section className="relative min-w-0 flex max-h-[min(780px,calc(var(--app-height)-var(--sai-top)-var(--sai-bottom)-1.5rem))] flex-col">
            {hasModelPreview && (
              <div
                className="pointer-events-auto absolute right-3 top-3 z-30 hidden h-44 w-[18rem] overflow-hidden md:block lg:h-48 lg:w-[21rem] xl:h-52 xl:w-[24rem]"
                aria-label={`${poi.name} model preview. Drag to rotate.`}
              >
                <div
                  className="pointer-events-none absolute inset-y-0 left-0 w-20"
                  style={{ background: 'linear-gradient(90deg, rgba(12,11,8,0.08), transparent)' }}
                />
                <div
                  className="pointer-events-none absolute inset-x-8 bottom-4 h-14"
                  style={{ background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.58), transparent 70%)' }}
                />
                <POIModelPreview poi={poi} />
              </div>
            )}

            <header className={`relative border-b border-white/[0.08] px-5 py-4 md:px-8 md:py-6 ${hasModelPreview ? 'md:pr-[19rem] lg:pr-[22rem] xl:pr-[25rem]' : ''}`}>
              {!hasModelPreview && <CroppedMedallionOverlay shell={shell} asset={medallionAsset} />}
              <button
                onClick={() => { sfxClose(); onDismiss(); }}
                onMouseEnter={() => sfxHover()}
                className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full
                  border border-white/[0.07] bg-white/[0.02] text-[#8e856f]
                  transition-colors hover:border-white/[0.16] hover:text-[#e8ddbf]"
                aria-label="Close"
              >
                <X size={13} />
              </button>
              <h1
                className="max-w-[calc(100%-2.75rem)] text-[30px] font-[560] leading-[1.02] tracking-[0.005em] text-[#e8ddbf] md:text-[42px]"
                style={{
                  fontFamily: '"Fraunces", serif',
                  fontVariationSettings: '"opsz" 72, "SOFT" 18, "WONK" 1',
                }}
              >
                {poi.name}
              </h1>
              <p
                className="mt-2 max-w-[62ch] text-[13px] italic leading-[1.45] text-[#8e856f] md:text-[14px]"
                style={{ fontFamily: '"Fraunces", serif' }}
              >
                {thresholdDescription(poi, port)}
              </p>
              <div
                className="mt-4 h-px w-full"
                style={{ background: `linear-gradient(90deg, ${shell.accent}, ${shell.accentSoft}, transparent)` }}
              />
            </header>

            {!entered ? (
              <ThresholdView
                poi={poi}
                port={port}
                shell={shell}
                presentPeople={presentPeople}
                reservePreviewSpace={hasModelPreview}
                onDismiss={onDismiss}
                onEntered={() => {
                  sfxClick();
                  setEntered(true);
                  setTab(hasLearnTab ? 'learn' : 'converse');
                }}
              />
            ) : (
              <>
                <nav className="flex items-center gap-7 border-b border-white/[0.08] px-5 md:px-8">
                  {hasLearnTab && (
                    <TabButton active={activeTab === 'learn'} accent={shell.accent} onClick={() => setTab('learn')}>
                      Learn
                    </TabButton>
                  )}
                  {hasConverseTab && (
                    <TabButton active={activeTab === 'converse'} accent={shell.accent} onClick={() => setTab('converse')}>
                      Converse
                    </TabButton>
                  )}
                  {hasRecordView && (
                    <TabButton active accent={shell.accent} onClick={() => {}}>
                      Record
                    </TabButton>
                  )}
                </nav>

                <div className="min-h-0 flex-1 overflow-hidden">
                  {poi.generated && !hasRecordView && (
                    <GeneratedRewardNotice
                      poi={poi}
                      shell={shell}
                      rewardResult={rewardResult}
                      rewardClaimed={rewardClaimed}
                    />
                  )}
                  {activeTab === 'learn' && hasLearnTab && <LearnTab poi={poi} shell={shell} />}
                  {hasRecordView && <RecordTab poi={poi} shell={shell} rewardResult={rewardResult} rewardClaimed={rewardClaimed} />}
                  {activeTab === 'converse' && port && hasConverseTab && (
                    <ConverseTab
                      poi={poi}
                      port={port}
                      shell={shell}
                      onStandingDelta={(delta) => setNpcStanding((prev) => clampStanding(prev + delta))}
                    />
                  )}
                </div>
                {presentPeople.length > 0 && (
                  <div className="flex flex-wrap items-center justify-end gap-3 border-t px-5 py-3 md:px-8" style={{ borderColor: shell.accentSoft }}>
                    <PresenceRow people={presentPeople} accent={shell.accent} />
                  </div>
                )}
              </>
            )}
          </section>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function GeneratedRewardNotice({
  poi,
  shell,
  rewardResult,
  rewardClaimed,
}: {
  poi: POIDefinition;
  shell: POIShell;
  rewardResult?: POIRewardClaimResult;
  rewardClaimed: boolean;
}) {
  const rewardCopy = describePOIRewardResult(poi, rewardResult, rewardClaimed);
  return (
    <div className="border-b px-5 py-3 md:px-8" style={{ borderColor: shell.accentSoft }}>
      <div className="grid grid-cols-[34px_minmax(0,1fr)] items-center gap-3">
        <div
          className="grid h-[34px] w-[34px] place-items-center rounded-full text-[12px] font-bold text-[#211707]"
          style={{
            background: shell.medallion,
            boxShadow: 'inset 0 1px 1px rgba(255,242,190,0.42), inset 0 -2px 4px rgba(0,0,0,0.42), 0 2px 6px rgba(0,0,0,0.28)',
          }}
        >
          ✓
        </div>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-[560] text-[#e8ddbf]" style={{ fontFamily: '"Fraunces", serif' }}>
            {rewardCopy.title}
          </div>
          <div className="mt-0.5 text-[12px] leading-[1.4] text-[#8e856f]">
            {rewardCopy.detail}
          </div>
        </div>
      </div>
    </div>
  );
}

function POISidebar({
  poi,
  shell,
  medallionAsset,
  entered,
  showPortrait,
  npcStanding,
  port,
}: {
  poi: POIDefinition;
  shell: POIShell;
  medallionAsset: POIMedallionAsset;
  entered: boolean;
  showPortrait: boolean;
  npcStanding: NpcStanding;
  port: Port | null;
}) {
  const faction = port?.id ? PORT_FACTION[port.id] : undefined;
  const portraitConfig = useMemo(
    () => tavernNpcToPortraitConfig({
      id: poi.id,
      name: poi.npcName,
      nationality: faction ?? 'Portuguese',
      isFemale: false,
      roleTitle: poi.npcRole,
    }),
    [faction, poi.id, poi.npcName, poi.npcRole],
  );

  return (
    <aside
      className="relative border-b px-4 py-4 md:border-b-0 md:border-r md:px-5 md:py-7"
      style={{ borderColor: shell.accentSoft }}
    >
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
          <div
            className="mt-1 text-[13px] italic leading-[1.35] text-[#8e856f]"
            style={{ fontFamily: '"Fraunces", serif' }}
          >
            {poi.sub ?? (port ? port.name : 'Uncharted site')}
          </div>
        </div>
      </div>

      {entered && (
        <div className="mt-5 hidden border-t pt-5 md:block" style={{ borderColor: shell.accentSoft }}>
          <SidebarFact label="known for" value={knownFor(poi)} />
          <SidebarFact label={poi.hasKeeper === false ? 'status' : 'keeper'} value={poi.hasKeeper === false ? 'unattended' : poi.npcName} />

          {showPortrait && (
            <div className="mt-5 border-t pt-5" style={{ borderColor: shell.accentSoft }}>
              <div
                className="mx-auto grid h-[116px] w-[96px] place-items-center overflow-hidden rounded-[14px] border"
                style={{
                  borderColor: shell.accentSoft,
                  background: `linear-gradient(180deg, ${shell.accentSoft}, rgba(0,0,0,0.08))`,
                  boxShadow: 'inset 0 1px 2px rgba(255,235,180,0.16), inset 0 -5px 12px rgba(0,0,0,0.42), 0 6px 14px rgba(0,0,0,0.32)',
                }}
              >
                <ConfigPortrait config={portraitConfig} size={84} square showBackground />
              </div>
              <div
                className="mt-2 text-center text-[14px] font-[560]"
                style={{ color: shell.accent, fontFamily: '"Fraunces", serif' }}
              >
                {poi.npcName}
              </div>
              <div
                className="mt-0.5 text-center text-[12px] italic text-[#8e856f]"
                style={{ fontFamily: '"Fraunces", serif' }}
              >
                {poi.npcRole}
              </div>
              <SidebarFact label="standing" value={standingLabel(npcStanding)} className="mt-4" />
            </div>
          )}
        </div>
      )}
    </aside>
  );
}

function MedallionImage({ asset }: { asset: POIMedallionAsset }) {
  return (
    <img
      src={asset.path}
      alt=""
      className="absolute inset-[3px] h-[calc(100%-6px)] w-[calc(100%-6px)] object-contain"
      draggable={false}
    />
  );
}

function CroppedMedallionOverlay({ shell, asset }: { shell: POIShell; asset: POIMedallionAsset }) {
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
    </div>
  );
}

function SidebarFact({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div className={`mb-3 text-center ${className}`}>
      <div className="text-[10px] text-[#5f5748]">{label}</div>
      <div
        className="mt-1 text-[13px] italic leading-[1.25] text-[#cabf9f]"
        style={{ fontFamily: '"Fraunces", serif' }}
      >
        {value}
      </div>
    </div>
  );
}

function ThresholdView({
  poi,
  port,
  shell,
  presentPeople,
  reservePreviewSpace,
  onDismiss,
  onEntered,
}: {
  poi: POIDefinition;
  port: Port | null;
  shell: POIShell;
  presentPeople: import('../utils/pedestrianPresence').PresentPedestrian[];
  reservePreviewSpace: boolean;
  onDismiss: () => void;
  onEntered: () => void;
}) {
  const access = useAccessState(poi, port);

  return (
    <section className="min-h-0 overflow-y-auto px-5 py-6 md:px-8">
      <p
        className="max-w-[62ch] text-[15px] leading-[1.68] text-[#d4ccb6] md:text-[16px]"
        style={{ fontFamily: '"Fraunces", serif', fontVariationSettings: '"opsz" 30, "SOFT" 32' }}
      >
        {reservePreviewSpace && (
          <span
            aria-hidden="true"
            className="hidden md:block"
            style={{
              float: 'right',
              width: 'min(16.5rem, 45%)',
              height: '4.6rem',
              shapeOutside: 'polygon(26% 0, 100% 0, 100% 100%, 8% 100%)',
              clipPath: 'polygon(26% 0, 100% 0, 100% 100%, 8% 100%)',
            }}
          />
        )}
        {access.thresholdText}
      </p>
      <div className="clear-both" />

      <div className="mt-6 grid grid-cols-[42px_minmax(0,1fr)] items-center gap-3 border-y py-3"
        style={{ borderColor: shell.accentSoft }}
      >
        <div
          className="grid h-[42px] w-[42px] place-items-center rounded-full text-[14px] font-bold text-[#211707]"
          style={{
            background: access.kind === 'reputation'
              ? 'linear-gradient(180deg, #9b9080, #5d564a)'
              : shell.medallion,
            boxShadow: 'inset 0 1px 1px rgba(255,242,190,0.48), inset 0 -2px 4px rgba(0,0,0,0.45), 0 3px 8px rgba(0,0,0,0.34)',
          }}
        >
          {access.token}
        </div>
        <div>
          <div className="text-[15px] font-[560] text-[#e8ddbf]" style={{ fontFamily: '"Fraunces", serif' }}>
            {access.label}
          </div>
          <div className="mt-1 text-[12.5px] leading-[1.45] text-[#8e856f]">
            {access.detail}
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          disabled={!access.canEnter}
          onClick={access.canEnter ? () => {
            access.pay();
            onEntered();
          } : undefined}
          onMouseEnter={() => {
            if (access.canEnter) sfxHover();
          }}
          className={`min-h-[42px] rounded-lg border-2 px-4 text-[10px] font-bold uppercase tracking-[0.13em]
            shadow-[inset_0_2px_4px_rgba(0,0,0,0.5),inset_0_-1px_2px_rgba(255,255,255,0.05),0_2px_8px_rgba(0,0,0,0.6)]
            transition-all active:scale-95
            ${access.canEnter
              ? 'bg-[#1a1e2e] text-[#e8ddbf] hover:shadow-[inset_0_2px_4px_rgba(0,0,0,0.5),inset_0_-1px_2px_rgba(255,255,255,0.05),0_0_12px_rgba(201,168,76,0.18)]'
              : 'cursor-not-allowed bg-[#1a1e2e]/45 text-[#6b6250]'}`}
          style={{ borderColor: access.canEnter ? shell.accentSoft : 'rgba(74,69,53,0.42)' }}
        >
          {access.actionLabel}
        </button>
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
        </div>
        <PresenceRow people={presentPeople} accent={shell.accent} />
        {!access.canEnter && (
          <div
            className="basis-full text-[13px] italic text-[#d69a87] md:basis-auto"
            style={{ fontFamily: '"Fraunces", serif' }}
          >
            {access.denial}
          </div>
        )}
      </div>
    </section>
  );
}

function TabButton({
  active,
  accent,
  onClick,
  children,
}: {
  active: boolean;
  accent: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => { sfxClick(); onClick(); }}
      onMouseEnter={() => {
        if (!active) sfxHover();
      }}
      className="relative py-3 pr-7 text-[14px] font-[560] transition-colors"
      style={{ color: active ? '#e8ddbf' : '#8e856f', fontFamily: '"Fraunces", serif' }}
    >
      {children}
      <span
        className="absolute bottom-[-1px] left-0 h-px w-11"
        style={{ background: active ? accent : 'transparent' }}
      />
    </button>
  );
}

function LearnTab({ poi, shell }: { poi: POIDefinition; shell: POIShell }) {
  const knowledgeState = useGameStore((s) => s.knowledgeState);
  const gold = useGameStore((s) => s.gold);
  const cargo = useGameStore((s) => s.cargo);
  const learnAboutCommodity = useGameStore((s) => s.learnAboutCommodity);
  const [learnPulse, setLearnPulse] = useState<{ commodityId: Commodity; targetLevel: 1 | 2; nonce: number } | null>(null);

  const lessonCost = poi.cost.type === 'gold' ? poi.cost.amount ?? 0 : 0;
  const canPayLesson = lessonCost === 0 || gold >= lessonCost;

  function attemptLearn(commodityId: Commodity, targetLevel: 1 | 2) {
    const current = (knowledgeState[commodityId] as 0 | 1 | 2 | undefined) ?? 0;
    if (targetLevel <= current || !canPayLesson) return;
    if (lessonCost > 0) {
      useGameStore.setState((state) => ({ gold: state.gold - lessonCost }));
      sfxCoin(lessonCost);
    }
    window.setTimeout(() => {
      if (targetLevel === 2) {
        sfxPickupLegendary();
      } else {
        sfxPickupRare();
      }
    }, lessonCost > 0 ? 95 : 0);
    setLearnPulse({ commodityId, targetLevel, nonce: Date.now() });
    learnAboutCommodity(commodityId, targetLevel, `${poi.npcName} at ${poi.name}`);
  }

  return (
    <div className="h-full overflow-y-auto px-5 py-5 md:px-8">
      <div className="grid items-start gap-5 md:grid-cols-[minmax(0,1fr)_112px]">
        <p
          className="text-[14.5px] leading-[1.62] text-[#d4ccb6]"
          style={{ fontFamily: '"Fraunces", serif', fontVariationSettings: '"opsz" 28, "SOFT" 30' }}
        >
          Inside, {shortNpcRole(poi)} can name specimens and teach the signs by which better sorts are known.
          {lessonCost > 0 ? <> Formal teaching costs <strong style={{ color: shell.accent }}>{lessonCost} gold for each lesson</strong>.</> : ' Formal teaching is offered after the threshold custom is met.'}
        </p>

        <div
          className="w-fit rounded-full border px-4 py-2 md:grid md:h-28 md:w-28 md:place-items-center md:p-0"
          style={{ borderColor: shell.accentSoft, boxShadow: 'inset 0 1px 3px rgba(255,230,170,0.12), inset 0 -3px 8px rgba(0,0,0,0.42)' }}
        >
          <div className="text-center">
            <span
              className="text-[18px] font-[560] md:block md:text-[24px]"
              style={{ color: shell.accent, fontFamily: '"Fraunces", serif' }}
            >
              {lessonCost || 'open'}
            </span>
            <small className="ml-1 text-[11px] text-[#8e856f] md:ml-0 md:mt-1 md:block">
              {lessonCost ? 'gold / lesson' : 'after entry'}
            </small>
          </div>
        </div>
      </div>

      <div className="mt-6 border-t" style={{ borderColor: shell.accentSoft }}>
        {poi.knowledgeDomain.map((commodityId) => {
          const def = COMMODITY_DEFS[commodityId];
          const level = (knowledgeState[commodityId] as 0 | 1 | 2 | undefined) ?? 0;
          const isMastery = poi.masteryGoods.includes(commodityId);
          const nextLevel: 1 | 2 | null = level === 0
            ? 1
            : level === 1 && isMastery
              ? 2
              : null;
          const action = nextLevel === 1 ? 'Identify' : nextLevel === 2 ? 'Master' : 'Known';
          const disabled = !nextLevel || !canPayLesson;

          return (
            <div
              key={commodityId}
              className="grid grid-cols-[44px_minmax(0,1fr)] items-center gap-3 border-b py-3 md:grid-cols-[54px_minmax(0,1fr)_96px]"
              style={{ borderColor: 'rgba(231,224,202,0.09)' }}
            >
              <CommodityLessonIcon
                commodityId={commodityId}
                shell={shell}
                level={level}
                pulse={learnPulse?.commodityId === commodityId ? learnPulse : null}
              />
              <div className="min-w-0">
                <div
                  className="truncate text-[16px] font-[560] text-[#e8ddbf]"
                  style={{ fontFamily: '"Fraunces", serif' }}
                >
                  {level === 0 ? def?.physicalDescription ?? 'Unknown specimen' : commodityId}
                </div>
                <div className="mt-1 text-[12px] text-[#8e856f]">
                  {level === 0 ? 'unknown specimen' : level === 1 ? 'recognized; deeper signs may remain' : 'known well enough to avoid common frauds'}
                </div>
              </div>
              <button
                type="button"
                disabled={disabled}
                onClick={() => nextLevel && attemptLearn(commodityId, nextLevel)}
                onMouseEnter={() => {
                  if (!disabled) sfxHover();
                }}
                className={`col-start-2 min-h-9 justify-self-start rounded-lg border-2 px-3 text-[10px] font-bold uppercase tracking-[0.13em]
                  transition-all active:scale-95 md:col-start-auto md:justify-self-end
                  ${disabled
                    ? 'cursor-default border-[#4a4535]/40 bg-[#1a1e2e]/35 text-[#5f5748]'
                    : 'bg-[#1a1e2e] text-[#e8ddbf] hover:text-white'}`}
                style={{ borderColor: disabled ? undefined : shell.accentSoft }}
              >
                {action}
              </button>
            </div>
          );
        })}
      </div>
      {lessonCost > 0 && !canPayLesson && (
        <div className="mt-3 text-[13px] italic text-[#d69a87]" style={{ fontFamily: '"Fraunces", serif' }}>
          You do not have enough gold for another lesson.
        </div>
      )}
    </div>
  );
}

function CommodityLessonIcon({
  commodityId,
  shell,
  level,
  pulse,
}: {
  commodityId: Commodity;
  shell: POIShell;
  level: 0 | 1 | 2;
  pulse: { commodityId: Commodity; targetLevel: 1 | 2; nonce: number } | null;
}) {
  const def = COMMODITY_DEFS[commodityId];
  const displayLevel = pulse?.targetLevel ?? level;
  const statusGlyph = displayLevel === 2 ? '✓' : displayLevel === 1 ? '•' : '?';
  const isMasterPulse = pulse?.targetLevel === 2;
  const iconAnimation = pulse
    ? {
        scale: isMasterPulse ? [1, 1.42, 1.12, 1.22, 1] : [1, 1.22, 1],
        filter: isMasterPulse
          ? [
              'drop-shadow(0 0 0 rgba(232,221,191,0))',
              'drop-shadow(0 0 20px rgba(232,221,191,0.72))',
              'drop-shadow(0 0 8px rgba(143,184,200,0.45))',
              'drop-shadow(0 0 0 rgba(232,221,191,0))',
            ]
          : [
              'drop-shadow(0 0 0 rgba(143,184,200,0))',
              'drop-shadow(0 0 12px rgba(143,184,200,0.58))',
              'drop-shadow(0 0 0 rgba(143,184,200,0))',
            ],
      }
    : undefined;

  return (
    <motion.div
      className="relative grid h-[42px] w-[42px] place-items-center"
      animate={iconAnimation}
      transition={{ duration: isMasterPulse ? 0.82 : 0.46, ease: [0.18, 0.82, 0.22, 1] }}
    >
      {def?.iconImage ? (
        <span
          className="grid h-[39px] w-[39px] place-items-center overflow-hidden rounded-full"
          style={{ background: 'rgba(10,7,3,0.62)' }}
        >
          <img src={def.iconImage} alt="" className="h-[122%] w-[122%] object-cover" />
        </span>
      ) : (
        <span
          className="grid h-[39px] w-[39px] place-items-center rounded-full bg-[#0a0703]/60 text-[18px]"
          style={{ color: def?.color ?? shell.accent }}
        >
          {def?.icon ?? '?'}
        </span>
      )}
      <motion.span
        key={pulse?.nonce ?? displayLevel}
        className="absolute -bottom-0.5 -right-0.5 grid h-[17px] w-[17px] place-items-center rounded-full text-[9px] font-bold"
        initial={pulse ? { scale: 0.2, opacity: 0, rotate: isMasterPulse ? -45 : 0 } : false}
        animate={pulse ? { scale: 1, opacity: 1, rotate: 0 } : undefined}
        transition={{ delay: isMasterPulse ? 0.18 : 0.08, duration: 0.28, ease: [0.18, 0.82, 0.22, 1] }}
        style={{
          background: isMasterPulse ? shell.accent : '#0a0703',
          border: `1px solid ${shell.accentSoft}`,
          color: isMasterPulse ? '#0a0703' : shell.accent,
          boxShadow: isMasterPulse
            ? `0 0 12px ${shell.accentSoft}, 0 1px 4px rgba(0,0,0,0.55)`
            : '0 1px 4px rgba(0,0,0,0.55)',
        }}
        aria-label={displayLevel === 2 ? 'Mastered' : displayLevel === 1 ? 'Recognized' : 'Unknown'}
      >
        {statusGlyph}
      </motion.span>
      {isMasterPulse && (
        <motion.span
          className="pointer-events-none absolute inset-0 rounded-full"
          initial={{ opacity: 0.65, scale: 0.72 }}
          animate={{ opacity: 0, scale: 1.9 }}
          transition={{ duration: 0.72, ease: 'easeOut' }}
          style={{
            border: `1px solid ${shell.accent}`,
            boxShadow: `0 0 18px ${shell.accentSoft}`,
          }}
        />
      )}
    </motion.div>
  );
}

function RecordTab({
  poi,
  shell,
  rewardResult,
  rewardClaimed,
}: {
  poi: POIDefinition;
  shell: POIShell;
  rewardResult?: POIRewardClaimResult;
  rewardClaimed: boolean;
}) {
  const rewardCopy = describePOIRewardResult(poi, rewardResult, rewardClaimed);
  return (
    <div className="h-full overflow-y-auto px-5 py-5 md:px-8">
      <p
        className="max-w-[62ch] text-[15px] leading-[1.68] text-[#d4ccb6] md:text-[16px]"
        style={{ fontFamily: '"Fraunces", serif', fontVariationSettings: '"opsz" 30, "SOFT" 32' }}
      >
        {poi.lore}
      </p>
      <div className="mt-6 grid grid-cols-[42px_minmax(0,1fr)] items-center gap-3 border-y py-3" style={{ borderColor: shell.accentSoft }}>
        <div
          className="grid h-[42px] w-[42px] place-items-center rounded-full text-[14px] font-bold text-[#211707]"
          style={{
            background: shell.medallion,
            boxShadow: 'inset 0 1px 1px rgba(255,242,190,0.48), inset 0 -2px 4px rgba(0,0,0,0.45), 0 3px 8px rgba(0,0,0,0.34)',
          }}
        >
          ✓
        </div>
        <div>
          <div className="text-[15px] font-[560] text-[#e8ddbf]" style={{ fontFamily: '"Fraunces", serif' }}>
            {rewardCopy.title}
          </div>
          <div className="mt-1 text-[12.5px] leading-[1.45] text-[#8e856f]">
            {rewardCopy.detail}
          </div>
        </div>
      </div>
    </div>
  );
}

function describePOIRewardResult(
  poi: POIDefinition,
  result: POIRewardClaimResult | undefined,
  rewardClaimed: boolean,
): { title: string; detail: string } {
  if (!poi.generated) {
    return {
      title: 'Recorded in the journal',
      detail: 'This site has no keeper; its value is in observation and local memory.',
    };
  }
  if (result?.status === 'cargo') {
    return {
      title: `Recovered ${result.amount} ${result.commodityId}`,
      detail: 'The find has been stowed with this site as its provenance.',
    };
  }
  if (result?.status === 'empty') {
    return {
      title: 'Already inspected',
      detail: 'The place has been searched and recorded. No usable salvage was found.',
    };
  }
  if (result?.status === 'full') {
    return {
      title: 'Hold full',
      detail: `There may be ${result.commodityId} here, but the ship has no room for it.`,
    };
  }
  if (result?.status === 'knowledge') {
    return {
      title: result.learned ? `Identified ${result.commodityId}` : `Confirmed ${result.commodityId}`,
      detail: result.learned
        ? 'The observation has been added to your working knowledge.'
        : 'The signs matched what your crew already knew.',
    };
  }
  if (result?.status === 'journal' || rewardClaimed) {
    return {
      title: 'Already inspected',
      detail: 'The observation has been added to the journal.',
    };
  }
  return {
    title: 'Site inspected',
    detail: 'The observation has been added to your record.',
  };
}

function ConverseTab({
  poi,
  port,
  shell,
  onStandingDelta,
}: {
  poi: POIDefinition;
  port: Port;
  shell: POIShell;
  onStandingDelta: (delta: number) => void;
}) {
  const [history, setHistory] = useState<POIConversationMessage[]>([]);
  const [suggestions, setSuggestions] = useState<POISuggestedResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [playerInput, setPlayerInput] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const systemPrompt = useMemo(() => buildPOISystemPrompt(poi, port), [poi, port]);

  useEffect(() => {
    resetPOIRateLimiter();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);

    callGeminiPOI(systemPrompt, [], buildPOIInitialSceneMessage(poi, port), controller.signal)
      .then((res) => {
        if (controller.signal.aborted) return;
        setHistory([{ role: 'model', text: res.npcDialogue }]);
        setSuggestions(res.suggestedResponses);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error('POI initial response failed:', err);
        setHistory([{ role: 'model', text: 'Your host glances up but says nothing.' }]);
        setSuggestions([{ label: 'Take your leave', type: 'farewell' }]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [poi, port, systemPrompt]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, isLoading]);

  async function send(text: string, type?: POISuggestedResponse['type']) {
    if (!text.trim() || isLoading) return;
    sfxClick();
    const userMsg: POIConversationMessage = { role: 'user', text };
    const newHistory = [...history, userMsg];
    setHistory(newHistory);
    setSuggestions([]);
    setPlayerInput('');
    onStandingDelta(type === 'show_item' || type === 'request_lesson' ? 1 : type === 'farewell' ? 0 : 0);

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    setIsLoading(true);

    try {
      const res = await callGeminiPOI(systemPrompt, history, text, controller.signal);
      if (controller.signal.aborted) return;
      setHistory([...newHistory, { role: 'model', text: res.npcDialogue }]);
      setSuggestions(res.suggestedResponses);
    } catch (err) {
      if (!controller.signal.aborted) {
        console.error('POI reply failed:', err);
        setSuggestions([{ label: 'Take your leave', type: 'farewell' }]);
      }
    } finally {
      if (!controller.signal.aborted) setIsLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5 md:px-8">
        {history.map((msg, i) => (
          <div
            key={i}
            className={msg.role === 'model'
              ? 'relative pl-5 text-[14.5px] leading-[1.68] text-[#d4ccb6]'
              : 'ml-5 w-fit max-w-[88%] border-l py-2 pl-3 pr-2 text-[13px] italic leading-[1.55] text-[#aebfb9]'}
            style={{
              fontFamily: '"Fraunces", serif',
              borderColor: msg.role === 'user' ? shell.accentSoft : undefined,
              background: msg.role === 'user' ? `linear-gradient(90deg, ${shell.accentSoft}, transparent)` : undefined,
            }}
          >
            {msg.role === 'model' && (
              <span
                className="absolute left-0 top-[0.6em] h-[7px] w-[7px] rounded-full"
                style={{ background: shell.accent, boxShadow: `0 0 9px ${shell.accentSoft}` }}
              />
            )}
            {msg.text}
          </div>
        ))}
        {isLoading && (
          <div className="text-[13px] italic text-[#5f5748]" style={{ fontFamily: '"Fraunces", serif' }}>
            {poi.npcName.split(' ')[0]} pauses.
          </div>
        )}
        <div ref={transcriptEndRef} />
      </div>

      <div className="border-t px-5 py-4 md:px-8" style={{ borderColor: shell.accentSoft }}>
        {suggestions.length > 0 && !isLoading && (
          <div className="mb-3 grid gap-1">
            {suggestions.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => send(s.label, s.type)}
                onMouseEnter={() => sfxHover()}
                className="text-left text-[13px] leading-[1.4] text-[#c6bda6] transition-colors hover:text-[#e8ddbf]"
              >
                <span
                  className="mr-2 inline-grid h-[19px] w-[19px] place-items-center rounded-full text-[10px] font-bold text-[#211707]"
                  style={{ background: shell.medallion }}
                >
                  {i + 1}
                </span>
                <span className="hover:underline hover:underline-offset-4">{s.label}</span>
              </button>
            ))}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(playerInput);
          }}
          className="grid grid-cols-[minmax(0,1fr)_auto] gap-3"
        >
          <input
            value={playerInput}
            onChange={(e) => setPlayerInput(e.target.value)}
            disabled={isLoading}
            placeholder="Say something plainly"
            className="min-w-0 border-0 border-b bg-transparent px-0 py-2 text-[14px] text-[#e8ddbf]
              outline-none placeholder:text-[#5f5748] disabled:opacity-50"
            style={{ borderColor: shell.accentSoft }}
          />
          <button
            type="submit"
            disabled={isLoading || !playerInput.trim()}
            onMouseEnter={() => {
              if (!isLoading && playerInput.trim()) sfxHover();
            }}
            className="text-[10px] font-bold uppercase tracking-[0.14em] disabled:opacity-40"
            style={{ color: shell.accent }}
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}

function useAccessState(poi: POIDefinition, port: Port | null) {
  const gold = useGameStore((s) => s.gold);
  const cargo = useGameStore((s) => s.cargo);
  const getReputation = useGameStore((s) => s.getReputation);
  const cost = poi.cost;
  const faction = port?.id ? PORT_FACTION[port.id] : undefined;

  const accessKind: AccessKind = cost.type === 'commodity'
    ? 'offering'
    : cost.type === 'reputation'
      ? 'reputation'
      : 'open';

  if (accessKind === 'offering') {
    const commodityId = cost.commodityId;
    const amount = cost.amount ?? 1;
    const held = commodityId ? cargo[commodityId] ?? 0 : 0;
    const canEnter = !!commodityId && held >= amount;
    return {
      kind: accessKind,
      canEnter,
      token: String(amount),
      label: 'Offering required',
      detail: commodityId
        ? `Give ${amount} ${commodityId} to enter.`
        : 'An offering is required.',
      denial: commodityId ? `You need ${amount} ${commodityId}.` : 'You do not have the required offering.',
      actionLabel: commodityId ? `Offer ${commodityId} and enter` : 'Make offering',
      thresholdText: thresholdBody(poi, 'offering'),
      pay: () => {
        if (!commodityId) return;
        useGameStore.setState((state) => ({
          cargo: { ...state.cargo, [commodityId]: Math.max(0, (state.cargo[commodityId] ?? 0) - amount) },
        }));
      },
    };
  }

  if (accessKind === 'reputation') {
    const required = cost.amount ?? 0;
    const current = faction ? getReputation(faction) : 0;
    const canEnter = !!faction && current >= required;
    return {
      kind: accessKind,
      canEnter,
      token: '–',
      label: canEnter ? 'Standing accepted' : 'Standing too low',
      detail: faction
        ? `Requires ${faction} reputation of ${required}. Current standing: ${current}.`
        : `Requires reputation of ${required}.`,
      denial: faction
        ? `Better standing with the ${faction} would open this room.`
        : 'You need a recognized introduction to enter.',
      actionLabel: canEnter ? 'Enter' : 'Enter - standing too low',
      thresholdText: thresholdBody(poi, 'reputation'),
      pay: () => {},
    };
  }

  return {
    kind: accessKind,
    canEnter: true,
    token: '✓',
    label: poi.hasKeeper === false ? 'Open site' : 'Open threshold',
    detail: cost.type === 'gold' && cost.amount
      ? `Entry is open. Formal lessons cost ${cost.amount} gold each.`
      : poi.hasKeeper === false ? 'No permission is needed to inspect it.' : 'Entry is open.',
    denial: '',
    actionLabel: poi.hasKeeper === false ? 'Inspect' : 'Enter',
    thresholdText: thresholdBody(poi, 'open'),
    pay: () => {},
  };
}

function thresholdBody(poi: POIDefinition, kind: AccessKind): string {
  if (poi.hasKeeper === false) {
    return `${poi.arrivalDescription ?? poi.lore} You can inspect the place and add the observation to your record.`;
  }
  if (kind === 'reputation') {
    return `The threshold is guarded by custom and reputation. ${poi.npcName} receives captains only when their standing is already known.`;
  }
  if (kind === 'offering') {
    return `The threshold has its own custom. Before conversation or instruction, ${poi.npcName} expects the proper offering.`;
  }
  if (poi.arrivalDescription) return poi.arrivalDescription;
  return `You find ${poi.name.toLowerCase()} and take in the place before speaking to anyone. Entry is open, but formal instruction still has a cost.`;
}

function thresholdDescription(poi: POIDefinition, port: Port | null): string {
  if (poi.sub) return poi.sub;
  if (port) return `${port.name} — ${SHELL_BY_CLASS[poi.class].label.toLowerCase()}`;
  return SHELL_BY_CLASS[poi.class].label;
}

function knownFor(poi: POIDefinition): string {
  if (poi.knowledgeDomain.length === 0) return 'local memory and observation';
  return poi.knowledgeDomain.slice(0, 3).join(', ');
}

function shortNpcRole(poi: POIDefinition): string {
  const role = poi.npcRole.trim();
  return role ? role.charAt(0).toLowerCase() + role.slice(1) : 'the keeper';
}

function standingLabel(standing: NpcStanding): string {
  if (standing <= -2) return 'offended';
  if (standing === -1) return 'wary';
  if (standing === 1) return 'receptive';
  if (standing >= 2) return 'warm';
  return 'measured';
}

function clampStanding(value: number): NpcStanding {
  return Math.max(-2, Math.min(2, value)) as NpcStanding;
}

export default POIModalV2;

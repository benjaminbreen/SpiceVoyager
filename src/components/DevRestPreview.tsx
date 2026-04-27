import { useEffect, useState } from 'react';
import { useGameStore, lodgingCost, lodgingLabel } from '../store/gameStore';
import type { Port, RestSummary, CrewRestDelta } from '../store/gameStore';
import { SleepOverlay } from './SleepOverlay';
import { RestSummaryModal } from './RestSummaryModal';
import { audioManager } from '../audio/AudioManager';
import { nationalityToCulture } from '../utils/portCoords';

// Standalone dev preview of the rest-at-inn flow. Drives SleepOverlay +
// RestSummaryModal with a synthetic summary so we don't mutate game
// state (no time advance, no gold deduction, no real XP). Triggered by
// the dev panel via `setDevRestPreview(portId)`.
export function DevRestPreview() {
  const portId = useGameStore(s => s.devRestPreviewPortId);
  const setPortId = useGameStore(s => s.setDevRestPreview);
  const ports = useGameStore(s => s.ports);
  const crew = useGameStore(s => s.crew);
  const dayCount = useGameStore(s => s.dayCount);

  const [resting, setResting] = useState(false);
  const [summary, setSummary] = useState<RestSummary | null>(null);
  const [activePort, setActivePort] = useState<Port | null>(null);

  useEffect(() => {
    if (!portId) return;
    const matchedPort = ports.find(p => p.id === portId);
    if (!matchedPort) {
      // Synthetic stub for ports not in the active world (e.g. previewing
      // before fast-traveling). Just enough fields to drive the overlay.
      const stub = {
        id: portId,
        name: portId.charAt(0).toUpperCase() + portId.slice(1),
        scale: 'Medium',
        culture: 'European',
      } as unknown as Port;
      setActivePort(stub);
    } else {
      setActivePort(matchedPort);
    }

    setResting(true);
    audioManager.startInnMusic();

    // Mirror TavernTab.handleRest pacing exactly so the dev preview
    // matches the real-game feel. All timeouts are tracked so they
    // cancel cleanly if the user picks a different port mid-preview.
    const port = ports.find(p => p.id === portId);
    const portCulture = port?.culture ?? 'European';
    const portScale = port?.scale ?? 'Medium';
    const portName = port?.name ?? portId;
    const cost = lodgingCost(portScale);
    const deltas: CrewRestDelta[] = crew.map(c => {
      const moraleAfter = Math.min(100, c.morale + 15);
      const homeCulture = nationalityToCulture(c.nationality);
      const foreign = homeCulture !== portCulture;
      return {
        crewId: c.id,
        name: c.name,
        moraleBefore: c.morale,
        moraleAfter,
        healthBefore: c.health,
        healthAfter: c.health,
        heartsBefore: c.hearts.current,
        heartsAfter: c.hearts.max,
        heartsMaxBefore: c.hearts.max,
        heartsMaxAfter: c.hearts.max,
        xpGained: foreign ? 2 : 1,
        xpBonusReason: foreign ? 'foreign-culture' : 'foreign-port',
        levelUp: false,
        newLevel: c.level,
      };
    });
    const synthetic: RestSummary = { portId, portName, cost, crewDeltas: deltas };

    const t1 = setTimeout(() => setResting(false), 8500);
    const t2 = setTimeout(() => setSummary(synthetic), 9100);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [portId, ports, crew]);

  const handleDismiss = () => {
    setSummary(null);
    setPortId(null);
    setActivePort(null);
    audioManager.stopInnMusic();
  };

  if (!activePort) return null;

  return (
    <>
      <SleepOverlay
        active={resting}
        portId={activePort.id}
        portName={activePort.name}
        lodgingName={lodgingLabel(activePort.culture)}
        dayCount={dayCount}
      />
      <RestSummaryModal
        summary={summary}
        crew={crew}
        onDismiss={handleDismiss}
      />
    </>
  );
}

import { useMemo } from 'react';
import { ConfigPortrait, tavernNpcToPortraitConfig } from './CrewPortrait';
import type { PresentPedestrian } from '../utils/pedestrianPresence';
import type { Nationality } from '../store/gameStore';

const PORTRAIT_NATIONALITIES = new Set<Nationality>([
  'English', 'Portuguese', 'Dutch', 'Spanish', 'French', 'Danish', 'Venetian',
  'Pirate', 'Mughal', 'Gujarati', 'Persian', 'Ottoman', 'Omani', 'Swahili',
  'Malay', 'Acehnese', 'Javanese', 'Moluccan', 'Siamese', 'Japanese', 'Chinese',
]);

function safePortraitNationality(value: Nationality | undefined): Nationality {
  return value && PORTRAIT_NATIONALITIES.has(value) ? value : 'Portuguese';
}

export function PresenceRow({
  people,
  accent,
}: {
  people: PresentPedestrian[];
  accent: string;
}) {
  if (people.length === 0) return null;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <div className="mr-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#7d735e]">
        Also present
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {people.map((person) => (
          <PresencePortrait key={person.id} person={person} accent={accent} />
        ))}
      </div>
    </div>
  );
}

function PresencePortrait({ person, accent }: { person: PresentPedestrian; accent: string }) {
  const portraitConfig = useMemo(
    () => tavernNpcToPortraitConfig({
      id: person.id,
      name: person.name,
      nationality: safePortraitNationality(person.nationality),
      isFemale: person.figureType === 'woman',
      roleTitle: person.role,
    }),
    [person.id, person.name, person.nationality, person.figureType, person.role],
  );

  return (
    <div
      className="group relative h-9 w-9 overflow-visible rounded-full border bg-[#090704]"
      style={{
        borderColor: accent,
        boxShadow: '0 2px 8px rgba(0,0,0,0.45), inset 0 1px 2px rgba(255,235,180,0.16)',
      }}
      tabIndex={0}
      aria-label={`${person.name}, ${person.role}`}
    >
      <div className="h-full w-full overflow-hidden rounded-full">
        <ConfigPortrait config={portraitConfig} size={38} square showBackground />
      </div>
      <div
        className="pointer-events-none absolute bottom-[calc(100%+0.45rem)] right-0 z-50 hidden w-max max-w-[220px]
          rounded-md border bg-[#100d08]/96 px-2.5 py-2 text-left shadow-[0_8px_24px_rgba(0,0,0,0.55)]
          group-hover:block group-focus:block"
        style={{ borderColor: accent }}
      >
        <div className="text-[12px] font-[560] leading-tight text-[#e8ddbf]" style={{ fontFamily: '"Fraunces", serif' }}>
          {person.name}
        </div>
        <div className="mt-0.5 text-[11px] italic leading-tight text-[#9f967e]" style={{ fontFamily: '"Fraunces", serif' }}>
          {person.role}
        </div>
      </div>
    </div>
  );
}

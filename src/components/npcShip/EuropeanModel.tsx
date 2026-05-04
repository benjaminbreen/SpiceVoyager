import type { NPCShipVisual } from '../../utils/npcShipGenerator';
import type { NPCShipDetailLevel } from './detailLevel';
import { showNpcShipDetail } from './detailLevel';
import { CannonPorts, mutedHullTrim, SquareSail, SternFlag } from './NPCShipParts';

function Pavesades({ visual }: { visual: NPCShipVisual }) {
  return (
    <>
      {[-1, 1].map((side) => (
        <group key={side}>
          {[-1.35, -0.75, -0.15, 0.45, 1.05].map((z, idx) => (
            <mesh key={z} position={[side * 1.24, 1.18, z]}>
              <boxGeometry args={[0.05, 0.34, 0.24]} />
              <meshStandardMaterial color={idx % 2 === 0 ? visual.flagColor : visual.flagAccentColor} roughness={0.85} />
            </mesh>
          ))}
        </group>
      ))}
    </>
  );
}

function RoundTop({ visual }: { visual: NPCShipVisual }) {
  return (
    <group position={[0, 3.52, 0.2]}>
      <mesh>
        <cylinderGeometry args={[0.42, 0.42, 0.08, 12]} />
        <meshStandardMaterial color={visual.deckColor} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.08, 0]}>
        <torusGeometry args={[0.42, 0.025, 5, 12]} />
        <meshStandardMaterial color={visual.trimColor} roughness={0.85} />
      </mesh>
    </group>
  );
}

function CargoHatch({ visual }: { visual: NPCShipVisual }) {
  return (
    <group position={[0, 1.14, -0.45]}>
      <mesh>
        <boxGeometry args={[0.96, 0.08, 0.64]} />
        <meshStandardMaterial color={mutedHullTrim(visual.trimColor)} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.05, 0]}>
        <boxGeometry args={[0.72, 0.04, 0.42]} />
        <meshStandardMaterial color={visual.hullColor} roughness={0.95} />
      </mesh>
    </group>
  );
}

export function EuropeanModel({
  visual,
  shipType,
  detailLevel,
}: {
  visual: NPCShipVisual;
  shipType: string;
  detailLevel: NPCShipDetailLevel;
}) {
  const galleon = shipType === 'Galleon' || shipType === 'Carrack' || shipType === 'Armed Merchantman';
  const carrack = shipType === 'Carrack';
  const fluyt = shipType === 'Fluyt';
  const showSmallDetail = showNpcShipDetail(detailLevel, 'near');
  const showMidDetail = showNpcShipDetail(detailLevel, 'mid');
  const hw = galleon ? 2.35 : 1.85;
  const hl = galleon ? 5.9 : 4.9;
  return (
    <group scale={visual.scale}>
      <mesh position={[0, 0.58, -0.25]} castShadow receiveShadow>
        <boxGeometry args={[hw, 1.05, hl * 0.8]} />
        <meshStandardMaterial color={visual.hullColor} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.5, hl * 0.3]} rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <coneGeometry args={[hw * 0.52, hl * 0.28, 4]} />
        <meshStandardMaterial color={visual.hullColor} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.65, hl * 0.46]} castShadow receiveShadow>
        <boxGeometry args={[hw * 0.35, 0.45, 0.55]} />
        <meshStandardMaterial color={mutedHullTrim(visual.trimColor)} roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.35, hl * 0.42]} rotation={[-0.55, 0, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.07, galleon ? 2.8 : 2.0, 6]} />
        <meshStandardMaterial color="#3e2723" />
      </mesh>
      <mesh position={[0, 1.15, hl * 0.28]} castShadow receiveShadow>
        <boxGeometry args={[galleon ? 1.75 : 1.25, 0.55, 0.75]} />
        <meshStandardMaterial color={mutedHullTrim(visual.trimColor)} roughness={0.9} />
      </mesh>
      {visual.hasSternCastle && (
        <mesh position={[0, 1.4, -2.35]} castShadow receiveShadow>
          <boxGeometry args={[galleon ? 2.2 : 1.65, galleon ? 1.35 : 1.15, 0.9]} />
          <meshStandardMaterial color={visual.deckColor} roughness={0.9} />
        </mesh>
      )}
      {carrack && showSmallDetail && (
        <>
          <Pavesades visual={visual} />
          <RoundTop visual={visual} />
        </>
      )}
      {fluyt && showMidDetail && <CargoHatch visual={visual} />}
      {[-1.45, 0.2, 1.55].slice(0, visual.mastCount).map((z, idx) => (
        <group key={z} position={[0, 0, z]}>
          <mesh position={[0, 2.45, 0]} castShadow>
            <cylinderGeometry args={[0.08, 0.11, idx === 1 ? 4.3 : 3.7, 8]} />
            <meshStandardMaterial color="#3e2723" />
          </mesh>
          <group position={[0, 3.0, 0]} rotation={[0, 0, idx === 2 ? 0.18 : 0]}>
            <SquareSail
              color={visual.sailColor}
              width={idx === 1 ? 2.35 : 1.9}
              height={idx === 2 ? 1.05 : 1.25}
            />
          </group>
          <mesh position={[0, 3.68, 0]}>
            <boxGeometry args={[idx === 1 ? 2.5 : 2.05, 0.08, 0.1]} />
            <meshStandardMaterial color="#3e2723" roughness={0.85} />
          </mesh>
        </group>
      ))}
      {showMidDetail && <CannonPorts visual={visual} zPositions={[-1.8, -0.8, 0.2, 1.2]} />}
      <SternFlag visual={visual} />
    </group>
  );
}

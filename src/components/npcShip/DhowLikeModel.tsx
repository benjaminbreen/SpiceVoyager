import type { NPCShipVisual } from '../../utils/npcShipGenerator';
import type { NPCShipDetailLevel } from './detailLevel';
import { showNpcShipDetail } from './detailLevel';
import { CannonPorts, LateenSail, mutedHullTrim, SternFlag } from './NPCShipParts';

function CarvedSternDetail({ visual }: { visual: NPCShipVisual }) {
  return (
    <group position={[0, 1.06, -1.94]}>
      {[-0.34, 0.34].map((x) => (
        <mesh key={x} position={[x, 0, -0.02]}>
          <boxGeometry args={[0.36, 0.16, 0.035]} />
          <meshStandardMaterial color={visual.deckColor} roughness={0.85} />
        </mesh>
      ))}
      {[-0.58, 0, 0.58].map((x) => (
        <mesh key={x} position={[x, -0.03, 0]}>
          <boxGeometry args={[0.04, 0.28, 0.04]} />
          <meshStandardMaterial color={mutedHullTrim(visual.trimColor)} roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

export function DhowLikeModel({
  visual,
  shipType,
  detailLevel,
}: {
  visual: NPCShipVisual;
  shipType: string;
  detailLevel: NPCShipDetailLevel;
}) {
  const large = shipType === 'Baghla' || shipType === 'Ghurab';
  const showSmallDetail = showNpcShipDetail(detailLevel, 'near');
  const showMidDetail = showNpcShipDetail(detailLevel, 'mid');
  const hw = large ? 1.95 : 1.6;
  const hl = large ? 5.2 : 4.4;
  return (
    <group scale={visual.scale}>
      <mesh position={[0, 0.45, -0.3]} castShadow receiveShadow>
        <boxGeometry args={[hw, 0.8, hl * 0.78]} />
        <meshStandardMaterial color={visual.hullColor} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.55, hl * 0.32]} rotation={[-0.15, 0, 0]} castShadow receiveShadow>
        <coneGeometry args={[hw * 0.52, hl * 0.38, 4]} />
        <meshStandardMaterial color={visual.hullColor} roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.05, hl * 0.46]} rotation={[-0.4, 0, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.06, 1.2, 6]} />
        <meshStandardMaterial color={mutedHullTrim(visual.trimColor)} roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.95, -1.8]} castShadow receiveShadow>
        <boxGeometry args={[large ? 1.8 : 1.45, 0.28, 0.22]} />
        <meshStandardMaterial color={mutedHullTrim(visual.trimColor)} roughness={0.85} />
      </mesh>
      {large && showSmallDetail && <CarvedSternDetail visual={visual} />}
      <mesh position={[0, 2.4, 0.4]} rotation={[0.08, 0, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.1, 3.7, 7]} />
        <meshStandardMaterial color="#3e2723" />
      </mesh>
      <LateenSail visual={visual} position={[0.45, 2.85, 0.65]} scale={large ? 1.1 : 0.95} />
      {visual.mastCount > 1 && (
        <>
          <mesh position={[0, 2.0, -1.25]} castShadow>
            <cylinderGeometry args={[0.06, 0.08, 2.7, 7]} />
            <meshStandardMaterial color="#3e2723" />
          </mesh>
          <LateenSail visual={visual} position={[-0.35, 2.25, -1.1]} scale={0.7} angle={0.42} />
        </>
      )}
      {showMidDetail && <CannonPorts visual={visual} zPositions={[-1.3, -0.35, 0.6]} />}
      <SternFlag visual={visual} />
    </group>
  );
}

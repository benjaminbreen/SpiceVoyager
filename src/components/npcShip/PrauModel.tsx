import type { NPCShipVisual } from '../../utils/npcShipGenerator';
import type { NPCShipDetailLevel } from './detailLevel';
import { LateenSail, LugSail, mutedHullTrim, SternFlag } from './NPCShipParts';

export function PrauModel({
  visual,
  shipType,
  detailLevel,
}: {
  visual: NPCShipVisual;
  shipType: string;
  detailLevel: NPCShipDetailLevel;
}) {
  const jong = shipType === 'Jong';
  const hw = jong ? 2.15 : 1.2;
  const hl = jong ? 5.2 : 4.6;
  return (
    <group scale={visual.scale}>
      <mesh position={[0, 0.42, -0.2]} castShadow receiveShadow>
        <boxGeometry args={[hw, 0.72, hl * 0.75]} />
        <meshStandardMaterial color={visual.hullColor} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.42, hl * 0.3]} rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <coneGeometry args={[hw * 0.38, hl * 0.35, 4]} />
        <meshStandardMaterial color={visual.hullColor} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.85, hl * 0.42]} rotation={[-0.3, 0, 0]} castShadow>
        <boxGeometry args={[hw * 0.35, 0.5, 0.6]} />
        <meshStandardMaterial color={mutedHullTrim(visual.trimColor)} roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.52, -hl * 0.42]} rotation={[-Math.PI / 2, 0, 0]} castShadow>
        <coneGeometry args={[hw * 0.45, hl * 0.18, 4]} />
        <meshStandardMaterial color={visual.hullColor} roughness={0.9} />
      </mesh>
      {visual.hasOutrigger && (
        <>
          {[-1.45, 1.45].map((x) => (
            <mesh key={x} position={[x, 0.22, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.08, 0.08, 4.1, 8]} />
              <meshStandardMaterial color={mutedHullTrim(visual.trimColor)} roughness={0.9} />
            </mesh>
          ))}
          {[-1.2, 0.6].map((z) => (
            <mesh key={z} position={[0, 0.48, z]} rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[0.035, 0.035, 3.1, 6]} />
              <meshStandardMaterial color="#3e2723" roughness={0.9} />
            </mesh>
          ))}
        </>
      )}
      <mesh position={[0, 2.15, 0.35]} rotation={[0.06, 0, 0.04]} castShadow>
        <cylinderGeometry args={[0.07, 0.09, 3.2, 7]} />
        <meshStandardMaterial color="#3e2723" />
      </mesh>
      <group position={[0.35, 2.7, 0.45]} rotation={[0, 0, -0.25]}>
        <LugSail color={visual.sailColor} width={2.05} height={1.45} />
      </group>
      {jong && (
        <LateenSail visual={visual} position={[-0.35, 2.25, -1.25]} scale={0.72} angle={0.36} />
      )}
      <SternFlag visual={visual} />
    </group>
  );
}

import type { NPCShipVisual } from '../../utils/npcShipGenerator';
import type { NPCShipDetailLevel } from './detailLevel';
import { showNpcShipDetail } from './detailLevel';
import { CannonPorts, mutedHullTrim, SquareSail, SternFlag } from './NPCShipParts';

function BowEyes() {
  return (
    <>
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 1.31, 0.78, 1.92]} rotation={[0, side > 0 ? Math.PI / 2 : -Math.PI / 2, 0]}>
          <mesh>
            <circleGeometry args={[0.18, 14]} />
            <meshStandardMaterial color="#f2ead2" roughness={0.8} />
          </mesh>
          <mesh position={[0, 0, 0.01]}>
            <circleGeometry args={[0.08, 12]} />
            <meshStandardMaterial color="#111111" roughness={0.8} />
          </mesh>
        </group>
      ))}
    </>
  );
}

function SternRudder({ visual }: { visual: NPCShipVisual }) {
  return (
    <group position={[0, 0.34, -2.72]}>
      <mesh>
        <boxGeometry args={[0.42, 0.9, 0.08]} />
        <meshStandardMaterial color={visual.hullColor} roughness={0.95} />
      </mesh>
      {[0.24, -0.02, -0.28].map((y) => (
        <mesh key={y} position={[0, y, -0.05]}>
          <boxGeometry args={[0.32, 0.035, 0.04]} />
          <meshStandardMaterial color={mutedHullTrim(visual.trimColor)} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

export function JunkModel({ visual, detailLevel }: { visual: NPCShipVisual; detailLevel: NPCShipDetailLevel }) {
  const showSmallDetail = showNpcShipDetail(detailLevel, 'near');
  const showMidDetail = showNpcShipDetail(detailLevel, 'mid');
  return (
    <group scale={visual.scale}>
      <mesh position={[0, 0.35, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.55, 0.6, 5.0]} />
        <meshStandardMaterial color={visual.hullColor} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.78, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.25, 0.4, 4.8]} />
        <meshStandardMaterial color={visual.hullColor} roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.25, -2.45]} castShadow receiveShadow>
        <boxGeometry args={[2.35, 1.4, 0.2]} />
        <meshStandardMaterial color={mutedHullTrim(visual.trimColor)} roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.1, -1.85]} castShadow receiveShadow>
        <boxGeometry args={[2.0, 0.7, 0.9]} />
        <meshStandardMaterial color={visual.deckColor} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.92, 2.35]} castShadow receiveShadow>
        <boxGeometry args={[1.9, 0.35, 0.42]} />
        <meshStandardMaterial color={visual.deckColor} roughness={0.9} />
      </mesh>
      {showSmallDetail && <BowEyes />}
      {showMidDetail && <SternRudder visual={visual} />}
      {[-0.85, 0.95].map((z, mastIdx) => (
        <group key={z} position={[0, 0, z]}>
          <mesh position={[0, 2.35, 0]} castShadow>
            <cylinderGeometry args={[0.08, 0.1, 3.5 - mastIdx * 0.25, 7]} />
            <meshStandardMaterial color="#3e2723" />
          </mesh>
          {[-0.55, 0, 0.55].map((y, panelIdx) => (
            <group key={y}>
              <group position={[0.05, 2.6 + y - mastIdx * 0.15, 0]} rotation={[0, 0, 0.05]}>
                <SquareSail
                  color={panelIdx === 1 ? visual.sailColor : visual.sailTrimColor}
                  width={2.15 - panelIdx * 0.18}
                  height={0.38}
                  camber={0.035}
                />
              </group>
              {showMidDetail && (
                <mesh position={[0.05, 2.38 + y - mastIdx * 0.15, 0]} rotation={[0, 0, 0.05]}>
                  <boxGeometry args={[2.2 - panelIdx * 0.16, 0.04, 0.1]} />
                  <meshStandardMaterial color="#5c4a2e" roughness={0.8} />
                </mesh>
              )}
            </group>
          ))}
        </group>
      ))}
      {showMidDetail && <CannonPorts visual={visual} zPositions={[-1.2, 0, 1.2]} />}
      <SternFlag visual={visual} />
    </group>
  );
}

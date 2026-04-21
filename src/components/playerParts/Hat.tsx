// Player hat / headwear renderer. One switch over HatType, returns a small
// group of primitives positioned to sit on top of the head sphere
// (head center at y=0 in this group's local space; head radius ~0.2).
//
// All hats are 3-6 primitives. No textures, no per-frame animation needed
// (the parent head group inherits the breathing/idle motion).

import * as THREE from 'three';
import type { HatType } from '../../utils/playerAppearance';

interface HatProps {
  type: HatType;
  color: string;
  accent: string;
  castShadow?: boolean;
}

export function Hat({ type, color, accent, castShadow = true }: HatProps) {
  switch (type) {
    case 'none':
      return null;

    case 'monmouth':
      // Knit cap — short cylinder with a domed top, sits over the crown.
      return (
        <group position={[0, 0.18, 0]}>
          <mesh castShadow={castShadow}>
            <cylinderGeometry args={[0.21, 0.22, 0.14, 12]} />
            <meshStandardMaterial color={color} roughness={0.95} />
          </mesh>
          <mesh position={[0, 0.06, 0]} castShadow={castShadow}>
            <sphereGeometry args={[0.21, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color={color} roughness={0.95} />
          </mesh>
        </group>
      );

    case 'kerchief':
      // Tied head-cloth, low crown
      return (
        <group position={[0, 0.16, 0]}>
          <mesh castShadow={castShadow}>
            <sphereGeometry args={[0.215, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.2]} />
            <meshStandardMaterial color={color} roughness={0.9} />
          </mesh>
          {/* Knot at back */}
          <mesh position={[0, -0.02, -0.18]} castShadow={castShadow}>
            <sphereGeometry args={[0.05, 6, 6]} />
            <meshStandardMaterial color={color} roughness={0.9} />
          </mesh>
        </group>
      );

    case 'felt_wide':
      // Wide-brimmed felt hat, no feather. Disc brim + low cone crown.
      return (
        <group position={[0, 0.18, 0]}>
          {/* Brim — flat disc */}
          <mesh position={[0, 0, 0]} castShadow={castShadow}>
            <cylinderGeometry args={[0.34, 0.34, 0.025, 18]} />
            <meshStandardMaterial color={color} roughness={0.85} />
          </mesh>
          {/* Crown — short cylinder */}
          <mesh position={[0, 0.08, 0]} castShadow={castShadow}>
            <cylinderGeometry args={[0.22, 0.24, 0.14, 14]} />
            <meshStandardMaterial color={color} roughness={0.85} />
          </mesh>
          {/* Hatband */}
          <mesh position={[0, 0.025, 0]} castShadow={castShadow}>
            <cylinderGeometry args={[0.245, 0.245, 0.03, 14]} />
            <meshStandardMaterial color={accent === '#000000' ? '#1a1a1a' : accent} roughness={0.9} />
          </mesh>
        </group>
      );

    case 'felt_plumed':
      // Wide felt + plume. Reuses felt_wide structure.
      return (
        <group position={[0, 0.18, 0]}>
          <mesh position={[0, 0, 0]} castShadow={castShadow}>
            <cylinderGeometry args={[0.36, 0.36, 0.025, 18]} />
            <meshStandardMaterial color={color} roughness={0.85} />
          </mesh>
          <mesh position={[0, 0.09, 0]} castShadow={castShadow}>
            <cylinderGeometry args={[0.22, 0.25, 0.16, 14]} />
            <meshStandardMaterial color={color} roughness={0.85} />
          </mesh>
          {/* Hatband */}
          <mesh position={[0, 0.025, 0]} castShadow={castShadow}>
            <cylinderGeometry args={[0.255, 0.255, 0.03, 14]} />
            <meshStandardMaterial color="#3a2a1a" roughness={0.9} />
          </mesh>
          {/* Plume — angled cone leaning back-left */}
          <mesh position={[-0.18, 0.18, -0.05]} rotation={[0.4, 0, -0.7]} castShadow={castShadow}>
            <coneGeometry args={[0.04, 0.34, 5]} />
            <meshStandardMaterial color={accent} roughness={0.7} />
          </mesh>
          {/* Plume tip — second smaller cone for a flowing look */}
          <mesh position={[-0.27, 0.32, -0.08]} rotation={[0.6, 0, -0.9]} castShadow={castShadow}>
            <coneGeometry args={[0.025, 0.2, 5]} />
            <meshStandardMaterial color={accent} roughness={0.7} />
          </mesh>
        </group>
      );

    case 'turban_arab': {
      // Wrapped turban — torus + sphere top. Slightly wider than the head.
      return (
        <group position={[0, 0.16, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} castShadow={castShadow}>
            <torusGeometry args={[0.22, 0.075, 8, 18]} />
            <meshStandardMaterial color={color} roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.06, 0]} castShadow={castShadow}>
            <sphereGeometry args={[0.18, 12, 8]} />
            <meshStandardMaterial color={color} roughness={0.9} />
          </mesh>
        </group>
      );
    }

    case 'turban_arab_jeweled': {
      // Larger wrapped turban with a forehead jewel.
      return (
        <group position={[0, 0.18, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} castShadow={castShadow}>
            <torusGeometry args={[0.24, 0.085, 8, 18]} />
            <meshStandardMaterial color={color} roughness={0.85} />
          </mesh>
          {/* Upper wrap */}
          <mesh position={[0, 0.07, 0]} rotation={[Math.PI / 2, 0, 0.3]} castShadow={castShadow}>
            <torusGeometry args={[0.18, 0.06, 6, 14]} />
            <meshStandardMaterial color={color} roughness={0.85} />
          </mesh>
          <mesh position={[0, 0.13, 0]} castShadow={castShadow}>
            <sphereGeometry args={[0.14, 10, 7]} />
            <meshStandardMaterial color={color} roughness={0.85} />
          </mesh>
          {/* Jewel (forehead, slightly raised) */}
          <mesh position={[0, 0.04, 0.2]} castShadow={castShadow}>
            <octahedronGeometry args={[0.035, 0]} />
            <meshStandardMaterial color={accent} metalness={0.6} roughness={0.2} emissive={accent} emissiveIntensity={0.3} />
          </mesh>
        </group>
      );
    }

    case 'turban_mughal': {
      // Mughal-style folded turban: stacked tori at slight offsets, taller.
      return (
        <group position={[0, 0.16, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} castShadow={castShadow}>
            <torusGeometry args={[0.23, 0.07, 8, 18]} />
            <meshStandardMaterial color={color} roughness={0.85} />
          </mesh>
          <mesh position={[0, 0.06, 0.02]} rotation={[Math.PI / 2, 0, 0.4]} castShadow={castShadow}>
            <torusGeometry args={[0.2, 0.065, 8, 16]} />
            <meshStandardMaterial color={color} roughness={0.85} />
          </mesh>
          <mesh position={[0, 0.12, -0.02]} rotation={[Math.PI / 2, 0, -0.3]} castShadow={castShadow}>
            <torusGeometry args={[0.16, 0.06, 8, 14]} />
            <meshStandardMaterial color={color} roughness={0.85} />
          </mesh>
          {/* Crown / sarpech — small upright element at front */}
          <mesh position={[0, 0.16, 0.14]} castShadow={castShadow}>
            <coneGeometry args={[0.025, 0.1, 5]} />
            <meshStandardMaterial color="#c8a040" metalness={0.7} roughness={0.3} />
          </mesh>
        </group>
      );
    }

    case 'kufi':
      // Short flat-topped cap.
      return (
        <group position={[0, 0.18, 0]}>
          <mesh castShadow={castShadow}>
            <cylinderGeometry args={[0.21, 0.22, 0.13, 14]} />
            <meshStandardMaterial color={color} roughness={0.9} />
          </mesh>
        </group>
      );

    case 'kufi_band':
      // Kufi with embroidered contrasting band.
      return (
        <group position={[0, 0.18, 0]}>
          <mesh castShadow={castShadow}>
            <cylinderGeometry args={[0.21, 0.22, 0.13, 14]} />
            <meshStandardMaterial color={color} roughness={0.9} />
          </mesh>
          <mesh position={[0, -0.04, 0]} castShadow={castShadow}>
            <cylinderGeometry args={[0.225, 0.225, 0.035, 14]} />
            <meshStandardMaterial color={accent} roughness={0.8} metalness={0.3} />
          </mesh>
        </group>
      );

    case 'songkok':
      // Truncated cone, dark. Slightly wider at base.
      return (
        <group position={[0, 0.18, 0]}>
          <mesh castShadow={castShadow}>
            <cylinderGeometry args={[0.18, 0.22, 0.16, 14]} />
            <meshStandardMaterial color={color} roughness={0.95} />
          </mesh>
          {/* Subtle top disc */}
          <mesh position={[0, 0.085, 0]} castShadow={castShadow}>
            <cylinderGeometry args={[0.18, 0.18, 0.005, 14]} />
            <meshStandardMaterial color={color} roughness={0.95} />
          </mesh>
        </group>
      );

    case 'conical_bamboo':
      // Wide-brim conical hat — characteristic E. Asian sailor headwear.
      return (
        <group position={[0, 0.16, 0]}>
          <mesh castShadow={castShadow}>
            <coneGeometry args={[0.42, 0.22, 14]} />
            <meshStandardMaterial color={color} roughness={0.95} />
          </mesh>
          {/* Chin string anchor — tiny dark band on rim */}
          <mesh position={[0, -0.07, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow={castShadow}>
            <torusGeometry args={[0.4, 0.005, 4, 16]} />
            <meshStandardMaterial color="#2a1a0e" roughness={0.9} />
          </mesh>
        </group>
      );

    case 'east_asian_cap':
      // Small black cap (futou-derived), low and squared.
      return (
        <group position={[0, 0.18, 0]}>
          <mesh castShadow={castShadow}>
            <boxGeometry args={[0.36, 0.12, 0.32]} />
            <meshStandardMaterial color={color} roughness={0.85} />
          </mesh>
          {/* Top ridge */}
          <mesh position={[0, 0.08, 0]} castShadow={castShadow}>
            <boxGeometry args={[0.34, 0.04, 0.3]} />
            <meshStandardMaterial color={color} roughness={0.85} />
          </mesh>
        </group>
      );

    default:
      return null;
  }
}

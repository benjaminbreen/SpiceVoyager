import { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { useGameStore } from '../store/gameStore';
import { getCrabData, getCollectedCrabs, getFishShoalData } from './World';

/**
 * Shift+drag selection: draws a rectangle, then on release finds all
 * interactive entities whose 3D positions project into that screen rect.
 * Fires a single "Nearby" grand toast listing up to 8 items.
 *
 * Rendered as an R3F component (needs useThree for camera access)
 * but draws the selection rect via a portal to a DOM overlay.
 */

interface SelectRect {
  x1: number; y1: number;
  x2: number; y2: number;
}

// Gathers all scannable entities from game state + module-level data
function gatherEntities(): { label: string; pos: THREE.Vector3 }[] {
  const state = useGameStore.getState();
  const items: { label: string; pos: THREE.Vector3 }[] = [];

  // NPC ships
  for (const ship of state.npcShips) {
    items.push({
      label: `${ship.shipType} (${ship.flag})`,
      pos: new THREE.Vector3(ship.position[0], ship.position[1], ship.position[2]),
    });
  }

  // Ocean encounters
  for (const enc of state.oceanEncounters) {
    if (enc.collected) continue;
    const name = enc.type === 'whale' ? 'Whale' : enc.type === 'turtle' ? 'Sea Turtle' : 'Wreckage';
    items.push({
      label: name,
      pos: new THREE.Vector3(enc.position[0], enc.position[1], enc.position[2]),
    });
  }

  // Crabs (deduplicated — just show count in area, not each individual)
  const crabs = getCrabData();
  const collected = getCollectedCrabs();
  const crabPositions: THREE.Vector3[] = [];
  for (let i = 0; i < crabs.length; i++) {
    if (collected.has(i)) continue;
    crabPositions.push(new THREE.Vector3(crabs[i].position[0], crabs[i].position[1], crabs[i].position[2]));
  }
  // Group crabs into clusters so we don't list 50 individual crabs
  // Just add each crab position — the 8-item cap handles the rest
  for (const p of crabPositions) {
    items.push({ label: 'Shore Crab', pos: p });
  }

  // Fish shoals (one entry per shoal, not per fish)
  const shoals = getFishShoalData();
  for (const shoal of shoals) {
    items.push({
      label: `${shoal.fishType.name} (${shoal.count})`,
      pos: new THREE.Vector3(shoal.center[0], shoal.center[1], shoal.center[2]),
    });
  }

  return items;
}

export function ShiftSelectOverlay() {
  const { camera, gl } = useThree();
  const dragging = useRef(false);
  const rect = useRef<SelectRect | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  // Create/find the DOM overlay for the selection rectangle
  useEffect(() => {
    let overlay = document.getElementById('shift-select-overlay') as HTMLDivElement | null;
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'shift-select-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:45;';
      document.body.appendChild(overlay);
    }
    overlayRef.current = overlay;
    return () => {
      overlay?.remove();
    };
  }, []);

  const drawRect = useCallback((r: SelectRect | null) => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    if (!r) {
      overlay.innerHTML = '';
      return;
    }
    const left = Math.min(r.x1, r.x2);
    const top = Math.min(r.y1, r.y2);
    const w = Math.abs(r.x2 - r.x1);
    const h = Math.abs(r.y2 - r.y1);
    overlay.innerHTML = `<div style="
      position:absolute;
      left:${left}px;top:${top}px;width:${w}px;height:${h}px;
      border:1px solid rgba(201,168,76,0.6);
      background:rgba(201,168,76,0.08);
      pointer-events:none;
    "></div>`;
  }, []);

  useEffect(() => {
    const canvas = gl.domElement;

    const onDown = (e: MouseEvent) => {
      if (!e.shiftKey) return;
      dragging.current = true;
      rect.current = { x1: e.clientX, y1: e.clientY, x2: e.clientX, y2: e.clientY };
    };

    const onMove = (e: MouseEvent) => {
      if (!dragging.current || !rect.current) return;
      rect.current.x2 = e.clientX;
      rect.current.y2 = e.clientY;
      drawRect(rect.current);
    };

    const onUp = (e: MouseEvent) => {
      if (!dragging.current || !rect.current) {
        dragging.current = false;
        return;
      }
      dragging.current = false;
      const r = rect.current;
      rect.current = null;
      drawRect(null);

      // Ignore tiny drags (accidental shift-clicks)
      if (Math.abs(r.x2 - r.x1) < 10 && Math.abs(r.y2 - r.y1) < 10) return;

      // Normalize rect
      const left = Math.min(r.x1, r.x2);
      const right = Math.max(r.x1, r.x2);
      const top = Math.min(r.y1, r.y2);
      const bottom = Math.max(r.y1, r.y2);

      // Project entity positions to screen coords
      const entities = gatherEntities();
      const canvasRect = canvas.getBoundingClientRect();
      const tempVec = new THREE.Vector3();

      // Count hits per label type
      const hitCounts = new Map<string, number>();
      for (const ent of entities) {
        tempVec.copy(ent.pos);
        tempVec.project(camera);
        const sx = (tempVec.x * 0.5 + 0.5) * canvasRect.width + canvasRect.left;
        const sy = (-tempVec.y * 0.5 + 0.5) * canvasRect.height + canvasRect.top;
        if (tempVec.z > 1) continue;
        if (sx >= left && sx <= right && sy >= top && sy <= bottom) {
          hitCounts.set(ent.label, (hitCounts.get(ent.label) || 0) + 1);
        }
      }

      // Aggregate — "Shore Crab x5" instead of listing 5 times
      const found: string[] = [];
      for (const [label, count] of hitCounts) {
        if (found.length >= 8) break;
        found.push(count > 1 ? `${label} \u00d7${count}` : label);
      }

      if (found.length > 0) {
        const { addNotification } = useGameStore.getState();
        const totalCount = [...hitCounts.values()].reduce((a, b) => a + b, 0);
        const subtitle = found.map(f => `\u00b7 ${f}`).join('   ');
        addNotification(
          `${totalCount} Sighted`,
          'info',
          { size: 'grand', subtitle },
        );
      }
    };

    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      canvas.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [camera, gl, drawRect]);

  return null;
}

import { PORT_FACTION, PORT_CULTURAL_REGION, useGameStore } from '../../store/gameStore';
import type { CulturalRegion, Nationality } from '../../store/gameStore';
import { applyShrineVariant } from '../../utils/shrineVariant';
import { AWNING_COLORS, pickVariant, resolveStyle } from './buildingStyles';
import type { HouseVariant } from './buildingStyles';
import type { Part, SmokeSpot, TorchSpot } from './cityTypes';
import { BASE_COLORS, mulberry32, varyColor } from './cityRandom';
import { CityPartBuilder } from './cityPartBuilder';
import { addReligiousPrecinct } from './religiousPrecincts';

type PortsProp = ReturnType<typeof useGameStore.getState>['ports'];

const HUMAN_DOOR_H = 1.05;
const HUMAN_DOOR_W = 0.56;
const WINDOW_H = 0.34;
const WINDOW_W = 0.34;
const PLINTH_H = 0.18;

export function buildCityParts(ports: PortsProp) {
    const allParts: Part[] = [];
    const torches: TorchSpot[] = [];
    const smokeSpots: SmokeSpot[] = [];

    ports.forEach(port => {
      port.buildings.forEach((b, bi) => {
        let [w, h, d] = b.scale;
        const [x, y, z] = b.position;
        const rot = b.rotation;
        const c = port.culture;
        const rng = mulberry32(bi * 7919 + (x * 1000 | 0) + (z * 31 | 0));

        // Phase B form metadata: taller multi-story, setback (shrinks
        // footprint), and waterside warehouse stretch. Big-city urban-core
        // houses already get bumped footprints at generation time (see
        // cityGenerator's houseBaseSizeForCell), so the render-time growth
        // here is modest — just enough to stop 3-4 story buildings looking
        // like towers on a cottage plot.
        const stories = b.stories ?? 1;
        if (stories > 1) {
          const northernUrbanCore =
            (port.buildingStyle === 'dutch-brick' || port.buildingStyle === 'english-tudor') &&
            b.district === 'urban-core' &&
            (b.type === 'house' || b.type === 'estate');
          h *= 1 + (stories - 1) * (northernUrbanCore ? 0.42 : 0.55);
          const footprintGrowth = 1 + (stories - 1) * (northernUrbanCore ? 0.30 : 0.12);
          w *= footprintGrowth;
          d *= footprintGrowth;
        }

        const setback = b.setback ?? 0;
        if (setback > 0.35 && (b.type === 'house' || b.type === 'estate')) {
          const footprintScale = 1 - (setback - 0.35) * 0.4;
          w *= footprintScale;
          d *= footprintScale;
        }

        if (b.type === 'warehouse' && b.district === 'waterside') {
          // Waterside warehouses read as long low sheds along the quay.
          const longAxis = w >= d ? 0 : 1;
          if (longAxis === 0) { w *= 1.5; d *= 0.95; }
          else                { w *= 0.95; d *= 1.5; }
        }

        const shakeCenter: [number, number, number] = [x, y + Math.max(h * 0.5, 1.2), z];
        const builder = new CityPartBuilder({
          parts: allParts,
          torches,
          buildingId: b.id,
          origin: [x, y, z],
          rotation: rot,
          shakeCenter,
          rng,
        });
        const addPart = builder.addPart;
        const addTorch = builder.addTorch;
        const scaleLandmark = builder.scalePartsSince;
        const addGroundSkirt = (
          sx: number,
          sz: number,
          color: [number, number, number],
          mat: Part['mat'] = 'mud',
          thickness = 0.16,
        ) => {
          addPart('box', mat, 0, -0.06, 0, sx, thickness, sz, color, true);
        };
        const addCrateStack = (lx: number, lz: number, size = 1) => {
          const wood = varyColor(BASE_COLORS.wood, rng, 0.12);
          addPart('box', 'wood', lx, 0.28 * size, lz, 0.55 * size, 0.55 * size, 0.55 * size, wood);
          addPart('box', 'wood', lx + 0.38 * size, 0.20 * size, lz + 0.18 * size, 0.42 * size, 0.40 * size, 0.42 * size, varyColor(wood, rng, 0.08));
          if (rng() < 0.5) addPart('box', 'straw', lx - 0.24 * size, 0.22 * size, lz + 0.36 * size, 0.45 * size, 0.35 * size, 0.40 * size, varyColor([0.72, 0.60, 0.34], rng, 0.08));
        };
        const addRopeCoil = (lx: number, lz: number, radius = 0.34) => {
          const rope = varyColor([0.55, 0.45, 0.28], rng, 0.06);
          addPart('cylinder', 'straw', lx, 0.12, lz, radius, 0.10, radius, rope);
          addPart('cylinder', 'dark', lx, 0.18, lz, radius * 0.58, 0.06, radius * 0.58, [0.18, 0.14, 0.09]);
        };
        const addWorkRack = (lx: number, lz: number, width = 1.4) => {
          const wood = varyColor([0.35, 0.24, 0.14], rng, 0.06);
          addPart('cylinder', 'wood', lx - width * 0.45, 0.58, lz, 0.055, 1.16, 0.055, wood);
          addPart('cylinder', 'wood', lx + width * 0.45, 0.58, lz, 0.055, 1.16, 0.055, wood);
          addPart('box', 'wood', lx, 1.08, lz, width, 0.08, 0.08, wood);
          for (let i = 0; i < 3; i++) {
            addPart('box', 'straw', lx - width * 0.28 + i * width * 0.28, 0.78, lz + 0.04, width * 0.16, 0.45, 0.05, varyColor([0.62, 0.44, 0.24], rng, 0.08));
          }
        };
        const addCircularMudWall = (
          radius: number,
          y: number,
          height: number,
          color: [number, number, number],
          gateAngle = Math.PI / 2,
        ) => {
          const segments = 12;
          const arcLen = (Math.PI * 2 * radius) / segments;
          for (let i = 0; i < segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            const distFromGate = Math.abs(Math.atan2(Math.sin(angle - gateAngle), Math.cos(angle - gateAngle)));
            if (distFromGate < 0.34) continue;
            addPart(
              'box',
              'mud',
              Math.cos(angle) * radius,
              y,
              Math.sin(angle) * radius,
              arcLen * 0.72,
              height,
              0.16,
              varyColor(color, rng, 0.045),
              false,
              Math.PI / 2 - angle,
            );
          }
        };
        const localToWorld = (lx: number, ly: number, lz: number): [number, number, number] => {
          const rx = lx * Math.cos(rot) - lz * Math.sin(rot);
          const rz = lx * Math.sin(rot) + lz * Math.cos(rot);
          return [x + rx, y + ly, z + rz];
        };
        const LM_SCALE = 1.3;

        // ── Dedicated landmark buildings ────────────────────────────────
        // type === 'landmark' carries a required landmarkId; draw that
        // landmark's geometry at its own position and skip the generic
        // per-type render below. Each landmark's placement rule lives in
        // cityGenerator.ts (LANDMARK_RULES); the renderer's job is only
        // to draw the shape around local origin (0,0,0) — rotation + world
        // translation are applied by addPart.
        if (b.type === 'landmark' && b.landmarkId) {
          const lm = b.landmarkId;
          const _lmStart = allParts.length;

          if (lm === 'tower-of-london') {
            const stoneColor = varyColor([0.88, 0.86, 0.80], rng, 0.04);
            const keepW = 6;
            const keepH = 10;
            addPart('box', 'stone', 0, 0.6, 0, keepW + 4, 1.2, keepW + 4, varyColor([0.78, 0.76, 0.70], rng, 0.04));
            addPart('box', 'white', 0, keepH / 2 + 1.2, 0, keepW, keepH, keepW, stoneColor);
            const turretH = keepH + 3;
            const turretR = 0.85;
            for (const [cx, cz] of [
              [ keepW / 2 - turretR * 0.4,  keepW / 2 - turretR * 0.4],
              [-keepW / 2 + turretR * 0.4,  keepW / 2 - turretR * 0.4],
              [ keepW / 2 - turretR * 0.4, -keepW / 2 + turretR * 0.4],
              [-keepW / 2 + turretR * 0.4, -keepW / 2 + turretR * 0.4],
            ] as [number, number][]) {
              addPart('cylinder', 'white', cx, turretH / 2 + 1.2, cz, turretR, turretH, turretR, stoneColor);
              addPart('cone', 'stone', cx, turretH + 1.6, cz, turretR + 0.15, 1.1, turretR + 0.15, [0.55, 0.55, 0.58]);
            }
            addPart('box', 'stone', 0, 2.2, keepW / 2 + 1.0, 2.2, 3.4, 0.9, varyColor([0.70, 0.68, 0.62], rng, 0.04));
            addPart('box', 'dark', 0, 1.6, keepW / 2 + 1.5, 1.4, 2.2, 0.2);
            addPart('cylinder', 'wood', 0, keepH + 3.0, 0, 0.1, 3.5, 0.1);
            addPart('box', 'straw', 0.55, keepH + 4.2, 0, 1.1, 0.65, 0.05, [0.85, 0.10, 0.10]);
            addTorch(1.2, 1.2, keepW / 2 + 1.6);
            addTorch(-1.2, 1.2, keepW / 2 + 1.6);
          }

          else if (lm === 'belem-tower') {
            // Torre de Belém — slim 4-tier limestone tower on the waterline.
            const stone = varyColor([0.92, 0.88, 0.78], rng, 0.04);
            addPart('box', 'white', 0, 1.0, 0, 4, 2, 4, stone);
            addPart('box', 'white', 0, 4.0, 0, 2.6, 4, 2.6, stone);
            addPart('box', 'white', 0, 7.5, 0, 2.2, 3, 2.2, stone);
            addPart('box', 'white', 0, 10.0, 0, 1.8, 2, 1.8, stone);
            for (const [cx, cz] of [[1.0, 1.0], [-1.0, 1.0], [1.0, -1.0], [-1.0, -1.0]] as [number, number][]) {
              addPart('cylinder', 'white', cx, 8.5, cz, 0.35, 1.2, 0.35, stone);
              addPart('cone', 'stone', cx, 9.4, cz, 0.45, 0.7, 0.45, [0.60, 0.55, 0.50]);
            }
            addPart('cone', 'stone', 0, 11.5, 0, 0.9, 1.2, 0.9, [0.55, 0.55, 0.55]);
            addPart('box', 'stone', 0, 12.6, 0, 0.10, 0.6, 0.10);
          }

          else if (lm === 'oude-kerk-spire') {
            // Oude Kerk — squat brick nave with tall thin wooden spire at one end.
            const brick = varyColor([0.55, 0.32, 0.24], rng, 0.05);
            const lead: [number, number, number] = [0.40, 0.42, 0.45];
            addPart('box', 'mud', 0, 2.0, 0, 4, 4, 7, brick);
            addPart('cone', 'stone', 0, 5.2, 0, 2.4, 1.8, 4.0, lead);
            addPart('box', 'mud', 0, 3.5, -4.5, 2.4, 7, 2.4, brick);
            addPart('cone', 'wood', 0, 8.5, -4.5, 1.4, 2.0, 1.4, lead);
            addPart('cylinder', 'wood', 0, 10.5, -4.5, 0.5, 2.0, 0.5, lead);
            addPart('cone', 'wood', 0, 12.5, -4.5, 0.7, 1.6, 0.7, lead);
            addPart('cone', 'wood', 0, 14.8, -4.5, 0.25, 3.0, 0.25, lead);
          }

          else if (lm === 'giralda-tower') {
            // Seville — Almohad minaret + Renaissance belfry + Giraldillo.
            const almohad = varyColor([0.82, 0.62, 0.42], rng, 0.04);
            const renaissance = varyColor([0.92, 0.88, 0.78], rng, 0.03);
            const shaftW = 3.2, shaftH = 16;
            addPart('box', 'white', 0, 0.6, 0, shaftW + 0.4, 1.2, shaftW + 0.4, almohad);
            addPart('box', 'white', 0, shaftH / 2 + 1.2, 0, shaftW, shaftH, shaftW, almohad);
            addPart('box', 'white', 0, shaftH + 1.3, 0, shaftW + 0.2, 0.3, shaftW + 0.2, [0.55, 0.45, 0.30]);
            addPart('box', 'white', 0, shaftH + 2.8, 0, shaftW - 0.5, 2.4, shaftW - 0.5, renaissance);
            addPart('box', 'white', 0, shaftH + 4.6, 0, shaftW - 1.0, 1.2, shaftW - 1.0, renaissance);
            addPart('cylinder', 'white', 0, shaftH + 5.8, 0, (shaftW - 1.4) * 0.5, 1.2, (shaftW - 1.4) * 0.5, renaissance);
            addPart('cone', 'stone', 0, shaftH + 7.0, 0, (shaftW - 1.6) * 0.5, 1.6, (shaftW - 1.6) * 0.5, [0.60, 0.55, 0.45]);
            addPart('cylinder', 'wood', 0, shaftH + 8.0, 0, 0.08, 1.2, 0.08, [0.75, 0.65, 0.30]);
            addPart('box', 'straw', 0, shaftH + 8.6, 0, 0.4, 0.4, 0.05, [0.85, 0.75, 0.35]);
          }

          else if (lm === 'bom-jesus-basilica') {
            // Goa — Basilica of Bom Jesus. Jesuit single-nave church.
            const wash = varyColor([0.94, 0.92, 0.86], rng, 0.04);
            const tile: [number, number, number] = [0.52, 0.28, 0.22];
            addPart('box', 'white', 0, 3.0, 0, 4, 6, 9, wash);
            addPart('cone', 'terracotta', 0, 7.0, 0, 2.2, 1.6, 5.0, tile);
            addPart('box', 'white', 0, 4.5, 4.5, 5, 9, 0.4, wash);
            addPart('box', 'white', 0, 9.2, 4.5, 3.4, 0.5, 0.4, wash);
            addPart('cone', 'terracotta', 0, 10.0, 4.5, 1.8, 1.0, 0.4, tile);
            addPart('box', 'white', 0, 10.8, 4.5, 1.8, 0.4, 0.4, wash);
            addPart('cone', 'terracotta', 0, 11.4, 4.5, 0.9, 0.8, 0.4, tile);
            addPart('box', 'dark', 0, 1.8, 4.75, 1.3, 3.2, 0.2);
            addPart('box', 'white', 3.0, 4.0, 3.0, 2, 8, 2, wash);
            addPart('cone', 'terracotta', 3.0, 8.8, 3.0, 1.3, 1.4, 1.3, tile);
            addPart('box', 'stone', 3.0, 10.0, 3.0, 0.10, 0.7, 0.10);
            addPart('box', 'stone', 3.0, 10.1, 3.0, 0.5, 0.10, 0.10);
          }

          else if (lm === 'fort-jesus') {
            // Mombasa — Portuguese star fort with angular bastions, coral-stone.
            const wall = varyColor([0.88, 0.84, 0.74], rng, 0.04);
            const fortW = 7, fortH = 5;
            addPart('box', 'white', 0, fortH / 2, 0, fortW, fortH, fortW, wall);
            const bRad = 1.6;
            for (const [cx, cz] of [
              [ fortW / 2,  fortW / 2], [-fortW / 2,  fortW / 2],
              [ fortW / 2, -fortW / 2], [-fortW / 2, -fortW / 2],
            ] as [number, number][]) {
              addPart('cylinder', 'white', cx, fortH / 2 + 0.5, cz, bRad, fortH + 1, bRad, wall);
              addPart('cone', 'stone', cx, fortH + 1.4, cz, bRad + 0.1, 0.6, bRad + 0.1, [0.55, 0.55, 0.55]);
            }
            addPart('box', 'dark', 0, fortH * 0.35, fortW / 2 + 0.05, 1.6, fortH * 0.55, 0.15);
            addPart('cylinder', 'wood', fortW / 2, fortH + 4, fortW / 2, 0.06, 3, 0.06);
            addPart('box', 'straw', fortW / 2 + 0.45, fortH + 5, fortW / 2, 0.8, 0.5, 0.05, [0.85, 0.15, 0.15]);
          }

          else if (lm === 'calicut-gopuram') {
            // Calicut — Kerala Hindu temple: copper-green tiered roofs + flag mast.
            const laterite = varyColor([0.78, 0.55, 0.38], rng, 0.04);
            const teak = varyColor([0.45, 0.30, 0.20], rng, 0.05);
            const copper: [number, number, number] = [0.32, 0.58, 0.52];
            const brass: [number, number, number] = [0.82, 0.68, 0.28];
            addPart('box', 'mud', 0, 0.4, 0, 6, 0.8, 6, laterite);
            addPart('box', 'mud', 0, 1.1, 0, 5, 0.6, 5, laterite);
            addPart('box', 'wood', 0, 2.5, 0, 4, 2, 4, teak);
            addPart('cone', 'wood', 0, 4.3, 0, 3.2, 1.4, 3.2, copper);
            addPart('box', 'wood', 0, 5.3, 0, 2.4, 0.8, 2.4, teak);
            addPart('cone', 'wood', 0, 6.3, 0, 2.0, 1.0, 2.0, copper);
            addPart('cylinder', 'wood', 0, 7.1, 0, 0.15, 0.6, 0.15, brass);
            addPart('cone', 'wood', 0, 7.7, 0, 0.3, 0.5, 0.3, brass);
            addPart('cylinder', 'wood', 3.6, 3.5, 0, 0.12, 7, 0.12, brass);
            addPart('cone', 'wood', 3.6, 7.2, 0, 0.22, 0.6, 0.22, brass);
          }

          else if (lm === 'al-shadhili-mosque') {
            // Mocha — Sufi shrine of al-Shadhili.
            const wash = varyColor([0.94, 0.92, 0.86], rng, 0.04);
            addPart('box', 'white', 0, 1.5, 0, 1.6, 3, 1.6, wash);
            addPart('cylinder', 'white', 0, 6.5, 0, 0.6, 7, 0.6, wash);
            addPart('cylinder', 'white', 0, 10.2, 0, 0.85, 0.4, 0.85, wash);
            addPart('cylinder', 'white', 0, 11.0, 0, 0.5, 1.0, 0.5, wash);
            addPart('sphere', 'white', 0, 12.0, 0, 0.55, 0.9, 0.55, wash);
            addPart('cone', 'straw', 0, 13.0, 0, 0.12, 0.6, 0.12, [0.85, 0.75, 0.2]);
            addPart('box', 'white', 2.5, 1.5, 0, 4, 3, 4, wash);
            addPart('dome', 'white', 2.5, 3.0, 0, 1.6, 1.6, 1.6, wash);
          }

          else if (lm === 'grand-mosque-tiered') {
            // Bantam — Mesjid Agung with five Javanese stacked roofs.
            const wall = varyColor([0.86, 0.78, 0.62], rng, 0.04);
            const tile: [number, number, number] = [0.30, 0.22, 0.18];
            addPart('box', 'white', 0, 2, 0, 6, 4, 6, wall);
            for (const [yc, hh, hw, hd] of [
              [4.6, 0.5, 4.0, 4.0],
              [5.6, 0.45, 3.3, 3.3],
              [6.5, 0.4, 2.6, 2.6],
              [7.3, 0.35, 1.9, 1.9],
              [8.0, 0.3, 1.3, 1.3],
            ] as [number, number, number, number][]) {
              addPart('cone', 'wood', 0, yc, 0, hw, hh * 2, hd, tile);
            }
            addPart('cylinder', 'wood', 0, 8.5, 0, 0.15, 0.5, 0.15, [0.55, 0.45, 0.30]);
            addPart('box', 'white', 0, 0.4, 4.5, 6, 0.8, 0.3, wall);
            addPart('box', 'white', 0, 0.4, -4.5, 6, 0.8, 0.3, wall);
          }

          else if (lm === 'diu-fortress') {
            // Diu — Portuguese sea-fortress, long coastal wall + four bastions.
            const wall = varyColor([0.88, 0.84, 0.72], rng, 0.04);
            const wallLen = 14, wallH = 4;
            addPart('box', 'white', 0, wallH / 2, 0, 3, wallH, wallLen, wall);
            for (const bz of [-5.0, -1.7, 1.7, 5.0]) {
              addPart('cylinder', 'white', 1.5, wallH / 2 + 0.3, bz, 1.6, wallH + 0.6, 1.6, wall);
              addPart('cone', 'stone', 1.5, wallH + 0.9, bz, 1.7, 0.5, 1.7, [0.55, 0.55, 0.55]);
            }
            addPart('box', 'white', -0.5, wallH + 1.5, 0, 3.5, wallH, 3.5, wall);
            addPart('cone', 'stone', -0.5, wallH * 2 + 1.9, 0, 2.2, 0.8, 2.2, [0.60, 0.58, 0.54]);
            addPart('box', 'dark', 1.5, wallH * 0.3, 0, 0.2, wallH * 0.5, 1.6);
            addPart('cylinder', 'wood', -0.5, wallH * 2 + 3.5, 0, 0.08, 3, 0.08);
            addPart('box', 'straw', -0.05, wallH * 2 + 4.5, 0, 0.9, 0.6, 0.05, [0.85, 0.15, 0.15]);
          }

          else if (lm === 'elmina-castle') {
            // São Jorge da Mina — whitewashed square castle on the headland.
            const wash = varyColor([0.92, 0.88, 0.78], rng, 0.04);
            const castleW = 8, wallH = 4;
            addPart('box', 'white', 0, wallH / 2, 0, castleW, wallH, castleW, wash);
            addPart('box', 'white', 0, wallH + 2, -1, castleW - 3, 4, castleW - 3, wash);
            addPart('box', 'white', 0, wallH + 4.4, -1, castleW - 4.2, 0.8, castleW - 4.2, [0.86, 0.82, 0.72]);
            const bRad = 1.1;
            for (const [cx, cz] of [
              [ castleW / 2,  castleW / 2], [-castleW / 2,  castleW / 2],
              [ castleW / 2, -castleW / 2], [-castleW / 2, -castleW / 2],
            ] as [number, number][]) {
              addPart('cylinder', 'white', cx, wallH / 2 + 0.4, cz, bRad, wallH + 0.8, bRad, wash);
              addPart('cone', 'stone', cx, wallH + 1.2, cz, bRad + 0.1, 0.5, bRad + 0.1, [0.55, 0.55, 0.55]);
            }
            addPart('box', 'dark', 0, wallH * 0.35, castleW / 2 + 0.05, 1.6, wallH * 0.55, 0.15);
            addPart('cylinder', 'wood', 0, wallH + 7.0, -1, 0.08, 3, 0.08);
            addPart('box', 'straw', 0.5, wallH + 8.0, -1, 0.9, 0.6, 0.05, [0.85, 0.15, 0.15]);
          }

          else if (lm === 'jesuit-college') {
            // Salvador — Jesuit College, twin bell towers, long two-story block.
            const wash = varyColor([0.93, 0.91, 0.84], rng, 0.04);
            const tile: [number, number, number] = [0.55, 0.28, 0.22];
            addPart('box', 'white', 0, 3.0, 0, 10, 6, 5, wash);
            addPart('box', 'white', 0, 6.5, 2.5, 4, 1.0, 0.3, wash);
            addPart('cone', 'terracotta', 0, 7.5, 2.4, 2.5, 1.0, 0.4, tile);
            addPart('cone', 'terracotta', 0, 7.0, 0, 5.5, 1.6, 3.0, tile);
            for (const tx of [-3.5, 3.5]) {
              addPart('box', 'white', tx, 4.5, 1.8, 1.6, 9, 1.6, wash);
              addPart('box', 'white', tx, 9.6, 1.8, 1.4, 1.4, 1.4, [0.85, 0.82, 0.74]);
              addPart('cone', 'terracotta', tx, 11.0, 1.8, 1.0, 1.6, 1.0, tile);
              addPart('box', 'stone', tx, 12.4, 1.8, 0.10, 0.8, 0.10);
              addPart('box', 'stone', tx, 12.6, 1.8, 0.5, 0.10, 0.10);
            }
            addPart('box', 'dark', 0, 1.5, 2.55, 1.2, 2.6, 0.10);
          }

          else if (lm === 'palacio-inquisicion') {
            // Cartagena — Tribunal of the Holy Office, long balcony, tall portal.
            const wash = varyColor([0.95, 0.93, 0.86], rng, 0.04);
            const tile: [number, number, number] = [0.62, 0.30, 0.24];
            const woodTrim = varyColor([0.30, 0.20, 0.14], rng, 0.05);
            addPart('box', 'white', 0, 2.5, 0, 9, 5, 6, wash);
            addPart('cone', 'terracotta', 0, 5.7, 0, 5.0, 1.4, 3.5, tile);
            addPart('box', 'white', 0, 3.0, 3.05, 2.2, 6, 0.25, [0.84, 0.78, 0.62]);
            addPart('box', 'dark', 0, 2.0, 3.20, 1.4, 4, 0.10);
            addPart('box', 'dark', 0, 5.4, 3.20, 0.9, 0.9, 0.10);
            addPart('box', 'stone', 0, 5.4, 3.30, 0.10, 0.7, 0.05);
            addPart('box', 'stone', 0, 5.4, 3.30, 0.5, 0.10, 0.05);
            addPart('box', 'wood', 0, 3.4, 3.20, 8, 0.2, 0.7, woodTrim);
            for (const bx of [-3.0, -1.5, 0.0, 1.5, 3.0]) {
              if (Math.abs(bx) < 0.6) continue;
              addPart('cylinder', 'wood', bx, 3.9, 3.45, 0.06, 1.0, 0.06, woodTrim);
            }
            addPart('box', 'wood', 0, 4.4, 3.45, 8, 0.08, 0.08, woodTrim);
            addPart('box', 'white', 3.5, 6.5, -0.5, 0.9, 1.6, 0.9, wash);
            addPart('cone', 'terracotta', 3.5, 7.6, -0.5, 0.7, 0.8, 0.7, tile);
          }

          else if (lm === 'colegio-sao-paulo') {
            // Macau — Jesuit Colégio de São Paulo. Dominant feature is the
            // ornate stone facade (what survived as the Ruins of St. Paul's);
            // behind it, a long monastic college block with tile roofs. A
            // small observatory dome nods to the Jesuit astronomers here.
            const stone = varyColor([0.90, 0.86, 0.74], rng, 0.04);
            const tile: [number, number, number] = [0.58, 0.28, 0.22];
            const dark = varyColor([0.22, 0.16, 0.12], rng, 0.04);
            const lead: [number, number, number] = [0.52, 0.54, 0.56];
            // Main college block behind the facade
            addPart('box', 'white', 0, 2.2, -1.5, 7, 4.4, 5, stone);
            addPart('cone', 'terracotta', 0, 5.2, -1.5, 3.8, 1.3, 3.0, tile);
            // Second wing, lower
            addPart('box', 'white', 3.6, 1.6, -1.5, 3, 3.2, 4, stone);
            addPart('cone', 'terracotta', 3.6, 3.8, -1.5, 1.8, 0.9, 2.4, tile);
            // Ornate carved facade — the iconic survivor
            addPart('box', 'white', 0, 3.4, 1.9, 6.4, 6.8, 0.5, stone);
            // Facade tiers (stepped top)
            addPart('box', 'white', 0, 6.9, 1.9, 5.0, 0.4, 0.6, stone);
            addPart('box', 'white', 0, 7.8, 1.9, 3.6, 1.2, 0.55, stone);
            addPart('box', 'white', 0, 9.0, 1.9, 2.2, 0.8, 0.55, stone);
            // Cross crowning the facade
            addPart('box', 'stone', 0, 10.1, 1.9, 0.12, 0.9, 0.12, dark);
            addPart('box', 'stone', 0, 10.3, 1.9, 0.55, 0.12, 0.12, dark);
            // Arched entry portal + windows (dark rectangles on facade)
            addPart('box', 'dark', 0, 1.6, 2.18, 1.3, 3.0, 0.12);
            addPart('box', 'dark', -2.1, 4.5, 2.18, 0.8, 1.4, 0.10);
            addPart('box', 'dark',  2.1, 4.5, 2.18, 0.8, 1.4, 0.10);
            addPart('box', 'dark', -2.1, 6.4, 2.18, 0.6, 0.9, 0.10);
            addPart('box', 'dark',  2.1, 6.4, 2.18, 0.6, 0.9, 0.10);
            // Observatory dome — small lead-covered cap on the rear wing roof
            addPart('dome', 'white', -3.0, 5.0, -1.5, 0.9, 0.9, 0.9, lead);
            addPart('cylinder', 'wood', -3.0, 5.9, -1.5, 0.08, 0.45, 0.08, dark);
          }

          else if (lm === 'english-factory-surat') {
            // Surat — walled English East India Company compound on the
            // riverside. Rectangular fortified enclosure; two-story main
            // factor's house at the rear; warehouses along the flanks;
            // central yard with flagpole + English cross.
            const brick = varyColor([0.72, 0.52, 0.38], rng, 0.05);
            const whitewash = varyColor([0.92, 0.88, 0.78], rng, 0.04);
            const tile: [number, number, number] = [0.60, 0.32, 0.24];
            const wood = varyColor([0.36, 0.24, 0.16], rng, 0.04);
            // Perimeter walls — four sides around a 8×8 yard
            addPart('box', 'mud', 0, 1.5, 4.0, 9, 3, 0.5, brick);
            addPart('box', 'mud', 0, 1.5, -4.0, 9, 3, 0.5, brick);
            addPart('box', 'mud', 4.5, 1.5, 0, 0.5, 3, 8, brick);
            addPart('box', 'mud', -4.5, 1.5, 0, 0.5, 3, 8, brick);
            // Main factor's house, rear of compound — two stories
            addPart('box', 'white', 0, 2.2, -2.6, 6, 4.4, 2.5, whitewash);
            addPart('cone', 'terracotta', 0, 5.2, -2.6, 3.4, 1.3, 1.8, tile);
            addPart('box', 'dark', 0, 1.6, -1.35, 1.0, 2.2, 0.12);
            // Side warehouses — long and low along the inner walls
            addPart('box', 'mud', -3.4, 1.4, 1.2, 1.6, 2.6, 5, brick);
            addPart('cone', 'wood', -3.4, 3.0, 1.2, 1.0, 0.8, 3.0, tile);
            addPart('box', 'mud', 3.4, 1.4, 1.2, 1.6, 2.6, 5, brick);
            addPart('cone', 'wood', 3.4, 3.0, 1.2, 1.0, 0.8, 3.0, tile);
            // Main gate — wider opening in front wall (sim'd with a darker
            // panel + wooden posts flanking)
            addPart('box', 'dark', 0, 1.3, 4.0, 2.0, 2.2, 0.12);
            addPart('cylinder', 'wood', -1.1, 1.5, 4.0, 0.18, 3.0, 0.18, wood);
            addPart('cylinder', 'wood',  1.1, 1.5, 4.0, 0.18, 3.0, 0.18, wood);
            // Central flagpole in the yard + red-cross of St George
            addPart('cylinder', 'wood', 0, 3.5, 0, 0.10, 7, 0.10, wood);
            addPart('box', 'white', 0.85, 5.6, 0, 1.4, 0.9, 0.06, [0.96, 0.96, 0.96]);
            addPart('box', 'stone', 0.85, 5.6, 0, 1.4, 0.18, 0.07, [0.78, 0.15, 0.15]);
            addPart('box', 'stone', 0.85, 5.6, 0, 0.20, 0.9, 0.07, [0.78, 0.15, 0.15]);
            // A few crates in the yard (trading goods)
            addPart('box', 'wood', -1.8, 0.35, 1.6, 0.7, 0.7, 0.7, wood);
            addPart('box', 'wood', -1.0, 0.30, 1.6, 0.6, 0.6, 0.6, wood);
            addPart('box', 'wood',  1.7, 0.35, 1.8, 0.7, 0.7, 0.7, wood);
          }

          else if (lm === 'apothecaries-hall') {
            // London — Tudor courtyard hall in Blackfriars. Two timber-frame
            // brick-gabled wings around a central archway, steep terracotta
            // roofs, chimney stack. Reads as English Renaissance institutional.
            const plaster = varyColor([0.88, 0.83, 0.71], rng, 0.04);
            const timber: [number, number, number] = [0.20, 0.13, 0.07];
            const tile: [number, number, number] = [0.52, 0.26, 0.16];
            const brick = varyColor([0.46, 0.28, 0.20], rng, 0.04);
            const W = 9, wingD = 3.4, wallH = 3.2;
            // Front and rear wings
            for (const sZ of [1, -1]) {
              addPart('box', 'white', 0, wallH * 0.5, sZ * 2.6, W, wallH, wingD, plaster);
              // Half-timber uprights — five along the long face
              for (let i = 0; i < 5; i++) {
                const t = (i + 0.5) / 5 - 0.5;
                addPart('box', 'wood', t * W, wallH * 0.5, sZ * (2.6 + wingD * 0.5 + 0.04), 0.20, wallH, 0.06, timber);
              }
              // Half-timber horizontal mid-belt
              addPart('box', 'wood', 0, wallH * 0.55, sZ * (2.6 + wingD * 0.5 + 0.04), W, 0.16, 0.06, timber);
              // Steep tile roof — single cone gives the right peaked silhouette at this scale
              addPart('cone', 'terracotta', 0, wallH + 1.0, sZ * 2.6, W * 0.55, 2.0, wingD * 0.7, tile);
              // Brick gables
              addPart('box', 'mud', -W * 0.5 + 0.05, wallH + 0.9, sZ * 2.6, 0.12, 1.8, wingD, brick);
              addPart('box', 'mud',  W * 0.5 - 0.05, wallH + 0.9, sZ * 2.6, 0.12, 1.8, wingD, brick);
            }
            // Central gate range — lower, connecting the two wings
            addPart('box', 'white', 0, wallH * 0.4, 0, 3.6, wallH * 0.8, 5.2 - wingD, plaster);
            addPart('box', 'dark', 0, wallH * 0.4, (5.2 - wingD) * 0.5 + 0.04, 2.0, wallH * 0.7, 0.10);
            // Chimney
            addPart('box', 'mud', W * 0.28, wallH + 2.4, 0, 0.6, 1.6, 0.6, brick);
            addPart('box', 'mud', W * 0.28, wallH + 3.3, 0, 0.78, 0.20, 0.78, brick);
          }

          else if (lm === 'banyan-counting-house') {
            // Surat — Mughal-Gujarati two-storey haveli. Lime-washed walls,
            // crenellated parapet, jharokha balcony on the front face,
            // tiled awning over the door. Reads as a private merchant
            // compound, not a temple or palace.
            const lime = varyColor([0.92, 0.88, 0.78], rng, 0.04);
            const limeShade = varyColor([0.78, 0.74, 0.62], rng, 0.04);
            const teak = varyColor([0.32, 0.18, 0.10], rng, 0.04);
            const ochre: [number, number, number] = [0.78, 0.55, 0.26];
            const W = 7, D = 5;
            // Two storeys
            addPart('box', 'white', 0, 1.2, 0, W, 2.4, D, lime);
            addPart('box', 'white', 0, 3.4, 0, W, 2.0, D - 0.4, lime);
            // Crenellated parapet — six teeth along the front
            for (let i = 0; i < 6; i++) {
              const t = (i + 0.5) / 6 - 0.5;
              addPart('box', 'white', t * W, 4.6, D * 0.5 - 0.15, W * 0.10, 0.30, 0.18, limeShade);
              addPart('box', 'white', t * W, 4.6, -D * 0.5 + 0.15, W * 0.10, 0.30, 0.18, limeShade);
            }
            // Jharokha overhanging balcony
            addPart('box', 'wood', 0, 3.1, D * 0.5 + 0.4, 2.6, 1.4, 0.8, teak);
            addPart('box', 'terracotta', 0, 3.9, D * 0.5 + 0.4, 3.0, 0.16, 1.0, [0.60, 0.32, 0.22]);
            // Front door + awning
            addPart('box', 'dark', 0, 1.0, D * 0.5 + 0.04, 1.3, 1.8, 0.10);
            addPart('box', 'stone', 0, 2.1, D * 0.5 + 0.85, 2.0, 0.10, 1.4, ochre);
            // Side courtyard wall
            addPart('box', 'white', W * 0.5 + 2.0, 0.9, D * 0.5 - 0.4, 4.0, 1.8, 0.30, lime);
            addPart('box', 'white', W * 0.5 + 2.0, 0.9, -D * 0.5 + 0.4, 4.0, 1.8, 0.30, lime);
            addPart('box', 'wood', W * 0.5 + 4.0, 0.9, 0, 0.18, 1.5, 1.3, teak);
          }

          else if (lm === 'mappila-house') {
            // Calicut — Malabar coast Mappila Muslim merchant house. Single-
            // storey nalukettu courtyard plan with steep red-tiled roofs on
            // all four sides around a central open court. Wood verandas,
            // whitewashed walls. Distinct from the Mughal flat-roofed style.
            const wash = varyColor([0.93, 0.90, 0.82], rng, 0.04);
            const tile: [number, number, number] = [0.62, 0.30, 0.20];
            const teak = varyColor([0.36, 0.22, 0.12], rng, 0.04);
            const W = 7, D = 6;
            // Four wings around an open central court (~2u square)
            addPart('box', 'white', 0, 1.0, D * 0.5 - 1.0, W, 2.0, 2.0, wash);
            addPart('box', 'white', 0, 1.0, -D * 0.5 + 1.0, W, 2.0, 2.0, wash);
            addPart('box', 'white', W * 0.5 - 1.0, 1.0, 0, 2.0, 2.0, D, wash);
            addPart('box', 'white', -W * 0.5 + 1.0, 1.0, 0, 2.0, 2.0, D, wash);
            // Steep tile roof — single broad cone covering the whole roofline,
            // with a notch implied by the central court (visual only).
            addPart('cone', 'terracotta', 0, 2.6, 0, W * 0.62, 1.6, D * 0.62, tile);
            // Veranda posts at the four front corners
            for (const [cx, cz] of [[-W * 0.45, D * 0.5 + 0.15], [W * 0.45, D * 0.5 + 0.15]] as [number, number][]) {
              addPart('cylinder', 'wood', cx, 1.0, cz, 0.12, 2.0, 0.12, teak);
            }
            // Front door
            addPart('box', 'dark', 0, 0.9, D * 0.5 + 0.15, 1.0, 1.7, 0.10);
            addPart('box', 'wood', 0, 1.85, D * 0.5 + 0.15, 1.4, 0.18, 0.12, teak);
          }

          else if (lm === 'san-agustin-manila') {
            // Manila — Iglesia de San Agustín, built 1607 in volcanic adobe
            // and Mexican-baroque limestone. Twin-tower facade flanking a
            // single-nave church with a low tile roof. (One bell tower
            // collapsed in the 1863 earthquake, but in 1612 both stood.)
            const adobe = varyColor([0.86, 0.78, 0.62], rng, 0.05);
            const stone = varyColor([0.92, 0.88, 0.78], rng, 0.04);
            const tile: [number, number, number] = [0.62, 0.34, 0.26];
            const wood = varyColor([0.36, 0.24, 0.16], rng, 0.04);
            // Single long nave
            const naveW = 4.0, naveH = 5.5, naveD = 9.0;
            addPart('box', 'white', 0, naveH / 2, 0, naveW, naveH, naveD, adobe);
            // Low tile roof over the nave
            addPart('cone', 'terracotta', 0, naveH + 0.9, 0, naveW * 0.55, 1.5, naveD * 0.55, tile);
            // Facade slab fronting the nave (slightly taller than the side walls)
            addPart('box', 'white', 0, naveH * 0.55, naveD / 2 + 0.3, naveW + 1.5, naveH + 1.5, 0.5, stone);
            // Twin bell towers flanking the facade
            const towerW = 1.5, towerH = naveH + 4;
            for (const sx of [-1, 1] as const) {
              const tx = sx * (naveW / 2 + 0.6);
              addPart('box', 'white', tx, towerH / 2, naveD / 2 + 0.4, towerW, towerH, towerW, stone);
              addPart('cone', 'terracotta', tx, towerH + 0.7, naveD / 2 + 0.4, towerW * 0.6, 1.4, towerW * 0.6, tile);
              // Tiny cross atop each tower
              addPart('cylinder', 'wood', tx, towerH + 1.6, naveD / 2 + 0.4, 0.07, 0.6, 0.07, wood);
              addPart('box', 'stone', tx, towerH + 1.85, naveD / 2 + 0.4, 0.4, 0.08, 0.08, [0.55, 0.50, 0.45]);
              addPart('box', 'stone', tx, towerH + 1.85, naveD / 2 + 0.4, 0.08, 0.4, 0.08, [0.55, 0.50, 0.45]);
            }
            // Central pediment + cross between the towers
            addPart('cone', 'stone', 0, naveH + 1.8, naveD / 2 + 0.45, 1.2, 0.9, 0.18, stone);
            addPart('cylinder', 'wood', 0, naveH + 2.7, naveD / 2 + 0.45, 0.08, 0.9, 0.08, wood);
            // Heavy wooden church doors at the facade base
            addPart('box', 'dark', 0, 1.4, naveD / 2 + 0.55, 1.4, 2.8, 0.10);
          }

          else if (lm === 'campanile-san-marco') {
            // Venice — slim square brick campanile, terracotta cap with a
            // gilded angel finial. The 1612 tower (the medieval one, not
            // the 1912 reconstruction) was leaner and more weathered.
            const brick = varyColor([0.62, 0.36, 0.28], rng, 0.05);
            const istrian = varyColor([0.92, 0.86, 0.74], rng, 0.04);
            const tile: [number, number, number] = [0.55, 0.30, 0.24];
            const gold: [number, number, number] = [0.92, 0.74, 0.20];
            const shaftW = 1.6, shaftH = 18;
            // Stepped base in pale Istrian stone
            addPart('box', 'white', 0, 0.5, 0, shaftW + 0.9, 1.0, shaftW + 0.9, istrian);
            addPart('box', 'white', 0, 1.3, 0, shaftW + 0.5, 0.6, shaftW + 0.5, istrian);
            // Tall slender brick shaft
            addPart('box', 'mud', 0, shaftH / 2 + 1.6, 0, shaftW, shaftH, shaftW, brick);
            // Belfry — open arched chamber in pale stone at the top of the shaft
            addPart('box', 'white', 0, shaftH + 2.4, 0, shaftW + 0.3, 1.6, shaftW + 0.3, istrian);
            // Cornice band
            addPart('box', 'stone', 0, shaftH + 3.4, 0, shaftW + 0.6, 0.25, shaftW + 0.6, [0.55, 0.50, 0.42]);
            // Pyramidal terracotta cap
            addPart('cone', 'terracotta', 0, shaftH + 4.6, 0, (shaftW + 0.4) * 0.5, 2.4, (shaftW + 0.4) * 0.5, tile);
            // Slim spire and gilded angel weathervane
            addPart('cylinder', 'wood', 0, shaftH + 6.4, 0, 0.08, 1.4, 0.08, [0.45, 0.32, 0.20]);
            addPart('box', 'stone', 0, shaftH + 7.3, 0, 0.45, 0.55, 0.10, gold);
          }

          else if (lm === 'church-of-the-assumption') {
            // Nagasaki — Iglesia de la Assunção, dedicated 1601 by the
            // Society of Jesus. The largest Christian church in East Asia
            // until the 1614 expulsion. Hybrid: European basilica massing
            // executed in Japanese carpentry, with a dark kawara-tile hipped
            // roof and deep eaves over whitewashed plaster walls. A single
            // square bell tower rises at the rear.
            const wash = varyColor([0.92, 0.90, 0.86], rng, 0.04);
            const frame = varyColor([0.32, 0.22, 0.14], rng, 0.04);
            const kawara: [number, number, number] = [0.26, 0.26, 0.28];
            const wood = varyColor([0.40, 0.28, 0.18], rng, 0.04);
            // Long single nave — low and broad under deep eaves
            const naveW = 5.0, naveH = 4.8, naveD = 9.5;
            addPart('box', 'white', 0, naveH / 2, 0, naveW, naveH, naveD, wash);
            // Dark timber sill band along the base (exposed cedar framing)
            addPart('box', 'dark', 0, 0.35, naveD / 2 + 0.01, naveW, 0.7, 0.08, frame);
            addPart('box', 'dark', 0, 0.35, -naveD / 2 - 0.01, naveW, 0.7, 0.08, frame);
            // Deep-eaved hipped tile roof, projecting well beyond the walls
            addPart('cone', 'terracotta', 0, naveH + 1.1, 0, naveW * 0.72, 1.7, naveD * 0.62, kawara);
            // Front gable / facade — slightly taller, whitewashed, with a
            // small pediment and cross
            addPart('box', 'white', 0, naveH * 0.55 + 0.3, naveD / 2 + 0.25, naveW + 0.6, naveH + 1.2, 0.4, wash);
            addPart('cone', 'terracotta', 0, naveH + 1.6, naveD / 2 + 0.25, (naveW + 0.6) * 0.55, 1.0, 0.22, kawara);
            // Facade cross
            addPart('cylinder', 'wood', 0, naveH + 2.7, naveD / 2 + 0.25, 0.08, 0.9, 0.08, wood);
            addPart('box', 'stone', 0, naveH + 3.0, naveD / 2 + 0.28, 0.45, 0.09, 0.09, [0.55, 0.48, 0.40]);
            // Square bell tower at the rear — post-and-beam Japanese style
            const towerW = 1.6, towerH = naveH + 3.8;
            addPart('box', 'white', 0, towerH / 2, -naveD / 2 - 0.3, towerW, towerH, towerW, wash);
            // Exposed corner posts on the tower
            for (const sx of [-1, 1] as const) {
              for (const sz of [-1, 1] as const) {
                addPart('box', 'dark',
                  sx * towerW / 2,
                  towerH / 2,
                  -naveD / 2 - 0.3 + sz * towerW / 2,
                  0.16, towerH, 0.16, frame);
              }
            }
            // Deep-eaved pyramidal tile cap on the tower
            addPart('cone', 'terracotta', 0, towerH + 0.9, -naveD / 2 - 0.3, towerW * 0.95, 1.5, towerW * 0.95, kawara);
            // Tower cross
            addPart('cylinder', 'wood', 0, towerH + 2.1, -naveD / 2 - 0.3, 0.08, 1.1, 0.08, wood);
            addPart('box', 'stone', 0, towerH + 2.5, -naveD / 2 - 0.3, 0.5, 0.10, 0.10, [0.55, 0.48, 0.40]);
            // Heavy timber doors at the facade
            addPart('box', 'dark', 0, 1.5, naveD / 2 + 0.5, 1.4, 3.0, 0.10);
          }

          else if (lm === 'dutch-factory-masulipatnam') {
            // Masulipatnam — VOC factory, established 1606. Rectangular
            // walled compound on the estuary waterfront. Whitewashed brick
            // perimeter; a two-story factor's residence at the rear with
            // the distinctive Dutch stepped gable and dark tile roof; long
            // warehouse blocks along both flanks. Prinsenvlag flies from a
            // central yard mast.
            const brick = varyColor([0.74, 0.54, 0.40], rng, 0.05);
            const whitewash = varyColor([0.92, 0.88, 0.80], rng, 0.04);
            const tile: [number, number, number] = [0.40, 0.28, 0.22];
            const wood = varyColor([0.32, 0.20, 0.14], rng, 0.04);
            // Perimeter walls — 9×8 compound
            addPart('box', 'mud', 0, 1.5, 4.0, 9, 3, 0.5, brick);
            addPart('box', 'mud', 0, 1.5, -4.0, 9, 3, 0.5, brick);
            addPart('box', 'mud', 4.5, 1.5, 0, 0.5, 3, 8, brick);
            addPart('box', 'mud', -4.5, 1.5, 0, 0.5, 3, 8, brick);
            // Factor's residence (rear) — two stories with stepped gable
            addPart('box', 'white', 0, 2.3, -2.6, 5.2, 4.6, 2.4, whitewash);
            // Stepped gable front — three stacked cubes of decreasing width
            addPart('box', 'white', 0, 4.9, -1.45, 5.2, 0.9, 0.25, whitewash);
            addPart('box', 'white', 0, 5.5, -1.45, 3.8, 0.8, 0.25, whitewash);
            addPart('box', 'white', 0, 6.1, -1.45, 2.4, 0.8, 0.25, whitewash);
            addPart('box', 'white', 0, 6.65, -1.45, 1.0, 0.5, 0.25, whitewash);
            // Dark tile roof behind the gable
            addPart('cone', 'terracotta', 0, 5.2, -2.9, 2.8, 1.2, 1.4, tile);
            // Residence door
            addPart('box', 'dark', 0, 1.6, -1.35, 1.0, 2.2, 0.12);
            // Two small upper-story windows
            addPart('box', 'dark', -1.3, 3.6, -1.40, 0.7, 0.9, 0.08);
            addPart('box', 'dark',  1.3, 3.6, -1.40, 0.7, 0.9, 0.08);
            // Long warehouses along the flanks
            addPart('box', 'mud', -3.4, 1.4, 1.2, 1.6, 2.6, 5, brick);
            addPart('cone', 'wood', -3.4, 3.0, 1.2, 1.0, 0.8, 3.0, tile);
            addPart('box', 'mud', 3.4, 1.4, 1.2, 1.6, 2.6, 5, brick);
            addPart('cone', 'wood', 3.4, 3.0, 1.2, 1.0, 0.8, 3.0, tile);
            // Main gate on the front wall
            addPart('box', 'dark', 0, 1.3, 4.0, 2.0, 2.2, 0.12);
            addPart('cylinder', 'wood', -1.1, 1.5, 4.0, 0.18, 3.0, 0.18, wood);
            addPart('cylinder', 'wood',  1.1, 1.5, 4.0, 0.18, 3.0, 0.18, wood);
            // Central flagpole with Prinsenvlag (orange / white / blue)
            addPart('cylinder', 'wood', 0, 3.5, 0, 0.10, 7, 0.10, wood);
            addPart('box', 'straw', 0.85, 5.9, 0, 1.4, 0.3, 0.06, [0.90, 0.48, 0.16]); // orange
            addPart('box', 'straw', 0.85, 5.6, 0, 1.4, 0.3, 0.06, [0.95, 0.94, 0.90]); // white
            addPart('box', 'straw', 0.85, 5.3, 0, 1.4, 0.3, 0.06, [0.10, 0.22, 0.58]); // blue
            // A few bales/crates in the yard
            addPart('box', 'wood', -1.8, 0.35, 1.6, 0.8, 0.7, 0.7, wood);
            addPart('box', 'wood', -1.0, 0.30, 1.6, 0.6, 0.6, 0.6, wood);
            addPart('box', 'wood',  1.7, 0.40, 1.8, 0.8, 0.8, 0.8, wood);
          }

          scaleLandmark(_lmStart, 0, 0, LM_SCALE);
          return; // skip generic building render for this building
        }

        // ── Spiritual buildings (churches, mosques, temples, pagodas) ───
        // Dispatched by faith. Geometry stays within the 8×8 reserved
        // footprint so the building sits in its clearing cleanly.
        //
        // Procedural-shrine variant axes (keyFeatureScale, bodyProportion,
        // palette shift, accent toggles) are applied by `applyShrineVariant`
        // in src/utils/shrineVariant.ts. To classify a part as the hero
        // feature (bell tower / minaret / shikhara / pagoda spire / dome
        // etc.), per-faith blocks emit it via `addKey(...)` instead of
        // `addPart(...)`. Index-based; no Y-position guess.
        if (b.type === 'spiritual') {
          const faith = b.faith ?? 'catholic';
          if (!b.shrineVariant) addReligiousPrecinct({ builder, building: b, port, rng });
          const _spiStart = allParts.length;
          const _keyIndices = new Set<number>();
          const addKey: typeof addPart = (...args) => {
            _keyIndices.add(allParts.length);
            addPart(...args);
          };

          if (faith === 'catholic') {
            // Single-nave whitewashed church with tile roof and bell tower.
            const wash = varyColor([0.94, 0.92, 0.86], rng, 0.04);
            const tile: [number, number, number] = [0.60, 0.30, 0.24];
            // Body: nave + roof + door
            addPart('box', 'white', 0, 2.0, 0, 4, 4, 6, wash);
            addPart('cone', 'terracotta', 0, 5.0, 0, 2.4, 1.6, 3.4, tile);
            addPart('box', 'dark', 0, 1.6, 3.05, 1.0, 2.4, 0.15);
            // Hero feature: bell tower + cross
            addKey('box', 'white', 0, 3.5, -3.2, 1.8, 7, 1.8, wash);
            addKey('cone', 'terracotta', 0, 7.6, -3.2, 1.2, 1.4, 1.2, tile);
            addKey('box', 'stone', 0, 9.0, -3.2, 0.10, 0.8, 0.10);
            addKey('box', 'stone', 0, 9.1, -3.2, 0.5, 0.10, 0.10);
          }

          else if (faith === 'protestant') {
            // Plainer Reformed church — no cross on exterior gable, dark
            // timber trim, simpler spire. Dutch brick or English stone.
            const wall = varyColor([0.74, 0.58, 0.42], rng, 0.05);
            const roof: [number, number, number] = [0.42, 0.34, 0.28];
            // Body: nave + roof + door
            addPart('box', 'mud', 0, 2.0, 0, 4, 4, 6, wall);
            addPart('cone', 'stone', 0, 5.0, 0, 2.4, 1.6, 3.4, roof);
            addPart('box', 'dark', 0, 1.6, 3.05, 0.9, 2.2, 0.15);
            // Hero feature: square tower with pyramid roof + weathervane
            addKey('box', 'mud', 0, 4.0, -3.0, 2.0, 8, 2.0, wall);
            addKey('cone', 'wood', 0, 9.0, -3.0, 1.3, 2.0, 1.3, roof);
            addKey('cylinder', 'wood', 0, 10.4, -3.0, 0.06, 1.0, 0.06);
          }

          else if (faith === 'sunni' || faith === 'shia') {
            // Mosque: square domed prayer hall + slim minaret.
            const wash = varyColor([0.94, 0.92, 0.86], rng, 0.04);
            const dome: [number, number, number] = faith === 'shia'
              ? [0.72, 0.80, 0.86]   // Safavid tile-blue
              : [0.90, 0.88, 0.80];  // plain lime
            // Body: hall + door
            addPart('box', 'white', 0, 2.5, 0, 6.5, 5, 6.5, wash);
            addPart('box', 'dark', 0, 1.7, 3.3, 1.25, 2.4, 0.15);
            // Hero feature: dome + minaret stack
            addKey('dome', 'white', 0, 5.4, 0, 3.25, 2.9, 3.25, dome);
            addKey('box', 'white', 3.25, 1.8, 2.8, 1.35, 3.6, 1.35, wash);
            addKey('cylinder', 'white', 3.25, 7.4, 2.8, 0.52, 7.8, 0.52, wash);
            addKey('cylinder', 'white', 3.25, 11.5, 2.8, 0.78, 0.4, 0.78, wash);
            addKey('sphere', 'white', 3.25, 12.4, 2.8, 0.52, 0.8, 0.52, dome);
            addKey('cone', 'straw', 3.25, 13.2, 2.8, 0.12, 0.55, 0.12, [0.85, 0.75, 0.2]);
          }

          else if (faith === 'ibadi') {
            // Plainer Omani mosque — whitewashed cube, short square minaret,
            // no large dome. Distinctive for Muscat / Oman.
            const wash = varyColor([0.92, 0.90, 0.82], rng, 0.04);
            // Body: hall + door
            addPart('box', 'white', 0, 2.5, 0, 6.5, 5, 6.5, wash);
            addPart('box', 'dark', 0, 1.7, 3.3, 1.25, 2.4, 0.15);
            // Hero feature: minaret tower + cap
            addKey('box', 'white', 2.8, 5.2, -2.8, 1.9, 6.2, 1.9, wash);
            addKey('box', 'white', 2.8, 8.5, -2.8, 1.45, 0.45, 1.45, [0.80, 0.78, 0.70]);
          }

          else if (faith === 'hindu') {
            // Kerala / Gujarati Hindu temple: stepped pyramidal shikhara,
            // copper-green roof panels, brass dhvajastambha flag mast.
            const teak = varyColor([0.45, 0.30, 0.20], rng, 0.04);
            const stone = varyColor([0.78, 0.55, 0.38], rng, 0.04);
            const copper: [number, number, number] = [0.32, 0.58, 0.52];
            const brass: [number, number, number] = [0.82, 0.68, 0.28];
            // Body: plinth
            addPart('box', 'mud', 0, 0.5, 0, 5, 1, 5, stone);
            // Hero feature: shikhara stack + finial + flag mast
            addKey('box', 'wood', 0, 2.2, 0, 3.6, 2.4, 3.6, teak);
            addKey('cone', 'wood', 0, 4.2, 0, 2.8, 1.6, 2.8, copper);
            addKey('box', 'wood', 0, 5.4, 0, 2.0, 0.6, 2.0, teak);
            addKey('cone', 'wood', 0, 6.3, 0, 1.5, 1.0, 1.5, copper);
            addKey('cylinder', 'wood', 0, 7.1, 0, 0.15, 0.6, 0.15, brass);
            addKey('cone', 'wood', 0, 7.7, 0, 0.3, 0.5, 0.3, brass);
            addKey('cylinder', 'wood', 3.0, 3.5, 0, 0.10, 7, 0.10, brass);
          }

          else if (faith === 'buddhist') {
            // Stupa / pagoda — multi-tiered red+gold tower over square base.
            const red = varyColor([0.72, 0.28, 0.22], rng, 0.04);
            const gold: [number, number, number] = [0.82, 0.68, 0.28];
            const wood = varyColor([0.38, 0.25, 0.18], rng, 0.04);
            // Body: plinth
            addPart('box', 'mud', 0, 0.5, 0, 4.6, 1, 4.6, [0.72, 0.66, 0.52]);
            // Hero feature: tiered pagoda + spire
            addKey('box', 'wood', 0, 2.0, 0, 3.4, 2, 3.4, red);
            addKey('cone', 'wood', 0, 3.4, 0, 2.8, 0.8, 2.8, wood);
            addKey('box', 'wood', 0, 4.3, 0, 2.4, 1.4, 2.4, red);
            addKey('cone', 'wood', 0, 5.4, 0, 2.0, 0.7, 2.0, wood);
            addKey('box', 'wood', 0, 6.2, 0, 1.6, 1.0, 1.6, red);
            addKey('cone', 'wood', 0, 7.1, 0, 1.2, 0.6, 1.2, wood);
            addKey('cone', 'wood', 0, 8.0, 0, 0.4, 1.4, 0.4, gold);
            addKey('sphere', 'wood', 0, 8.9, 0, 0.22, 0.4, 0.22, gold);
          }

          else if (faith === 'chinese-folk') {
            // Chinese folk temple — red columns, green-tile sweep roof.
            const red = varyColor([0.72, 0.22, 0.18], rng, 0.05);
            const green: [number, number, number] = [0.30, 0.50, 0.34];
            const wood = varyColor([0.34, 0.22, 0.15], rng, 0.04);
            // Body: plinth + four pillars + main hall
            addPart('box', 'mud', 0, 0.4, 0, 5, 0.8, 5, [0.68, 0.62, 0.50]);
            for (const [cx, cz] of [[1.8, 1.8], [-1.8, 1.8], [1.8, -1.8], [-1.8, -1.8]] as [number, number][]) {
              addPart('cylinder', 'wood', cx, 2.0, cz, 0.25, 3.2, 0.25, red);
            }
            addPart('box', 'wood', 0, 2.4, 0, 4.2, 2.8, 4.2, red);
            // Hero feature: sweeping tile roof + ridge ornament
            addKey('cone', 'wood', 0, 4.6, 0, 3.8, 1.4, 3.8, green);
            addKey('cone', 'wood', 0, 5.8, 0, 2.0, 0.8, 2.0, green);
            addKey('cylinder', 'wood', 0, 6.4, 0, 0.12, 0.6, 0.12, wood);
          }

          else if (faith === 'animist') {
            // Open-air shrine: raised wooden platform, thatch canopy, vertical
            // fetish pole. Spatial language inherited from West African and
            // Khoikhoi sacred sites.
            const post = varyColor([0.35, 0.25, 0.18], rng, 0.06);
            const thatch = varyColor([0.78, 0.68, 0.42], rng, 0.06);
            // Body: corner posts + platform + altars
            for (const [cx, cz] of [[1.2, 1.2], [-1.2, 1.2], [1.2, -1.2], [-1.2, -1.2]] as [number, number][]) {
              addPart('cylinder', 'wood', cx, 1.4, cz, 0.15, 2.8, 0.15, post);
            }
            addPart('box', 'wood', 0, 0.4, 0, 3.0, 0.2, 3.0, post);
            for (const [cx, cz] of [[0, 2.2], [0, -2.2]] as [number, number][]) {
              addPart('box', 'stone', cx, 0.2, cz, 0.6, 0.3, 0.6, [0.58, 0.54, 0.48]);
            }
            // Hero feature: thatch canopy + fetish pole + saffron banner
            addKey('cone', 'straw', 0, 3.6, 0, 2.2, 1.8, 2.2, thatch);
            addKey('cylinder', 'wood', 0, 2.0, 0, 0.18, 4.0, 0.18, [0.28, 0.18, 0.12]);
            addKey('box', 'straw', 0, 3.4, 0, 0.9, 0.25, 0.05, [0.82, 0.22, 0.14]);
          }

          else if (faith === 'jewish') {
            // Sephardic / Ashkenazi synagogue — square stone hall, small dome
            // or lantern, arched windows. No exterior cross or minaret.
            const stone = varyColor([0.84, 0.78, 0.66], rng, 0.04);
            const leadDome: [number, number, number] = [0.48, 0.50, 0.52];
            // Body: hall + windows + door
            addPart('box', 'white', 0, 2.5, 0, 5, 5, 5, stone);
            for (const wx of [-1.8, -0.6, 0.6, 1.8]) {
              addPart('box', 'dark', wx, 3.0, 2.55, 0.45, 1.4, 0.08);
            }
            addPart('box', 'dark', 0, 1.6, 2.55, 0.9, 2.0, 0.15);
            // Hero feature: dome + Star of David crossbars
            addKey('dome', 'white', 0, 5.4, 0, 1.6, 1.4, 1.6, leadDome);
            addKey('box', 'stone', 0, 6.5, 0, 0.6, 0.08, 0.08, [0.82, 0.68, 0.28]);
            addKey('box', 'stone', 0, 6.5, 0, 0.08, 0.08, 0.6, [0.82, 0.68, 0.28]);
          }

          // Procedural-shrine variant pass + accents. In-city spirituals
          // leave shrineVariant undefined and skip this entirely.
          if (b.shrineVariant) {
            applyShrineVariant(
              allParts,
              _spiStart,
              _keyIndices,
              b.shrineVariant,
              { x, y, z },
              addPart,
            );
          }

          // Uniform scale tier (wayside 1.0× / village 1.4× / pilgrimage 1.8×).
          // Applied last so the variant-stretched body and the accents both
          // scale together. In-city spirituals leave geometryScale undefined.
          const spiScale = b.geometryScale ?? 1;
          if (spiScale !== 1) scaleLandmark(_spiStart, 0, 0, spiScale);

          return; // skip generic per-type render
        }

        // ── Palaces (royal residence / governor's house, generic per style) ─
        if (b.type === 'palace') {
          const style = b.palaceStyle ?? 'iberian-colonial';

          if (style === 'iberian-colonial') {
            // Whitewashed walls, terracotta tile roof, arched loggia on the
            // front, short clocktower on one corner. Reads as a Portuguese
            // or Spanish governor's palace. Footprint is 10×10 inside the
            // 12×12 reservation (1-cell clearance on each side).
            const wash = varyColor([0.94, 0.90, 0.80], rng, 0.04);
            const tile: [number, number, number] = [0.60, 0.30, 0.22];
            const wood = varyColor([0.30, 0.20, 0.14], rng, 0.04);
            // Main block
            addPart('box', 'white', 0, 2.6, 0, 10, 5.2, 8, wash);
            addPart('cone', 'terracotta', 0, 5.8, 0, 5.4, 1.4, 4.4, tile);
            // Front arched loggia — five arches as small dark openings
            addPart('box', 'white', 0, 1.5, 4.05, 10, 3.0, 0.3, wash);
            for (const ax of [-3.8, -1.9, 0, 1.9, 3.8]) {
              addPart('box', 'dark', ax, 1.3, 4.20, 1.1, 2.1, 0.12);
            }
            // Upper-floor balcony rail
            addPart('box', 'wood', 0, 3.3, 4.20, 9.6, 0.15, 0.15, wood);
            // Small clocktower on one corner
            addPart('box', 'white', 4.2, 3.6, -3.0, 1.8, 7.2, 1.8, wash);
            addPart('cone', 'terracotta', 4.2, 7.6, -3.0, 1.25, 1.3, 1.25, tile);
            addPart('cylinder', 'wood', 4.2, 8.5, -3.0, 0.08, 0.6, 0.08, wood);
            // Central portal
            addPart('box', 'dark', 0, 1.5, 4.30, 1.6, 2.7, 0.12);
            // Flagpole on ridge
            addPart('cylinder', 'wood', -3.0, 7.2, 0, 0.08, 1.8, 0.08, wood);
          }

          else if (style === 'mughal') {
            // Red sandstone cube with a dominant central pishtaq (recessed
            // arch entrance), four small chhatri pavilions on the corners
            // of the roof, small dome over the central pishtaq.
            const sand = varyColor([0.74, 0.42, 0.32], rng, 0.04);
            const cream = varyColor([0.90, 0.82, 0.70], rng, 0.03);
            const marble: [number, number, number] = [0.92, 0.90, 0.84];
            // Main cube
            addPart('box', 'mud', 0, 2.6, 0, 10, 5.2, 10, sand);
            // Recessed pishtaq — taller than the main block, lighter sandstone
            addPart('box', 'mud', 0, 3.4, 4.6, 4.2, 6.8, 0.6, cream);
            addPart('box', 'dark', 0, 2.4, 5.0, 2.2, 4.0, 0.15);
            // Small dome over pishtaq
            addPart('dome', 'white', 0, 7.0, 4.6, 1.2, 1.2, 0.8, marble);
            // Corner chhatri pavilions (small domed kiosks on roof)
            for (const [cx, cz] of [[4, 4], [-4, 4], [4, -4], [-4, -4]] as [number, number][]) {
              addPart('cylinder', 'wood', cx, 5.5, cz, 0.10, 0.9, 0.10, cream);
              addPart('cylinder', 'wood', cx + 0.6, 5.5, cz, 0.10, 0.9, 0.10, cream);
              addPart('cylinder', 'wood', cx, 5.5, cz + 0.6, 0.10, 0.9, 0.10, cream);
              addPart('cylinder', 'wood', cx + 0.6, 5.5, cz + 0.6, 0.10, 0.9, 0.10, cream);
              addPart('dome', 'white', cx + 0.3, 6.6, cz + 0.3, 0.55, 0.55, 0.55, cream);
            }
            // Perimeter crenellation (low parapet with merlons suggested by small boxes)
            for (const [mx, mz] of [[0, 5.0], [0, -5.0], [5.0, 0], [-5.0, 0]] as [number, number][]) {
              addPart('box', 'mud', mx, 5.4, mz, mz === 0 ? 0.4 : 8, 0.5, mx === 0 ? 0.4 : 8, sand);
            }
          }

          else if (style === 'malay-istana') {
            // Raised timber pavilion on stilts, steep tiered tile roof,
            // carved gable. Common grammar for Southeast Asian sultans'
            // palaces — Bantam, Aceh, Johor.
            const teak = varyColor([0.42, 0.26, 0.18], rng, 0.05);
            const tileTrop: [number, number, number] = [0.50, 0.36, 0.24];
            const palm: [number, number, number] = [0.82, 0.68, 0.40];
            // Stilts under the platform (16 posts in 4x4 grid)
            for (const sx of [-4, -1.3, 1.3, 4]) {
              for (const sz of [-4, -1.3, 1.3, 4]) {
                addPart('cylinder', 'wood', sx, 0.9, sz, 0.18, 1.8, 0.18, teak);
              }
            }
            // Raised platform
            addPart('box', 'wood', 0, 1.95, 0, 10, 0.4, 10, teak);
            // Main pavilion body
            addPart('box', 'wood', 0, 3.4, 0, 9, 2.6, 9, teak);
            // Steep lower roof
            addPart('cone', 'wood', 0, 5.2, 0, 6.0, 1.8, 6.0, tileTrop);
            // Upper tier (gives the two-tiered look)
            addPart('box', 'wood', 0, 6.4, 0, 5, 1.0, 5, teak);
            addPart('cone', 'wood', 0, 7.6, 0, 3.8, 1.8, 3.8, tileTrop);
            // Ridge ornament (traditional carved gable finial)
            addPart('cylinder', 'wood', 0, 8.8, 0, 0.12, 0.9, 0.12, teak);
            addPart('box', 'wood', 0, 9.4, 0, 0.8, 0.2, 0.2, teak);
            // Front stair — angled boxes suggest a stair
            addPart('box', 'wood', 0, 1.0, 5.4, 2.4, 0.25, 1.8, teak);
            // Thatch detail on gable front
            addPart('box', 'straw', 0, 4.8, 4.05, 2.4, 1.6, 0.15, palm);
          }

          else if (style === 'ottoman-customs') {
            const stone = varyColor([0.68, 0.62, 0.52], rng, 0.05);
            const plaster = varyColor([0.84, 0.78, 0.66], rng, 0.04);
            const blue: [number, number, number] = [0.30, 0.42, 0.56];
            addPart('box', 'stone', 0, 2.3, 0, 10, 4.6, 8, stone);
            addPart('box', 'white', 0, 3.0, 4.2, 7.2, 3.0, 0.5, plaster);
            addPart('box', 'dark', 0, 2.0, 4.55, 1.8, 2.8, 0.15);
            addPart('dome', 'white', 0, 5.2, 0, 2.0, 1.1, 2.0, blue);
            addPart('box', 'stone', -4.0, 3.5, -2.8, 1.6, 7.0, 1.6, stone);
            addPart('cone', 'stone', -4.0, 7.3, -2.8, 0.9, 1.0, 0.9, plaster);
            for (const ax of [-3, -1, 1, 3]) addPart('box', 'dark', ax, 2.8, 4.6, 0.7, 1.2, 0.12);
          }

          else if (style === 'swahili-coral') {
            const coral = varyColor([0.78, 0.72, 0.60], rng, 0.06);
            const lime = varyColor([0.88, 0.84, 0.74], rng, 0.04);
            const wood = varyColor([0.28, 0.18, 0.12], rng, 0.04);
            addPart('box', 'stone', 0, 2.1, 0, 10, 4.2, 8, coral);
            addPart('box', 'white', 0, 4.35, 0, 10.4, 0.35, 8.4, lime);
            addPart('box', 'white', 0, 2.0, 4.25, 8.8, 2.6, 0.35, lime);
            addPart('box', 'dark', 0, 1.55, 4.55, 1.6, 2.7, 0.15);
            addPart('box', 'wood', 0, 1.0, 5.15, 8.2, 0.35, 1.2, wood);
            for (const ax of [-3.6, -1.2, 1.2, 3.6]) addPart('cylinder', 'wood', ax, 1.8, 5.2, 0.16, 2.2, 0.16, wood);
            addPart('box', 'wood', 0, 3.0, 5.2, 8.8, 0.2, 1.4, wood);
          }

          else if (style === 'omani-fort-house') {
            const plaster = varyColor([0.82, 0.76, 0.62], rng, 0.05);
            const stone = varyColor([0.54, 0.48, 0.38], rng, 0.04);
            addPart('box', 'mud', 0, 2.4, 0, 9.5, 4.8, 8.5, plaster);
            addPart('box', 'stone', 0, 0.5, 0, 10, 1.0, 9, stone);
            addPart('box', 'dark', 0, 1.55, 4.35, 1.4, 2.5, 0.15);
            for (const [cx, cz] of [[4.2, 3.6], [-4.2, 3.6], [4.2, -3.6], [-4.2, -3.6]] as [number, number][]) {
              addPart('cylinder', 'mud', cx, 3.0, cz, 0.9, 6.0, 0.9, plaster);
              addPart('box', 'mud', cx, 6.3, cz, 1.8, 0.5, 1.8, plaster);
            }
            addPart('box', 'mud', 0, 5.1, 0, 9.8, 0.6, 8.8, plaster);
          }

          else if (style === 'malabar-court') {
            const timber = varyColor([0.36, 0.22, 0.14], rng, 0.05);
            const laterite = varyColor([0.66, 0.34, 0.24], rng, 0.04);
            const tile: [number, number, number] = [0.50, 0.22, 0.16];
            addPart('box', 'stone', 0, 0.45, 0, 10, 0.9, 9, laterite);
            addPart('box', 'wood', 0, 2.2, 0, 8.8, 3.2, 7.8, timber);
            addPart('cone', 'terracotta', 0, 4.5, 0, 5.7, 1.6, 5.2, tile);
            addPart('box', 'wood', 0, 1.5, 4.65, 9.6, 2.0, 0.5, timber);
            for (const ax of [-4, -2, 0, 2, 4]) addPart('cylinder', 'wood', ax, 1.5, 4.95, 0.14, 2.0, 0.14, timber);
            addPart('box', 'dark', 0, 1.45, 4.95, 1.4, 2.2, 0.15);
          }

          else if (style === 'japanese-magistracy') {
            const plaster = varyColor([0.86, 0.84, 0.76], rng, 0.035);
            const timber = varyColor([0.24, 0.16, 0.10], rng, 0.04);
            const tile: [number, number, number] = [0.18, 0.20, 0.22];
            addPart('box', 'wood', 0, 0.5, 0, 10, 1.0, 8.5, timber);
            addPart('box', 'white', 0, 2.3, 0, 9.2, 3.2, 7.5, plaster);
            addPart('cone', 'stone', 0, 4.45, 0, 5.6, 1.3, 4.6, tile);
            addPart('box', 'wood', 0, 2.3, 3.95, 9.4, 0.22, 0.18, timber);
            addPart('box', 'dark', 0, 1.5, 4.0, 1.6, 2.2, 0.12);
            for (const ax of [-3.4, -1.7, 1.7, 3.4]) addPart('box', 'wood', ax, 2.3, 4.05, 0.16, 2.8, 0.12, timber);
          }

          else if (style === 'company-office') {
            const brick = varyColor([0.55, 0.24, 0.18], rng, 0.05);
            const stone = varyColor([0.72, 0.68, 0.58], rng, 0.035);
            const slate: [number, number, number] = [0.20, 0.22, 0.25];
            addPart('box', 'stone', 0, 0.45, 0, 10.2, 0.9, 8.2, stone);
            addPart('box', 'mud', 0, 3.0, 0, 9.5, 5.2, 7.5, brick);
            addPart('cone', 'stone', 0, 6.15, 0, 5.1, 1.2, 4.1, slate);
            addPart('box', 'stone', 0, 1.65, 3.85, 2.0, 2.4, 0.2, stone);
            addPart('box', 'dark', 0, 1.45, 4.0, 1.2, 2.0, 0.12);
            for (const ax of [-3.2, -1.6, 1.6, 3.2]) {
              addPart('box', 'dark', ax, 3.2, 4.0, 0.7, 1.1, 0.12);
              addPart('box', 'stone', ax, 3.2, 4.05, 0.85, 0.12, 0.12, stone);
            }
          }

          else if (style === 'venetian-magistracy') {
            const brick = varyColor([0.62, 0.30, 0.22], rng, 0.05);
            const istrian = varyColor([0.88, 0.84, 0.74], rng, 0.035);
            const tile: [number, number, number] = [0.45, 0.20, 0.16];
            addPart('box', 'mud', 0, 3.0, 0, 9.6, 5.6, 7.6, brick);
            addPart('box', 'white', 0, 1.4, 4.0, 9.8, 1.0, 0.25, istrian);
            addPart('cone', 'terracotta', 0, 6.35, 0, 5.1, 1.25, 4.1, tile);
            addPart('box', 'dark', 0, 1.7, 4.15, 1.4, 2.5, 0.12);
            for (const ax of [-3.4, -1.7, 0, 1.7, 3.4]) {
              addPart('box', 'white', ax, 3.5, 4.15, 0.85, 1.6, 0.12, istrian);
              addPart('box', 'dark', ax, 3.45, 4.22, 0.55, 1.15, 0.08);
            }
          }

          return; // skip generic per-type render
        }

        if (b.type === 'dock') {
          const deckColor = varyColor(BASE_COLORS.wood, rng, 0.06);
          addGroundSkirt(w + 1.0, d + 1.2, varyColor([0.42, 0.34, 0.22], rng, 0.05), 'mud', 0.12);
          // overlay=true buckets the deck into the polygonOffset material so
          // it doesn't z-fight the terrain mesh it sits flush against.
          addPart('box', 'wood', 0, 0, 0, w, 0.2, d, deckColor, true);
          const pileColor = varyColor(BASE_COLORS.wood, rng, 0.1);
          addPart('cylinder', 'wood', w/2-0.2, -1, d/2-0.2, 0.2, 3, 0.2, pileColor);
          addPart('cylinder', 'wood', -w/2+0.2, -1, d/2-0.2, 0.2, 3, 0.2, pileColor);
          addPart('cylinder', 'wood', w/2-0.2, -1, -d/2+0.2, 0.2, 3, 0.2, pileColor);
          addPart('cylinder', 'wood', -w/2+0.2, -1, -d/2+0.2, 0.2, 3, 0.2, pileColor);
          // Mooring posts
          addPart('cylinder', 'wood', w/2, 0.4, 0, 0.12, 0.8, 0.12);
          addPart('cylinder', 'wood', -w/2, 0.4, 0, 0.12, 0.8, 0.12);
          for (let pier = -1; pier <= 1; pier++) {
            addPart('box', 'wood', pier * w * 0.22, 0.18, d / 2 + 0.55, 0.28, 0.20, 1.1, varyColor(deckColor, rng, 0.08), true);
          }
          // Crates on dock
          addCrateStack(w/4, d/4, 0.9);
          addCrateStack(-w/4, -d/4, 0.75);
          addRopeCoil(w * 0.12, -d * 0.32, 0.32);
          addRopeCoil(-w * 0.32, d * 0.22, 0.28);
          if (rng() < 0.65) addWorkRack(w * 0.38, -d * 0.08, 1.2);
          // Moored boat — small hull shape
          const boatSide = rng() > 0.5 ? 1 : -1;
          const boatColor = varyColor(BASE_COLORS.wood, rng, 0.15);
          addPart('box', 'wood', boatSide * (w/2 + 1.5), -0.3, d * 0.2, 0.8, 0.5, 2.5, boatColor);
          // Boat bow (small tapered cone)
          addPart('cone', 'wood', boatSide * (w/2 + 1.5), -0.1, d * 0.2 + 1.4, 0.4, 0.4, 0.3, boatColor);
          addPart('box', 'wood', boatSide * (w/2 + 1.5), 0.05, d * 0.2 - 0.35, 0.72, 0.08, 1.0, varyColor([0.18, 0.12, 0.08], rng, 0.04));
          // Torch at end of dock
          addTorch(0, 1.4, d/2 - 0.3);
        }
        else if (b.type === 'fort') {
          const region: CulturalRegion | undefined = PORT_CULTURAL_REGION[port.id];
          const nat: Nationality | undefined = PORT_FACTION[port.id];
          const iberian = nat === 'Portuguese' || nat === 'Spanish';
          const northern = nat === 'Dutch' || nat === 'English';
          const gulf = region === 'Arab' || nat === 'Ottoman' || nat === 'Omani' || nat === 'Persian';
          const southAsian = region === 'Gujarati' || region === 'Malabari' || nat === 'Mughal' || nat === 'Gujarati';
          const portugueseWestAfrican = port.buildingStyle === 'west-african-round' && nat === 'Portuguese';
          const noEuropeanFort = port.id === 'cape-of-good-hope';
          const mat: Part['mat'] = noEuropeanFort || region === 'Malay'
            ? 'wood'
            : gulf || southAsian
              ? 'mud'
              : 'stone';
          const baseColor: [number, number, number] = noEuropeanFort
            ? [0.42, 0.32, 0.20]
            : region === 'Swahili'
              ? [0.84, 0.80, 0.68]
              : gulf
                ? [0.72, 0.58, 0.40]
                : southAsian
                  ? [0.72, 0.45, 0.28]
                  : northern
                    ? [0.50, 0.30, 0.22]
                    : iberian
                      ? [0.86, 0.80, 0.66]
                      : BASE_COLORS[mat];
          const wallColor = varyColor(baseColor, rng, 0.055);
          const capColor = varyColor([0.48, 0.46, 0.40], rng, 0.05);
          const flagColor: [number, number, number] = port.flagColor ?? (
            nat === 'Dutch' ? [0.92, 0.42, 0.10] :
            nat === 'English' ? [0.94, 0.92, 0.86] :
            nat === 'Ottoman' || nat === 'Omani' ? [0.55, 0.08, 0.08] :
            nat === 'Mughal' || nat === 'Gujarati' ? [0.12, 0.45, 0.20] :
            iberian ? [0.82, 0.12, 0.10] :
            [0.20, 0.35, 0.65]
          );
          const drawFlag = (px: number, py: number, pz: number, scale = 1, neutral = false) => {
            const clothColor: [number, number, number] = neutral ? [0.78, 0.66, 0.42] : flagColor;
            addPart('cylinder', 'wood', px, py + 1.2 * scale, pz, 0.06, 2.4 * scale, 0.06);
            addPart('box', 'straw', px + 0.48 * scale, py + 2.0 * scale, pz, 0.90 * scale, 0.48 * scale, 0.05, clothColor);
            if (neutral) return;
            if (nat === 'English') {
              const red: [number, number, number] = [0.78, 0.10, 0.10];
              addPart('box', 'straw', px + 0.48 * scale, py + 2.0 * scale, pz - 0.01, 0.90 * scale, 0.11 * scale, 0.05, red);
              addPart('box', 'straw', px + 0.48 * scale, py + 2.0 * scale, pz - 0.01, 0.16 * scale, 0.48 * scale, 0.05, red);
            } else if (nat === 'Dutch') {
              addPart('box', 'straw', px + 0.48 * scale, py + 2.0 * scale, pz - 0.01, 0.90 * scale, 0.16 * scale, 0.05, [0.95, 0.95, 0.92]);
              addPart('box', 'straw', px + 0.48 * scale, py + 1.84 * scale, pz - 0.01, 0.90 * scale, 0.16 * scale, 0.05, [0.10, 0.20, 0.55]);
            } else if (iberian) {
              addPart('box', 'straw', px + 0.48 * scale, py + 2.0 * scale, pz - 0.01, 0.18 * scale, 0.48 * scale, 0.05, [0.95, 0.88, 0.62]);
            }
          };
          const crenellate = (frontZ: number, backZ: number, topY: number, step = 1.7) => {
            for (let bx = -w / 2 + 0.9; bx <= w / 2 - 0.9; bx += step) {
              addPart('box', mat, bx, topY, frontZ, 0.55, 0.75, 0.45, capColor);
              addPart('box', mat, bx, topY, backZ, 0.55, 0.75, 0.45, capColor);
            }
          };
          const addFrontBatteryWall = (
            z: number,
            y: number,
            wallW: number,
            wallH: number,
            wallD: number,
            color: [number, number, number],
            batteryMat: Part['mat'] = mat,
          ) => {
            addPart('box', batteryMat, 0, y, z, wallW, wallH, wallD, color);
            for (const sx of [-1, 1]) {
              const gx = sx * Math.min(2.4, w * 0.24);
              addPart('box', 'dark', gx, y + wallH * 0.10, z + wallD * 0.52, 0.72, wallH * 0.28, 0.12, [0.06, 0.05, 0.04]);
              addPart('box', batteryMat, gx, y + wallH * 0.33, z + wallD * 0.56, 0.98, 0.14, 0.14, varyColor(color, rng, 0.035));
            }
          };
          const addWallCourses = (
            wallW: number,
            wallD: number,
            wallH: number,
            faceZ: number,
            courseMat: Part['mat'],
            color: [number, number, number],
            step = 0.72,
          ) => {
            for (let cy = step; cy < wallH - 0.18; cy += step) {
              addPart('box', courseMat, 0, cy, faceZ, wallW * 0.94, 0.045, 0.065, color);
              if (cy < wallH * 0.82) {
                addPart('box', courseMat, -wallW * 0.50, cy, 0, 0.065, 0.045, wallD * 0.70, color);
                addPart('box', courseMat, wallW * 0.50, cy, 0, 0.065, 0.045, wallD * 0.70, color);
              }
            }
          };
          const addSideSlits = (
            sideX: number,
            y: number,
            zSpan: number,
            count: number,
            color: [number, number, number] = [0.06, 0.05, 0.04],
          ) => {
            for (let i = 0; i < count; i++) {
              const z = -zSpan * 0.34 + (count === 1 ? 0 : (i / (count - 1)) * zSpan * 0.68);
              addPart('box', 'dark', sideX, y, z, 0.08, 0.30, 0.42, color);
            }
          };
          const addGatehouseCap = (
            y: number,
            z: number,
            color: [number, number, number],
            capMat: Part['mat'] = mat,
          ) => {
            addPart('box', capMat, 0, y, z, 2.9, 0.34, 0.72, color);
            addPart('box', capMat, -1.15, y + 0.34, z, 0.42, 0.46, 0.62, color);
            addPart('box', capMat, 1.15, y + 0.34, z, 0.42, 0.46, 0.62, color);
          };
          const addPowderStore = (lx: number, lz: number, storeMat: Part['mat'], color: [number, number, number]) => {
            addPart('box', storeMat, lx, 0.42, lz, 1.05, 0.84, 0.78, color);
            addPart('gableRoof', 'tileRoof', lx, 1.02, lz, 0.78, 0.44, 0.62, varyColor([0.52, 0.28, 0.20], rng, 0.05));
            addPart('box', 'dark', lx, 0.40, lz + 0.41, 0.36, 0.52, 0.07);
          };
          const addBarracksBlock = (lx: number, lz: number, storeMat: Part['mat'], color: [number, number, number], roof: Part['mat'] = 'tileRoof') => {
            addPart('box', storeMat, lx, 0.58, lz, 1.75, 1.16, 0.88, color);
            addPart('gableRoof', roof, lx, 1.36, lz, 1.25, 0.52, 0.76, varyColor(roof === 'woodRoof' ? [0.36, 0.24, 0.16] : [0.58, 0.32, 0.22], rng, 0.055));
            addPart('box', 'dark', lx - 0.44, 0.62, lz + 0.47, 0.28, 0.42, 0.06);
            addPart('box', 'litWindow', lx + 0.38, 0.82, lz + 0.47, 0.22, 0.22, 0.06);
          };
          const addParapetLadder = (lx: number, lz: number, height: number, ladderMat: Part['mat'] = 'wood') => {
            const wood = varyColor([0.30, 0.20, 0.12], rng, 0.045);
            addPart('box', ladderMat, lx - 0.16, height * 0.48, lz, 0.055, height * 0.96, 0.055, wood, false, 0.16);
            addPart('box', ladderMat, lx + 0.16, height * 0.48, lz, 0.055, height * 0.96, 0.055, wood, false, 0.16);
            for (let ry = 0.45; ry < height - 0.18; ry += 0.42) {
              addPart('box', ladderMat, lx, ry, lz, 0.45, 0.045, 0.05, wood, false, 0.16);
            }
          };
          const addFortYard = () => {
            const yard = noEuropeanFort
              ? varyColor([0.44, 0.34, 0.22], rng, 0.04)
              : varyColor(gulf || southAsian ? [0.66, 0.52, 0.36] : [0.62, 0.58, 0.50], rng, 0.04);
            addGroundSkirt(w * 1.22, d * 1.12, yard, noEuropeanFort ? 'mud' : mat, 0.14);
            addPart('box', noEuropeanFort ? 'mud' : 'stone', 0, 0.03, 0, w * 0.58, 0.08, d * 0.42, yard, true);
            addCrateStack(-w * 0.28, -d * 0.18, 0.72);
            addRopeCoil(w * 0.24, -d * 0.18, 0.28);
            if (!noEuropeanFort && rng() < 0.78) {
              addPowderStore(w * 0.26, d * 0.03, mat === 'wood' ? 'wood' : 'stone', varyColor(baseColor, rng, 0.045));
            }
            if (!noEuropeanFort && rng() < 0.70) {
              addBarracksBlock(-w * 0.18, -d * 0.18, mat === 'wood' ? 'wood' : 'stone', varyColor(baseColor, rng, 0.04), mat === 'wood' ? 'woodRoof' : 'tileRoof');
            }
          };
          const addFortGuns = (gunY: number, frontZ: number) => {
            for (const sx of [-1, 1]) {
              const gx = sx * Math.min(2.4, w * 0.24);
              addPart('box', 'dark', gx, gunY, frontZ + 0.28, 0.34, 0.24, 1.05, [0.08, 0.07, 0.06]);
              addPart('box', 'stone', gx, gunY - 0.10, frontZ - 0.12, 0.60, 0.20, 0.36, [0.22, 0.20, 0.18]);
              addPart('cylinder', 'wood', gx - 0.24, gunY - 0.24, frontZ - 0.12, 0.09, 0.12, 0.09, [0.18, 0.13, 0.08]);
              addPart('cylinder', 'wood', gx + 0.24, gunY - 0.24, frontZ - 0.12, 0.09, 0.12, 0.09, [0.18, 0.13, 0.08]);
            }
          };
          addFortYard();

          if (noEuropeanFort) {
            addPart('box', 'wood', 0, 1.0, 0, w * 0.95, 2.0, d * 0.80, wallColor);
            addPart('box', 'wood', 0, 2.4, 0, w * 0.75, 0.45, d * 0.58, varyColor([0.56, 0.42, 0.24], rng, 0.05));
            for (const sx of [-1, 1]) {
              addPart('cylinder', 'wood', sx * w * 0.42, 2.2, d * 0.32, 0.18, 4.4, 0.18, wallColor);
              addPart('cone', 'straw', sx * w * 0.42, 4.8, d * 0.32, 0.85, 1.0, 0.85, [0.72, 0.60, 0.36]);
            }
            addPart('box', 'wood', 0, 0.78, d * 0.48, w * 0.72, 0.36, 0.34, varyColor([0.34, 0.24, 0.14], rng, 0.05));
            addPart('box', 'dark', 0, 0.9, d * 0.41, 2.2, 1.4, 0.12);
            addWorkRack(-w * 0.22, d * 0.30, 1.1);
            addBarracksBlock(w * 0.20, -d * 0.18, 'wood', varyColor([0.48, 0.36, 0.22], rng, 0.05), 'woodRoof');
            addParapetLadder(-w * 0.30, d * 0.18, 2.7);
            drawFlag(0, 3.5, d * 0.32, 0.75, true);
          } else if (port.buildingStyle === 'swahili-coral') {
            const coral = varyColor([0.78, 0.73, 0.62], rng, 0.055);
            const lime = varyColor([0.88, 0.84, 0.74], rng, 0.035);
            addPart('box', 'stone', 0, h * 0.34, 0, w * 1.02, h * 0.68, d * 0.92, coral);
            addPart('box', 'white', 0, h * 0.72, 0, w * 1.08, 0.42, d * 0.98, lime);
            addFrontBatteryWall(d * 0.49, h * 0.70, w * 0.86, 0.58, 0.42, lime, 'white');
            addWallCourses(w * 1.02, d * 0.92, h * 0.68, d * 0.465, 'white', varyColor([0.68, 0.64, 0.54], rng, 0.035), 0.62);
            addSideSlits(-w * 0.52, h * 0.55, d * 0.72, 3);
            addSideSlits(w * 0.52, h * 0.55, d * 0.72, 3);
            for (const [cx, cz] of [[w * 0.43, d * 0.38], [-w * 0.43, d * 0.38], [w * 0.43, -d * 0.38], [-w * 0.43, -d * 0.38]] as [number, number][]) {
              addPart('box', 'stone', cx, h * 0.48, cz, 1.65, h * 0.92, 1.65, coral);
              addPart('box', 'white', cx, h * 0.98, cz, 1.95, 0.38, 1.95, lime);
            }
            addPart('box', 'dark', 0, h * 0.30, d * 0.47, 1.8, h * 0.46, 0.12);
            addGatehouseCap(h * 0.56, d * 0.50, lime, 'white');
            addParapetLadder(-w * 0.32, d * 0.20, h * 0.78);
            crenellate(d * 0.46, -d * 0.46, h * 0.88, 1.55);
            drawFlag(w * 0.43, h * 0.9, d * 0.38, 0.85);
          } else if (portugueseWestAfrican) {
            const lime = varyColor([0.88, 0.84, 0.72], rng, 0.045);
            const damp = varyColor([0.42, 0.46, 0.38], rng, 0.04);
            addPart('box', 'stone', 0, h * 0.30, 0, w * 1.12, h * 0.60, d * 0.92, lime);
            addPart('box', 'stone', 0, h * 0.68, -d * 0.08, w * 0.74, h * 0.58, d * 0.62, lime);
            addPart('box', 'stone', 0, h * 0.08, d * 0.02, w * 1.16, 0.18, d * 0.96, damp);
            addPart('box', 'dark', 0, h * 0.28, d * 0.47, 2.0, h * 0.42, 0.12);
            addFrontBatteryWall(d * 0.52, h * 0.78, w * 0.90, 0.62, 0.42, capColor, 'stone');
            addGatehouseCap(h * 0.54, d * 0.51, capColor, 'stone');
            addWallCourses(w * 1.12, d * 0.92, h * 0.60, d * 0.465, 'stone', varyColor([0.64, 0.60, 0.50], rng, 0.035), 0.58);
            addSideSlits(-w * 0.57, h * 0.48, d * 0.70, 3);
            addSideSlits(w * 0.57, h * 0.48, d * 0.70, 3);
            for (const [cx, cz] of [[w * 0.50, d * 0.38], [-w * 0.50, d * 0.38], [w * 0.50, -d * 0.38], [-w * 0.50, -d * 0.38]] as [number, number][]) {
              addPart('box', 'stone', cx, h * 0.42, cz, 1.85, h * 0.82, 1.85, lime);
              addPart('box', 'stone', cx, h * 0.86, cz, 2.25, 0.34, 2.25, capColor);
            }
            addPart('box', 'stone', 0, h * 0.80, d * 0.48, w * 0.9, 0.38, 0.50, capColor);
            for (const sx of [-1.2, 1.2]) {
              addPart('box', 'dark', sx, h * 0.82, d * 0.58, 0.85, 0.16, 0.22, [0.08, 0.07, 0.06]);
            }
            addParapetLadder(-w * 0.34, d * 0.18, h * 0.86);
            drawFlag(w * 0.50, h * 0.9, d * 0.38, 0.85);
          } else if (region === 'Malay') {
            addPart('box', 'wood', 0, h * 0.42, 0, w * 0.88, h * 0.84, d * 0.78, wallColor);
            addPart('cone', 'wood', 0, h + 0.9, 0, w * 0.52, 1.6, d * 0.46, varyColor([0.40, 0.25, 0.15], rng, 0.04));
            for (const sx of [-1, 1]) {
              addPart('box', 'wood', sx * w * 0.38, h * 0.55, d * 0.35, 1.2, h * 1.1, 1.2, wallColor);
              addPart('cone', 'wood', sx * w * 0.38, h * 1.15, d * 0.35, 1.0, 1.1, 1.0, [0.33, 0.21, 0.14]);
            }
            addPart('box', 'wood', 0, h * 0.70, d * 0.43, w * 0.70, 0.46, 0.34, varyColor([0.34, 0.22, 0.14], rng, 0.05));
            addPart('box', 'dark', 0, h * 0.35, d * 0.40, 2.0, h * 0.55, 0.12);
            addGatehouseCap(h * 0.66, d * 0.43, varyColor([0.34, 0.22, 0.14], rng, 0.04), 'wood');
            addBarracksBlock(-w * 0.22, -d * 0.16, 'wood', varyColor([0.42, 0.30, 0.20], rng, 0.05), 'woodRoof');
            addParapetLadder(w * 0.26, d * 0.12, h * 0.76);
            drawFlag(w * 0.38, h * 1.05, d * 0.35);
          } else if (gulf || southAsian) {
            addPart('box', mat, 0, h * 0.45, 0, w, h * 0.9, d, wallColor);
            addPart('box', mat, 0, h + 0.28, 0, w * 0.92, 0.55, d * 0.92, capColor);
            addFrontBatteryWall(d/2 + 0.04, h * 0.68, w * 0.78, 0.62, 0.34, capColor);
            addWallCourses(w, d, h * 0.9, d/2 + 0.02, mat, varyColor([0.48, 0.36, 0.24], rng, 0.045), southAsian ? 0.66 : 0.78);
            addSideSlits(-w * 0.505, h * 0.58, d * 0.74, gulf ? 2 : 3);
            addSideSlits(w * 0.505, h * 0.58, d * 0.74, gulf ? 2 : 3);
            const towerR = gulf ? 1.15 : 1.0;
            for (const [cx, cz] of [[w/2, d/2], [-w/2, d/2], [w/2, -d/2], [-w/2, -d/2]] as [number, number][]) {
              addPart(gulf ? 'cylinder' : 'box', mat, cx, h * 0.55, cz, towerR, h * 1.1, towerR, wallColor);
              addPart('box', mat, cx, h * 1.15, cz, towerR * 1.35, 0.45, towerR * 1.35, capColor);
              if (southAsian && cz > 0) addPart('dome', mat, cx, h * 1.42, cz, towerR * 0.7, 0.45, towerR * 0.7, varyColor(capColor, rng, 0.035));
            }
            addPart('box', 'dark', 0, h * 0.34, d/2 + 0.05, 2.2, h * 0.56, 0.14);
            if (southAsian) addPart('cone', mat, 0, h * 0.78, d/2 + 0.05, 1.35, 1.05, 0.18, capColor);
            addGatehouseCap(h * 0.66, d/2 + 0.08, capColor);
            addParapetLadder(-w * 0.30, d * 0.14, h * 0.84);
            crenellate(d/2, -d/2, h + 0.65);
            drawFlag(w/2, h + 0.6, d/2);
          } else if (northern) {
            addPart('box', 'mud', 0, h * 0.28, 0, w * 1.08, h * 0.56, d * 1.02, varyColor([0.38, 0.28, 0.20], rng, 0.05));
            addPart('box', mat, 0, h * 0.65, 0, w * 0.74, h * 0.72, d * 0.70, wallColor);
            addFrontBatteryWall(d * 0.43, h * 0.56, w * 0.78, 0.52, 0.34, varyColor([0.44, 0.32, 0.24], rng, 0.045), 'mud');
            addWallCourses(w * 0.74, d * 0.70, h * 0.72, d * 0.35, mat, varyColor([0.28, 0.18, 0.14], rng, 0.035), 0.54);
            addSideSlits(-w * 0.38, h * 0.66, d * 0.50, 2);
            addSideSlits(w * 0.38, h * 0.66, d * 0.50, 2);
            for (const [cx, cz] of [[w*0.48, d*0.46], [-w*0.48, d*0.46], [w*0.48, -d*0.46], [-w*0.48, -d*0.46]] as [number, number][]) {
              addPart('box', 'mud', cx, h * 0.42, cz, 2.1, h * 0.82, 2.1, varyColor([0.42, 0.30, 0.20], rng, 0.05));
            }
            addPart('cone', 'wood', 0, h + 0.85, 0, w * 0.36, 1.15, d * 0.32, [0.30, 0.22, 0.17]);
            addPart('box', 'dark', 0, h * 0.40, d * 0.36, 2.0, h * 0.44, 0.14);
            addGatehouseCap(h * 0.64, d * 0.37, varyColor([0.38, 0.26, 0.18], rng, 0.045), 'mud');
            addParapetLadder(w * 0.22, d * 0.10, h * 0.70);
            drawFlag(0, h + 0.9, 0);
          } else {
            addPart('box', mat, 0, h/2, 0, w, h, d, wallColor);
            const towerColor = varyColor(wallColor, rng, 0.04);
            addFrontBatteryWall(d/2 + 0.04, h * 0.68, w * 0.80, 0.62, 0.34, capColor);
            addWallCourses(w, d, h, d/2 + 0.02, mat, varyColor([0.56, 0.52, 0.44], rng, 0.04), 0.70);
            addSideSlits(-w * 0.505, h * 0.60, d * 0.76, 3);
            addSideSlits(w * 0.505, h * 0.60, d * 0.76, 3);
            for (const [cx, cz] of [[w/2, d/2], [-w/2, d/2], [w/2, -d/2], [-w/2, -d/2]] as [number, number][]) {
              addPart('cylinder', mat, cx, h/2 + 1, cz, 1.5, h + 2, 1.5, towerColor);
              addPart('cone', 'stone', cx, h + 2.2, cz, 1.35, 0.8, 1.35, capColor);
            }
            addPart('box', 'dark', 0, h * 0.35, d/2 + 0.05, 2.5, h * 0.6, 0.15);
            addGatehouseCap(h * 0.70, d/2 + 0.07, capColor);
            addParapetLadder(-w * 0.30, d * 0.16, h * 0.82);
            crenellate(d/2, -d/2, h + 0.5, 2);
            drawFlag(w/2, h + 1.7, d/2);
            drawFlag(-w/2, h + 1.7, d/2);
          }

          if (!noEuropeanFort && !portugueseWestAfrican) {
            addFortGuns(h * 0.64, d/2 + 0.54);
            addTorch(2.2, h * 0.58, d/2 + 0.3);
            addTorch(-2.2, h * 0.58, d/2 + 0.3);
          } else if (portugueseWestAfrican) {
            addFortGuns(h * 0.82, d * 0.55);
            addTorch(2.1, h * 0.55, d/2 + 0.3);
            addTorch(-2.1, h * 0.55, d/2 + 0.3);
          }

        }
        else if (b.type === 'plaza') {
          // Open civic square. The footprint (w × d) is a paved plinth; on top
          // sits one culture-specific centrepiece so each region reads as
          // unmistakably its own. Dispatch prefers the finer-grained
          // CulturalRegion when set, falling back to the 4-way Culture.
          const region: CulturalRegion | undefined = PORT_CULTURAL_REGION[port.id];
          const nat:    Nationality   | undefined = PORT_FACTION[port.id];
          // Iberian colonial override: Portuguese/Spanish ports outside the
          // peninsula (Goa, Macau, Malacca, Salvador, Havana, Cartagena,
          // Luanda) pave and decorate as Iberian colonial plazas. Homeland
          // Lisbon/Seville already hit the Iberian branch via culture +
          // nationality downstream; this just overrides region for the
          // colonial cases so Goa doesn't render a Hindu mandapam.
          const iberianColonial = (nat === 'Portuguese' || nat === 'Spanish') && c !== 'European';

          // ── Paving ──
          // Flagstone for European/Atlantic, lighter stone/coral for Arab &
          // Swahili, packed earth with a stone ring for West African, a
          // tiled plinth for Malabari/Gujarati, granite for Chinese, timber
          // decking for Malay.
          const paveFor = (): { color: [number,number,number]; mat: Part['mat']; geo: Part['geo'] } => {
            if (iberianColonial)        return { color: [0.82, 0.76, 0.62], mat: 'stone', geo: 'box' };
            if (region === 'Malay')     return { color: [0.48, 0.36, 0.24], mat: 'wood',  geo: 'box' };
            if (region === 'Chinese')   return { color: [0.62, 0.60, 0.56], mat: 'stone', geo: 'box' };
            if (region === 'Arab' || region === 'Swahili') return { color: [0.88, 0.82, 0.70], mat: 'stone', geo: 'box' };
            if (region === 'Gujarati' || region === 'Malabari') return { color: [0.74, 0.56, 0.40], mat: 'stone', geo: 'box' };
            if (c === 'West African')   return { color: [0.62, 0.48, 0.32], mat: 'mud',   geo: 'box' };
            if (c === 'Atlantic')       return { color: [0.82, 0.76, 0.62], mat: 'stone', geo: 'box' };
            // Default European flagstone
            return { color: [0.66, 0.62, 0.56], mat: 'stone', geo: 'box' };
          };
          const pave = paveFor();
          // The slab is anchored at the *highest* terrain cell inside the
          // footprint (see cityGenerator's tryReservePlaza) and its bottom
          // is buried ~2m underground. Together that keeps the visible top
          // above every cell underneath while the underside still intersects
          // the lowest cell, so terrain can never poke through or float free.
          // overlay=true also routes the slab through a polygonOffset
          // material so any residual coplanarity at the slab edge wins the
          // depth tie. Visible top stays at building.y + 0.2 (the original
          // height), only the buried portion grew downward.
          addPart(pave.geo, pave.mat, 0, -0.9, 0, w, 2.2, d, varyColor(pave.color, rng, 0.04), true);
          // Subtle inset rim (stone border) for all variants except West African.
          // Same buried-skirt trick: visible top sits at +0.25 (the original
          // 0.05 step above paving top), but the strip extends down to -2.0
          // so it tracks the slab and never z-fights against it at the edge.
          if (c !== 'West African') {
            const rim = varyColor([pave.color[0] * 0.82, pave.color[1] * 0.82, pave.color[2] * 0.82], rng, 0.03);
            addPart('box', pave.mat, 0, -0.875, d/2 - 0.25, w - 0.6, 2.25, 0.5, rim, true);
            addPart('box', pave.mat, 0, -0.875, -d/2 + 0.25, w - 0.6, 2.25, 0.5, rim, true);
            addPart('box', pave.mat, w/2 - 0.25, -0.875, 0, 0.5, 2.25, d - 0.6, rim, true);
            addPart('box', pave.mat, -w/2 + 0.25, -0.875, 0, 0.5, 2.25, d - 0.6, rim, true);
          }

          // ── Centrepiece ──
          // iberianColonial is checked first so Goa/Macau/Malacca/etc. get
          // a colonial plaza rather than their region's indigenous one.
          if (iberianColonial) {
            const stone = varyColor([0.82, 0.76, 0.62], rng, 0.04);
            addPart('box', 'stone', 0, 0.35, 0, 2.0, 0.4, 2.0, stone);
            addPart('box', 'stone', 0, 0.65, 0, 1.4, 0.3, 1.4, varyColor(stone, rng, 0.03));
            const crossColor = varyColor([0.70, 0.64, 0.54], rng, 0.03);
            addPart('cylinder', 'stone', 0, 1.6, 0, 0.18, 1.6, 0.18, crossColor);
            addPart('box', 'stone', 0, 2.25, 0, 1.1, 0.22, 0.22, crossColor);
            addPart('box', 'stone', 0, 2.45, 0, 0.22, 0.22, 0.22, crossColor);
            // Corner bollards
            for (const [px, pz] of [[w/2 - 1, d/2 - 1], [-w/2 + 1, d/2 - 1], [w/2 - 1, -d/2 + 1], [-w/2 + 1, -d/2 + 1]] as const) {
              addPart('cylinder', 'stone', px, 0.35, pz, 0.16, 0.7, 0.16, stone);
              addPart('sphere', 'stone', px, 0.72, pz, 0.18, 0.18, 0.18, stone);
            }
            // Pair of palms flanking the cross axis — a colonial constant
            // from the Largo do Pelourinho to the Plaza de Armas.
            const trunk = varyColor([0.42, 0.32, 0.22], rng, 0.06);
            const fronds = varyColor([0.30, 0.42, 0.18], rng, 0.08);
            for (const pz of [d/2 - 1.4, -d/2 + 1.4] as const) {
              addPart('cylinder', 'wood', 0, 1.6, pz, 0.14, 3.2, 0.14, trunk);
              addPart('sphere', 'straw', 0, 3.4, pz, 1.0, 0.55, 1.0, fronds);
            }
          }
          else if (region === 'Arab' || region === 'Swahili') {
            // Low octagonal fountain. Ring + inner basin + short spouting pillar.
            const coral = varyColor([0.92, 0.86, 0.72], rng, 0.04);
            addPart('cylinder', 'stone', 0, 0.38, 0, 1.6, 0.35, 1.6, coral);
            addPart('cylinder', 'stone', 0, 0.55, 0, 1.2, 0.12, 1.2, varyColor([0.55, 0.72, 0.78], rng, 0.04)); // water
            addPart('cylinder', 'stone', 0, 1.0, 0, 0.18, 1.0, 0.18, varyColor([0.82, 0.76, 0.62], rng, 0.03));
            addPart('sphere', 'stone', 0, 1.6, 0, 0.32, 0.32, 0.32, coral);
            // Four corner date palms — a courtyard staple from Muscat to Lamu.
            const trunk = varyColor([0.42, 0.32, 0.22], rng, 0.06);
            const fronds = varyColor([0.30, 0.42, 0.18], rng, 0.08);
            for (const [px, pz] of [[w/2 - 1, d/2 - 1], [-w/2 + 1, d/2 - 1], [w/2 - 1, -d/2 + 1], [-w/2 + 1, -d/2 + 1]] as const) {
              addPart('cylinder', 'wood', px, 1.4, pz, 0.12, 2.8, 0.12, trunk);
              addPart('sphere', 'straw', px, 2.9, pz, 0.9, 0.5, 0.9, fronds);
            }
          }
          else if (region === 'Gujarati' || region === 'Malabari') {
            // Open mandapam: four slim columns carrying a flat tiled roof, over
            // a low central plinth. A banyan/pipal tree sits off-axis.
            const colColor = varyColor([0.90, 0.84, 0.70], rng, 0.04);
            const roofColor = varyColor([0.62, 0.30, 0.22], rng, 0.05);
            const side = 1.4;
            for (const [cx, cz] of [[side, side], [-side, side], [side, -side], [-side, -side]] as const) {
              addPart('cylinder', 'stone', cx, 1.3, cz, 0.16, 2.6, 0.16, colColor);
            }
            addPart('box', 'stone', 0, 0.35, 0, side * 2 + 0.5, 0.25, side * 2 + 0.5, varyColor([0.78, 0.64, 0.48], rng, 0.04));
            addPart('box', 'terracotta', 0, 2.75, 0, side * 2 + 0.8, 0.18, side * 2 + 0.8, roofColor);
            addPart('cone', 'terracotta', 0, 3.15, 0, side * 1.3, 0.5, side * 1.3, roofColor);
            // Pipal tree at one corner
            const trunk = varyColor([0.38, 0.28, 0.18], rng, 0.05);
            const leaves = varyColor([0.28, 0.48, 0.24], rng, 0.07);
            addPart('cylinder', 'wood', -w/2 + 1.4, 1.0, d/2 - 1.4, 0.25, 2.0, 0.25, trunk);
            addPart('sphere', 'straw', -w/2 + 1.4, 2.6, d/2 - 1.4, 1.3, 1.0, 1.3, leaves);
          }
          else if (region === 'Chinese') {
            // Paifang arch over the plaza axis + a stone lion pair + a bronze urn.
            const pillarColor = varyColor([0.52, 0.14, 0.12], rng, 0.04); // cinnabar red
            const roofColor = varyColor([0.28, 0.24, 0.20], rng, 0.03);
            addPart('cylinder', 'wood', -1.6, 1.5, 0, 0.18, 3.0, 0.18, pillarColor);
            addPart('cylinder', 'wood',  1.6, 1.5, 0, 0.18, 3.0, 0.18, pillarColor);
            addPart('box', 'wood', 0, 3.05, 0, 3.8, 0.2, 0.6, pillarColor);
            addPart('box', 'wood', 0, 3.35, 0, 4.4, 0.15, 0.9, roofColor);
            // Upturned eaves (tiny triangular accents)
            addPart('cone', 'wood', -2.3, 3.55, 0, 0.25, 0.45, 0.35, roofColor);
            addPart('cone', 'wood',  2.3, 3.55, 0, 0.25, 0.45, 0.35, roofColor);
            // Lion pair guarding the far side
            const stone = varyColor([0.58, 0.54, 0.48], rng, 0.04);
            addPart('box', 'stone', -1.2, 0.55, d/2 - 1.0, 0.45, 0.7, 0.7, stone);
            addPart('sphere', 'stone', -1.2, 1.05, d/2 - 1.0, 0.28, 0.28, 0.28, stone);
            addPart('box', 'stone',  1.2, 0.55, d/2 - 1.0, 0.45, 0.7, 0.7, stone);
            addPart('sphere', 'stone',  1.2, 1.05, d/2 - 1.0, 0.28, 0.28, 0.28, stone);
            // Bronze urn at back
            addPart('cylinder', 'stone', 0, 0.55, -d/2 + 1.2, 0.45, 0.9, 0.45, varyColor([0.32, 0.24, 0.14], rng, 0.04));
          }
          else if (region === 'Malay') {
            // Open bangsal pavilion on timber stilts + a banyan tree.
            const wood = varyColor([0.42, 0.30, 0.20], rng, 0.05);
            const thatch = varyColor([0.58, 0.46, 0.28], rng, 0.06);
            // Four stilts carrying a raised deck
            for (const [px, pz] of [[1.2, 1.2], [-1.2, 1.2], [1.2, -1.2], [-1.2, -1.2]] as const) {
              addPart('cylinder', 'wood', px, 0.85, pz, 0.12, 1.7, 0.12, wood);
            }
            addPart('box', 'wood', 0, 1.7, 0, 3.0, 0.18, 3.0, wood);
            // Pitched atap roof
            addPart('box', 'straw', 0, 2.35, 0, 3.4, 0.6, 3.4, thatch);
            addPart('cone', 'straw', 0, 2.95, 0, 1.8, 0.9, 1.8, thatch);
            // Banyan/waringin near the edge
            const trunk = varyColor([0.36, 0.26, 0.18], rng, 0.04);
            const leaves = varyColor([0.26, 0.44, 0.22], rng, 0.06);
            addPart('cylinder', 'wood', -w/2 + 1.6, 1.2, -d/2 + 1.6, 0.35, 2.4, 0.35, trunk);
            addPart('sphere', 'straw', -w/2 + 1.6, 3.0, -d/2 + 1.6, 1.6, 1.2, 1.6, leaves);
          }
          else if (c === 'West African') {
            // Palaver tree + low packed-earth seating ring. No paved rim; the
            // tree IS the civic space.
            const trunk = varyColor([0.48, 0.34, 0.22], rng, 0.05);
            const canopy = varyColor([0.28, 0.42, 0.18], rng, 0.08);
            addPart('cylinder', 'wood', 0, 2.0, 0, 0.55, 4.0, 0.55, trunk);
            addPart('sphere', 'straw', 0, 5.0, 0, 3.2, 2.0, 3.2, canopy);
            // Low circular seating wall under the canopy
            addPart('cylinder', 'mud', 0, 0.25, 0, 2.4, 0.5, 2.4, varyColor([0.66, 0.50, 0.32], rng, 0.05));
            addPart('cylinder', 'mud', 0, 0.26, 0, 2.0, 0.5, 2.0, varyColor([0.58, 0.44, 0.28], rng, 0.04));
          }
          else if (c === 'Atlantic' || nat === 'Spanish' || nat === 'Portuguese') {
            // Iberian-American plaza: stone cross on stepped pedestal + a
            // small central fountain-bowl. Short bollard chain at the rim.
            const stone = varyColor([0.82, 0.76, 0.62], rng, 0.04);
            // Stepped pedestal
            addPart('box', 'stone', 0, 0.35, 0, 2.0, 0.4, 2.0, stone);
            addPart('box', 'stone', 0, 0.65, 0, 1.4, 0.3, 1.4, varyColor(stone, rng, 0.03));
            // Cross shaft
            const crossColor = varyColor([0.70, 0.64, 0.54], rng, 0.03);
            addPart('cylinder', 'stone', 0, 1.6, 0, 0.18, 1.6, 0.18, crossColor);
            addPart('box', 'stone', 0, 2.25, 0, 1.1, 0.22, 0.22, crossColor); // transverse
            addPart('box', 'stone', 0, 2.45, 0, 0.22, 0.22, 0.22, crossColor); // tiny cap
            // Bollards at four corners
            for (const [px, pz] of [[w/2 - 1, d/2 - 1], [-w/2 + 1, d/2 - 1], [w/2 - 1, -d/2 + 1], [-w/2 + 1, -d/2 + 1]] as const) {
              addPart('cylinder', 'stone', px, 0.35, pz, 0.16, 0.7, 0.16, stone);
              addPart('sphere', 'stone', px, 0.72, pz, 0.18, 0.18, 0.18, stone);
            }
          }
          else {
            // European default: market cross + stone well + a few bollards.
            // Works for London, Amsterdam, and any unnamed port.
            const stone = varyColor([0.66, 0.62, 0.56], rng, 0.04);
            // Market cross on a short stepped base
            addPart('box', 'stone', 0, 0.3, 0, 1.6, 0.3, 1.6, stone);
            addPart('cylinder', 'stone', 0, 1.4, 0, 0.15, 2.2, 0.15, varyColor([0.58, 0.54, 0.48], rng, 0.04));
            addPart('box', 'stone', 0, 2.4, 0, 0.9, 0.18, 0.18, varyColor([0.58, 0.54, 0.48], rng, 0.04));
            // Stone well off-centre
            addPart('cylinder', 'stone', w/2 - 1.6, 0.6, -d/2 + 1.6, 0.55, 1.0, 0.55, varyColor([0.54, 0.50, 0.44], rng, 0.04));
            addPart('cylinder', 'stone', w/2 - 1.6, 1.1, -d/2 + 1.6, 0.38, 0.1, 0.38, varyColor([0.30, 0.24, 0.18], rng, 0.04)); // dark water
            // Wooden winch frame over well
            const wood = varyColor([0.40, 0.30, 0.20], rng, 0.06);
            addPart('cylinder', 'wood', w/2 - 1.6 - 0.5, 1.6, -d/2 + 1.6, 0.06, 1.1, 0.06, wood);
            addPart('cylinder', 'wood', w/2 - 1.6 + 0.5, 1.6, -d/2 + 1.6, 0.06, 1.1, 0.06, wood);
            addPart('cylinder', 'wood', w/2 - 1.6, 2.15, -d/2 + 1.6, 0.06, 0.06, 1.1, wood);
            // Torches flanking the cross (lit at night thanks to darkMat glow)
            addTorch(1.2, 1.2, 0);
            addTorch(-1.2, 1.2, 0);
          }
        }
        else if (b.type === 'market') {
          const yardColor = c === 'West African'
            ? varyColor([0.58, 0.44, 0.28], rng, 0.05)
            : c === 'Indian Ocean'
            ? varyColor([0.70, 0.58, 0.40], rng, 0.045)
            : varyColor([0.64, 0.58, 0.48], rng, 0.04);
          addGroundSkirt(w + 1.4, d + 1.4, yardColor, c === 'European' || c === 'Atlantic' ? 'stone' : 'mud', 0.13);
          addPart('box', 'wood', 0, 0.2, 0, w, 0.4, d);
          addPart('cylinder', 'wood', w/2-0.5, h/2, d/2-0.5, 0.3, h, 0.3);
          addPart('cylinder', 'wood', -w/2+0.5, h/2, d/2-0.5, 0.3, h, 0.3);
          addPart('cylinder', 'wood', w/2-0.5, h/2, -d/2+0.5, 0.3, h, 0.3);
          addPart('cylinder', 'wood', -w/2+0.5, h/2, -d/2+0.5, 0.3, h, 0.3);

          if (c === 'Indian Ocean') {
            addPart('dome', 'mud', 0, h, 0, w/2, w/2, d/2);
          } else if (c === 'European') {
            addPart('cone', 'terracotta', 0, h+1, 0, w/1.5, 2, d/1.5);
          } else if (c === 'West African') {
            // Broad conical thatch canopy — open-air market shelter
            addPart('cone', 'straw', 0, h+0.8, 0, w/1.2, 2.2, d/1.2, varyColor(BASE_COLORS.straw, rng, 0.10));
          } else {
            addPart('cone', 'wood', 0, h+1, 0, w/1.5, 2, d/1.5);
          }
          // Awnings — each side picks from culture-specific dyed fabric colors
          const awningPalette = AWNING_COLORS[c] ?? AWNING_COLORS['Indian Ocean'];
          const awning1 = varyColor(awningPalette[Math.floor(rng() * awningPalette.length)], rng, 0.08);
          const awning2 = varyColor(awningPalette[Math.floor(rng() * awningPalette.length)], rng, 0.08);
          addPart('box', 'straw', w/2-0.5, h*0.55, 0, 1.2, 0.08, d*0.7, awning1);
          addPart('box', 'straw', -w/2+0.5, h*0.55, 0, 1.2, 0.08, d*0.7, awning2);
          const awning3 = varyColor(awningPalette[Math.floor(rng() * awningPalette.length)], rng, 0.08);
          addPart('box', 'straw', 0, h*0.48, d/2-0.45, w*0.62, 0.08, 0.92, awning3);
          for (const sx of [-0.32, 0, 0.32]) {
            addPart('cylinder', 'wood', sx * w, h * 0.25, d/2 - 0.42, 0.055, h * 0.50, 0.055, varyColor(BASE_COLORS.wood, rng, 0.08));
          }
          // Counter/table
          addPart('box', 'wood', 0, 1.0, 0, w*0.5, 0.15, d*0.4);
          addPart('box', 'wood', w * 0.28, 0.68, -d * 0.20, w * 0.24, 0.12, d * 0.22, varyColor(BASE_COLORS.wood, rng, 0.10));
          addPart('box', 'wood', -w * 0.30, 0.62, d * 0.18, w * 0.22, 0.12, d * 0.20, varyColor(BASE_COLORS.wood, rng, 0.10));
          // Goods on counter — varied spice/textile colors
          addPart('box', 'straw', 0.4, 1.2, 0.2, 0.3, 0.25, 0.3, varyColor([0.85, 0.65, 0.2], rng, 0.15));
          addPart('box', 'straw', -0.3, 1.2, -0.1, 0.25, 0.2, 0.25, varyColor([0.6, 0.3, 0.15], rng, 0.15));
          addPart('box', 'straw', 0.1, 1.2, -0.3, 0.2, 0.18, 0.2, varyColor([0.35, 0.55, 0.25], rng, 0.12));
          addCrateStack(w * 0.36, d * 0.34, 0.62);
          addCrateStack(-w * 0.38, -d * 0.30, 0.58);
          if (c === 'West African' || c === 'Indian Ocean') addWorkRack(0, -d * 0.55, 1.6);

          // Torches at market corners
          addTorch(w/2 - 0.3, h + 0.5, d/2 - 0.3);
          addTorch(-w/2 + 0.3, h + 0.5, d/2 - 0.3);
        }
        else if (b.type === 'shack') {
          // Shacks use rougher, more varied materials
          const shackWallPalette: [number,number,number][] = c === 'Indian Ocean'
            ? [[0.55, 0.40, 0.28], [0.62, 0.48, 0.32], [0.70, 0.58, 0.42], [0.48, 0.38, 0.25]]
            : c === 'West African'
            ? [[0.68, 0.50, 0.30], [0.72, 0.55, 0.35], [0.60, 0.45, 0.28], [0.65, 0.52, 0.33]]
            : [[0.36, 0.25, 0.20], [0.42, 0.30, 0.22], [0.50, 0.38, 0.26], [0.38, 0.28, 0.18]];
          const wallColor = varyColor(shackWallPalette[Math.floor(rng() * shackWallPalette.length)], rng, 0.08);
          const roofColor = varyColor(BASE_COLORS.straw, rng, 0.12);
          if (port.buildingStyle === 'khoikhoi-minimal') {
            const matColor = varyColor([0.64, 0.54, 0.38], rng, 0.08);
            addPart('box', 'mud', 0, h * 0.30, 0, w * 1.15, h * 0.60, d * 0.80, wallColor);
            addPart('cone', 'straw', 0, h * 0.78, 0, w * 0.82, 0.75, d * 0.58, matColor);
            addPart('box', 'dark', 0, h * 0.27, d * 0.42, 0.72, h * 0.45, 0.10);
            addPart('box', 'wood', -w * 0.58, h * 0.35, 0, 0.12, h * 0.70, d * 0.78, varyColor([0.34, 0.25, 0.16], rng, 0.05));
          } else if (c === 'West African') {
            // Round mud hut with conical thatch roof
            const radius = Math.min(w, d) / 2;
            if (rng() < 0.45) {
              addPart('box', 'mud', 0, h * 0.42, 0, w * 1.25, h * 0.84, d * 0.86, wallColor);
              addPart('gableRoof', 'straw', 0, h + 0.58, 0, w * 0.82, 1.15, d * 0.68, roofColor);
              addPart('box', 'dark', 0, h * 0.34, d * 0.44, 0.68, h * 0.55, 0.10);
            } else {
              addPart('cylinder', 'mud', 0, h/2, 0, radius, h, radius, wallColor);
              addPart('roundCone', 'straw', 0, h + 0.85, 0, radius * 1.45, 1.7, radius * 1.45, roofColor);
              addPart('box', 'dark', 0, h*0.3, radius+0.05, 0.5, h*0.55, 0.1);
              for (let i = 0; i < 8; i++) {
                const angle = (i / 8) * Math.PI * 2;
                addPart(
                  'box',
                  'straw',
                  Math.cos(angle) * radius * 0.72,
                  h + 0.58,
                  Math.sin(angle) * radius * 0.72,
                  0.08,
                  0.08,
                  radius * 1.05,
                  varyColor(roofColor, rng, 0.10),
                  false,
                  -angle,
                );
              }
              addCircularMudWall(radius * 1.95, 0.20, 0.40, wallColor);
            }
          } else if (c === 'Indian Ocean') {
            // Stilted shack
            addPart('cylinder', 'wood', w/2-0.2, 0.5, d/2-0.2, 0.1, 1, 0.1);
            addPart('cylinder', 'wood', -w/2+0.2, 0.5, d/2-0.2, 0.1, 1, 0.1);
            addPart('cylinder', 'wood', w/2-0.2, 0.5, -d/2+0.2, 0.1, 1, 0.1);
            addPart('cylinder', 'wood', -w/2+0.2, 0.5, -d/2+0.2, 0.1, 1, 0.1);
            addPart('box', 'wood', 0, 1.5, 0, w, h, d, wallColor);
            addPart('cone', 'straw', 0, 1.5+h/2+0.5, 0, w/1.2, 1, d/1.2, roofColor);
            addPart('box', 'dark', 0, 1.3, d/2+0.05, 0.6, 1.0, 0.1);
          } else {
            addPart('box', 'wood', 0, h/2, 0, w, h, d, wallColor);
            addPart('cone', 'straw', 0, h+0.5, 0, w/1.2, 1, d/1.2, roofColor);
            addPart('box', 'dark', 0, h*0.35, d/2+0.05, 0.6, h*0.6, 0.1);
            addPart('box', 'dark', w/2+0.05, h*0.55, 0, 0.1, 0.4, 0.5);
          }
        }
        else {
          // ── House, Warehouse, Estate, Farmhouse ── (style-driven)
          const style = resolveStyle(port.buildingStyle, c);
          const wallBase = style.wallPalette[Math.floor(rng() * style.wallPalette.length)];
          const wallColor = varyColor(wallBase, rng, 0.05);
          const wallMat: Part['mat'] = style.wallMatHint ?? 'white';
          const shutters = style.shutterPalette;

          // Select a weighted house variant. House/farmhouse respect every
          // feature; estate/warehouse pick a variant for proportions but skip
          // silhouette-changing features (stilts/roundHut/windCatcher) that
          // would look wrong on a large rectangular building.
          let variant: HouseVariant;
          if (b.type === 'house' || b.type === 'farmhouse') {
            variant = pickVariant(style.houseVariants, rng);
          } else if (b.type === 'estate' || b.type === 'warehouse') {
            const picked = pickVariant(style.houseVariants, rng);
            variant = {
              weight: picked.weight,
              scaleMul: picked.scaleMul,
              roofGeoOverride: picked.roofGeoOverride,
              roofHMul: picked.roofHMul,
              roofScaleMul: picked.roofScaleMul,
              roofYOffset: picked.roofYOffset,
            };
          } else {
            variant = { weight: 1 };
          }
          const sm = variant.scaleMul ?? [1, 1, 1];
          const sw = w * sm[0];
          const sh = h * sm[1];
          const sd = d * sm[2];

          // Roof: farmhouse always thatch-cone; others draw from style palette
          let roofGeo: Part['geo'];
          let roofH: number;
          let roofColor: [number, number, number];
          let roofMatOverride: Part['mat'] | undefined;
          if (b.type === 'farmhouse') {
            roofGeo = 'cone';
            roofH = 1.2;
            roofColor = varyColor(BASE_COLORS.straw, rng, 0.08);
            roofMatOverride = 'straw';
          } else {
            const roofChoice = style.roofPalette[Math.floor(rng() * style.roofPalette.length)];
            roofGeo = roofChoice.geo;
            roofH = roofChoice.h;
            roofColor = varyColor(roofChoice.color, rng, 0.06);
            roofMatOverride = roofChoice.mat;
          }
          if (variant.roofGeoOverride) roofGeo = variant.roofGeoOverride;
          if (variant.roofHMul) roofH *= variant.roofHMul;
          const roofBaseMat: Part['mat'] = roofMatOverride ?? (roofGeo === 'box' ? 'mud' : 'terracotta');
          const roofMat: Part['mat'] =
            roofGeo === 'box' ? roofBaseMat
            : roofBaseMat === 'straw' ? 'thatchRoof'
            : roofBaseMat === 'wood' ? 'woodRoof'
            : roofBaseMat === 'terracotta' ? 'tileRoof'
            : roofBaseMat;
          let roofRenderGeo: Part['geo'] = roofGeo;
          if (port.buildingStyle === 'english-tudor' && b.type !== 'farmhouse') {
            roofRenderGeo = 'gableRoof';
          } else if (roofGeo === 'cone' && b.type !== 'farmhouse') {
            const shapeRoll = rng();
            if (roofMat === 'tileRoof') {
              roofRenderGeo = port.buildingStyle === 'dutch-brick'
                ? 'gableRoof'
                : shapeRoll < 0.48 ? 'cone' : shapeRoll < 0.90 ? 'gableRoof' : 'shedRoof';
            } else if (roofMat === 'thatchRoof') {
              roofRenderGeo = port.buildingStyle === 'english-tudor'
                ? 'gableRoof'
                : shapeRoll < 0.68 ? 'cone' : 'gableRoof';
            } else if (roofMat === 'woodRoof') {
              roofRenderGeo = port.buildingStyle === 'dutch-brick'
                ? 'gableRoof'
                : shapeRoll < 0.24 ? 'cone' : shapeRoll < 0.86 ? 'gableRoof' : 'shedRoof';
            }
          }

          const feat = variant.features ?? {};
          const stilted = !!feat.stilts && (b.type === 'house' || b.type === 'farmhouse');
          const stiltLift = stilted ? 1.2 : 0;
          const roofScaleMul = variant.roofScaleMul ?? [1, 1, 1];
          const roofPitchMul = roofGeo === 'cone'
            ? port.buildingStyle === 'dutch-brick'
              ? 0.90 + rng() * 0.18
              : port.buildingStyle === 'english-tudor'
              ? 1.08 + rng() * 0.34
              : 0.84 + rng() * 0.48
            : 1;
          const roofYOffset = variant.roofYOffset ?? 0;
          const facadeKit = style.facadeKit;
          const frontZ = sd / 2 + 0.075;

          const addFrontOpenings = (
            bayCount: number,
            opts: {
              trim?: [number, number, number];
              shutter?: boolean;
              upperOnly?: boolean;
              highSmall?: boolean;
            } = {},
          ) => {
            const trim = opts.trim ?? varyColor([0.68, 0.64, 0.56], rng, 0.04);
            const count = Math.max(1, bayCount);
            const bayW = (sw * 0.86) / count;
            const startX = -((count - 1) * bayW) / 2;
            const floorCount = Math.max(1, Math.min(4, stories));
            for (let f = opts.upperOnly ? 1 : 0; f < floorCount; f++) {
              const wy = stiltLift + (sh * (f + 0.58)) / (floorCount + 0.15);
              if (wy > stiltLift + sh - 0.18) continue;
              for (let bay = 0; bay < count; bay++) {
                if ((bay + f + bi) % 5 === 0) continue;
                const bx = startX + bay * bayW;
                const ww = Math.min(opts.highSmall ? 0.24 : WINDOW_W, bayW * 0.34);
                const wh = opts.highSmall ? 0.24 : WINDOW_H;
                addPart('box', 'litWindow', bx, wy, frontZ + 0.055, ww, wh, 0.08);
                addPart('box', 'stone', bx, wy - wh * 0.62, frontZ + 0.065, ww + 0.14, 0.045, 0.08, trim);
                if (opts.shutter && shutters) {
                  const sc = varyColor(shutters[Math.floor(rng() * shutters.length)], rng, 0.055);
                  addPart('box', 'wood', bx - ww * 0.72, wy, frontZ + 0.075, 0.055, wh * 1.06, 0.07, sc);
                  addPart('box', 'wood', bx + ww * 0.72, wy, frontZ + 0.075, 0.055, wh * 1.06, 0.07, sc);
                }
              }
            }
          };

          const addHumanDoor = (doorX = 0, doorZ = frontZ + 0.06, trimColor?: [number, number, number]) => {
            const doorH = Math.min(HUMAN_DOOR_H, sh * 0.46);
            const doorW = Math.min(HUMAN_DOOR_W, sw * 0.24);
            const trim = trimColor ?? varyColor([0.58, 0.53, 0.45], rng, 0.04);
            addPart('box', 'dark', doorX, stiltLift + doorH / 2 + 0.08, doorZ, doorW, doorH, 0.09);
            addPart('box', 'stone', doorX, stiltLift + doorH + 0.18, doorZ + 0.01, doorW + 0.24, 0.08, 0.08, trim);
            if (!stilted) addPart('box', 'stone', doorX, 0.06, doorZ + 0.26, doorW + 0.20, 0.12, 0.34, trim);
          };

          const addRepairPatches = () => {
            if (!(b.type === 'house' || b.type === 'farmhouse' || b.type === 'warehouse' || b.type === 'estate')) return;
            if (sw < 2.6 || sh < 2.2 || rng() > 0.42) return;
            const patchMat: Part['mat'] = wallMat === 'wood' ? 'wood' : wallMat === 'mud' ? 'mud' : 'white';
            const patchBase: [number, number, number] = wallMat === 'mud'
              ? [0.78, 0.62, 0.40]
              : wallMat === 'wood'
              ? [0.62, 0.48, 0.34]
              : [0.96, 0.92, 0.82];
            const count = rng() < 0.25 && sw > 4 ? 2 : 1;
            for (let pi = 0; pi < count; pi++) {
              const px = (rng() - 0.5) * sw * 0.58;
              const py = stiltLift + sh * (0.34 + rng() * 0.38);
              const pw = Math.min(sw * 0.28, 0.45 + rng() * 0.55);
              const ph = Math.min(sh * 0.22, 0.32 + rng() * 0.46);
              addPart('box', patchMat, px, py, frontZ + 0.072, pw, ph, 0.045, varyColor(patchBase, rng, 0.055));
            }
            if (rng() < 0.34 && roofMat !== 'thatchRoof') {
              const roofPatchColor: [number, number, number] = roofMat === 'tileRoof'
                ? [0.92, 0.44, 0.30]
                : roofMat === 'woodRoof'
                ? [0.58, 0.44, 0.30]
                : [0.80, 0.72, 0.56];
              addPart('box', roofMat, (rng() - 0.5) * sw * 0.32, stiltLift + sh + roofH * 0.45, (rng() - 0.5) * sd * 0.32, sw * 0.18, 0.035, sd * 0.14, varyColor(roofPatchColor, rng, 0.05), false, rng() * Math.PI);
            }
          };

          if (port.buildingStyle === 'khoikhoi-minimal' && (b.type === 'house' || b.type === 'farmhouse')) {
            const matColor = varyColor([0.68, 0.58, 0.42], rng, 0.08);
            const hideColor = varyColor([0.52, 0.42, 0.30], rng, 0.06);
            addPart('box', 'mud', 0, sh * 0.32, 0, sw * 1.35, sh * 0.64, sd * 0.82, wallColor);
            addPart('cone', 'straw', 0, sh * 0.82, 0, sw * 0.92, 0.85, sd * 0.62, matColor);
            addPart('box', 'dark', 0, sh * 0.28, sd * 0.43, 0.72, sh * 0.45, 0.10);
            addPart('box', 'wood', -sw * 0.62, sh * 0.34, 0, 0.14, sh * 0.68, sd * 0.82, hideColor);
            addPart('box', 'wood', sw * 0.62, sh * 0.34, 0, 0.14, sh * 0.68, sd * 0.82, hideColor);
            if (b.type === 'farmhouse') {
              const pen = varyColor([0.32, 0.24, 0.16], rng, 0.05);
              addPart('box', 'wood', 0, 0.38, -sd * 0.86, sw * 1.45, 0.18, 0.18, pen);
              addPart('box', 'wood', -sw * 0.72, 0.38, -sd * 0.45, 0.18, 0.18, sd * 0.82, pen);
              addPart('box', 'wood', sw * 0.72, 0.38, -sd * 0.45, 0.18, 0.18, sd * 0.82, pen);
            }
            return;
          }

          if (port.buildingStyle === 'west-african-round' && (b.type === 'house' || b.type === 'farmhouse') && !feat.roundHut) {
            const compoundWall = varyColor(wallBase, rng, 0.07);
            const roof = varyColor(BASE_COLORS.straw, rng, 0.09);
            const roomCount = b.type === 'farmhouse' ? 3 : 2 + Math.floor(rng() * 2);
            const roomW = Math.max(1.45, sw * 0.58);
            const roomD = Math.max(1.25, sd * 0.48);
            const offsets: [number, number][] = roomCount === 2
              ? [[-roomW * 0.55, 0], [roomW * 0.55, 0]]
              : [[-roomW * 0.55, 0], [roomW * 0.55, 0], [0, -roomD * 0.95]];
            for (const [ox, oz] of offsets) {
              addPart('box', wallMat, ox, sh * 0.34, oz, roomW, sh * 0.68, roomD, varyColor(compoundWall, rng, 0.05));
              addPart('gableRoof', 'straw', ox, sh * 0.82, oz, roomW * 0.68, 0.95, roomD * 0.62, roof);
              addPart('box', 'dark', ox, sh * 0.25, oz + roomD * 0.51, 0.48, sh * 0.38, 0.10);
            }
            if (b.type === 'farmhouse') {
              addPart('box', wallMat, 0, 0.28, -sd * 0.70, sw * 1.15, 0.56, 0.16, varyColor(compoundWall, rng, 0.06));
              addPart('box', wallMat, -sw * 0.58, 0.28, -sd * 0.30, 0.16, 0.56, sd * 0.80, varyColor(compoundWall, rng, 0.06));
            }
            addPart('box', 'wood', 0, 0.12, roomD * 0.68, sw * 0.42, 0.12, 0.44, varyColor([0.36, 0.25, 0.16], rng, 0.05));
            addPart('box', 'straw', -sw * 0.10, 1.10, roomD * 0.72, sw * 0.62, 0.10, 0.72, varyColor([0.58, 0.48, 0.28], rng, 0.08));
            addPart('cylinder', 'wood', -sw * 0.42, 0.62, roomD * 0.72, 0.055, 1.24, 0.055, varyColor([0.30, 0.20, 0.12], rng, 0.04));
            addPart('cylinder', 'wood', sw * 0.22, 0.62, roomD * 0.72, 0.055, 1.24, 0.055, varyColor([0.30, 0.20, 0.12], rng, 0.04));
            for (let rack = 0; rack < 3; rack++) {
              addPart('box', 'wood', -sw * 0.40 + rack * sw * 0.18, 0.50, roomD * 1.05, sw * 0.12, 0.05, 0.42, varyColor([0.40, 0.22, 0.10], rng, 0.08));
            }
            if (b.type === 'farmhouse') {
              addPart('cylinder', wallMat, -sw * 0.95, 0.60, -sd * 0.55, 0.42, 1.2, 0.42, varyColor(compoundWall, rng, 0.08));
              addPart('cone', 'straw', -sw * 0.95, 1.45, -sd * 0.55, 0.56, 0.70, 0.56, roof);
            }
            return;
          }

          const portugueseAfricanHouse =
            port.buildingStyle === 'west-african-round' &&
            PORT_FACTION[port.id] === 'Portuguese' &&
            (b.type === 'house' || b.type === 'estate') &&
            (
              b.district === 'urban-core' ||
              b.district === 'waterside' ||
              b.district === 'elite-residential' ||
              rng() < 0.18
            );

          if (portugueseAfricanHouse) {
            const lime = varyColor(
              rng() < 0.45 ? [0.88, 0.82, 0.68] : [0.96, 0.92, 0.82],
              rng,
              0.045,
            );
            const earth = varyColor(
              rng() < 0.45 ? [0.70, 0.38, 0.24] : [0.50, 0.34, 0.22],
              rng,
              0.055,
            );
            const tile = varyColor(
              rng() < 0.65 ? [0.72, 0.24, 0.18] : [0.66, 0.52, 0.28],
              rng,
              0.06,
            );
            const bodyW = sw * (b.type === 'estate' ? 1.0 : 0.88);
            const bodyD = sd * (b.type === 'estate' ? 0.88 : 0.76);
            const bodyH = sh * (b.type === 'estate' ? 0.94 : 0.82);
            addPart('box', rng() < 0.62 ? 'white' : 'mud', 0, bodyH / 2, 0, bodyW, bodyH, bodyD, rng() < 0.62 ? lime : earth);
            addPart('gableRoof', rng() < 0.70 ? 'tileRoof' : 'thatchRoof', 0, bodyH + 0.42, 0, bodyW * 0.58, 0.84, bodyD * 0.62, tile);
            addPart('box', 'stone', 0, 0.09, 0, bodyW + 0.16, 0.18, bodyD + 0.16, varyColor([0.54, 0.50, 0.42], rng, 0.04));
            addPart('box', 'dark', 0, bodyH * 0.36, bodyD / 2 + 0.055, 0.54, bodyH * 0.56, 0.10);
            for (const sx of [-0.28, 0.28]) {
              addPart('box', 'litWindow', sx * bodyW, bodyH * 0.62, bodyD / 2 + 0.06, 0.28, 0.32, 0.06);
              addPart('box', 'wood', sx * bodyW, bodyH * 0.62, bodyD / 2 + 0.085, 0.38, 0.42, 0.035, varyColor([0.34, 0.22, 0.14], rng, 0.04));
            }
            if (b.type === 'estate') {
              addPart('box', 'white', -bodyW * 0.56, bodyH * 0.30, bodyD * 0.20, bodyW * 0.28, bodyH * 0.58, bodyD * 0.42, lime);
              addPart('gableRoof', 'tileRoof', -bodyW * 0.56, bodyH + 0.30, bodyD * 0.20, bodyW * 0.22, 0.58, bodyD * 0.36, tile);
            }
            return;
          }

          if (port.buildingStyle === 'swahili-coral' && (b.type === 'house' || b.type === 'farmhouse')) {
            const coral = varyColor([0.78, 0.72, 0.60], rng, 0.055);
            const lime = varyColor([0.88, 0.84, 0.74], rng, 0.035);
            const shadow = varyColor([0.38, 0.34, 0.28], rng, 0.035);
            addPart('box', 'stone', 0, sh * 0.45, 0, sw * 1.05, sh * 0.90, sd * 1.0, coral);
            addPart('box', 'white', 0, sh * 0.93, 0, sw * 1.12, 0.22, sd * 1.08, lime);
            addPart('box', 'white', 0, sh * 0.98, sd * 0.52, sw * 1.12, 0.28, 0.16, lime);
            addPart('box', 'white', sw * 0.52, sh * 0.98, 0, 0.16, 0.28, sd * 1.04, lime);
            addPart('box', 'white', -sw * 0.52, sh * 0.98, 0, 0.16, 0.28, sd * 1.04, lime);
            addPart('box', 'white', 0, sh * 0.70, sd * 0.52, sw * 0.86, 0.18, 0.12, lime);
            addPart('box', 'dark', 0, sh * 0.32, sd * 0.53, Math.min(0.62, sw * 0.24), Math.min(0.92, sh * 0.48), 0.10);
            addPart('box', 'stone', 0, sh * 0.55, sd * 0.535, Math.min(0.86, sw * 0.34), 0.08, 0.08, shadow);
            for (const ax of [-0.30, 0.30]) {
              addPart('box', 'dark', ax * sw, sh * 0.66, sd * 0.53, 0.26, 0.34, 0.08);
              addPart('box', 'stone', ax * sw, sh * 0.46, sd * 0.535, 0.34, 0.05, 0.08, shadow);
            }
            if (b.type === 'farmhouse') {
              addPart('box', 'wood', 0, 0.60, sd * 0.82, sw * 0.90, 0.16, 0.75, varyColor([0.28, 0.18, 0.12], rng, 0.05));
            } else if (rng() < 0.38) {
              addPart('box', 'stone', sw * 0.66, 0.42, -sd * 0.18, 0.16, 0.84, sd * 0.70, coral);
              addPart('box', 'stone', sw * 0.34, 0.42, -sd * 0.58, sw * 0.64, 0.84, 0.16, coral);
            }
            return;
          }

          // ── Round hut (house/farmhouse in west-african-round) ──
          if (feat.roundHut && (b.type === 'house' || b.type === 'farmhouse')) {
            const radius = Math.max(0.98, Math.min(sw, sd) * 0.64);
            const wallH = Math.max(1.18, sh * (b.type === 'farmhouse' ? 0.74 : 0.82));
            const roofRadius = radius * Math.max(1.12, 0.95 * Math.max(roofScaleMul[0], roofScaleMul[2]));
            const roofHeight = Math.max(1.18, roofH * 0.96 * roofScaleMul[1]);
            const wallTopY = wallH;
            const roofY = wallTopY + roofYOffset + roofHeight / 2 - 0.02;
            const mudColor = varyColor(wallColor, rng, 0.04);
            const darkerMud = varyColor([wallBase[0] * 0.62, wallBase[1] * 0.58, wallBase[2] * 0.52], rng, 0.04);

            addPart('cylinder', wallMat, 0, wallH / 2, 0, radius, wallH, radius, mudColor);
            addPart('cylinder', wallMat, 0, 0.08, 0, radius * 1.06, 0.16, radius * 1.06, darkerMud);
            addPart('roundCone', 'thatchRoof', 0, roofY, 0, roofRadius, roofHeight, roofRadius, roofColor);
            addPart('roundCone', 'straw', 0, wallTopY + 0.18, 0, roofRadius * 1.03, 0.32, roofRadius * 1.03, varyColor(roofColor, rng, 0.08));
            addPart('box', 'dark', 0, wallH * 0.34, radius + 0.04, radius * 0.34, wallH * 0.56, 0.10);

            for (let i = 0; i < 12; i++) {
              const angle = (i / 12) * Math.PI * 2;
              const midR = roofRadius * 0.50;
              addPart(
                'box',
                'straw',
                Math.cos(angle) * midR,
                wallTopY + roofHeight * 0.34,
                Math.sin(angle) * midR,
                0.055,
                0.07,
                roofRadius * 1.02,
                varyColor(roofColor, rng, 0.12),
                false,
                -angle,
              );
            }

            for (const [ringRadius, ringY, ringW] of [
              [roofRadius * 0.78, wallTopY + 0.34, 0.16],
              [roofRadius * 0.52, wallTopY + roofHeight * 0.52, 0.12],
              [roofRadius * 0.28, wallTopY + roofHeight * 0.74, 0.08],
            ] as const) {
              const segments = 14;
              for (let i = 0; i < segments; i++) {
                const angle = (i / segments) * Math.PI * 2;
                addPart(
                  'box',
                  'straw',
                  Math.cos(angle) * ringRadius,
                  ringY,
                  Math.sin(angle) * ringRadius,
                  ringW,
                  0.055,
                  ringRadius * 0.42,
                  varyColor(roofColor, rng, 0.09),
                  false,
                  -angle + Math.PI / 2,
                );
              }
            }

            if (port.buildingStyle === 'west-african-round') {
              const yardColor = varyColor(wallBase, rng, 0.08);
              addCircularMudWall(radius * 1.82, 0.20, 0.40, yardColor);
            }
            if (b.type === 'farmhouse') {
              const binColor = varyColor(wallBase, rng, 0.1);
              addPart('cylinder', wallMat, -radius - 1.25, 0.46, 0.45, 0.45, 0.92, 0.45, binColor);
              addPart('roundCone', 'straw', -radius - 1.25, 1.24, 0.45, 0.62, 0.64, 0.62, roofColor);
            }
          } else {
            // ── Foundation / plinth ──
            if (!stilted && b.type !== 'farmhouse') {
              const plinthColor = wallMat === 'mud'
                ? varyColor([0.48, 0.40, 0.30], rng, 0.055)
                : wallMat === 'wood'
                ? varyColor([0.34, 0.27, 0.20], rng, 0.055)
                : varyColor([0.62, 0.59, 0.53], rng, 0.045);
              addPart('box', wallMat === 'wood' ? 'wood' : 'stone', 0, PLINTH_H / 2, 0, sw + 0.24, PLINTH_H, sd + 0.24, plinthColor);
            }

            // ── Stilts (4 thin posts below the main box) ──
            if (stilted) {
              addPart('cylinder', 'wood', sw/2-0.2, stiltLift/2, sd/2-0.2, 0.1, stiltLift, 0.1);
              addPart('cylinder', 'wood', -sw/2+0.2, stiltLift/2, sd/2-0.2, 0.1, stiltLift, 0.1);
              addPart('cylinder', 'wood', sw/2-0.2, stiltLift/2, -sd/2+0.2, 0.1, stiltLift, 0.1);
              addPart('cylinder', 'wood', -sw/2+0.2, stiltLift/2, -sd/2+0.2, 0.1, stiltLift, 0.1);
            }

            // ── Main walls ──
            addPart('box', wallMat, 0, stiltLift + sh/2, 0, sw, sh, sd, wallColor);
            addRepairPatches();

            // ── Floor bands (multi-story townhouse read) ──
            // Thin horizontal stone courses between floors. Anchors at
            // 1/stories intervals of the wall height, slightly wider than the
            // wall so they cast a shadow line.
            if (stories > 1) {
              const bandColor = varyColor([0.48, 0.46, 0.42], rng, 0.06);
              for (let f = 1; f < stories; f++) {
                const by = stiltLift + (sh * f) / stories;
                addPart('box', 'stone', 0, by, 0, sw + 0.18, 0.14, sd + 0.18, bandColor);
              }
            }

            if (facadeKit === 'iberian-colonial' && (b.type === 'house' || b.type === 'estate')) {
              const trim = varyColor([0.78, 0.73, 0.64], rng, 0.04);
              const accent = shutters
                ? varyColor(shutters[Math.floor(rng() * shutters.length)], rng, 0.05)
                : varyColor([0.32, 0.46, 0.62], rng, 0.05);
              const bayCount = b.type === 'estate' ? 4 : Math.max(2, Math.min(4, Math.floor(sw / 1.35)));
              const bayW = (sw * 0.88) / bayCount;
              const startX = -((bayCount - 1) * bayW) / 2;
              addPart('box', 'stone', 0, stiltLift + 0.12, frontZ + 0.02, sw + 0.18, 0.14, 0.12, trim);
              addPart('box', 'stone', 0, stiltLift + sh * 0.96, frontZ + 0.02, sw + 0.10, 0.12, 0.12, trim);
              for (let bay = 0; bay < bayCount; bay++) {
                const bx = startX + bay * bayW;
                const archH = Math.min(0.82, sh * 0.34);
                addPart('box', 'dark', bx, stiltLift + archH * 0.46 + 0.08, frontZ + 0.065, bayW * 0.48, archH, 0.08);
                addPart('cylinder', 'stone', bx - bayW * 0.30, stiltLift + archH * 0.46, frontZ + 0.10, 0.055, archH * 0.92, 0.055, trim);
                addPart('cylinder', 'stone', bx + bayW * 0.30, stiltLift + archH * 0.46, frontZ + 0.10, 0.055, archH * 0.92, 0.055, trim);
                if (stories > 1) {
                  const wy = stiltLift + sh * 0.68;
                  addPart('box', 'litWindow', bx, wy, frontZ + 0.065, Math.min(WINDOW_W, bayW * 0.32), WINDOW_H, 0.08);
                  addPart('box', 'wood', bx - bayW * 0.20, wy, frontZ + 0.075, 0.055, WINDOW_H * 1.15, 0.07, accent);
                  addPart('box', 'wood', bx + bayW * 0.20, wy, frontZ + 0.075, 0.055, WINDOW_H * 1.15, 0.07, accent);
                }
              }
              if (rng() < 0.55) {
                addPart('box', 'wood', 0, stiltLift + sh * 0.52, frontZ + 0.26, sw * 0.62, 0.08, 0.16, accent);
                for (const bx of [-0.28, 0, 0.28]) {
                  addPart('cylinder', 'wood', bx * sw, stiltLift + sh * 0.42, frontZ + 0.28, 0.035, sh * 0.22, 0.035, accent);
                }
              }
            }

            if (facadeKit === 'malay-stilted' && (b.type === 'house' || b.type === 'farmhouse')) {
              const timber = varyColor([0.30, 0.20, 0.12], rng, 0.055);
              const deckY = Math.max(0.18, stiltLift + 0.08);
              addPart('box', 'wood', 0, deckY, frontZ + 0.48, sw + 0.32, 0.14, 0.82, timber);
              const postCount = Math.max(2, Math.min(4, Math.floor(sw / 1.15)));
              for (let p = 0; p < postCount; p++) {
                const px = postCount === 1 ? 0 : -sw * 0.42 + (sw * 0.84 * p) / (postCount - 1);
                addPart('cylinder', 'wood', px, stiltLift + sh * 0.34, frontZ + 0.86, 0.05, sh * 0.68, 0.05, timber);
              }
              addPart('box', 'wood', 0, stiltLift + sh * 0.70, frontZ + 0.86, sw * 0.92, 0.10, 0.10, timber);
              addHumanDoor(0, frontZ + 0.08, timber);
              addFrontOpenings(2, { trim: timber, highSmall: true });
            }

            if (port.buildingStyle === 'dutch-brick' && (b.type === 'house' || b.type === 'estate')) {
              const frontZ = sd / 2 + 0.075;
              const trim = varyColor([0.72, 0.68, 0.60], rng, 0.04);
              const bayCount = b.type === 'house'
                ? Math.max(2, Math.min(4, Math.floor(sw / 1.65)))
                : 3;
              const bayGap = 0.035;
              const bayW = (sw * 0.94) / bayCount;
              const startX = -((bayCount - 1) * bayW) / 2;

              for (let bay = 0; bay < bayCount; bay++) {
                const bx = startX + bay * bayW;
                const facade = varyColor(wallBase, rng, 0.045);
                const facadeW = bayW - bayGap;
                const bayH = sh * (0.92 + rng() * 0.10);
                const gableBaseY = stiltLift + bayH + 0.12;
                const gableStyle = rng();

                addPart('box', wallMat, bx, stiltLift + bayH / 2, frontZ, facadeW, bayH, 0.16, facade);
                addPart('box', 'stone', bx, stiltLift + 0.10, frontZ + 0.015, facadeW + 0.08, 0.12, 0.18, trim);
                addPart('box', 'stone', bx, stiltLift + bayH + 0.04, frontZ + 0.015, facadeW + 0.06, 0.09, 0.18, trim);

                if (gableStyle < 0.62) {
                  const steps = 3;
                  for (let s = 0; s < steps; s++) {
                    const stepW = facadeW * (1 - s * 0.20);
                    const stepY = gableBaseY + s * 0.20;
                    addPart('box', wallMat, bx, stepY, frontZ + 0.01, stepW, 0.20, 0.18, facade);
                    addPart('box', 'stone', bx, stepY + 0.12, frontZ + 0.025, stepW + 0.05, 0.045, 0.18, trim);
                  }
                } else {
                  addPart('box', wallMat, bx, gableBaseY + 0.06, frontZ + 0.01, facadeW * 0.84, 0.24, 0.18, facade);
                  addPart('box', wallMat, bx, gableBaseY + 0.32, frontZ + 0.01, facadeW * 0.48, 0.28, 0.18, facade);
                  addPart('box', 'stone', bx, gableBaseY + 0.48, frontZ + 0.025, facadeW * 0.56, 0.055, 0.18, trim);
                }

                const floorCount = Math.max(2, Math.min(4, stories));
                const doorW = Math.min(0.30, facadeW * 0.30);
                const doorH = Math.min(0.54, bayH / (floorCount + 1.8));
                addPart('box', 'dark', bx, stiltLift + doorH / 2 + 0.08, frontZ + 0.055, doorW, doorH, 0.08);
                addPart('box', 'stone', bx, stiltLift + doorH + 0.13, frontZ + 0.065, doorW + 0.16, 0.045, 0.08, trim);

                const windowW = Math.min(0.24, facadeW * 0.26);
                const windowH = Math.min(0.24, bayH / (floorCount * 4.4));
                for (let f = 1; f < floorCount; f++) {
                  if ((bay + f) % 3 === 0) continue;
                  const wy = stiltLift + (bayH * (f + 0.50)) / (floorCount + 0.35);
                  if (wy > stiltLift + bayH - 0.20) continue;
                  addPart('box', 'litWindow', bx, wy, frontZ + 0.055, windowW, windowH, 0.08);
                  addPart('box', 'stone', bx, wy - windowH * 0.58, frontZ + 0.065, windowW + 0.14, 0.045, 0.08, trim);
                }

                if (rng() < 0.32) {
                  addPart('box', 'wood', bx, gableBaseY + 0.34, frontZ + 0.30, 0.08, 0.08, 0.46, varyColor([0.18, 0.14, 0.10], rng, 0.04));
                  addPart('box', 'dark', bx, gableBaseY + 0.10, frontZ + 0.50, 0.12, 0.22, 0.05);
                }
              }
            }

            if (port.buildingStyle === 'english-tudor' && (b.type === 'house' || b.type === 'estate')) {
              const frontZ = sd / 2 + 0.075;
              const timber = varyColor([0.18, 0.12, 0.08], rng, 0.035);
              const daub = varyColor(wallBase[0] < 0.45 ? [0.70, 0.62, 0.48] : wallBase, rng, 0.035);
              const bayCount = b.type === 'house'
                ? Math.max(1, Math.min(3, Math.floor(sw / 1.45)))
                : 3;
              const bayW = (sw * 0.92) / bayCount;
              const startX = -((bayCount - 1) * bayW) / 2;
              const facadeH = sh * 0.92;

              addPart('box', wallMat, 0, stiltLift + facadeH / 2, frontZ, sw * 0.94, facadeH, 0.14, daub);
              addPart('box', 'wood', 0, stiltLift + 0.16, frontZ + 0.035, sw * 0.98, 0.16, 0.10, timber);
              addPart('box', 'wood', 0, stiltLift + facadeH + 0.02, frontZ + 0.035, sw * 0.98, 0.14, 0.10, timber);

              for (let bay = 0; bay < bayCount; bay++) {
                const bx = startX + bay * bayW;
                const halfBay = bayW * 0.44;
                const storyCount = Math.max(1, Math.min(3, stories));

                addPart('box', 'wood', bx - halfBay, stiltLift + facadeH / 2, frontZ + 0.04, 0.10, facadeH, 0.10, timber);
                addPart('box', 'wood', bx + halfBay, stiltLift + facadeH / 2, frontZ + 0.04, 0.10, facadeH, 0.10, timber);
                for (let f = 1; f < storyCount; f++) {
                  const beamY = stiltLift + (facadeH * f) / storyCount;
                  addPart('box', 'wood', bx, beamY, frontZ + 0.045, bayW * 0.90, 0.10, 0.10, timber);
                }

                if ((bay + bi) % 2 === 0) {
                  addPart('box', 'wood', bx, stiltLift + facadeH * 0.55, frontZ + 0.05, 0.08, facadeH * 0.50, 0.10, timber);
                }

                if (bay === Math.floor(bayCount / 2)) {
                  const doorH = Math.min(0.78, facadeH * 0.30);
                  addPart('box', 'dark', bx, stiltLift + doorH / 2 + 0.08, frontZ + 0.06, Math.min(0.42, bayW * 0.34), doorH, 0.08);
                  addPart('box', 'wood', bx, stiltLift + doorH + 0.16, frontZ + 0.07, Math.min(0.56, bayW * 0.46), 0.08, 0.08, timber);
                }

                for (let f = 1; f < storyCount; f++) {
                  const wy = stiltLift + (facadeH * (f + 0.48)) / (storyCount + 0.20);
                  if (wy > stiltLift + facadeH - 0.18) continue;
                  addPart('box', 'litWindow', bx, wy, frontZ + 0.065, Math.min(0.34, bayW * 0.28), 0.22, 0.06);
                  addPart('box', 'wood', bx, wy - 0.15, frontZ + 0.075, Math.min(0.46, bayW * 0.38), 0.055, 0.06, timber);
                }
              }
            }

            if (port.buildingStyle === 'malabar-hindu' && (b.type === 'house' || b.type === 'estate')) {
              const frontZ = sd / 2 + 0.075;
              const timber = varyColor([0.24, 0.15, 0.08], rng, 0.04);
              const laterite = varyColor([0.62, 0.42, 0.28], rng, 0.05);
              const verandaD = 0.62;
              addPart('box', 'mud', 0, stiltLift + sh * 0.44, frontZ, sw * 0.92, sh * 0.88, 0.14, laterite);
              addPart('box', 'wood', 0, stiltLift + sh * 0.70, frontZ + 0.09, sw * 1.08, 0.12, 0.12, timber);
              addPart('box', 'wood', 0, stiltLift + sh * 0.16, frontZ + 0.09, sw * 1.08, 0.12, 0.12, timber);
              addPart('box', 'wood', 0, stiltLift + 0.16, frontZ + verandaD, sw * 1.18, 0.16, verandaD, timber);
              const postCount = Math.max(2, Math.min(4, Math.floor(sw / 1.25)));
              for (let p = 0; p < postCount; p++) {
                const px = postCount === 1 ? 0 : -sw * 0.42 + (sw * 0.84 * p) / (postCount - 1);
                addPart('cylinder', 'wood', px, stiltLift + sh * 0.36, frontZ + verandaD * 0.92, 0.055, sh * 0.72, 0.055, timber);
              }
              const doorH = Math.min(0.78, sh * 0.28);
              addPart('box', 'dark', 0, stiltLift + doorH / 2 + 0.10, frontZ + 0.16, Math.min(0.45, sw * 0.18), doorH, 0.08);
              for (const wx of [-0.28, 0.28]) {
                addPart('box', 'litWindow', wx * sw, stiltLift + sh * 0.52, frontZ + 0.16, Math.min(0.34, sw * 0.16), 0.24, 0.08);
                addPart('box', 'wood', wx * sw, stiltLift + sh * 0.36, frontZ + 0.17, Math.min(0.46, sw * 0.22), 0.06, 0.08, timber);
              }
            }

            if (port.buildingStyle === 'mughal-gujarati' && (b.type === 'house' || b.type === 'estate')) {
              const frontZ = sd / 2 + 0.075;
              const trim = varyColor([0.74, 0.68, 0.54], rng, 0.04);
              const plaster = varyColor(wallBase, rng, 0.035);
              const bayCount = b.type === 'estate' ? 3 : Math.max(2, Math.min(3, Math.floor(sw / 1.55)));
              const bayW = (sw * 0.88) / bayCount;
              const startX = -((bayCount - 1) * bayW) / 2;
              addPart('box', wallMat, 0, stiltLift + sh * 0.50, frontZ, sw * 0.94, sh, 0.14, plaster);
              addPart('box', 'stone', 0, stiltLift + 0.12, frontZ + 0.02, sw * 0.98, 0.14, 0.14, trim);
              addPart('box', 'stone', 0, stiltLift + sh + 0.06, frontZ + 0.02, sw * 0.92, 0.12, 0.14, trim);
              for (let bay = 0; bay < bayCount; bay++) {
                const bx = startX + bay * bayW;
                const jharokhaY = stiltLift + sh * 0.64;
                addPart('box', 'stone', bx, jharokhaY, frontZ + 0.18, bayW * 0.54, 0.48, 0.26, trim);
                addPart('box', 'litWindow', bx, jharokhaY, frontZ + 0.33, bayW * 0.34, 0.30, 0.08);
                addPart('box', 'stone', bx, jharokhaY - 0.28, frontZ + 0.34, bayW * 0.68, 0.08, 0.20, trim);
                addPart('box', 'stone', bx - bayW * 0.25, jharokhaY - 0.18, frontZ + 0.26, 0.08, 0.32, 0.08, trim);
                addPart('box', 'stone', bx + bayW * 0.25, jharokhaY - 0.18, frontZ + 0.26, 0.08, 0.32, 0.08, trim);
              }
              const doorH = Math.min(0.88, sh * 0.30);
              addPart('box', 'dark', 0, stiltLift + doorH / 2 + 0.10, frontZ + 0.08, Math.min(0.52, sw * 0.20), doorH, 0.08);
              addPart('box', 'stone', 0, stiltLift + doorH + 0.16, frontZ + 0.09, Math.min(0.72, sw * 0.28), 0.08, 0.08, trim);
              if (b.type === 'estate') {
                addPart('box', 'stone', 0, stiltLift + sh + 0.36, 0, sw * 0.34, 0.28, sd * 0.34, trim);
                addPart('dome', 'stone', 0, stiltLift + sh + 0.62, 0, sw * 0.18, 0.34, sd * 0.18, trim);
              }
            }


            // ── Roof ──
            const roofBase = stiltLift + sh;
            const roofW = sw * roofScaleMul[0];
            const roofHeight = roofH * roofScaleMul[1] * roofPitchMul;
            const roofD = sd * roofScaleMul[2];
            if (roofGeo === 'box') {
              const parapetLip = feat.flatRoofParapet ? 0.6 : 0.4;
              addPart('box', roofMat, 0, roofBase + roofYOffset + roofHeight/2, 0, roofW + parapetLip, roofHeight, roofD + parapetLip, roofColor);
              if (feat.flatRoofParapet && b.type !== 'warehouse') {
                // small raised parapet rim on top of the roof slab
                const parapetColor = varyColor(wallBase, rng, 0.04);
                addPart('box', wallMat, 0, roofBase + roofYOffset + roofHeight + 0.15, 0, roofW + 0.3, 0.24, roofD + 0.3, parapetColor);
              }
            } else {
              const roofOverhang = feat.deepEaves ? 1.08 : 1.0;
              const gableRotatesToLongAxis = roofRenderGeo === 'gableRoof' && roofD > roofW;
              const roofPartW = (gableRotatesToLongAxis ? roofD : roofW) * roofOverhang;
              const roofPartD = (gableRotatesToLongAxis ? roofW : roofD) * roofOverhang;
              addPart(roofRenderGeo, roofMat, 0, roofBase + roofYOffset + roofHeight/2, 0, roofPartW, roofHeight, roofPartD, roofColor, false, gableRotatesToLongAxis ? Math.PI / 2 : 0);

              const roofAccessoryEligible =
                b.type !== 'warehouse' &&
                b.type !== 'farmhouse' &&
                !feat.roundHut &&
                !stilted &&
                roofRenderGeo !== 'shedRoof';
              if (roofAccessoryEligible) {
                if (shutters && roofMat !== 'thatchRoof' && rng() < 0.42) {
                  const chimneyX = (rng() < 0.5 ? -1 : 1) * roofW * (0.18 + rng() * 0.12);
                  const chimneyZ = (rng() < 0.5 ? -1 : 1) * roofD * (0.10 + rng() * 0.14);
                  const chimneyY = roofBase + roofYOffset + roofHeight * (roofRenderGeo === 'gableRoof' ? 0.78 : 0.64);
                  const chimneyColor = varyColor(roofMat === 'woodRoof' ? [0.30, 0.27, 0.24] : [0.56, 0.53, 0.48], rng, 0.05);
                  addPart('box', roofMat === 'tileRoof' ? 'stone' : 'wood', chimneyX, chimneyY + 0.28, chimneyZ, 0.34, 0.72, 0.34, chimneyColor);
                  addPart('box', 'dark', chimneyX, chimneyY + 0.66, chimneyZ, 0.26, 0.08, 0.26);
                  if (rng() < 0.34) {
                    smokeSpots.push({
                      pos: localToWorld(chimneyX, chimneyY + 0.78, chimneyZ),
                      seed: bi * 137 + (x * 100 | 0),
                    });
                  }
                } else if (roofMat === 'thatchRoof' && rng() < 0.44) {
                  const ventX = (rng() - 0.5) * roofW * 0.28;
                  const ventZ = (rng() - 0.5) * roofD * 0.28;
                  const ventY = roofBase + roofYOffset + roofHeight * 0.72;
                  addPart('cylinder', 'dark', ventX, ventY, ventZ, 0.16, 0.05, 0.16);
                  if (rng() < 0.24) {
                    smokeSpots.push({
                      pos: localToWorld(ventX, ventY + 0.18, ventZ),
                      seed: bi * 173 + (z * 100 | 0),
                    });
                  }
                }

                if (rng() < 0.34) {
                  const patchCount = rng() < 0.25 ? 2 : 1;
                  for (let pi = 0; pi < patchCount; pi++) {
                    const patchX = (rng() - 0.5) * roofW * 0.42;
                    const patchZ = (rng() - 0.5) * roofD * 0.42;
                    const patchY = roofBase + roofYOffset + roofHeight * (0.48 + rng() * 0.18);
                    const patchColor = varyColor([
                      roofColor[0] * (0.72 + rng() * 0.20),
                      roofColor[1] * (0.72 + rng() * 0.20),
                      roofColor[2] * (0.72 + rng() * 0.20),
                    ], rng, 0.03);
                    addPart('box', roofMat, patchX, patchY, patchZ, roofW * (0.16 + rng() * 0.10), 0.035, roofD * (0.12 + rng() * 0.08), patchColor, false, rng() * Math.PI);
                  }
                }
              }
            }

            // ── Wind-catcher (badgir) on top of flat roof ──
            if (feat.windCatcher) {
              const wcColor = varyColor(wallBase, rng, 0.04);
              addPart('box', wallMat, sw/4, roofBase + roofH + 0.7, -sd/4, 0.6, 1.2, 0.6, wcColor);
              // Small open slit on top face (dark) implied by a dark thin box
              addPart('box', 'dark', sw/4, roofBase + roofH + 1.25, -sd/4, 0.5, 0.1, 0.5);
            }

            if (b.type === 'warehouse') {
              const frontZ = sd / 2 + 0.08;
              const trim = varyColor([0.66, 0.62, 0.56], rng, 0.04);
              addGroundSkirt(sw + 1.0, sd + 1.1, varyColor([0.46, 0.39, 0.30], rng, 0.045), b.district === 'waterside' ? 'stone' : wallMat, 0.13);
              if (b.district === 'waterside') {
                const quay = varyColor([0.58, 0.53, 0.44], rng, 0.04);
                addPart('box', 'stone', 0, 0.04, frontZ + 0.52, sw + 0.9, 0.12, 0.75, quay, true);
                for (let post = 0; post < Math.max(2, Math.min(5, Math.floor(sw / 1.5))); post++) {
                  const px = -sw * 0.42 + (sw * 0.84 * post) / Math.max(1, Math.max(2, Math.min(5, Math.floor(sw / 1.5))) - 1);
                  addPart('cylinder', 'wood', px, 0.45, frontZ + 0.78, 0.09, 0.90, 0.09, varyColor(BASE_COLORS.wood, rng, 0.08));
                }
                addCrateStack(-sw * 0.32, frontZ + 0.72, 0.70);
                addRopeCoil(sw * 0.30, frontZ + 0.76, 0.26);
              }
              if (port.buildingStyle === 'dutch-brick') {
                const bayCount = Math.max(3, Math.min(5, Math.floor(sw / 1.8)));
                const bayW = (sw * 0.94) / bayCount;
                const startX = -((bayCount - 1) * bayW) / 2;
                addPart('box', 'stone', 0, 0.10, frontZ + 0.02, sw + 0.16, 0.16, 0.18, trim);
                for (let bay = 0; bay < bayCount; bay++) {
                  const bx = startX + bay * bayW;
                  const facade = varyColor(wallBase, rng, 0.035);
                  addPart('box', wallMat, bx, stiltLift + sh * 0.50, frontZ, bayW - 0.04, sh, 0.16, facade);
                  addPart('box', 'dark', bx, stiltLift + sh * 0.20, frontZ + 0.055, Math.min(0.42, bayW * 0.34), sh * 0.24, 0.08);
                  addPart('box', 'stone', bx, stiltLift + sh * 0.36, frontZ + 0.065, Math.min(0.62, bayW * 0.46), 0.05, 0.08, trim);
                  if (bay % 2 === 0) {
                    addPart('box', 'litWindow', bx, stiltLift + sh * 0.66, frontZ + 0.055, Math.min(0.24, bayW * 0.22), 0.20, 0.08);
                  }
                  const gableY = stiltLift + sh + 0.14;
                  for (let s = 0; s < 3; s++) {
                    const stepW = bayW * (0.82 - s * 0.18);
                    addPart('box', wallMat, bx, gableY + s * 0.18, frontZ + 0.01, stepW, 0.18, 0.18, facade);
                    addPart('box', 'stone', bx, gableY + s * 0.18 + 0.10, frontZ + 0.025, stepW + 0.05, 0.04, 0.18, trim);
                  }
                }
                if (rng() < 0.55) {
                  addPart('box', 'wood', sw * 0.36, stiltLift + sh + 0.34, frontZ + 0.38, 0.12, 0.10, 0.70, varyColor([0.18, 0.14, 0.10], rng, 0.04));
                }
              } else if (
                port.buildingStyle === 'iberian' ||
                port.buildingStyle === 'luso-colonial' ||
                port.buildingStyle === 'luso-brazilian' ||
                port.buildingStyle === 'spanish-caribbean'
              ) {
                const arcadeCount = Math.max(3, Math.min(5, Math.floor(sw / 1.5)));
                const bayW = sw / arcadeCount;
                for (let i = 0; i < arcadeCount; i++) {
                  const bx = -sw / 2 + bayW * (i + 0.5);
                  addPart('box', 'dark', bx, stiltLift + sh * 0.22, frontZ + 0.055, bayW * 0.48, sh * 0.34, 0.08);
                  addPart('cylinder', 'stone', bx - bayW * 0.30, stiltLift + sh * 0.25, frontZ + 0.10, 0.07, sh * 0.50, 0.07, trim);
                  addPart('cylinder', 'stone', bx + bayW * 0.30, stiltLift + sh * 0.25, frontZ + 0.10, 0.07, sh * 0.50, 0.07, trim);
                }
                addPart('box', 'stone', 0, stiltLift + sh * 0.50, frontZ + 0.08, sw + 0.2, 0.12, 0.10, trim);
              } else if (
                port.buildingStyle === 'swahili-coral' ||
                port.buildingStyle === 'arab-cubic' ||
              port.buildingStyle === 'persian-gulf'
            ) {
              const parapetColor = varyColor(wallBase, rng, 0.04);
                addPart('box', wallMat, 0, roofBase + roofYOffset + roofHeight + 0.13, 0, sw + 0.25, 0.20, sd + 0.25, parapetColor);
                addPart('box', 'dark', 0, stiltLift + sh * 0.24, frontZ + 0.055, Math.min(1.2, sw * 0.28), sh * 0.36, 0.08);
                addPart('box', 'stone', 0, stiltLift + sh * 0.45, frontZ + 0.065, Math.min(1.45, sw * 0.34), 0.07, 0.08, trim);
                addPart('box', 'litWindow', -sw * 0.28, stiltLift + sh * 0.68, frontZ + 0.055, 0.34, 0.26, 0.08);
                addPart('box', 'litWindow',  sw * 0.28, stiltLift + sh * 0.68, frontZ + 0.055, 0.34, 0.26, 0.08);
              } else if (port.buildingStyle === 'malabar-hindu') {
                const timber = varyColor([0.28, 0.17, 0.09], rng, 0.05);
                addPart('box', 'wood', 0, 0.14, frontZ + 0.42, sw * 1.18, 0.16, 0.82, timber);
                for (const px of [-0.42, -0.14, 0.14, 0.42]) {
                  addPart('cylinder', 'wood', px * sw, stiltLift + sh * 0.34, frontZ + 0.72, 0.055, sh * 0.68, 0.055, timber);
                }
                addPart('box', 'dark', 0, stiltLift + sh * 0.22, frontZ + 0.08, Math.min(1.25, sw * 0.30), sh * 0.32, 0.08);
                addPart('box', 'wood', 0, stiltLift + sh * 0.42, frontZ + 0.09, Math.min(1.45, sw * 0.36), 0.08, 0.08, timber);
              } else if (port.buildingStyle === 'mughal-gujarati') {
                const trimWarm = varyColor([0.76, 0.68, 0.50], rng, 0.04);
                if (port.id === 'masulipatnam') {
                  addPart('box', 'wood', -sw * 0.55, 0.90, frontZ + 1.0, 0.12, 1.8, 0.12, varyColor([0.30, 0.20, 0.12], rng, 0.04));
                  addPart('box', 'wood', sw * 0.55, 0.90, frontZ + 1.0, 0.12, 1.8, 0.12, varyColor([0.30, 0.20, 0.12], rng, 0.04));
                  addPart('box', 'wood', 0, 1.78, frontZ + 1.0, sw * 1.12, 0.10, 0.10, varyColor([0.30, 0.20, 0.12], rng, 0.04));
                  for (const cx of [-0.32, 0, 0.32]) {
                    addPart('box', 'white', cx * sw, 1.56, frontZ + 1.02, sw * 0.18, 0.08, 0.06, varyColor([0.82, 0.78, 0.68], rng, 0.03));
                    addPart('box', 'white', cx * sw, 1.28, frontZ + 1.02, sw * 0.18, 0.08, 0.06, varyColor([0.64, 0.34, 0.22], rng, 0.03));
                  }
                }
                addPart('box', 'dark', 0, stiltLift + sh * 0.24, frontZ + 0.055, Math.min(1.15, sw * 0.28), sh * 0.34, 0.08);
                addPart('box', 'stone', 0, stiltLift + sh * 0.44, frontZ + 0.065, Math.min(1.45, sw * 0.36), 0.07, 0.08, trimWarm);
                addPart('box', 'litWindow', -sw * 0.30, stiltLift + sh * 0.66, frontZ + 0.055, 0.32, 0.24, 0.08);
                addPart('box', 'litWindow',  sw * 0.30, stiltLift + sh * 0.66, frontZ + 0.055, 0.32, 0.24, 0.08);
              } else if (port.buildingStyle === 'malay-stilted') {
                const dockWood = varyColor([0.38, 0.27, 0.18], rng, 0.06);
                addPart('box', 'wood', 0, 0.70, 0, sw + 0.35, 0.18, sd + 0.35, dockWood);
                for (const sx of [-1, 1]) {
                  for (const sz of [-1, 1]) {
                    addPart('cylinder', 'wood', sx * sw * 0.42, 0.35, sz * sd * 0.42, 0.08, 0.70, 0.08, dockWood);
                  }
                }
                addPart('box', 'dark', 0, stiltLift + sh * 0.24, frontZ + 0.055, Math.min(1.2, sw * 0.34), sh * 0.34, 0.08);
              }
            }

            // ── Door with lintel and step ──
            const usesBespokeFacade =
              (
                port.buildingStyle === 'dutch-brick' ||
                port.buildingStyle === 'english-tudor' ||
                port.buildingStyle === 'malabar-hindu' ||
                port.buildingStyle === 'mughal-gujarati'
              ) &&
              (b.type === 'house' || b.type === 'estate');
            if (b.type !== 'warehouse' && !usesBespokeFacade) {
              const genericDoorH = Math.min(1.15, sh * 0.55);
              addPart('box', 'dark', 0, stiltLift + genericDoorH / 2 + 0.08, sd/2+0.05, 0.55, genericDoorH, 0.1);
              addPart('box', wallMat, 0, stiltLift + genericDoorH + 0.18, sd/2+0.06, 0.75, 0.1, 0.08, varyColor(wallBase, rng, 0.03));
              if (!stilted) {
                addPart('box', 'stone', 0, 0.06, sd/2+0.35, 0.7, 0.12, 0.3);
              }
            }

            // ── Veranda (thin slab porch + 2 posts) ──
            if (feat.veranda) {
              const verandaColor = varyColor(BASE_COLORS.wood, rng, 0.1);
              addPart('box', 'wood', 0, 0.12, sd/2 + 0.8, sw + 0.4, 0.16, 1.4, verandaColor);
              addPart('cylinder', 'wood', sw/2 - 0.2, sh*0.35, sd/2 + 1.3, 0.1, sh*0.7, 0.1, verandaColor);
              addPart('cylinder', 'wood', -sw/2 + 0.2, sh*0.35, sd/2 + 1.3, 0.1, sh*0.7, 0.1, verandaColor);
            }

            // ── Windows + shutters ──
            if (b.type === 'house' || b.type === 'farmhouse') {
              // One row of windows per floor, vertically centred on each story.
              const floorCount = Math.max(1, stories);
              for (let f = 0; f < floorCount; f++) {
                const wy = stiltLift + (sh * (f + 0.5)) / floorCount;
                const shutterOffsetY = stiltLift + (sh * (f + 0.28)) / floorCount;

                addPart('box', 'litWindow', sw/2+0.05, wy, 0, 0.1, 0.45, 0.55);
                addPart('box', 'litWindow', -sw/2-0.05, wy, 0, 0.1, 0.45, 0.55);
                if (shutters) {
                  const shutterBase = shutters[Math.floor(rng() * shutters.length)];
                  const sc = varyColor(shutterBase, rng, 0.06);
                  addPart('box', 'wood', sw/2+0.06, wy, 0.35, 0.06, 0.48, 0.12, sc);
                  addPart('box', 'wood', sw/2+0.06, wy, -0.35, 0.06, 0.48, 0.12, sc);
                  addPart('box', 'wood', -sw/2-0.06, wy, 0.35, 0.06, 0.48, 0.12, sc);
                  addPart('box', 'wood', -sw/2-0.06, wy, -0.35, 0.06, 0.48, 0.12, sc);
                  addPart('box', 'stone', sw/2+0.06, shutterOffsetY, 0, 0.08, 0.06, 0.65);
                  addPart('box', 'stone', -sw/2-0.06, shutterOffsetY, 0, 0.08, 0.06, 0.65);
                } else if (wallMat === 'mud' || wallMat === 'wood') {
                  // Simple wood frames for non-European styles
                  const frameColor = varyColor(BASE_COLORS.wood, rng, 0.08);
                  addPart('box', 'wood', sw/2+0.06, wy, 0, 0.04, 0.52, 0.04, frameColor);
                  addPart('box', 'wood', -sw/2-0.06, wy, 0, 0.04, 0.52, 0.04, frameColor);
                }
              }
            }
          }

          const hasStyledWarehouse =
            port.buildingStyle === 'dutch-brick' ||
            port.buildingStyle === 'iberian' ||
            port.buildingStyle === 'luso-colonial' ||
            port.buildingStyle === 'luso-brazilian' ||
            port.buildingStyle === 'spanish-caribbean' ||
            port.buildingStyle === 'swahili-coral' ||
            port.buildingStyle === 'arab-cubic' ||
            port.buildingStyle === 'persian-gulf' ||
            port.buildingStyle === 'malabar-hindu' ||
            port.buildingStyle === 'mughal-gujarati' ||
            port.buildingStyle === 'malay-stilted';

          if (b.type === 'warehouse' && !hasStyledWarehouse) {
            addPart('box', 'dark', 0, h*0.35, d/2+0.05, 1.8, h*0.6, 0.1);
            addPart('box', wallMat, 0, h*0.68, d/2+0.06, 2.0, 0.12, 0.08, varyColor(wallBase, rng, 0.03));
            addPart('box', 'litWindow', w/2+0.05, h*0.7, d/4, 0.1, 0.35, 0.4);
            addPart('box', 'litWindow', w/2+0.05, h*0.7, -d/4, 0.1, 0.35, 0.4);
            addPart('box', 'wood', w/2+1.0, 0.35, 0, 0.7, 0.7, 0.7, varyColor(BASE_COLORS.wood, rng, 0.15));
            addPart('box', 'wood', w/2+1.0, 0.25, 0.9, 0.5, 0.5, 0.5, varyColor(BASE_COLORS.wood, rng, 0.15));
            addPart('cylinder', 'wood', w/2+1.5, 0.3, -0.4, 0.3, 0.6, 0.3, varyColor(BASE_COLORS.wood, rng, 0.12));
          }

          // ── Estates ──
          if (b.type === 'estate') {
            if (c === 'West African') {
              // Compound with round outbuildings (existing behavior)
              const cColor = varyColor(wallBase, rng, 0.06);
              addPart('cylinder', 'mud', w/2+2.5, h*0.4, -d/4, 1.2, h*0.8, 1.2, cColor);
              addPart('cone', 'straw', w/2+2.5, h*0.8+0.6, -d/4, 1.5, 1.4, 1.5, roofColor);
              addPart('cylinder', 'mud', -w/2-2.0, h*0.35, d/4, 1.0, h*0.7, 1.0, varyColor(wallBase, rng, 0.08));
              addPart('cone', 'straw', -w/2-2.0, h*0.7+0.5, d/4, 1.3, 1.2, 1.3, roofColor);
              addPart('box', 'mud', w/2+1.5, 0.5, d/2+1.0, 0.3, 1.0, d+2, cColor);
              addPart('box', 'mud', 0, 0.5, -d/2-1.5, w+3, 1.0, 0.3, cColor);
              addPart('box', 'dark', 0, 0.35, d/2+1.05, 1.0, 0.7, 0.35);
            } else if (shutters) {
              // Two-story European-derived manor with shuttered upper windows + balcony
              addPart('box', wallMat, 0, h + h/2, 0, w-0.5, h, d-0.5, wallColor);
              if (roofGeo === 'box') {
                addPart('box', roofMat, 0, h*2 + roofH/2, 0, w, roofH, d, roofColor);
              } else {
                addPart('cone', roofMat, 0, h*2 + roofH/2, 0, w/1.2, roofH, d/1.2, roofColor);
              }
              const shutterBase = shutters[Math.floor(rng() * shutters.length)];
              const sc = varyColor(shutterBase, rng, 0.06);
              addPart('box', 'litWindow', w/2-0.2, h*1.55, d/2-0.2+0.05, 0.5, 0.45, 0.08);
              addPart('box', 'litWindow', -w/2+0.7, h*1.55, d/2-0.2+0.05, 0.5, 0.45, 0.08);
              addPart('box', 'wood', w/2-0.2, h*1.55, d/2+0.12, 0.14, 0.48, 0.06, sc);
              addPart('box', 'wood', -w/2+0.7, h*1.55, d/2+0.12, 0.14, 0.48, 0.06, sc);
              addPart('box', 'stone', 0, h + 0.1, d/2 + 0.5, w * 0.6, 0.1, 0.6);
              addPart('cylinder', 'wood', w*0.25, h + 0.4, d/2 + 0.75, 0.04, 0.5, 0.04);
              addPart('cylinder', 'wood', -w*0.25, h + 0.4, d/2 + 0.75, 0.04, 0.5, 0.04);
            } else {
              // Flat-roof two-story (Indian Ocean / Arab / Swahili / Persian-Gulf)
              addPart('box', wallMat, 0, h + h/2, 0, w-0.5, h, d-0.5, wallColor);
              addPart('box', roofMat, 0, h*2 + 0.2, 0, w, 0.4, d, roofColor);
              addPart('box', 'litWindow', w/2-0.2, h*1.55, d/2-0.2+0.05, 0.45, 0.4, 0.08);
              addPart('box', 'litWindow', -w/2+0.7, h*1.55, d/2-0.2+0.05, 0.45, 0.4, 0.08);
            }
            if (c !== 'West African') {
              addPart('box', 'litWindow', w/3, h*0.55, d/2+0.05, 0.6, 0.5, 0.08);
              addPart('box', 'litWindow', -w/3, h*0.55, d/2+0.05, 0.6, 0.5, 0.08);
            }
            addTorch(0.8, h * 0.7, d/2 + 0.3);
          }

          // Farmhouse — fence posts + trough
          if (b.type === 'farmhouse' && !feat.roundHut) {
            addPart('cylinder', 'wood', w/2+1.5, 0.35, d/2+1.5, 0.08, 0.7, 0.08);
            addPart('cylinder', 'wood', -w/2-1.5, 0.35, d/2+1.5, 0.08, 0.7, 0.08);
            addPart('cylinder', 'wood', w/2+1.5, 0.35, -d/2-1.5, 0.08, 0.7, 0.08);
            addPart('box', 'wood', -w/2-1.0, 0.25, 0, 0.5, 0.4, 1.0, varyColor(BASE_COLORS.wood, rng, 0.1));
          }
        }
      });
    });

    return { parts: allParts, torchSpots: torches, smokeSpots };
}

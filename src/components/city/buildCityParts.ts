import { PORT_FACTION, PORT_CULTURAL_REGION, useGameStore } from '../../store/gameStore';
import type { CulturalRegion, Nationality } from '../../store/gameStore';
import { applyShrineVariant } from '../../utils/shrineVariant';
import { AWNING_COLORS, pickVariant, resolveStyle } from './buildingStyles';
import type { HouseVariant } from './buildingStyles';
import type { Part, SmokeSpot, TorchSpot } from './cityTypes';
import { BASE_COLORS, mulberry32, varyColor } from './cityRandom';
import { CityPartBuilder } from './cityPartBuilder';

type PortsProp = ReturnType<typeof useGameStore.getState>['ports'];

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
          h *= 1 + (stories - 1) * 0.55;
          const northernUrbanCore =
            (port.buildingStyle === 'dutch-brick' || port.buildingStyle === 'english-tudor') &&
            b.district === 'urban-core' &&
            (b.type === 'house' || b.type === 'estate');
          const footprintGrowth = 1 + (stories - 1) * (northernUrbanCore ? 0.23 : 0.12);
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
            addPart('box', 'white', 0, 2.0, 0, 5, 4, 5, wash);
            addPart('box', 'dark', 0, 1.4, 2.55, 1.0, 2.0, 0.15);
            // Hero feature: dome + minaret stack
            addKey('dome', 'white', 0, 4.5, 0, 2.5, 2.5, 2.5, dome);
            addKey('box', 'white', 3.0, 1.5, 2.5, 1.2, 3, 1.2, wash);
            addKey('cylinder', 'white', 3.0, 6.5, 2.5, 0.45, 7, 0.45, wash);
            addKey('cylinder', 'white', 3.0, 10.2, 2.5, 0.65, 0.35, 0.65, wash);
            addKey('sphere', 'white', 3.0, 11.0, 2.5, 0.45, 0.7, 0.45, dome);
            addKey('cone', 'straw', 3.0, 11.7, 2.5, 0.10, 0.5, 0.10, [0.85, 0.75, 0.2]);
          }

          else if (faith === 'ibadi') {
            // Plainer Omani mosque — whitewashed cube, short square minaret,
            // no large dome. Distinctive for Muscat / Oman.
            const wash = varyColor([0.92, 0.90, 0.82], rng, 0.04);
            // Body: hall + door
            addPart('box', 'white', 0, 2.0, 0, 5, 4, 5, wash);
            addPart('box', 'dark', 0, 1.4, 2.55, 1.0, 2.0, 0.15);
            // Hero feature: minaret tower + cap
            addKey('box', 'white', 2.5, 4.5, -2.5, 1.6, 5, 1.6, wash);
            addKey('box', 'white', 2.5, 7.3, -2.5, 1.2, 0.4, 1.2, [0.80, 0.78, 0.70]);
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
          // Crates on dock
          addPart('box', 'wood', w/4, 0.4, d/4, 0.5, 0.5, 0.5, varyColor(BASE_COLORS.wood, rng, 0.12));
          addPart('box', 'wood', -w/4, 0.4, -d/4, 0.4, 0.4, 0.4, varyColor(BASE_COLORS.wood, rng, 0.12));
          // Moored boat — small hull shape
          const boatSide = rng() > 0.5 ? 1 : -1;
          const boatColor = varyColor(BASE_COLORS.wood, rng, 0.15);
          addPart('box', 'wood', boatSide * (w/2 + 1.5), -0.3, d * 0.2, 0.8, 0.5, 2.5, boatColor);
          // Boat bow (small tapered cone)
          addPart('cone', 'wood', boatSide * (w/2 + 1.5), -0.1, d * 0.2 + 1.4, 0.4, 0.4, 0.3, boatColor);
          // Torch at end of dock
          addTorch(0, 1.4, d/2 - 0.3);
        }
        else if (b.type === 'fort') {
          // West African forts (Elmina, Luanda) are Portuguese-built stone;
          // Indian Ocean forts use mud brick
          const mat = c === 'Indian Ocean' ? 'mud' : 'stone';
          const wallColor = varyColor(BASE_COLORS[mat], rng, 0.06);
          addPart('box', mat, 0, h/2, 0, w, h, d, wallColor);
          // Corner towers
          const towerColor = varyColor(BASE_COLORS[mat], rng, 0.04);
          addPart('cylinder', mat, w/2, h/2+1, d/2, 1.5, h+2, 1.5, towerColor);
          addPart('cylinder', mat, -w/2, h/2+1, d/2, 1.5, h+2, 1.5, towerColor);
          addPart('cylinder', mat, w/2, h/2+1, -d/2, 1.5, h+2, 1.5, towerColor);
          addPart('cylinder', mat, -w/2, h/2+1, -d/2, 1.5, h+2, 1.5, towerColor);
          // Gate
          addPart('box', 'dark', 0, h*0.35, d/2+0.05, 2.5, h*0.6, 0.15);
          // Battlements on top
          for (let bx = -w/2 + 1; bx <= w/2 - 1; bx += 2) {
            addPart('box', mat, bx, h + 0.5, d/2, 0.6, 1, 0.6, towerColor);
            addPart('box', mat, bx, h + 0.5, -d/2, 0.6, 1, 0.6, towerColor);
          }

          // ── Flags on two front towers ──
          // Port-specific flagColor takes precedence over culture default.
          const flagColor: [number, number, number] = port.flagColor ?? (
            c === 'Indian Ocean'
              ? [0.15, 0.55, 0.25]   // green
              : c === 'European' || c === 'West African' || c === 'Atlantic'
                ? [0.85, 0.15, 0.15] // red (Portuguese/Spanish default)
                : [0.2, 0.2, 0.7]    // blue
          );
          const drawFlag = (px: number) => {
            addPart('cylinder', 'wood', px, h + 3.5, d/2, 0.06, 3, 0.06);
            addPart('box', 'straw', px + 0.45, h + 4.5, d/2, 0.8, 0.5, 0.05, flagColor);
            // St George's cross overlay (London) — thin red cross on white field
            if (port.landmark === 'tower-of-london') {
              const red: [number, number, number] = [0.78, 0.10, 0.10];
              addPart('box', 'straw', px + 0.45, h + 4.5, d/2 - 0.01, 0.8, 0.12, 0.05, red); // horizontal bar
              addPart('box', 'straw', px + 0.45, h + 4.5, d/2 - 0.01, 0.18, 0.5, 0.05, red); // vertical bar
            }
            // Prinsenvlag white+blue stripes (Amsterdam) — thin overlay bands
            if (port.landmark === 'oude-kerk-spire') {
              addPart('box', 'straw', px + 0.45, h + 4.5, d/2 - 0.01, 0.8, 0.16, 0.05, [0.95, 0.95, 0.92]); // white middle
              addPart('box', 'straw', px + 0.45, h + 4.34, d/2 - 0.01, 0.8, 0.16, 0.05, [0.10, 0.20, 0.55]); // blue bottom
            }
          };
          drawFlag(w/2);
          drawFlag(-w/2);

          // ── Torches flanking gate ──
          addTorch(1.8, h * 0.7, d/2 + 0.3);
          addTorch(-1.8, h * 0.7, d/2 + 0.3);

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
          // Counter/table
          addPart('box', 'wood', 0, 1.0, 0, w*0.5, 0.15, d*0.4);
          // Goods on counter — varied spice/textile colors
          addPart('box', 'straw', 0.4, 1.2, 0.2, 0.3, 0.25, 0.3, varyColor([0.85, 0.65, 0.2], rng, 0.15));
          addPart('box', 'straw', -0.3, 1.2, -0.1, 0.25, 0.2, 0.25, varyColor([0.6, 0.3, 0.15], rng, 0.15));
          addPart('box', 'straw', 0.1, 1.2, -0.3, 0.2, 0.18, 0.2, varyColor([0.35, 0.55, 0.25], rng, 0.12));

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
          if (c === 'West African') {
            // Round mud hut with conical thatch roof
            const radius = Math.min(w, d) / 2;
            addPart('cylinder', 'mud', 0, h/2, 0, radius, h, radius, wallColor);
            addPart('cone', 'straw', 0, h + 0.8, 0, radius * 1.3, 1.6, radius * 1.3, roofColor);
            // Doorway
            addPart('box', 'dark', 0, h*0.3, radius+0.05, 0.5, h*0.55, 0.1);
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
          if (roofGeo === 'cone' && b.type !== 'farmhouse') {
            const shapeRoll = rng();
            if (roofMat === 'tileRoof') {
              roofRenderGeo = shapeRoll < 0.48 ? 'cone' : shapeRoll < 0.90 ? 'gableRoof' : 'shedRoof';
            } else if (roofMat === 'thatchRoof') {
              roofRenderGeo = shapeRoll < 0.68 ? 'cone' : 'gableRoof';
            } else if (roofMat === 'woodRoof') {
              roofRenderGeo = shapeRoll < 0.24 ? 'cone' : shapeRoll < 0.86 ? 'gableRoof' : 'shedRoof';
            }
          }

          const feat = variant.features ?? {};
          const stilted = !!feat.stilts && (b.type === 'house' || b.type === 'farmhouse');
          const stiltLift = stilted ? 1.2 : 0;
          const roofScaleMul = variant.roofScaleMul ?? [1, 1, 1];
          const roofPitchMul = roofGeo === 'cone' ? 0.84 + rng() * 0.48 : 1;
          const roofYOffset = variant.roofYOffset ?? 0;

          // ── Round hut (house/farmhouse in west-african-round) ──
          if (feat.roundHut && (b.type === 'house' || b.type === 'farmhouse')) {
            const radius = Math.min(sw, sd) / 2;
            const roundRoofRadius = radius * 1.4 * Math.max(roofScaleMul[0], roofScaleMul[2]);
            const roundRoofH = roofH * 1.3 * roofScaleMul[1] * roofPitchMul;
            addPart('cylinder', wallMat, 0, sh/2, 0, radius, sh, radius, wallColor);
            addPart('cone', 'straw', 0, sh + roofYOffset + roundRoofH/2 + 0.1, 0, roundRoofRadius, roundRoofH, roundRoofRadius, roofColor);
            addPart('box', 'dark', 0, sh*0.3, radius+0.05, 0.5, sh*0.55, 0.1);
            const cwColor = varyColor(wallBase, rng, 0.08);
            addPart('box', wallMat, radius+0.8, 0.35, 0, 0.25, 0.7, sd*0.8, cwColor);
            addPart('box', wallMat, 0, 0.35, -radius-0.8, sw*0.8, 0.7, 0.25, cwColor);
            if (b.type === 'farmhouse') {
              const binColor = varyColor(wallBase, rng, 0.1);
              addPart('cylinder', wallMat, -radius-1.2, 0.5, 0.5, 0.5, 1.0, 0.5, binColor);
              addPart('cone', 'straw', -radius-1.2, 1.3, 0.5, 0.65, 0.8, 0.65, roofColor);
            }
          } else {
            // ── Foundation / plinth ──
            if (wallMat === 'mud' && (b.type === 'house' || b.type === 'estate') && !stilted) {
              addPart('box', 'stone', 0, 0.12, 0, sw + 0.3, 0.25, sd + 0.3, varyColor(BASE_COLORS.stone, rng, 0.06));
            } else if (shutters && b.type !== 'farmhouse' && !stilted) {
              addPart('box', 'stone', 0, 0.08, 0, sw + 0.15, 0.16, sd + 0.15, varyColor([0.58, 0.55, 0.52], rng, 0.04));
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


            // ── Roof ──
            const roofBase = stiltLift + sh;
            const roofW = sw * roofScaleMul[0];
            const roofHeight = roofH * roofScaleMul[1] * roofPitchMul;
            const roofD = sd * roofScaleMul[2];
            if (roofGeo === 'box') {
              const parapetLip = feat.flatRoofParapet ? 0.6 : 0.4;
              addPart('box', roofMat, 0, roofBase + roofYOffset + roofHeight/2, 0, roofW + parapetLip, roofHeight, roofD + parapetLip, roofColor);
              if (feat.flatRoofParapet) {
                // small raised parapet rim on top of the roof slab
                const parapetColor = varyColor(wallBase, rng, 0.04);
                addPart('box', wallMat, 0, roofBase + roofYOffset + roofHeight + 0.12, 0, roofW + 0.3, 0.24, roofD + 0.3, parapetColor);
              }
            } else {
              const roofOverhang = feat.deepEaves ? 1.08 : 1.0;
              const longAxisYRot = roofD > roofW ? Math.PI / 2 : 0;
              addPart(roofRenderGeo, roofMat, 0, roofBase + roofYOffset + roofHeight/2, 0, roofW * roofOverhang, roofHeight, roofD * roofOverhang, roofColor, false, roofRenderGeo === 'gableRoof' ? longAxisYRot : 0);

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

            // ── Door with lintel and step ──
            addPart('box', 'dark', 0, stiltLift + sh*0.3, sd/2+0.05, 0.55, sh*0.55, 0.1);
            addPart('box', wallMat, 0, stiltLift + sh*0.6, sd/2+0.06, 0.75, 0.1, 0.08, varyColor(wallBase, rng, 0.03));
            if (!stilted) {
              addPart('box', 'stone', 0, 0.06, sd/2+0.35, 0.7, 0.12, 0.3);
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

                addPart('box', 'dark', sw/2+0.05, wy, 0, 0.1, 0.45, 0.55);
                addPart('box', 'dark', -sw/2-0.05, wy, 0, 0.1, 0.45, 0.55);
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

          if (b.type === 'warehouse') {
            addPart('box', 'dark', 0, h*0.35, d/2+0.05, 1.8, h*0.6, 0.1);
            addPart('box', wallMat, 0, h*0.68, d/2+0.06, 2.0, 0.12, 0.08, varyColor(wallBase, rng, 0.03));
            addPart('box', 'dark', w/2+0.05, h*0.7, d/4, 0.1, 0.35, 0.4);
            addPart('box', 'dark', w/2+0.05, h*0.7, -d/4, 0.1, 0.35, 0.4);
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
              addPart('box', 'dark', w/2-0.2, h*1.55, d/2-0.2+0.05, 0.1, 0.45, 0.5);
              addPart('box', 'dark', -w/2+0.7, h*1.55, d/2-0.2+0.05, 0.1, 0.45, 0.5);
              addPart('box', 'wood', w/2-0.2, h*1.55, d/2+0.12, 0.06, 0.48, 0.12, sc);
              addPart('box', 'wood', -w/2+0.7, h*1.55, d/2+0.12, 0.06, 0.48, 0.12, sc);
              addPart('box', 'stone', 0, h + 0.1, d/2 + 0.5, w * 0.6, 0.1, 0.6);
              addPart('cylinder', 'wood', w*0.25, h + 0.4, d/2 + 0.75, 0.04, 0.5, 0.04);
              addPart('cylinder', 'wood', -w*0.25, h + 0.4, d/2 + 0.75, 0.04, 0.5, 0.04);
            } else {
              // Flat-roof two-story (Indian Ocean / Arab / Swahili / Persian-Gulf)
              addPart('box', wallMat, 0, h + h/2, 0, w-0.5, h, d-0.5, wallColor);
              addPart('box', roofMat, 0, h*2 + 0.2, 0, w, 0.4, d, roofColor);
              addPart('box', 'dark', w/2-0.2, h*1.55, d/2-0.2+0.05, 0.1, 0.4, 0.45);
              addPart('box', 'dark', -w/2+0.7, h*1.55, d/2-0.2+0.05, 0.1, 0.4, 0.45);
            }
            if (c !== 'West African') {
              addPart('box', 'dark', w/3, h*0.55, d/2+0.05, 0.1, 0.5, 0.6);
              addPart('box', 'dark', -w/3, h*0.55, d/2+0.05, 0.1, 0.5, 0.6);
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

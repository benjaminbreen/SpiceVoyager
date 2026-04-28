import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mergeCompatibleGeometries } from '../utils/geometryMerge';
import { tintVegetation } from '../utils/vegetationTint';
import { tintFlat, tintGradient } from '../utils/animalTint';
import { applyWindSway } from '../utils/windSway';
import type { WaterPaletteId } from '../utils/waterPalettes';

// ── Geometry builders ────────────────────────────────────────────────────────
// Built once per component mount. Geometry is climate-independent.

function buildGeometries() {
  const treeTrunkGeometry = new THREE.CylinderGeometry(0.2, 0.3, 2, 5);
  const treeLeavesGeometry = new THREE.ConeGeometry(1.5, 4, 5);

  // Palm trunk: shifted so base is at y=0, top at y=4. Curve baked into vertices.
  const palmTrunkGeometry = (() => {
    const geo = new THREE.CylinderGeometry(0.08, 0.14, 4, 5, 8);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const shifted = y + 2;
      pos.setY(i, shifted);
      const t = shifted / 4;
      pos.setX(i, pos.getX(i) + t * t * 0.6);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  })();

  const palmFrondGeometry = (() => {
    const fronds: THREE.BufferGeometry[] = [];
    for (let f = 0; f < 6; f++) {
      const angle = (f / 6) * Math.PI * 2 + (f % 2) * 0.15;
      const frond = new THREE.PlaneGeometry(0.35, 2.2, 1, 4);
      const fPos = frond.attributes.position;
      for (let i = 0; i < fPos.count; i++) {
        const fy = fPos.getY(i);
        const t = (fy + 1.1) / 2.2;
        fPos.setZ(i, -t * t * 1.0);
      }
      fPos.needsUpdate = true;
      frond.rotateX(-0.3);
      frond.rotateY(angle);
      frond.translate(Math.sin(angle) * 0.4, 0, Math.cos(angle) * 0.4);
      fronds.push(frond);
    }
    const merged = mergeCompatibleGeometries(fronds);
    fronds.forEach((f) => f.dispose());
    return merged ?? new THREE.SphereGeometry(1, 4, 4);
  })();

  const broadleafTrunkGeometry = new THREE.CylinderGeometry(0.25, 0.35, 2.5, 5);
  const broadleafCanopyGeometry = (() => {
    const canopy = new THREE.IcosahedronGeometry(1.8, 1);
    canopy.scale(1.0, 0.7, 1.0);
    return canopy;
  })();

  const baobabTrunkGeometry = (() => {
    const geo = new THREE.CylinderGeometry(0.3, 0.7, 3.5, 6);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const t = (y + 1.75) / 3.5;
      const bulge = 1 + 0.25 * Math.sin(t * Math.PI);
      pos.setX(i, pos.getX(i) * bulge);
      pos.setZ(i, pos.getZ(i) * bulge);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  })();

  const baobabCanopyGeometry = (() => {
    const blobs: THREE.BufferGeometry[] = [];
    const offsets: [number, number, number][] = [
      [0.7, 3.3, 0.1], [-0.3, 3.5, 0.6], [0.1, 3.1, -0.7],
      [-0.6, 3.4, -0.2], [0.4, 3.6, -0.5],
    ];
    for (const [ox, oy, oz] of offsets) {
      const blob = new THREE.IcosahedronGeometry(0.45, 0);
      blob.scale(1.3, 0.7, 1.1);
      blob.translate(ox, oy, oz);
      blobs.push(blob);
    }
    const merged = mergeCompatibleGeometries(blobs);
    blobs.forEach((b) => b.dispose());
    return merged ?? new THREE.IcosahedronGeometry(0.8, 0);
  })();

  const acaciaTrunkGeometry = new THREE.CylinderGeometry(0.08, 0.14, 3, 5);
  const acaciaCanopyGeometry = (() => {
    const canopy = new THREE.SphereGeometry(1.8, 6, 4);
    canopy.scale(1.0, 0.25, 1.0);
    canopy.translate(0, 3.0, 0);
    return canopy;
  })();

  const mangroveRootGeometry = (() => {
    const trunk = new THREE.CylinderGeometry(0.10, 0.16, 1.25, 5);
    trunk.rotateZ(-0.08);
    trunk.translate(0.04, 0.72, 0);
    const parts: THREE.BufferGeometry[] = [trunk];
    for (let r = 0; r < 10; r++) {
      const angle = (r / 10) * Math.PI * 2 + (r % 2) * 0.12;
      const length = 1.05 + (r % 4) * 0.13;
      const root = new THREE.CylinderGeometry(0.018, 0.052, length, 4);
      root.rotateZ(0.82 + (r % 3) * 0.07);
      root.rotateY(angle);
      root.translate(Math.sin(angle) * 0.48, 0.38, Math.cos(angle) * 0.48);
      parts.push(root);
    }
    for (let r = 0; r < 5; r++) {
      const angle = (r / 5) * Math.PI * 2 + 0.28;
      const aerial = new THREE.CylinderGeometry(0.009, 0.014, 0.9 + (r % 2) * 0.18, 3);
      aerial.rotateZ((r % 2 === 0 ? 1 : -1) * 0.12);
      aerial.translate(Math.sin(angle) * 0.26, 0.78, Math.cos(angle) * 0.26);
      parts.push(aerial);
    }
    const merged = mergeCompatibleGeometries(parts);
    parts.forEach((g) => g.dispose());
    return merged ?? new THREE.CylinderGeometry(0.08, 0.12, 1.1, 5);
  })();

  const mangroveCanopyGeometry = (() => {
    const lobes: THREE.BufferGeometry[] = [];
    const specs: Array<[number, number, number, number, number, number, number]> = [
      [-0.28, 1.38, 0.02, 0.68, 1.35, 0.62, 1.05],
      [0.34, 1.30, -0.12, 0.58, 1.22, 0.58, 0.98],
      [0.06, 1.52, 0.34, 0.48, 1.08, 0.54, 0.86],
      [-0.02, 1.16, -0.36, 0.42, 1.18, 0.48, 0.78],
    ];
    for (const [x, y, z, radius, sx, sy, sz] of specs) {
      const lobe = new THREE.IcosahedronGeometry(radius, 0);
      lobe.scale(sx, sy, sz);
      lobe.translate(x, y, z);
      lobes.push(lobe);
    }
    const merged = mergeCompatibleGeometries(lobes);
    lobes.forEach((g) => g.dispose());
    return merged ?? new THREE.IcosahedronGeometry(0.6, 0);
  })();

  const reedBedGeometry = (() => {
    const reeds: THREE.BufferGeometry[] = [];
    for (let r = 0; r < 7; r++) {
      const reed = new THREE.CylinderGeometry(0.012, 0.018, 0.7 + (r % 3) * 0.14, 3);
      const angle = (r / 7) * Math.PI * 2;
      reed.rotateZ((r % 2 === 0 ? 1 : -1) * 0.1);
      reed.translate(Math.sin(angle) * 0.16, 0.35, Math.cos(angle) * 0.16);
      reeds.push(reed);
    }
    const merged = mergeCompatibleGeometries(reeds);
    reeds.forEach((g) => g.dispose());
    return merged ?? new THREE.CylinderGeometry(0.02, 0.02, 0.7, 3);
  })();

  const siltPatchGeometry = (() => {
    const geo = new THREE.CircleGeometry(0.55, 9);
    geo.scale(1.35, 0.62, 1);
    geo.rotateX(-Math.PI / 2);
    return geo;
  })();

  const saltStainGeometry = (() => {
    const geo = new THREE.CircleGeometry(0.45, 8);
    geo.scale(1.45, 0.5, 1);
    geo.rotateX(-Math.PI / 2);
    return geo;
  })();

  const cactusGeometry = new THREE.CylinderGeometry(0.3, 0.3, 2, 6);

  const thornbushGeometry = (() => {
    const bush = new THREE.IcosahedronGeometry(0.45, 0);
    bush.scale(1.2, 0.55, 1.0);
    const thorn1 = new THREE.ConeGeometry(0.035, 0.5, 3);
    thorn1.rotateZ(0.8); thorn1.translate(0.38, 0.18, 0.1);
    const thorn2 = new THREE.ConeGeometry(0.035, 0.45, 3);
    thorn2.rotateZ(-0.6); thorn2.rotateY(1.2); thorn2.translate(-0.28, 0.12, 0.22);
    const thorn3 = new THREE.ConeGeometry(0.03, 0.4, 3);
    thorn3.rotateX(0.7); thorn3.translate(0.1, 0.22, -0.3);
    const merged = mergeCompatibleGeometries([bush, thorn1, thorn2, thorn3]);
    bush.dispose(); thorn1.dispose(); thorn2.dispose(); thorn3.dispose();
    return merged ?? new THREE.IcosahedronGeometry(0.4, 0);
  })();

  const driftwoodGeometry = (() => {
    const log = new THREE.CylinderGeometry(0.06, 0.08, 1.2, 4);
    log.rotateZ(Math.PI / 2);
    const pos = log.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i);
      pos.setY(i, pos.getY(i) + px * px * 0.15);
    }
    pos.needsUpdate = true;
    return log;
  })();

  const beachRockGeometry = (() => {
    const geo = new THREE.IcosahedronGeometry(0.3, 0);
    geo.scale(1.0, 0.45, 0.8);
    return geo;
  })();

  const riceShootGeometry = (() => {
    const stalk = new THREE.CylinderGeometry(0.015, 0.02, 0.55, 3);
    const leaf1 = new THREE.PlaneGeometry(0.14, 0.035);
    leaf1.rotateZ(0.3); leaf1.translate(0.06, 0.12, 0);
    const leaf2 = new THREE.PlaneGeometry(0.11, 0.035);
    leaf2.rotateZ(-0.4); leaf2.rotateY(Math.PI * 0.6); leaf2.translate(-0.04, 0.03, 0.03);
    const merged = mergeCompatibleGeometries([stalk, leaf1, leaf2]);
    stalk.dispose(); leaf1.dispose(); leaf2.dispose();
    return merged ?? new THREE.CylinderGeometry(0.02, 0.02, 0.5, 3);
  })();

  // Cypress trunk base sits at y=0; canopy stacks tapered masses from y=1.5 up
  // to ~y=9, keeping the columnar habit without reading as a black spike.
  const cypressTrunkGeometry = (() => {
    const geo = new THREE.CylinderGeometry(0.18, 0.28, 2.4, 6);
    geo.translate(0, 1.2, 0);
    return geo;
  })();
  const cypressCanopyGeometry = (() => {
    const layers = [
      { bottom: 0.82, top: 0.64, height: 2.6, baseY: 1.5, twist: 0.0, noiseSeed: 1.3 },
      { bottom: 0.78, top: 0.50, height: 3.2, baseY: 3.0, twist: 0.45, noiseSeed: 2.7 },
      { bottom: 0.56, top: 0.32, height: 2.8, baseY: 5.3, twist: 0.95, noiseSeed: 4.1 },
      { bottom: 0.34, top: 0.12, height: 2.0, baseY: 7.2, twist: 1.55, noiseSeed: 5.9 },
    ];
    const masses: THREE.BufferGeometry[] = [];
    for (const l of layers) {
      const c = new THREE.CylinderGeometry(l.top, l.bottom, l.height, 10, 2);
      const pos = c.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i);
        const r = Math.hypot(x, z);
        if (r > 0.01) {
          const angle = Math.atan2(z, x);
          const noise =
            Math.sin(angle * 7.0 + l.noiseSeed * 5) * 0.08 +
            Math.cos(angle * 13.0 + l.noiseSeed * 3) * 0.05;
          const newR = r * (1 + noise);
          pos.setX(i, Math.cos(angle) * newR);
          pos.setZ(i, Math.sin(angle) * newR);
        }
      }
      pos.needsUpdate = true;
      c.rotateY(l.twist);
      c.translate(0, l.baseY + l.height / 2, 0);
      masses.push(c);
    }
    const crown = new THREE.IcosahedronGeometry(0.22, 0);
    crown.scale(0.8, 1.2, 0.8);
    crown.translate(0, 9.3, 0);
    masses.push(crown);
    const merged = mergeCompatibleGeometries(masses);
    masses.forEach((g) => g.dispose());
    if (merged) merged.computeVertexNormals();
    return merged ?? new THREE.ConeGeometry(0.7, 5.5, 7);
  })();

  // Orange tree — short rounded canopy with baked-in fruit via vertex colors.
  const orangeTrunkGeometry = (() => {
    const geo = new THREE.CylinderGeometry(0.14, 0.20, 1.4, 5);
    geo.translate(0, 0.7, 0);
    return geo;
  })();
  const orangeCanopyGeometry = (() => {
    // Glossy citrus green — slightly brighter than generic forest, so the
    // yellow-orange fruit silhouettes pop against the canopy.
    const leafColor = new THREE.Color('#4f8a2c');
    // Per-fruit ripeness gradient: lemon-yellow → mandarin-orange. Citrus
    // aurantium fruit on a single tree spans this range simultaneously, so
    // the variation reads as natural rather than harsh.
    const ripeYellow = new THREE.Color('#f6d63a');
    const ripeOrange = new THREE.Color('#f29222');
    const paint = (geo: THREE.BufferGeometry, color: THREE.Color) => {
      const c = new Float32Array(geo.attributes.position.count * 3);
      for (let i = 0; i < geo.attributes.position.count; i++) {
        c[i * 3] = color.r;
        c[i * 3 + 1] = color.g;
        c[i * 3 + 2] = color.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
    };
    // Larger main canopy so the tree carries visual weight comparable to
    // cypress/broadleaf neighbors. Two overlapping lobes break the perfect
    // sphere silhouette and read more like a real citrus crown.
    const mainA = new THREE.IcosahedronGeometry(1.25, 1);
    mainA.scale(1.0, 0.88, 1.0);
    mainA.translate(0, 1.0, 0);
    paint(mainA, leafColor);
    const mainB = new THREE.IcosahedronGeometry(0.85, 1);
    mainB.scale(1.05, 0.75, 1.05);
    mainB.translate(0.35, 1.45, -0.2);
    paint(mainB, leafColor);
    const parts: THREE.BufferGeometry[] = [mainA, mainB];
    // 8 fruits at hash-jittered positions so the canopy doesn't read as a
    // golden-spiral. Deterministic per fruit index so all canopies share one
    // geometry, but the placement looks random rather than patterned.
    const tmp = new THREE.Color();
    const hash = (n: number) => {
      const s = Math.sin(n * 12.9898) * 43758.5453;
      return s - Math.floor(s);
    };
    for (let f = 0; f < 8; f++) {
      const fruit = new THREE.IcosahedronGeometry(0.19, 0);
      const theta = hash(f + 1) * Math.PI * 2;
      const phi = 0.25 + hash(f + 7) * 1.10;
      const rJitter = 1.20 + hash(f + 13) * 0.30;
      const rXZ = rJitter;
      const rY = rJitter * 0.85;
      fruit.translate(
        Math.cos(theta) * Math.sin(phi) * rXZ,
        1.05 + Math.cos(phi) * rY,
        Math.sin(theta) * Math.sin(phi) * rXZ,
      );
      // Ripeness gradient: per-fruit hash mix so neighboring fruits differ.
      tmp.copy(ripeYellow).lerp(ripeOrange, hash(f + 23));
      paint(fruit, tmp);
      parts.push(fruit);
    }
    const merged = mergeCompatibleGeometries(parts);
    parts.forEach((g) => g.dispose());
    if (merged) merged.computeVertexNormals();
    return merged ?? new THREE.IcosahedronGeometry(1.0, 1);
  })();

  // Date palm — straighter, taller trunk than coconut palm, denser frond cluster.
  const datePalmTrunkGeometry = (() => {
    const geo = new THREE.CylinderGeometry(0.10, 0.16, 5, 6, 12);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, pos.getY(i) + 2.5);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  })();
  const datePalmFrondGeometry = (() => {
    const fronds: THREE.BufferGeometry[] = [];
    for (let f = 0; f < 9; f++) {
      const angle = (f / 9) * Math.PI * 2 + (f % 2) * 0.12;
      const frond = new THREE.PlaneGeometry(0.30, 1.9, 1, 4);
      const fPos = frond.attributes.position;
      for (let i = 0; i < fPos.count; i++) {
        const fy = fPos.getY(i);
        const t = (fy + 0.95) / 1.9;
        fPos.setZ(i, -t * t * 0.55);
      }
      fPos.needsUpdate = true;
      frond.rotateX(-0.55);
      frond.rotateY(angle);
      frond.translate(Math.sin(angle) * 0.30, 0, Math.cos(angle) * 0.30);
      fronds.push(frond);
    }
    const merged = mergeCompatibleGeometries(fronds);
    fronds.forEach((f) => f.dispose());
    return merged ?? new THREE.SphereGeometry(1, 4, 4);
  })();

  const bambooGeometry = (() => {
    const canes: THREE.BufferGeometry[] = [];
    const count = 7;
    for (let c = 0; c < count; c++) {
      const angle = (c / count) * Math.PI * 2 + Math.random() * 0.4;
      const radius = 0.08 + Math.random() * 0.18;
      const height = 3.6 + Math.random() * 1.6;
      const cane = new THREE.CylinderGeometry(0.025, 0.035, height, 4, 1);
      cane.translate(0, height * 0.5, 0);
      const lean = (Math.random() - 0.5) * 0.18;
      cane.rotateZ(lean);
      cane.translate(Math.sin(angle) * radius, 0, Math.cos(angle) * radius);
      canes.push(cane);
    }
    const merged = mergeCompatibleGeometries(canes);
    canes.forEach((g) => g.dispose());
    return merged ?? new THREE.CylinderGeometry(0.03, 0.04, 4, 4);
  })();

  const willowTrunkGeometry = new THREE.CylinderGeometry(0.22, 0.34, 2.2, 5);
  const willowCanopyGeometry = (() => {
    const fronds: THREE.BufferGeometry[] = [];
    for (let f = 0; f < 8; f++) {
      const angle = (f / 8) * Math.PI * 2;
      const frond = new THREE.PlaneGeometry(0.55, 2.4, 1, 5);
      const fPos = frond.attributes.position;
      for (let i = 0; i < fPos.count; i++) {
        const fy = fPos.getY(i);
        const t = (fy + 1.2) / 2.4;
        fPos.setY(i, fy - t * t * 1.1);
      }
      fPos.needsUpdate = true;
      frond.rotateX(0.2);
      frond.rotateY(angle);
      frond.translate(Math.sin(angle) * 0.55, 0, Math.cos(angle) * 0.55);
      fronds.push(frond);
    }
    const merged = mergeCompatibleGeometries(fronds);
    fronds.forEach((f) => f.dispose());
    return merged ?? new THREE.SphereGeometry(1, 4, 4);
  })();

  const cherryTrunkGeometry = new THREE.CylinderGeometry(0.18, 0.28, 2.0, 5);
  const cherryCanopyGeometry = (() => {
    const canopy = new THREE.IcosahedronGeometry(1.5, 1);
    canopy.scale(1.0, 0.75, 1.0);
    return canopy;
  })();

  // English / Virginia oak — broad-trunked, sprawling-crowned hardwood. Built
  // as a thick taper trunk plus three offset canopy lobes so the silhouette
  // reads as a wide rounded crown rather than a sphere on a stick.
  const oakTrunkGeometry = (() => {
    const geo = new THREE.CylinderGeometry(0.32, 0.52, 3.0, 6);
    geo.translate(0, 1.5, 0);
    return geo;
  })();
  const oakCanopyGeometry = (() => {
    const lobes: THREE.BufferGeometry[] = [];
    const offsets: [number, number, number, number][] = [
      [0.0, 0.0, 0.0, 1.0],
      [0.55, 0.35, 0.15, 0.78],
      [-0.45, 0.20, 0.40, 0.82],
      [0.10, 0.55, -0.50, 0.74],
    ];
    for (const [ox, oy, oz, s] of offsets) {
      const lobe = new THREE.IcosahedronGeometry(1.55 * s, 1);
      lobe.scale(1.05, 0.78, 1.05);
      lobe.translate(ox, oy, oz);
      lobes.push(lobe);
    }
    const merged = mergeCompatibleGeometries(lobes);
    lobes.forEach((g) => g.dispose());
    if (merged) merged.computeVertexNormals();
    return merged ?? new THREE.IcosahedronGeometry(1.6, 1);
  })();

  const crabGeometry = (() => {
    const body = new THREE.SphereGeometry(0.18, 8, 4);
    body.scale(1, 0.35, 0.8);
    const clawL = new THREE.SphereGeometry(0.07, 5, 3);
    clawL.translate(-0.2, 0.02, -0.12);
    const clawR = new THREE.SphereGeometry(0.07, 5, 3);
    clawR.translate(0.2, 0.02, -0.12);
    const merged = mergeCompatibleGeometries([body, clawL, clawR]);
    body.dispose(); clawL.dispose(); clawR.dispose();
    return merged ?? new THREE.BoxGeometry(0.3, 0.1, 0.2);
  })();

  // Fish — tapered body + forked tail + dorsal fin (reads as fish at distance).
  const fishGeometry = (() => {
    const body = new THREE.CylinderGeometry(0.06, 0.16, 0.5, 5);
    body.rotateZ(Math.PI / 2);
    tintGradient(body, 0.78, 1.3);
    const tailL = new THREE.PlaneGeometry(0.14, 0.08);
    tailL.rotateY(Math.PI / 2);
    tailL.rotateX(0.35);
    tailL.translate(-0.32, 0.03, 0);
    tintFlat(tailL, 0.65);
    const tailR = new THREE.PlaneGeometry(0.14, 0.08);
    tailR.rotateY(Math.PI / 2);
    tailR.rotateX(-0.35);
    tailR.translate(-0.32, -0.03, 0);
    tintFlat(tailR, 0.65);
    const dorsal = new THREE.ConeGeometry(0.03, 0.1, 3);
    dorsal.translate(0.04, 0.13, 0);
    tintFlat(dorsal, 0.6);
    const pect = new THREE.PlaneGeometry(0.08, 0.05);
    pect.rotateX(-0.5);
    pect.translate(0.08, -0.04, 0.07);
    tintFlat(pect, 0.68);
    const merged = mergeCompatibleGeometries([body, tailL, tailR, dorsal, pect]);
    [body, tailL, tailR, dorsal, pect].forEach((g) => g.dispose());
    return merged ?? new THREE.CylinderGeometry(0.1, 0.1, 0.4, 5);
  })();

  // Sea turtle — flattened shell + head + four paddle flippers.
  const turtleGeometry = (() => {
    const shell = new THREE.SphereGeometry(0.25, 6, 4);
    shell.scale(1.3, 0.35, 1.0);
    tintGradient(shell, 0.82, 1.18);
    const head = new THREE.SphereGeometry(0.07, 5, 3);
    head.translate(-0.3, 0.02, 0);
    tintFlat(head, 1.12);
    const fl = new THREE.PlaneGeometry(0.22, 0.08);
    fl.rotateX(-0.25);
    fl.translate(-0.08, -0.03, 0.2);
    tintFlat(fl, 0.68);
    const fr = new THREE.PlaneGeometry(0.22, 0.08);
    fr.rotateX(0.25);
    fr.translate(-0.08, -0.03, -0.2);
    tintFlat(fr, 0.68);
    const bl = new THREE.PlaneGeometry(0.12, 0.06);
    bl.translate(0.2, -0.02, 0.14);
    tintFlat(bl, 0.7);
    const br = new THREE.PlaneGeometry(0.12, 0.06);
    br.translate(0.2, -0.02, -0.14);
    tintFlat(br, 0.7);
    const merged = mergeCompatibleGeometries([shell, head, fl, fr, bl, br]);
    [shell, head, fl, fr, bl, br].forEach((g) => g.dispose());
    return merged ?? new THREE.SphereGeometry(0.2, 6, 4);
  })();

  const brainCoralGeo = (() => {
    const geo = new THREE.SphereGeometry(0.5, 6, 4);
    geo.scale(1, 0.55, 1);
    return geo;
  })();
  const stagCoralGeo = (() => {
    const branch1 = new THREE.CylinderGeometry(0.04, 0.07, 0.7, 4);
    const branch2 = new THREE.CylinderGeometry(0.04, 0.06, 0.55, 4);
    branch2.rotateZ(0.5); branch2.translate(0.15, 0.1, 0.05);
    const branch3 = new THREE.CylinderGeometry(0.03, 0.06, 0.5, 4);
    branch3.rotateZ(-0.4); branch3.translate(-0.12, 0.05, -0.08);
    const branch4 = new THREE.CylinderGeometry(0.03, 0.05, 0.45, 4);
    branch4.rotateX(0.4); branch4.translate(0.05, 0.08, 0.14);
    const merged = mergeCompatibleGeometries([branch1, branch2, branch3, branch4]);
    branch1.dispose(); branch2.dispose(); branch3.dispose(); branch4.dispose();
    return merged ?? new THREE.CylinderGeometry(0.05, 0.08, 0.7, 4);
  })();
  const fanCoralGeo = (() => {
    const geo = new THREE.PlaneGeometry(0.7, 0.9, 3, 3);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setZ(i, (Math.random() - 0.5) * 0.08);
    }
    return geo;
  })();

  const gullGeometry = (() => {
    const body = new THREE.ConeGeometry(0.08, 0.5, 4);
    body.rotateX(Math.PI / 2);
    const wingL = new THREE.PlaneGeometry(0.7, 0.12);
    wingL.translate(-0.35, 0, 0);
    wingL.rotateZ(0.15);
    const wingR = new THREE.PlaneGeometry(0.7, 0.12);
    wingR.translate(0.35, 0, 0);
    wingR.rotateZ(-0.15);
    const merged = mergeCompatibleGeometries([body, wingL, wingR]);
    body.dispose(); wingL.dispose(); wingR.dispose();
    return merged ?? new THREE.ConeGeometry(0.1, 0.4, 4);
  })();

  return {
    treeTrunkGeometry, treeLeavesGeometry,
    palmTrunkGeometry, palmFrondGeometry,
    broadleafTrunkGeometry, broadleafCanopyGeometry,
    baobabTrunkGeometry, baobabCanopyGeometry,
    acaciaTrunkGeometry, acaciaCanopyGeometry,
    mangroveRootGeometry, mangroveCanopyGeometry,
    reedBedGeometry,
    siltPatchGeometry, saltStainGeometry,
    cactusGeometry, thornbushGeometry,
    driftwoodGeometry, beachRockGeometry,
    riceShootGeometry,
    cypressTrunkGeometry, cypressCanopyGeometry,
    orangeTrunkGeometry, orangeCanopyGeometry,
    datePalmTrunkGeometry, datePalmFrondGeometry,
    bambooGeometry,
    willowTrunkGeometry, willowCanopyGeometry,
    cherryTrunkGeometry, cherryCanopyGeometry,
    oakTrunkGeometry, oakCanopyGeometry,
    crabGeometry, fishGeometry, turtleGeometry,
    brainCoralGeo, stagCoralGeo, fanCoralGeo,
    gullGeometry,
  };
}

// ── Climate-tinted materials ────────────────────────────────────────────────
// Rebuilt when the water palette changes (different climate → different
// vegetation tint). The cleanup useEffect below disposes the previous batch
// so their WebGL programs/uniforms don't leak — Three.js materials hold
// GPU state outside JS GC.

function buildTintedMaterials(waterPaletteId: WaterPaletteId) {
  const treeTrunkMaterial = new THREE.MeshStandardMaterial({ color: tintVegetation('#4a3b32', waterPaletteId) });
  const treeLeavesMaterial = (() => {
    const m = new THREE.MeshStandardMaterial({ color: tintVegetation('#2d4c1e', waterPaletteId) });
    applyWindSway(m, { anchorY: -2.0, spanY: 4.0, amplitude: 0.18, flutter: 0.04 });
    return m;
  })();
  const deadTreeMaterial = new THREE.MeshStandardMaterial({ color: tintVegetation('#3a3a3a', waterPaletteId) });
  const palmTrunkMaterial = new THREE.MeshStandardMaterial({ color: tintVegetation('#6b5a3e', waterPaletteId) });
  const palmFrondMaterial = new THREE.MeshStandardMaterial({
    color: tintVegetation('#2a6e1e', waterPaletteId),
    side: THREE.DoubleSide,
  });
  const broadleafTrunkMaterial = new THREE.MeshStandardMaterial({ color: tintVegetation('#5a4530', waterPaletteId) });
  const broadleafCanopyMaterial = (() => {
    const m = new THREE.MeshStandardMaterial({ color: tintVegetation('#2a5e1a', waterPaletteId) });
    applyWindSway(m, { anchorY: -1.3, spanY: 2.6, amplitude: 0.15, flutter: 0.03 });
    return m;
  })();
  const baobabTrunkMaterial = new THREE.MeshStandardMaterial({ color: tintVegetation('#7a6b55', waterPaletteId) });
  const baobabCanopyMaterial = (() => {
    const m = new THREE.MeshStandardMaterial({ color: tintVegetation('#4a6e30', waterPaletteId) });
    applyWindSway(m, { anchorY: 2.8, spanY: 1.0, amplitude: 0.08, flutter: 0.02 });
    return m;
  })();
  const acaciaTrunkMaterial = new THREE.MeshStandardMaterial({ color: tintVegetation('#5a4a30', waterPaletteId) });
  const acaciaCanopyMaterial = (() => {
    const m = new THREE.MeshStandardMaterial({ color: tintVegetation('#3a6628', waterPaletteId) });
    applyWindSway(m, { anchorY: 2.5, spanY: 1.0, amplitude: 0.20, flutter: 0.04 });
    return m;
  })();
  const mangroveRootMaterial = new THREE.MeshStandardMaterial({
    color: tintVegetation('#6a4a35', waterPaletteId),
    roughness: 0.95,
  });
  const mangroveCanopyMaterial = (() => {
    const m = new THREE.MeshStandardMaterial({
      color: tintVegetation('#3f6b3a', waterPaletteId),
      roughness: 0.95,
    });
    applyWindSway(m, { anchorY: 0.85, spanY: 1.0, amplitude: 0.10, flutter: 0.025 });
    return m;
  })();
  const reedBedMaterial = new THREE.MeshStandardMaterial({
    color: tintVegetation('#6f7d3d', waterPaletteId),
    roughness: 0.9,
  });
  const cactusMaterial = new THREE.MeshStandardMaterial({ color: tintVegetation('#2E8B57', waterPaletteId) });
  const thornbushMaterial = new THREE.MeshStandardMaterial({
    color: tintVegetation('#6b7a4a', waterPaletteId),
    roughness: 0.9,
  });
  const driftwoodMaterial = new THREE.MeshStandardMaterial({
    color: tintVegetation('#8a7560', waterPaletteId),
    roughness: 0.95,
  });
  const beachRockMaterial = new THREE.MeshStandardMaterial({
    color: tintVegetation('#6e6860', waterPaletteId),
    roughness: 0.85,
  });
  const riceShootMaterial = new THREE.MeshStandardMaterial({
    color: tintVegetation('#5a8c2a', waterPaletteId),
    side: THREE.DoubleSide,
  });
  const cypressTrunkMaterial = new THREE.MeshStandardMaterial({ color: tintVegetation('#3e2f24', waterPaletteId) });
  const cypressCanopyMaterial = (() => {
    const m = new THREE.MeshStandardMaterial({
      color: tintVegetation('#436f34', waterPaletteId),
      roughness: 0.92,
    });
    applyWindSway(m, { anchorY: 1.0, spanY: 9.0, amplitude: 0.07, flutter: 0.015 });
    return m;
  })();
  const orangeTrunkMaterial = new THREE.MeshStandardMaterial({ color: tintVegetation('#4a3424', waterPaletteId) });
  const datePalmTrunkMaterial = new THREE.MeshStandardMaterial({ color: tintVegetation('#7a6243', waterPaletteId) });
  const datePalmFrondMaterial = (() => {
    const m = new THREE.MeshStandardMaterial({
      color: tintVegetation('#3a5a2a', waterPaletteId),
      side: THREE.DoubleSide,
    });
    applyWindSway(m, { anchorY: -0.5, spanY: 1.8, amplitude: 0.14, flutter: 0.04 });
    return m;
  })();
  const bambooMaterial = (() => {
    const m = new THREE.MeshStandardMaterial({
      color: tintVegetation('#8aa84a', waterPaletteId),
      roughness: 0.85,
    });
    applyWindSway(m, { anchorY: 1.0, spanY: 3.5, amplitude: 0.22, flutter: 0.06 });
    return m;
  })();
  const willowTrunkMaterial = new THREE.MeshStandardMaterial({ color: tintVegetation('#4a3a2c', waterPaletteId) });
  const willowCanopyMaterial = (() => {
    const m = new THREE.MeshStandardMaterial({
      color: tintVegetation('#6e8a3a', waterPaletteId),
      side: THREE.DoubleSide,
    });
    applyWindSway(m, { anchorY: -0.8, spanY: 2.2, amplitude: 0.22, flutter: 0.05 });
    return m;
  })();
  const cherryTrunkMaterial = new THREE.MeshStandardMaterial({ color: tintVegetation('#3a2a22', waterPaletteId) });
  // Oak — deep furrowed-bark brown trunk and a dense, slightly cool canopy.
  // The canopy color is a touch darker than generic broadleaf to read as a
  // mature hardwood rather than a softer riparian tree.
  const oakTrunkMaterial = new THREE.MeshStandardMaterial({
    color: tintVegetation('#4a3a2a', waterPaletteId),
    roughness: 0.95,
  });
  const oakCanopyMaterial = (() => {
    const m = new THREE.MeshStandardMaterial({
      color: tintVegetation('#345e22', waterPaletteId),
      roughness: 0.9,
    });
    applyWindSway(m, { anchorY: -1.0, spanY: 2.6, amplitude: 0.13, flutter: 0.028 });
    return m;
  })();

  return {
    treeTrunkMaterial, treeLeavesMaterial,
    deadTreeMaterial,
    palmTrunkMaterial, palmFrondMaterial,
    broadleafTrunkMaterial, broadleafCanopyMaterial,
    baobabTrunkMaterial, baobabCanopyMaterial,
    acaciaTrunkMaterial, acaciaCanopyMaterial,
    mangroveRootMaterial, mangroveCanopyMaterial,
    reedBedMaterial,
    cactusMaterial, thornbushMaterial,
    driftwoodMaterial, beachRockMaterial,
    riceShootMaterial,
    cypressTrunkMaterial, cypressCanopyMaterial,
    orangeTrunkMaterial,
    datePalmTrunkMaterial, datePalmFrondMaterial,
    bambooMaterial,
    willowTrunkMaterial, willowCanopyMaterial,
    cherryTrunkMaterial,
    oakTrunkMaterial, oakCanopyMaterial,
  };
}

// ── Static (non-tinted) materials ───────────────────────────────────────────
// Built once. Colors are climate-independent (vertex colors, hardcoded hues
// like silt/salt decals, fish chrome, coral pinks, gull off-white).

function buildStaticMaterials() {
  const siltPatchMaterial = new THREE.MeshStandardMaterial({
    color: '#7a725a',
    roughness: 1,
    transparent: true,
    opacity: 0.58,
    depthWrite: false,
  });
  const saltStainMaterial = new THREE.MeshStandardMaterial({
    color: '#b7b0a0',
    roughness: 1,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });
  const orangeCanopyMaterial = (() => {
    const m = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.85,
    });
    applyWindSway(m, { anchorY: -0.4, spanY: 1.8, amplitude: 0.10, flutter: 0.025 });
    return m;
  })();
  const cherryCanopyMaterial = (() => {
    // Don't tint by palette — blossoms read pink regardless.
    const m = new THREE.MeshStandardMaterial({ color: '#e8b8c8' });
    applyWindSway(m, { anchorY: -1.2, spanY: 2.4, amplitude: 0.14, flutter: 0.04 });
    return m;
  })();
  const crabMaterial = new THREE.MeshStandardMaterial({ color: '#ff4444' });
  const fishMaterial = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    metalness: 0.4,
    roughness: 0.25,
    side: THREE.DoubleSide,
    vertexColors: true,
    emissive: '#101820',
    emissiveIntensity: 0.15,
  });
  const turtleMaterial = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    metalness: 0.15,
    roughness: 0.5,
    side: THREE.DoubleSide,
    vertexColors: true,
  });
  const brainCoralMat = new THREE.MeshStandardMaterial({
    color: '#c46478', emissive: '#c46478', emissiveIntensity: 0.3, roughness: 0.8, metalness: 0.0,
  });
  const stagCoralMat = new THREE.MeshStandardMaterial({
    color: '#d8854a', emissive: '#d8854a', emissiveIntensity: 0.3, roughness: 0.7, metalness: 0.0,
  });
  const fanCoralMat = new THREE.MeshStandardMaterial({
    color: '#7b52a0', emissive: '#7b52a0', emissiveIntensity: 0.3, roughness: 0.6, metalness: 0.0, side: THREE.DoubleSide,
  });
  const gullMaterial = new THREE.MeshStandardMaterial({
    color: '#e8e0d0',
    side: THREE.DoubleSide,
  });

  return {
    siltPatchMaterial, saltStainMaterial,
    orangeCanopyMaterial,
    cherryCanopyMaterial,
    crabMaterial,
    fishMaterial, turtleMaterial,
    brainCoralMat, stagCoralMat, fanCoralMat,
    gullMaterial,
  };
}

export function useFloraAssets(waterPaletteId: WaterPaletteId) {
  const geometries = useMemo(() => buildGeometries(), []);
  const tintedMaterials = useMemo(() => buildTintedMaterials(waterPaletteId), [waterPaletteId]);
  const staticMaterials = useMemo(() => buildStaticMaterials(), []);

  // Tinted materials are rebuilt on palette change. Dispose the previous batch
  // when waterPaletteId changes so their WebGL state doesn't leak.
  useEffect(() => {
    return () => {
      Object.values(tintedMaterials).forEach((m) => m.dispose());
    };
  }, [tintedMaterials]);

  // Geometries and static materials live for the lifetime of the component.
  // Dispose them on unmount.
  useEffect(() => {
    return () => {
      Object.values(geometries).forEach((g) => g.dispose());
      Object.values(staticMaterials).forEach((m) => m.dispose());
    };
  }, [geometries, staticMaterials]);

  return useMemo(
    () => ({ ...geometries, ...tintedMaterials, ...staticMaterials }),
    [geometries, tintedMaterials, staticMaterials],
  );
}

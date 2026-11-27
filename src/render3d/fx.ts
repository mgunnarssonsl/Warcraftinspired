// Feedback visuals in the painted style (sheet 15): soft glowing rings,
// a green arrow for move orders and a red crosshair for attacks, light
// columns for level-ups and teleports, painted projectiles and loot chests.

import * as THREE from 'three';
import { Sculpt, blob, cone, crownGeo, cyl, lathe, rbox, slab } from './kit';

function canvasTex(size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let ringTex: THREE.CanvasTexture | null = null;
/** A soft ring: a bright rim with a glow either side. Its radius is 1 on a 2.6-wide plane. */
export function ringTexture(): THREE.CanvasTexture {
  ringTex ??= canvasTex(256, (ctx, s) => {
    const c = s / 2;
    const r = (s / 2) / 1.3;
    const g = ctx.createRadialGradient(c, c, r * 0.6, c, c, r * 1.25);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.18)');
    g.addColorStop(0.8, 'rgba(255,255,255,1)');
    g.addColorStop(0.9, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
  return ringTex;
}

let crossTex: THREE.CanvasTexture | null = null;
/** The attack crosshair: a ring with four ticks and a dot. */
export function crossTexture(): THREE.CanvasTexture {
  crossTex ??= canvasTex(256, (ctx, s) => {
    const c = s / 2;
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = s * 0.06;
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = s * 0.05;
    ctx.beginPath();
    ctx.arc(c, c, s * 0.28, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * s * 0.18, c + Math.sin(a) * s * 0.18);
      ctx.lineTo(c + Math.cos(a) * s * 0.44, c + Math.sin(a) * s * 0.44);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(c, c, s * 0.05, 0, Math.PI * 2);
    ctx.fill();
  });
  return crossTex;
}

let beamTex: THREE.CanvasTexture | null = null;
/** A vertical glow fading toward the top, for light columns. */
export function beamTexture(): THREE.CanvasTexture {
  beamTex ??= canvasTex(64, (ctx, s) => {
    const g = ctx.createLinearGradient(0, s, 0, 0);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
  return beamTex;
}

/** The move marker: a green arrow pointing down at the spot. */
export function moveArrowGeometry(): THREE.BufferGeometry {
  const s = new Sculpt();
  s.add(cone(0.16, 0.26, 10), '#7dff6a', 'glow', { at: [0, 0.13, 0], rot: [Math.PI, 0, 0] });
  s.add(cyl(0.06, 0.06, 0.28, 8), '#7dff6a', 'glow', { at: [0, 0.4, 0] });
  return s.geometry();
}

// ---- projectiles (all point along +Z) --------------------------------------------

export function arrowGeometry(): THREE.BufferGeometry {
  const s = new Sculpt();
  s.add(cyl(0.014, 0.014, 0.6, 5), '#b8884e', 'matte', { rot: [Math.PI / 2, 0, 0] });
  s.add(cone(0.035, 0.12, 5), '#d0d6de', 'matte', { at: [0, 0, 0.35], rot: [Math.PI / 2, 0, 0] });
  for (const r of [0, Math.PI / 2])
    s.add(
      slab(
        [
          [0, 0],
          [0.05, 0.02],
          [0.05, 0.12],
          [0, 0.1],
        ],
        0.004,
        0,
      ),
      '#f0ece0',
      'matte',
      { at: [0, 0, -0.32], rot: [-Math.PI / 2, 0, r] },
    );
  return s.geometry();
}

export function hammerGeometry(): THREE.BufferGeometry {
  const s = new Sculpt();
  s.add(cyl(0.025, 0.025, 0.42, 6), '#8ab4ff', 'glow', { rot: [Math.PI / 2, 0, 0] });
  s.add(rbox(0.2, 0.16, 0.16, 0.03), '#d8e8ff', 'glow', { at: [0, 0, 0.22] });
  s.add(crownGeo(0.06, 0.07), '#ffd36a', 'glow', { at: [0, 0.09, 0.22] });
  return s.geometry();
}

export function boltGeometry(): THREE.BufferGeometry {
  const s = new Sculpt();
  s.add(new THREE.OctahedronGeometry(0.1, 0), '#c8ffd0', 'glow', { scale: [0.8, 0.8, 1.6] });
  s.add(cone(0.06, 0.35, 6), '#5aff7a', 'glow', { at: [0, 0, -0.2], rot: [-Math.PI / 2, 0, 0] });
  return s.geometry();
}

export function boulderGeometry(): THREE.BufferGeometry {
  const s = new Sculpt();
  s.add(blob(0.17, 7, 0.25, 1, false), '#9a9284', 'matte');
  s.add(blob(0.08, 8, 0.3, 0), '#7ea83e', 'matte', { at: [0.06, 0.1, 0] });
  return s.geometry();
}

// ---- loot --------------------------------------------------------------------------

/** A loot chest on the ground: wood and gold with a green gem (common) or purple and gold (rare). */
export function chestModel(tier: number): THREE.Group {
  const rare = tier > 1;
  const s = new Sculpt();
  s.add(rbox(0.38, 0.22, 0.26, 0.03), rare ? '#4a3a8a' : '#8a5a32', 'matte', { at: [0, 0.11, 0] });
  s.add(lathe([[0.13, 0], [0.13, 0.05], [0.0, 0.09]], 8), rare ? '#4a3a8a' : '#8a5a32', 'matte', { at: [0, 0.22, 0], rot: [0, 0, Math.PI / 2], scale: [1, 2.9, 1] });
  for (const x of [-0.15, 0.15]) s.add(rbox(0.04, 0.3, 0.28, 0.01), '#e3b04b', 'gold', { at: [x, 0.17, 0] });
  s.add(rbox(0.07, 0.08, 0.03, 0.01), '#e3b04b', 'gold', { at: [0, 0.18, 0.135] });
  const g = new THREE.Group();
  g.add(s.build());
  // A floating gem above it (children[2] bobs and turns, see World3D.syncItems).
  const glow = new Sculpt();
  glow.add(new THREE.TorusGeometry(0.22, 0.015, 4, 20), rare ? '#c49aff' : '#7dffb0', 'glow', { at: [0, 0.02, 0], rot: [Math.PI / 2, 0, 0] });
  g.add(glow.build());
  const gem = new Sculpt();
  gem.add(new THREE.OctahedronGeometry(0.09, 0), rare ? '#c49aff' : '#7dffb0', 'glow', { scale: [1, 1.4, 1] });
  g.add(gem.build());
  return g;
}

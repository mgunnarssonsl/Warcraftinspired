// The map editor (?editor=1). A map is the same data the built-in maps are
// made of (sim/maps.ts: a start, mines, camps, lakes, forests, ridges,
// rivers...). You place features on either half; the map generator mirrors
// everything, so both players always get the same map. Every change
// regenerates the map and checks it (sim/mapdef.ts): mines and camps
// reachable from both bases, nothing on top of anything else, the bases
// far enough apart. Maps are kept in this browser, exported as files, and
// played against the computer or online.

import { CONFIG, type MineKind } from '../sim/config';
import { generateMap, type MapLayout } from '../sim/mapgen';
import { checkMap, cleanMapDef, MAP_H, MAP_W, type MapCheck } from '../sim/mapdef';
import { CUSTOM_PREFIX, MAPS, registerMap, type MapDef } from '../sim/maps';
import { TERRAIN } from '../sim/types';
import { browserStorage } from '../ui/settings';
import { deleteMap, loadMaps, saveMap } from './mapStore';

const SCALE = 8;
const HQ = CONFIG.buildings.hq.size;
const MINE = CONFIG.resources.goldmine.size;
const storage = browserStorage();

type Tool = 'select' | 'start' | 'mine' | 'lair' | 'shop' | 'fountain' | 'lake' | 'grove' | 'outcrop' | 'forest' | 'ridge' | 'river' | 'ring' | 'erase';

/** A draggable point of a feature. */
interface Handle {
  kind: 'start' | 'mine' | 'lair' | 'objective' | 'lake' | 'grove' | 'outcrop' | 'forest' | 'forestEnd' | 'ridgeA' | 'ridgeB' | 'riverA' | 'riverB' | 'ring';
  index: number;
  x: number;
  y: number;
}

const TOOLS: Array<{ id: Tool; label: string; tip: string }> = [
  { id: 'select', label: 'Select / move', tip: 'Drag a handle to move it; click one to edit it.' },
  { id: 'start', label: 'Start', tip: 'Where player 1’s main hall stands (player 2 gets the mirror).' },
  { id: 'mine', label: 'Gold mine', tip: 'Click to place a mine. Choose its kind and guard camp after.' },
  { id: 'lair', label: 'Lair', tip: 'A treasure camp with no mine.' },
  { id: 'shop', label: 'Trading Post', tip: 'Heroes buy items here.' },
  { id: 'fountain', label: 'Fountain', tip: 'Heals everyone nearby.' },
  { id: 'lake', label: 'Lake', tip: 'Water: impassable.' },
  { id: 'grove', label: 'Grove', tip: 'A round patch of trees (wood, and a wall until cut).' },
  { id: 'outcrop', label: 'Outcrop', tip: 'A round rock: impassable.' },
  { id: 'forest', label: 'Forest', tip: 'Drag a rectangle of trees.' },
  { id: 'ridge', label: 'Ridge', tip: 'Drag a rock wall; it has a gap in the middle (change it after).' },
  { id: 'river', label: 'River', tip: 'Drag deep water with one ford in the middle (change it after).' },
  { id: 'ring', label: 'Plateau', tip: 'Click the centre of a ring wall with two ramps.' },
  { id: 'erase', label: 'Erase', tip: 'Click a handle to remove that feature.' },
];

function blank(): MapDef {
  return {
    id: `${CUSTOM_PREFIX}new`,
    name: 'New map',
    blurb: '',
    width: MAP_W,
    height: MAP_H,
    start: { tx: 10, ty: 56 },
    mines: [{ tx: 18, ty: 57, kind: 'start', camp: 0, label: 'start' }],
    lairs: [],
    objectives: [],
    forests: [],
    groves: [],
    lakes: [],
    ridges: [],
    outcrops: [],
    rivers: [],
    rings: [],
  };
}

function esc(t: string): string {
  return t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

class Editor {
  def: MapDef;
  layout: MapLayout | null = null;
  check: MapCheck | null = null;
  tool: Tool = 'select';
  selected: Handle | null = null;
  private drag: { h: Handle | null; x0: number; y0: number; x: number; y: number } | null = null;
  private dirty = false;
  private checkTimer = 0;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private panel: HTMLElement;
  private message = '';

  constructor(def: MapDef) {
    this.def = def;
    const app = document.getElementById('app')!;
    app.innerHTML = `<div id="editor">
      <header class="ed-top"><b>Ironvale map editor</b><span class="fine">Place features anywhere: the map is mirrored, so both players get the same one.</span><a href="?" class="ed-back">Back to the game</a></header>
      <div class="ed-body">
        <div class="ed-left"><div class="ed-tools" id="ed-tools"></div><canvas id="ed-canvas" width="${MAP_W * SCALE}" height="${MAP_H * SCALE}"></canvas><p class="fine" id="ed-tip"></p><p class="fine">Mines: ★ start · t tiny · s small · M standard · R rich. Red numbers: guard camp level.</p></div>
        <aside class="ed-panel" id="ed-panel"></aside>
      </div></div>`;
    this.canvas = document.getElementById('ed-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.panel = document.getElementById('ed-panel')!;
    const tools = document.getElementById('ed-tools')!;
    tools.innerHTML = TOOLS.map((t) => `<button data-tool="${t.id}" title="${esc(t.tip)}">${t.label}</button>`).join('');
    tools.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((b) => b.addEventListener('click', () => this.setTool(b.dataset.tool as Tool)));
    this.canvas.addEventListener('mousedown', (e) => this.down(e));
    window.addEventListener('mousemove', (e) => this.move(e));
    window.addEventListener('mouseup', (e) => this.up(e));
    this.canvas.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && this.selected) this.remove(this.selected);
    });
    window.addEventListener('beforeunload', (e) => {
      if (this.dirty) e.preventDefault();
    });
    this.setTool('select');
    this.rebuild();
  }

  private setTool(t: Tool): void {
    this.tool = t;
    document.querySelectorAll('#ed-tools [data-tool]').forEach((b) => b.classList.toggle('picked', (b as HTMLElement).dataset.tool === t));
    document.getElementById('ed-tip')!.textContent = TOOLS.find((x) => x.id === t)!.tip;
  }

  /** Regenerate the map after a change; check it shortly after (checking takes a little longer). */
  rebuild(changed = false): void {
    if (changed) this.dirty = true;
    registerMap(this.def);
    try {
      this.layout = generateMap(1, this.def.id);
    } catch {
      this.layout = null;
    }
    this.draw();
    this.renderPanel();
    clearTimeout(this.checkTimer);
    this.checkTimer = window.setTimeout(() => {
      this.check = checkMap(copy(this.def));
      this.renderPanel();
    }, 250);
  }

  // ---- handles ---------------------------------------------------------------

  private handles(): Handle[] {
    const d = this.def;
    const out: Handle[] = [{ kind: 'start', index: 0, x: d.start.tx + HQ / 2, y: d.start.ty + HQ / 2 }];
    d.mines.forEach((m, i) => out.push({ kind: 'mine', index: i, x: m.tx + MINE / 2, y: m.ty + MINE / 2 }));
    d.lairs.forEach((l, i) => out.push({ kind: 'lair', index: i, x: l.x, y: l.y }));
    d.objectives.forEach((o, i) => out.push({ kind: 'objective', index: i, x: o.tx + 1, y: o.ty + 1 }));
    d.lakes.forEach((c, i) => out.push({ kind: 'lake', index: i, x: c[0], y: c[1] }));
    d.groves.forEach((c, i) => out.push({ kind: 'grove', index: i, x: c[0], y: c[1] }));
    d.outcrops.forEach((c, i) => out.push({ kind: 'outcrop', index: i, x: c[0], y: c[1] }));
    d.forests.forEach((f, i) => out.push({ kind: 'forest', index: i, x: (f.x0 + f.x1) / 2, y: (f.y0 + f.y1) / 2 }, { kind: 'forestEnd', index: i, x: f.x1, y: f.y1 }));
    d.ridges.forEach((r, i) => out.push({ kind: 'ridgeA', index: i, x: r[0], y: r[1] }, { kind: 'ridgeB', index: i, x: r[2], y: r[3] }));
    d.rivers.forEach((r, i) => out.push({ kind: 'riverA', index: i, x: r.x0, y: r.y0 }, { kind: 'riverB', index: i, x: r.x1, y: r.y1 }));
    d.rings.forEach((r, i) => out.push({ kind: 'ring', index: i, x: r.cx, y: r.cy }));
    return out;
  }

  private at(x: number, y: number): Handle | null {
    let best: Handle | null = null;
    let bestD = 1.6;
    for (const h of this.handles()) {
      const d = Math.hypot(h.x - x, h.y - y);
      if (d < bestD) {
        bestD = d;
        best = h;
      }
    }
    return best;
  }

  private tileOf(e: MouseEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * MAP_W, y: ((e.clientY - r.top) / r.height) * MAP_H };
  }

  private moveHandle(h: Handle, x: number, y: number): void {
    const d = this.def;
    const tx = Math.round(x);
    const ty = Math.round(y);
    const clampT = (v: number, size: number, max: number) => Math.max(2, Math.min(max - size - 2, v));
    switch (h.kind) {
      case 'start':
        d.start = { tx: clampT(Math.round(x - HQ / 2), HQ, MAP_W), ty: clampT(Math.round(y - HQ / 2), HQ, MAP_H) };
        break;
      case 'mine':
        Object.assign(d.mines[h.index], { tx: clampT(Math.round(x - MINE / 2), MINE, MAP_W), ty: clampT(Math.round(y - MINE / 2), MINE, MAP_H) });
        break;
      case 'lair':
        Object.assign(d.lairs[h.index], { x: Math.max(3, Math.min(MAP_W - 3, tx)), y: Math.max(3, Math.min(MAP_H - 3, ty)) });
        break;
      case 'objective':
        Object.assign(d.objectives[h.index], { tx: clampT(tx - 1, 2, MAP_W), ty: clampT(ty - 1, 2, MAP_H) });
        break;
      case 'lake':
      case 'grove':
      case 'outcrop': {
        const arr = d[`${h.kind}s` as 'lakes' | 'groves' | 'outcrops'];
        arr[h.index] = [Math.round(x * 2) / 2, Math.round(y * 2) / 2, arr[h.index][2]];
        break;
      }
      case 'forest': {
        const f = d.forests[h.index];
        const w = f.x1 - f.x0;
        const hh = f.y1 - f.y0;
        Object.assign(f, { x0: tx - Math.round(w / 2), y0: ty - Math.round(hh / 2), x1: tx - Math.round(w / 2) + w, y1: ty - Math.round(hh / 2) + hh });
        break;
      }
      case 'forestEnd': {
        const f = d.forests[h.index];
        Object.assign(f, { x1: Math.max(f.x0 + 1, tx), y1: Math.max(f.y0 + 1, ty) });
        break;
      }
      case 'ridgeA':
      case 'ridgeB': {
        const r = d.ridges[h.index];
        if (h.kind === 'ridgeA') [r[0], r[1]] = [tx, ty];
        else [r[2], r[3]] = [tx, ty];
        break;
      }
      case 'riverA':
      case 'riverB': {
        const r = d.rivers[h.index];
        if (h.kind === 'riverA') Object.assign(r, { x0: tx, y0: ty });
        else Object.assign(r, { x1: tx, y1: ty });
        break;
      }
      case 'ring':
        Object.assign(d.rings[h.index], { cx: tx, cy: ty });
        break;
    }
  }

  private remove(h: Handle): void {
    const d = this.def;
    const lists: Partial<Record<Handle['kind'], unknown[]>> = {
      mine: d.mines,
      lair: d.lairs,
      objective: d.objectives,
      lake: d.lakes,
      grove: d.groves,
      outcrop: d.outcrops,
      forest: d.forests,
      forestEnd: d.forests,
      ridgeA: d.ridges,
      ridgeB: d.ridges,
      riverA: d.rivers,
      riverB: d.rivers,
      ring: d.rings,
    };
    const arr = lists[h.kind];
    if (!arr) return; // the start cannot be removed, only moved
    if (h.kind === 'mine' && d.mines.length === 1) {
      this.message = 'A map needs at least one gold mine.';
      return this.renderPanel();
    }
    arr.splice(h.index, 1);
    this.selected = null;
    this.rebuild(true);
  }

  // ---- mouse -------------------------------------------------------------------

  private down(e: MouseEvent): void {
    const p = this.tileOf(e);
    const h = this.at(p.x, p.y);
    if (this.tool === 'erase') {
      if (h) this.remove(h);
      return;
    }
    if (this.tool === 'select' || (h && this.tool !== 'forest' && this.tool !== 'ridge' && this.tool !== 'river')) {
      this.selected = h;
      this.drag = h ? { h, x0: p.x, y0: p.y, x: p.x, y: p.y } : null;
      this.renderPanel();
      this.draw();
      return;
    }
    if (this.tool === 'forest' || this.tool === 'ridge' || this.tool === 'river') {
      this.drag = { h: null, x0: p.x, y0: p.y, x: p.x, y: p.y };
      return;
    }
    this.place(this.tool, p.x, p.y);
  }

  private move(e: MouseEvent): void {
    if (!this.drag) return;
    const p = this.tileOf(e);
    this.drag.x = p.x;
    this.drag.y = p.y;
    if (this.drag.h) {
      this.moveHandle(this.drag.h, p.x, p.y);
      registerMap(this.def);
      try {
        this.layout = generateMap(1, this.def.id);
      } catch {
        // Shown when the drag ends.
      }
    }
    this.draw();
  }

  private up(_e: MouseEvent): void {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    if (d.h) {
      // Find the handle again (its position moved), keep it selected.
      this.selected = this.handles().find((h) => h.kind === d.h!.kind && h.index === d.h!.index) ?? null;
      return this.rebuild(Math.hypot(d.x - d.x0, d.y - d.y0) > 0.2);
    }
    const [x0, y0, x1, y1] = [Math.round(d.x0), Math.round(d.y0), Math.round(d.x), Math.round(d.y)];
    if (Math.hypot(x1 - x0, y1 - y0) < 2) return;
    if (this.tool === 'forest') {
      this.def.forests.push({ x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1) });
      this.selected = { kind: 'forest', index: this.def.forests.length - 1, x: 0, y: 0 };
    } else if (this.tool === 'ridge') {
      this.def.ridges.push([x0, y0, x1, y1, 0.45, 0.55]);
      this.selected = { kind: 'ridgeA', index: this.def.ridges.length - 1, x: x0, y: y0 };
    } else {
      this.def.rivers.push({ x0, y0, x1, y1, width: 2.4, fords: [[0.45, 0.55]] });
      this.selected = { kind: 'riverA', index: this.def.rivers.length - 1, x: x0, y: y0 };
    }
    this.rebuild(true);
  }

  private wheel(e: WheelEvent): void {
    const h = this.selected;
    if (!h) return;
    const step = e.deltaY < 0 ? 0.5 : -0.5;
    const d = this.def;
    if (h.kind === 'lake' || h.kind === 'grove' || h.kind === 'outcrop') {
      e.preventDefault();
      const c = d[`${h.kind}s` as 'lakes' | 'groves' | 'outcrops'][h.index];
      c[2] = Math.max(1, Math.min(10, c[2] + step));
      this.rebuild(true);
    } else if (h.kind === 'ring') {
      e.preventDefault();
      d.rings[h.index].r = Math.max(4, Math.min(20, d.rings[h.index].r + step));
      this.rebuild(true);
    }
  }

  private place(tool: Tool, x: number, y: number): void {
    const d = this.def;
    const tx = Math.round(x);
    const ty = Math.round(y);
    let sel: Handle | null = null;
    if (tool === 'start') {
      this.moveHandle({ kind: 'start', index: 0, x: 0, y: 0 }, x, y);
      sel = { kind: 'start', index: 0, x, y };
    } else if (tool === 'mine') {
      d.mines.push({ tx: tx - 1, ty: ty - 1, kind: 'standard', camp: 1, label: 'expansion' });
      sel = { kind: 'mine', index: d.mines.length - 1, x, y };
    } else if (tool === 'lair') {
      d.lairs.push({ x: tx, y: ty, level: 2 });
      sel = { kind: 'lair', index: d.lairs.length - 1, x, y };
    } else if (tool === 'shop' || tool === 'fountain') {
      d.objectives.push({ type: tool, tx: tx - 1, ty: ty - 1 });
      sel = { kind: 'objective', index: d.objectives.length - 1, x, y };
    } else if (tool === 'lake' || tool === 'grove' || tool === 'outcrop') {
      d[`${tool}s` as 'lakes' | 'groves' | 'outcrops'].push([tx, ty, tool === 'outcrop' ? 2 : 3]);
      sel = { kind: tool, index: d[`${tool}s` as 'lakes'].length - 1, x, y };
    } else if (tool === 'ring') {
      d.rings.push({ cx: tx, cy: ty, r: 10, width: 1.6, ramps: [[0.78, 1.26], [0.78 - Math.PI, 1.26 - Math.PI]] });
      sel = { kind: 'ring', index: d.rings.length - 1, x, y };
    }
    this.selected = sel;
    this.rebuild(true);
  }

  // ---- drawing --------------------------------------------------------------------

  draw(): void {
    const c = this.ctx;
    const L = this.layout;
    c.fillStyle = '#111';
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (!L) return;
    const col = (t: number) => (t === TERRAIN.water ? '#2f5f8f' : t === TERRAIN.rock ? '#6d675f' : t === TERRAIN.dirt ? '#8f7650' : '#4f7f35');
    for (let y = 0; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++) {
        c.fillStyle = col(L.terrain[y * MAP_W + x]);
        c.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
      }
    c.fillStyle = '#21471f';
    for (const i of L.trees) c.fillRect((i % MAP_W) * SCALE + 1, Math.floor(i / MAP_W) * SCALE + 1, SCALE - 2, SCALE - 2);
    // The mirror line: the map is turned 180° about the centre.
    c.strokeStyle = 'rgba(255,255,255,0.12)';
    c.setLineDash([4, 6]);
    c.beginPath();
    c.moveTo(0, MAP_H * SCALE);
    c.lineTo(MAP_W * SCALE, 0);
    c.stroke();
    c.setLineDash([]);
    const box = (tx: number, ty: number, w: number, h: number, fill: string, text = '') => {
      c.fillStyle = fill;
      c.fillRect(tx * SCALE, ty * SCALE, w * SCALE, h * SCALE);
      c.strokeStyle = 'rgba(0,0,0,0.6)';
      c.strokeRect(tx * SCALE + 0.5, ty * SCALE + 0.5, w * SCALE - 1, h * SCALE - 1);
      if (text) {
        c.fillStyle = '#111';
        c.font = 'bold 10px system-ui';
        c.textAlign = 'center';
        c.fillText(text, (tx + w / 2) * SCALE, (ty + h / 2) * SCALE + 4);
      }
    };
    L.starts.forEach((s, i) => box(s.hq.tx, s.hq.ty, HQ, HQ, i === 0 ? '#3a7bd5' : '#d5493a', `P${i + 1}`));
    const MARK: Record<string, string> = { start: '★', tiny: 't', small: 's', standard: 'M', rich: 'R' };
    for (const m of L.mines) box(m.tx, m.ty, MINE, MINE, m.kind === 'rich' ? '#ffd23a' : '#d9b23a', MARK[m.kind] ?? '?');
    for (const o of L.objectives) box(o.tx, o.ty, 2, 2, o.type === 'shop' ? '#e8c87a' : '#7ad8e8', o.type === 'shop' ? '$' : '+');
    const campDot = (x: number, y: number, level: number) => {
      c.fillStyle = '#c0392b';
      c.beginPath();
      c.arc(x * SCALE, y * SCALE, 6, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#fff';
      c.font = 'bold 9px system-ui';
      c.textAlign = 'center';
      c.fillText(String(level), x * SCALE, y * SCALE + 3);
    };
    for (const m of L.mines) if (m.camp) campDot(m.tx + MINE + 0.6, m.ty - 0.2, m.camp);
    for (const l of L.lairs) campDot(l.x, l.y, l.level);
    // Handles for what you can edit, and the shape being dragged out.
    for (const h of this.handles()) {
      const sel = this.selected && this.selected.kind === h.kind && this.selected.index === h.index;
      c.fillStyle = sel ? '#ffe36a' : 'rgba(255,255,255,0.85)';
      c.strokeStyle = '#111';
      c.beginPath();
      c.arc(h.x * SCALE, h.y * SCALE, sel ? 5 : 3.5, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }
    const d = this.drag;
    if (d && !d.h) {
      c.strokeStyle = '#ffe36a';
      c.lineWidth = 2;
      c.beginPath();
      if (this.tool === 'forest') c.rect(Math.min(d.x0, d.x) * SCALE, Math.min(d.y0, d.y) * SCALE, Math.abs(d.x - d.x0) * SCALE, Math.abs(d.y - d.y0) * SCALE);
      else {
        c.moveTo(d.x0 * SCALE, d.y0 * SCALE);
        c.lineTo(d.x * SCALE, d.y * SCALE);
      }
      c.stroke();
      c.lineWidth = 1;
    }
  }

  // ---- side panel ------------------------------------------------------------------------

  private renderPanel(): void {
    const d = this.def;
    const ch = this.check;
    const saved = loadMaps(storage);
    const h = this.selected;
    this.panel.innerHTML = `
      <label class="field">Name <input id="ed-name" maxlength="40" value="${esc(d.name)}"></label>
      <label class="field">Description <textarea id="ed-blurb" maxlength="160" rows="2">${esc(d.blurb)}</textarea></label>
      <h3>Selected</h3>
      <div id="ed-props">${this.propsHtml(h)}</div>
      <h3>Check</h3>
      <div class="ed-check">${
        !ch
          ? '<p class="fine">Checking…</p>'
          : `${ch.errors.map((e) => `<p class="ed-error">✖ ${esc(e)}</p>`).join('')}${ch.warnings.map((w) => `<p class="ed-warn">⚠ ${esc(w)}</p>`).join('')}${
              !ch.errors.length ? `<p class="ed-ok">✔ Playable and fair${ch.baseDistance ? ` · bases ${ch.baseDistance} tiles apart` : ''}.</p>` : ''
            }`
      }</div>
      <p class="fine">${esc(this.message)}</p>
      <div class="stack">
        <button class="primary" id="ed-play" ${ch && !ch.errors.length ? '' : 'disabled'}>Save and play against the computer</button>
        <button id="ed-save">Save in this browser</button>
        <button id="ed-export">Export to a file</button>
        <label class="file-btn">Import a file…<input type="file" id="ed-import" accept=".json,application/json"></label>
      </div>
      <h3>Start from</h3>
      <div class="chips">
        ${MAPS.map((m) => `<button data-template="${m.id}">${esc(m.name)}</button>`).join('')}
        <button data-template="blank">Blank</button>
      </div>
      ${
        saved.length
          ? `<h3>Your maps</h3><div class="ed-maps">${saved
              .map((m) => `<div><button data-open="${m.id}">${esc(m.name)}</button> <button class="danger" data-delete="${m.id}" title="Delete">✖</button></div>`)
              .join('')}</div>`
          : ''
      }`;
    const name = this.panel.querySelector('#ed-name') as HTMLInputElement;
    name.addEventListener('change', () => {
      d.name = name.value.trim() || 'Untitled';
      this.dirty = true;
    });
    const blurb = this.panel.querySelector('#ed-blurb') as HTMLTextAreaElement;
    blurb.addEventListener('change', () => {
      d.blurb = blurb.value;
      this.dirty = true;
    });
    this.wireProps(h);
    this.panel.querySelector('#ed-save')!.addEventListener('click', () => this.save());
    this.panel.querySelector('#ed-play')!.addEventListener('click', () => {
      const id = this.save();
      if (id) location.search = new URLSearchParams({ map: id }).toString();
    });
    this.panel.querySelector('#ed-export')!.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(this.final(), null, 1)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `ironvale-map-${d.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    });
    this.panel.querySelector('#ed-import')!.addEventListener('change', async (e) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (!f) return;
      let raw: unknown;
      try {
        raw = JSON.parse(await f.text());
      } catch {
        raw = null;
      }
      const c = cleanMapDef(raw);
      if (!c.ok) {
        this.message = `That file cannot be used: ${c.reason}`;
        return this.renderPanel();
      }
      this.load(c.def);
    });
    this.panel.querySelectorAll<HTMLButtonElement>('[data-template]').forEach((b) =>
      b.addEventListener('click', () => {
        const t = b.dataset.template!;
        const base = t === 'blank' ? blank() : copy(MAPS.find((m) => m.id === t)!);
        this.load({ ...base, id: `${CUSTOM_PREFIX}new`, name: t === 'blank' ? 'New map' : `${base.name} (edited)` });
      }),
    );
    this.panel.querySelectorAll<HTMLButtonElement>('[data-open]').forEach((b) =>
      b.addEventListener('click', () => {
        const m = loadMaps(storage).find((x) => x.id === b.dataset.open);
        if (m) this.load(copy(m));
      }),
    );
    this.panel.querySelectorAll<HTMLButtonElement>('[data-delete]').forEach((b) =>
      b.addEventListener('click', () => {
        if (!confirm('Delete this map from this browser?')) return;
        deleteMap(storage, b.dataset.delete!);
        this.renderPanel();
      }),
    );
  }

  private load(def: MapDef): void {
    if (this.dirty && !confirm('Leave this map without saving it?')) return;
    this.def = def;
    this.selected = null;
    this.message = '';
    this.dirty = false;
    this.check = null;
    this.rebuild();
  }

  /** The map as saved: a stable id from its name, checked like any imported map. */
  private final(): MapDef {
    const slug = this.def.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'map';
    const c = cleanMapDef({ ...this.def, id: `${CUSTOM_PREFIX}${slug}` });
    return c.ok ? c.def : this.def;
  }

  private save(): string | null {
    const def = this.final();
    if (!saveMap(storage, def)) {
      this.message = 'The browser would not store the map. Export it to a file instead.';
      this.renderPanel();
      return null;
    }
    this.def = copy(def);
    this.dirty = false;
    this.message = `Saved “${def.name}”.`;
    this.rebuild();
    return def.id;
  }

  private propsHtml(h: Handle | null): string {
    if (!h) return '<p class="fine">Nothing selected. Pick a tool above the map, or select a handle (white dot).</p>';
    const d = this.def;
    const del = h.kind === 'start' ? '' : '<button class="danger" id="ed-del">Remove</button>';
    switch (h.kind) {
      case 'start':
        return '<p>Player 1’s start (player 2 starts at the mirror). Drag it to move the base.</p>';
      case 'mine': {
        const m = d.mines[h.index];
        const kinds = Object.keys(CONFIG.mineKinds) as MineKind[];
        return `<p>Gold mine</p>
          <div class="rule"><span>Kind</span><div class="chips">${kinds.map((k) => `<button data-kind="${k}" class="${m.kind === k ? 'picked' : ''}">${k} (${CONFIG.mineKinds[k].gold})</button>`).join('')}</div></div>
          <div class="rule"><span>Guard camp</span><div class="chips">${[0, 1, 2, 3].map((l) => `<button data-camp="${l}" class="${m.camp === l ? 'picked' : ''}">${l === 0 ? 'none' : `level ${l}`}</button>`).join('')}</div></div>${del}`;
      }
      case 'lair': {
        const l = d.lairs[h.index];
        return `<p>Lair</p><div class="rule"><span>Level</span><div class="chips">${[2, 3].map((v) => `<button data-level="${v}" class="${l.level === v ? 'picked' : ''}">level ${v}</button>`).join('')}</div></div>${del}`;
      }
      case 'objective':
        return `<p>${d.objectives[h.index].type === 'shop' ? 'Trading Post' : 'Healing Fountain'}</p>${del}`;
      case 'lake':
      case 'grove':
      case 'outcrop':
        return `<p>${h.kind[0].toUpperCase()}${h.kind.slice(1)} · radius ${d[`${h.kind}s` as 'lakes'][h.index][2]} (mouse wheel changes it)</p>${del}`;
      case 'forest':
      case 'forestEnd':
        return `<p>Forest (drag the centre to move it, the corner to resize)</p>${del}`;
      case 'ridgeA':
      case 'ridgeB': {
        const r = d.ridges[h.index];
        return `<p>Ridge: a rock wall with a gap</p><label class="field">Gap from <input type="range" id="ed-g0" min="0" max="1" step="0.05" value="${r[4]}"></label><label class="field">Gap to <input type="range" id="ed-g1" min="0" max="1" step="0.05" value="${r[5]}"></label>${del}`;
      }
      case 'riverA':
      case 'riverB': {
        const r = d.rivers[h.index];
        return `<p>River with ${r.fords.length} ford(s)</p><label class="field">Width <input type="range" id="ed-rw" min="1" max="4" step="0.2" value="${r.width}"></label><button id="ed-ford">Add a ford</button> <button id="ed-unford">Remove the last ford</button>${del}`;
      }
      case 'ring':
        return `<p>Plateau wall · radius ${d.rings[h.index].r} (mouse wheel changes it); two ramps opposite each other.</p>${del}`;
    }
  }

  private wireProps(h: Handle | null): void {
    if (!h) return;
    const d = this.def;
    const p = this.panel;
    p.querySelector('#ed-del')?.addEventListener('click', () => this.remove(h));
    p.querySelectorAll<HTMLButtonElement>('[data-kind]').forEach((b) =>
      b.addEventListener('click', () => {
        d.mines[h.index].kind = b.dataset.kind as MineKind;
        this.rebuild(true);
      }),
    );
    p.querySelectorAll<HTMLButtonElement>('[data-camp]').forEach((b) =>
      b.addEventListener('click', () => {
        d.mines[h.index].camp = Number(b.dataset.camp) as 0 | 1 | 2 | 3;
        this.rebuild(true);
      }),
    );
    p.querySelectorAll<HTMLButtonElement>('[data-level]').forEach((b) =>
      b.addEventListener('click', () => {
        d.lairs[h.index].level = Number(b.dataset.level) as 2 | 3;
        this.rebuild(true);
      }),
    );
    const range = (id: string, set: (v: number) => void) =>
      p.querySelector<HTMLInputElement>(id)?.addEventListener('change', (e) => {
        set(Number((e.target as HTMLInputElement).value));
        this.rebuild(true);
      });
    if (h.kind === 'ridgeA' || h.kind === 'ridgeB') {
      range('#ed-g0', (v) => (d.ridges[h.index][4] = Math.min(v, d.ridges[h.index][5])));
      range('#ed-g1', (v) => (d.ridges[h.index][5] = Math.max(v, d.ridges[h.index][4])));
    }
    if (h.kind === 'riverA' || h.kind === 'riverB') {
      const r = d.rivers[h.index];
      range('#ed-rw', (v) => (r.width = v));
      p.querySelector('#ed-ford')?.addEventListener('click', () => {
        // A new ford in the widest stretch without one.
        const taken = [...r.fords].sort((a, b) => a[0] - b[0]);
        let best = { at: 0.5, gap: -1 };
        let prev = 0;
        for (const [a, b] of [...taken, [1, 1] as [number, number]]) {
          if (a - prev > best.gap) best = { at: (prev + a) / 2, gap: a - prev };
          prev = b;
        }
        r.fords.push([Math.max(0, best.at - 0.04), Math.min(1, best.at + 0.04)]);
        this.rebuild(true);
      });
      p.querySelector('#ed-unford')?.addEventListener('click', () => {
        r.fords.pop();
        this.rebuild(true);
      });
    }
  }
}

// Start: the map named in ?edit=, else a copy of Twin Vales to change.
const params = new URLSearchParams(location.search);
const editId = params.get('edit');
const existing = editId ? loadMaps(storage).find((m) => m.id === editId) : undefined;
const editor = new Editor(existing ? copy(existing) : { ...copy(MAPS[0]), id: `${CUSTOM_PREFIX}new`, name: 'Twin Vales (edited)' });
(window as unknown as { __editor: Editor }).__editor = editor;

// Translates mouse and keyboard input into selection changes, camera motion
// and simulation Commands. Contextual right-click logic lives here; the
// simulation only ever receives explicit commands.

import type { Camera } from '../render/camera';
import type { Renderer } from '../render/renderer';
import type { Game } from '../sim/game';
import { acceptsResource } from '../sim/gathering';
import type { Entity, Unit } from '../sim/types';
import type { ClientState, TargetMode } from './client';

const EDGE = 10; // px from window edge that triggers scrolling
const PAN_SPEED = 900; // px per second
const DRAG_THRESHOLD = 5;

export class InputController {
  private mouse = { x: -1, y: -1, inside: false };
  private keys = new Set<string>();
  private dragStart: { x: number; y: number } | null = null;
  private midDrag: { x: number; y: number } | null = null;
  private lastClick = { t: 0, id: 0 };
  private lastGroupKey = { t: 0, n: -1 };
  /** Callbacks the HUD can subscribe to. */
  onSelectionChanged: () => void = () => {};
  onMessage: (text: string) => void = () => {};

  constructor(
    private canvas: HTMLCanvasElement,
    private game: Game,
    private cam: Camera,
    private client: ClientState,
    private renderer: Renderer,
    private now: () => number,
  ) {
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mousedown', (e) => this.mouseDown(e));
    window.addEventListener('mousemove', (e) => this.mouseMove(e));
    window.addEventListener('mouseup', (e) => this.mouseUp(e));
    canvas.addEventListener('mouseleave', () => (this.mouse.inside = false));
    canvas.addEventListener('mouseenter', () => (this.mouse.inside = true));
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.cam.zoomAt(e.offsetX, e.offsetY, e.deltaY < 0 ? 1.1 : 1 / 1.1);
    }, { passive: false });
    window.addEventListener('keydown', (e) => this.keyDown(e));
    window.addEventListener('keyup', (e) => this.keys.delete(e.key));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.inside = false;
      this.dragStart = null;
      this.client.drag = null;
    });
  }

  setGame(game: Game): void {
    this.game = game;
  }

  /** Per-frame camera scrolling. */
  update(dt: number): void {
    let dx = 0;
    let dy = 0;
    if (this.keys.has('ArrowLeft')) dx -= 1;
    if (this.keys.has('ArrowRight')) dx += 1;
    if (this.keys.has('ArrowUp')) dy -= 1;
    if (this.keys.has('ArrowDown')) dy += 1;
    if (this.mouse.inside && !this.dragStart && !this.midDrag && document.hasFocus()) {
      const { x, y } = this.mouse;
      if (x >= 0 && x < EDGE) dx -= 1;
      if (x > this.cam.viewW - EDGE) dx += 1;
      if (y >= 0 && y < EDGE) dy -= 1;
      if (y > this.cam.viewH - EDGE && y <= this.cam.viewH) dy += 1;
    }
    if (dx || dy) this.cam.pan(dx * PAN_SPEED * dt, dy * PAN_SPEED * dt);
    this.client.hoverId = this.mouse.inside ? (this.pick(this.mouse.x, this.mouse.y)?.id ?? 0) : 0;
    this.canvas.style.cursor = this.cursor();
  }

  private cursor(): string {
    if (this.client.targetMode) return 'crosshair';
    const h = this.client.hoverId ? this.game.get(this.client.hoverId) : undefined;
    if (h && h.kind === 'resource' && this.selectedWorkers().length) return 'pointer';
    return 'default';
  }

  // ---- picking ----------------------------------------------------------------

  /** Topmost entity under a screen point (units first, then structures). */
  pick(sx: number, sy: number): Entity | undefined {
    const w = this.cam.toWorld(sx, sy);
    let best: Entity | undefined;
    let bestD = Infinity;
    for (const u of this.game.units()) {
      if (u.hidden) continue;
      // Hit area covers the drawn body, which sits above the ground point.
      const d = Math.hypot(u.x - w.x, u.y - 0.35 - w.y);
      if (d < 0.5 && d < bestD) {
        best = u;
        bestD = d;
      }
    }
    if (best) return best;
    const tx = Math.floor(w.x);
    const ty = Math.floor(w.y);
    const nav = this.game.nav;
    // Tall sprites (trees, keeps) are clickable slightly above their footprint.
    for (const oy of [0, 1]) {
      if (!nav.inBounds(tx, ty + oy)) continue;
      const id = nav.entityAt[(ty + oy) * nav.w + tx];
      const e = id ? this.game.get(id) : undefined;
      if (e && (oy === 0 || e.kind === 'resource' || e.kind === 'building')) return e;
    }
    for (const b of this.game.buildings()) {
      if (w.x >= b.tx && w.x < b.tx + b.w && w.y >= b.ty - 1.5 && w.y < b.ty + b.h) return b;
    }
    return undefined;
  }

  private ownSelectedUnits(): Unit[] {
    const out: Unit[] = [];
    for (const id of this.client.selected) {
      const u = this.game.unit(id);
      if (u && u.owner === this.client.player) out.push(u);
    }
    return out;
  }

  private selectedWorkers(): Unit[] {
    return this.ownSelectedUnits().filter((u) => u.type === 'worker');
  }

  setSelection(ids: number[]): void {
    this.client.selected = ids;
    this.onSelectionChanged();
  }

  // ---- mouse ------------------------------------------------------------------

  private local(e: MouseEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private mouseDown(e: MouseEvent): void {
    const p = this.local(e);
    if (e.button === 0) {
      if (this.client.targetMode) {
        this.issueTargeted(this.client.targetMode, p.x, p.y, e.shiftKey);
        return;
      }
      this.dragStart = p;
    } else if (e.button === 2) {
      if (this.client.targetMode) {
        this.client.targetMode = null;
        return;
      }
      this.smartCommand(p.x, p.y);
    } else if (e.button === 1) {
      e.preventDefault();
      this.midDrag = p;
    }
  }

  private mouseMove(e: MouseEvent): void {
    const p = this.local(e);
    this.mouse.x = p.x;
    this.mouse.y = p.y;
    this.mouse.inside = p.x >= 0 && p.y >= 0 && p.x < this.cam.viewW && p.y < this.cam.viewH;
    if (this.midDrag) {
      this.cam.pan(this.midDrag.x - p.x, this.midDrag.y - p.y);
      this.midDrag = p;
    }
    if (this.dragStart) {
      const d = Math.hypot(p.x - this.dragStart.x, p.y - this.dragStart.y);
      if (d > DRAG_THRESHOLD || this.client.drag) {
        this.client.drag = { x0: this.dragStart.x, y0: this.dragStart.y, x1: p.x, y1: p.y };
      }
    }
  }

  private mouseUp(e: MouseEvent): void {
    if (e.button === 1) this.midDrag = null;
    if (e.button !== 0 || !this.dragStart) return;
    const p = this.local(e);
    if (this.client.drag) this.boxSelect(this.client.drag, e.shiftKey);
    else this.clickSelect(p.x, p.y, e.shiftKey);
    this.dragStart = null;
    this.client.drag = null;
  }

  private clickSelect(sx: number, sy: number, shift: boolean): void {
    const e = this.pick(sx, sy);
    const now = this.now();
    if (!e) {
      if (!shift) this.setSelection([]);
      return;
    }
    const own = e.kind === 'unit' && e.owner === this.client.player;
    if (own && now - this.lastClick.t < 0.35 && this.lastClick.id === e.id) {
      // Double-click: all own units of this type on screen.
      const ids = this.game
        .units()
        .filter((u) => u.owner === this.client.player && u.type === e.type && !u.hidden && this.onScreen(u.x, u.y))
        .map((u) => u.id);
      this.setSelection(ids);
      this.lastClick = { t: 0, id: 0 };
      return;
    }
    this.lastClick = { t: now, id: e.id };
    if (shift && own) {
      const sel = this.client.selected.filter((id) => this.game.unit(id)?.owner === this.client.player);
      const i = sel.indexOf(e.id);
      if (i >= 0) sel.splice(i, 1);
      else sel.push(e.id);
      this.setSelection(sel);
      return;
    }
    if (shift && this.ownSelectedUnits().length) return; // can't mix foreign objects into a group
    this.setSelection([e.id]);
  }

  private onScreen(x: number, y: number): boolean {
    const s = this.cam.toScreen(x, y);
    return s.x >= 0 && s.y >= 0 && s.x <= this.cam.viewW && s.y <= this.cam.viewH;
  }

  private boxSelect(box: { x0: number; y0: number; x1: number; y1: number }, shift: boolean): void {
    const x0 = Math.min(box.x0, box.x1);
    const x1 = Math.max(box.x0, box.x1);
    const y0 = Math.min(box.y0, box.y1);
    const y1 = Math.max(box.y0, box.y1);
    const hits = this.game
      .units()
      .filter((u) => {
        if (u.owner !== this.client.player || u.hidden) return false;
        const s = this.cam.toScreen(u.x, u.y - 0.3);
        const r = 8 * this.cam.zoom; // generous edge tolerance
        return s.x + r >= x0 && s.x - r <= x1 && s.y + r >= y0 && s.y - r <= y1;
      })
      .map((u) => u.id);
    if (shift) {
      const base = this.client.selected.filter((id) => this.game.unit(id)?.owner === this.client.player);
      this.setSelection([...base, ...hits.filter((id) => !base.includes(id))]);
    } else {
      this.setSelection(hits);
    }
  }

  // ---- commands ---------------------------------------------------------------

  /** Right-click: decide the command from what is under the cursor. */
  private smartCommand(sx: number, sy: number): void {
    const units = this.ownSelectedUnits();
    if (!units.length) return;
    const target = this.pick(sx, sy);
    const w = this.cam.toWorld(sx, sy);
    const player = this.client.player;
    const now = this.now();
    const workers = units.filter((u) => u.type === 'worker');
    const others = units.filter((u) => u.type !== 'worker');
    if (target?.kind === 'resource' && workers.length) {
      this.game.issue({ type: 'gather', player, units: workers.map((u) => u.id), nodeId: target.id });
      this.renderer.flashEntity(target.id, now);
      if (others.length) this.game.issue({ type: 'move', player, units: others.map((u) => u.id), x: w.x, y: w.y });
      return;
    }
    if (target?.kind === 'building' && target.owner === player) {
      const carriers = workers.filter((u) => u.carry.res && acceptsResource(target, u.carry.res));
      if (carriers.length) {
        this.game.issue({ type: 'returnCargo', player, units: carriers.map((u) => u.id), dropoffId: target.id });
        this.renderer.flashEntity(target.id, now);
        const rest = units.filter((u) => !carriers.includes(u));
        if (rest.length) this.game.issue({ type: 'move', player, units: rest.map((u) => u.id), x: w.x, y: w.y });
        return;
      }
    }
    this.game.issue({ type: 'move', player, units: units.map((u) => u.id), x: w.x, y: w.y });
    this.renderer.addMarker(w.x, w.y, '#5dff6a', now);
  }

  private issueTargeted(mode: Exclude<TargetMode, null>, sx: number, sy: number, shift: boolean): void {
    const units = this.ownSelectedUnits();
    const player = this.client.player;
    const w = this.cam.toWorld(sx, sy);
    const now = this.now();
    if (mode === 'move') {
      this.game.issue({ type: 'move', player, units: units.map((u) => u.id), x: w.x, y: w.y });
      this.renderer.addMarker(w.x, w.y, '#5dff6a', now);
    } else {
      const target = this.pick(sx, sy);
      if (target?.kind !== 'resource') {
        this.onMessage('Select a gold mine or tree to gather from.');
        return; // stay in targeting mode
      }
      const workers = units.filter((u) => u.type === 'worker');
      this.game.issue({ type: 'gather', player, units: workers.map((u) => u.id), nodeId: target.id });
      this.renderer.flashEntity(target.id, now);
    }
    if (!shift) this.client.targetMode = null;
  }

  /** Command-card actions, shared by buttons and hotkeys. */
  action(name: 'move' | 'stop' | 'gather' | 'return'): void {
    const units = this.ownSelectedUnits();
    if (!units.length) return;
    const player = this.client.player;
    if (name === 'stop') this.game.issue({ type: 'stop', player, units: units.map((u) => u.id) });
    else if (name === 'return') {
      const carriers = units.filter((u) => u.carry.amount > 0);
      if (carriers.length) this.game.issue({ type: 'returnCargo', player, units: carriers.map((u) => u.id) });
    } else if (name === 'gather') {
      if (units.some((u) => u.type === 'worker')) this.client.targetMode = 'gather';
    } else this.client.targetMode = name;
  }

  selectIdleWorker(): void {
    const idle = this.game.idleWorkers(this.client.player).filter((u) => !u.hidden);
    if (!idle.length) return;
    // Cycle through idle workers on repeated presses.
    const cur = this.client.selected.length === 1 ? this.client.selected[0] : 0;
    const i = idle.findIndex((u) => u.id === cur);
    const next = idle[(i + 1) % idle.length];
    this.setSelection([next.id]);
    this.cam.centerOn(next.x, next.y);
  }

  centerOnSelection(): void {
    const es = this.client.selected.map((id) => this.game.get(id)).filter((e): e is Entity => !!e);
    if (!es.length) return;
    const x = es.reduce((s, e) => s + e.x, 0) / es.length;
    const y = es.reduce((s, e) => s + e.y, 0) / es.length;
    this.cam.centerOn(x, y);
  }

  // ---- keyboard ---------------------------------------------------------------

  private keyDown(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement) return;
    this.keys.add(e.key);
    const k = e.key.toLowerCase();
    if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      return;
    }
    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      this.controlGroup(Number(e.key), e.ctrlKey || e.metaKey, e.shiftKey);
      return;
    }
    switch (k) {
      case 'escape':
        if (this.client.targetMode) this.client.targetMode = null;
        else this.setSelection([]);
        break;
      case 's':
        this.action('stop');
        break;
      case 'm':
        this.action('move');
        break;
      case 'g':
        this.action('gather');
        break;
      case 'r':
        this.action('return');
        break;
      case '.':
        this.selectIdleWorker();
        break;
      case ' ':
        e.preventDefault();
        if (this.renderer.pings.length) {
          const p = this.renderer.pings[this.renderer.pings.length - 1];
          this.cam.centerOn(p.x, p.y);
        } else this.centerOnSelection();
        break;
      case 'f3':
      case '`':
        e.preventDefault();
        this.client.debug = !this.client.debug;
        break;
      case 'p':
      case 'pause':
        this.client.paused = !this.client.paused;
        break;
    }
  }

  private controlGroup(n: number, assign: boolean, add: boolean): void {
    const groups = this.client.groups;
    if (assign) {
      groups[n] = this.ownSelectedUnits().map((u) => u.id);
      this.onMessage(`Control group ${n} set (${groups[n].length}).`);
      return;
    }
    if (add) {
      const cur = groups[n] ?? [];
      groups[n] = [...cur, ...this.ownSelectedUnits().map((u) => u.id).filter((id) => !cur.includes(id))];
      return;
    }
    const ids = (groups[n] ?? []).filter((id) => this.game.unit(id));
    if (!ids.length) return;
    const now = this.now();
    if (this.lastGroupKey.n === n && now - this.lastGroupKey.t < 0.35) {
      this.setSelection(ids);
      this.centerOnSelection();
    } else this.setSelection(ids);
    this.lastGroupKey = { n, t: now };
  }
}

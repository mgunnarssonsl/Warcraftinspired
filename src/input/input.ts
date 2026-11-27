// Translates mouse and keyboard input into selection changes, camera motion
// and simulation Commands. Contextual right-click logic lives here; the
// simulation only ever receives explicit commands. Screen <-> world
// conversion and picking are delegated to the 3D view.

import { buildableFor, buildingRole, isHall, isWorker } from '../sim/factions';
import type { World3D } from '../render3d/world';
import { CONFIG, type AbilityId, type BuildingType, type HeroType, type ItemId, type ResearchId, type UnitType } from '../sim/config';
import { abilitiesOf } from '../sim/hero';
import { canAfford, checkPlacement, shortfall, snapFootprint } from '../sim/construction';
import type { Game } from '../sim/game';
import { acceptsResource } from '../sim/gathering';
import { trainableAt } from '../sim/production';
import { researchAt, researched } from '../sim/tech';
import { canAttack, isEnemy, targetable } from '../sim/combat';
import { reachProblem } from '../sim/movement';
import type { Building, Entity, Unit } from '../sim/types';
import type { Minimap } from '../ui/minimap';
import type { ClientState, TargetMode } from './client';
import { eventKey, type KeyAction } from './keymap';
import { defaultSettings, type Settings } from '../ui/settings';

const EDGE = 10; // px from the view edge that triggers scrolling
const PAN_SPEED = 900; // px per second at camera speed 1
const DRAG_THRESHOLD = 5;

export type Action =
  | 'move'
  | 'stop'
  | 'attack'
  | 'hold'
  | 'gather'
  | 'return'
  | 'repair'
  | 'cancel'
  | `build:${BuildingType}`
  | `train:${UnitType}`
  | `research:${ResearchId}`
  | `cast:${AbilityId}`
  | `item:${number}`
  | `drop:${number}`
  | `buy:${ItemId}`
  | 'flare';

/** Hotkeys of the hero's inventory slots. */
export const ITEM_KEYS = ['z', 'x', 'c'];

export class InputController {
  private mouse = { x: -1, y: -1, inside: false, moved: true };
  private keys = new Set<string>();
  private dragStart: { x: number; y: number } | null = null;
  /** Right/middle button held: grab-pan once it moves past the threshold. */
  /** Shift is held: orders given now are queued after current ones. */
  private shiftDown = false;
  private grab: { button: number; x: number; y: number; anchor: { x: number; y: number } | null; panning: boolean; shift: boolean } | null =
    null;
  private lastClick = { t: 0, id: 0 };
  private lastGroupKey = { t: 0, n: -1 };
  private framesSincePick = 0;
  /** Player settings (keys, camera speed, edge panning); replaced when they change. */
  settings: Settings = defaultSettings();
  onSelectionChanged: () => void = () => {};
  onMessage: (text: string) => void = () => {};

  constructor(
    private canvas: HTMLCanvasElement,
    private game: Game,
    private world: World3D,
    private client: ClientState,
    private minimap: Minimap,
    private now: () => number,
  ) {
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mousedown', (e) => this.mouseDown(e));
    window.addEventListener('mousemove', (e) => this.mouseMove(e));
    window.addEventListener('mouseup', (e) => this.mouseUp(e));
    canvas.addEventListener('mouseleave', () => (this.mouse.inside = false));
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const p = this.local(e);
        const step = 1 + 0.12 * this.settings.camera.zoomSpeed;
        this.rig.zoomAt(p.x, p.y, e.deltaY < 0 ? step : 1 / step);
        this.mouse.moved = true;
      },
      { passive: false },
    );
    window.addEventListener('keydown', (e) => {
      this.shiftDown = e.shiftKey;
      this.keyDown(e);
    });
    window.addEventListener('keyup', (e) => (this.shiftDown = e.shiftKey));
    window.addEventListener('keyup', (e) => this.keys.delete(eventKey(e)));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.inside = false;
      this.dragStart = null;
      this.grab = null;
      this.client.drag = null;
    });
  }

  private get rig() {
    return this.world.rig;
  }

  /** Per-frame: camera scrolling, hover picking, placement preview. */
  update(dt: number): void {
    let dx = 0;
    let dy = 0;
    const held = (a: KeyAction) => this.keys.has(this.settings.keys[a]);
    if (held('panLeft')) dx -= 1;
    if (held('panRight')) dx += 1;
    if (held('panUp')) dy -= 1;
    if (held('panDown')) dy += 1;
    if (this.settings.camera.edgePan && this.mouse.inside && !this.dragStart && !this.grab?.panning && document.hasFocus()) {
      const { x, y } = this.mouse;
      if (x < EDGE) dx -= 1;
      if (x > this.rig.viewW - EDGE) dx += 1;
      if (y < EDGE) dy -= 1;
      if (y > this.rig.viewH - EDGE) dy += 1;
    }
    if (dx || dy) {
      const speed = PAN_SPEED * this.settings.camera.panSpeed;
      this.rig.pan(dx * speed * dt, dy * speed * dt);
      this.mouse.moved = true;
    }
    // Picking raycasts are not free: refresh on movement, or a few times a second.
    if (this.mouse.moved || ++this.framesSincePick > 8) {
      this.client.hoverId = this.mouse.inside && !this.client.placing ? (this.world.pick(this.mouse.x, this.mouse.y)?.id ?? 0) : 0;
      this.mouse.moved = false;
      this.framesSincePick = 0;
    }
    this.updatePreview();
    this.canvas.style.cursor = this.cursor();
  }

  private updatePreview(): void {
    const type = this.client.placing;
    if (type && !this.ownSelectedUnits().some((u) => isWorker(u.type))) this.client.placing = null;
    const g = this.client.placing && this.mouse.inside ? this.rig.screenToGround(this.mouse.x, this.mouse.y) : null;
    if (!this.client.placing || !g) {
      this.world.setPreview(null, null, null, false);
      return;
    }
    const f = snapFootprint(this.client.placing, g.x, g.y);
    const check = checkPlacement(this.game, this.client.placing, f.tx, f.ty);
    this.world.setPreview(this.client.placing, f, check, canAfford(this.game, this.client.player, this.client.placing));
  }

  private cursor(): string {
    if (this.grab?.panning) return 'grabbing';
    if (this.client.targetMode || this.client.placing) return 'crosshair';
    const h = this.client.hoverId ? this.game.get(this.client.hoverId) : undefined;
    if (h && h.kind !== 'unit' && this.selectedWorkers().length) return 'pointer';
    return 'default';
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
    return this.ownSelectedUnits().filter((u) => isWorker(u.type));
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
      if (this.client.placing) {
        this.placeBuilding(p.x, p.y, e.shiftKey);
        return;
      }
      if (this.client.targetMode) {
        this.issueTargeted(this.client.targetMode, p.x, p.y, e.shiftKey);
        return;
      }
      this.dragStart = p;
    } else if (e.button === 2 || e.button === 1) {
      // Hold and drag to grab-pan the map; a plain right-click acts on release.
      e.preventDefault();
      this.grab = { button: e.button, x: p.x, y: p.y, anchor: this.rig.screenToGround(p.x, p.y), panning: e.button === 1, shift: e.shiftKey };
    }
  }

  /** What a right-click (press and release without dragging) does. */
  private rightClick(sx: number, sy: number, shift: boolean): void {
    if (this.client.targetMode || this.client.placing) {
      this.client.targetMode = null;
      this.client.placing = null;
      return;
    }
    this.smartCommand(sx, sy, shift);
  }

  private mouseMove(e: MouseEvent): void {
    const p = this.local(e);
    this.mouse.x = p.x;
    this.mouse.y = p.y;
    this.mouse.inside = p.x >= 0 && p.y >= 0 && p.x < this.rig.viewW && p.y < this.rig.viewH;
    this.mouse.moved = true;
    const grab = this.grab;
    if (grab) {
      if (!grab.panning && Math.hypot(p.x - grab.x, p.y - grab.y) > DRAG_THRESHOLD) grab.panning = true;
      if (grab.panning && grab.anchor) this.rig.dragTo(grab.anchor, p.x, p.y);
    }
    if (this.dragStart) {
      const d = Math.hypot(p.x - this.dragStart.x, p.y - this.dragStart.y);
      if (d > DRAG_THRESHOLD || this.client.drag) {
        this.client.drag = { x0: this.dragStart.x, y0: this.dragStart.y, x1: p.x, y1: p.y };
      }
    }
  }

  private mouseUp(e: MouseEvent): void {
    if (this.grab && e.button === this.grab.button) {
      const g = this.grab;
      this.grab = null;
      if (e.button === 2 && !g.panning) this.rightClick(g.x, g.y, g.shift || e.shiftKey);
      return;
    }
    if (e.button !== 0 || !this.dragStart) return;
    const p = this.local(e);
    if (this.client.drag) this.boxSelect(this.client.drag, e.shiftKey);
    else this.clickSelect(p.x, p.y, e.shiftKey);
    this.dragStart = null;
    this.client.drag = null;
  }

  private clickSelect(sx: number, sy: number, shift: boolean): void {
    const e = this.world.pick(sx, sy);
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
    if (shift && this.ownSelectedUnits().length) return; // can't mix other objects into a group
    this.setSelection([e.id]);
  }

  private onScreen(x: number, y: number): boolean {
    const s = this.rig.project(x, y, 0.4);
    return s.visible && s.x >= 0 && s.y >= 0 && s.x <= this.rig.viewW && s.y <= this.rig.viewH;
  }

  private boxSelect(box: { x0: number; y0: number; x1: number; y1: number }, shift: boolean): void {
    const x0 = Math.min(box.x0, box.x1);
    const x1 = Math.max(box.x0, box.x1);
    const y0 = Math.min(box.y0, box.y1);
    const y1 = Math.max(box.y0, box.y1);
    let hits = this.game
      .units()
      .filter((u) => {
        if (u.owner !== this.client.player || u.hidden) return false;
        // Test the projected body center with a small tolerance for the model's size.
        const s = this.rig.project(u.x, u.y, 0.5);
        const r = 8;
        return s.visible && s.x + r >= x0 && s.x - r <= x1 && s.y + r >= y0 && s.y - r <= y1;
      })
      .map((u) => u.id);
    // A box over troops and workers takes only the troops; workers alone are still selected.
    const troops = hits.filter((id) => !isWorker(this.game.unit(id)!.type));
    if (troops.length) hits = troops;
    if (shift) {
      const base = this.client.selected.filter((id) => this.game.unit(id)?.owner === this.client.player);
      this.setSelection([...base, ...hits.filter((id) => !base.includes(id))]);
    } else {
      this.setSelection(hits);
    }
  }

  // ---- commands ---------------------------------------------------------------

  /** Right-click: decide the command from what is under the cursor. */
  private smartCommand(sx: number, sy: number, shift = false): void {
    const units = this.ownSelectedUnits();
    if (!units.length) {
      const b = this.selectedOwnBuilding();
      if (b && trainableAt(b.type).length) this.setRally(b.id, sx, sy);
      return;
    }
    const player = this.client.player;
    const now = this.now();
    // A hero right-clicking an item on the ground picks it up.
    const hero = units.find((u) => u.hero);
    const item = hero ? this.world.pickItem(sx, sy) : undefined;
    if (hero && item) {
      this.game.issue({ type: 'pickup', player, units: [hero.id], itemId: item.id });
      this.world.addMarker(item.x, item.y, now, '#7dffb0');
      return;
    }
    const target = this.world.pick(sx, sy);
    const g = this.rig.screenToGround(sx, sy);
    const workers = units.filter((u) => isWorker(u.type));
    const others = units.filter((u) => !isWorker(u.type));
    const moveRest = (rest: Unit[]) => {
      if (rest.length && g) this.game.issue({ type: 'move', player, units: rest.map((u) => u.id), x: g.x, y: g.y, queued: shift });
    };
    if (target && target.kind !== 'resource' && isEnemy(this.game, player, target.owner) && targetable(target)) {
      const fighters = units.filter(canAttack);
      this.game.issue({ type: 'attack', player, units: fighters.map((u) => u.id), targetId: target.id, queued: shift });
      this.world.flashEntity(target.id, now);
      return;
    }
    if (target?.kind === 'resource' && workers.length) {
      this.game.issue({ type: 'gather', player, units: workers.map((u) => u.id), nodeId: target.id, queued: shift });
      this.world.flashEntity(target.id, now);
      moveRest(others);
      return;
    }
    if (target?.kind === 'building' && target.owner === player && workers.length) {
      if (target.progress < 1) {
        this.game.issue({ type: 'resumeBuild', player, units: workers.map((u) => u.id), buildingId: target.id });
        this.world.flashEntity(target.id, now);
        moveRest(others);
        return;
      }
      const carriers = workers.filter((u) => u.carry.res && acceptsResource(target, u.carry.res));
      if (carriers.length) this.game.issue({ type: 'returnCargo', player, units: carriers.map((u) => u.id), dropoffId: target.id });
      // The others repair it if it is damaged.
      const repairers = target.hp < target.maxHp ? workers.filter((u) => !carriers.includes(u)) : [];
      if (repairers.length) this.game.issue({ type: 'repair', player, units: repairers.map((u) => u.id), buildingId: target.id, queued: shift });
      if (carriers.length || repairers.length) {
        this.world.flashEntity(target.id, now);
        moveRest(units.filter((u) => !carriers.includes(u) && !repairers.includes(u)));
        return;
      }
    }
    if (!g) return;
    // A remembered enemy building in the fog: go and attack whatever is there.
    const ghost = this.game.vision
      .remembered(player)
      .find((m) => g.x >= m.tx && g.x < m.tx + m.w && g.y >= m.ty && g.y < m.ty + m.h);
    const fighters = units.filter(canAttack);
    if (ghost && fighters.length) {
      this.game.issue({ type: 'attackMove', player, units: fighters.map((u) => u.id), x: ghost.x, y: ghost.y, queued: shift });
      this.world.addMarker(ghost.x, ghost.y, now, '#ff5a4a');
      return;
    }
    this.game.issue({ type: 'move', player, units: units.map((u) => u.id), x: g.x, y: g.y, queued: shift });
    this.world.addMarker(g.x, g.y, now);
    this.explainReach(units, g.x, g.y);
  }

  /** Say so when a move cannot get all the way to where the player clicked. */
  private explainReach(units: readonly Unit[], x: number, y: number): void {
    const problem = reachProblem(this.game, units, x, y);
    if (problem) this.onMessage(problem);
  }

  private selectedOwnBuilding() {
    const b = this.client.selected.length === 1 ? this.game.building(this.client.selected[0]) : undefined;
    return b && b.owner === this.client.player ? b : undefined;
  }

  /** Rally on the ground, or on a resource so new workers start gathering it. */
  private setRally(buildingId: number, sx: number, sy: number): void {
    const target = this.world.pick(sx, sy);
    const g = this.rig.screenToGround(sx, sy);
    if (target?.kind === 'resource') {
      this.game.issue({ type: 'setRally', player: this.client.player, buildingId, x: target.x, y: target.y, targetId: target.id });
      this.world.flashEntity(target.id, this.now());
    } else if (g) {
      this.game.issue({ type: 'setRally', player: this.client.player, buildingId, x: g.x, y: g.y, targetId: -1 });
      this.world.addMarker(g.x, g.y, this.now());
    }
  }

  cancelQueued(buildingId: number, index: number): void {
    this.game.issue({ type: 'cancelTrain', player: this.client.player, buildingId, index });
  }

  private issueTargeted(mode: Exclude<TargetMode, null>, sx: number, sy: number, shift: boolean): void {
    const units = this.ownSelectedUnits();
    const player = this.client.player;
    const now = this.now();
    if (mode === 'flare') {
      const g = this.rig.screenToGround(sx, sy);
      if (g) this.targetAtMap(g.x, g.y);
      return;
    }
    if (mode.startsWith('cast:')) {
      const ability = mode.slice(5) as AbilityId;
      const def = CONFIG.hero.abilities[ability];
      const hero = units.find((u) => u.hero && u.type === def.hero);
      if (!hero) return;
      if (def.target === 'point') {
        const g = this.rig.screenToGround(sx, sy);
        if (!g) return;
        this.game.issue({ type: 'cast', player, units: [hero.id], ability, targetId: -1, x: g.x, y: g.y });
        this.world.addMarker(g.x, g.y, now, '#ffe9a8');
      } else {
        const target = this.world.pick(sx, sy);
        if (target?.kind !== 'unit') {
          this.onMessage(def.target === 'enemy' ? 'Target an enemy unit.' : 'Target one of your units.');
          return;
        }
        this.game.issue({ type: 'cast', player, units: [hero.id], ability, targetId: target.id });
        this.world.flashEntity(target.id, now);
      }
      if (!shift) this.client.targetMode = null;
      return;
    }
    if (mode === 'attack') {
      // Enemy under the cursor: attack it. Otherwise attack-move to the point.
      const target = this.world.pick(sx, sy);
      const fighters = units.filter(canAttack).map((u) => u.id);
      if (target && target.kind !== 'resource' && isEnemy(this.game, player, target.owner) && targetable(target)) {
        this.game.issue({ type: 'attack', player, units: fighters, targetId: target.id, queued: shift });
        this.world.flashEntity(target.id, now);
      } else {
        const g = this.rig.screenToGround(sx, sy);
        if (!g) return;
        this.game.issue({ type: 'attackMove', player, units: fighters, x: g.x, y: g.y, queued: shift });
        this.world.addMarker(g.x, g.y, now, '#ff5a4a');
        this.explainReach(units.filter(canAttack), g.x, g.y);
      }
    } else if (mode === 'repair') {
      const target = this.world.pick(sx, sy);
      const workers = units.filter((u) => isWorker(u.type));
      if (target?.kind !== 'building') {
        this.onMessage('Click a damaged building of yours to repair it.');
        return; // stay in targeting mode
      }
      this.game.issue({ type: 'repair', player, units: workers.map((u) => u.id), buildingId: target.id, queued: shift });
      this.world.flashEntity(target.id, now);
    } else if (mode === 'move') {
      const g = this.rig.screenToGround(sx, sy);
      if (!g) return;
      this.game.issue({ type: 'move', player, units: units.map((u) => u.id), x: g.x, y: g.y, queued: shift });
      this.world.addMarker(g.x, g.y, now);
      this.explainReach(units, g.x, g.y);
    } else {
      const target = this.world.pick(sx, sy);
      if (target?.kind !== 'resource') {
        this.onMessage('Select a gold mine or tree to gather from.');
        return; // stay in targeting mode
      }
      const workers = units.filter((u) => isWorker(u.type));
      this.game.issue({ type: 'gather', player, units: workers.map((u) => u.id), nodeId: target.id, queued: shift });
      this.world.flashEntity(target.id, now);
    }
    if (!shift) this.client.targetMode = null;
  }

  private placeBuilding(sx: number, sy: number, shift: boolean): void {
    const type = this.client.placing!;
    const g = this.rig.screenToGround(sx, sy);
    if (!g) return;
    const f = snapFootprint(type, g.x, g.y);
    const problem = checkPlacement(this.game, type, f.tx, f.ty).reason ?? shortfall(this.game, this.client.player, type);
    if (problem) {
      this.onMessage(problem);
      return; // stay in placement mode so the player can pick another spot
    }
    const workers = this.selectedWorkers();
    this.game.issue({ type: 'build', player: this.client.player, units: workers.map((u) => u.id), buildingType: type, tx: f.tx, ty: f.ty, queued: shift });
    this.world.addMarker(f.tx + f.w / 2, f.ty + f.h / 2, this.now());
    if (!shift) this.client.placing = null;
  }

  /** Command-card actions, shared by buttons and hotkeys. */
  action(name: Action): void {
    const player = this.client.player;
    if (name === 'cancel') {
      // Unfinished building: cancel construction. Otherwise drop the last queued unit.
      const b = this.selectedOwnBuilding();
      if (b && b.progress < 1) this.game.issue({ type: 'cancelBuild', player, buildingId: b.id });
      else if (b && b.queue.length) this.cancelQueued(b.id, b.queue.length - 1);
      return;
    }
    if (name.startsWith('research:')) {
      const b = this.selectedOwnBuilding();
      if (b) this.game.issue({ type: 'research', player, buildingId: b.id, research: name.slice(9) as ResearchId });
      return;
    }
    if (name.startsWith('cast:')) {
      const ability = name.slice(5) as AbilityId;
      const def = CONFIG.hero.abilities[ability];
      const hero = this.ownSelectedUnits().find((u) => u.hero && u.type === def.hero);
      if (!hero) return;
      if (def.target === 'none') this.game.issue({ type: 'cast', player, units: [hero.id], ability, targetId: -1 });
      else {
        this.client.placing = null;
        this.client.targetMode = name as `cast:${AbilityId}`;
      }
      return;
    }
    if (name.startsWith('item:') || name.startsWith('drop:')) {
      const hero = this.activeHero();
      if (!hero) return;
      const slot = Number(name.slice(5));
      this.game.issue({ type: name.startsWith('item:') ? 'useItem' : 'dropItem', player, units: [hero.id], slot });
      return;
    }
    if (name === 'flare') {
      const b = this.selectedOwnBuilding();
      if (!b || !isHall(b.type)) return;
      this.client.placing = null;
      this.client.targetMode = 'flare';
      return;
    }
    if (name.startsWith('buy:')) {
      const shop = this.selectedShop();
      const hero = shop && this.shopper(shop);
      if (!shop || !hero) {
        this.onMessage('You need a hero next to the Trading Post to buy.');
        return;
      }
      this.game.issue({ type: 'buyItem', player, shopId: shop.id, heroId: hero.id, item: name.slice(4) as ItemId });
      return;
    }
    if (name.startsWith('train:')) {
      const b = this.selectedOwnBuilding();
      if (b) this.game.issue({ type: 'train', player, buildingId: b.id, unit: name.slice(6) as UnitType });
      return;
    }
    const units = this.ownSelectedUnits();
    if (!units.length) return;
    if (name.startsWith('build:')) {
      const type = name.slice(6) as BuildingType;
      if (!this.selectedWorkers().length) return;
      const short = shortfall(this.game, player, type);
      if (short) this.onMessage(`${CONFIG.buildings[type].name}: ${short}`);
      this.client.targetMode = null;
      this.client.placing = type;
      return;
    }
    this.client.placing = null;
    if (name === 'stop') this.game.issue({ type: 'stop', player, units: units.map((u) => u.id) });
    else if (name === 'hold') this.game.issue({ type: 'hold', player, units: units.map((u) => u.id), queued: this.shiftDown });
    else if (name === 'attack') {
      if (units.some(canAttack)) this.client.targetMode = 'attack';
    }
    else if (name === 'return') {
      const carriers = units.filter((u) => u.carry.amount > 0);
      if (carriers.length) this.game.issue({ type: 'returnCargo', player, units: carriers.map((u) => u.id) });
    } else if (name === 'gather') {
      if (units.some((u) => isWorker(u.type))) this.client.targetMode = 'gather';
    } else if (name === 'repair') {
      if (units.some((u) => isWorker(u.type))) this.client.targetMode = 'repair';
    } else if (name === 'move') this.client.targetMode = 'move';
  }

  selectIdleWorker(): void {
    const idle = this.game.idleWorkers(this.client.player).filter((u) => !u.hidden);
    if (!idle.length) return;
    const cur = this.client.selected.length === 1 ? this.client.selected[0] : 0;
    const i = idle.findIndex((u) => u.id === cur);
    const next = idle[(i + 1) % idle.length];
    this.setSelection([next.id]);
    this.rig.centerOn(next.x, next.y);
  }

  /**
   * A click on the minimap (or ground) while targeting: fire the Signal
   * Flare there, or attack-move / move the selection. True if handled.
   */
  targetAtMap(x: number, y: number): boolean {
    const mode = this.client.targetMode;
    const player = this.client.player;
    if (mode === 'flare') {
      const b = this.selectedOwnBuilding();
      if (b) this.game.issue({ type: 'flare', player, buildingId: b.id, x, y });
      this.client.targetMode = null;
      return true;
    }
    const units = this.ownSelectedUnits();
    if ((mode === 'attack' || mode === 'move') && units.length) {
      if (mode === 'attack') this.game.issue({ type: 'attackMove', player, units: units.filter(canAttack).map((u) => u.id), x, y, queued: this.shiftDown });
      else this.game.issue({ type: 'move', player, units: units.map((u) => u.id), x, y, queued: this.shiftDown });
      this.world.addMarker(x, y, this.now(), mode === 'attack' ? '#ff5a4a' : undefined);
      if (!this.shiftDown) this.client.targetMode = null;
      return true;
    }
    return false;
  }

  /** Select a hero (F2): the next one each press when there are two. */
  selectHero(): void {
    const heroes = this.game.player(this.client.player).heroes.filter((r) => r.alive).map((r) => this.game.unit(r.unitId)).filter((u): u is Unit => !!u);
    if (!heroes.length) return;
    const cur = this.client.selected.length === 1 ? heroes.findIndex((h) => h.id === this.client.selected[0]) : -1;
    const h = heroes[(cur + 1) % heroes.length];
    this.setSelection([h.id]);
    this.rig.centerOn(h.x, h.y);
  }

  /** The hero whose abilities and items the command card shows. */
  activeHero(): Unit | undefined {
    return this.ownSelectedUnits().find((u) => u.hero);
  }

  /** The selected neutral Trading Post, if any. */
  selectedShop(): Building | undefined {
    const b = this.client.selected.length === 1 ? this.game.building(this.client.selected[0]) : undefined;
    return b?.type === 'shop' ? b : undefined;
  }

  /** Your hero nearest a shop: the one that shops there. */
  shopper(shop: Building): Unit | undefined {
    const heroes = this.game.units().filter((u) => u.owner === this.client.player && u.hero);
    return heroes.sort((a, b) => Math.hypot(a.x - shop.x, a.y - shop.y) - Math.hypot(b.x - shop.x, b.y - shop.y))[0];
  }

  centerOnSelection(): void {
    const es = this.client.selected.map((id) => this.game.get(id)).filter((e): e is Entity => !!e);
    if (!es.length) return;
    this.rig.centerOn(es.reduce((s, e) => s + e.x, 0) / es.length, es.reduce((s, e) => s + e.y, 0) / es.length);
  }

  // ---- keyboard ---------------------------------------------------------------

  private keyDown(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement || this.client.modalOpen) return;
    const key = eventKey(e);
    this.keys.add(key);
    const k = e.key.toLowerCase();
    const map = this.settings.keys;
    // A key bound to camera panning only pans (held, see update()).
    if (key === map.panLeft || key === map.panRight || key === map.panUp || key === map.panDown) {
      e.preventDefault();
      return;
    }
    // Control groups by physical key (Digit1 / Numpad1), so Shift+1 (which
    // types "!") and other keyboard layouts work. Ctrl, Cmd or Option/Alt
    // saves a group: browsers on a Mac keep Cmd+1-9 for switching tabs, so
    // Ctrl+1 or Option+1 is the one that always reaches the game there.
    const digit = /^(?:Digit|Numpad)([0-9])$/.exec(e.code)?.[1] ?? (/^[0-9]$/.test(e.key) ? e.key : null);
    if (digit !== null) {
      e.preventDefault();
      this.controlGroup(Number(digit), e.ctrlKey || e.metaKey || e.altKey, e.shiftKey);
      return;
    }
    const building = this.selectedOwnBuilding();
    if (building && building.progress >= 1) {
      for (const t of trainableAt(building.type)) {
        if (k === CONFIG.units[t].hotkey.toLowerCase()) {
          this.action(`train:${t}`);
          return;
        }
      }
      // Research: the first not-yet-done level on that key.
      const next = researchAt(building.type).find((r) => CONFIG.research[r].hotkey.toLowerCase() === k && !researched(this.game, this.client.player, r));
      if (next) {
        this.action(`research:${next}`);
        return;
      }
    }
    if (building && isHall(building.type) && building.progress >= 1 && k === 'f') {
      this.action('flare');
      return;
    }
    const shop = this.selectedShop();
    if (shop) {
      for (const it of CONFIG.shop.stock as readonly ItemId[]) {
        if (k === CONFIG.items[it].hotkey.toLowerCase()) {
          this.action(`buy:${it}`);
          return;
        }
      }
    }
    const hero = this.activeHero();
    if (hero) {
      for (const a of abilitiesOf(hero.type as HeroType)) {
        if (k === CONFIG.hero.abilities[a].hotkey.toLowerCase()) {
          this.action(`cast:${a}`);
          return;
        }
      }
      // Inventory slots: Z, X, C.
      const slot = ITEM_KEYS.indexOf(k);
      if (slot >= 0 && !this.selectedWorkers().length) {
        this.action(`item:${slot}`);
        return;
      }
    }
    const hasWorkers = this.selectedWorkers().length > 0;
    for (const type of buildableFor(this.game.player(this.client.player).faction)) {
      if (hasWorkers && key === map[`build:${buildingRole(type)!}`]) {
        this.action(`build:${type}`);
        return;
      }
    }
    if (k === 'escape') {
      if (this.client.placing) this.client.placing = null;
      else if (this.client.targetMode) this.client.targetMode = null;
      else this.setSelection([]);
      return;
    }
    if (k === 'pause' || k === 'f3') {
      e.preventDefault();
      if (k === 'pause') this.togglePause();
      else this.client.debug = !this.client.debug;
      return;
    }
    const action = (Object.keys(map) as KeyAction[]).find((a) => map[a] === key && !a.startsWith('build:'));
    if (!action) return;
    switch (action) {
      case 'move':
      case 'stop':
      case 'attack':
      case 'hold':
      case 'gather':
      case 'return':
      case 'repair':
      case 'cancel':
        this.action(action);
        break;
      case 'idleWorker':
        this.selectIdleWorker();
        break;
      case 'jumpAlert': {
        e.preventDefault();
        const a = this.minimap.lastAlert();
        if (a) this.rig.centerOn(a.x, a.y);
        else this.centerOnSelection();
        break;
      }
      case 'selectHero':
        e.preventDefault();
        this.selectHero();
        break;
      case 'debug':
        e.preventDefault();
        this.client.debug = !this.client.debug;
        break;
      case 'pause':
        this.togglePause();
        break;
    }
  }

  private togglePause(): void {
    if (this.client.online) this.onMessage('An online match cannot be paused: the other player plays on.');
    else this.client.paused = !this.client.paused;
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
    this.setSelection(ids);
    if (this.lastGroupKey.n === n && now - this.lastGroupKey.t < 0.35) this.centerOnSelection();
    this.lastGroupKey = { n, t: now };
  }
}

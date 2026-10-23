// DOM interface: resource bar, selection panel, command card, idle-worker
// button, notifications and the controls overlay. Reads state; issues actions
// through the InputController.

import type { ClientState } from '../input/client';
import type { Action, InputController } from '../input/input';
import { CONFIG, TICK_RATE, type BuildingType, type UnitType } from '../sim/config';
import { canAfford } from '../sim/construction';
import type { Game } from '../sim/game';
import { missingRequirement, trainableAt } from '../sim/production';
import type { Building, Entity, GameEvent, Unit } from '../sim/types';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function setText(e: HTMLElement, t: string): void {
  if (e.textContent !== t) e.textContent = t;
}

export function unitStatus(game: Game, u: Unit): string {
  const o = u.order;
  if (!o) {
    if (u.home) return 'Guarding its camp';
    return u.carry.amount > 0 ? `Idle, holding ${u.carry.amount} ${u.carry.res}` : 'Idle';
  }
  if (o.type === 'move') return 'Moving';
  if (o.type === 'hold') return o.targetId >= 0 ? 'Holding position, fighting' : 'Holding position';
  if (o.type === 'attackMove') return o.targetId >= 0 ? 'Attack-moving, fighting' : 'Attack-moving';
  if (o.type === 'attack') {
    const t = game.get(o.targetId);
    const name = t?.kind === 'unit' ? CONFIG.units[t.type].name : t?.kind === 'building' ? CONFIG.buildings[t.type].name : 'target';
    return `Attacking ${name}`;
  }
  if (o.type === 'build') {
    const name = CONFIG.buildings[o.buildingType].name;
    if (o.phase === 'building') return `Building ${name}`;
    if (o.phase === 'standby') return `Standing by at ${name}`;
    return `Heading to build ${name}`;
  }
  const node = game.resource(o.nodeId);
  switch (o.phase) {
    case 'toNode':
      return node?.type === 'goldmine' ? 'Heading to the gold mine' : 'Heading to a tree';
    case 'waiting':
      return node?.type === 'goldmine' ? 'Waiting: mine is full' : 'Waiting for a free tree';
    case 'working':
      return o.res === 'gold' ? 'Mining gold (inside)' : `Chopping wood (${u.carry.amount}/${CONFIG.units.worker.carryWood})`;
    case 'toDropoff':
      return `Returning ${u.carry.amount} ${u.carry.res ?? ''}`.trim();
  }
}

interface ActionDef {
  id: Action;
  label: string;
  key: string;
  tip: string;
  build?: BuildingType;
  train?: UnitType;
}

const BUILD_TIPS: Record<BuildingType, string> = {
  hq: 'Keep: accepts gold and wood, +10 population. Build one near a distant mine to expand.',
  farm: 'Farm: +6 population.',
  lumbermill: 'Lumber Mill: accepts wood. Build it beside a forest to shorten wood trips. Enables Archers.',
  barracks: 'Barracks: trains Guards and Archers.',
  tower: 'Watch Tower: shoots enemies within 7 tiles.',
};

const TRAIN_TIPS: Record<UnitType, string> = {
  worker: 'Laborer: gathers, builds.',
  guard: 'Guard: sturdy melee soldier.',
  archer: 'Archer: fragile ranged soldier.',
  brigand: '',
  poacher: '',
};

const ACTIONS: ActionDef[] = [
  { id: 'move', label: 'Move', key: 'M', tip: 'Move to a location. (Right-click ground also moves.)' },
  { id: 'stop', label: 'Stop', key: 'S', tip: 'Stop the current order.' },
  { id: 'attack', label: 'Attack', key: 'A', tip: 'Click an enemy to attack it, or the ground to attack-move: walk there, fighting anything met on the way. (Right-click an enemy also attacks.)' },
  { id: 'hold', label: 'Hold', key: 'H', tip: 'Hold position: never move, attack enemies in weapon range.' },
  { id: 'gather', label: 'Gather', key: 'G', tip: 'Harvest gold from a mine or wood from trees. (Right-click a resource.)' },
  { id: 'return', label: 'Return', key: 'R', tip: 'Deliver carried resources to the nearest drop-off, then resume.' },
  ...(Object.keys(CONFIG.buildings) as BuildingType[]).map((t) => {
    const d = CONFIG.buildings[t];
    return {
      id: `build:${t}` as Action,
      label: d.name,
      key: d.hotkey,
      build: t,
      tip: `${BUILD_TIPS[t]} Cost: ${d.cost.gold} gold, ${d.cost.wood} wood. Build time ${d.buildSeconds}s. Requires a Laborer.`,
    };
  }),
  ...(Object.keys(CONFIG.units) as UnitType[]).filter((t) => CONFIG.units[t].trainedAt).map((t) => {
    const d = CONFIG.units[t];
    const req = d.requires ? ` Requires a ${CONFIG.buildings[d.requires].name}.` : '';
    return {
      id: `train:${t}` as Action,
      label: d.name,
      key: d.hotkey,
      train: t,
      tip: `${TRAIN_TIPS[t]} Cost: ${d.cost.gold} gold, ${d.cost.wood} wood, ${d.pop} population. Train time ${d.trainSeconds}s.${req}`,
    };
  }),
];

export class Hud {
  private gold = document.getElementById('gold')!;
  private wood = document.getElementById('wood')!;
  private pop = document.getElementById('pop')!;
  private clock = document.getElementById('clock')!;
  private idleBtn = document.getElementById('idle-btn') as HTMLButtonElement;
  private idleCount = document.getElementById('idle-count')!;
  private panel = document.getElementById('selection')!;
  private card = document.getElementById('commands')!;
  private notices = document.getElementById('notices')!;
  private help = document.getElementById('help')!;
  private pausedBanner = document.getElementById('paused')!;
  private buttons = new Map<string, HTMLButtonElement>();
  private cancelBtn = el('button', 'cmd');
  private lastPanel = 0;
  private panelDirty = true;

  constructor(
    private game: Game,
    private client: ClientState,
    private input: InputController,
  ) {
    this.idleBtn.addEventListener('click', () => input.selectIdleWorker());
    this.cancelBtn.innerHTML = '<span class="cmd-label">Cancel</span><span class="cmd-key">X</span>';
    this.cancelBtn.title = `Cancel construction (${CONFIG.construction.cancelRefund * 100}% refund) or the last queued unit (${CONFIG.production.cancelRefund * 100}% refund). [X]`;
    this.cancelBtn.addEventListener('click', () => input.action('cancel'));
    this.card.appendChild(this.cancelBtn);
    for (const a of ACTIONS) {
      const b = el('button', 'cmd');
      const cost = a.build ? CONFIG.buildings[a.build].cost : a.train ? CONFIG.units[a.train].cost : null;
      b.innerHTML =
        `<span class="cmd-label">${a.label}</span><span class="cmd-key">${a.key}</span>` +
        (cost ? `<span class="cmd-cost"><i class="g">${cost.gold}</i> <i class="w">${cost.wood}</i></span>` : '');
      if (a.build || a.train) b.classList.add('build');
      b.title = `${a.tip} [${a.key}]`;
      b.addEventListener('click', () => input.action(a.id));
      this.buttons.set(a.id, b);
      this.card.appendChild(b);
    }
    input.onSelectionChanged = () => (this.panelDirty = true);
    input.onMessage = (t) => this.notify(t);
    document.getElementById('help-btn')!.addEventListener('click', () => this.toggleHelp());
    document.getElementById('help-close')!.addEventListener('click', () => this.toggleHelp(false));
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F1' || e.key === '?') {
        e.preventDefault();
        this.toggleHelp();
      }
    });
  }

  setGame(game: Game): void {
    this.game = game;
    this.panelDirty = true;
  }

  toggleHelp(show?: boolean): void {
    this.help.classList.toggle('hidden', show === undefined ? undefined : !show);
  }

  notify(text: string, cls = ''): void {
    const n = el('div', `notice ${cls}`, text);
    this.notices.appendChild(n);
    setTimeout(() => n.classList.add('fade'), 4000);
    setTimeout(() => n.remove(), 5000);
    while (this.notices.children.length > 4) this.notices.firstChild!.remove();
  }

  /** Called when an attack alert fires (e.g. to ping the minimap). */
  onAlert: (x: number, y: number) => void = () => {};
  private lastAlert = { t: -1e9, x: 0, y: 0 };

  handleEvents(events: GameEvent[]): void {
    // Once the viewer is defeated, the end screen tells the story; no more notices.
    if (this.game.player(this.client.player).defeated) return;
    for (const e of events) {
      if (e.type === 'hit' && e.owner === this.client.player && e.attackerOwner !== this.client.player) {
        // At most one alert per 10 s, unless the attack is somewhere else.
        const now = performance.now();
        const far = Math.hypot(e.x - this.lastAlert.x, e.y - this.lastAlert.y) > 15;
        if (now - this.lastAlert.t > 10000 || (far && now - this.lastAlert.t > 3000)) {
          this.lastAlert = { t: now, x: e.x, y: e.y };
          const victim = this.game.get(e.id);
          const civil = !victim || victim.kind === 'building' || victim.type === 'worker';
          this.notify(civil ? 'Your base is under attack! (Space: jump there)' : 'Your forces are under attack! (Space: jump there)', 'alert');
          this.onAlert(e.x, e.y);
        }
        continue;
      }
      if (e.type === 'mineDepleted' && e.player === this.client.player) {
        this.notify('A gold mine has collapsed. Its workers are now idle. (Space: jump to it)', 'alert');
      } else if (e.type === 'noDropoff' && e.player === this.client.player) {
        this.notify('No building to deliver resources to.', 'alert');
      } else if (e.type === 'cantBuild' && e.player === this.client.player) {
        this.notify(`Cannot build: ${e.reason}`, 'alert');
      } else if (e.type === 'buildingComplete' && e.player === this.client.player) {
        const b = this.game.building(e.id);
        if (b) this.notify(`${CONFIG.buildings[b.type].name} complete.`);
      } else if (e.type === 'constructionCancelled' && e.player === this.client.player) {
        this.notify('Construction cancelled; resources partly refunded.');
      } else if (e.type === 'popBlocked' && e.player === this.client.player) {
        this.notify('Not enough population: build more Farms.', 'alert');
      } else if (e.type === 'cantTrain' && e.player === this.client.player) {
        this.notify(`Cannot train: ${e.reason}`, 'alert');
      } else if (e.type === 'buildingDestroyed' && e.player === this.client.player) {
        const refund = e.refundGold || e.refundWood ? ` Queue refunded: ${e.refundGold} gold, ${e.refundWood} wood.` : '';
        this.notify(`${CONFIG.buildings[e.building].name} destroyed.${refund}`, 'alert');
      }
    }
  }

  update(nowMs: number): void {
    const p = this.game.player(this.client.player);
    setText(this.gold, String(p.gold));
    setText(this.wood, String(p.wood));
    const used = this.game.popUsed(p.id);
    const cap = this.game.popCap(p.id);
    setText(this.pop, `${used}/${cap}`);
    this.pop.classList.toggle('full', used >= cap);
    const secs = Math.floor(this.game.state.tick / TICK_RATE);
    setText(this.clock, `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`);
    this.pausedBanner.classList.toggle('hidden', !this.client.paused);
    const idle = this.game.idleWorkers(p.id).length;
    setText(this.idleCount, String(idle));
    this.idleBtn.classList.toggle('none', idle === 0);

    // Prune dead entities from the selection.
    const alive = this.client.selected.filter((id) => this.game.get(id));
    if (alive.length !== this.client.selected.length) {
      this.client.selected = alive;
      this.panelDirty = true;
    }
    if (this.panelDirty || nowMs - this.lastPanel > 200) {
      this.renderPanel();
      this.lastPanel = nowMs;
      this.panelDirty = false;
    }
    const own = this.client.selected.map((id) => this.game.unit(id)).filter((u): u is Unit => !!u && u.owner === p.id);
    const workers = own.some((u) => u.type === 'worker');
    const b = this.client.selected.length === 1 ? this.game.building(this.client.selected[0]) : undefined;
    const ownB = b && b.owner === p.id ? b : undefined;
    const showCancel = !!ownB && (ownB.progress < 1 || ownB.queue.length > 0);
    const trainable = ownB && ownB.progress >= 1 ? trainableAt(ownB.type) : [];
    this.card.classList.toggle('hidden', own.length === 0 && !showCancel && trainable.length === 0);
    this.cancelBtn.classList.toggle('hidden', !showCancel);
    for (const a of ACTIONS) {
      const btn = this.buttons.get(a.id)!;
      if (a.train) {
        btn.classList.toggle('hidden', !trainable.includes(a.train));
        const c = CONFIG.units[a.train].cost;
        btn.classList.toggle('poor', p.gold < c.gold || p.wood < c.wood);
        btn.disabled = !!missingRequirement(this.game, p.id, a.train);
        continue;
      }
      const workerOnly = !!a.build || a.id === 'gather' || a.id === 'return';
      btn.classList.toggle('hidden', own.length === 0 || (workerOnly && !workers));
      if (a.build) btn.classList.toggle('poor', !canAfford(this.game, p.id, a.build));
      btn.classList.toggle('active', this.client.targetMode === a.id || (!!a.build && this.client.placing === a.build));
    }
    this.buttons.get('gather')!.disabled = !workers;
    this.buttons.get('return')!.disabled = !own.some((u) => u.carry.amount > 0);
  }

  private renderPanel(): void {
    const sel = this.client.selected.map((id) => this.game.get(id)).filter((e): e is Entity => !!e);
    // Build off-screen and swap only if something visible changed.
    const panel = el('div');
    this.fillPanel(panel, sel);
    if (panel.innerHTML !== this.panel.innerHTML) this.panel.replaceChildren(...panel.childNodes);
  }

  private fillPanel(panel: HTMLElement, sel: Entity[]): void {
    if (!sel.length) {
      panel.appendChild(el('div', 'hint', 'Left-click or drag to select workers. Right-click a gold mine or tree to gather. Select a Laborer to build.'));
      return;
    }
    if (sel.length === 1) {
      panel.appendChild(this.detail(sel[0]));
      return;
    }
    panel.appendChild(el('div', 'sel-title', `${sel.length} units selected`));
    const grid = el('div', 'portraits');
    for (const e of sel) {
      if (e.kind !== 'unit') continue;
      const pt = el('button', 'portrait');
      pt.title = `${CONFIG.units[e.type].name}: ${unitStatus(this.game, e)}`;
      pt.style.setProperty('--team', this.game.player(e.owner).color);
      const hp = el('div', 'hp');
      hp.style.width = `${(e.hp / e.maxHp) * 100}%`;
      const icon = e.type !== 'worker' ? CONFIG.units[e.type].name[0] : e.carry.amount ? (e.carry.res === 'gold' ? '●' : '≡') : '';
      pt.appendChild(el('span', 'portrait-icon', icon));
      pt.appendChild(hp);
      pt.addEventListener('mousedown', (ev) => {
        if (ev.shiftKey) this.input.setSelection(this.client.selected.filter((id) => id !== e.id));
        else this.input.setSelection([e.id]);
      });
      grid.appendChild(pt);
    }
    panel.appendChild(grid);
  }

  private detail(e: Entity): HTMLElement {
    const box = el('div', 'detail');
    const row = (k: string, v: string) => {
      const r = el('div', 'row');
      r.appendChild(el('span', 'k', k));
      r.appendChild(el('span', 'v', v));
      box.appendChild(r);
    };
    if (e.kind === 'unit') {
      box.appendChild(el('div', 'sel-title', CONFIG.units[e.type].name));
      row('Health', `${e.hp} / ${e.maxHp}`);
      row('Status', unitStatus(this.game, e));
      if (e.type === 'worker') row('Carrying', e.carry.amount ? `${e.carry.amount} ${e.carry.res}` : 'nothing');
      const def = CONFIG.units[e.type];
      const at = def.attack;
      row('Attack', `${at.damage} ${at.projectileSpeed ? 'ranged' : 'melee'}, every ${at.cooldown}s${at.projectileSpeed ? `, range ${at.range}` : ''}`);
      row('Armor', String(def.armor));
      if (e.owner !== this.client.player) row('Owner', this.game.player(e.owner).name);
    } else if (e.kind === 'building') {
      const def = CONFIG.buildings[e.type];
      box.appendChild(el('div', 'sel-title', def.name));
      row('Health', `${Math.round(e.hp)} / ${e.maxHp}`);
      if (e.progress < 1) {
        const builder = this.game.units().some((u) => u.order?.type === 'build' && u.order.siteId === e.id && u.order.phase === 'building');
        row('Construction', `${Math.floor(e.progress * 100)}%${builder ? '' : ' (paused: right-click with a Laborer to resume)'}`);
      }
      const acc = def.accepts as readonly string[];
      if (acc.length) row('Accepts', `${acc.join(' and ')} deliveries`);
      if (def.attack) row('Attack', `${def.attack.damage}, every ${def.attack.cooldown}s, range ${def.attack.range}`);
      if (def.popProvided) row('Population', `+${def.popProvided}`);
      if (e.owner !== this.client.player) row('Owner', this.game.player(e.owner).name);
      else if (e.progress >= 1 && trainableAt(e.type).length) this.production(box, e, row);
    } else if (e.type === 'goldmine') {
      box.appendChild(el('div', 'sel-title', CONFIG.resources.goldmine.name));
      row('Gold left', `${e.amount} / ${e.maxAmount}`);
      let inside = 0;
      let waiting = 0;
      for (const u of this.game.units()) {
        const o = u.order;
        if (o?.type !== 'gather' || o.nodeId !== e.id) continue;
        if (o.phase === 'working') inside++;
        if (o.phase === 'waiting') waiting++;
      }
      row('Miners inside', `${inside} / ${CONFIG.resources.goldmine.maxMiners}${waiting ? ` (+${waiting} waiting)` : ''}`);
    } else {
      box.appendChild(el('div', 'sel-title', CONFIG.resources.tree.name));
      row('Wood left', `${e.amount} / ${e.maxAmount}`);
    }
    return box;
  }

  /** Training status and queue slots; clicking a slot cancels it. */
  private production(box: HTMLElement, b: Building, row: (k: string, v: string) => void): void {
    const head = b.queue[0];
    let status = 'Idle';
    if (head) {
      const name = CONFIG.units[head.unit].name;
      status = head.started ? `Training ${name} ${Math.floor(head.progress * 100)}%` : `${name} waiting for population (build Farms)`;
    }
    row('Production', status);
    row('Rally point', b.rally ? 'set (right-click to move it)' : 'none (right-click to set)');
    const slots = el('div', 'queue');
    for (let i = 0; i < CONFIG.production.queueSize; i++) {
      const q = b.queue[i];
      const slot = el('button', `slot${q ? '' : ' empty'}`);
      if (q) {
        slot.textContent = CONFIG.units[q.unit].name[0];
        slot.title = `${CONFIG.units[q.unit].name}: click to cancel (full refund)`;
        const fill = el('div', 'fill');
        fill.style.width = `${q.progress * 100}%`;
        slot.appendChild(fill);
        // mousedown, not click: the panel may be rebuilt between press and release.
        slot.addEventListener('mousedown', () => this.input.cancelQueued(b.id, i));
      }
      slots.appendChild(slot);
    }
    // Queue sits in the header, right of the building name, to save height.
    const title = box.querySelector('.sel-title');
    const header = el('div', 'sel-head');
    if (title) {
      title.replaceWith(header);
      header.appendChild(title);
    } else box.prepend(header);
    header.appendChild(slots);
  }
}

// DOM interface: resource bar, selection panel, command card, idle-worker
// button, notifications and the controls overlay. Reads state; issues actions
// through the InputController.

import type { ClientState } from '../input/client';
import { ITEM_KEYS, type Action, type InputController } from '../input/input';
import { BUILDABLE, CONFIG, isHeroType, TICK_RATE, type AbilityId, type BuildingType, type ItemId, type ResearchId, type UnitType } from '../sim/config';
import { canAfford } from '../sim/construction';
import type { Game } from '../sim/game';
import { abilitiesOf, rank } from '../sim/hero';
import { buyProblem } from '../sim/items';
import { flareProblem } from '../sim/commands';
import { heroProblem, missingRequirement, trainableAt, trainCost } from '../sim/production';
import { armorValue, attackDamage, attackRange, healAmount, researchAt, researched, researchPending, researchProblem } from '../sim/tech';
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
  if (o.type === 'pickup') {
    const it = game.state.items.find((i) => i.id === o.itemId);
    return it ? `Picking up ${CONFIG.items[it.type].name}` : 'Picking up an item';
  }
  if (o.type === 'cast') return `Casting ${CONFIG.hero.abilities[o.ability].name}`;
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
      return o.res === 'gold' ? 'Mining gold (inside)' : `Chopping wood (${u.carry.amount})`;
    case 'toDropoff':
      return `Returning ${u.carry.amount} ${u.carry.res ?? ''}`.trim();
  }
}

const BUFF_NAMES = { cry: 'Battle Cry', mark: "Hunter's Mark", slow: 'Slowed', ward: 'Arcane Ward' } as const;

interface ActionDef {
  id: Action;
  label: string;
  key: string;
  tip: string;
  build?: BuildingType;
  train?: UnitType;
  research?: ResearchId;
  ability?: AbilityId;
  slot?: number;
  buy?: ItemId;
  flare?: boolean;
}

const BUILD_TIPS: Record<BuildingType, string> = {
  hq: 'Keep: accepts gold and wood, +10 population. Build one near a distant mine to expand.',
  farm: 'Farm: +6 population.',
  lumbermill: 'Lumber Mill: accepts wood. Build it beside a forest to shorten wood trips. Enables Archers.',
  barracks: 'Barracks: trains Guards and Archers, and Lancers from tier II.',
  tower: 'Watch Tower: shoots enemies within 7 tiles.',
  altar: 'Hall of Valor: trains and revives your hero.',
  smithy: 'Blacksmith: researches weapon and armor upgrades. Needed for Lancers.',
  chapel: 'Chapel (tier II): trains Clerics; researches Greater Healing.',
  workshop: 'Siege Works (tier II): builds Mangonels.',
  shop: 'Trading Post (neutral): a hero standing next to it can buy items.',
  fountain: 'Healing Fountain (neutral): heals every unit nearby, friend or foe.',
};

const TRAIN_TIPS: Record<UnitType, string> = {
  worker: 'Laborer: gathers, builds.',
  guard: 'Guard: sturdy melee soldier in heavy armor. Strong against Lancers and siege; slow to bring down buildings.',
  archer: 'Archer: fragile ranged soldier with pierce damage. Shreds lightly armored units (Archers, Clerics); weak against Lancers and buildings.',
  lancer: 'Lancer: fast cavalry in medium armor that shrugs off arrows. Runs down Archers, Clerics and Mangonels; loses to Guards.',
  cleric: 'Cleric: support. Automatically heals the most wounded nearby ally while it has mana. Its weak magic bolt burns heavy armor (Guards). Fragile.',
  outrider: 'Outrider: a fast, cheap scout that sees far. It does not pick fights; use it to find the enemy and watch expansions.',
  mangonel: 'Mangonel: siege. Lobs boulders 8 tiles that crush buildings and splash clumps where they land; moving units can dodge. Cannot hit anything within 2 tiles; easy prey for Lancers.',
  brigand: '',
  poacher: '',
  chief: '',
  hero: 'Marshal (hero): frontline. Stormhammer stuns, Battle Cry rallies, Mend heals.',
  ranger: 'Pathfinder (hero): ranged. Volley hits an area, Hunter\'s Mark makes a target take more damage, Far Sight reveals any spot.',
  sage: 'Sage (hero): caster. Flame Burst burns groups and buildings, Slow cripples a threat, Arcane Ward armors an ally.',
  wolf: '',
  brute: '',
};

const ACTIONS: ActionDef[] = [
  { id: 'move', label: 'Move', key: 'M', tip: 'Move to a location. (Right-click ground also moves.)' },
  { id: 'stop', label: 'Stop', key: 'S', tip: 'Stop the current order.' },
  { id: 'attack', label: 'Attack', key: 'A', tip: 'Click an enemy to attack it, or the ground to attack-move: walk there, fighting anything met on the way. (Right-click an enemy also attacks.)' },
  { id: 'hold', label: 'Hold', key: 'H', tip: 'Hold position: never move, attack enemies in weapon range.' },
  { id: 'gather', label: 'Gather', key: 'G', tip: 'Harvest gold from a mine or wood from trees. (Right-click a resource.)' },
  { id: 'return', label: 'Return', key: 'R', tip: 'Deliver carried resources to the nearest drop-off, then resume.' },
  ...BUILDABLE.map((t) => {
    const d = CONFIG.buildings[t];
    return {
      id: `build:${t}` as Action,
      label: d.name,
      key: d.hotkey,
      build: t,
      tip: `${BUILD_TIPS[t]} Cost: ${d.cost.gold} gold, ${d.cost.wood} wood. Build time ${d.buildSeconds}s. Requires a Laborer${d.requires ? ` and ${CONFIG.research[d.requires as ResearchId].name}` : ''}.`,
    };
  }),
  ...(Object.keys(CONFIG.units) as UnitType[]).filter((t) => CONFIG.units[t].trainedAt).map((t) => {
    const d = CONFIG.units[t];
    const reqs = [d.tech ? CONFIG.research[d.tech as ResearchId].name : '', d.requires ? `a ${CONFIG.buildings[d.requires as BuildingType].name}` : ''].filter(Boolean);
    const req = reqs.length ? ` Requires ${reqs.join(' and ')}.` : '';
    return {
      id: `train:${t}` as Action,
      label: d.name,
      key: d.hotkey,
      train: t,
      tip: `${TRAIN_TIPS[t]} Cost: ${d.cost.gold} gold, ${d.cost.wood} wood, ${d.pop} population. Train time ${d.trainSeconds}s.${req}`,
    };
  }),
  ...(Object.keys(CONFIG.research) as ResearchId[]).map((r) => {
    const d = CONFIG.research[r];
    const req = (d.requires as ResearchId[]).map((x) => CONFIG.research[x].name);
    return {
      id: `research:${r}` as Action,
      label: d.name,
      key: d.hotkey,
      research: r,
      tip: `${d.desc} Cost: ${d.cost.gold} gold, ${d.cost.wood} wood. Research time ${d.seconds}s.${req.length ? ` Requires ${req.join(' and ')}.` : ''}`,
    };
  }),
  ...(Object.keys(CONFIG.hero.abilities) as AbilityId[]).map((a) => {
    const d = CONFIG.hero.abilities[a];
    const aim = d.target === 'point' ? 'Click a spot' : d.target === 'enemy' ? 'Click an enemy unit' : d.target === 'ally' ? 'Click one of your units' : 'No target';
    const reach = d.target === 'none' ? `radius ${d.radius}` : d.range >= 999 ? 'any range' : `range ${d.range}${d.radius ? `, radius ${d.radius}` : ''}`;
    return {
      id: `cast:${a}` as Action,
      label: d.name,
      key: d.hotkey,
      ability: a,
      tip: `${d.desc} ${aim}; ${reach}. ${d.mana} mana, ${d.cooldown}s cooldown. Learned at hero level ${d.learnLevel}; stronger at levels 3 and 5.`,
    };
  }),
  {
    id: 'flare' as Action,
    label: 'Signal Flare',
    key: 'F',
    flare: true,
    tip: `Light up any spot on the map (click the ground or the minimap) for ${CONFIG.flare.seconds}s. ${CONFIG.flare.gold} gold, once every ${CONFIG.flare.cooldown}s.`,
  },
  ...[0, 1, 2].map((i) => ({
    id: `item:${i}` as Action,
    label: '—',
    key: ITEM_KEYS[i].toUpperCase(),
    slot: i,
    tip: 'Inventory slot.',
  })),
  ...(CONFIG.shop.stock as readonly ItemId[]).map((it) => {
    const d = CONFIG.items[it];
    return {
      id: `buy:${it}` as Action,
      label: d.name,
      key: d.hotkey,
      buy: it,
      tip: `${d.desc} ${d.price} gold. Your hero must stand within ${CONFIG.shop.range} tiles of the Trading Post.`,
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
    this.heroBtn?.addEventListener('click', () => input.selectHero());
    this.cancelBtn.innerHTML = '<span class="cmd-label">Cancel</span><span class="cmd-key">X</span>';
    this.cancelBtn.title = `Cancel construction (${CONFIG.construction.cancelRefund * 100}% refund) or the last queued unit (${CONFIG.production.cancelRefund * 100}% refund). [X]`;
    this.cancelBtn.addEventListener('click', () => input.action('cancel'));
    this.card.appendChild(this.cancelBtn);
    for (const a of ACTIONS) {
      const b = el('button', 'cmd');
      const cost = a.build
        ? CONFIG.buildings[a.build].cost
        : a.train
          ? CONFIG.units[a.train].cost
          : a.research
            ? CONFIG.research[a.research].cost
            : a.buy
              ? { gold: CONFIG.items[a.buy].price, wood: 0 }
              : a.flare
                ? { gold: CONFIG.flare.gold, wood: 0 }
                : null;
      b.innerHTML =
        `<span class="cmd-label">${a.label}</span><span class="cmd-key">${a.key}</span>` +
        (cost ? `<span class="cmd-cost"><i class="g">${cost.gold}</i> <i class="w">${cost.wood}</i></span>` : '');
      if (a.build || a.train || a.research) b.classList.add('build');
      if (a.ability) {
        b.classList.add('ability');
        b.innerHTML += `<span class="cmd-cost mana">${CONFIG.hero.abilities[a.ability].mana}</span><span class="cmd-cd"></span>`;
      }
      b.title = `${a.tip} [${a.key}]`;
      b.addEventListener('click', () => input.action(a.id));
      if (a.slot !== undefined) {
        b.classList.add('item-slot');
        // Right-click an inventory slot to drop the item (for another hero).
        b.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          input.action(`drop:${a.slot}` as Action);
        });
      }
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
  /** Called when scouting spots something worth knowing (a softer ping). */
  onSighting: (x: number, y: number) => void = () => {};
  private sightedBuildings = new Set<number>();
  private armyInView = false;
  private lastArmySighting = -1e9;
  private lastSightingCheck = 0;

  /**
   * Scouting cues: the first sighting of each enemy building (a new Keep is
   * called out as an expansion) and of an enemy army (3+ soldiers), with a
   * minimap ping. Only what the viewer's own units and flares reveal.
   */
  private checkSightings(nowMs: number): void {
    if (nowMs - this.lastSightingCheck < 500) return;
    this.lastSightingCheck = nowMs;
    const me = this.client.player;
    const vision = this.game.vision;
    const firstLook = this.sightedBuildings.size === 0 && this.game.state.tick < 20;
    for (const m of vision.remembered(me)) {
      if (this.sightedBuildings.has(m.id)) continue;
      this.sightedBuildings.add(m.id);
      if (firstLook) continue;
      const name = CONFIG.buildings[m.type].name;
      this.notify(m.type === 'hq' ? `Enemy ${name} spotted: a base or an expansion. (Space: jump there)` : `Enemy ${name} spotted.`, m.type === 'hq' ? 'alert' : '');
      this.onSighting(m.x, m.y);
    }
    const soldiers = this.game
      .units()
      .filter((u) => u.owner !== me && !this.game.player(u.owner).neutral && u.type !== 'worker' && vision.canSee(me, u));
    const inView = soldiers.length >= 3;
    if (inView && !this.armyInView && nowMs - this.lastArmySighting > 25000) {
      this.lastArmySighting = nowMs;
      const x = soldiers.reduce((s, u) => s + u.x, 0) / soldiers.length;
      const y = soldiers.reduce((s, u) => s + u.y, 0) / soldiers.length;
      this.notify(`Enemy army sighted: ${soldiers.length} soldiers. (Space: jump there)`, 'alert');
      this.onSighting(x, y);
    }
    this.armyInView = inView;
  }
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
          const atBase = this.game
            .buildings()
            .some((b) => b.owner === this.client.player && Math.hypot(b.x - e.x, b.y - e.y) < 15);
          const what =
            atBase && (!victim || victim.kind === 'building' || victim.type === 'worker')
              ? 'Your base is'
              : victim?.kind === 'unit' && victim.type === 'worker'
                ? 'A Laborer is'
                : 'Your forces are';
          this.notify(`${what} under attack! (Space: jump there)`, 'alert');
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
      } else if (e.type === 'cantItem' && e.player === this.client.player) {
        this.notify(e.reason, 'alert');
      } else if (e.type === 'itemPicked' && e.player === this.client.player) {
        this.notify(`Your hero picked up ${CONFIG.items[e.item].name}.`, 'good');
      } else if (e.type === 'itemBought' && e.player === this.client.player) {
        this.notify(`Bought ${CONFIG.items[e.item].name}.`, 'good');
      } else if (e.type === 'cantCast' && e.player === this.client.player) {
        this.notify(e.reason, 'alert');
      } else if (e.type === 'researchComplete' && e.player === this.client.player) {
        this.notify(`Research complete: ${CONFIG.research[e.research].name}.`);
      } else if (e.type === 'levelUp' && e.player === this.client.player) {
        const u = this.game.unit(e.id);
        const learned = (u && isHeroType(u.type) ? abilitiesOf(u.type) : []).find((a) => CONFIG.hero.abilities[a].learnLevel === e.level);
        this.notify(`Your hero reached level ${e.level}!${learned ? ` Learned ${CONFIG.hero.abilities[learned].name}.` : ''}`);
      } else if (e.type === 'heroFallen' && e.player === this.client.player) {
        this.notify(`A hero has fallen. Revive it at the ${CONFIG.buildings.altar.name}: it keeps its level and items.`, 'alert');
      } else if (e.type === 'buildingDestroyed' && e.player === this.client.player) {
        const refund = e.refundGold || e.refundWood ? ` Queue refunded: ${e.refundGold} gold, ${e.refundWood} wood.` : '';
        this.notify(`${CONFIG.buildings[e.building].name} destroyed.${refund}`, 'alert');
      }
    }
  }

  update(nowMs: number): void {
    const p = this.game.player(this.client.player);
    if (!p.defeated) this.checkSightings(nowMs);
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

    // Prune dead entities, and enemies that slipped into the fog, from the selection.
    const alive = this.client.selected.filter((id) => {
      const e = this.game.get(id);
      if (!e) return false;
      if (this.client.revealAll || e.owner === this.client.player || e.kind === 'resource') return true;
      if (e.kind === 'building' && this.game.player(e.owner).neutral) return true;
      return this.game.vision.canSee(this.client.player, e);
    });
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
    const researchable = ownB && ownB.progress >= 1 ? researchAt(ownB.type) : [];
    const hero = own.find((u) => u.hero);
    const shop = this.input.selectedShop();
    this.card.classList.toggle('hidden', own.length === 0 && !showCancel && trainable.length === 0 && researchable.length === 0 && !shop);
    this.cancelBtn.classList.toggle('hidden', !showCancel);
    for (const a of ACTIONS) {
      const btn = this.buttons.get(a.id)!;
      if (a.train) {
        btn.classList.toggle('hidden', !trainable.includes(a.train));
        const c = trainCost(this.game, p.id, a.train);
        if (isHeroType(a.train)) {
          // A hero's button turns into "Revive" while that hero is dead.
          const rec = p.heroes.find((h) => h.type === a.train);
          const label = rec && !rec.alive ? `Revive ${CONFIG.units[a.train].name} (Lv ${rec.level})` : CONFIG.units[a.train].name;
          setText(btn.querySelector('.cmd-label')!, label);
          setText(btn.querySelector('.cmd-cost .g')!, String(c.gold));
          setText(btn.querySelector('.cmd-cost .w')!, String(c.wood));
          const problem = heroProblem(this.game, p.id, a.train);
          btn.disabled = !!problem;
          btn.title = `${TRAIN_TIPS[a.train]}${problem ? ` (${problem})` : ''} [${a.key}]`;
        } else btn.disabled = !!missingRequirement(this.game, p.id, a.train);
        btn.classList.toggle('poor', p.gold < c.gold || p.wood < c.wood);
        continue;
      }
      if (a.research) {
        const r = a.research;
        // Show one button per hotkey: the next level that is not yet done.
        const sameKey = researchable.filter((x) => CONFIG.research[x].hotkey === CONFIG.research[r].hotkey && !researched(this.game, p.id, x));
        const show = researchable.includes(r) && sameKey[0] === r;
        btn.classList.toggle('hidden', !show);
        if (show && ownB) {
          const problem = researchProblem(this.game, p.id, ownB, r);
          btn.disabled = !!problem && !problem.startsWith('Not enough');
          btn.classList.toggle('poor', !!problem && problem.startsWith('Not enough'));
          btn.title = `${CONFIG.research[r].desc}${problem ? ` (${researchPending(this.game, p.id, r) ? 'In progress' : problem})` : ''} [${a.key}]`;
        }
        continue;
      }
      if (a.flare) {
        const keep = ownB?.type === 'hq' && ownB.progress >= 1 ? ownB : undefined;
        btn.classList.toggle('hidden', !keep);
        if (keep) {
          const problem = flareProblem(this.game, p.id, keep.id);
          btn.disabled = !!problem && !problem.startsWith('Not enough');
          btn.classList.toggle('poor', !!problem && problem.startsWith('Not enough'));
          btn.classList.toggle('active', this.client.targetMode === 'flare');
          btn.title = `${a.tip}${problem ? ` (${problem})` : ''} [F]`;
        }
        continue;
      }
      if (a.slot !== undefined) {
        btn.classList.toggle('hidden', !hero);
        const it = hero?.hero!.items[a.slot] ?? null;
        setText(btn.querySelector('.cmd-label')!, it ? CONFIG.items[it].name : '(empty)');
        btn.disabled = !it || !CONFIG.items[it].consumable;
        btn.classList.toggle('has-item', !!it);
        btn.title = it ? `${CONFIG.items[it].name}: ${CONFIG.items[it].desc}${CONFIG.items[it].consumable ? ' Click or press the key to use.' : ' Always active.'} Right-click to drop. [${a.key}]` : 'Empty inventory slot. Heroes pick up items by right-clicking them.';
        continue;
      }
      if (a.buy) {
        btn.classList.toggle('hidden', !shop);
        if (shop) {
          const shopper = this.input.shopper(shop);
          const problem = shopper ? buyProblem(this.game, p.id, shop.id, shopper.id, a.buy) : 'You need a hero next to the Trading Post.';
          btn.disabled = !!problem && !problem.startsWith('Not enough');
          btn.classList.toggle('poor', !!problem && problem.startsWith('Not enough'));
          btn.title = `${a.tip}${problem ? ` (${problem})` : ''} [${a.key}]`;
        }
        continue;
      }
      if (a.ability) {
        btn.classList.toggle('hidden', !hero || CONFIG.hero.abilities[a.ability].hero !== hero.type);
        if (hero && CONFIG.hero.abilities[a.ability].hero === hero.type) {
          const def = CONFIG.hero.abilities[a.ability];
          const learned = hero.hero!.level >= def.learnLevel;
          const cd = Math.max(0, ((hero.hero!.ready[a.ability] ?? 0) - this.game.state.tick) / TICK_RATE);
          setText(btn.querySelector('.cmd-cd')!, !learned ? `Lv ${def.learnLevel}` : cd > 0 ? `${Math.ceil(cd)}s` : '');
          btn.disabled = !learned || cd > 0 || hero.hero!.mana < def.mana;
          btn.classList.toggle('active', this.client.targetMode === a.id);
        }
        continue;
      }
      const workerOnly = !!a.build || a.id === 'gather' || a.id === 'return';
      btn.classList.toggle('hidden', own.length === 0 || (workerOnly && !workers));
      if (a.build) {
        btn.classList.toggle('poor', !canAfford(this.game, p.id, a.build));
        const req = CONFIG.buildings[a.build].requires as ResearchId | null;
        btn.disabled = !!req && !researched(this.game, p.id, req);
      }
      btn.classList.toggle('active', this.client.targetMode === a.id || (!!a.build && this.client.placing === a.build));
    }
    this.buttons.get('gather')!.disabled = !workers;
    this.buttons.get('return')!.disabled = !own.some((u) => u.carry.amount > 0);
    this.updateHeroButton();
  }

  private heroBtn = document.getElementById('hero-btn') as HTMLButtonElement | null;

  private updateHeroButton(): void {
    const b = this.heroBtn;
    if (!b) return;
    const recs = this.game.player(this.client.player).heroes;
    b.classList.toggle('hidden', !recs.length);
    if (!recs.length) return;
    const parts = recs.map((r) => `${CONFIG.units[r.type].name} ${r.alive ? `Lv ${r.level}` : '(fallen)'}`);
    setText(b, `${parts.join(' · ')} (F2)`);
    b.classList.toggle('fallen', recs.some((r) => !r.alive));
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
      const dmg = attackDamage(this.game, e);
      const arm = armorValue(this.game, e);
      const plus = (v: number, b: number) => (v !== b ? `${v} (${v > b ? '+' : ''}${Math.round((v - b) * 10) / 10})` : String(v));
      const range = attackRange(this.game, e);
      row('Attack', `${plus(dmg, at.damage)} ${at.type}, ${at.projectileSpeed ? `range ${range}` : 'melee'}, every ${at.cooldown}s${at.splash ? ', splash' : ''}`);
      row('Armor', `${plus(arm, def.armor)} ${def.armorType}`);
      if (e.type === 'cleric') row('Mana', `${Math.floor(e.mana)} / ${CONFIG.cleric.mana} (heals ${healAmount(this.game, e.owner)} each prayer)`);
      if (e.hero) {
        const h = e.hero;
        const next = CONFIG.hero.xpForLevel[h.level];
        row('Level', `${h.level}${next !== undefined ? ` (${h.xp} / ${next} xp)` : ' (max)'}`);
        row('Mana', `${Math.floor(h.mana)} / ${h.maxMana}`);
        if (isHeroType(e.type)) row('Role', CONFIG.heroTypes[e.type].role);
        const known = (isHeroType(e.type) ? abilitiesOf(e.type) : [])
          .filter((a) => h.level >= CONFIG.hero.abilities[a].learnLevel)
          .map((a) => `${CONFIG.hero.abilities[a].name} ${'I'.repeat(rank(h.level) + 1)}`);
        row('Abilities', known.join(', ') || 'none yet');
        const items = h.items.filter((x): x is ItemId => !!x).map((x) => CONFIG.items[x].name);
        row('Items', items.length ? items.join(', ') : 'none (right-click items on the ground)');
      }
      if (e.stun > 0) row('Stunned', `${Math.ceil(e.stun / TICK_RATE)}s`);
      if (e.buffs.length) row('Effects', e.buffs.map((b) => `${BUFF_NAMES[b.kind]} ${Math.ceil((b.until - this.game.state.tick) / TICK_RATE)}s`).join(', '));
      const camp = this.game.state.camps[e.camp];
      if (camp) row('Camp', `level ${camp.level} of 3 · the last guard drops ${CONFIG.items[camp.drop].name}`);
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
      if (def.attack) row('Attack', `${def.attack.damage} ${def.attack.type}, every ${def.attack.cooldown}s, range ${def.attack.range}`);
      row('Armor', `${def.armorType}`);
      if (def.popProvided) row('Population', `+${def.popProvided}`);
      if (e.type === 'shop') row('Sells', `${(CONFIG.shop.stock as readonly ItemId[]).map((i) => CONFIG.items[i].name).join(', ')} · to a hero within ${CONFIG.shop.range} tiles`);
      if (e.type === 'fountain') row('Heals', `${CONFIG.fountain.hpPerSecond} health and ${CONFIG.fountain.manaPerSecond} mana per second to every unit within ${CONFIG.fountain.radius} tiles`);
      if (!def.buildable) row('Owner', 'neutral · cannot be attacked');
      else if (e.owner !== this.client.player) row('Owner', this.game.player(e.owner).name);
      else if (e.progress >= 1 && (trainableAt(e.type).length || researchAt(e.type).length)) this.production(box, e, row);
      if (e.tier > 1) row('Fortified', e.tier > 2 ? 'Citadel (tier III unlocked)' : 'Castle (tier II unlocked)');
      const done = researchAt(e.type).filter((r) => researched(this.game, e.owner, r));
      if (done.length && e.owner === this.client.player) row('Researched', done.map((r) => CONFIG.research[r].name).join(', '));
    } else if (e.type === 'goldmine') {
      const rich = e.miners > CONFIG.resources.goldmine.maxMiners;
      box.appendChild(el('div', 'sel-title', rich ? CONFIG.mineKinds.rich.name : CONFIG.resources.goldmine.name));
      row('Gold left', `${e.amount} / ${e.maxAmount}`);
      if (rich) row('Rich', `${e.miners} Laborers mine at once: half again the income`);
      // The risk side, as far as you know: a camp you have found and not seen cleared.
      const me = this.client.player;
      const camp = this.game.state.camps.find(
        (c) => Math.hypot(c.x - e.x, c.y - e.y) < 5 && this.game.vision.isExplored(me, Math.floor(c.x), Math.floor(c.y)) && !(c.seenClear & (1 << me)),
      );
      if (camp) row('Guarded', `level ${camp.level} camp (drops ${CONFIG.items[camp.drop].name})`);
      let inside = 0;
      let waiting = 0;
      for (const u of this.game.units()) {
        const o = u.order;
        if (o?.type !== 'gather' || o.nodeId !== e.id) continue;
        if (o.phase === 'working') inside++;
        if (o.phase === 'waiting') waiting++;
      }
      row('Miners inside', `${inside} / ${e.miners}${waiting ? ` (+${waiting} waiting)` : ''}`);
    } else {
      box.appendChild(el('div', 'sel-title', CONFIG.resources.tree.name));
      row('Wood left', `${e.amount} / ${e.maxAmount}`);
    }
    if (box.querySelectorAll('.row').length > 6) box.classList.add('wide');
    return box;
  }

  /** Training status and queue slots; clicking a slot cancels it. */
  private production(box: HTMLElement, b: Building, row: (k: string, v: string) => void): void {
    const head = b.queue[0];
    let status = 'Idle';
    const nameOf = (q: (typeof b.queue)[number]) => (q.research ? CONFIG.research[q.research].name : CONFIG.units[q.unit!].name);
    if (head) {
      const name = nameOf(head);
      const verb = head.research ? 'Researching' : head.revive ? 'Reviving' : 'Training';
      status = head.started ? `${verb} ${name} ${Math.floor(head.progress * 100)}%` : `${name} waiting for population (build Farms)`;
    }
    row('Production', status);
    if (trainableAt(b.type).length) row('Rally point', b.rally ? 'set (right-click to move it)' : 'none (right-click to set)');
    const slots = el('div', 'queue');
    for (let i = 0; i < CONFIG.production.queueSize; i++) {
      const q = b.queue[i];
      const slot = el('button', `slot${q ? '' : ' empty'}`);
      if (q) {
        slot.textContent = nameOf(q)[0];
        slot.title = `${nameOf(q)}: click to cancel (full refund)`;
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

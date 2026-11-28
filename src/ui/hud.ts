// DOM interface: resource bar, selection panel, command card, idle-worker
// button, notifications and the controls overlay. Reads state; issues actions
// through the InputController.

import { rulesOf } from '../sim/rules';
import { buildableFor, buildingFaction, buildingRole, FACTION, isHall, isHealer, isWorker } from '../sim/factions';
import { hpColor, teamColor } from './view';
import { COMMAND_GLYPHS, abilityArt, buildingArt, itemArt, mountArt, researchArt, skillArt, unitArt } from './art';
import { animalFor, dismountProblem, isMounted, rankName, rankOf, isTroop, skillsOf, specializeProblem, specOptions } from '../sim/elite';
import { keyLabel } from '../input/keymap';
import type { ClientState } from '../input/client';
import { ITEM_KEYS, type Action, type InputController } from '../input/input';
import { BUILDABLE, CONFIG, isHeroType, TICK_RATE, type AbilityId, type BuildingType, type ItemId, type ResearchId, type SkillId, type SpecId, type UnitType } from '../sim/config';
import { canAfford } from '../sim/construction';
import type { Game } from '../sim/game';
import { abilitiesOf, rank } from '../sim/hero';
import { buyProblem } from '../sim/items';
import { flareProblem } from '../sim/commands';
import { heroProblem, missingRequirement, trainableAt, trainCost } from '../sim/production';
import { armorValue, attackDamage, attackRange, healAmount, researchAt, researched, researchPending, researchProblem } from '../sim/tech';

/** 'a Guard', 'an Archer'. */
const an = (name: string): string => `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name}`;
const cap = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);
import type { Building, Entity, GameEvent, Unit } from '../sim/types';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Last text written per element: compared instead of the live text, which a browser's page translation may have rewritten. */
const written = new WeakMap<HTMLElement, string>();
function setText(e: HTMLElement, t: string): void {
  if (written.get(e) === t) return;
  written.set(e, t);
  e.textContent = t;
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
  if (o.type === 'skill') {
    const name = CONFIG.skills[o.skill].name;
    if (o.phase === 'prepare') return o.skill === 'aim' ? 'Taking aim…' : o.skill === 'shift' ? 'Changing form…' : name;
    return `${name}: moving into range`;
  }
  if (o.type === 'mount') {
    const a = game.unit(o.targetId);
    const name = a ? CONFIG.units[a.type].name : 'mount';
    return o.phase === 'mounting' ? `Mounting the ${name}…` : `Going to the ${name}`;
  }
  if (o.type === 'specialize') return `Going to train as a ${CONFIG.units[o.into].name}`;
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
  if (o.type === 'repair') {
    const b = game.building(o.targetId);
    const name = b ? CONFIG.buildings[b.type].name : 'building';
    return o.phase === 'repairing' ? `Repairing ${name}` : `Heading to repair ${name}`;
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

const BUFF_NAMES = { cry: 'Battle Cry', mark: "Hunter's Mark", slow: 'Slowed', ward: 'Arcane Ward', root: 'Rooted', shield: 'Bark Shield' } as const;

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
  skill?: SkillId;
  spec?: SpecId;
  mount?: 'mount' | 'dismount';
}

const BUILD_TIPS: Record<BuildingType, string> = {
  hq: 'Keep: accepts gold and wood, +10 population. Build one near a distant mine to expand.',
  farm: 'Farm: +6 population (up to the match maximum).',
  lumbermill: 'Lumber Mill: accepts wood. Build it beside a forest to shorten wood trips. Enables Archers.',
  barracks: 'Barracks: trains Guards and Archers, and Lancers, Musketeers and War Bears from tier II.',
  tower: 'Watch Tower: shoots enemies within 7 tiles.',
  altar: 'Hall of Valor: trains and revives your hero.',
  smithy: 'Blacksmith: researches weapon and armor upgrades; veteran Guards specialize here. Needed for Lancers, Musketeers and War Bears.',
  chapel: 'Chapel (tier II): trains Clerics; researches Greater Healing.',
  workshop: 'Siege Works (tier II): builds Mangonels.',
  shop: 'Trading Post (neutral): a hero standing next to it can buy items.',
  fountain: 'Healing Fountain (neutral): heals every unit nearby, friend or foe.',
  heartwood: 'Heartwood: accepts gold and wood, +10 population. Plant one near a distant mine to expand. Grows on its own.',
  grove: 'Grove: +7 population (up to the match maximum). Grows on its own.',
  saplodge: 'Sap Lodge: accepts wood. Plant it beside a forest. Enables Briar Slingers.',
  den: 'Thicket Den: trains Thornguards, Briar Slingers and Fox Scouts, and Stag Riders, Shapeshifters and Nature Wolves from tier II.',
  spire: 'Thorn Spire: shoots enemies within 7 tiles.',
  circle: 'Elder Circle: raises and revives your Thornwild heroes.',
  barkweaver: 'Barkweaver: researches thorn and bark upgrades and Deep Roots; veteran Thornguards specialize here. Needed for Stag Riders, Shapeshifters and Nature Wolves.',
  moonwell: 'Moonwell (tier II): trains Menders; researches Full Bloom.',
  rootpit: 'Root Pit (tier II): awakens Rootcrushers.',
};

const TRAIN_TIPS: Record<UnitType, string> = {
  tender: 'Tender: gathers gold and wood and plants buildings, which then grow on their own while the Tender goes back to work. Wood is harvested without felling the tree, but more slowly.',
  thornguard: 'Thornguard: cheap, armoured melee infantry. Regrows damage when out of combat. Beats Stag Riders and Lancers.',
  slinger: 'Briar Slinger: ranged; flings thorns 6 tiles. Shreds lightly armoured units. Needs a Sap Lodge.',
  fox: 'Fox Scout: fast and sharp-eyed, cheap. It does not pick fights.',
  stagrider: 'Stag Rider: fast cavalry that runs down Slingers, Archers, healers and siege; loses to Thornguards and Guards.',
  mender: 'Mender: support. Heals the most wounded nearby ally on its own while it has mana.',
  rootcrusher: 'Rootcrusher: a walking treant that crushes buildings up close. Slow: ranged units can kite it.',
  warden: 'Thorn Warden (hero): frontline. Entangle roots an enemy, Barkskin armours an ally, Wild Howl rallies.',
  huntress: 'Huntress (hero): ranged. Thorn Rain hits an area, Snare slows, Owl Eyes scouts any spot.',
  speaker: 'Grove Speaker (hero): caster. Swarm burns groups and buildings, Wither makes a target take more damage, Regrowth heals.',
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
  musketeer: 'Musketeer (tier II): a flintlock that hits hard and punches through armor, best against heavy and medium troops. Long reload, fires only standing still; keep melee off it. Take Aim: a heavy aimed shot.',
  warbear: 'War Bear (tier II): an armored brown bear, a tough frontline fighter on its own. A Bearwarden can ride it as a Bear Rider.',
  naturewolf: 'Nature Wolf (tier II): a large, quick woodland wolf that bites fast. A Wolfkeeper can ride it as a Wolf Rider.',
  shifter: 'Shapeshifter (tier II): a bark-armored spear warrior who can become a swift panther (1.5s, shared health). Warrior: Rootbind holds an enemy. Panther: Pounce.',
  panther: '',
  sentinel: '',
  bearwarden: '',
  bearrider: '',
  barksentinel: '',
  wolfkeeper: '',
  wolfrider: '',
};

const ACTIONS: ActionDef[] = [
  { id: 'move', label: 'Move', key: 'M', tip: 'Move to a location. (Right-click ground also moves.)' },
  { id: 'stop', label: 'Stop', key: 'S', tip: 'Stop the current order.' },
  { id: 'attack', label: 'Attack', key: 'A', tip: 'Click an enemy to attack it, or the ground to attack-move: walk there, fighting anything met on the way. (Right-click an enemy also attacks.)' },
  { id: 'hold', label: 'Hold', key: 'H', tip: 'Hold position: never move, attack enemies in weapon range.' },
  { id: 'gather', label: 'Gather', key: 'G', tip: 'Harvest gold from a mine or wood from trees. (Right-click a resource.)' },
  { id: 'return', label: 'Return', key: 'R', tip: 'Deliver carried resources to the nearest drop-off, then resume.' },
  {
    id: 'repair',
    label: 'Repair',
    key: 'E',
    tip: `Restore a damaged building of yours. A full repair costs ${Math.round(CONFIG.construction.repairCost * 100)}% of its price, paid as the health comes back, and takes one worker its build time; more workers repair faster. (Right-click a damaged building.)`,
  },
  ...BUILDABLE.map((t) => {
    const d = CONFIG.buildings[t];
    return {
      id: `build:${t}` as Action,
      label: d.name,
      key: d.hotkey,
      build: t,
      tip: `${BUILD_TIPS[t]} Cost: ${d.cost.gold} gold, ${d.cost.wood} wood. Build time ${d.buildSeconds}s. Requires a ${CONFIG.units[FACTION[buildingFaction(t) ?? 'crown'].units.worker].name}${d.requires ? ` and ${CONFIG.research[d.requires as ResearchId].name}` : ''}.`,
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
  ...(Object.keys(CONFIG.skills) as SkillId[]).map((sk) => {
    const d = CONFIG.skills[sk];
    const aim = d.target === 'point' ? 'Click a spot (or an enemy).' : d.target === 'enemy' ? 'Click an enemy unit.' : d.target === 'ally' ? 'Click one of your units.' : '';
    return { id: `skill:${sk}` as Action, label: d.name, key: d.hotkey, skill: sk, tip: `${d.desc} ${aim}${d.range ? ` Range ${d.range}.` : ''} ${d.cooldown}s cooldown.` };
  }),
  ...(Object.keys(CONFIG.specialize) as SpecId[]).map((sp) => {
    const d = CONFIG.specialize[sp];
    const at = CONFIG.buildings[d.at as BuildingType].name;
    return {
      id: `spec:${sp}` as Action,
      label: CONFIG.units[sp].name,
      key: d.hotkey,
      spec: sp,
      tip: `Become a ${CONFIG.units[sp].name}: ${d.desc} Needs ${CONFIG.veterancy.eligibleXp} experience, earned in battle. The soldier walks to your ${at} and pays there. Permanent. Cost: ${d.cost.gold} gold, ${d.cost.wood} wood.`,
    };
  }),
  {
    id: 'mount' as Action,
    label: 'Mount',
    key: 'D',
    mount: 'mount' as const,
    tip: `Ride a War Bear (Bearwarden) or a Nature Wolf (Wolfkeeper): click the animal. They meet and hold still for ${CONFIG.mounting.mountSeconds}s; damage interrupts. Health and population add up; experience and cooldowns stay with the rider; if the mount dies, both die. (Right-click the animal also mounts.)`,
  },
  {
    id: 'dismount' as Action,
    label: 'Dismount',
    key: 'D',
    mount: 'dismount' as const,
    tip: `Split into rider and animal again, each with the same share of health. Only after ${CONFIG.mounting.calmSeconds}s without taking damage.`,
  },
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
  private panelHtml = '';

  constructor(
    private game: Game,
    private client: ClientState,
    private input: InputController,
  ) {
    this.idleBtn.addEventListener('click', () => input.selectIdleWorker());
    this.heroBtn?.addEventListener('click', () => input.selectHero());
    this.cancelBtn.innerHTML = `<span class="cmd-glyph">${COMMAND_GLYPHS.cancel}</span><span class="cmd-label">Cancel</span><span class="cmd-key">X</span>`;
    // Pinned to the last cell, so showing it never moves the other buttons.
    this.cancelBtn.classList.add('has-glyph', 'cancel');
    setTip(this.cancelBtn, `Cancel construction (${CONFIG.construction.cancelRefund * 100}% refund) or the last queued unit (${CONFIG.production.cancelRefund * 100}% refund).`);
    this.cancelBtn.addEventListener('click', () => input.action('cancel'));
    this.card.appendChild(this.cancelBtn);
    for (const a of ACTIONS) {
      const b = el('button', 'cmd');
      b.dataset.action = a.id;
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
      // Painted art for anything with a picture; a gold glyph for plain orders.
      const art = a.build
        ? buildingArt(a.build)
        : a.train
          ? unitArt(a.train)
          : a.research
            ? researchArt(a.research)
            : a.ability
              ? abilityArt(a.ability)
              : a.buy
                ? itemArt(a.buy)
                : a.skill
                  ? skillArt(a.skill)
                  : a.spec
                    ? unitArt(a.spec)
                    : a.mount === 'mount'
                      ? mountArt(false)
                      : a.mount === 'dismount'
                        ? unitArt('bearwarden')
                        : null;
      const glyph = art ? null : (COMMAND_GLYPHS[a.flare ? 'flare' : a.id] ?? null);
      if (art) {
        b.classList.add('has-art');
        b.style.setProperty('--art', `url("${art}")`);
      } else if (glyph) {
        b.classList.add('has-glyph');
        b.insertAdjacentHTML('afterbegin', `<span class="cmd-glyph">${glyph}</span>`);
      }
      if (a.ability) {
        b.classList.add('ability');
        b.innerHTML += `<span class="cmd-cost mana">${CONFIG.hero.abilities[a.ability].mana}</span><span class="cmd-cd"></span>`;
      }
      if (a.skill) {
        b.classList.add('ability');
        b.innerHTML += `<span class="cmd-cd"></span>`;
      }
      if (a.spec) {
        b.classList.add('build');
        const c = CONFIG.specialize[a.spec].cost;
        b.innerHTML += `<span class="cmd-cost"><i class="g">${c.gold}</i> <i class="w">${c.wood}</i></span>`;
      }
      setTip(b, a.tip);
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
    this.refreshKeys();
    installTooltips();
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

  /** Show the current key map on the command card. */
  refreshKeys(): void {
    const keys = this.input.settings.keys;
    for (const [id, b] of this.buttons) {
      // Build keys are bound per role: the Farm and the Grove share one.
      const key = id.startsWith('build:') ? `build:${buildingRole(id.slice(6) as BuildingType)}` : id;
      const bound = (keys as Record<string, string>)[key];
      if (bound) setText(b.querySelector('.cmd-key')!, keyLabel(bound));
    }
    setText(this.cancelBtn.querySelector('.cmd-key')!, keyLabel(keys.cancel));
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
  onAlert: (x: number, y: number, where: 'base' | 'army') => void = () => {};
  /** Called when scouting spots something worth knowing (a softer ping). */
  onSighting: (x: number, y: number) => void = () => {};
  private sightedBuildings = new Set<number>();
  private sightedTypes = new Set<string>();
  private popAtMax: boolean | null = null;
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
    // One banner per scouting pass: halls always (a base or an expansion), other buildings
    // only the first time their kind is seen.
    const halls: string[] = [];
    const others: string[] = [];
    let ping: { x: number; y: number } | null = null;
    for (const m of vision.remembered(me)) {
      if (this.sightedBuildings.has(m.id)) continue;
      this.sightedBuildings.add(m.id);
      if (firstLook) {
        this.sightedTypes.add(m.type);
        continue;
      }
      const name = CONFIG.buildings[m.type].name;
      if (isHall(m.type)) {
        halls.push(name);
        ping = { x: m.x, y: m.y };
      } else if (!this.sightedTypes.has(m.type)) {
        others.push(name);
        ping ??= { x: m.x, y: m.y };
      }
      this.sightedTypes.add(m.type);
    }
    if (halls.length) {
      const also = others.length ? ` Also seen: ${others.join(', ')}.` : '';
      this.notify(`Enemy ${halls[0]} spotted: a base or an expansion. (Space: jump there)${also}`, 'alert');
    } else if (others.length) {
      this.notify(`Enemy ${others.length > 1 ? `buildings spotted: ${others.join(', ')}` : `${others[0]} spotted`}.`);
    }
    if (ping) this.onSighting(ping.x, ping.y);
    const soldiers = this.game
      .units()
      .filter((u) => u.owner !== me && !this.game.player(u.owner).neutral && !isWorker(u.type) && vision.canSee(me, u));
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
            atBase && (!victim || victim.kind === 'building' || (victim.kind === 'unit' && isWorker(victim.type)))
              ? 'Your base is'
              : victim?.kind === 'unit' && isWorker(victim.type)
                ? `A ${this.workerName()} is`
                : 'Your forces are';
          this.notify(`${what} under attack! (Space: jump there)`, 'alert');
          this.onAlert(e.x, e.y, atBase ? 'base' : 'army');
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
        // At the maximum, more Farms add nothing: say so instead of sending the player to build them.
        const max = this.game.popCap(e.player) >= rulesOf(this.game.state).maxPop;
        this.notify(
          max
            ? `Population maximum reached (${rulesOf(this.game.state).maxPop}). More Farms won't add more; lose or replace units to make room.`
            : 'Not enough population: build more Farms.',
          'alert',
        );
      } else if (e.type === 'cantTrain' && e.player === this.client.player) {
        this.notify(`Cannot train: ${e.reason}`, 'alert');
      } else if (e.type === 'cantItem' && e.player === this.client.player) {
        this.notify(e.reason, 'alert');
      } else if (e.type === 'itemPicked' && e.player === this.client.player) {
        this.notify(`Your hero picked up ${CONFIG.items[e.item].name}.`, 'good');
      } else if (e.type === 'itemBought' && e.player === this.client.player) {
        this.notify(`Bought ${CONFIG.items[e.item].name}.`, 'good');
      } else if ((e.type === 'cantCast' || e.type === 'cantOrder') && e.player === this.client.player) {
        this.notify(e.reason, 'alert');
      } else if (e.type === 'rankUp' && e.player === this.client.player) {
        const u = this.game.unit(e.id);
        const name = u ? CONFIG.units[u.type].name : 'soldier';
        const opts = u ? specOptions(u.type) : [];
        if (e.rank >= 2 && opts.length)
          this.notify(`${cap(an(name))} is a seasoned veteran: it can now become ${opts.map((o) => an(CONFIG.units[o].name)).join(' or ')}.`, 'good');
        else if (e.rank === 1) this.notify(`${cap(an(name))} has become a Veteran.`, 'good');
      } else if (e.type === 'specialized' && e.player === this.client.player) {
        this.notify(`A veteran has become ${an(CONFIG.units[e.into].name)}.`, 'good');
      } else if (e.type === 'mounted' && e.player === this.client.player) {
        const u = this.game.unit(e.id);
        this.notify(`${u ? CONFIG.units[u.type].name : 'A rider'} ready.`, 'good');
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
    const atMax = cap >= rulesOf(this.game.state).maxPop;
    setText(this.pop, atMax ? `${used}/${cap} max` : `${used}/${cap}`);
    this.pop.classList.toggle('full', used >= cap);
    if (atMax !== this.popAtMax) {
      this.popAtMax = atMax;
      setTip(
        this.pop.parentElement!,
        atMax
          ? `You have the maximum population of ${rulesOf(this.game.state).maxPop}. More ${this.myBuilding('farm')}s won't raise it further.`
          : `Population used / available. ${this.myBuilding('hq')}s and ${this.myBuilding('farm')}s raise it, up to ${rulesOf(this.game.state).maxPop}.`,
        null,
        'Population',
      );
    }
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
    const workers = own.some((u) => isWorker(u.type));
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
          setTip(btn, TRAIN_TIPS[a.train], problem);
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
          setTip(btn, a.tip, problem ? (researchPending(this.game, p.id, r) ? 'In progress' : problem) : null);
        }
        continue;
      }
      if (a.flare) {
        const keep = ownB && isHall(ownB.type) && ownB.progress >= 1 ? ownB : undefined;
        btn.classList.toggle('hidden', !keep);
        if (keep) {
          const problem = flareProblem(this.game, p.id, keep.id);
          btn.disabled = !!problem && !problem.startsWith('Not enough');
          btn.classList.toggle('poor', !!problem && problem.startsWith('Not enough'));
          btn.classList.toggle('active', this.client.targetMode === 'flare');
          setTip(btn, a.tip, problem);
        }
        continue;
      }
      if (a.slot !== undefined) {
        btn.classList.toggle('hidden', !hero);
        const it = hero?.hero!.items[a.slot] ?? null;
        setText(btn.querySelector('.cmd-label')!, it ? CONFIG.items[it].name : '');
        btn.classList.toggle('empty-slot', !it);
        btn.disabled = !it || !CONFIG.items[it].consumable;
        btn.classList.toggle('has-item', !!it);
        btn.classList.toggle('has-art', !!it);
        if (it) btn.style.setProperty('--art', `url("${itemArt(it)}")`);
        else btn.style.removeProperty('--art');
        setTip(btn, it ? `${CONFIG.items[it].desc}${CONFIG.items[it].consumable ? ' Click or press the key to use.' : ' Always active.'} Right-click to drop.` : 'Empty inventory slot. Heroes pick up items by right-clicking them.');
        continue;
      }
      if (a.buy) {
        btn.classList.toggle('hidden', !shop);
        if (shop) {
          const shopper = this.input.shopper(shop);
          const problem = shopper ? buyProblem(this.game, p.id, shop.id, shopper.id, a.buy) : 'You need a hero next to the Trading Post.';
          btn.disabled = !!problem && !problem.startsWith('Not enough');
          btn.classList.toggle('poor', !!problem && problem.startsWith('Not enough'));
          setTip(btn, a.tip, problem);
        }
        continue;
      }
      if (a.skill) {
        // Shown when any selected unit has the skill (and no hero's abilities claim the card).
        const users = hero ? [] : own.filter((u) => skillsOf(u.type).includes(a.skill!));
        btn.classList.toggle('hidden', !users.length);
        if (users.length) {
          const ready = Math.min(...users.map((u) => u.ready[a.skill!] ?? 0));
          const cd = Math.max(0, (ready - this.game.state.tick) / TICK_RATE);
          setText(btn.querySelector('.cmd-cd')!, cd > 0 ? `${Math.ceil(cd)}s` : '');
          btn.disabled = cd > 0;
          btn.classList.toggle('active', this.client.targetMode === a.id || (a.skill === 'stance' && users.some((u) => u.stance)));
        }
        continue;
      }
      if (a.spec) {
        const from = hero || workers ? [] : own.filter((u) => specOptions(u.type).includes(a.spec!));
        btn.classList.toggle('hidden', !from.length);
        if (from.length) {
          const ready = from.find((u) => !specializeProblem(this.game, u, a.spec!));
          const problem = ready ? null : specializeProblem(this.game, from.reduce((x, y) => (y.xp > x.xp ? y : x)), a.spec);
          btn.disabled = !!problem && !problem.startsWith('Not enough');
          btn.classList.toggle('poor', !!problem && problem.startsWith('Not enough'));
          setTip(btn, a.tip, problem);
        }
        continue;
      }
      if (a.mount) {
        const show = hero || workers ? false : a.mount === 'mount' ? own.some((u) => !!animalFor(u.type)) : own.some((u) => isMounted(u.type));
        btn.classList.toggle('hidden', !show);
        if (show && a.mount === 'dismount') {
          const m = own.find((u) => isMounted(u.type))!;
          const problem = dismountProblem(this.game, m);
          btn.disabled = !!problem;
          setTip(btn, a.tip, problem);
        }
        if (show && a.mount === 'mount') {
          const wolf = own.some((u) => animalFor(u.type) === 'naturewolf');
          btn.style.setProperty('--art', `url("${mountArt(wolf)}")`);
          btn.classList.toggle('active', this.client.targetMode === 'mount');
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
      const workerOnly = !!a.build || a.id === 'gather' || a.id === 'return' || a.id === 'repair';
      // Only your own faction's buildings appear on the card.
      const foreign = !!a.build && !buildableFor(p.faction).includes(a.build);
      btn.classList.toggle('hidden', own.length === 0 || (workerOnly && !workers) || foreign);
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
    // Compare with what was last written, not the live DOM: a browser's page
    // translation rewrites the live text, which made the panel flip languages.
    const html = panel.innerHTML;
    if (html !== this.panelHtml) {
      this.panelHtml = html;
      this.panel.replaceChildren(...panel.childNodes);
    }
  }

  /** Names in the viewer's own faction's words. */
  private workerName(): string {
    return CONFIG.units[FACTION[this.game.player(this.client.player).faction].units.worker].name;
  }

  private myBuilding(role: 'hq' | 'farm'): string {
    return CONFIG.buildings[FACTION[this.game.player(this.client.player).faction].buildings[role]].name;
  }

  private fillPanel(panel: HTMLElement, sel: Entity[]): void {
    if (!sel.length) {
      panel.appendChild(el('div', 'hint', `Left-click or drag to select workers. Right-click a gold mine or tree to gather. Select a ${this.workerName()} to build.`));
      return;
    }
    // A clear way out of any selection (same as Esc or clicking open ground).
    const close = el('button', 'sel-close', '✕');
    setTip(close, 'Deselect. Also: Esc, or left-click open ground.', null, 'Deselect');
    close.addEventListener('mousedown', (ev) => {
      ev.stopPropagation();
      this.input.setSelection([]);
    });
    panel.appendChild(close);
    if (sel.length === 1) {
      panel.appendChild(this.detail(sel[0]));
      return;
    }
    panel.appendChild(el('div', 'sel-title', `${sel.length} units selected`));
    const grid = el('div', 'portraits');
    for (const e of sel) {
      if (e.kind !== 'unit') continue;
      const pt = el('button', 'portrait');
      setTip(pt, unitStatus(this.game, e), null, CONFIG.units[e.type].name);
      pt.style.setProperty('--team', teamColor(this.game, e.owner));
      const hp = el('div', 'hp');
      hp.style.width = `${(e.hp / e.maxHp) * 100}%`;
      hp.style.background = hpColor(e.hp / e.maxHp);
      // The unit's portrait, framed in its team colour; a corner mark for what a Laborer carries.
      const img = el('img', 'portrait-art') as HTMLImageElement;
      img.src = unitArt(e.type);
      img.alt = '';
      img.draggable = false;
      pt.appendChild(img);
      const carry = isWorker(e.type) && e.carry.amount ? (e.carry.res === 'gold' ? '●' : '≡') : '';
      if (carry) pt.appendChild(el('span', 'portrait-icon', carry));
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
      if (isWorker(e.type)) row('Carrying', e.carry.amount ? `${e.carry.amount} ${e.carry.res}` : 'nothing');
      const def = CONFIG.units[e.type];
      const at = def.attack;
      const dmg = attackDamage(this.game, e);
      const arm = armorValue(this.game, e);
      const plus = (v: number, b: number) => (v !== b ? `${v} (${v > b ? '+' : ''}${Math.round((v - b) * 10) / 10})` : String(v));
      const range = attackRange(this.game, e);
      row('Attack', `${plus(dmg, at.damage)} ${at.type}, ${at.projectileSpeed ? `range ${range}` : 'melee'}, every ${at.cooldown}s${at.splash ? ', splash' : ''}`);
      row('Armor', `${plus(arm, def.armor)} ${def.armorType}`);
      if (isHealer(e.type)) row('Mana', `${Math.floor(e.mana)} / ${CONFIG.cleric.mana} (heals ${healAmount(this.game, e.owner)} each prayer)`);
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
      if (isTroop(e.type)) {
        // Veterancy: rank, progress to the next step, and what it opens.
        const v = CONFIG.veterancy;
        const r = rankOf(e);
        const xp = Math.floor(e.xp);
        // Units with no specialization stop at Veteran: no target past it.
        const next = r === 0 ? v.veteranXp : r === 1 && specOptions(e.type).length ? v.eligibleXp : 0;
        row('Rank', `${'★'.repeat(r)}${'☆'.repeat(2 - r)} ${rankName(e)}${next ? ` (${xp} / ${next} xp)` : ` (${xp} xp)`}`);
        if (next) {
          const bar = el('div', 'xp-bar');
          const fill = el('div', 'xp-fill');
          fill.style.width = `${Math.min(100, Math.round((e.xp / next) * 100))}%`;
          bar.appendChild(fill);
          box.appendChild(bar);
        }
        if (r === 2 && specOptions(e.type).length && e.owner === this.client.player)
          row('Specialize', `${specOptions(e.type).map((s) => CONFIG.units[s].name).join(' or ')}, at your ${CONFIG.buildings[CONFIG.specialize[specOptions(e.type)[0]].at as BuildingType].name}`);
        if (isMounted(e.type)) {
          const m = CONFIG.mounts[e.type];
          row('Mount', `${CONFIG.units[m.rider as UnitType].name} on a ${CONFIG.units[m.animal as UnitType].name}: if it falls, both fall`);
        }
      }
      const skills = skillsOf(e.type);
      if (skills.length)
        row(
          'Skills',
          skills
            .map((sk) => {
              const cd = Math.max(0, Math.ceil(((e.ready[sk] ?? 0) - this.game.state.tick) / TICK_RATE));
              return `${CONFIG.skills[sk].name}${sk === 'stance' && e.stance ? ' (raised)' : cd ? ` (${cd}s)` : ''}`;
            })
            .join(', '),
        );
      if (e.stun > 0) row('Stunned', `${Math.ceil(e.stun / TICK_RATE)}s`);
      if (e.buffs.length) row('Effects', e.buffs.map((b) => `${BUFF_NAMES[b.kind]}${b.kind === 'shield' ? ` ${Math.ceil(b.amount)}` : ''} ${Math.ceil((b.until - this.game.state.tick) / TICK_RATE)}s`).join(', '));
      const camp = this.game.state.camps[e.camp];
      if (camp) row('Camp', `level ${camp.level} of 3 · the last guard drops ${CONFIG.items[camp.drop].name}`);
      if (e.owner !== this.client.player) row('Owner', this.game.player(e.owner).name);
    } else if (e.kind === 'building') {
      const def = CONFIG.buildings[e.type];
      box.appendChild(el('div', 'sel-title', def.name));
      row('Health', `${Math.round(e.hp)} / ${e.maxHp}`);
      if (e.progress < 1) {
        const builder = this.game.units().some((u) => u.order?.type === 'build' && u.order.siteId === e.id && u.order.phase === 'building');
        if (e.grows) row('Growing', `${Math.floor(e.progress * 100)}% (on its own; no builder needed)`);
        else row('Construction', `${Math.floor(e.progress * 100)}%${builder ? '' : ` (paused: right-click with a ${this.workerName()} to resume)`}`);
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
      if (rich) row('Rich', `${e.miners} workers mine at once: half again the income`);
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
    // The painted portrait beside the details, framed in the owner's colour.
    const card = el('div', 'detail-card');
    const img = el('img', 'detail-art') as HTMLImageElement;
    img.src = e.kind === 'unit' ? unitArt(e.type) : e.kind === 'building' ? buildingArt(e.type, e.tier) : buildingArt(e.type);
    img.alt = '';
    img.draggable = false;
    if (e.kind !== 'resource') img.style.setProperty('--team', teamColor(this.game, e.owner));
    card.append(img, box);
    return card;
  }

  /** Training status and queue slots; clicking a slot cancels it. */
  private production(box: HTMLElement, b: Building, row: (k: string, v: string) => void): void {
    const head = b.queue[0];
    let status = 'Idle';
    const nameOf = (q: (typeof b.queue)[number]) => (q.research ? CONFIG.research[q.research].name : CONFIG.units[q.unit!].name);
    if (head) {
      const name = nameOf(head);
      const verb = head.research ? 'Researching' : head.revive ? 'Reviving' : 'Training';
      const maxed = this.game.popCap(this.client.player) >= rulesOf(this.game.state).maxPop;
      status = head.started ? `${verb} ${name} ${Math.floor(head.progress * 100)}%` : `${name} waiting for population (${maxed ? `at the maximum of ${rulesOf(this.game.state).maxPop}` : 'build Farms'})`;
    }
    row('Production', status);
    if (trainableAt(b.type).length) row('Rally point', b.rally ? 'set (right-click to move it)' : 'none (right-click to set)');
    const slots = el('div', 'queue');
    for (let i = 0; i < CONFIG.production.queueSize; i++) {
      const q = b.queue[i];
      const slot = el('button', `slot${q ? '' : ' empty'}`);
      if (q) {
        // The unit's (or research's) picture, framed in the team colour.
        const pic = el('img', 'slot-art') as HTMLImageElement;
        pic.src = q.research ? researchArt(q.research) : unitArt(q.unit!);
        pic.alt = '';
        pic.draggable = false;
        slot.appendChild(pic);
        setTip(slot, 'Click to cancel (full refund).', null, nameOf(q));
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

/** Tooltip content for an element; the name defaults to its button label and the key to its key badge. */
export function setTip(elm: HTMLElement, body: string, problem?: string | null, name?: string): void {
  elm.removeAttribute('title');
  if (elm.dataset.tipBody !== body) elm.dataset.tipBody = body;
  const pr = problem ?? '';
  if ((elm.dataset.tipProblem ?? '') !== pr) elm.dataset.tipProblem = pr;
  if (name !== undefined && elm.dataset.tipName !== name) elm.dataset.tipName = name;
}

let tooltipInstalled = false;

/**
 * One styled tooltip for the whole HUD, in place of the browser's small
 * delayed ones: name and key, cost, what it does, and what is in the way.
 */
export function installTooltips(): void {
  if (tooltipInstalled) return;
  tooltipInstalled = true;
  const tip = el('div', 'tooltip hidden');
  tip.id = 'tooltip';
  document.body.appendChild(tip);
  let current: HTMLElement | null = null;
  const show = (t: HTMLElement) => {
    current = t;
    const name = t.dataset.tipName ?? t.querySelector('.cmd-label')?.textContent ?? '';
    const key = t.querySelector('.cmd-key')?.textContent ?? '';
    const cost = t.querySelector('.cmd-cost:not(.mana)');
    const mana = t.querySelector('.cmd-cost.mana')?.textContent;
    const parts = [
      `<div class="tip-head"><b>${escapeHtml(name)}</b>${key ? `<span class="tip-key">${escapeHtml(key)}</span>` : ''}</div>`,
      cost ? `<div class="tip-cost">${cost.innerHTML}${mana ? ` <i class="m">${escapeHtml(mana)}</i>` : ''}</div>` : '',
      `<div class="tip-body">${escapeHtml(t.dataset.tipBody ?? '')}</div>`,
      t.dataset.tipProblem ? `<div class="tip-problem">${escapeHtml(t.dataset.tipProblem)}</div>` : '',
    ];
    tip.innerHTML = parts.join('');
    tip.classList.remove('hidden');
    const r = t.getBoundingClientRect();
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    tip.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2))}px`;
    tip.style.top = `${r.top - h - 8 < 8 ? r.bottom + 8 : r.top - h - 8}px`;
  };
  document.addEventListener('mouseover', (e) => {
    const t = (e.target as HTMLElement | null)?.closest?.('[data-tip-body]') as HTMLElement | null;
    if (t && t !== current) show(t);
    else if (!t && current) {
      current = null;
      tip.classList.add('hidden');
    }
  });
  // Keep a visible tooltip current (problems change as money comes in).
  setInterval(() => {
    if (current && document.body.contains(current) && !current.classList.contains('hidden')) show(current);
    else if (current) {
      current = null;
      tip.classList.add('hidden');
    }
  }, 300);
}

function escapeHtml(t: string): string {
  return t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

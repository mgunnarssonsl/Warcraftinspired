// Entry point: wires simulation, 3D view, overlay, input, HUD, screens,
// settings, sound, saving and the computer opponent together, and runs a
// fixed-timestep loop with render interpolation.
//
// A match starts in one of three ways: from URL parameters (a new match),
// from a saved game (a load request left in session storage, then a reload),
// or as the tutorial (?tutorial=1).

import { orderCue, selectCue } from './audio/cues';
import { Sound } from './audio/sound';
import { ComputerPlayer, type Difficulty } from './ai/computer';
import { randomStyle, STYLES, type AdvantageId, type StyleId } from './ai/profile';
import { createClientState } from './input/client';
import { InputController } from './input/input';
import { Overlay } from './render3d/overlay';
import { World3D } from './render3d/world';
import { makeSave, parseSave, SaveStore, type SaveFile, type SlotId } from './save/save';
import { CONFIG, TICK_SECONDS } from './sim/config';
import { Game } from './sim/game';
import { mapById } from './sim/maps';
import { Hud } from './ui/hud';
import { Minimap } from './ui/minimap';
import { Objectives } from './ui/objectives';
import { newSeed, opponentLabel, Screens, type MatchSettings, type ScreenHost } from './ui/screens';
import { browserStorage, loadSettings, saveSettings, type Settings } from './ui/settings';
import { TUTORIAL, TutorialPanel } from './ui/tutorial';
import { view } from './ui/view';
import './style.css';

const params = new URLSearchParams(location.search);
const storage = browserStorage();
const store = new SaveStore(storage ?? { getItem: () => null, setItem: () => {}, removeItem: () => {} });
const LOAD_KEY = 'ironvale.load';
const tutorial = params.get('tutorial') === '1';

// ---- what to play -----------------------------------------------------------------

let loadError: string | null = null;
let saved: SaveFile | null = null;
try {
  const request = sessionStorage.getItem(LOAD_KEY);
  sessionStorage.removeItem(LOAD_KEY);
  if (request && params.get('load') === '1') {
    const src = JSON.parse(request) as { slot: SlotId } | { text: string };
    const result = 'slot' in src ? store.read(src.slot) : parseSave(src.text);
    if (!result) loadError = 'That save slot is empty.';
    else if (!result.ok) loadError = `This save can't be loaded. ${result.reason}`;
    else saved = result.save;
  }
} catch {
  loadError = 'The saved game could not be read.';
}

const difficultyParam = params.get('difficulty');
const styleParam = params.get('style');
const advParam = params.get('adv');
const fromUrl: MatchSettings = {
  seed: params.has('seed') ? Number(params.get('seed')) | 0 : newSeed(),
  difficulty: difficultyParam === 'easy' || difficultyParam === 'hard' ? difficultyParam : 'normal',
  mapId: mapById(params.get('map') ?? undefined).id,
  style: STYLES.includes(styleParam as StyleId) ? (styleParam as StyleId) : 'random',
  advantage: advParam && advParam in CONFIG.ai.advantages ? (advParam as AdvantageId) : 'none',
};
const match: MatchSettings = saved
  ? saved.match
  : tutorial
    ? { seed: TUTORIAL.seed, difficulty: TUTORIAL.difficulty, mapId: TUTORIAL.mapId, style: 'balanced', advantage: 'none' }
    : fromUrl;
// A random style is fixed by the seed: the same match plays the same opponent.
const playedStyle: StyleId = match.style === 'random' ? randomStyle(match.seed) : match.style;

const game = saved ? Game.restore(saved.state, saved.pending, saved.visible) : Game.create(match.seed, match.mapId);
const client = createClientState(saved?.view.player ?? 0);
const computer = saved?.ai.find((a) => a.player !== client.player)
  ? ComputerPlayer.restore(saved.ai.find((a) => a.player !== client.player)!)
  : new ComputerPlayer(1, match.difficulty as Difficulty, playedStyle, tutorial ? TUTORIAL.overrides : {});
if (!saved) {
  game.player(1).name = `Computer (${match.difficulty})`;
  // The only advantage a computer can have: chosen up front, shown as a cheat.
  game.player(1).incomeBonus = CONFIG.ai.advantages[match.advantage].income;
}
if (saved) client.groups = saved.view.groups;

// ---- the client -------------------------------------------------------------------

const canvas = document.getElementById('view') as HTMLCanvasElement;
const overlayCanvas = document.getElementById('overlay') as HTMLCanvasElement;
const minimapCanvas = document.getElementById('minimap') as HTMLCanvasElement;
const world = new World3D(canvas, game);
const overlay = new Overlay(overlayCanvas, game, world.rig);
overlay.perceived = (e) => world.perceived(e);
if (params.get('fog') === '0') client.revealAll = true;
const minimap = new Minimap(minimapCanvas, game);
const now = () => performance.now() / 1000;
const input = new InputController(canvas, game, world, client, minimap, now);
const hud = new Hud(game, client, input);
const sound = new Sound();
hud.onAlert = (x, y, where) => {
  minimap.ping(x, y, '#ff4a3a', now());
  // Two distinct calls: a horn for the base, drums for an army in the field.
  sound.play(where === 'base' ? 'alertBase' : 'alertArmy');
};
hud.onSighting = (x, y) => {
  minimap.ping(x, y, '#ffd84a', now());
  sound.play('sighting');
};
document.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('button')) sound.play('click');
});
// Acknowledge the player's own orders and selections.
const issue = game.issue.bind(game);
game.issue = (c) => {
  if (c.player === client.player) {
    const cue = orderCue(c.type);
    if (cue) sound.play(cue);
  }
  issue(c);
};
const onSelection = input.onSelectionChanged;
let lastSelection = '';
input.onSelectionChanged = () => {
  onSelection();
  const own = client.selected.map((id) => game.unit(id)).filter((u) => u && u.owner === client.player).map((u) => u!.type);
  const key = client.selected.join(',');
  if (key !== lastSelection) {
    lastSelection = key;
    const cue = selectCue(own);
    if (cue) sound.play(cue);
  }
};

// ---- settings ----------------------------------------------------------------------

let settings: Settings = loadSettings(storage);
function applySettings(s: Settings, first = false): void {
  settings = s;
  sound.volumes = { ...s.audio };
  world.applyGraphics(s.graphics);
  world.effects = s.graphics.effects;
  view.healthBars = s.graphics.healthBars;
  if (view.colorblind !== s.interface.colorblind) {
    view.colorblind = s.interface.colorblind;
    if (!first) world.recolor();
  }
  document.documentElement.style.setProperty('--ui-scale', String(s.interface.uiScale));
  input.settings = s;
  hud.refreshKeys();
  if (!first) saveSettings(storage, s);
}
applySettings(settings, true);

// ---- saving ------------------------------------------------------------------------

function currentSave(): SaveFile {
  return makeSave({
    match,
    state: game.state,
    pending: game.pendingCommands(),
    visible: game.vision.snapshot(),
    ai: [computer.snapshot()],
    view: { player: client.player, camera: { x: world.rig.tx, y: world.rig.ty, distance: world.rig.distance }, groups: client.groups },
  });
}
let lastAutosaveTick = game.state.tick;
function autosave(): void {
  if (tutorial || game.state.outcome || screens.current === 'start') return;
  store.write('auto', currentSave());
  lastAutosaveTick = game.state.tick;
}

const host: ScreenHost = {
  get settings() {
    return settings;
  },
  applySettings: (s) => applySettings(s),
  store,
  saveTo: (slot) => store.write(slot, currentSave()),
  exportSave: () => {
    const blob = new Blob([JSON.stringify(currentSave())], { type: 'application/json' });
    const a = document.createElement('a');
    const mins = Math.floor(game.state.tick / 20 / 60);
    a.href = URL.createObjectURL(blob);
    a.download = `ironvale-${match.mapId}-${mins}min.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  },
  load: (source) => {
    try {
      sessionStorage.setItem(LOAD_KEY, JSON.stringify(source));
    } catch {
      host.loadError = 'The browser would not hold the saved game for loading.';
      screens.showStart();
      return;
    }
    location.search = 'load=1';
  },
  startTutorial: () => {
    location.search = 'tutorial=1';
  },
  loadError,
  tutorial,
};

// ---- screens -----------------------------------------------------------------------

const screens = new Screens(game, match, client.player, host);
screens.opponent = { style: playedStyle, journal: computer.journal };
screens.onClose = () => {
  client.modalOpen = false;
  // After the match, "Keep watching" lifts the fog so the whole map can be seen.
  if (game.state.outcome) client.revealAll = true;
};
screens.onSurrender = () => game.issue({ type: 'surrender', player: client.player });
const subtitle = document.getElementById('subtitle')!;
subtitle.textContent = tutorial ? 'tutorial' : `skirmish vs ${opponentLabel(match, playedStyle, false)} computer`;
if (match.advantage !== 'none') {
  const cheat = document.createElement('span');
  cheat.className = 'cheat';
  cheat.textContent = ` · ${CONFIG.ai.advantages[match.advantage].name}`;
  subtitle.append(cheat);
}
const openMenu = () => {
  screens.showMenu();
  client.modalOpen = screens.current !== null;
};
document.getElementById('menu-btn')!.addEventListener('click', openMenu);
window.addEventListener('keydown', (e) => {
  const inMenus = screens.current === 'menu' || screens.current === 'settings' || screens.current === 'saves';
  if (e.key === 'F10' || (e.key === 'Escape' && inMenus)) {
    e.preventDefault();
    if (inMenus) screens.close();
    else openMenu();
  }
});
if (!saved && !tutorial && params.get('start') !== '1') {
  screens.showStart();
  client.modalOpen = true;
}

// The objectives checklist, or the guided tutorial in its place.
const objectives = tutorial ? null : new Objectives(game, client.player);
if (objectives) objectives.onComplete = (text) => hud.notify(`Objective complete: ${text}`, 'good');
const tutorialPanel = tutorial ? new TutorialPanel(() => ({ game, client, camera: { x: world.rig.tx, y: world.rig.ty } })) : null;
if (tutorialPanel) {
  tutorialPanel.onComplete = (title) => {
    hud.notify(`Done: ${title}`, 'good');
    sound.play('research');
  };
  tutorialPanel.onFinish = () => {
    location.search = '';
  };
}

function resize(): void {
  const r = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width));
  const h = Math.max(1, Math.round(r.height));
  world.resize(w, h);
  overlay.resize(w, h);
}
window.addEventListener('resize', resize);
resize();

if (saved) {
  world.rig.distance = saved.view.camera.distance;
  world.rig.centerOn(saved.view.camera.x, saved.view.camera.y);
  hud.notify(`Saved game loaded (${mapById(match.mapId).name}).`, 'good');
} else {
  const home = game.buildings().find((b) => b.owner === client.player)!;
  world.rig.centerOn(home.x + 4, home.y);
}

minimapCanvas.addEventListener('mousedown', (e) => {
  const p = minimap.toMap(e.clientX, e.clientY);
  // A targeting mode (Signal Flare, attack-move, move) aims at the clicked spot.
  if (e.button === 0 && input.targetAtMap(p.x, p.y)) return;
  if (e.button === 0) world.rig.centerOn(p.x, p.y);
  else if (e.button === 2) {
    const ids = client.selected.filter((id) => game.unit(id)?.owner === client.player);
    if (ids.length) {
      game.issue({ type: 'move', player: client.player, units: ids, x: p.x, y: p.y });
      world.addMarker(p.x, p.y, now());
    }
  }
});
minimapCanvas.addEventListener('contextmenu', (e) => e.preventDefault());

// Pause when the window loses focus (a setting), resume when it comes back.
let autoPaused = false;
window.addEventListener('blur', () => {
  if (settings.interface.pauseOnBlur && !client.paused && !game.state.outcome) {
    client.paused = true;
    autoPaused = true;
  }
});
window.addEventListener('focus', () => {
  if (autoPaused) client.paused = false;
  autoPaused = false;
});
// Leaving the page keeps the match: autosave on the way out.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') autosave();
});
window.addEventListener('pagehide', autosave);

/** Where work can be heard: sites being built and mines being worked, in sight. */
function workSounds(see: (x: number, y: number) => boolean) {
  const building: Array<{ x: number; y: number }> = [];
  const mining: Array<{ x: number; y: number }> = [];
  for (const u of game.units()) {
    const o = u.order;
    if (o?.type === 'build' && o.phase === 'building' && see(u.x, u.y)) building.push(u);
    else if (u.hidden && o?.type === 'gather') {
      const m = game.resource(o.nodeId);
      if (m && see(m.x, m.y)) mining.push(m);
    }
  }
  return { building, mining };
}

let acc = 0;
let last = performance.now();
const MAX_STEPS_PER_FRAME = 8;
const AUTOSAVE_TICKS = 20 * 120;

function frame(t: number): void {
  // Clamp large gaps (tab switching) so we never fast-forward wildly.
  const dt = Math.min(0.25, (t - last) / 1000);
  last = t;
  // The start screen and the menus pause the match; the end screen does not.
  const running = !client.paused && screens.current !== 'start' && screens.current !== 'menu' && screens.current !== 'settings' && screens.current !== 'saves';
  if (running) acc += dt;
  let steps = 0;
  while (acc >= TICK_SECONDS && steps < MAX_STEPS_PER_FRAME) {
    game.step();
    computer.update(game);
    acc -= TICK_SECONDS;
    steps++;
  }
  if (steps === MAX_STEPS_PER_FRAME) acc = 0;
  if (game.state.tick - lastAutosaveTick >= AUTOSAVE_TICKS) autosave();
  const events = game.drainEvents();
  const secs = t / 1000;
  world.handleEvents(events, secs);
  overlay.handleEvents(events, secs, client.player);
  minimap.handleEvents(events, secs, client.player);
  hud.handleEvents(events);
  // Sound: heard from the camera, and only what this viewer can see.
  sound.listener = { x: world.rig.tx, y: world.rig.ty, reach: world.rig.distance * 1.1 + 8 };
  const seeTile = (x: number, y: number) => client.revealAll || game.vision.isVisible(client.player, Math.floor(x), Math.floor(y));
  sound.handleEvents(events, {
    viewer: client.player,
    visible: seeTile,
    unit: (id) => {
      const u = game.unit(id);
      return u ? { type: u.type, owner: u.owner, x: u.x, y: u.y } : undefined;
    },
  });
  sound.tick(workSounds(seeTile));
  for (const e of events) {
    if (e.type === 'playerDefeated' && e.player === client.player) screens.defeatReason = e.reason;
    if (e.type === 'matchOver') {
      screens.showEnd();
      client.modalOpen = true;
    }
  }
  objectives?.update();
  tutorialPanel?.update();
  input.update(dt);
  const alpha = client.paused ? 1 : acc / TICK_SECONDS;
  world.render(client, alpha, secs);
  overlay.draw(client, alpha, secs);
  minimap.draw(world.rig, client, secs);
  hud.update(t);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Debug/testing handle (used by automated browser checks).
(window as unknown as { __rts: unknown }).__rts = { game, client, world, input, computer, screens, store, sound, host, get settings() { return settings; } };

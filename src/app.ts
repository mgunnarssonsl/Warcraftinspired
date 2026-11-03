// The game (loaded by main.ts once the browser checks out): wires simulation, 3D view, overlay, input, HUD, screens,
// settings, sound, saving and the computer opponent together, and runs a
// fixed-timestep loop with render interpolation.
//
// A match starts in one of three ways: from URL parameters (a new match),
// from a saved game (a load request left in session storage, then a reload),
// or as the tutorial (?tutorial=1).

import { orderCue, selectCue } from './audio/cues';
import { Sound } from './audio/sound';
import { ComputerPlayer, type Difficulty } from './ai/computer';
import { randomFaction, randomStyle, STYLES, type AdvantageId, type StyleId } from './ai/profile';
import { createClientState } from './input/client';
import { InputController } from './input/input';
import { Overlay } from './render3d/overlay';
import { World3D } from './render3d/world';
import { makeSave, parseSave, SaveStore, type SaveFile, type SlotId } from './save/save';
import { CONFIG, TICK_SECONDS } from './sim/config';
import { Game } from './sim/game';
import { FACTION, FACTIONS, type FactionId } from './sim/factions';
import { mapById } from './sim/maps';
import { Hud } from './ui/hud';
import { Minimap } from './ui/minimap';
import { Objectives } from './ui/objectives';
import { newSeed, opponentLabel, Screens, type MatchSettings, type ScreenHost } from './ui/screens';
import { browserStorage, loadSettings, saveSettings, type Settings } from './ui/settings';
import { TUTORIAL, TutorialPanel } from './ui/tutorial';
import { view } from './ui/view';
import { cleanRules, DEFAULT_RULES, describeRules, isDefaultRules } from './sim/rules';
import { isScenario, scenarioMedal, SCENARIOS, type ScenarioId } from './sim/scenarios';
import { ChallengePanel, challengeBests, recordChallenge } from './ui/challenge';
import { OnlineSession, type OnlineStart } from './net/session';
import { createMatch, parseReplay, Recorder, ReplayPlayer, type MatchSpec, type ReplayFile } from './replay/replay';
import { downloadReplay, PLAY_KEY, ReplayStore } from './replay/store';
import { ReplayBar, type Vision } from './ui/replayBar';


const params = new URLSearchParams(location.search);
const storage = browserStorage();
const store = new SaveStore(storage ?? { getItem: () => null, setItem: () => {}, removeItem: () => {} });
const LOAD_KEY = 'ironvale.load';
const tutorial = params.get('tutorial') === '1';
// A challenge (?challenge=holdTheLine&faction=wild): a fixed scenario with its own goal.
const challengeId = isScenario(params.get('challenge')) ? (params.get('challenge') as ScenarioId) : null;
const challenge = challengeId ? SCENARIOS[challengeId] : null;
/** Set by main.ts when this page is an online match it has already rejoined. */
const online = (window as unknown as { __ironvaleOnline?: OnlineStart }).__ironvaleOnline ?? null;

// ---- what to play -----------------------------------------------------------------

let loadError: string | null = null;
const replays = new ReplayStore(storage);
// A replay to watch (?replay=1). The file waits in session storage, and stays
// there: jumping back in time reloads the page and plays up to the new spot.
let replayFile: ReplayFile | null = null;
if (params.get('replay') === '1') {
  try {
    const text = sessionStorage.getItem(PLAY_KEY);
    const r = text ? parseReplay(text) : null;
    if (r?.ok) replayFile = r.replay;
    else loadError = r ? `This replay can't be played. ${r.reason}` : 'The replay to play was not found.';
  } catch {
    loadError = 'The replay could not be read.';
  }
}
const replayPlayer = replayFile ? new ReplayPlayer(replayFile) : null;
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
const factionParam = params.get('faction') as FactionId | null;
const vsParam = params.get('vs') as FactionId | 'random' | null;
const fromUrl: MatchSettings = {
  seed: params.has('seed') ? Number(params.get('seed')) | 0 : newSeed(),
  difficulty: difficultyParam === 'easy' || difficultyParam === 'hard' ? difficultyParam : 'normal',
  mapId: mapById(params.get('map') ?? undefined).id,
  style: STYLES.includes(styleParam as StyleId) ? (styleParam as StyleId) : 'random',
  advantage: advParam && advParam in CONFIG.ai.advantages ? (advParam as AdvantageId) : 'none',
  faction: factionParam && FACTIONS.includes(factionParam) ? factionParam : 'crown',
  opponentFaction: vsParam && (vsParam === 'random' || FACTIONS.includes(vsParam)) ? vsParam : 'crown',
  // Custom rules from the link; anything not on offer falls back to the standard value.
  rules: cleanRules({
    startGold: Number(params.get('gold') ?? DEFAULT_RULES.startGold),
    startWood: Number(params.get('wood') ?? DEFAULT_RULES.startWood),
    startWorkers: Number(params.get('workers') ?? DEFAULT_RULES.startWorkers),
    maxPop: Number(params.get('pop') ?? DEFAULT_RULES.maxPop),
    fog: params.get('fog') === 'explored' || params.get('fog') === 'revealed' ? params.get('fog') : 'normal',
    camps: params.get('camps') !== '0',
  }),
};
const onlineSeat = online?.resume.seat ?? 0;
const specMatch = (spec: MatchSpec, seat: number): MatchSettings => ({
  seed: spec.seed,
  difficulty: 'normal',
  mapId: spec.mapId,
  style: 'balanced',
  advantage: 'none',
  faction: spec.factions[seat],
  opponentFaction: spec.factions[1 - seat],
  rules: cleanRules(spec.rules ?? DEFAULT_RULES),
});
const challengeFaction: FactionId = params.get('faction') === 'wild' ? 'wild' : 'crown';
const challengeSpec: MatchSpec | null = challenge
  ? { seed: challenge.seed, mapId: challenge.mapId, factions: [challengeFaction, 'crown'], names: ['You', challenge.name], incomeBonus: [], scenario: challenge.id }
  : null;
const match: MatchSettings = replayFile
  ? specMatch(replayFile.spec, replayFile.viewer)
  : challengeSpec
  ? { ...specMatch(challengeSpec, 0), rules: cleanRules({ ...DEFAULT_RULES, ...challenge!.rules }) }
  : online
  ? {
      seed: online.resume.setup.seed,
      difficulty: 'normal',
      mapId: online.resume.setup.mapId,
      style: 'balanced',
      advantage: 'none',
      faction: online.resume.setup.factions[onlineSeat],
      opponentFaction: online.resume.setup.factions[1 - onlineSeat],
      rules: cleanRules(online.resume.setup.rules ?? DEFAULT_RULES),
    }
  : saved
  ? { ...saved.match, rules: cleanRules(saved.state.rules ?? DEFAULT_RULES) }
  : tutorial
    ? { seed: TUTORIAL.seed, difficulty: TUTORIAL.difficulty, mapId: TUTORIAL.mapId, style: 'balanced', advantage: 'none', faction: 'crown', opponentFaction: 'crown', rules: DEFAULT_RULES }
    : fromUrl;
// A random style is fixed by the seed: the same match plays the same opponent.
const playedStyle: StyleId = match.style === 'random' ? randomStyle(match.seed) : match.style;

// A random opponent faction is fixed by the seed too, but shown from the start.
const opponentFaction: FactionId = match.opponentFaction === 'random' ? randomFaction(match.seed) : match.opponentFaction;
// Every match is built from a spec, so its replay can build the same one.
const spec: MatchSpec | null = replayFile
  ? replayFile.spec
  : challengeSpec && !saved
  ? challengeSpec
  : online
    ? { seed: online.resume.setup.seed, mapId: online.resume.setup.mapId, factions: online.resume.setup.factions, names: online.resume.setup.names, incomeBonus: [], rules: online.resume.setup.rules }
    : saved
      ? (saved.replay?.spec ?? null)
      : {
          seed: match.seed,
          mapId: match.mapId,
          factions: [match.faction, opponentFaction],
          names: ['You', `Computer (${match.difficulty})`],
          // The only advantage a computer can have: chosen up front, shown as a cheat.
          incomeBonus: [0, CONFIG.ai.advantages[match.advantage].income],
          ...(isDefaultRules(match.rules) ? {} : { rules: match.rules }),
        };
const game = replayPlayer
  ? replayPlayer.game
  : saved
    ? Game.restore(saved.state, saved.pending, saved.visible)
    : createMatch(spec!);
const replayVision: Vision = replayFile ? (params.get('v') === 'all' ? 'all' : Number(params.get('v') ?? replayFile.viewer)) : 0;
const client = createClientState(replayFile ? (replayVision === 'all' ? replayFile.viewer : replayVision) : online ? onlineSeat : (saved?.view.player ?? 0));
if (replayFile && replayVision === 'all') client.revealAll = true;
client.online = !!online;
// Online: the lockstep runner applies every player's commands, on the same tick everywhere.
const session = online ? new OnlineSession(online, game, game.issue.bind(game)) : null;
const computer = online || replayPlayer || challenge || game.state.scenario
  ? null
  : saved?.ai.find((a) => a.player !== client.player)
    ? ComputerPlayer.restore(saved.ai.find((a) => a.player !== client.player)!)
    : new ComputerPlayer(1, match.difficulty as Difficulty, playedStyle, tutorial ? TUTORIAL.overrides : {});
if (saved) client.groups = saved.view.groups;
// Record every match but the tutorial (a loaded save carries its log on, if it has one).
const recorder = replayPlayer || tutorial || !spec ? null : new Recorder(game, spec, saved?.replay);
if (session) session.lock.afterTick = () => recorder?.afterStep();
let lastReplay: ReplayFile | null = null;
const replayKind = online ? 'online' : game.state.scenario ? 'challenge' : 'single';

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
// Acknowledge the player's own orders and selections. Online, orders go to
// the lockstep runner, which sends them ahead to everyone.
const issue = session ? (c: Parameters<Game['issue']>[0]) => session.issue(c) : game.issue.bind(game);
game.issue = (c) => {
  if (replayPlayer) {
    hud.notify('You are watching a replay: orders cannot be given.');
    return;
  }
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
    ai: computer ? [computer.snapshot()] : [],
    replay: recorder?.log,
    view: { player: client.player, camera: { x: world.rig.tx, y: world.rig.ty, distance: world.rig.distance }, groups: client.groups },
  });
}
let lastAutosaveTick = game.state.tick;
function autosave(): void {
  if (tutorial || session || game.state.outcome || screens.current === 'start') return;
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
  replays,
  lastReplay: () => lastReplay,
  watchReplay: (file) => watchReplay(file),
  downloadReplay: (file) => downloadReplay(file),
  watching: !!replayPlayer,
  challenge: game.state.scenario && !replayPlayer ? { id: game.state.scenario.id, faction: game.player(0).faction } : null,
  challengeBests: () => challengeBests(storage),
  online: session ? { names: session.setup.names, leave: () => session.leave(), diagnostics: () => session.diagnostics() } : null,
};

/** Open a replay in a fresh page (it waits in session storage for that page). */
function watchReplay(file: ReplayFile | string): void {
  try {
    sessionStorage.setItem(PLAY_KEY, typeof file === 'string' ? file : JSON.stringify(file));
  } catch {
    hud.notify('The browser would not hold the replay for playing. Save it as a file and open that instead.', 'alert');
    return;
  }
  location.search = 'replay=1';
}

// ---- screens -----------------------------------------------------------------------

const screens = new Screens(game, match, client.player, host);
screens.opponent = { style: playedStyle, journal: computer?.journal ?? [] };
screens.onClose = () => {
  client.modalOpen = false;
  // After the match, "Keep watching" lifts the fog so the whole map can be seen.
  if (game.state.outcome) client.revealAll = true;
};
screens.onSurrender = () => game.issue({ type: 'surrender', player: client.player });
const subtitle = document.getElementById('subtitle')!;
subtitle.textContent = game.state.scenario && !replayFile
  ? `challenge · ${SCENARIOS[game.state.scenario.id].name} · ${FACTION[game.player(0).faction].name}`
  : replayFile
  ? `replay · ${replayFile.spec.names.join(' vs ')} · ${mapById(replayFile.spec.mapId).name}`
  : session
  ? `${FACTION[game.player(client.player).faction].name} vs ${FACTION[game.player(1 - client.player).faction].name} · online against ${session.setup.names[1 - client.player]}`
  : tutorial
  ? 'tutorial'
  : `${FACTION[game.player(client.player).faction].name} vs ${FACTION[game.player(1 - client.player).faction].name} (${opponentLabel(match, playedStyle, false)} computer)`;
if (describeRules(match.rules) && !game.state.scenario) subtitle.append(` · ${describeRules(match.rules)}`);
if (match.advantage !== 'none' && !replayFile) {
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
if (!saved && !tutorial && !session && !replayPlayer && !challenge && params.get('start') !== '1') {
  screens.showStart();
  client.modalOpen = true;
}

// The objectives checklist, or the guided tutorial in its place.
// A challenge shows its goal and progress instead (also when watching one, or a loaded one).
const challengePanel = game.state.scenario ? new ChallengePanel(game) : null;
const objectives = tutorial || replayPlayer || challengePanel ? null : new Objectives(game, client.player);
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
  if (settings.interface.pauseOnBlur && !session && !client.paused && !game.state.outcome) {
    client.paused = true;
    autoPaused = true;
  }
});
window.addEventListener('focus', () => {
  if (autoPaused) client.paused = false;
  autoPaused = false;
});
// The browser can take the 3D view away (a driver reset, too many tabs using
// the GPU). The match pauses until it is back; three.js uploads the scene again.
let contextPaused = false;
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault(); // lets the browser restore it
  if (!client.paused && !session) {
    client.paused = true;
    contextPaused = true;
  }
  autosave();
  hud.notify(session ? 'The graphics were reset by the browser; they should come back in a moment.' : 'The graphics were reset by the browser: paused until they come back.', 'alert');
});
canvas.addEventListener('webglcontextrestored', () => {
  if (contextPaused) client.paused = false;
  contextPaused = false;
  hud.notify('Graphics restored.', 'good');
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

// Online status: ping and delay in the top bar, and a banner over the game
// while waiting for the other player or reconnecting.
const netStatus = document.getElementById('net')!;
const netBannerEl = document.getElementById('netbanner')!;
netStatus.classList.toggle('hidden', !session);
function netBanner(text: string | null): void {
  netBannerEl.classList.toggle('hidden', !text);
  if (text && netBannerEl.textContent !== text) netBannerEl.textContent = text;
}
if (session) {
  session.onNotice = (text, cls) => hud.notify(text, cls);
  session.onDesync = () => {
    screens.showDesync(session.lock.status().desyncTurn ?? 0);
    client.modalOpen = true;
  };
}

// Watching a replay: the bar, and a jump to ?t= seconds on arrival.
const replayBar = replayFile ? new ReplayBar(game, client, replayFile, replayVision, Number(params.get('s') ?? 1) || 1) : null;
let seekTo = replayFile ? Math.min(replayFile.ticks, Math.max(0, Math.round(Number(params.get('t') ?? 0) * 20))) : 0;
let replayAcc = 0;
if (replayBar && replayFile) {
  replayBar.onSeek = (tick) => {
    if (tick >= game.state.tick) seekTo = tick;
    else {
      // Back in time: the simulation only runs forwards, so start again and play up to there.
      const q = new URLSearchParams({ replay: '1', t: String(Math.floor(tick / 20)), v: String(replayBar.vision), s: String(replayBar.speed) });
      location.search = q.toString();
    }
  };
  replayBar.onVision = (v) => {
    client.revealAll = v === 'all';
    if (v === 'all') return;
    client.player = v;
    // Look where that player is: their first Keep, or where they started.
    const home = game.buildings().find((b) => b.owner === v) ?? game.state.starts[v];
    if (home) world.rig.centerOn(home.x, home.y);
  };
  replayBar.onExit = () => (location.search = '');
  if (replayFile.spec.mapId !== mapById(replayFile.spec.mapId).id) hud.notify('This replay was made on a map this version of the game does not have.', 'alert');
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
  if (replayPlayer && replayBar) {
    if (seekTo > game.state.tick) {
      replayPlayer.run(Math.min(800, seekTo - game.state.tick));
      netBanner(`Jumping to ${Math.floor(seekTo / 1200)}:${String(Math.floor(seekTo / 20) % 60).padStart(2, '0')}…`);
    } else {
      netBanner(null);
      if (!client.paused) replayAcc += dt * replayBar.speed;
      const n = Math.floor(replayAcc / TICK_SECONDS);
      replayAcc -= n * TICK_SECONDS;
      replayPlayer.run(Math.min(n, 400));
    }
    replayBar.update(t, replayPlayer.diverged !== null ? 'plays differently from the recording (a different game version)' : replayPlayer.done ? 'end' : null);
  } else if (session) {
    // Online: lockstep decides; the match never pauses for one player.
    const { replaying } = session.frame(dt * 1000);
    netBanner(replaying ? 'Catching up with the match…' : session.banner());
    netStatus.textContent = session.statusLine();
  } else {
    if (running) acc += dt;
    let steps = 0;
    while (acc >= TICK_SECONDS && steps < MAX_STEPS_PER_FRAME) {
      game.step();
      recorder?.afterStep();
      computer?.update(game);
      acc -= TICK_SECONDS;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) acc = 0;
  }
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
    else if (e.type === 'playerDefeated' && !game.state.players[e.player]?.neutral) screens.foeDefeatReason = e.reason;
    if (e.type === 'matchOver' && replayPlayer) {
      hud.notify(`Replay: ${game.state.outcome?.winner == null ? 'a draw' : `${game.player(game.state.outcome.winner).name} won`}.`, 'good');
      continue;
    }
    if (e.type === 'waveIncoming') {
      hud.notify(`Wave ${e.wave} of ${e.of} is coming!`, 'alert');
      sound.play('alertArmy');
    }
    if (e.type === 'matchOver') {
      session?.over(game.state.outcome?.winner ?? null);
      const sc = game.state.scenario;
      const medal = scenarioMedal(game);
      if (sc && medal)
        screens.challengeBest = recordChallenge(storage, sc.id, { medal, ticks: game.state.tick, losses: game.player(0).stats.unitsLost, faction: game.player(0).faction, date: new Date().toISOString() });
      if (recorder) {
        lastReplay = recorder.file(client.player, replayKind, __VERSION__);
        replays.add(lastReplay);
      }
      screens.showEnd();
      client.modalOpen = true;
    }
  }
  objectives?.update();
  challengePanel?.update();
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
(window as unknown as { __rts: unknown }).__rts = { game, client, world, input, computer, screens, store, sound, host, session, get settings() { return settings; } };

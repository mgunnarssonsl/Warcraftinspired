// Entry point: wires simulation, 3D view, overlay, input, HUD, screens and
// the computer opponent together and runs a fixed-timestep loop with render
// interpolation.

import { ComputerPlayer, type Difficulty } from './ai/computer';
import { createClientState } from './input/client';
import { InputController } from './input/input';
import { Overlay } from './render3d/overlay';
import { World3D } from './render3d/world';
import { TICK_SECONDS } from './sim/config';
import { Game } from './sim/game';
import { mapById } from './sim/maps';
import { Hud } from './ui/hud';
import { Minimap } from './ui/minimap';
import { Objectives } from './ui/objectives';
import { newSeed, Screens } from './ui/screens';
import './style.css';

const params = new URLSearchParams(location.search);
const seed = params.has('seed') ? Number(params.get('seed')) | 0 : newSeed();
const difficultyParam = params.get('difficulty');
const difficulty: Difficulty = difficultyParam === 'easy' || difficultyParam === 'hard' ? difficultyParam : 'normal';
const mapId = mapById(params.get('map') ?? undefined).id;

const canvas = document.getElementById('view') as HTMLCanvasElement;
const overlayCanvas = document.getElementById('overlay') as HTMLCanvasElement;
const minimapCanvas = document.getElementById('minimap') as HTMLCanvasElement;

const game = Game.create(seed, mapId);
const client = createClientState(0);
const world = new World3D(canvas, game);
const overlay = new Overlay(overlayCanvas, game, world.rig);
overlay.perceived = (e) => world.perceived(e);
if (params.get('fog') === '0') client.revealAll = true;
const minimap = new Minimap(minimapCanvas, game);
const now = () => performance.now() / 1000;
const input = new InputController(canvas, game, world, client, minimap, now);
const hud = new Hud(game, client, input);
const computer = new ComputerPlayer(1, difficulty);
game.player(1).name = `Computer (${difficulty})`;
hud.onAlert = (x, y) => minimap.ping(x, y, '#ff4a3a', now());
hud.onSighting = (x, y) => minimap.ping(x, y, '#ffd84a', now());
const objectives = new Objectives(game, client.player);
objectives.onComplete = (text) => hud.notify(`Objective complete: ${text}`, 'good');
const screens = new Screens(game, { seed, difficulty, mapId }, client.player);
screens.onClose = () => {
  client.modalOpen = false;
  // After the match, "Keep watching" lifts the fog so the whole map can be seen.
  if (game.state.outcome) client.revealAll = true;
};
screens.onSurrender = () => game.issue({ type: 'surrender', player: client.player });
document.getElementById('subtitle')!.textContent = `skirmish vs ${difficulty} computer`;
const openMenu = () => {
  screens.showMenu();
  client.modalOpen = screens.current !== null;
};
document.getElementById('menu-btn')!.addEventListener('click', openMenu);
window.addEventListener('keydown', (e) => {
  if (e.key === 'F10' || (e.key === 'Escape' && screens.current === 'menu')) {
    e.preventDefault();
    if (screens.current === 'menu') screens.close();
    else openMenu();
  }
});
if (params.get('start') !== '1') {
  screens.showStart();
  client.modalOpen = true;
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

const home = game.buildings().find((b) => b.owner === client.player)!;
world.rig.centerOn(home.x + 4, home.y);

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

let acc = 0;
let last = performance.now();
const MAX_STEPS_PER_FRAME = 8;

function frame(t: number): void {
  // Clamp large gaps (tab switching) so we never fast-forward wildly.
  const dt = Math.min(0.25, (t - last) / 1000);
  last = t;
  // The start screen and the in-game menu pause the match; the end screen does not.
  const running = !client.paused && screens.current !== 'start' && screens.current !== 'menu';
  if (running) acc += dt;
  let steps = 0;
  while (acc >= TICK_SECONDS && steps < MAX_STEPS_PER_FRAME) {
    game.step();
    computer.update(game);
    acc -= TICK_SECONDS;
    steps++;
  }
  if (steps === MAX_STEPS_PER_FRAME) acc = 0;
  const events = game.drainEvents();
  const secs = t / 1000;
  world.handleEvents(events, secs);
  overlay.handleEvents(events, secs, client.player);
  minimap.handleEvents(events, secs, client.player);
  hud.handleEvents(events);
  for (const e of events) {
    if (e.type === 'playerDefeated' && e.player === client.player) screens.defeatReason = e.reason;
    if (e.type === 'matchOver') {
      screens.showEnd();
      client.modalOpen = true;
    }
  }
  objectives.update();
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
(window as unknown as { __rts: unknown }).__rts = { game, client, world, input, computer, screens };

// Entry point: wires simulation, 3D view, overlay, input, HUD and the
// placeholder rival together and runs a fixed-timestep loop with render
// interpolation.

import { RivalEconomy } from './ai/rival';
import { createClientState } from './input/client';
import { InputController } from './input/input';
import { Overlay } from './render3d/overlay';
import { World3D } from './render3d/world';
import { TICK_SECONDS } from './sim/config';
import { Game } from './sim/game';
import { Hud } from './ui/hud';
import { Minimap } from './ui/minimap';
import './style.css';

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') ?? 1) | 0;

const canvas = document.getElementById('view') as HTMLCanvasElement;
const overlayCanvas = document.getElementById('overlay') as HTMLCanvasElement;
const minimapCanvas = document.getElementById('minimap') as HTMLCanvasElement;

const game = Game.create(seed);
const client = createClientState(0);
const world = new World3D(canvas, game);
const overlay = new Overlay(overlayCanvas, game, world.rig);
const minimap = new Minimap(minimapCanvas, game);
const now = () => performance.now() / 1000;
const input = new InputController(canvas, game, world, client, minimap, now);
const hud = new Hud(game, client, input);
const rival = new RivalEconomy(1);
hud.onAlert = (x, y) => minimap.ping(x, y, '#ff4a3a', now());

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
  if (!client.paused) acc += dt;
  let steps = 0;
  while (acc >= TICK_SECONDS && steps < MAX_STEPS_PER_FRAME) {
    game.step();
    rival.update(game);
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
(window as unknown as { __rts: unknown }).__rts = { game, client, world, input };

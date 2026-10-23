// Entry point: wires simulation, renderer, input, HUD and the placeholder
// rival together and runs a fixed-timestep loop with render interpolation.

import { RivalEconomy } from './ai/rival';
import { createClientState } from './input/client';
import { InputController } from './input/input';
import { Camera } from './render/camera';
import { Renderer } from './render/renderer';
import { TICK_SECONDS } from './sim/config';
import { Game } from './sim/game';
import { Hud } from './ui/hud';
import './style.css';

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') ?? 1) | 0;

const canvas = document.getElementById('view') as HTMLCanvasElement;
const minimap = document.getElementById('minimap') as HTMLCanvasElement;

const game = Game.create(seed);
const client = createClientState(0);
const cam = new Camera(game.state.map.width, game.state.map.height);
const renderer = new Renderer(canvas, game);
const now = () => performance.now() / 1000;
const input = new InputController(canvas, game, cam, client, renderer, now);
const hud = new Hud(game, client, input);
const rival = new RivalEconomy(1);

function resize(): void {
  const r = canvas.getBoundingClientRect();
  canvas.width = Math.round(r.width);
  canvas.height = Math.round(r.height);
  cam.viewW = canvas.width;
  cam.viewH = canvas.height;
  cam.clamp();
}
window.addEventListener('resize', resize);
resize();

const home = game.buildings().find((b) => b.owner === client.player)!;
cam.centerOn(home.x + 4, home.y - 1);

minimap.addEventListener('mousedown', (e) => {
  const r = minimap.getBoundingClientRect();
  const wx = ((e.clientX - r.left) / r.width) * game.state.map.width;
  const wy = ((e.clientY - r.top) / r.height) * game.state.map.height;
  if (e.button === 0) cam.centerOn(wx, wy);
  else if (e.button === 2) {
    const ids = client.selected.filter((id) => game.unit(id)?.owner === client.player);
    if (ids.length) {
      game.issue({ type: 'move', player: client.player, units: ids, x: wx, y: wy });
      renderer.addMarker(wx, wy, '#5dff6a', now());
    }
  }
});
minimap.addEventListener('contextmenu', (e) => e.preventDefault());

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
  renderer.handleEvents(events, secs, client.player);
  hud.handleEvents(events);
  input.update(dt);
  renderer.draw(cam, client, client.paused ? 1 : acc / TICK_SECONDS, secs);
  renderer.drawMinimap(minimap, cam, client, secs);
  hud.update(t);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Debug/testing handle (used by automated browser checks).
(window as unknown as { __rts: unknown }).__rts = { game, client, cam, input };

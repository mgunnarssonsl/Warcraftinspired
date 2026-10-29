// Entry point: checks that this browser can run the game, then loads it
// (app.ts). A browser without WebGL 2, or a start that fails, gets a plain
// explanation instead of an empty page. For an online match (?online=CODE)
// it first takes this browser's seat on the game server, so the game starts
// from the match's setup and command log (the same path as a rejoin).

import { rejoinOnline, storedSeat } from './net/session';
import './style.css';

function supportProblem(): string | null {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return 'Ironvale needs WebGL 2 for its 3D view, and this browser or device does not provide it. Use a current version of Chrome, Edge, Firefox or Safari, and check that hardware acceleration is turned on in the browser settings.';
  } catch {
    return 'The browser refused to create a 3D view (WebGL 2). Check that hardware acceleration is turned on in the browser settings.';
  }
  return null;
}

/** Replace the game with a short message (nothing else on the page works anyway). */
export function showProblem(text: string, home = false): void {
  const app = document.getElementById('app');
  const box = document.createElement('div');
  box.className = 'fatal';
  box.innerHTML = `<h1>Ironvale</h1><p></p><button id="retry">Try again</button>${home ? ' <button id="home">Back to the start screen</button>' : ''}`;
  box.querySelector('p')!.textContent = text;
  box.querySelector('#retry')!.addEventListener('click', () => location.reload());
  box.querySelector('#home')?.addEventListener('click', () => (location.search = ''));
  (app ?? document.body).replaceChildren(box);
}

function loadGame(): void {
  import('./app').catch((e: unknown) => {
    showProblem(`The game failed to start: ${e instanceof Error ? e.message : String(e)}. Reloading usually helps; a saved match is kept.`);
    throw e;
  });
}

const problem = supportProblem();
const onlineCode = new URLSearchParams(location.search).get('online');
if (problem) showProblem(problem);
else if (onlineCode) {
  const seat = storedSeat(onlineCode);
  if (!seat) showProblem('This browser has no seat in that online match. Join it from the start screen with its code.', true);
  else
    rejoinOnline(seat)
      .then((start) => {
        (window as unknown as { __ironvaleOnline?: unknown }).__ironvaleOnline = start;
        loadGame();
      })
      .catch((e: unknown) => showProblem(`Could not rejoin the online match: ${e instanceof Error ? e.message : String(e)}`, true));
} else loadGame();

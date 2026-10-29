// Entry point: checks that this browser can run the game, then loads it
// (app.ts). A browser without WebGL 2, or a start that fails, gets a plain
// explanation instead of an empty page.

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
export function showProblem(text: string): void {
  const app = document.getElementById('app');
  const box = document.createElement('div');
  box.className = 'fatal';
  box.innerHTML = '<h1>Ironvale</h1><p></p><button>Reload</button>';
  box.querySelector('p')!.textContent = text;
  box.querySelector('button')!.addEventListener('click', () => location.reload());
  (app ?? document.body).replaceChildren(box);
}

const problem = supportProblem();
if (problem) showProblem(problem);
else
  import('./app').catch((e: unknown) => {
    showProblem(`The game failed to start: ${e instanceof Error ? e.message : String(e)}. Reloading usually helps; a saved match is kept.`);
    throw e;
  });

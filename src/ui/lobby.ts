// The online lobby: create a private match (and share its code) or join
// one with a code, choose the map (host) and your faction, and get ready.
// When both players are ready the server starts the match; the page then
// reloads into it (?online=CODE), taking the seat it just got, the same way
// a player rejoins after a reload.

import { NetClient, serverUrl, websocketTransport } from '../net/client';
import type { RoomState, ServerMsg } from '../net/protocol';
import { storeSeat } from '../net/session';
import { FACTION, FACTIONS, type FactionId } from '../sim/factions';
import { MAPS, mapById } from '../sim/maps';
import { describeRules, RULE_CHOICES, type MatchRules } from '../sim/rules';

const NAME_KEY = 'ironvale.name';

const RULE_TITLES: Record<keyof MatchRules, string> = {
  startGold: 'Starting gold',
  startWood: 'Starting wood',
  startWorkers: 'Starting workers',
  maxPop: 'Population limit',
  fog: 'Map knowledge',
  camps: 'Neutral camps',
};

function ruleValue(k: keyof MatchRules, v: unknown): string {
  if (k === 'fog') return v === 'normal' ? 'Fog of war' : v === 'explored' ? 'Map explored' : 'No fog';
  if (k === 'camps') return v ? 'On' : 'Off';
  return String(v);
}

function esc(t: string): string {
  return t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

function savedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export class Lobby {
  private net: NetClient | null = null;
  private room: RoomState | null = null;
  private seat = -1;
  private message = '';

  constructor(
    /** Puts html into the modal and returns its root for wiring. */
    private open: (html: string) => HTMLElement,
    private back: () => void,
  ) {}

  show(): void {
    if (this.room) return this.showRoom();
    const root = this.open(
      `<h2>Play online</h2>
      <p class="lead">A private match against a friend. One of you creates it and shares the code; the other joins with it.</p>
      <label class="field">Your name <input id="lobby-name" maxlength="20" value="${esc(savedName())}" placeholder="Player"></label>
      <div class="start-actions">
        <button id="lobby-create"><b>Create a match</b><span>You get a code to share.</span></button>
        <div class="join-row"><input id="lobby-code" maxlength="5" placeholder="CODE" autocomplete="off"><button id="lobby-join"><b>Join</b></button></div>
      </div>
      <p class="fine" id="lobby-msg">${esc(this.message)}</p>
      <p class="fine">Online matches cannot be paused or saved. If your connection drops, reloading the page (or waiting) takes you back into the match; after a minute away you forfeit.</p>
      <div class="actions"><button id="lobby-back">Back</button></div>`,
    );
    const name = () => {
      const n = (root.querySelector('#lobby-name') as HTMLInputElement).value.trim() || 'Player';
      try {
        localStorage.setItem(NAME_KEY, n);
      } catch {
        // Not remembered; fine.
      }
      return n;
    };
    root.querySelector('#lobby-create')!.addEventListener('click', () => this.connect((net) => net.create(name())));
    const join = () => {
      const code = (root.querySelector('#lobby-code') as HTMLInputElement).value.trim().toUpperCase();
      if (code.length !== 5) return this.say('A match code has 5 letters.');
      this.connect((net) => net.join(code, name()));
    };
    root.querySelector('#lobby-join')!.addEventListener('click', join);
    root.querySelector('#lobby-code')!.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') join();
    });
    root.querySelector('#lobby-back')!.addEventListener('click', () => this.back());
  }

  private say(text: string): void {
    this.message = text;
    const el = document.getElementById('lobby-msg');
    if (el) el.textContent = text;
  }

  private async connect(first: (net: NetClient) => void): Promise<void> {
    this.say('Connecting…');
    try {
      if (!this.net || this.net.closed) {
        this.net = new NetClient(await websocketTransport(serverUrl()));
        this.net.onMessage = (m) => this.receive(m);
        this.net.onClose = () => {
          this.net = null;
          this.room = null;
          this.say('The connection to the game server closed.');
          this.show();
        };
      }
      first(this.net);
    } catch {
      this.say('Could not reach the game server. Is it running (npm run server)? See the README.');
    }
  }

  private receive(m: ServerMsg): void {
    if (m.t === 'error') {
      this.say(m.reason);
      if (!this.room) this.show();
      return;
    }
    if (m.t === 'room') {
      this.room = m.room;
      this.seat = m.seat;
      this.message = '';
      this.showRoom();
      return;
    }
    if (m.t === 'resume' && this.net && this.room) {
      // The match is on: take the seat in a fresh page.
      const server = new URLSearchParams(location.search).get('server');
      storeSeat({ code: this.room.code, token: this.net.token, server: serverUrl() });
      location.search = new URLSearchParams({ online: this.room.code, ...(server ? { server } : {}) }).toString();
    }
  }

  private showRoom(): void {
    const room = this.room!;
    const me = room.seats[this.seat];
    const host = this.seat === 0;
    const seatRow = (i: number) => {
      const s = room.seats[i];
      if (!s) return `<li class="open">Waiting for a player to join…</li>`;
      const you = i === this.seat ? ' (you)' : '';
      return `<li><b>${esc(s.name)}${you}</b> · ${FACTION[s.faction].name}${s.connected ? '' : ' · connecting…'} <span class="${s.ready ? 'ready' : 'not-ready'}">${s.ready ? 'Ready' : 'Not ready'}</span></li>`;
    };
    const root = this.open(
      `<h2>Online match</h2>
      <p class="lead">Match code <b class="code">${room.code}</b> · share it with your opponent.</p>
      <ul class="seats">${room.seats.map((_, i) => seatRow(i)).join('')}</ul>
      <div class="choices">
        <div>
          <h3>Map${host ? '' : ' (the host chooses)'}</h3>
          <div class="chips">${MAPS.map((m) => `<button data-map="${m.id}" class="${m.id === room.mapId ? 'picked' : ''}" ${host ? '' : 'disabled'}>${m.name}</button>`).join('')}</div>
          <p class="fine">${esc(mapById(room.mapId).blurb)}</p>
        </div>
        <div>
          <h3>Your faction</h3>
          <div class="chips">${FACTIONS.map((f) => `<button data-faction="${f}" class="${me?.faction === f ? 'picked' : ''}">${FACTION[f].name}</button>`).join('')}</div>
          <p class="fine">${me ? esc(FACTION[me.faction].blurb) : ''}</p>
        </div>
      </div>
      <h3>Match rules${host ? '' : ' (the host chooses)'}</h3>
      ${
        host
          ? (Object.keys(RULE_CHOICES) as Array<keyof MatchRules>)
              .map(
                (k) =>
                  `<div class="rule"><span>${RULE_TITLES[k]}</span><div class="chips">${(RULE_CHOICES[k] as readonly unknown[])
                    .map((v, i) => `<button data-rk="${k}" data-ri="${i}" class="${room.rules[k] === v ? 'picked' : ''}">${ruleValue(k, v)}</button>`)
                    .join('')}</div></div>`,
              )
              .join('')
          : `<p class="fine">${esc(describeRules(room.rules) || 'Standard rules.')}</p>`
      }
      <p class="fine" id="lobby-msg">${esc(this.message)}</p>
      <div class="actions">
        <button id="lobby-leave">Leave</button>
        <button class="primary" id="lobby-ready">${me?.ready ? 'Not ready' : 'Ready'}</button>
      </div>`,
    );
    root.querySelectorAll<HTMLButtonElement>('[data-map]').forEach((b) => b.addEventListener('click', () => this.net?.send({ t: 'setMap', mapId: b.dataset.map! })));
    root.querySelectorAll<HTMLButtonElement>('[data-faction]').forEach((b) =>
      b.addEventListener('click', () => this.net?.send({ t: 'pick', faction: b.dataset.faction as FactionId })),
    );
    root.querySelectorAll<HTMLButtonElement>('[data-rk]').forEach((b) =>
      b.addEventListener('click', () => {
        const k = b.dataset.rk as keyof MatchRules;
        const rules = { ...room.rules, [k]: (RULE_CHOICES[k] as readonly unknown[])[Number(b.dataset.ri)] } as MatchRules;
        this.net?.send({ t: 'setRules', rules });
      }),
    );
    root.querySelector('#lobby-ready')!.addEventListener('click', () => this.net?.send({ t: 'ready', ready: !me?.ready }));
    root.querySelector('#lobby-leave')!.addEventListener('click', () => {
      if (this.net) {
        this.net.onClose = () => {};
        this.net.send({ t: 'leave' });
        this.net.close();
      }
      this.net = null;
      this.room = null;
      this.message = '';
      this.show();
    });
  }
}

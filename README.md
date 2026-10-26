# Ironvale

An original browser real-time strategy game focused on a physical, visible
economy: workers walk to resources, gather, carry, and deliver them, and base
layout and worker allocation decide how fast you earn. Skirmish only, against
computer opponents. No campaign or story.

![3D view: a growing base with Keep, Barracks, Lumber Mill and Farm; Guards and an Archer at the rally point](docs/screenshot.png)

**Status:** These milestones are done:

- 1: economic sandbox
- 1.5: 3D foundation
- 2: base construction and production
- 3: combat foundation
- 4: complete skirmish against a computer opponent
- 5: strategic depth (fog of war, upgrades and tech, a hero, rewarding camps)
- Phase A, first pass: refining the core experience (Shift-queued orders,
  grab-to-pan camera, group pacing, objectives that register reliably, AI
  routing and scouting memory, a balance pass from AI-vs-AI playtests)
- Phase B: a complete first faction. It adds damage and armor types, three
  new units (Lancer, Cleric, Mangonel), two new buildings, a third
  technology tier, economic and military upgrades, and a computer opponent
  that uses all of it.
- Phase C: three heroes with distinct roles, items and a three-slot
  inventory, camps at three levels that drop items, Trading Posts and
  Healing Fountains, and explicit death and revival rules
- Phase D: map control and exploration. It adds three hand-designed maps,
  mines with different risks and rewards, fog that remembers what you saw,
  scouting tools (the Outrider and the Signal Flare) and sighting cues.
- Phase E: a smarter computer opponent. Difficulty now means decision
  quality: reaction, judgement, attention and micro. Five strategic styles
  (Balanced, Raider, Expander, Warden, Warlord, or Random) sit on top of
  it. It also gains economic recovery and an end-screen journal of its
  decisions. An optional income advantage is labelled as a cheat.
- Phase F: saving, settings and usability:
  - versioned saves that continue a match exactly, with an autosave and
    file export;
  - sound, graphics, camera and interface settings, and remappable
    controls;
  - interface scaling, readable tooltips and colour-blind friendly
    teams;
  - an interactive tutorial, and an end-of-match summary with charts.
- Phase G: a consistent original look and sound:
  - distinct unit silhouettes carrying the team colour;
  - animation by attack style, flinches and gallops;
  - building states you can read: damage smoke and fire, working smoke,
    rubble;
  - smooth water;
  - role icons in the interface;
  - categorized, positional, fog-respecting sound with clear alerts.

See [Roadmap](#roadmap).

## Run it

Requires Node 20+.

```sh
npm install
npm run dev        # http://localhost:5173
                   # optional: ?difficulty=easy|normal|hard&style=random|balanced|raider|
                   #   expander|warden|warlord&adv=none|income25|income50
                   #   &map=vales|river|highland&seed=N
                   #   &start=1 (skip the start screen) · ?tutorial=1 (the tutorial)
npm test           # simulation tests (vitest)
npm run build      # typecheck + production bundle in dist/
```

## Controls

| Input | Action |
| --- | --- |
| Left-click / drag | Select / box-select your units |
| Shift + click / drag | Add or remove from the selection |
| Double-click a unit | Select every unit of that type on screen |
| Right-click | Context command: ground = move, enemy = attack, mine or tree = gather, Keep = return cargo, unfinished building = resume construction |
| Shift + any order | Queue it after the current one: waypoints, attack-move legs, several buildings for one Laborer. Selected units show their queued route as dashed lines (green move, red attack, yellow gather or build). A plain order or Stop clears the queue. |
| M, S, G, R | Move, Stop, Gather, Return cargo (also on the command card) |
| A, then click | Click an enemy to attack it, or the ground to attack-move: walk there and fight anything on the way |
| H | Hold position: never move, and fight whatever comes within weapon range |
| F, L, B, T, V, N, K (Laborer selected) | Place a Farm, Lumber Mill, Barracks, Watch Tower, Hall of Valor, Blacksmith or Keep. From tier II, C places a Chapel and W a Siege Works. Click to place, Shift+click to keep placing, right-click or Esc to cancel. |
| Q, W, E (building selected) | Train or research what that building offers. See the table below. |
| F2 or the Hero button | Select a hero (each press cycles to the next) |
| Q, W, E (hero selected) | That hero's abilities: click an enemy, an ally or a spot, depending on the ability |
| Z, X, C (hero selected) | Use the item in that inventory slot. Right-click a slot to drop it. |
| Right-click an item (hero selected) | Walk over and pick it up |
| Q, W, E, R, T, Y, D (Trading Post selected) | Buy that item for your hero standing next to the Post |
| F, then click (Keep selected) | Signal Flare: light up any spot on the map (25 gold). The click can be on the minimap. |
| Right-click (Keep or Barracks selected) | Set the rally point. On a mine or tree, newly trained Laborers start gathering there. |
| Click a queue slot | Cancel that unit (full refund) |
| X | Cancel construction (75% refund), or the last queued unit (full refund) |
| `.` or the *Idle workers* button | Cycle through idle workers |
| Ctrl+1–9 / Shift+1–9 / 1–9 | Save the selection as group 1–9 / add the selection to it / select that group again (press twice to center the camera). On a Mac, Ctrl or ⌥ Option + number saves: ⌘ + number is kept by the browser for switching tabs. Works on the number row and the keypad, in any keyboard layout. |
| Hold and drag the right or middle mouse button | Grab the map and drag it: the ground under the cursor follows the mouse. A right-click released without dragging is still a normal command. |
| Arrows, screen edge | Pan the camera. The mouse wheel zooms toward the cursor, and the camera tilts flatter as you zoom in. |
| Minimap | Left-click jumps the camera there, or aims a pending flare, attack-move or move. Right-click moves the selected units there. |
| Space | Jump to the latest alert, or to the current selection |
| P | Pause |
| F10 or the Menu button | Menu: resume, save, load, settings, restart, new match, surrender (pauses the game) |
| Any of the keys above | Can be changed in Settings › Controls (number keys, Esc, F1 and F10 are fixed) |
| `` ` `` / F3 | Debug overlay: blocked tiles (red) and the selected units' paths |
| F1 / ? | Controls panel |

| Building | Q | W | E |
| --- | --- | --- | --- |
| Keep | Laborer | Fortify to Castle, then to Citadel | Mule Carts |
| Barracks | Guard | Archer | Lancer (tier II); R trains an Outrider |
| Hall of Valor | Marshal (or revive) | Pathfinder (or revive) | Sage (or revive) |
| Blacksmith | weapons I–III | armor I–III | |
| Lumber Mill | Bow Saws | Longbows (tier II) | |
| Chapel | Cleric | Greater Healing (tier III) | |
| Siege Works | Mangonel | | |

## Economy rules (current)

These are the rules as implemented. All numbers live in `src/sim/config.ts`.

- **Stockpiles change only on delivery.** Gathered resources stay in the
  worker's explicit `carry` (shown on its back) until it reaches a drop-off
  building. Tests check that *node + carried + stockpile* stays constant.
- **Gold:** A worker enters the mine, stays 2 s, and comes out with 10 gold.
  At most **2 workers can be inside a mine at once**. The others wait at the
  entrance, so one mine tops out at 10 gold/s, which takes about 5 workers on
  the start mine. Pips above the entrance show how many slots are in use.
- **Wood:** Each swing takes 0.6 s and yields 1 wood. A worker carries up to 10.
  A tree holds 50 wood and disappears when empty, which reopens its tile for
  walking. At most 2 workers can chop the same tree. If a worker's tree is
  felled or crowded, it looks for the nearest *reachable* tree within 12 tiles
  of where it was working.
- **Depleted mine:** The mine collapses and is removed. Each affected player
  gets a notice and a minimap ping. Its workers deliver what they carry, then
  go idle. They are not reassigned automatically.
- **Switching jobs:** A worker told to gather a different resource (or more
  gold) delivers its current load first. Stopping a worker inside a mine
  cancels that trip and yields no gold.
- **No drop-off:** If a worker has nowhere to deliver, it keeps its cargo,
  goes idle, and you get a notice.
- **Population:** Laborers use 1 population, and Guards and Archers use 2. A
  completed Keep provides 10 and a completed Farm 6, up to a cap of 100.
  The cap is a deliberate maximum: past it, more Farms add nothing. The top
  bar then reads "100/100 max", and a blocked queue says the maximum is
  reached rather than asking for Farms.

## Match rules

- **Defeat:** you lose when you own no buildings at all; unfinished ones still
  count. Surrendering (F10 → Surrender) also loses at once. A defeated
  player's remaining units leave the field.
- **Victory:** you win when you are the last player not defeated.
- **Draw:** if the last players are all defeated in the same simulation tick,
  the match is a draw.
- **Neutrals:** the Brigand camps never win or lose.
- **After the outcome:** the result is final. The game keeps running behind
  the end screen, so you can choose "Keep watching".
- **End screen:** compares gold and wood gathered, units trained and lost,
  enemies destroyed, and buildings built and lost.

## Computer opponent

`src/ai/computer.ts` (behaviour) and `src/ai/profile.ts` (difficulty ×
style); all numbers in `CONFIG.ai`.

Every opponent is a **difficulty** combined with a **style**:
- the difficulty sets how well it plays: how quickly it reacts, how
  carefully it judges fights, how attentive its economy is;
- the style sets what it plans: when it attacks and expands, what it builds
  and fields.

Any style can be played at any difficulty. Choose both on the start screen,
or with `?difficulty=…&style=…`. The style can also be **Random**: it is
picked from the match seed, so a replayed seed meets the same opponent, and
it stays hidden until the end screen.

### Fair play, and the one labelled exception

- **Same rules as you.** It acts only through the same commands you use. It
  pays the same costs, has the same population limits and build times, and
  plays under the same fog of war. It knows:
  - enemy units it currently sees;
  - enemy buildings as it last saw them (the same memory you get);
  - camps it has spotted;
  - the public start locations.

  A test checks that an enemy hidden in unexplored fog leaves every command
  it issues unchanged.
- **Advantages are opt-in and always labelled.** The start screen offers
  "Computer advantage: none / +25% income (cheat) / +50% income (cheat)".
  The default is none.
  - An advantage adds that share to every delivery the computer makes, as
    whole gold or wood, carrying fractions over. It doesn't speed up its
    gathering or change anything else.
  - When chosen, the top bar, the menu and the end screen all say so.
  - It is a rule of the simulation (`Player.incomeBonus`), not a hidden
    AI trick.

### Difficulty: decision quality

| | Easy | Normal | Hard |
| --- | --- | --- | --- |
| Thinks every | 2 s | 1 s | 0.5 s |
| Reacts to an attack on its base after | 6 s | 2.5 s | 1 s |
| Notices idle Laborers every | 10 s | 3 s | 0.5 s |
| Scouts | no | Laborer at 2:00, then an Outrider; flares | Laborer at 1:15, then an Outrider; flares |
| Changes plan on what it scouted | no | yes | yes |
| Adapts its army to yours | no | yes | yes |
| Checks it is stronger before attacking | no | yes | yes, counting towers and the defender's edge |
| Expands | on a timer (15:00) | on a timer (10:00) | as soon as it is safe (from 3:00), or at 7:00 |
| Uses banked wood (wood-hungry units, earlier Castle) | no | yes | yes |
| Judges fights (retreats from a stronger force, defends in proportion) | no | yes | yes |
| Regroups before marching | no | yes | yes |
| Reinforces a wave already out | no | no | yes |
| Focus fire | no | no | yes |
| Pulls Laborers away from an army they can't fight | no | yes | yes |
| Pulls a badly hurt hero out to heal | no | yes | yes |
| Saves to rebuild a falling last Keep | no | yes | yes |
| Laborers per Keep (max) / Barracks / most Keeps | 11 / 1 / 2 | 12 / 2 / 2 | 13 / 2 / 3 |
| Upgrades, Castle | no | yes, Castle 12:00 | yes, Castle 9:00, Citadel 16:00 |
| First attack / wave size | 9:00, 4 | 6:40, 6 | 6:40, 6 |

Hard attacks no earlier than Normal. An earlier Hard attack was tried and
measured: attacking into a defended base early loses (13–22 over 36
computer games), so Hard's edge is in its decisions, not its clock.

Easy is not only slower. It defends with everything it has whether the
raid is one Guard or ten, fights on until a wave is three-quarters dead,
and leaves Laborers idle for a while.

### Styles: different plans

Times are the Normal figures; the other difficulties scale the same way.
Hard also expands as soon as it is safe, whatever the style.

| Style | Plan | Normal: first attack / expansion |
| --- | --- | --- |
| **Balanced** | Expands on schedule and attacks when it judges itself stronger. | 6:40 / 10:00 |
| **Raider** | Small groups of its fastest soldiers raid your Laborers before its first wave; smaller, earlier waves; Lancer-heavy; expands late. | 4:20 (raids from 3:15) / 16:00 |
| **Expander** | Takes mines first, up to three Keeps (two more Laborers each), then attacks late with a large army. | 10:00 / 4:00 |
| **Warden** | Three towers (the second and third guard its mines), an early Castle, Mangonels, and a later, heavier push. | 8:40 / 10:00 |
| **Warlord** | Hall of Valor before the Barracks, heroes first, hunts camps with a smaller party for items and levels. | 7:20 / 10:00 |

### What it does, in layers

- **Economy and recovery:**
  - About 5 Laborers per mine beside a Keep (7 on a rich mine), plus a
    small wood crew. Rally points send new Laborers straight to work.
  - After heavy losses (below 60% of its peak), Laborers come before the
    army.
  - When its last Keep is below half health, Normal and Hard keep enough
    gold to rebuild it.
  - When the Keep is gone, a new one comes first, at the nearest mine with
    no enemy known nearby. If it can't afford one, the army clears camps
    for the bounty until it can.
  - Idle Laborers go back to work. "Lost" ones go back to a home mine:
    gold haulers whose mine has no Keep beside it any more, and woodcutters
    far from any drop-off.
- **Scouting and intel:**
  - A Laborer looks at the enemy base early, then an Outrider tours the
    expansions, and flares light up a target it has lost track of.
  - From what it has seen, it takes a posture:
    - **threatened:** enemy soldiers on its side of the map before 5:00,
      or two Barracks scouted. It holds its army home, adds a tower and
      waits to expand.
    - **greedy:** three or more enemy towers, a defensive opponent. It
      expands and fortifies sooner.
  - Its attack target weighs distance against towers it remembers near the
    target, and prefers an outlying expansion to the main base.
- **Adapting:** Normal and Hard shift the mix toward counters of the
  soldiers they have seen: Lancers against Archers, Clerics and siege;
  Guards against Lancers; Clerics against Guards.
- **Defence:**
  - It answers an attack on any of its buildings with enough defenders,
    nearest first, to outmatch it by half again (Easy sends everything).
    A lone enemy Laborer walking past is a scout, not an attack.
  - It recalls an attack wave only for a real attack: at least two
    soldiers, outweighing the army at home and the towers nearby.
  - With a second Keep, Laborers in the path of an army leave for it. With
    no soldiers near, Laborers fight off a small raid (not on Easy).
- **Attack waves:**
  - A wave launches at the wave size, after the first-attack time, once it
    judges itself stronger.
  - It gathers at the staging point before marching, so it arrives
    together.
  - It judges the fight before contact. It backs off from a force 1.4×
    its strength that it has only spotted. Once engaged, it pulls out only
    at 2.2× odds, since turning tail mid-fight gets an army cut down from
    behind. It also falls back after losing 65% of its units (75% on
    Easy). The next wave is larger.
  - On Hard, soldiers trained meanwhile follow as reinforcements.
  - Waves route around camps they know of.
- **Heroes and items:**
  - In a fight, heroes use every ability by kind: heal or ward the most
    hurt ally, stun, mark or slow the biggest threat, area damage where
    enemies bunch up.
  - They drink a Draught when badly hurt and read a Scroll of Return when
    about to die. With nothing left to drink, a hero below 30% health walks
    to the nearest Fountain or home, and returns at 75%.
  - Heroes pick up camp drops and shop at Trading Posts with gold it can
    spare.
  - Between attacks, the army and hero clear camps. When it wants to
    expand and the mine it wants is guarded, that camp comes first.
- **Building:** one plan at a time, in this order:
  1. Farms, kept ahead of demand
  2. Barracks (the Warlord builds its Hall of Valor first)
  3. Lumber Mill
  4. Hall of Valor
  5. Towers
  6. Blacksmith
  7. Chapel and Siege Works, once fortified and if its mix wants them
  8. More Barracks
  9. Expansions

  It sets aside money for builders still walking to their sites and
  finishes foundations whose builder was lost, unless enemies are at the
  site.
- **Its journal:** the computer records its main decisions as it goes. The
  end screen lists them, with times, under "What the computer did":
  - what it scouted, and the posture it took;
  - expansions and fortifications;
  - each attack, raid and retreat;
  - recoveries and Laborers moved to safety.

  The journal is shown only after the match, so it reveals nothing during
  play.

## Construction rules (current)

One construction model applies throughout:

1. **Placement.** The footprint snaps to the tiles centered under the cursor.
   It is valid only if every tile is inside the map and free of terrain,
   buildings, mines and trees. Units do not block placement. The preview shows
   a ghost of the building plus a green or red marker on each tile, and the
   ghost turns red if you can't afford the building.
2. **Ordering.** The nearest selected Laborer walks to the site. Nothing is
   paid yet. An order that is invalid when given is rejected immediately, with
   a reason.
3. **Foundation.** When the Laborer arrives, placement and cost are checked
   again. If both pass, the cost is paid and the foundation appears at 10% HP.
   Any units on the footprint are pushed to the nearest free ground, so a
   building can never trap a unit inside it. If either check fails, the order
   ends and you're told why.
4. **Building.** One active builder raises the building, and both HP and
   progress grow over the build time. Extra Laborers sent to the site stand
   by and take over if the builder leaves, so they don't speed it up. If the
   builder is given another order, construction pauses. To resume, right-click
   the foundation with any Laborer.
5. **Completion.** The building starts working: it adds population and starts
   accepting deliveries. The builder goes back to whatever it was gathering
   before.
6. **Cancel.** Cancelling an unfinished building refunds 75% of its cost and
   frees its tiles.
7. **Several buildings.** Shift+click places more buildings for the same
   Laborer, who builds them one after another and only then goes back to its
   previous job.

Unfinished buildings provide no population and accept no deliveries. A
Lumber Mill built next to a forest shortens wood trips; in the tests it
raises one woodcutter's output by more than 50% on a distant tree line.

## Production rules (current)

These rules apply the same way to every player, including the computer.
All numbers are in `CONFIG.units` and `CONFIG.production`.

| Unit | Trained at | Cost | Pop | Time | Requires |
| --- | --- | --- | --- | --- | --- |
| Laborer | Keep | 75 gold | 1 | 15 s | — |
| Guard (melee) | Barracks | 135 gold | 2 | 20 s | — |
| Archer (ranged) | Barracks | 130 gold, 10 wood | 2 | 18 s | Lumber Mill |

- **Cost is paid when you queue a unit.** If you can't afford it, the unit
  isn't queued and you're told why. The same happens if the building is
  unfinished, a requirement is missing, or the queue is full (5 per
  building).
- **Population is reserved when training starts**, not when you queue.
  Training starts when a unit reaches the front of the queue. If there isn't
  enough capacity, the unit waits at 0% with a "Need Farms" marker, and you
  get one notice. Nothing is lost, and training starts by itself once
  capacity frees up.
- **Cancelling** any queued or in-progress unit refunds 100% of its cost and
  releases any population it reserved.
- **If a production building is destroyed**, its whole queue is refunded.
  Only the building itself is lost. If it was unfinished, its construction
  cost is lost too.
- **If capacity falls below usage**, for example when a Farm is lost, your
  existing units are kept. New training can't start until usage is back
  under capacity. A unit already in training keeps its reserved population
  and finishes.
- **Spawning and rally:** a finished unit appears on the free tile beside the
  building that is closest to the rally point, then walks to the rally
  point. If the rally point is a resource, a new Laborer gathers from it.
  If the building is completely boxed in, the finished unit waits at 100%
  until a tile frees up.

## The faction: roster and roles

The roster is small on purpose. Each unit is there because it creates a
choice:

| Unit | From | Cost | Tier | Role | Strong against | Weak against |
| --- | --- | --- | --- | --- | --- | --- |
| Guard | Barracks | 135 gold | I | Heavy-armored line infantry | Lancers, siege | Archers, Clerics' magic |
| Archer | Barracks (needs Lumber Mill) | 130 gold, 10 wood | I | Ranged pierce damage | Guards, light units (Archers, Clerics) | Lancers, buildings |
| Lancer | Barracks (needs Blacksmith) | 195 gold, 40 wood | II | Fast cavalry, shrugs off arrows | Archers, Clerics, Mangonels | Guards |
| Cleric | Chapel | 140 gold, 30 wood | II | Support: heals on its own | (heavy armor, with its weak bolt) | everything, alone |
| Mangonel | Siege Works | 180 gold, 90 wood | II | Siege, splash | Buildings, clumps that stand still | Anything that reaches it (2-tile minimum range) |
| Marshal (hero) | Hall of Valor | 250 gold, 50 wood | I | Hero | | |

On an open field at equal cost, the triangle is Guards beat Lancers,
Lancers beat Archers and Archers beat Guards. Clerics lose alone but make a
mixed army last. Mangonels lose to any melee unit that reaches them.
`tests/roster.test.ts` checks all of these with real battles.

### Damage and armor types

Final damage is `raw × multiplier`, then reduced by armor as before. The
multiplier depends on the attack type and the target's armor type:

| Attack \ armor | Light | Medium | Heavy | Fortified | Hero |
| --- | --- | --- | --- | --- | --- |
| Normal (Guard, Lancer, Laborer, Brigand) | 1 | **1.5** | 1 | 0.8 | 1 |
| Pierce (Archer, Poacher, Watch Tower) | **1.5** | 0.6 | **1.8** | 0.4 | 0.75 |
| Siege (Mangonel) | 1 | 0.5 | 1 | **2** | 0.5 |
| Magic (Cleric) | 1.25 | 0.75 | **1.5** | 0.35 | 0.5 |
| Hero (Marshal) | 1 | 1 | 1 | 0.7 | 1 |

- **Armor types:**
  - Light: Archer, Cleric, Poacher.
  - Medium: Laborer, Lancer, Mangonel, Brigand.
  - Heavy: Guard, Brigand Chief.
  - Fortified: every building.
- **Cleric prayers:** a Cleric heals the most wounded friendly unit within 5
  tiles that is missing at least 15 HP.
  - Each prayer heals 35 HP (50 with Greater Healing).
  - Each prayer costs 15 of its 180 mana, and prayers come 2 s apart.
  - Mana regenerates at 0.9 per second.
  - It needs no orders and works the same for the computer.
- **Mangonel boulders:** Mangonels target buildings before units. A boulder
  flies to where the target stood when it was thrown, then splashes 1.2 tiles around, full damage at the centre and
  half at the edge, hurting enemies only.
  - Units that keep moving dodge it.
  - A Mangonel can't hit anything within 2 tiles: it backs off first, or,
    on hold position, picks another target.

## Combat rules (current)

All numbers are in `CONFIG.units[*].attack`, `CONFIG.combat` and
`CONFIG.buildings.tower`.

| | HP | Armor | Damage | Every | Range | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Laborer | 220 | 0 | 6 | 1.6 s | melee | Fights only when ordered |
| Guard | 420 | 2 | 14 | 1.3 s | melee | |
| Archer | 300 | 0 | 15 | 1.5 s | 5.5 (7 with Longbows) | Projectile |
| Lancer | 560 | 2 | 17 | 1.5 s | melee | Speed 3.6 (Guards 2.7) |
| Cleric | 280 | 0 | 8 | 1.8 s | 4.5 | Magic bolt; heals |
| Mangonel | 420 | 1 | 45 | 4 s | 2–8 | Boulder, splash 1.2; targets buildings first |
| Watch Tower | 500 | 5 | 16 | 1.2 s | 7 | 110 gold, 80 wood. Fires only once finished. |
| Brigand (neutral) | 300 | 1 | 11 | 1.4 s | melee | |
| Poacher (neutral) | 200 | 0 | 10 | 1.7 s | 5 | Projectile |

- **Damage** is `damage × type multiplier / (1 + 0.06 × armor)`, rounded and
  at least 1. Buildings have 1 armor plus the fortified armor type.
- **Simultaneous blows:** every hit that lands in a tick is applied
  together. If two units kill each other in the same tick, both die. The
  order in which units are processed, and so the player seat, never decides
  who strikes first. Melee hits land at the end of a short wind-up.
  Ranged attacks launch a homing projectile, which is part of the
  simulation state. It deals damage when it arrives and fizzles if the
  target dies or goes into a mine first.
- **Orders:**
  - **Attack** chases its target until it dies. Then the soldiers fight on:
    each takes the nearest enemy it can see (within its sight, e.g. 8
    tiles for a Guard) and keeps going, giving up 8 tiles from where that
    fight began. Laborers stop after the kill, and so does a unit with
    Shift-queued orders, which carries on with its queue.
  - **Attack-move** walks to a point, fights anything met on the way, then
    carries on.
  - **Hold position** never moves, and held units can't be pushed aside.
  - **Move** ignores enemies, which is how you retreat.
  - **Stop** clears the current order.
- **Automatic behavior:**
  - Idle soldiers attack enemies that come within their acquire range:
    6 tiles for Guards, 7 for Archers.
  - Units that are shot from out of sight fight back.
  - Units that engaged on their own give up and walk back after chasing
    8 tiles from where they started. Camp guards give up after 6.
  - Targets are prioritized in this order: units that can fight, then other
    units, then buildings. Within a tier, the nearest is chosen.
- **Death and destruction:** a unit at 0 HP dies, and its cargo is lost.
  A building at 0 HP collapses and frees its tiles, and its training queue
  is refunded. If it was unfinished, its construction cost is lost. Units
  inside a gold mine can't be targeted.
- **Neutral camps:** hostile camps guard the richer mines, mirror-symmetric
  on both halves of the map:
  - **Contested centre mines:** a Brigand Chief, a Brigand and a Poacher,
    worth 105 gold in bounty and 160 hero experience.
  - **Far expansions and the natural expansion:** a Brigand and a Poacher.

  Camps stay home until you come near, so expanding there means clearing
  them first. Killing a camp unit pays its bounty, and your hero earns its
  experience if within 12 tiles. The centre mines sit off the direct route
  between the bases, so armies can march past their camps.
- **Alerts:** when any of your units or buildings is hit, you get "under
  attack" notices with a red minimap ping. They are throttled to one per
  10 s unless the attack is somewhere else. Space jumps to the latest alert.
  In fights, health bars show on every wounded unit.

## Fair seats

Every map is point-symmetric, so neither starting position should be better.
AI-vs-AI playtests showed one was: in the first Phase B run, player 1 won
64% of evenly matched games. A mirror check found the causes. It steps two
identical computers and compares each side with the other rotated 180°,
reporting the first difference. The fixes:

- **Spawns:** the search for free tiles walks its rings rotated for
  footprints in the rotated half. Starting Laborers had appeared on the
  edge side of one Keep and the centre side of the other.
- **Building placement:** the computer's site search scans in mirrored
  order on the rotated side.
- **AI timing:** both computers think on the same ticks. They used to be
  staggered, which gave one a head start in every exchange.
- **Path tiles:** the start and goal tiles of a path use a symmetric rule
  for points that lie exactly on a tile edge, which happens all the time
  around even-sized buildings.
- **Target scans:** idle units look for targets on the same ticks. They
  used to be staggered by entity id, so a camp next to one base reacted
  sooner than its mirror twin.
- **Simultaneous resolution:**
  - Combat blows that land in the same tick are applied together.
  - Unit separation sums all pushes before applying them.

  Neither depends on processing order any more.

The result: two identical computers stay exactly mirrored through the
first minute (tested). Over 24 mirror games player 1 won 12 and player 2
won 11. Single games still differ through tiny floating-point effects, but
there is no systematic bias.

## Orders and movement

- **Shift-queued orders** are part of the simulation state: plain data on
  each unit, saved with the game and identical for every player and the
  computer. When the current order ends, the next one starts. Orders that
  never end on their own (gathering, hold position) wait for you to replace
  them; a queued attack on a target that has died or vanished into the fog is
  skipped.
- **Group pace:** units ordered together while close to each other (within
  5 tiles of the group's centre) march at the slowest member's speed, so a
  mixed group arrives together instead of stringing out. A scattered
  selection is not slowed, and once units start fighting they move at full
  speed.
- **Melee surround:** melee attackers spread around a single target rather
  than queueing behind each other (8 of 8 Guards engage one target in the
  test).

## Fog of war

- **What you see:** each unit and building sees a circle around it. Sight
  ranges in tiles: Laborer 8, Guard 8, Archer 9, hero 10, Keep 10, Watch
  Tower 11, most other buildings 7. A building under construction sees only
  4.
- **Three states on the map:**
  - **Visible:** what you see right now.
  - **Explored:** ground you have seen before, drawn dimmed.
  - **Unexplored:** black.

  The minimap shows the same.
- **What fog hides:** enemy units are shown only while you can see them.
  Enemy buildings are live only while in view. Out of view you see a
  *remembered* building: a dimmed ghost in the 3D view and an outline on the
  minimap, as it was when you last saw it (a foundation stays a foundation).
  A building destroyed out of sight stays in your memory until you look at
  the spot again. Right-clicking a ghost attack-moves to it.
- **Camps in memory:** a camp you have found is marked on the minimap by its
  level (yellow 1, orange 2, red 3). The marker stays until you see the camp
  cleared, so someone else clearing it out of your sight doesn't tell you.
- **The same rules for everyone:** auto-targeting, towers and attack orders
  only work on what the owner can see. A unit ordered to chase a target out
  of sight runs to where it was last seen, and picks the chase back up if it
  spots it again.
- **Saved state:** explored ground is part of the saved game. Visibility is
  recomputed every tick, so a loaded game continues exactly.
- **Watching after the match** lifts the fog. `?fog=0` disables it for
  debugging.

## Upgrades and tech

Research shares the building's training queue, under the same rules: paid
when queued, full refund on cancel, refunded if the building is destroyed. It
is permanent and player-wide, even if the building is later lost.

| Research | At | Cost | Time | Effect | Requires |
| --- | --- | --- | --- | --- | --- |
| Forged Blades | Blacksmith | 100 gold, 50 wood | 40 s | +2 damage: Guards, Archers, Lancers, hero | — |
| Tempered Blades | Blacksmith | 175 gold, 100 wood | 55 s | another +2 damage | Forged Blades, Castle |
| Masterwork Blades | Blacksmith | 250 gold, 150 wood | 70 s | a third +2 damage | Tempered Blades, Citadel |
| Studded Armor | Blacksmith | 100 gold, 50 wood | 40 s | +2 armor: Guards, Archers, Lancers, Clerics, hero | — |
| Plate Armor | Blacksmith | 175 gold, 100 wood | 55 s | another +2 armor | Studded Armor, Castle |
| Gothic Plate | Blacksmith | 250 gold, 150 wood | 70 s | a third +2 armor | Plate Armor, Citadel |
| Bow Saws | Lumber Mill | 75 gold, 50 wood | 30 s | Laborers carry 15 wood instead of 10 | — |
| Mule Carts | Keep | 150 gold, 100 wood | 45 s | Laborers carry 12 gold instead of 10: +20% from every mine | — |
| Longbows | Lumber Mill | 125 gold, 100 wood | 45 s | Archers +1.5 range | Castle |
| Greater Healing | Chapel | 150 gold, 150 wood | 50 s | Clerics heal 50 instead of 35 | Citadel |
| Fortify to Castle | Keep | 300 gold, 200 wood | 60 s | that Keep gets +500 HP; tier II | — |
| Fortify to Citadel | Keep | 400 gold, 300 wood | 80 s | another +500 HP; tier III | Castle |

**Tiers.** Tier II (Castle) unlocks:

- the Lancer;
- the Chapel (150 gold, 100 wood) and Siege Works (160 gold, 140 wood);
- Longbows and the second Blacksmith level.

Tier III (Citadel) unlocks the third Blacksmith level and Greater Healing.
Tiers are player-wide: losing the fortified Keep doesn't undo them.

The Blacksmith (hotkey N) costs 140 gold and 60 wood. It is also needed for
Lancers.

## Heroes

Three heroes with distinct roles, trained at the Hall of Valor (hotkey V;
180 gold, 50 wood).

- **Cost and limits:** each hero costs 250 gold and 50 wood and uses 3
  population. You may have **one hero, or two once you Fortify to Castle**,
  and never two of the same type. Heroes in training count toward the
  limit.

| Hero | Key | Role | Health | Attack | Q (level 1) | W (level 2) | E (level 3) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Marshal | Q | Frontline | 650 | 22 melee | Stormhammer | Battle Cry | Mend |
| Pathfinder | W | Ranged, scout | 540 | 19, range 6 | Volley | Hunter's Mark | Far Sight |
| Sage | E | Caster | 580 (armor 2) | 19, range 5.5 | Flame Burst | Slow | Arcane Ward |

- **Abilities:** each lists its target, range, mana and cooldown in its
  tooltip. Ranks II and III come at hero levels 3 and 5. The hero walks
  into range before casting.

  | Ability | Target | Range / radius | Mana / cooldown | Effect (rank I / II / III) |
  | --- | --- | --- | --- | --- |
  | Stormhammer | enemy unit | 6 | 75 / 10 s | 90 / 140 / 190 damage, 1.5 / 2 / 2.5 s stun |
  | Battle Cry | none | radius 8 | 60 / 30 s | your units deal +15 / 25 / 35% damage for 12 s |
  | Mend | your unit | 6 | 50 / 8 s | heals 150 / 225 / 300 |
  | Volley | a spot | 8 / radius 2.5 | 70 / 12 s | 70 / 105 / 140 damage to every enemy unit there |
  | Hunter's Mark | enemy unit | 8 | 40 / 14 s | takes +20 / 30 / 40% damage from everything, 10 / 12 / 14 s |
  | Far Sight | any spot | anywhere / radius 9 | 50 / 30 s | reveals the area for 10 / 14 / 18 s |
  | Flame Burst | a spot | 7 / radius 2.5 | 80 / 8 s | 95 / 145 / 195 damage to enemy units and buildings there |
  | Slow | enemy unit | 7 | 35 / 9 s | moves and attacks 40 / 50 / 60% slower, 6 / 8 / 10 s |
  | Arcane Ward | your unit | 6 | 55 / 12 s | +5 / 8 / 11 armor for 15 s |

  Buffs show as a colored ring under the unit:

  - Battle Cry: orange
  - Mark: red
  - Slow: blue
  - Ward: cyan

  A stunned unit can't move, attack, cast or use items, and the stun
  interrupts its swing.
- **Experience:** when you kill an enemy unit, each of your heroes within 12
  tiles gets an equal share of its experience. Levels need 200, 500, 900 and
  1400 total, up to level 5. Kills of neutral camp guards count for less as
  a hero grows: 100% at level 1, then 80%, 65%, 50% and 40%. Creeping
  alone can't max a hero; fighting the enemy can.

  | Kill | Experience |
  | --- | --- |
  | Laborer | 15 |
  | Guard or Archer | 35 |
  | Lancer, Mangonel | 55 |
  | Cleric | 45 |
  | Timber Wolf, Poacher, Brigand | 25, 30, 40 |
  | Brigand Chief, Bog Brute | 90, 140 |
  | Enemy hero | 60 × its level |
- **Growth per level:**

  | Hero | Health | Damage | Armor | Mana | Mana regeneration |
  | --- | --- | --- | --- | --- | --- |
  | Marshal | +60 | +3 | +0.5 | 200, +30 per level | 0.6/s |
  | Pathfinder | +45 | +3 | +0.4 | 220, +35 per level | 0.7/s |
  | Sage | +55 | +3 | +0.3 | 260, +45 per level | 1.3/s |
- **Death and revival:** a fallen hero keeps its level, experience **and
  items**.
  - Its Hall of Valor button becomes "Revive". Revival costs 100 + 50 ×
    level gold and takes 20 + 5 × level seconds.
  - The hero returns at full health and mana.
  - A dead hero still counts toward the hero limit.
  - A revival is not counted as a new unit in the statistics.

## Items, camps and map objectives

- **Inventory:** each hero carries three items.
  - Right-click an item on the ground to pick it up. Every item on the
    ground is labelled.
  - Z, X and C use a slot. Right-click a slot to drop its item, for
    example to pass it to another hero.
  - A full inventory refuses new items.
  - Permanent items work while carried. Consumables are used up.

  | Item | Price | Effect |
  | --- | --- | --- |
  | Keen Blade | 160 | +4 damage |
  | Ringmail Vest | 160 | +3 armor |
  | Charm of Vigor | 160 | +150 health |
  | Healing Draught | 75 | use: +300 health |
  | Mana Tonic | 60 | use: +150 mana |
  | Scroll of Return | 100 | use: the hero returns at once to your nearest Keep |
  | Mending Salve | 125 | use: your units within 6 tiles gain 150 health |
  | Swift Boots | camp drop only | +0.6 speed |
  | Gauntlets of Might | camp drop only | +9 damage |
  | Seer's Circlet | camp drop only | +120 mana |
- **Camps** guard the richer mines at three levels; each map places them
  (see [Maps](#maps-and-map-control)). When the last guard of
  a camp dies, it drops an item where it fell. Selecting a guard shows its
  camp's level and drop.

  | Level | Where | Guards | Drops |
  | --- | --- | --- | --- |
  | 1 | Natural expansions | Brigand, Timber Wolf | a consumable |
  | 2 | Far expansions; Rivercross lair | Brigand Chief, Brigand, Poacher (lair: Chief, two Wolves, Poacher) | a tier-1 item (lair: tier 2) |
  | 3 | Rich mines; Highland lair | Bog Brute, Brigand Chief, Poacher (lair: two Brutes, Poacher) | a tier-2 item (Boots, Gauntlets or Circlet) |

  A *lair* guards no mine; it is there for the hero's experience and the
  item. The level-2 lair drops a top-tier item; the level-3 lair has harder
  guards than a level-3 mine camp for the same drop. Mirrored camps drop the
  same item. The small mine beside each base stays unguarded: a camp there
  mauled Laborers in testing.
- **Trading Posts** (two) sell the first seven items to any hero standing
  within 4 tiles. Select the Post and press the item's key (Q, W, E, R, T,
  Y, D).
- **Healing Fountains** (two) heal every unit within 5 tiles, any owner, by
  15 health and 3 mana per second.
- **Placement:** Rivercross and Highland Crown place them by hand. On Twin
  Vales they sit on the line of points equally far from both starts, at
  least 9 tiles from any mine. Like mines, they are known from the start.
  They can't be attacked.

## Maps and map control

Maps are data (`src/sim/maps.ts`). Each is authored for one half and
rotated 180° for the other, so both starts get the same distances, mines,
camps and objectives (tested tile for tile). The seed only roughens forest
and lake edges; a map's strategic layout never changes. Pick the map on the
start screen, or with `?map=vales|river|highland`.

**Mines.** Every expansion trades safety against reward:

| Kind | Gold | Miners at once | Typical guard |
| --- | --- | --- | --- |
| Start | 7000 | 2 | none |
| Small (pocket) | 800–3000 | 2 | none |
| Standard | 9000 | 2 | level 1 (natural) or 2 (far) |
| Rich | 14000 | **3** | level 3 |

A rich mine supports a third miner, so one Keep there earns half as much
again. It is shown larger on the minimap and labelled *Rich* when selected.
A mine panel also says *Guarded* when you know of a camp beside it.

**The maps** (walking distance in tiles from the Keep door; the enemy Keep
is 86–94 away on all three):

| Map | Idea | Safe | Natural | Contested | Rich |
| --- | --- | --- | --- | --- | --- |
| **Twin Vales** | Open valleys split by ridges with gaps; many routes, little to hold. | tiny 800 at 10 | 21 (camp 1) | far mine behind the forest at 33 (camp 2) | centre flank at 44 (camp 3) |
| **Rivercross** | A river runs corner to corner; three fords are the only crossings. Holding a ford holds a route. | pocket 3000 at 16 | 15 (camp 1) | ford mine at 36 and far mine at 43 (camp 2); a level-2 lair; Trading Post and Fountain on your bank | centre at 31 beside the middle ford (camp 3) |
| **Highland Crown** | A walled plateau in the centre, entered by two ramps that face the flanks. | pocket 3000 at 19 | 17 (camp 1) | flank mine at 39 (camp 2); Trading Post on the low road | on the crown at 52 (camp 3), with a Fountain; a level-3 lair below the wall |

What the layouts are for:
- **Rivercross:** the rich mine is close but sits on the main crossing,
  where the armies meet.
- **Highland Crown:** the rich mines are the furthest walk, but the plateau
  is easy to defend from its two ramps.
- **Every map:** a safe pocket mine lets a cautious player expand without a
  fight.

**Exploration and information.**
- **Remembered buildings:** see [Fog of war](#fog-of-war). What you know of
  the enemy is what you last saw, for you and the computer alike.
- **Outrider** (Barracks, R; 70 gold, 1 population):
  - a fast (4.3) scout with 12 sight, the widest of any unit;
  - 180 health, and it never picks fights on its own.
- **Signal Flare** (Keep, F; 25 gold, once every 40 s per player): lights
  up an 8-tile circle anywhere for 8 s. It works through the minimap too.
- **Sighting cues:**
  - The first time you see each enemy building, a notice says so and the
    minimap pings yellow. An enemy Keep is called out as *a base or an
    expansion*.
  - Three or more enemy soldiers coming into view gives *Enemy army
    sighted*, at most every 25 s.
  - Space jumps to the latest cue.
- **Camp markers:** found camps are marked on the minimap by level until
  you see them cleared.

## Saving, settings and usability

### Saving

- **Where:** the menu (F10) saves to three slots in the browser, or exports
  the match to a `.json` file. Matches also autosave every two minutes of
  play and whenever you leave or hide the page. The start screen offers
  Continue (the newest save), and Load reads a slot or a file.
- **What a save holds:**
  - the whole simulation: every unit's orders and Shift-queue, carried
    resources, construction, training and research queues, attack wind-ups
    and projectiles in flight, heroes with their items, cooldowns and buffs,
    camps, items on the ground, explored ground and remembered buildings;
  - what each player sees at that moment;
  - commands issued since the last tick;
  - the computer's complete state (memory, plans, journal);
  - your camera and control groups.

  A loaded match continues exactly as it would have. A test saves a match
  between two computers at three points and compares 90 seconds of play
  byte for byte against the unsaved original.
- **Versions:** every save carries a format version. Saves from older
  versions are upgraded one step at a time by a migration table. A save is
  refused with a plain reason, never half-loaded, when it:
  - comes from a newer version;
  - is too old to upgrade;
  - is damaged;
  - is missing parts;
  - uses an unknown map.

  A full or disabled browser storage is reported, not thrown.

### Settings (start screen or menu)

| Tab | What you can change |
| --- | --- |
| Audio | mute, master, effects (construction, training, combat), alerts (attacks, sightings, result) |
| Graphics | shadows, rendering resolution (50–100%), health bars: wounded and selected / always / selected only |
| Camera | scroll speed, zoom speed, scrolling at the screen edge |
| Interface | interface size (80–160%), colour-blind friendly teams, pause when the window loses focus |
| Controls | the key of every command, building, camera and interface action |

- **Changes and storage:** changes apply at once and are stored in the
  browser, versioned like saves. A missing or odd value falls back to its
  default, so a settings file from another version never blocks the game.
- **Rebinding:** click an action, then press the new key. A key already in
  use swaps with it, so two actions never share one. Number keys, Esc, F1
  and F10 are fixed. Train, research, ability and item keys follow the
  command card. The command card and its tooltips show the keys you chose.
- **Colour-blind teams:**
  - Teams become blue and orange.
  - Health bars run blue, yellow, magenta instead of green to red.
  - Every health bar carries a tab in its owner's colour.
  - On the minimap your units are squares, enemies diamonds and neutral
    guards circles.
  - The summary charts draw the opponent dashed.
- **Sound:** short synthesized cues for now; original sound is Phase G.

### Tooltips, tutorial, summary

- **Tooltips:** hovering a command shows one styled tooltip in place of the
  browser's small delayed one. It lists the name and key, the cost in
  gold, wood or mana, what the command does, and what stands in the way
  (in its own colour, kept current as money comes in).
- **Tutorial:** eleven short steps on Twin Vales against a computer that
  never attacks. It covers the camera, selecting, gold, wood, a Laborer, a
  Farm, a Barracks, Guards, a control group, attack-move and clearing a
  camp. Each step waits for you to actually do it, glows the button to
  press and shows progress. Any step can be skipped.
- **Match summary:**
  - Charts of gold and wood gathered, army size, Laborers and army value
    over the match, from a sample of both sides every 30 seconds.
  - A table: income per minute, bounty, most Laborers and largest army,
    units trained and lost (by type), enemies destroyed, buildings, camps
    cleared, upgrades and heroes.

## Look and sound

Everything is original and procedural: low-poly models from primitives,
painted ground, and synthesized sound. There are no asset files.

### Visual identity

- **Silhouette first:**
  - Every unit type has its own outline: Laborers in straw hats, Guards
    with tall kite shields and crests, Archers with pointed hoods and
    bows.
  - Lancers and Outriders are long because they are mounted, and the
    Mangonel is the widest unit.
  - Heroes stand about 1.4 times taller than anyone on foot, with a banner
    on their back and a faint ring at their feet.
  - The Brigand Chief is a bigger, horned Brigand.

  `tests/visuals.test.ts` measures every model: any two of your unit types
  differ by at least 8% in width, height or length, and the role
  proportions hold.
- **Team colour where it reads:** torsos, shields, crests, hoods, barding,
  banners, pennants and building roofs (tested for every unit and
  building). With colour-blind teams on, all of it switches to the blue and
  orange pair.
- **Animation:**
  - Units face where they move, what they hit, what they build and the
    mine they work.
  - Walkers lean into their stride and riders rock with the gallop.
  - Each way of attacking has its own motion: a melee wind-up and strike,
    a bow drawn level and loosed, a staff raised overhead then thrust, a
    throwing arm cranked back then whipped over.
  - Struck units flinch, the dead topple and sink, and banners flutter.
- **Work you can see:** pick, axe and hammer swing at the work. Wood chips
  fly, felled trees burst, dust rises where Laborers hammer, carried gold
  and logs show on their backs, and buildings rise out of their
  scaffolding.
- **Building states:**
  - under 60% health a building smokes;
  - under 30% it burns;
  - while it trains or researches, a pale plume rises from it;
  - when it falls it collapses into a heap of rubble that fades after half
    a minute.
- **Terrain:** water is one surface cut out by a softened mask, with a
  sandy bank and a dark bed, so lakes and rivers have rounded shores
  instead of tile steps. Fords and ramps are bare dirt, and cliffs are
  boulder ridges.
- **Restraint:**
  - Sparks are small and brief, at most 160 at a time.
  - Smoke is translucent, drawn beneath selection rings, and never writes
    depth, at most 90 puffs.
  - Health bars, orders and selection are drawn on a 2D overlay above
    everything.
  - Settings › Graphics › Effects "Reduced" halves the sparks and drops
    the purely ambient smoke, keeping only what tells you something.
- **Interface:**
  - The selection panel shows a role glyph for each unit (shield, bow,
    lance, cross, catapult, eye, crown, flame…) on its team colour, so a
    mixed group reads without colour.
  - The health strip follows the colour-blind setting.

### Sound

- **Five categories, each with its own volume** (Settings › Audio, with
  a master volume and mute):

  | Category | What it covers |
  | --- | --- |
  | Alerts | Attacks (a horn for the base, drums for an army in the field), hero fallen, mine collapsed, population blocked, sightings, victory and defeat |
  | Combat | Swings, clashes, bow shots and arrow hits, spells and heals, siege launches and impacts, deaths, buildings collapsing |
  | Economy and construction | Chopping, falling trees, picks at a worked mine, hammering at a site, gold and wood deliveries, buildings finished, units trained, research done, level-ups, items |
  | Interface | Clicks, errors, and acknowledgements when you select (Laborers, soldiers, heroes) or give an order (move, attack, work) |
  | Ambience | A quiet bed of wind and the odd bird |

- **Placed in the world:** a sound on the map comes from where it
  happens. It is louder near the centre of the view, quieter further out,
  silent far away, and panned left or right. Alerts and interface sounds
  are never placed.
- **No leaks:** you only hear what you could see. Fights and siege fire
  in the fog are silent, and so is the enemy's economy. Your own units are
  heard being hit anywhere. A test plays a whole match and checks every
  placed sound against the viewer's sight.
- **Readable in a battle:** each sound has a minimum gap before it can
  repeat, and at most 14 play at once (alerts and interface excepted).
  A big fight becomes a texture, and an alert still cuts through.

## Architecture

TypeScript and Vite, with three.js for 3D rendering. three.js is the only
runtime dependency.

```
src/sim/      deterministic simulation (no DOM access)
  config.ts     all balance and tuning values
  types.ts      serializable GameState (plain JSON data)
  game.ts       Game: state + derived caches, entity lifecycle, fixed step()
  commands.ts   validated player commands, group-move formation slots
  gathering.ts  harvest state machine (toNode → waiting → working → toDropoff)
  movement.ts   path following, unit separation, stuck recovery
  pathfinding.ts  grid A* (8-way, no corner cutting) + line-of-sight smoothing
  nav.ts        derived passability grid, footprints, connected components
  maps.ts       hand-designed maps as data (mines, camps, lairs, objectives, terrain features)
  mapgen.ts     builds a point-symmetric map from its definition
  rng.ts        seeded PRNG + hash/value noise
  construction.ts placement checks, construction model, cancel/refund
  production.ts training queues, population reservation, rally, refunds
  combat.ts     targeting, attack orders, wind-up/cooldown, projectiles, armor, death
  outcome.ts    defeat, victory, draw, surrender
  vision.ts     fog of war: per-player visibility, explored tiles, remembered buildings
  tech.ts       research rules and effective damage / armor / carry
  hero.ts       experience, levels, bounty, abilities, stun and buffs
src/render3d/ three.js view (reads state, never writes it)
  cameraRig.ts  angled RTS camera; screen <-> ground conversion
  world.ts      scene, terrain props, entity views and animation, picking, previews
  models.ts     low-poly primitive models (Laborer, Keep, Farm, Mill, mine, trees)
  overlay.ts    2D overlay: health/mana/progress bars, mine pips, floating numbers
  fog.ts        fog-of-war texture injected into every lit material's shader
  groundTexture.ts  procedurally painted ground texture
src/input/    mouse/keyboard → selection, camera, placement, Commands
src/ui/       DOM HUD, command card, minimap, objectives checklist, start/menu/end screens
src/ai/       computer opponent (computer.ts) and its building placement (placement.ts)
tests/        vitest suites for simulation rules
```

Key decisions:

- **Fixed timestep.** The simulation runs at 20 ticks/s, independent of frame
  rate. The renderer interpolates unit positions between ticks. Long frame
  gaps, such as a backgrounded tab, are clamped, so the game never
  fast-forwards.
- **Commands are the only input to the simulation.** The human UI and AI both
  submit the same validated `Command` objects. A player can only command their
  own units.
- **Serializable, deterministic state.** `GameState` is plain JSON. Derived data
  (the nav grid) is rebuilt on load. The tests check that the same seed and the
  same commands produce identical state, and that a save/load mid-match then
  continues identically. This is the foundation for saves and replays.
- **3D sits on a 2D simulation.** Gameplay stays on a ground plane. A
  simulation point `(x, y)` in tiles maps to world `(X = x, Y = height,
  Z = y)`, with one world unit per tile. The renderer is a pure view:
  - **Picking** projects unit bodies to the screen and ray-casts
    buildings, mines and instanced trees. It falls back to the tile under the
    cursor.
  - **Box selection** projects each unit to the screen and tests it against
    the rectangle.
  - **Placement** converts the cursor to the ground with a ray-plane
    intersection.
- **Movement.** Paths are planned on the tile grid and smoothed with
  clearance-aware line-of-sight checks. Units push each other apart, with
  moving units displacing idle ones. Harvesting workers pass through other
  units, as in classic RTS games, so mining traffic doesn't jam. A unit that
  stops making progress re-plans, and units can never step into blocked
  ground.

## Research summary: why our own foundation

Before choosing a stack, I looked at standalone open-source RTS projects and
libraries. Warcraft III mods, custom maps, and anything that needs Blizzard
data were excluded.

| Project | What it is | License | Verdict |
| --- | --- | --- | --- |
| [OpenRA](https://github.com/OpenRA) | C#/SDL engine for classic Westwood RTS games | GPL-3.0; official mods need the original game files | **Ideas only.** Its trait-based actors and order system are good references. The license and the C# desktop stack don't fit a permissively licensed browser game. |
| [0 A.D. / Pyrogenesis](https://docs.wildfiregames.com/pyrogenesis/md__home_docker_jenkins_workspace_technical_docs_LICENSE.html) | C++ RTS with JS gameplay scripts, gather/build economy | Code GPL-2.0+, art CC BY-SA 3.0 | **Ideas only.** Its gatherer, drop-off and formation designs are a useful reference. GPL code and share-alike art would bind our distribution. |
| Glest / MegaGlest, Warzone 2100, Spring/Recoil | Desktop RTS engines | GPL family | Same as above: reference only. |
| [OpenFrontIO](https://github.com/unique-coder-124/OpenFrontIO) | TypeScript browser RTS | (not adopted) | Territory-control design with no worker economy. Not relevant. |
| SC_Js | Canvas StarCraft clone | Relies on copyrighted assets (removed) | **Excluded.** |
| [Recast/Detour](https://salsa.debian.org/games-team/recastnavigation/-/blob/master/License.txt) | Navmesh library | zlib | Permissive, but it's a C++ 3D navmesh tool and too heavy for a tile RTS. **Not needed.** |
| [three.js](https://github.com/mrdoob/three.js) | WebGL 3D library | MIT | **Adopted** (pinned to 0.179.1) for the 3D view. The MIT license only asks that its copyright notice stays with copies of the library. The bundled build keeps that notice. |
| Babylon.js | WebGL 3D engine | Apache-2.0 | A viable alternative. three.js won because it is lighter and we only need rendering, not physics or engine services. |

Decision: write our own small foundation. The whole simulation is
under 2,000 lines of focused code. Owning it keeps determinism,
serialization, and the separation of simulation, rendering, input and AI
under our control. No third-party code or assets are included, so there are
no copyleft obligations. Every model is built from primitives in
`src/render3d/models.ts`, and the ground texture is painted in code. Dev
dependencies (Vite, Vitest, TypeScript) are MIT or Apache-2.0 and don't ship
in the bundle. `npm audit` flags advisories in Vitest's dev-only internals,
which are never shipped to players.

## Verification

- **Automated (`npm test`):** pathfinding (detours, enclosed goals, no corner
  cutting); units never standing on blocked ground; group moves ending on
  distinct spots; resource conservation; mine slot limits and the throughput
  cap; mine and tree depletion with retargeting; unreachable trees being
  skipped; command ownership; map symmetry and reachability; determinism;
  save/load continuity; a 4-minute, 40-worker stress run that checks for
  stalled workers.
  - **Construction:** placement validity, pay-on-arrival, failure reasons,
    pushing units off the site, pause and resume, cancel refunds, Lumber Mill
    trip shortening, and builders returning to their job.
  - **Production:**
    - Pay-on-queue and reserve-on-start.
    - Refusals with reasons: too poor, wrong building, unfinished building,
      full queue, missing Lumber Mill.
    - Cancel refunds.
    - Waiting at the population cap and resuming once a Farm is built.
    - Capacity loss, with in-progress items keeping their reservation.
    - Destroyed-building refunds.
    - Rally onto a mine.
    - Ownership checks.
  - **Combat:**
    - Armor math.
    - Chase and kill, with the hit count matching damage and HP.
    - Attack rate matching the cooldown.
    - Projectiles that land on arrival, and that fizzle when their target dies.
    - Units in mines can't be targeted.
    - Building destruction frees tiles and refunds the queue.
    - Auto-acquire, leash and return, and fighting back.
    - Move ignoring enemies, attack-move resuming, hold never moving or
      being pushed.
    - Workers don't auto-attack, and nothing can attack allies or resources.
    - The tower fires only when finished, and melee units route around walls.
    - A 10-vs-10 brawl resolves with no stuck units.
    - Camps are symmetric, stay idle, and return home after their leash.
    - Determinism and save/load hold mid-fight.
  - **Match rules:** elimination, unfinished buildings still counting,
    same-tick draw, surrender, final outcomes, neutrals, statistics.
  - **Computer opponent:**
    - Builds a working base in 6 minutes: Keep, Farms, Barracks, Lumber
      Mill, 10+ Laborers and 5+ soldiers, with at most 2 idle workers.
    - Beats a passive player, and wipes out a raid on its Keep.
    - A full Hard-vs-Easy match ends decisively, and resources never go
      negative.
    - Deterministic.
  - **Fog of war:**
    - Sight circles, and explored ground remembered.
    - Unseen units can't be targeted, while remembered buildings can be
      attacked.
    - Ordered pursuit chases to the last-seen spot.
    - Each side starts seeing only its own base.
    - Every unit can see as far as it can acquire and shoot.
    - Save/load continues exactly with fog.
  - **Strategic depth:**
    - Research: pay on queue, effects on current and future units, tier II
      needing tier I and the Castle (which adds HP), no duplicates, cancel
      refunds, permanent after the building is lost, Bow Saws carry.
    - Hero: one per player; revived at its level for the scaled cost and
      time; experience and level-ups from nearby kills only; bounty.
    - Stormhammer: walks into range, spends mana, damages, stuns (no moving
      or attacking), cooldown enforced.
    - Battle Cry: level-gated, nearby allies only, expires.
    - Mend: heals own units only.
    - Camps include a Brigand Chief.
  - **Growth (integration):** a scripted build order on the real map, using
    only player commands, goes from 5 to 21 Laborers, builds a Farm, and
    expands with a second Keep at the nearby expansion mine, which then
    receives 200+ gold deliveries. Gold accounting is exact the whole way.
  - **Camera math:** the ground→screen→ground round trip at every zoom level,
    zoom keeping the point under the cursor fixed, and pan bounds.
- **Scripted 3D browser checks (Playwright, headless Chromium, software
  WebGL):**
  - In the 3D view: box, click, Shift and double-click selection; hover
    picking of the mine and of individual trees; right-click gather;
    placement preview on invalid and valid ground; cursor→ground accuracy
    (within 0.001 tile); a full Farm build; zoom and pan; the debug overlay;
    no console errors.
  - Production UI: train hotkeys, the queue panel with click-to-cancel, rally
    by right-click, Barracks placement, the Archer locked until a Lumber Mill
    is finished, the population-blocked notice, and Guards and Archers
    walking to the rally flag.
  - Combat:
    - Box-selecting an army, hovering an enemy, and A+click attack.
    - A 10-unit army clearing a Brigand camp with no losses.
    - Wounded health bars, toppling deaths, and hit sparks.
    - Arrows in flight from Archers and the tower.
    - Building a tower with the T hotkey, and a held Archer defending
      beside it.
    - The "base under attack" alert, with no console errors.
  - A typical scene draws in about 110 draw calls and 154k triangles.
  - The same flows were checked in 2D during Milestone 1: control groups,
    the idle-worker hotkey, and the depletion notice and idle count.
- **AI-vs-AI matches (headless, 12 games, outside the test suite):** every
  game ended decisively, at 10–20 minutes of game time and 1–2 s of real
  time per game. The stronger difficulty won most matchups:
  - Hard beat Easy 2 of 2.
  - Hard beat Normal 3 of 4.
  - Normal beat Easy 3 of 4.

  Both mirror matches went to player 0, which may be a slight seat bias to
  investigate in Phase E.
- **Scripted browser checks for Milestone 4:**
  - The start screen pauses the game, and choosing a difficulty starts that
    match.
  - The objectives checklist ticks off as you play.
  - F10 opens the menu and pauses.
  - Surrendering shows the defeat screen with the right reason and
    statistics, and "Play again" starts a new match.
  - Destroying the enemy shows the victory screen.
  - A Normal AI beat a passive player at 7:40 and showed the elimination
    screen, and "Keep watching" works.
  - No console errors.
- **AI-vs-AI with Milestone 5 (headless, outside the test suite):** in 6
  games, every one ended decisively in 15–16 minutes.
  - Hard beat Easy twice, Hard beat Normal twice, and Normal beat Easy.
  - Both AIs reached hero level 4–5, and Normal and Hard researched up to
    tier II.
  - In one Hard-vs-Normal game, both heroes cast all three abilities, fell 3
    times each and were revived, and both sides earned camp bounties.
- **Scripted browser checks for Milestone 5:**
  - Fog renders as visible, dimmed and black, on the minimap too, and a
    scout reveals the map as it moves.
  - Through the real UI: building a Hall of Valor (V) and a Blacksmith (N),
    training the hero (Q), Forged Blades (Q), Fortify to Castle (W), and
    seeing the Castle model.
  - F2 selects the hero, and Battle Cry and Mend show as locked at level 1.
  - Stormhammer is cast with Q and a click, shows its cooldown, and spends
    mana.
  - Clearing a camp gave 160 experience and 105 gold in bounty.
  - No console errors.
- **Phase A (automated, `npm test`, 112 tests):**
  - Shift-queued waypoints run in order. A queued order on an idle unit
    starts at once. A plain order or Stop clears the queue. One Laborer
    builds two Shift-placed Farms in turn, then returns to its mine.
  - Group pace applies to compact groups only.
  - 8 Guards surround one target, and all 8 engage.
  - Objectives: progress counts are cumulative, and each step ticks off
    once.
  - The AI routes around a known camp, and remembers an army it saw go into
    the fog.
- **Phase A in the browser (scripted, headless):**
  - Right-drag moved the camera, and a plain right-click still gave a move
    order.
  - Shift+right-clicks queued a gather and a move behind the current order,
    and the dashed route lines rendered.
  - The gold objective ticked off with an "Objective complete" notice.
  - The command card now fits a Laborer's full build list (the Blacksmith
    button used to be clipped), and costs no longer overlap labels.
  - No console errors.
- **Phase A balance playtest (`npm run playtest`):** seven computer openings
  in a round robin, on 2 maps, from both seats (84 games, all on Hard rules
  and decisions).

  | Opening | Won | Lost | No result | Avg minutes |
  | --- | --- | --- | --- | --- |
  | standard | 14 | 10 | 0 | 14.4 |
  | rush | 3 | 21 | 0 | 13.4 |
  | eco | 23 | 1 | 0 | 13.7 |
  | turtle | 15 | 8 | 1 | 15.8 |
  | mass | 10 | 13 | 1 | 14.1 |
  | archers | 6 | 18 | 0 | 13.7 |
  | guards | 12 | 12 | 0 | 14.8 |

  - **Fixed along the way:**
    - Waves searched the nearest mine instead of the enemy start.
    - Waves fought every camp on the lane, because both centre camps sat
      on the direct route.
    - The AI attacked blind into armies it had seen.
    - An extra-Barracks rule for floating gold inverted the difficulty
      order.
    - With those fixed: Hard beats Normal 3–0 (plus one 30-minute
      stalemate), Normal beats Easy 4–0, and Hard beats Easy 3–1.
  - **Tuning:** the natural expansion now has a camp, and a Keep takes 110 s
    to build (was 60 s).
  - **Healthy:** Guards against Archers is 2–2 head to head, and a mixed
    army beats a single unit type. Turtling is viable but not dominant.
    Games last 12–20 minutes.
  - **Still dominant:** expanding early and attacking later in one big wave
    (eco, 23–1). Rushes cannot punish it. One mine saturates at about 10
    Laborers, so a lean build gains no army advantage, and the defender
    fights at home with reinforcements.
- **Phase B (automated, `npm test`):** `tests/roster.test.ts` covers:
  - the type table;
  - cost-equal battles for the counter triangle: Guards beat Lancers,
    Lancers beat Archers, Archers beat Guards, Archers beat Clerics, Lancers
    and Guards beat Mangonels;
  - tier requirements with refusal reasons, and the Citadel;
  - Cleric healing (most wounded first, never enemies, mana, cooldown,
    Greater Healing);
  - Mangonel splash, minimum range and dodging, and its building damage;
  - Mule Carts and Longbows;
  - the computer adapting its mix.

  `tests/ai.test.ts` checks that building placement is mirror-symmetric
  between seats.
- **Phase B in the browser (scripted):**
  - Barracks hotkey E queued a Lancer.
  - C started Chapel placement.
  - A Cleric healed a wounded Guard.
  - A Mangonel's boulder hit.
  - The new models render: Lancer, Cleric, Mangonel, Chapel, Siege Works,
    Citadel.
  - The start screen fits.
  - No console errors.
- **Phase B balance playtest (`npm run playtest`, 224 games):** eight
  computer strategies in a round robin, on 4 maps, from both seats, all
  with Hard decisions.
  - Four are development paths: standard (adaptive), rush, eco and turtle.
  - Four are fixed army compositions:
    - classic: Guards and Archers, never fortifies;
    - knights: Lancer-heavy;
    - holy: Guards with Clerics;
    - siege: Guards and Archers with Mangonels.

  | Strategy | Won | Lost | No result | Avg minutes |
  | --- | --- | --- | --- | --- |
  | standard | 27 | 27 | 2 | 15.9 |
  | rush | 2 | 52 | 2 | 13.8 |
  | eco | 53 | 3 | 0 | 14.3 |
  | turtle | 31 | 25 | 0 | 16.1 |
  | classic | 30 | 24 | 2 | 15.7 |
  | knights | 25 | 28 | 3 | 16.1 |
  | holy | 29 | 25 | 2 | 15.9 |
  | siege | 21 | 34 | 1 | 14.8 |

  - **Seats:** player 1 won 105 and player 2 won 113. Before the fair-seat
    fixes it was 63–47, and 64% among evenly matched strategies.
  - **Compositions:** among the six non-eco, non-rush strategies, the best
    record is 60% (turtle). Head to head the results are non-transitive:
    classic beats knights, knights beats siege, siege beats standard,
    standard beats holy, holy beats classic. Several army compositions and
    development paths are viable.
  - **Found and fixed along the way:**
    - Mangonels had a 0.55-tile radius, which left them wedged in one-tile
      gaps or unable to move from their spawn tile. Units are now all under
      half a tile, and a test checks it.
    - Mangonels shot at moving soldiers instead of buildings.
    - The computer researched Mule Carts at 2:00, which blocked Laborer
      training.
  - **Still open:** the Phase A finding stands. Expanding early and
    attacking late in one big wave (eco) wins 95%, and a rush can't punish
    it.
- **Phase C (automated, `npm test`, 149 tests):** `tests/heroes.test.ts`
  covers:
  - hero choice, the one/two hero limit and the no-duplicates rule;
  - revival that keeps level, experience and items;
  - creep experience pacing;
  - Volley, Hunter's Mark, Slow, Arcane Ward, Flame Burst on buildings,
    Far Sight reveal and expiry, and abilities belonging to their own hero;
  - pickup, a full inventory, permanent stat items, dropping, and each
    consumable;
  - camp drops and their mirroring;
  - Trading Post range and price, and that it can't be attacked;
  - Fountain healing;
  - a computer hero picking up loot.

  The map test checks that the Posts and Fountains are mirrored and
  reachable. Counter battles now fight from both sides.
- **Phase C in the browser (scripted):**
  - The Hall shows Marshal, Pathfinder and Sage, and W trained a
    Pathfinder.
  - A selected Trading Post lists its stock, and Q bought a Keen Blade for
    the hero next to it.
  - The hero card shows that hero's own abilities and three item slots.
  - Q plus a click cast Volley on the ground (mana 220 → 150).
  - Right-clicking a labelled Healing Draught picked it up.
  - The detail panel switches to two columns for heroes.
  - No console errors.
- **Phase C balance (computer games):**
  - **Heroes matter:** across all strategies, the no-hero strategy won 4
    and lost 59. Against the standard computer it lost 8 of 8, and heroes
    that skip camps still beat no heroes 6–1.
  - **Map activity matters less:** standard vs the same without camps or
    shopping went 5–3, plus a 30-minute stalemate.
  - **No hero choice dominates:** in the first wide run (288 games)
    Marshal-first won 41–21 and Sage-first 23–39. The Sage died far more
    often, so it got more health and armor, more mana regeneration, and a
    larger, cheaper Flame Burst. After that: Marshal 12–10, Pathfinder
    11–12, Sage 10–13, holy 12–10.
  - **Compositions stay viable:** standard 41–21, siege 40–21, knights
    36–27, classic 31–28, holy 29–30.
  - **Difficulty order:** Hard won 20 of 24 against Easy and Normal on six
    maps from both seats.
  - **Seats:** identical computers split 5–5 over ten maps. The strategy
    runs leaned slightly toward player 2 (153–123), which is within noise
    but worth watching.
- **Phase D tests** (`tests/maps.test.ts`), run on every map:
  - Exact point symmetry of terrain, trees, mines, camps, lairs and
    objectives.
  - Mirrored walking distances from both Keeps to every mine and objective.
  - Risk and reward: rich mines carry level-3 camps and lie further than
    the natural mine, and an unguarded mine is near home.
  - Rivercross: the fords are the only crossings. Highland Crown: the
    ramps are the only way onto the plateau.
  - A rich mine works three miners at once.
  - A building destroyed out of sight stays remembered until you look.
  - A camp counts as cleared only once you have seen it cleared.
  - Signal Flare reveal, cost, expiry and cooldown.
  - The Outrider's sight and its passive stance.
  - A Hard computer finds the enemy base within 6 minutes on each map.
- **A bug the maps exposed:** on Rivercross the computer's Barracks
  builder stood wedged in a one-tile gap between two buildings and never
  arrived. The straight-line check padded its samples sideways as well as
  forward, so the builder could not step along the gap. A builder whose
  move had failed also re-issued the move every tick, which reset the
  failure, so it never gave up. Both are fixed: the padding applies only
  along the direction of travel, and a failed move to the same goal is no
  longer retried. Gatherers had the same retry loop.
- **Phase D in the browser (scripted, Rivercross):**
  - The start screen lists the three maps with their descriptions.
  - With the Keep selected, F plus a minimap click on the enemy base fired
    a flare (gold 500 → 475, cooldown set). The notices read "Enemy Lumber
    Mill spotted", "Enemy Farm spotted" and "Enemy army sighted", with
    yellow minimap pings.
  - After the flare faded, the enemy base stayed as 6 remembered ghosts in
    the fog.
  - R on a Barracks trained an Outrider.
  - No console errors.
- **Phase D balance (computer games):** 4 openings, 3 maps, 4 seeds, both
  seats (144 games, all Hard):

  | Map | standard | rush | eco | turtle |
  | --- | --- | --- | --- | --- |
  | Twin Vales | 13 | 3 | **21** | 10 |
  | Rivercross | 7 | 2 | 10 | **17** |
  | Highland Crown | 13 | 1 | 13 | **15** |

  Each map rewards a different plan:
  - **Twin Vales:** the open map favours the fast expansion.
  - **Rivercross:** holding the fords with towers wins.
  - **Highland Crown:** sits between the two.

  Overall:
  - Rush won only 6 of 72, the open Phase A item below.
  - 19 games hit the 30-minute limit, mostly turtle or eco mirrors on
    Rivercross.
  - Seats went 56–69 toward player 2, close to the Phase C lean (153–123)
    and still within noise. Worth watching.
- **Phase E tests** (`tests/strategy.test.ts`, 21 tests):
  - **Profiles:**
    - A style changes only the plan; every decision-quality setting comes
      from the difficulty.
    - A Random style is fixed by the seed, and every style comes up.
  - **Advantage:** it is off by default and every option is labelled a
    cheat. +25% adds exactly a quarter to deliveries while the same gold
    leaves the mine.
  - **Recovery:**
    - After a massacre (2 Laborers left), it is back to 90% within 2.5
      minutes.
    - A lost Keep is rebuilt even when broke, by clearing camps for the
      bounty.
    - It saves enough gold while its last Keep is below half health.
  - **Laborers:**
    - Hard puts an idle Laborer back to work within a second; Easy within
      its 10 s.
    - A hauler from a Keep-less mine is rehomed.
    - A Laborer scouts the enemy base and goes back to work.
  - **Intel:**
    - Enemy soldiers on its side early make it threatened: no expansion,
      an extra tower.
    - Three enemy towers make it greedy: it expands early.
  - **Fights:**
    - A one-Guard raid draws only some defenders, and Easy waits out its
      reaction time.
    - A wave backs off from a much stronger force before contact, with
      most of it alive.
    - Hard focuses a badly hurt enemy.
    - A hurt hero with nothing to drink leaves to heal.
  - **Styles over a 10-minute match:**
    - The Raider strikes first.
    - The Expander expands no later than anyone and runs three Keeps.
    - The Warden builds the most towers.
    - The Warlord raises a hero first.
  - **Fair information:** an enemy hidden in unexplored fog leaves every
    command the computer issues identical.
- **Phase E in the browser (scripted):**
  - The start screen offers style and advantage choices. Picking Raider and
    +25% reloads with `style=raider&adv=income25`.
  - The top bar reads "skirmish vs Hard · Raider computer · +25% income
    (cheat)", and the computer's player has `incomeBonus` 0.25.
  - The end screen names the opponent and its plan, states the advantage,
    and lists "What the computer did" with times. No console errors.
- **Phase E tuning, from computer games (most runs of 36 or 72 games):**
  - **Hard attacking earlier lost to Normal.** Hard Balanced lost 23–48 to
    Normal Balanced over 72 games. Ablation found the causes:
    - its earlier first attack (attacking a defended base early loses);
    - retreating mid-fight, which got waves cut down (18 units lost in a
      minute);
    - recalling waves over a few enemy units at home;
    - chasing scouting Laborers.

    All four were fixed in the decision logic, not by slowing Hard down.
  - **The difficulty ladder** (`playtest/ladder.playtest.ts`, both seats,
    3 maps × 3 seeds, the same style on both sides):

    | Style | Hard vs Normal | Normal vs Easy |
    | --- | --- | --- |
    | Balanced | 9–8 (1 draw) | 16–2 |
    | Raider | 10–8 | 11–7 |
    | Expander | 12–6 | 17–1 |
    | Warden | 6–12 | 10–3 (5 draws) |
    | Warlord | 14–4 | 16–2 |
    | **Total** | **51–38** | **70–15** |

    Normal clearly beats Easy. Hard beats Normal overall, but only by a
    small margin, and not for the Warden. In computer-vs-computer mirrors
    defence dominates (a Normal-vs-Normal Balanced run left a third of
    games drawn at 30 minutes), so better decisions on both sides largely
    cancel out. Hard's sharper reactions, focus fire and reinforcements
    should matter more against a person. That still needs human
    playtesting.
  - **Styles** (round robin, all Hard, 3 maps × 4 seeds, both seats, 240
    games):

    | Style | Won | Lost |
    | --- | --- | --- |
    | Expander | 65 | 30 |
    | Warlord | 55 | 40 |
    | Raider | 45 | 51 |
    | Balanced | 44 | 50 |
    | Warden | 29 | 67 |

    The first version was more lopsided (Expander 77–19, Warden 20–75).
    Retuning helped: towers now guard mines, the Expander has smaller
    waves, the Warden fewer towers. Economy still decides most computer
    games, so the Expander leads and the Warden trails. Seats split
    118–120.
- **Phase F tests:**
  - `tests/save.test.ts` (10):
    - a match saved three times continues byte-identical, computers
      included;
    - orders, cargo, queues, combat, heroes, fog, memory and projectiles
      survive;
    - a command given just before saving is carried out;
    - damaged, foreign, too-new and incomplete saves are refused with
      reasons;
    - slots and a full storage are handled.
  - `tests/settings.test.ts` (8): default keys, swap on rebind, fixed
    keys, cleaning stored maps and settings, and settings from a newer
    version.
  - `tests/tutorial.test.ts` (2): a player doing what each step says goes
    through all eleven in order, and the tutorial computer never attacks.
    Writing this test found a real trap: the Farm step counted a placed
    Farm, so a Laborer pulled away left it unfinished and the Guards later
    stalled at the population cap. The step now waits for the Farm to
    finish.
- **Phase F in the browser (scripted):**
  - The start screen offers Tutorial, Continue, Load and Settings.
  - In Settings, interface size 125%, colour-blind teams and Attack on Q
    were stored. The HUD grew, health bars turned blue, and the command
    card showed Attack Q.
  - Hovering Barracks showed the styled tooltip.
  - Save to slot 1, then Load, reloaded the match at the same tick with
    the same entities and a saved control group.
  - A save marked format 99 was refused on the start screen: "comes from
    a newer version of the game".
  - The tutorial advanced on camera movement and selection.
  - The end screen drew all five charts.
  - No console errors.
- **Phase G tests:**
  - `tests/audio.test.ts` (9): every cue has a category; fights and siege
    fire in the fog are silent while the same fight in sight is heard; the
    enemy's economy is silent; alerts; distance fade and pan;
    acknowledgements; and a real match checked tick by tick for placed
    sounds outside the viewer's sight.
  - `tests/visuals.test.ts` (4): silhouette differences, role
    proportions, team colour on every unit and building, banners, and an
    animation per attack style.
- **Phase G in the browser:** a staged battle beside a damaged Barracks,
  a lineup of every unit and both teams, and the lakes and river of Twin
  Vales and Rivercross. No console errors. Smoke and animation timing need
  a real GPU to judge: software rendering here runs at 2–3 frames a
  second.
- **Not yet done:** human playtesting of feel and pacing, and frame-rate
  measurement on real GPUs. Software WebGL only manages ~2–3 fps, which says
  nothing about real hardware.

## Roadmap

1. ~~Economic sandbox~~ (done)
1.5. ~~3D foundation~~ (done): angled camera, 3D models, picking, placement
   preview. The simulation, commands and tests carried over unchanged.
2. ~~Base construction and production~~ (done)
3. ~~Combat foundation~~ (done)
4. ~~Complete skirmish~~ (done)
5. ~~Strategic depth~~ (done): fog of war, upgrades and tech, a hero with
   levels and abilities, rewarding neutral camps.

Phase A, first pass (done): Shift-queued orders with route lines,
grab-to-pan camera, group pace, objectives that register reliably, AI
routing and memory, a readable command card, and an AI-vs-AI balance
harness.

Phase B (done): one complete faction.

- Damage and armor types and the Guard → Lancer → Archer → Guard triangle.
- The Lancer, Cleric and Mangonel, with the Chapel and Siege Works.
- A Citadel tier with tier III research.
- Mule Carts and Longbows.
- A computer that composes and adapts its army.
- Fair seats.

Phase C (done): heroes, items and neutral objectives.

- Three heroes with distinct roles and a second hero with the Castle.
- Abilities with clear targets, ranges, costs and cooldowns.
- Experience pacing for neutral kills.
- A three-slot inventory with ten original items.
- Camps at three levels that drop items.
- Trading Posts and Healing Fountains.
- Explicit death and revival rules.
- A computer that uses all of it.

Phase D (done): map control and exploration.

- Three hand-designed maps with rivers and fords, a walled plateau and
  ramps, pocket, natural, far and rich mines, and lairs.
- Fog that remembers enemy buildings as last seen, and camps until seen
  cleared.
- The Outrider, the Signal Flare and sighting cues.
- A computer that scouts, weighs expansions by reward and attacks what it
  remembers.

Phase E (done): smarter computer and difficulty settings.

- Difficulty × style, with Random fixed by the seed.
- Economic recovery and stray-Laborer handling.
- Scouting with a posture taken from intel.
- Proportional defence, judged retreats, regrouping and reinforcement.
- Raids and focus fire.
- An optional, labelled income advantage.
- A decision journal on the end screen.

Phase F (done): saving, settings and usability.

- Versioned saves that continue a match exactly, with slots, an autosave
  and file export.
- Audio, graphics, camera and interface settings, and remappable
  controls.
- Interface scaling, structured tooltips and colour-blind friendly teams.
- An eleven-step interactive tutorial and an end-of-match summary with
  charts.

Phase G (done): original art, animation and sound.

- Distinct, team-coloured silhouettes, with banners and halos for heroes.
- Animation by attack style, flinches, gallops and work dust.
- Damage, fire and working smoke, and rubble.
- Rounded water.
- Role icons in the interface.
- Five sound categories, placed and fog-respecting, with distinct alerts
  and a reduced-effects option.

Still open from Phase G:

- **Sound is synthesized:** recorded or composed sound, and music, would
  give the game more character.
- **Animation is posed from parts, not rigged:** good at this zoom level,
  stiff up close.
- **Judging the visuals needs a real GPU:** smoke density and animation
  timing should be checked on real hardware.

Still open from Phase F:

- **Saves are kept in browser storage** (about 360 KB each, so a handful
  fit). Export to a file to keep one for good.
- **Interface scaling uses CSS `zoom`.** It works in current Chrome,
  Edge, Safari and Firefox (126+), but very old browsers ignore it.
- **The tutorial covers the basics, not heroes or tech.** The F1 panel and
  tooltips cover the rest.

Still open from Phase E:

- **Hard vs Normal** is a small edge in computer games, and Hard loses with
  the Warden. Human playtests should decide whether Hard feels harder.
- **Style balance:** the Expander is ahead and the Warden behind.
  Expansions decide too much, and a raid that punishes greed better is the
  likely fix.

Still open from Phase D: human playtests of each map's routes and timings,
and long stalemates when both sides turtle on Rivercross.

Still open from Phase A, ideally driven by human playtesting:

- **Early aggression should be able to punish a fast expansion.** Options to
  test:
  - diminishing returns beyond 5 miners, so economy and army trade off;
  - cheaper or faster early units;
  - harassing workers.
- **Opening playtests by people, not only by the AI.**

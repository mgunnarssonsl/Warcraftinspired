"""Ironvale Crown buildings and neutral landmarks (sheets 05, 07). One unit = one tile; entrance toward -Y."""
import math
from blib import mat, sphere, box, lathe, tube, extrude, torus, sheet, lump, curve_tube, pivot
from bkit import (STONE, MORTAR, PLASTER, TIMBER, TIMBER_L, GOLD, IRON, DARK, ground_skirt, stone_wall, round_tower, crenels, gable_roof,
                  cone_roof, window, door, timber_frame, banner, flag_pole, barrel, crate, hay, log_pile, fence, brazier, crown_outline)


def keep(tier=1):
    P = pivot('root')
    k = 1 + (tier - 1) * 0.2
    W = 3.8
    ground_skirt(P, W + 0.1, W + 0.1, seed=3)
    box('footing', (W, W, 0.2), mat('matte', MORTAR), P, at=(0, 0, 0.1), bevel=0.04)
    box('footTop', (W - 0.2, W - 0.2, 0.06), mat('matte', STONE[1]), P, at=(0, 0, 0.23), bevel=0.02)
    base = 0.26
    wh = 0.85 * (1.15 if tier > 1 else 1)
    e = W / 2 - 0.32
    # Curtain walls (the front split by the gatehouse).
    stone_wall('wallN', P, 2 * e, wh, 0.26, (0, e, base), seed=11, faces='ns')
    stone_wall('wallW', P, 0.26, wh, 2 * e, (-e, 0, base), seed=12, faces='ew')
    stone_wall('wallE', P, 0.26, wh, 2 * e, (e, 0, base), seed=13, faces='ew')
    for sx in (-1, 1):
        stone_wall(f'wallS{sx}', P, e - 0.45, wh, 0.26, (sx * (e / 2 + 0.22), -e, base), seed=14 + sx, faces='ns')
    crenels('wallCren', P, 2 * e, 2 * e, base + wh)
    # Gatehouse: portcullis, steps, a banner.
    stone_wall('gate', P, 1.0, wh + 0.4, 0.42, (0, -e - 0.05, base), seed=17, colors=[STONE[2], STONE[0]])
    door('gateDoor', P, (0, -e - 0.27, base), w=0.5, h=0.62, frame=GOLD, wood='#3a2a1c')
    for i in range(-2, 3):
        box(f'portcullis{i}', (0.022, 0.03, 0.55), mat('metal', IRON), P, at=(i * 0.09, -e - 0.33, base + 0.29))
    for i in range(3):
        box(f'step{i}', (0.72 - i * 0.12, 0.18, 0.07), mat('matte', STONE[2]), P, at=(0, -e - 0.42 - (2 - i) * 0.12, 0.2 + i * 0.07), bevel=0.012)
    crenels('gateCren', P, 1.0, 0.42, base + wh + 0.4, at=(0, -e - 0.05), color=STONE[2])
    banner('gateBanner', P, (0, -e - 0.3, base + wh + 0.28), w=0.28, h=0.42)
    # Corner towers.
    tH = 1.55 * k
    for i, (x, y) in enumerate(((-e, -e), (e, -e), (-e, e), (e, e))):
        round_tower(f'tower{i}', P, 0.46, tH, (x, y, base), seed=20 + i)
        crenels(f'towerCren{i}', P, 0, 0, base + tH, at=(x, y), round_r=0.46)
        cone_roof(f'towerRoof{i}', P, 0.5, 0.9 * k, (x, y, base + tH + 0.12), seed=30 + i)
        window(f'towerWin{i}', P, (x, y - 0.48, base + tH * 0.62), w=0.1, h=0.18)
    if tier > 2:
        for i, (x, y) in enumerate(((-e, 0), (e, 0), (0, e))):
            round_tower(f'midTower{i}', P, 0.34, tH * 0.9, (x, y, base), seed=40 + i)
            cone_roof(f'midRoof{i}', P, 0.38, 0.75, (x, y, base + tH * 0.9 + 0.04), seed=45 + i)
    # The great hall and the keep tower.
    hallH = 1.0 * k
    stone_wall('hall', P, 1.9, hallH, 1.5, (0, 0.25, base), seed=50, colors=[STONE[2], STONE[0], STONE[1]])
    gable_roof('hallRoof', P, 1.9, 1.5, 0.75 * k, (0, 0.25, base + hallH), seed=51)
    for x in (-0.55, 0.0, 0.55):
        window(f'hallWin{x}', P, (x, -0.51, base + hallH * 0.58), w=0.13, h=0.24)
    banner('hallBanner', P, (0, -0.53, base + hallH - 0.06), w=0.3, h=0.5)
    cH = (1.2 + (tier - 1) * 0.55) * k
    stone_wall('keepTower', P, 0.86, cH, 0.86, (0, 0.45, base + hallH - 0.2), seed=52)
    crenels('keepCren', P, 0.86, 0.86, base + hallH + cH - 0.2, at=(0, 0.45))
    window('keepWin', P, (0, 0.01, base + hallH + cH * 0.55 - 0.2), w=0.12, h=0.2)
    cone_roof('keepRoof', P, 0.6, 1.0 * k, (0, 0.45, base + hallH + cH - 0.08), seed=53, finial=False)
    top = base + hallH + cH + 1.0 * k - 0.08
    lathe('crownBand', [(0.13, 0.0), (0.135, 0.06)], mat('gold', GOLD), P, at=(0, 0.45, top - 0.02), segs=16)
    for i in range(5):
        a = 2 * math.pi * i / 5
        lathe(f'crownPt{i}', [(0.03, 0.0), (0.0, 0.11)], mat('gold', GOLD), P, at=(math.cos(a) * 0.13, 0.45 + math.sin(a) * 0.13, top + 0.04), segs=6)
    if tier > 1:
        for sx in (-1, 1):
            stone_wall(f'wing{sx}', P, 0.5, cH * 0.75, 0.5, (sx * 0.85, 0.5, base + hallH - 0.25), seed=55 + sx)
            cone_roof(f'wingRoof{sx}', P, 0.36, 0.7, (sx * 0.85, 0.5, base + hallH + cH * 0.75 - 0.2), seed=57 + sx)
    for x, y in ((-e, -e), (e, e)):
        flag_pole(f'flag{x}', P, (x, y, base + tH + 1.0 * k), 0.5)
    for sx in (-1, 1):
        banner(f'wallBanner{sx}', P, (sx * 0.95, -e - 0.15, base + wh - 0.05), w=0.22, h=0.4)
        brazier(f'brazier{sx}', P, (sx * 0.65, -e - 0.55, 0.2))
    return P


def farm():
    P = pivot('root')
    ground_skirt(P, 1.9, 1.9, seed=5)
    # Crop field with rows of cabbages, a fence.
    box('field', (1.0, 0.9, 0.06), mat('matte', '#8a6a42'), P, at=(0.35, -0.4, 0.03), bevel=0.02)
    for r in range(4):
        for c in range(4):
            lump(f'crop{r}{c}', 0.075, mat('matte', '#6fae3a' if (r + c) % 2 else '#8cc44a'), P, at=(0.0 + c * 0.22, -0.1 - r * 0.2, 0.1), seed=r * 4 + c, rough=0.25, segs=8, rings=6, sub=0)
    fence('fenceA', P, (-0.15, -0.9), (0.9, -0.9))
    fence('fenceB', P, (0.9, 0.05), (0.9, -0.9))
    # Cottage: stone base, plaster and timber walls, a shingled team roof, a stone chimney.
    stone_wall('cottageBase', P, 1.0, 0.16, 0.8, (-0.35, 0.4, 0.0), seed=60)
    box('cottage', (0.95, 0.75, 0.55), mat('matte', PLASTER), P, at=(-0.35, 0.4, 0.43), bevel=0.02)
    timber_frame('cottageFrame', P, 0.9, 0.52, (-0.35, 0.02, 0.17))
    gable_roof('cottageRoof', P, 0.95, 0.75, 0.42, (-0.35, 0.4, 0.7), seed=61)
    stone_wall('chimney', P, 0.22, 0.6, 0.22, (-0.65, 0.6, 0.7), seed=62)
    box('chimneyTop', (0.26, 0.26, 0.05), mat('matte', STONE[3]), P, at=(-0.65, 0.6, 1.32), bevel=0.01)
    door('cottageDoor', P, (-0.2, 0.0, 0.17), w=0.22, h=0.36, frame=TIMBER, wood='#7a4e2a')
    window('cottageWin', P, (-0.55, 0.0, 0.47), w=0.12, h=0.14, arch=False, shutters=True)
    hay('hayA', P, (0.55, 0.55, 0.0), 0.2)
    hay('hayB', P, (0.2, 0.72, 0.0), 0.15)
    barrel('barrel', P, (-0.85, -0.05, 0.0), 0.1)
    return P


def barracks():
    P = pivot('root')
    ground_skirt(P, 2.9, 2.9, seed=7)
    stone_wall('base', P, 2.3, 0.55, 1.4, (0, 0.25, 0.0), seed=70)
    box('upper', (2.2, 1.3, 0.6), mat('matte', PLASTER), P, at=(0, 0.25, 0.85), bevel=0.02)
    timber_frame('frame', P, 2.1, 0.58, (0, -0.42, 0.56))
    gable_roof('roof', P, 2.2, 1.3, 0.7, (0, 0.25, 1.15), seed=71)
    # A cross gable over the door.
    box('gableWall', (0.9, 0.5, 0.58), mat('matte', PLASTER), P, at=(0, -0.38, 0.84), bevel=0.02)
    from bkit import gable_roof as gr
    import bpy  # noqa: F401
    crossP = pivot('crossGable', P, (0, -0.38, 1.13))
    gr('crossRoof', crossP, 0.55, 0.95, 0.55, (0, -0.38, 1.13), seed=72)
    crossP.rotation_euler = (0, 0, math.pi / 2)
    door('door', P, (0, -0.64, 0.0), w=0.45, h=0.62)
    for sgn in (-1, 1):
        extrude(f'sword{sgn}', [(-0.02, 0), (0.02, 0), (0.02, 0.42), (0, 0.48), (-0.02, 0.42)], 0.02, mat('metal', '#dde3ea'), P, at=(0, -0.66, 0.86), rot=(0, sgn * 0.7, 0), bevel=0.004)
    extrude('crest', crown_outline(0.14, 0.1), 0.025, mat('gold', GOLD), P, at=(0, -0.68, 1.12), bevel=0.003)
    for x in (-0.78, 0.78):
        banner(f'banner{x}', P, (x, -0.47, 1.08), w=0.26, h=0.5)
    for x in (-0.45, 0.45):
        window(f'win{x}', P, (x, -0.45, 0.85), w=0.12, h=0.16, arch=False)
    # Weapon rack and archery butts in the yard.
    box('rack', (0.6, 0.05, 0.05), mat('matte', TIMBER), P, at=(-0.9, -0.9, 0.45), bevel=0.008)
    for i in range(4):
        tube(f'spear{i}', 0.012, 0.012, 0.72, mat('matte', TIMBER_L), P, at=(-1.15 + i * 0.16, -0.88, 0.0), rot=(-0.15, 0, 0), segs=5)
        lathe(f'spearTip{i}', [(0.022, 0.0), (0.0, 0.09)], mat('metal', '#dde3ea'), P, at=(-1.15 + i * 0.16, -0.98, 0.7), rot=(-0.15, 0, 0), segs=5)
    for x in (0.75, 1.1):
        box(f'buttPost{x}', (0.04, 0.04, 0.42), mat('matte', TIMBER), P, at=(x, -0.85, 0.21))
        for r, c in ((0.18, '#efe6d0'), (0.12, '#c8402e'), (0.05, '#efe6d0')):
            lathe(f'butt{x}{r}', [(0.0, 0.0), (r, 0.0), (r, 0.04 + (0.18 - r) * 0.05), (0.0, 0.04 + (0.18 - r) * 0.05)], mat('matte', c), P, at=(x, -0.9, 0.36), rot=(math.pi / 2 - 0.2, 0, 0), segs=16)
    flag_pole('flag', P, (1.05, 0.25, 1.15), 0.55)
    return P


def plank_wall(name, P, w, h, at, rot_z=0.0, color=TIMBER_L, seed=1):
    """A wall of upright planks facing -Y (turned by rot_z), on a dark backing."""
    import random
    rnd = random.Random(seed)
    x0, y0, z0 = at
    c, s = math.cos(rot_z), math.sin(rot_z)
    box(f'{name}Back', (w, 0.06, h), mat('matte', TIMBER), P, at=(x0, y0, z0 + h / 2), rot=(0, 0, rot_z))
    n = max(3, round(w / 0.13))
    for i in range(n):
        dx = -w / 2 + (i + 0.5) * w / n
        hh = h * rnd.uniform(0.97, 1.0)
        shade = color if i % 3 else TIMBER
        box(f'{name}P{i}', (w / n - 0.012, 0.035, hh), mat('matte', shade), P,
            at=(x0 + dx * c + 0.04 * s, y0 + dx * s - 0.04 * c, z0 + hh / 2), rot=(0, 0, rot_z), bevel=0.006, bevel_segs=1)


def hall(name, P, w, d, wall_h, at, roof_h, seed, plank=True):
    """A building body (stone footing, plank or plaster walls) under a gabled roof
    whose ridge runs front to back, so its gable end faces the camera (-Y)."""
    x0, y0, z0 = at
    stone_wall(f'{name}Base', P, w, 0.3, d, (x0, y0, z0), seed=seed)
    if plank:
        box(f'{name}Core', (w - 0.1, d - 0.1, wall_h - 0.3), mat('matte', TIMBER), P, at=(x0, y0, z0 + 0.3 + (wall_h - 0.3) / 2))
        plank_wall(f'{name}Front', P, w - 0.08, wall_h - 0.3, (x0, y0 - d / 2 + 0.06, z0 + 0.3), seed=seed)
        plank_wall(f'{name}Left', P, d - 0.08, wall_h - 0.3, (x0 - w / 2 + 0.06, y0, z0 + 0.3), rot_z=-math.pi / 2, seed=seed + 1)
        plank_wall(f'{name}Right', P, d - 0.08, wall_h - 0.3, (x0 + w / 2 - 0.06, y0, z0 + 0.3), rot_z=math.pi / 2, seed=seed + 2)
    else:
        box(f'{name}Upper', (w - 0.06, d - 0.06, wall_h - 0.3), mat('matte', PLASTER), P, at=(x0, y0, z0 + 0.3 + (wall_h - 0.3) / 2), bevel=0.02)
        timber_frame(f'{name}Frame', P, w - 0.12, wall_h - 0.32, (x0, y0 - d / 2 + 0.02, z0 + 0.3))
    for sx in (-1, 1):
        for sy in (-1, 1):
            box(f'{name}Corner{sx}{sy}', (0.1, 0.1, wall_h - 0.28), mat('matte', TIMBER), P,
                at=(x0 + sx * (w / 2 - 0.03), y0 + sy * (d / 2 - 0.03), z0 + 0.28 + (wall_h - 0.28) / 2), bevel=0.012)
    R = pivot(f'{name}RoofPivot', P, (x0, y0, z0 + wall_h))
    gable_roof(f'{name}Roof', R, d, w, roof_h, (x0, y0, z0 + wall_h), seed=seed + 5)
    R.rotation_euler = (0, 0, math.pi / 2)


def lumbermill():
    P = pivot('root')
    ground_skirt(P, 2.9, 2.9, seed=9)
    # The mill hall at the back left, its gable toward the yard; a log hatch above the door.
    hall('hall', P, 1.45, 1.15, 0.95, (-0.45, 0.55, 0.0), 0.8, seed=90)
    box('doorway', (0.5, 0.05, 0.55), mat('matte', DARK), P, at=(-0.45, -0.04, 0.58))
    box('lintel', (0.62, 0.08, 0.08), mat('matte', TIMBER), P, at=(-0.45, -0.07, 0.88), bevel=0.012)
    tube('logOut', 0.07, 0.07, 0.7, mat('matte', '#a06c3c'), P, at=(-0.45, -0.25, 0.42), rot=(math.pi / 2, 0, 0), segs=10)
    box('hatch', (0.22, 0.05, 0.2), mat('matte', DARK), P, at=(-0.45, -0.05, 1.18))
    banner('banner', P, (0.3, -0.04, 0.92), w=0.2, h=0.36)
    # A water wheel on the right side of the hall.
    lathe('wheelHub', [(0.0, -0.06), (0.08, -0.06), (0.08, 0.06), (0.0, 0.06)], mat('matte', TIMBER), P, at=(0.36, 0.6, 0.5), rot=(0, math.pi / 2, 0), segs=10)
    torus('wheelRim', 0.42, 0.03, mat('matte', TIMBER_L), P, at=(0.36, 0.6, 0.5), rot=(0, math.pi / 2, 0), segs=20, rsegs=4)
    for i in range(8):
        a = 2 * math.pi * i / 8
        box(f'paddle{i}', (0.16, 0.05, 0.42), mat('matte', TIMBER_L), P, at=(0.36, 0.6 + math.cos(a) * 0.2, 0.5 + math.sin(a) * 0.2), rot=(-a + math.pi / 2, 0, 0), bevel=0.006)
    # The open saw yard in front: bench, saw blade, crane.
    box('bench', (1.0, 0.35, 0.1), mat('matte', TIMBER_L), P, at=(0.35, -0.55, 0.45), bevel=0.015)
    for x in (-0.05, 0.75):
        box(f'trestle{x}', (0.08, 0.3, 0.4), mat('matte', TIMBER), P, at=(x, -0.55, 0.2), bevel=0.01)
    lathe('sawBlade', [(0.0, -0.01), (0.27, -0.01), (0.27, 0.01), (0.0, 0.01)], mat('metal', '#cfd5dc'), P, at=(0.45, -0.55, 0.55), rot=(0, math.pi / 2, 0), segs=24)
    for i in range(16):
        a = 2 * math.pi * i / 16
        lathe(f'tooth{i}', [(0.012, 0.0), (0.0, 0.03)], mat('metal', '#cfd5dc'), P, at=(0.45, -0.55 + math.cos(a) * 0.27, 0.55 + math.sin(a) * 0.27), rot=(-a, 0, 0), segs=4)
    tube('logOnBench', 0.075, 0.075, 0.9, mat('matte', '#a06c3c'), P, at=(-0.05, -0.55, 0.57), rot=(0, math.pi / 2, 0), segs=10)
    log_pile('pileA', P, (-0.95, -0.95, 0.0), 3, 0.7, math.pi / 2)
    log_pile('pileB', P, (1.05, 0.0, 0.0), 2, 0.6, 0.0)
    box('crane', (0.1, 0.1, 1.3), mat('matte', TIMBER), P, at=(1.15, -0.85, 0.65), bevel=0.012)
    box('craneArm', (0.7, 0.08, 0.08), mat('matte', TIMBER), P, at=(1.0, -0.85, 1.28), bevel=0.012)
    tube('rope', 0.006, 0.006, 0.36, mat('matte', '#d8c08a'), P, at=(0.72, -0.85, 0.9), segs=4)
    torus('hook', 0.04, 0.012, mat('metal', IRON), P, at=(0.72, -0.85, 0.88), rot=(math.pi / 2, 0, 0), segs=10, rsegs=4)
    flag_pole('flag', P, (-1.25, 0.1, 0.0), 1.4)
    return P


def tower():
    P = pivot('root')
    ground_skirt(P, 1.8, 1.8, seed=13)
    for i in range(6):
        lump(f'rock{i}', 0.14, mat('matte', STONE[i % 4]), P, at=(math.cos(i * 1.1) * 0.55, math.sin(i * 1.1) * 0.55, 0.06), seed=i, rough=0.2, segs=8, rings=6, sub=0)
    round_tower('body', P, 0.48, 1.9, (0, 0, 0), seed=130)
    door('door', P, (0, -0.48, 0.0), w=0.26, h=0.42)
    window('win', P, (0, -0.49, 1.15), w=0.1, h=0.18)
    # Timber gallery, crenels, a team roof.
    lathe('gallery', [(0.0, 0.0), (0.62, 0.0), (0.62, 0.15), (0.0, 0.15)], mat('matte', TIMBER), P, at=(0, 0, 1.88), segs=16)
    crenels('galleryCren', P, 0, 0, 2.03, round_r=0.6, color=TIMBER_L)
    for i in range(4):
        a = i * math.pi / 2 + 0.78
        box(f'roofPost{i}', (0.06, 0.06, 0.45), mat('matte', TIMBER), P, at=(math.cos(a) * 0.5, math.sin(a) * 0.5, 2.25), bevel=0.01)
    cone_roof('roof', P, 0.6, 0.85, (0, 0, 2.45), seed=131)
    banner('banner', P, (0, -0.52, 1.75), w=0.24, h=0.45)
    flag_pole('flag', P, (0, 0, 3.35), 0.4)
    return P


def altar():
    P = pivot('root')
    ground_skirt(P, 2.9, 2.9, seed=15)
    for i in range(3):
        box(f'tier{i}', (2.6 - i * 0.35, 2.4 - i * 0.35, 0.1), mat('matte', STONE[i % 2 + 1]), P, at=(0, 0.05 + i * 0.05, 0.05 + i * 0.1), bevel=0.02)
    for x in (-0.95, 0.95):
        for y in (0.8, -0.35):
            lathe(f'column{x}{y}', [(0.13, 0.0), (0.13, 0.06), (0.1, 0.1), (0.09, 1.15), (0.12, 1.2), (0.14, 1.28), (0.0, 1.28)], mat('matte', STONE[2]), P, at=(x, y, 0.3), segs=12)
        box(f'lintel{x}', (0.32, 1.45, 0.16), mat('matte', STONE[1]), P, at=(x, 0.22, 1.66), bevel=0.02)
        banner(f'banner{x}', P, (x, -0.47, 1.55), w=0.22, h=0.5)
    # The statue: a crowned hero raising a hammer.
    stone = mat('matte', '#d2cab8')
    box('plinth', (0.5, 0.5, 0.35), mat('matte', STONE[1]), P, at=(0, 0.3, 0.48), bevel=0.03)
    lathe('statueLegs', [(0.0, 0.0), (0.12, 0.0), (0.11, 0.3), (0.0, 0.3)], stone, P, at=(0, 0.3, 0.65), segs=10, sub=1)
    lathe('statueBody', [(0.12, 0.0), (0.16, 0.12), (0.15, 0.28), (0.08, 0.34), (0.0, 0.35)], stone, P, at=(0, 0.3, 0.95), segs=12, sub=1)
    sphere('statueHead', 0.085, stone, P, at=(0, 0.3, 1.36), sub=1)
    for i in range(5):
        a = 2 * math.pi * i / 5
        lathe(f'statueCrown{i}', [(0.02, 0.0), (0.0, 0.06)], mat('gold', GOLD), P, at=(math.cos(a) * 0.07, 0.3 + math.sin(a) * 0.07, 1.43), segs=5)
    tube('statueArm', 0.035, 0.03, 0.42, stone, P, at=(0.15, 0.3, 1.2), rot=(0, 0.5, 0), segs=8, sub=1)
    box('statueHammer', (0.12, 0.2, 0.12), stone, P, at=(0.38, 0.3, 1.58), bevel=0.02, sub=1)
    sheet('statueCape', 0.3, 0.38, stone, P, at=(0, 0.42, 1.28), bend=0.05, flare=0.3, cols=4, rows=4, thick=0.02)
    for x in (-0.6, 0.6):
        brazier(f'brazier{x}', P, (x, -0.75, 0.3))
    for i in range(2):
        box(f'step{i}', (0.8, 0.2, 0.08), mat('matte', STONE[2]), P, at=(0, -1.15 + i * 0.18, 0.04 + i * 0.08), bevel=0.012)
    return P


def smithy():
    P = pivot('root')
    ground_skirt(P, 2.9, 2.9, seed=17)
    stone_wall('base', P, 1.7, 0.4, 1.2, (-0.15, 0.25, 0.0), seed=170)
    box('upper', (1.65, 1.15, 0.55), mat('matte', PLASTER), P, at=(-0.15, 0.25, 0.67), bevel=0.02)
    timber_frame('frame', P, 1.6, 0.52, (-0.15, -0.34, 0.41))
    gable_roof('roof', P, 1.7, 1.2, 0.6, (-0.15, 0.25, 0.95), seed=171)
    door('door', P, (-0.35, -0.36, 0.0), w=0.36, h=0.55)
    banner('banner', P, (-0.85, -0.37, 0.88), w=0.22, h=0.42)
    # The forge: a stone chimney with a glowing mouth.
    stone_wall('forge', P, 0.7, 1.75, 0.7, (0.75, 0.3, 0.0), seed=172, colors=[STONE[3], STONE[1]])
    box('forgeMouthFrame', (0.46, 0.06, 0.4), mat('matte', STONE[2]), P, at=(0.75, -0.06, 0.38), bevel=0.03)
    box('forgeFire', (0.34, 0.07, 0.28), mat('glow', '#ff8a2a'), P, at=(0.75, -0.07, 0.36))
    box('chimneyCap', (0.42, 0.42, 0.12), mat('matte', DARK), P, at=(0.75, 0.3, 1.8), bevel=0.02)
    box('anvilBlock', (0.2, 0.12, 0.18), mat('matte', TIMBER), P, at=(0.45, -0.75, 0.09), bevel=0.01)
    extrude('anvil', [(-0.2, 0), (0.12, 0), (0.2, 0.04), (0.12, 0.08), (-0.15, 0.08)], 0.1, mat('metal', IRON), P, at=(0.45, -0.75, 0.18), bevel=0.01)
    barrel('barrelA', P, (1.05, -0.65, 0.0), 0.11)
    barrel('barrelB', P, (-1.0, -0.75, 0.0), 0.11)
    crate('crate', P, (-0.75, -0.95, 0.0), 0.2, 0.4)
    return P


def chapel():
    P = pivot('root')
    ground_skirt(P, 2.9, 2.9, seed=19)
    stone_wall('nave', P, 1.3, 0.95, 1.8, (0, 0.15, 0.0), seed=190, colors=[STONE[2], STONE[0]])
    roofP = pivot('naveRoofPivot', P, (0, 0.15, 0.95))
    gable_roof('naveRoof', roofP, 1.8, 1.3, 0.75, (0, 0.15, 0.95), seed=191)
    roofP.rotation_euler = (0, 0, math.pi / 2)
    for y in (0.6, -0.1):
        for sx in (-1, 1):
            window(f'win{y}{sx}', P, (sx * 0.66, y, 0.55), w=0.12, h=0.34, rot_z=sx * math.pi / 2, frame=STONE[2])
    stone_wall('bell', P, 0.55, 1.6, 0.55, (0, -0.65, 0.0), seed=192)
    box('belfry', (0.32, 0.62, 0.34), mat('matte', DARK), P, at=(0, -0.65, 1.42))
    lathe('bellBody', [(0.03, 0.0), (0.1, 0.05), (0.11, 0.18), (0.0, 0.22)], mat('gold', GOLD), P, at=(0, -0.65, 1.3), segs=12)
    cone_roof('bellRoof', P, 0.38, 0.7, (0, -0.65, 1.62), seed=193, finial=False)
    tube('cross', 0.02, 0.02, 0.35, mat('gold', GOLD), P, at=(0, -0.65, 2.3), segs=6)
    box('crossBar', (0.18, 0.03, 0.03), mat('gold', GOLD), P, at=(0, -0.65, 2.55))
    door('door', P, (0, -0.93, 0.0), w=0.3, h=0.5)
    torus('rose', 0.12, 0.025, mat('matte', STONE[1]), P, at=(0, -0.94, 1.15), rot=(math.pi / 2, 0, 0), segs=16, rsegs=4)
    lathe('roseGlass', [(0.0, 0.0), (0.11, 0.0), (0.0, 0.01)], mat('glow', '#8cf06a'), P, at=(0, -0.95, 1.15), rot=(math.pi / 2, 0, 0), segs=16)
    banner('banner', P, (0.66, 0.25, 0.95), w=0.2, h=0.42, rot_z=math.pi / 2)
    return P


def workshop():
    P = pivot('root')
    ground_skirt(P, 2.9, 2.9, seed=21)
    # The workshop hall: stone and plaster, a wide double door under the gable.
    hall('hall', P, 1.5, 1.25, 1.0, (-0.42, 0.45, 0.0), 0.85, seed=210, plank=False)
    box('doorway', (0.62, 0.05, 0.62), mat('matte', DARK), P, at=(-0.42, -0.19, 0.4))
    for sx in (-1, 1):
        box(f'doorLeaf{sx}', (0.3, 0.04, 0.6), mat('matte', '#6a4226'), P, at=(-0.42 + sx * 0.47, -0.24, 0.4), rot=(0, 0, sx * 0.9), bevel=0.01)
        for z in (0.2, 0.55):
            box(f'doorBand{sx}{z}', (0.3, 0.05, 0.03), mat('metal', IRON), P, at=(-0.42 + sx * 0.47, -0.25, z), rot=(0, 0, sx * 0.9))
    box('lintel', (0.75, 0.09, 0.09), mat('matte', TIMBER), P, at=(-0.42, -0.22, 0.74), bevel=0.012)
    extrude('crest', crown_outline(0.16, 0.11), 0.025, mat('gold', GOLD), P, at=(-0.42, -0.2, 1.05), bevel=0.003)
    banner('banner', P, (0.22, -0.21, 0.95), w=0.2, h=0.38)
    # A chimney with a gear sign.
    stone_wall('chimney', P, 0.24, 1.75, 0.24, (-0.95, 0.85, 0.0), seed=213)
    torus('gear', 0.14, 0.035, mat('metal', IRON), P, at=(0.32, -0.2, 0.62), rot=(math.pi / 2, 0, 0), segs=16, rsegs=4)
    for i in range(8):
        a = 2 * math.pi * i / 8
        box(f'cog{i}', (0.05, 0.05, 0.06), mat('metal', IRON), P, at=(0.32 + math.cos(a) * 0.18, -0.2, 0.62 + math.sin(a) * 0.18), rot=(0, -a, 0))
    # The yard: a catapult being built under a gantry.
    for x in (0.55, 1.2):
        box(f'gantryPost{x}', (0.1, 0.1, 1.05), mat('matte', TIMBER), P, at=(x, -0.5, 0.52), bevel=0.012)
    box('gantryBeam', (0.8, 0.1, 0.1), mat('matte', TIMBER), P, at=(0.88, -0.5, 1.06), bevel=0.012)
    tube('chain', 0.008, 0.008, 0.4, mat('metal', IRON), P, at=(0.88, -0.5, 0.66), segs=4)
    cx, cy = 0.88, -0.55
    for x in (-1, 1):
        box(f'frameRail{x}', (0.07, 0.8, 0.07), mat('matte', TIMBER_L), P, at=(cx + x * 0.22, cy, 0.2), bevel=0.01)
    box('frameUpright', (0.07, 0.07, 0.7), mat('matte', TIMBER_L), P, at=(cx, cy + 0.15, 0.5), rot=(-0.5, 0, 0), bevel=0.01)
    for x in (-0.3, 0.3):
        lathe(f'wheel{x}', [(0.0, -0.025), (0.15, -0.025), (0.15, 0.025), (0.0, 0.025)], mat('matte', TIMBER), P, at=(cx + x, cy - 0.25, 0.15), rot=(0, math.pi / 2, 0), segs=12)
    lathe('spareWheel', [(0.0, -0.025), (0.2, -0.025), (0.2, 0.025), (0.0, 0.025)], mat('matte', TIMBER), P, at=(-1.05, -0.85, 0.25), rot=(0.3, math.pi / 2, 0), segs=14)
    torus('spareTyre', 0.2, 0.02, mat('metal', IRON), P, at=(-1.05, -0.85, 0.25), rot=(0.3, math.pi / 2, 0), segs=16, rsegs=4)
    crate('crateA', P, (1.05, 0.5, 0.0), 0.24)
    crate('crateB', P, (1.15, 0.15, 0.0), 0.2, 0.5)
    barrel('barrel', P, (0.65, 0.75, 0.0))
    flag_pole('flag', P, (1.3, -1.05, 0.0), 1.3)
    return P


def shop():
    P = pivot('root')
    ground_skirt(P, 2.9, 2.9, seed=23)
    box('floor', (2.4, 2.1, 0.08), mat('matte', '#c8b898'), P, at=(0, 0, 0.04), bevel=0.02)
    for x, y in ((-1.0, 0.6), (1.0, 0.6), (-1.0, -0.55), (1.0, -0.55)):
        box(f'post{x}{y}', (0.1, 0.1, 1.2), mat('matte', TIMBER), P, at=(x, y, 0.6), bevel=0.012)
    for i in range(8):
        box(f'awning{i}', (0.27, 1.45, 0.035), mat('matte', '#f3ead4' if i % 2 else '#c23a32'), P, at=(-0.945 + i * 0.27, 0.03, 1.25), rot=(-0.3, 0, 0), bevel=0.005)
        extrude(f'awningFlap{i}', [(-0.13, 0), (0.13, 0), (0, -0.14)], 0.01, mat('matte', '#f3ead4' if i % 2 else '#c23a32'), P, at=(-0.945 + i * 0.27, -0.67, 1.04))
    box('counter', (1.7, 0.35, 0.45), mat('matte', TIMBER_L), P, at=(0, -0.35, 0.3), bevel=0.02)
    box('counterCloth', (1.75, 0.4, 0.05), mat('matte', '#8a2a28'), P, at=(0, -0.35, 0.55))
    for i in range(5):
        lathe(f'coins{i}', [(0.0, 0.0), (0.06, 0.0), (0.06, 0.03 + (i % 3) * 0.02), (0.0, 0.03 + (i % 3) * 0.02)], mat('gold', '#ffd34a'), P, at=(-0.6 + i * 0.3, -0.35, 0.58), segs=12)
    box('backWall', (1.9, 0.1, 0.9), mat('matte', TIMBER_L), P, at=(0, 0.62, 0.5), bevel=0.02)
    crate('crateA', P, (-0.6, 0.3, 0.08), 0.26)
    crate('crateB', P, (0.55, 0.3, 0.08), 0.22, 0.4)
    barrel('barrel', P, (1.2, -0.85, 0.0), 0.12)
    for x in (-1.0, 1.0):
        box(f'lantern{x}', (0.1, 0.1, 0.14), mat('matte', TIMBER), P, at=(x, -0.65, 1.0), bevel=0.01)
        box(f'lanternLight{x}', (0.07, 0.11, 0.1), mat('glow', '#ffc25a'), P, at=(x, -0.65, 1.0))
    box('signArm', (0.45, 0.04, 0.04), mat('matte', TIMBER), P, at=(1.2, -0.55, 1.35))
    lathe('sign', [(0.0, -0.02), (0.17, -0.02), (0.17, 0.02), (0.0, 0.02)], mat('matte', '#5a3a22'), P, at=(1.35, -0.55, 1.12), rot=(math.pi / 2, 0, 0), segs=16)
    for i in range(3):
        lathe(f'signCoin{i}', [(0.0, -0.01), (0.05, -0.01), (0.05, 0.01), (0.0, 0.01)], mat('gold', '#ffd34a'), P, at=(1.31 + i * 0.03, -0.58, 1.08 + i * 0.03), rot=(math.pi / 2, 0, 0), segs=12)
    return P


def fountain():
    P = pivot('root')
    ground_skirt(P, 1.9, 1.9, seed=25)
    lathe('base', [(0.0, 0.0), (1.0, 0.0), (0.95, 0.12), (0.0, 0.12)], mat('matte', STONE[2]), P, segs=24)
    lathe('basin', [(0.82, 0.1), (0.86, 0.1), (0.86, 0.4), (0.8, 0.42), (0.74, 0.38), (0.74, 0.15)], mat('matte', STONE[0]), P, segs=24)
    lathe('water', [(0.0, 0.0), (0.75, 0.0), (0.0, 0.0)], mat('glow', '#3ad6c8'), P, at=(0, 0, 0.33), segs=24)
    lathe('pillar', [(0.1, 0.0), (0.08, 0.4), (0.35, 0.5), (0.3, 0.58), (0.0, 0.58)], mat('matte', STONE[2]), P, at=(0, 0, 0.3), segs=16)
    lathe('upperWater', [(0.0, 0.0), (0.3, 0.0), (0.0, 0.0)], mat('glow', '#5ae8da'), P, at=(0, 0, 0.86), segs=16)
    lathe('spout', [(0.08, 0.0), (0.0, 0.35)], mat('glow', '#9afff2'), P, at=(0, 0, 0.88), segs=10)
    for sx in (-1, 1):
        box(f'archLeg{sx}', (0.16, 0.16, 1.3), mat('matte', STONE[2]), P, at=(sx * 0.55, 0.55, 0.75), bevel=0.03)
    torus('arch', 0.55, 0.08, mat('matte', STONE[2]), P, at=(0, 0.55, 1.4), rot=(math.pi / 2, 0, 0), segs=20, rsegs=6, scale=(1, 1, 1))
    sphere('gem', 0.1, mat('glow', '#3affb0'), P, at=(0, 0.55, 1.95), scale=(1, 0.6, 1.4))
    return P


# ---- gold mines ---------------------------------------------------------------------------
def mine(look='standard'):
    """A gold mine on its 3x3 footprint: rocky hill, timber entrance, rails, an ore cart, lanterns.
    Pivots nugget0-5 hold the gold piles (shown by what is left); 'mouth' marks the entrance glow."""
    P = pivot('root')
    big = {'rich': 1.15, 'tiny': 0.72, 'small': 0.85}.get(look, 1.0)
    depleted = look == 'depleted'
    ground_skirt(P, 2.8, 2.8, seed=7)
    greys = ['#b4aa9a', '#a39a8c', '#c2b8a6', '#968c7e']
    for i in range(8):
        a = math.pi + math.pi * i / 7
        lump(f'hillRock{i}', 0.55 * big * (0.8 + (i % 3) * 0.15), mat('matte', greys[i % 4]), P, at=(math.cos(a) * 0.9 * big, 0.25 - math.sin(a) * 0.55 * big + 0.1, 0.3 * big), seed=200 + i, rough=0.18, segs=12, rings=9)
    lump('hill', 0.95 * big, mat('matte', greys[0]), P, at=(0, 0.35, 0.5 * big), scale=(1.25, 0.95, 0.85), seed=210, rough=0.15, segs=16, rings=12)
    lump('moss', 0.5 * big, mat('matte', '#7ea83e'), P, at=(-0.35, 0.5, 1.12 * big), scale=(1.2, 1.0, 0.3), seed=211, rough=0.25, segs=12, rings=8)
    if not depleted:
        import random
        r = random.Random(look)
        for i in range(10 if look == 'rich' else 6):
            box(f'vein{i}', (0.45 * big, 0.05, 0.06), mat('gold', '#ffc63a'), P, at=(r.uniform(-0.7, 0.7) * big, r.uniform(-0.05, 0.25), 0.35 + r.uniform(0, 0.7) * big), rot=(r.uniform(-0.4, 0.4), 0, r.uniform(-0.7, 0.7)), bevel=0.015)
            sphere(f'nuggetVein{i}', 0.04, mat('gold', '#ffd34a'), P, at=(r.uniform(-0.6, 0.6) * big, r.uniform(-0.1, 0.1), 0.3 + r.uniform(0, 0.6) * big), segs=6, rings=4)
    # Timber entrance.
    ew, eh = 0.78 * max(0.85, big), 0.88 * max(0.85, big)
    for sx in (-1, 1):
        box(f'post{sx}', (0.14, 0.14, eh), mat('matte', '#8a5a30'), P, at=(sx * ew / 2, -0.52, eh / 2), bevel=0.02)
        box(f'bracket{sx}', (0.17, 0.17, 0.1), mat('metal', IRON), P, at=(sx * ew / 2, -0.53, eh + 0.05), bevel=0.01)
        box(f'strut{sx}', (0.08, 0.08, eh * 0.5), mat('matte', '#7a4e2a'), P, at=(sx * (ew / 2 - 0.12), -0.53, eh * 0.78), rot=(0, sx * 0.7, 0), bevel=0.01)
    box('lintel', (ew + 0.34, 0.16, 0.16), mat('matte', '#8a5a30'), P, at=(0, -0.52, eh + 0.06), bevel=0.02)
    box('mouthDark', (ew - 0.1, 0.1, eh - 0.05), mat('matte', '#140e08'), P, at=(0, -0.45, eh / 2))
    mouth = pivot('mouth', P, (0, -0.5, eh / 2))
    mouth['size'] = [ew - 0.15, eh - 0.1]
    if depleted:
        for i in range(3):
            box(f'plank{i}', (ew + 0.06, 0.04, 0.1), mat('matte', '#9a6a3a'), P, at=(0, -0.58, 0.2 + i * 0.26), rot=(0, (i - 1) * 0.12, 0), bevel=0.008)
        box('plankX', (0.06, 0.04, eh * 0.9), mat('matte', '#7a4e2a'), P, at=(0, -0.6, eh * 0.45), rot=(0, 0.7, 0), bevel=0.008)
    # Rails, sleepers and an ore cart.
    for sx in (-0.18, 0.18):
        box(f'rail{sx}', (0.035, 1.05, 0.03), mat('metal', '#5a5e64'), P, at=(sx, -1.02, 0.04))
    for i in range(5):
        box(f'sleeper{i}', (0.52, 0.07, 0.025), mat('matte', '#6a4628'), P, at=(0, -0.6 - i * 0.22, 0.015), bevel=0.006)
    box('cart', (0.42, 0.34, 0.22), mat('matte', '#7a5232'), P, at=(0, -1.15, 0.2), bevel=0.02, taper=(1.12, 1.12))
    box('cartRim', (0.46, 0.38, 0.035), mat('metal', IRON), P, at=(0, -1.15, 0.31), bevel=0.008)
    for sx in (-0.19, 0.19):
        for sy in (-1.03, -1.27):
            lathe(f'cartWheel{sx}{sy}', [(0.0, -0.02), (0.065, -0.02), (0.065, 0.02), (0.0, 0.02)], mat('metal', '#3a3a40'), P, at=(sx, sy, 0.07), rot=(0, math.pi / 2, 0), segs=10)
    for sx in (-1, 1):
        box(f'lantern{sx}', (0.1, 0.1, 0.14), mat('matte', '#3a2a1c'), P, at=(sx * (ew / 2 + 0.13), -0.62, eh * 0.75), bevel=0.012)
        box(f'lanternLight{sx}', (0.075, 0.11, 0.1), mat('matte' if depleted else 'glow', '#3a2a1c' if depleted else '#ffc25a'), P, at=(sx * (ew / 2 + 0.13), -0.62, eh * 0.75))
    if look in ('standard', 'rich', 'start', 'depleted'):
        box('winchPost', (0.08, 0.08, 0.5), mat('matte', '#8a5a30'), P, at=(0.95, -0.75, 0.25), bevel=0.01)
        lathe('winch', [(0.0, -0.15), (0.09, -0.15), (0.09, 0.15), (0.0, 0.15)], mat('matte', '#c8a46a'), P, at=(0.95, -0.75, 0.45), rot=(0, math.pi / 2, 0), segs=12)
        torus('winchWheel', 0.12, 0.02, mat('metal', IRON), P, at=(1.11, -0.75, 0.45), rot=(0, math.pi / 2, 0), segs=14, rsegs=4)
    if look == 'rich':
        box('cranePost', (0.1, 0.1, 1.6), mat('matte', '#8a5a30'), P, at=(-0.95, -0.55, 0.8), bevel=0.015)
        box('craneArm', (0.7, 0.08, 0.08), mat('matte', '#8a5a30'), P, at=(-0.7, -0.55, 1.58), bevel=0.012)
        tube('craneRope', 0.006, 0.006, 0.45, mat('matte', '#d8c08a'), P, at=(-0.42, -0.55, 1.1), segs=4)
        box('craneBucket', (0.2, 0.2, 0.15), mat('matte', '#7a5232'), P, at=(-0.42, -0.55, 1.05), bevel=0.02)
        crate('richCrate', P, (-0.75, -1.15, 0.0), 0.24, 0.3)
    if look != 'tiny':
        fence('fence', P, (0.75, -1.35), (1.3, -0.85), '#9a6a3a')
    if look in ('standard', 'start'):
        barrel('barrel', P, (-0.95, -0.95, 0.0), 0.11)
    if not depleted:
        piles = [(0, -1.15, 0.34), (-0.09, -1.1, 0.36), (0.1, -1.2, 0.35), (-0.5, -0.85, 0.08), (0.55, -1.0, 0.08), (0.45, -1.25, 0.1)]
        for i, (x, y, z) in enumerate(piles):
            np_ = pivot(f'nugget{i}', P, (x, y, z))
            for k in range(3):
                sphere(f'gold{i}_{k}', 0.06 - k * 0.012, mat('gold', '#ffd34a'), np_, at=(x + (k - 1) * 0.045, y + (k % 2) * 0.03, z + 0.02 + k * 0.015), scale=(1, 1, 0.8), segs=6, rings=4)
    return P

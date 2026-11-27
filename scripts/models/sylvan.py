"""Thornwild leaf-cloaked spearmen (sheet 16): the Wolfkeeper (and Wolf Rider) and the
Shapeshifter's warrior form share a lean elven build - long dark hair and pointed ears,
layered bark armor shaped like leaves, bark greaves, and a great cascading cloak of
oak leaves from the shoulders to the calves - with a tall barbed spear held upright.
The Wolfkeeper wears a grey wolf pelt and the team sash; the Shapeshifter has amber
eyes and glowing green vine markings, like its panther form."""
import math
from blib import mat, sphere, box, lathe, tube, extrude, torus, sheet, pivot, lump, curve_tube
from figure import Figure, HIP, KNEE, ANKLE, SHOULDER, SH_X, ELBOW_DROP, WRIST_DROP, NECK, HEAD
from common import face, hand_at, arm_x, leaf, leaf_outline, cloth_legs
import wild as WD

BARK = '#7a5232'
BARK_D = '#553620'
BARK_L = '#9a6c42'
SKIN = '#d9a67c'
HAIR = '#2a1a12'
LEAVES = ['#6f8f2e', '#86a83a', '#5a7a26', '#9ab446', '#4f6b22']
VINE_GLOW = '#7dff5a'


def big_leaf(name, parent, at, w, h, color, rot):
    """A large oak-ish leaf: a leaf outline with a midrib, hanging tip-down."""
    extrude(name, leaf_outline(w, h), 0.008, mat('matte', color), parent, at=at, rot=rot, bevel=0.002)


def leaf_cloak(F, length=0.55, flare=0.1, rows=5, seed=1):
    """Rows of big leaves hung from the shoulders around the back and sides, widening as they fall."""
    import random
    rnd = random.Random(seed)
    ch, b = F['chest'], F.bulk
    for r in range(rows):
        t = r / (rows - 1)
        z = NECK - 0.02 - t * length
        radius = (0.15 + flare * t) * b
        n = 9 + r
        for i in range(n):
            a = math.pi * (0.05 + 0.9 * i / (n - 1))  # 0..pi = around the back (+Y)
            ang = a + rnd.uniform(-0.05, 0.05)
            x, y = math.cos(ang) * radius, math.sin(ang) * radius * 0.95 + 0.02
            w = (0.1 + 0.03 * t) * b
            h = 0.2 + 0.05 * t
            # Leaves face outward from the body, tip down, a little tilted.
            big_leaf(f'cloak{r}_{i}', ch, (x, y, z), w, h, rnd.choice(LEAVES), rot=(math.pi + rnd.uniform(-0.15, 0.15), 0, ang - math.pi / 2 + rnd.uniform(-0.1, 0.1)))
    # The cloak's shoulder line: a ring of leaves over the collar.
    for i in range(12):
        a = 2 * math.pi * i / 12
        big_leaf(f'collarLeaf{i}', ch, (math.cos(a) * 0.12 * b, math.sin(a) * 0.1 * b, NECK - 0.0), 0.08 * b, 0.13, LEAVES[i % len(LEAVES)], rot=(math.pi - 0.9, 0, a - math.pi / 2))


def body(F, glow=False, pelt=False):
    b = F.bulk
    hips, spine, ch, h = F['hips'], F['spine'], F['chest'], F['head']
    # Legs: dark leggings, bark greaves with ridges, wrapped boots.
    cloth_legs(F, pants='#3e3424', boots=BARK_D, wraps='#5a4630')
    for s, sx in (('R', -1), ('L', 1)):
        x = 0.075 * b * sx
        sh, th = F[f'shin.{s}'], F[f'thigh.{s}']
        lathe(f'greave.{s}', [(0.05 * b, 0.0), (0.056 * b, 0.06), (0.052 * b, 0.13), (0.046 * b, 0.15)], mat('matte', BARK), sh, at=(x, -0.005, ANKLE + 0.02), segs=12, angle=math.pi * 1.2, rot=(0, 0, math.pi * 0.9), sub=1)
        for i in range(3):
            box(f'greaveRidge{s}{i}', (0.012, 0.012, 0.12), mat('matte', BARK_D), sh, at=(x + (i - 1) * 0.022, -0.054 * b, ANKLE + 0.09), bevel=0.004)
        big_leaf(f'kneeLeaf.{s}', sh, (x, -0.055 * b, KNEE + 0.03), 0.07, 0.1, LEAVES[1], rot=(math.pi, 0, 0))
        big_leaf(f'thighLeaf.{s}', th, (x + sx * 0.03, -0.04, HIP - 0.02), 0.08, 0.15, LEAVES[2], rot=(math.pi, 0, sx * 0.3))
    # Torso: a lean body under layered bark plates shaped like leaves.
    lathe('torso', [(0.0, 0.0), (0.11 * b, 0.0), (0.125 * b, 0.07), (0.14 * b, 0.15), (0.13 * b, 0.21), (0.08, 0.245), (0.0, 0.25)], mat('matte', '#3e3424'), ch, at=(0, 0, 0.52), scale=(1, 0.8, 1), segs=16, sub=1)
    for row, (z, n, w, hgt) in enumerate(((0.72, 3, 0.09, 0.12), (0.64, 4, 0.08, 0.11), (0.56, 3, 0.085, 0.1))):
        for i in range(n):
            x = (i - (n - 1) / 2) * w * 0.85
            big_leaf(f'barkPlate{row}{i}', ch, (x, -0.118 * b - row * 0.004, z), w, hgt, [BARK, BARK_L, BARK_D][(i + row) % 3], rot=(math.pi + 0.15, 0, 0))
    torus('vineBelt', 0.12 * b, 0.016, mat('matte', BARK_D), spine, at=(0, 0, 0.5), scale=(1, 0.84, 1), segs=20, rsegs=5)
    for i in range(6):
        big_leaf(f'skirtLeaf{i}', hips, ((i - 2.5) * 0.045 * b, -0.11 * b, HIP + 0.03), 0.07, 0.16, LEAVES[i % len(LEAVES)], rot=(math.pi, 0, (i - 2.5) * 0.08))
    if glow:
        # A team armband, and glowing vines across the bark plates, as on the panther.
        torus('armband', 0.05 * b, 0.012, mat('team'), F['upperarm.L'], at=(arm_x(F, 'L'), 0, SHOULDER - 0.1), segs=14, rsegs=4)
        for sx in (-1, 1):
            curve_tube(f'chestVine{sx}', [(sx * 0.02, -0.13 * b, 0.74), (sx * 0.09, -0.125 * b, 0.66), (sx * 0.05, -0.13 * b, 0.58), (sx * 0.1, -0.12 * b, 0.52)], 0.006, mat('glow', VINE_GLOW), ch, taper=[0.4, 1.0, 1.0, 0.4])
    # Arms: bare forearms with bark bracers, leaf pauldrons.
    for s in 'RL':
        x = arm_x(F, s)
        ua, fa, hd = F[f'upperarm.{s}'], F[f'forearm.{s}'], F[f'hand.{s}']
        tube(f'upper.{s}', 0.046 * b, 0.04 * b, ELBOW_DROP, mat('matte', '#3e3424'), ua, at=(x, 0, SHOULDER - ELBOW_DROP), segs=10, sub=1)
        tube(f'fore.{s}', 0.04 * b, 0.034 * b, WRIST_DROP - ELBOW_DROP, mat('matte', SKIN), fa, at=(x * 1.05, -0.005, SHOULDER - WRIST_DROP), segs=10, sub=1)
        lathe(f'bracer.{s}', [(0.045 * b, 0.0), (0.05 * b, 0.05), (0.044 * b, 0.1)], mat('matte', BARK), fa, at=(x * 1.05, -0.005, SHOULDER - WRIST_DROP + 0.01), segs=12, sub=1)
        hx, hy, hz = hand_at(F, s)
        sphere(f'hand.{s}', 0.036 * b, mat('matte', SKIN), hd, at=(hx, hy, hz), scale=(0.9, 1.0, 1.15), sub=1)
        for i in range(4):
            a = -0.6 + i * 0.4
            big_leaf(f'pauldronLeaf{s}{i}', ua, (x * 1.12 + math.sin(a) * 0.03, math.cos(a) * 0.03 - 0.01, SHOULDER + 0.03), 0.09, 0.14, LEAVES[(i + (s == 'L')) % len(LEAVES)], rot=(math.pi - 0.5, 0, a + (math.pi / 2 if s == 'L' else -math.pi / 2)))
        if glow:
            curve_tube(f'vine.{s}', [(x * 1.06, -0.04, SHOULDER - ELBOW_DROP - 0.01), (x * 1.06 + (0.02 if s == 'L' else -0.02), -0.042, SHOULDER - 0.22), (x * 1.06, -0.04, SHOULDER - WRIST_DROP + 0.05)], 0.006, mat('glow', VINE_GLOW), fa, taper=[0.5, 1.0, 0.5])
    # Head: a lean face, long dark hair, pointed ears; amber glowing eyes for the Shapeshifter.
    face(F, skin=SKIN, hair=HAIR, brows='#1e1410', eyes='#ffb02a' if glow else '#2a1d14', hair_style='long', size=1.02)
    for sx in (-1, 1):
        lathe(f'elfEar{sx}', [(0.016, 0.0), (0.008, 0.035), (0.0, 0.06)], mat('matte', SKIN), h, at=(sx * 0.085, 0.0, HEAD + 0.0), rot=(0, sx * 1.2, 0), scale=(1.0, 0.5, 1.0), segs=6)
        for i in range(3):
            lump(f'lock{sx}{i}', 0.03, mat('matte', HAIR), h, at=(sx * 0.08, 0.035 + i * 0.02, HEAD - 0.05 - i * 0.045), scale=(0.8, 1.0, 1.3), seed=90 + i + (sx > 0) * 5, rough=0.2)
        if glow:
            sphere(f'eyeGlow{sx}', 0.007, mat('glow', '#ffb02a'), h, at=(sx * 0.032, -0.083, HEAD + 0.012))
            curve_tube(f'faceVine{sx}', [(sx * 0.05, -0.07, HEAD + 0.05), (sx * 0.075, -0.06, HEAD + 0.0), (sx * 0.065, -0.07, HEAD - 0.04)], 0.004, mat('glow', VINE_GLOW), h)
    for i in range(5):
        a = -0.9 + i * 0.45
        big_leaf(f'hairLeaf{i}', h, (math.sin(a) * 0.08, 0.02 - math.cos(a) * 0.04, HEAD + 0.08), 0.05, 0.08, LEAVES[i % len(LEAVES)], rot=(-0.5, 0, a))
    if pelt:
        # A grey wolf pelt over the shoulders, the head as a hood thrown back, team sash under it.
        sheet('pelt', 0.28 * b, 0.32, mat('matte', '#8c8e96'), ch, at=(0, 0.12 * b, NECK + 0.0), bend=0.05, flare=0.35, cols=6, rows=6, thick=0.014, ragged=0.04, seed=4)
        lump('peltHead', 0.07, mat('matte', '#8c8e96'), ch, at=(0, 0.11, NECK + 0.04), scale=(1.0, 1.2, 0.8), seed=12, rough=0.1)
        for sx in (-1, 1):
            lathe(f'peltEar{sx}', [(0.025, 0.0), (0.0, 0.06)], mat('matte', '#5d5f68'), ch, at=(sx * 0.04, 0.13, NECK + 0.09), rot=(0.4, 0, 0), segs=6)
        box('sash', (0.06, 0.012, 0.36), mat('team'), ch, at=(0.02, -0.13 * b, 0.6), rot=(0, 0.55, 0))


def spear(F, glow=False):
    """A tall spear on its own pivot in the right hand: vine-wound haft, a barbed leaf blade."""
    hd = F['hand.R']
    hx, hy, hz = hand_at(F, 'R')
    w = pivot('weapon', hd, (hx, hy, hz))
    w.rotation_euler = (0.42, 0, 0)  # upright, leaning a little forward
    F.p['weapon'] = w
    tube('haft', 0.013, 0.015, 1.15, mat('matte', BARK_D), w, at=(hx, hy, hz - 0.42), segs=8)
    pts = [(hx + 0.017 * math.cos(t * 1.7), hy + 0.017 * math.sin(t * 1.7), hz - 0.35 + t * 0.06) for t in range(16)]
    curve_tube('haftVine', pts, 0.005, mat('glow', VINE_GLOW) if glow else mat('matte', '#5a7a26'), w)
    top = hz + 0.72
    extrude('spearHead', [(-0.04, 0.0), (0.04, 0.0), (0.03, 0.05), (0.055, 0.075), (0.016, 0.13), (0.0, 0.25), (-0.016, 0.13), (-0.055, 0.075), (-0.03, 0.05)], 0.014, mat('metal', '#cfd8c6'), w, at=(hx, hy + 0.007, top), bevel=0.004)
    for i in range(3):
        big_leaf(f'spearLeaf{i}', w, (hx, hy, top - 0.02), 0.04, 0.09, LEAVES[i], rot=(math.pi + 0.4, 0, i * 2.1))


def build(kind='wolfkeeper', F=None, animate=True):
    F = F or Figure(bulk=1.08)
    glow = kind == 'shifter'
    body(F, glow=glow, pelt=kind == 'wolfkeeper')
    leaf_cloak(F, length=0.6 if glow else 0.5, seed=3 if glow else 7)
    spear(F, glow=glow)
    if animate:
        F.animate(attack=None, cast=glow)
        spear_thrust(F)
    return F


def _weapon_rot(F, direction):
    """The weapon pivot's rotation that points the spear (built along +Z) along a world direction."""
    from mathutils import Vector
    from figure import _update
    w = F.p['weapon']
    _update()
    d = (w.parent.matrix_world.to_3x3().inverted() @ Vector(direction)).normalized()
    return tuple(d.to_track_quat('Z', 'Y').to_euler())


def spear_thrust(F, mounted=False):
    """Level the spear at the hip, then lunge: the point drives forward at frame 21 (70%)."""
    from blib import key, clip
    P = F.p
    rest = {n: tuple(o.rotation_euler) for n, o in P.items()}
    def add(n, d):
        return tuple(a + b for a, b in zip(rest[n], d))
    poses = {
        'rest': {},
        'wind': {'upperarm.R': (0.35, 0, 0.25), 'forearm.R': (-1.1, 0, 0), 'chest': (0, 0, 0.3), 'upperarm.L': (-0.5, 0, -0.3)},
        'thrust': {'upperarm.R': (-1.25, 0, -0.1), 'forearm.R': (0.2, 0, 0), 'chest': (0.12, 0, -0.3), 'upperarm.L': (0.3, 0, 0.2), **({} if mounted else {'thigh.L': (-0.45, 0, 0), 'shin.L': (0.3, 0, 0)})},
    }
    rots = {}
    for name, delta in poses.items():
        for n in P:
            P[n].rotation_euler = add(n, delta.get(n, (0, 0, 0)))
        weapon = rest['weapon'] if name == 'rest' else _weapon_rot(F, (0, -1, 0.06))
        rots[name] = {n: (weapon if n == 'weapon' else add(n, delta.get(n, (0, 0, 0)))) for n in P}
    for n in P:
        P[n].rotation_euler = rest[n]
    def build():
        for f, name in ((1, 'rest'), (8, 'wind'), (18, 'wind'), (21, 'thrust'), (25, 'thrust'), (30, 'rest')):
            for n, r in rots[name].items():
                key(P[n], f, rot=r)
    clip('attack', list(P.values()), 30, build)

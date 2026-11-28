"""Thornwild beasts and riders (sheet 03).

Fox Scout: a slim red fox with a white chest, cheeks and tail tip, dark socks, tall dark-
backed ears and a huge plumed tail; a collar of leaves with a gold amulet.
Stag Rider: a great stag with a cream ruff over the chest and neck, cream legs and belly,
and wide branching antlers, under a team saddle cloth with a gold plate; ridden by a
Thornwild woman in a leaf hood and leaf cloak with a leaf-bound spear."""
import math
from blib import mat, sphere, box, lathe, tube, extrude, torus, sheet, pivot, lump, curve_tube
from figure import Figure, HIP, ANKLE, SHOULDER, ELBOW_DROP, WRIST_DROP, NECK, HEAD
from common import cloth_legs, face, hand_at, arm_x, leaf, leaf_ring, GOLD, LEATHER, LEATHER_D
from bear import fur
import beasts as BS
import sylvan as SY
import thornfolk as TF
import wild as WD


def _tail(name, path, parent, r, colors, seed, n=10, tip=2):
    curve_tube(name + 'Core', path, r * 0.9, mat('matte', colors[0]), parent, taper=[0.6, 1.1, 1.0, 0.6])
    for i in range(n):
        t = i / (n - 1)
        seg = t * (len(path) - 1)
        k = min(int(seg), len(path) - 2)
        f = seg - k
        p = tuple(path[k][j] * (1 - f) + path[k + 1][j] * f for j in range(3))
        fur(f'{name}{i}', r * (0.85 + 0.45 * math.sin(t * math.pi)), parent, p, scale=(0.9, 1.0, 1.1), seed=seed + i, color=colors[1] if i >= n - tip else colors[0], rough=0.1)


def fox():
    COAT, WHITE, SOCK = '#e5782a', '#f6efe2', '#3a2418'
    L, leg, g = 0.56, 0.24, 0.11
    B = BS.Beast(length=L, leg=leg, girth=g)
    cz = B.cz
    bm, nk, hd, tl = B['barrel'], B['neck'], B['head'], B['tail']
    fur('chest', g * 1.0, bm, (0, -L * 0.27, cz + g * 0.05), scale=(0.85, 1.1, 1.1), seed=1, color=COAT, rough=0.06)
    fur('body', g * 0.85, bm, (0, L * 0.04, cz + g * 0.1), scale=(0.85, 1.8, 0.9), seed=2, color=COAT, rough=0.05)
    fur('haunch', g * 0.9, bm, (0, L * 0.3, cz + g * 0.1), scale=(0.9, 1.1, 1.0), seed=3, color=COAT, rough=0.06)
    fur('belly', g * 0.55, bm, (0, -L * 0.1, cz - g * 0.55), scale=(0.75, 1.8, 0.5), seed=4, color=WHITE, rough=0.1)
    # A white bib down the throat and chest.
    fur('bib', g * 0.7, nk, (0, -L * 0.45, cz + g * 0.25), scale=(0.95, 0.8, 1.25), seed=5, color=WHITE, rough=0.14)
    hy, hz = -L * 0.66, cz + g * 1.5
    curve_tube('neck', [(0, -L * 0.33, cz + g * 0.4), (0, -L * 0.48, cz + g * 0.95), (0, hy + g * 0.3, hz)], g * 0.55, mat('matte', COAT), nk, taper=[1.2, 1.0, 0.85])
    gh = g * 1.6
    fur('skull', gh * 0.48, hd, (0, hy, hz + gh * 0.05), scale=(1.05, 1.1, 0.9), seed=6, color=COAT, rough=0.05)
    for sx in (-1, 1):
        fur(f'cheek{sx}', gh * 0.3, hd, (sx * gh * 0.3, hy - gh * 0.12, hz - gh * 0.12), scale=(0.9, 1.0, 0.9), seed=7 + (sx > 0), color=WHITE, rough=0.16)
    lathe('snout', [(gh * 0.24, 0.0), (gh * 0.18, gh * 0.3), (gh * 0.1, gh * 0.6), (gh * 0.05, gh * 0.75), (0.0, gh * 0.78)], mat('matte', COAT), hd, at=(0, hy - gh * 0.28, hz - gh * 0.04), rot=(math.pi / 2 + 0.1, 0, 0), scale=(1.0, 1.0, 0.8), segs=14, sub=1)
    lathe('jaw', [(gh * 0.18, 0.0), (gh * 0.1, gh * 0.4), (0.0, gh * 0.6)], mat('matte', WHITE), hd, at=(0, hy - gh * 0.3, hz - gh * 0.14), rot=(math.pi / 2 + 0.12, 0, 0), scale=(1.0, 1.0, 0.6), segs=12, sub=1)
    sphere('nose', gh * 0.075, mat('matte', '#16100e'), hd, at=(0, hy - gh * 1.04, hz - gh * 0.08), scale=(1.2, 1.0, 0.85), sub=1)
    for sx in (-1, 1):
        lathe(f'ear{sx}', [(gh * 0.2, 0.0), (gh * 0.13, gh * 0.3), (0.0, gh * 0.6)], mat('matte', COAT), hd, at=(sx * gh * 0.24, hy + gh * 0.1, hz + gh * 0.32), rot=(-0.15, sx * 0.25, 0), scale=(1.0, 0.45, 1.0), segs=10, sub=1)
        lathe(f'earBack{sx}', [(gh * 0.12, 0.0), (0.0, gh * 0.28)], mat('matte', SOCK), hd, at=(sx * gh * 0.27, hy + gh * 0.13, hz + gh * 0.62), rot=(-0.15, sx * 0.25, 0), scale=(1.0, 0.5, 1.0), segs=8)
        lathe(f'earIn{sx}', [(gh * 0.12, 0.0), (0.0, gh * 0.44)], mat('matte', WHITE), hd, at=(sx * gh * 0.24, hy + gh * 0.05, hz + gh * 0.34), rot=(-0.15, sx * 0.25, 0), scale=(1.0, 0.3, 1.0), segs=8)
        sphere(f'eye{sx}', gh * 0.07, mat('glow', '#ffb02a'), hd, at=(sx * gh * 0.22, hy - gh * 0.4, hz + gh * 0.13), scale=(1.1, 0.7, 0.7))
        sphere(f'pupil{sx}', gh * 0.035, mat('matte', '#140c08'), hd, at=(sx * gh * 0.23, hy - gh * 0.45, hz + gh * 0.13), scale=(0.6, 0.6, 1.0))
    # Slim legs with dark socks and small paws.
    for k in ('FL', 'FR', 'HL', 'HR'):
        up, lo = B[f'leg.{k}'], B[f'lower.{k}']
        x = (1 if k in ('FL', 'HL') else -1) * g * 0.55
        y = (-1 if k[0] == 'F' else 1) * L * 0.36
        hind = k[0] == 'H'
        fur(f'upper.{k}', g * (0.55 if hind else 0.45), up, (x, y, leg * 0.88), scale=(0.65, 1.0, 1.4), seed=20 + ord(k[1]), color=COAT, rough=0.06)
        if hind:
            curve_tube(f'lower.{k}', [(x, y, leg * 0.6), (x, y + 0.04, leg * 0.3), (x, y, 0.03)], g * 0.18, mat('matte', SOCK), lo, taper=[1.3, 1.0, 0.9])
        else:
            curve_tube(f'lower.{k}', [(x, y, leg * 0.65), (x, y, leg * 0.3), (x, y - 0.01, 0.03)], g * 0.16, mat('matte', SOCK), lo, taper=[1.4, 1.0, 0.9])
        lump(f'paw.{k}', g * 0.18, mat('matte', SOCK), lo, at=(x, y - 0.02, 0.02), scale=(1.0, 1.4, 0.6), seed=30 + ord(k[1]), rough=0.08)
    # The great plumed tail, sweeping back and up, white at the tip.
    t0 = (0, L * 0.45, cz + g * 0.3)
    _tail('tail', [t0, (0, L * 0.6, cz - g * 0.3), (0, L * 0.82, cz - g * 0.05), (0.03, L * 0.92, cz + g * 0.8)], tl, g * 0.72, (COAT, WHITE), 40, n=11, tip=3)
    # A collar of leaves with a gold diamond amulet; a team band under it.
    torus('collar', g * 0.6, 0.012, mat('team'), nk, at=(0, -L * 0.45, cz + g * 0.62), rot=(1.15, 0, 0), segs=16, rsegs=4)
    leaf_ring('collarLeaves', nk, (0, -L * 0.45, cz + g * 0.6), g * 0.66, 10, 0.06, 0.12, WD.LEAVES, tilt=2.1)
    extrude('amulet', [(-0.03, 0.0), (0.0, -0.04), (0.03, 0.0), (0.0, 0.04)], 0.008, mat('gold', GOLD), nk, at=(0, -L * 0.56, cz + g * 0.18), rot=(math.pi / 2 - 0.3, 0, 0), bevel=0.003)
    sphere('amuletGem', 0.01, mat('glow', '#a8ff6a'), nk, at=(0, -L * 0.57, cz + g * 0.18))
    B.animate(gait='bound', attack='bite')
    return B


def antler(name, parent, base, sx, size, color):
    """A branching antler: a beam sweeping out, back and up, with tines rising from it."""
    m = mat('matte', color)
    bx, by, bz = base
    beam = [(bx, by, bz), (bx + sx * size * 0.45, by + size * 0.15, bz + size * 0.3), (bx + sx * size * 0.8, by + size * 0.25, bz + size * 0.6), (bx + sx * size * 0.95, by + size * 0.1, bz + size * 0.9)]
    curve_tube(name, beam, size * 0.05, m, parent, taper=[1.0, 0.85, 0.7, 0.4])
    for i, (t, ln, lean) in enumerate(((0.12, 0.35, -0.6), (0.4, 0.45, -0.3), (0.62, 0.42, 0.1), (0.8, 0.32, 0.3))):
        seg = t * 3
        k = min(int(seg), 2)
        f = seg - k
        p = tuple(beam[k][j] * (1 - f) + beam[k + 1][j] * f for j in range(3))
        tip = (p[0] + sx * ln * size * 0.25, p[1] + lean * ln * size, p[2] + ln * size)
        curve_tube(f'{name}Tine{i}', [p, ((p[0] + tip[0]) / 2, (p[1] + tip[1]) / 2 - 0.01, (p[2] + tip[2]) / 2), tip], size * 0.032, m, parent, taper=[1.0, 0.7, 0.3])


def stag():
    COAT, CREAM, HOOF = '#8a5a34', '#efe2c6', '#2a2018'
    L, leg, g = 0.92, 0.5, 0.18
    B = BS.Beast(length=L, leg=leg, girth=g)
    cz = B.cz
    bm, nk, hd, tl = B['barrel'], B['neck'], B['head'], B['tail']
    fur('chest', g * 1.05, bm, (0, -L * 0.28, cz + g * 0.05), scale=(0.9, 1.05, 1.1), seed=1, color=COAT, rough=0.05)
    fur('barrel', g * 0.95, bm, (0, L * 0.02, cz + g * 0.05), scale=(0.9, 1.8, 0.95), seed=2, color=COAT, rough=0.04)
    fur('rump', g * 0.98, bm, (0, L * 0.3, cz + g * 0.12), scale=(0.95, 1.05, 1.0), seed=3, color=COAT, rough=0.05)
    fur('belly', g * 0.6, bm, (0, -L * 0.05, cz - g * 0.6), scale=(0.8, 1.9, 0.5), seed=4, color=CREAM, rough=0.12)
    fur('rumpPatch', g * 0.5, bm, (0, L * 0.46, cz + g * 0.25), scale=(0.9, 0.5, 1.0), seed=5, color=CREAM, rough=0.12)
    # An upright neck under a big shaggy cream ruff.
    hy, hz = -L * 0.6, cz + g * 2.0
    curve_tube('neck', [(0, -L * 0.33, cz + g * 0.4), (0, -L * 0.47, cz + g * 1.2), (0, hy + g * 0.15, hz - g * 0.1)], g * 0.55, mat('matte', COAT), nk, taper=[1.2, 0.95, 0.8])
    for i in range(6):
        t = i / 5
        fur(f'ruff{i}', g * (0.7 - 0.25 * t), nk, (0, -L * 0.42 - t * L * 0.12, cz + g * (0.1 + t * 1.4)), scale=(1.15, 0.95, 1.0), seed=10 + i, color=CREAM, rough=0.22)
    fur('mane', g * 0.4, nk, (0, -L * 0.4, cz + g * 1.3), scale=(0.7, 1.0, 1.6), seed=17, color='#6a4428', rough=0.18)
    # A long head, dark nose, big ears, and the antlers.
    fur('skull', g * 0.45, hd, (0, hy, hz), scale=(0.9, 1.15, 0.95), seed=18, color=COAT, rough=0.04)
    lathe('face', [(g * 0.32, 0.0), (g * 0.27, g * 0.35), (g * 0.2, g * 0.65), (g * 0.15, g * 0.78), (0.0, g * 0.82)], mat('matte', COAT), hd, at=(0, hy - g * 0.25, hz - g * 0.05), rot=(math.pi / 2 + 0.5, 0, 0), scale=(0.85, 1.0, 1.0), segs=14, sub=1)
    sphere('muzzle', g * 0.2, mat('matte', CREAM), hd, at=(0, hy - g * 0.75, hz - g * 0.45), scale=(1.0, 1.1, 0.8), sub=1)
    sphere('nose', g * 0.12, mat('matte', '#1a120c'), hd, at=(0, hy - g * 0.9, hz - g * 0.38), scale=(1.1, 0.8, 0.8), sub=1)
    for sx in (-1, 1):
        sphere(f'eye{sx}', g * 0.07, mat('matte', '#140c08'), hd, at=(sx * g * 0.26, hy - g * 0.2, hz + g * 0.05))
        sphere(f'eyeRing{sx}', g * 0.1, mat('matte', CREAM), hd, at=(sx * g * 0.25, hy - g * 0.18, hz + g * 0.05), scale=(0.5, 1.0, 1.0))
        lathe(f'ear{sx}', [(g * 0.12, 0.0), (g * 0.1, g * 0.2), (0.0, g * 0.38)], mat('matte', COAT), hd, at=(sx * g * 0.35, hy + g * 0.15, hz + g * 0.2), rot=(-0.3, sx * 1.1, 0), scale=(1, 0.5, 1), segs=8, sub=1)
        antler(f'antler{sx}', hd, (sx * g * 0.15, hy + g * 0.05, hz + g * 0.35), sx, g * 2.0, '#7a5a38')
    # Legs: brown above, cream below, dark cloven hooves.
    for k in ('FL', 'FR', 'HL', 'HR'):
        up, lo = B[f'leg.{k}'], B[f'lower.{k}']
        x = (1 if k in ('FL', 'HL') else -1) * g * 0.55
        y = (-1 if k[0] == 'F' else 1) * L * 0.36
        hind = k[0] == 'H'
        fur(f'upper.{k}', g * (0.5 if hind else 0.42), up, (x, y, leg * 0.85), scale=(0.65, 1.0, 1.5), seed=30 + ord(k[1]), color=COAT, rough=0.05)
        curve_tube(f'cannon.{k}', [(x, y, leg * 0.6), (x, y + (0.04 if hind else 0.0), leg * 0.3), (x, y, 0.06)], g * 0.15, mat('matte', CREAM), lo, taper=[1.4, 1.0, 1.0])
        fur(f'fetlock.{k}', g * 0.17, lo, (x, y + 0.01, 0.08), scale=(1.0, 1.1, 1.0), seed=40 + ord(k[1]), color=CREAM, rough=0.25)
        for sh in (-1, 1):
            lathe(f'hoof.{k}{sh}', [(0.0, 0.0), (g * 0.09, 0.0), (g * 0.07, 0.04), (0.0, 0.045)], mat('matte', HOOF), lo, at=(x + sh * g * 0.06, y - 0.01, 0.0), scale=(1, 1.3, 1), segs=8)
    fur('tail', g * 0.25, tl, (0, L * 0.5, cz + g * 0.45), scale=(0.8, 0.8, 1.2), seed=50, color=CREAM, rough=0.2)
    # Team saddle cloth with a gold plate, leaves, saddle.
    lathe('cloth', [(g * 1.02, 0.0), (g * 1.05, g * 0.35), (g * 0.98, g * 0.6), (g * 0.6, g * 0.75)], mat('team'), bm, at=(0, 0.02, cz + g * 0.32), scale=(1.0, 1.3, 1.0), segs=22, sub=1)
    lathe('clothHem', [(g * 1.025, 0.0), (g * 1.04, g * 0.06)], mat('gold', GOLD), bm, at=(0, 0.02, cz + g * 0.3), scale=(1.0, 1.3, 1.0), segs=22)
    for sx in (-1, 1):
        box(f'plate{sx}', (0.02, g * 0.5, g * 0.5), mat('gold', GOLD), bm, at=(sx * g * 1.06, 0.06, cz + g * 0.55), bevel=0.01)
        box(f'plateIn{sx}', (0.024, g * 0.3, g * 0.3), mat('matte', '#6a4a22'), bm, at=(sx * g * 1.07, 0.06, cz + g * 0.55), bevel=0.006)
    leaf_ring('clothLeaves', bm, (0, -L * 0.12, cz + g * 1.0), g * 0.6, 8, 0.07, 0.14, WD.LEAVES, tilt=1.6)
    box('saddle', (g * 0.95, g * 1.1, 0.05), mat('matte', LEATHER_D), B['saddle'], at=(0, 0.02, cz + g * 1.02), bevel=0.02, sub=1)
    return B


def stagrider():
    B = stag()
    F = Figure(bulk=1.0)
    b = F.bulk
    green, green_d = mat('matte', TF.GREEN), mat('matte', TF.GREEN_D)
    ch, spine, hips = F['chest'], F['spine'], F['hips']
    cloth_legs(F, pants='#5a4a30', boots=LEATHER)
    for s, sx in (('R', -1), ('L', 1)):
        lathe(f'boot.{s}', [(0.0, 0.0), (0.05, 0.0), (0.048, 0.1), (0.054, 0.17), (0.0, 0.17)], mat('matte', LEATHER), F[f'shin.{s}'], at=(0.075 * b * sx, -0.004, ANKLE - 0.02), segs=12, sub=1)
    lathe('tunic', [(0.0, 0.0), (0.11 * b, 0.0), (0.12 * b, 0.07), (0.13 * b, 0.15), (0.12 * b, 0.21), (0.07, 0.245), (0.0, 0.25)], green, ch, at=(0, 0, 0.5), scale=(1, 0.8, 1), segs=16, sub=1)
    leaf_ring('skirtLeaves', hips, (0, 0, HIP + 0.02), 0.13 * b, 12, 0.06, 0.13, [TF.GREEN, TF.GREEN_D, '#8fae3a'], tilt=2.7)
    torus('belt', 0.12 * b, 0.016, mat('matte', LEATHER_D), spine, at=(0, 0, 0.5), scale=(1, 0.84, 1), segs=18, rsegs=5)
    box('pouch', (0.06, 0.04, 0.065), mat('matte', LEATHER), spine, at=(0.11 * b, -0.06, 0.45), rot=(0, 0, -0.4), bevel=0.012, sub=1)
    box('sash', (0.045, 0.012, 0.3), mat('team'), ch, at=(0.02, -0.12 * b, 0.62), rot=(0, 0.55, 0))
    for s in 'RL':
        x = arm_x(F, s)
        ua, fa, hd = F[f'upperarm.{s}'], F[f'forearm.{s}'], F[f'hand.{s}']
        tube(f'sleeve.{s}', 0.044 * b, 0.04 * b, ELBOW_DROP, green, ua, at=(x, 0, SHOULDER - ELBOW_DROP), segs=10, sub=1)
        tube(f'fore.{s}', 0.038 * b, 0.034 * b, WRIST_DROP - ELBOW_DROP, mat('matte', TF.SKIN), fa, at=(x * 1.05, -0.005, SHOULDER - WRIST_DROP), segs=10, sub=1)
        lathe(f'bracer.{s}', [(0.04, 0.0), (0.046, 0.05), (0.04, 0.1)], mat('matte', LEATHER), fa, at=(x * 1.05, -0.005, SHOULDER - WRIST_DROP + 0.01), segs=12, sub=1)
        hx, hy, hz = hand_at(F, s)
        sphere(f'glove.{s}', 0.036, mat('matte', LEATHER_D), hd, at=(hx, hy, hz), scale=(0.9, 1.0, 1.15), sub=1)
    face(F, hair=TF.AUBURN, brows='#8a3a1a', size=1.02)
    TF.leaf_hood(F)
    WD.leaf_mantle(F, 0.8)
    SY.leaf_cloak(F, length=0.36, flare=0.08, rows=2, seed=29)
    # A long spear: pale wood, a gold leaf-shaped head, leaves bound below it.
    hd = F['hand.R']
    hx, hy, hz = hand_at(F, 'R')
    w = pivot('weapon', hd, (hx, hy, hz))
    w.rotation_euler = (0.15, 0, 0)
    F.p['weapon'] = w
    tube('spear', 0.014, 0.016, 1.3, mat('matte', '#c08a52'), w, at=(hx, hy, hz - 0.4), segs=8)
    extrude('spearHead', [(0.0, 0.0), (0.035, 0.06), (0.025, 0.14), (0.0, 0.2), (-0.025, 0.14), (-0.035, 0.06)], 0.014, mat('gold', '#d9b860'), w, at=(hx, hy + 0.007, hz + 0.9), rot=(math.pi / 2, 0, 0), bevel=0.004)
    torus('spearCollar', 0.02, 0.007, mat('gold', GOLD), w, at=(hx, hy, hz + 0.88), segs=10, rsegs=3)
    for i in range(3):
        leaf(f'spearLeaf{i}', w, (hx, hy, hz + 0.8 - i * 0.04), 0.04, 0.1, WD.LEAVES[i], rot=(0.5, 0, i * 2.1))
    BS.seat_rider(B, F)
    for s, sx in (('R', -1), ('L', 1)):
        F[f'thigh.{s}'].rotation_euler = (-1.3, sx * 0.5, 0)
        F[f'shin.{s}'].rotation_euler = (1.4, 0, 0)
    B.animate(gait='trot', attack='rear')
    F.animate(attack=None, mounted=True)
    SY.spear_thrust(F, mounted=True)
    return F

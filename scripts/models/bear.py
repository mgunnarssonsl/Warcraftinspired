"""The Crown War Bear (sheet 16): a massive hunched grizzly with a roaring, fanged
head held low, thick shaggy legs and big clawed paws, armored in overlapping
steel plates with gold trim over its back and shoulders, steel greaves on its
forelegs, a plated brow, and blue crowned drapes on its flanks and chest.
Used alone (War Bear) and under a Bearwarden (Bear Rider)."""
import math
from blib import mat, sphere, box, lathe, tube, extrude, torus, sheet, pivot, key, clip, lump, curve_tube
from common import crown_outline, GOLD, LEATHER, LEATHER_D
import beasts as BS

FUR = '#6e4527'
FUR_D = '#4e2f1a'
FUR_L = '#9a6a42'
STEEL = '#a7b0bc'
TRIM = '#e2b24a'
BRASS = '#c99a3a'


def fur(name, r, parent, at, scale=(1, 1, 1), seed=1, color=FUR, rough=0.13):
    """Shaggy fur: a lump with fine, high-frequency bumps."""
    return lump(name, r, mat('matte', color), parent, at=at, scale=scale, seed=seed, rough=rough, segs=30, rings=20, freq=(8, 15), waves_n=10, sub=0)


def war_bear():
    L, leg, g = 0.98, 0.32, 0.28
    B = BS.Beast(length=L, leg=leg, girth=g)
    cz = B.cz
    bm, nk, hd = B['barrel'], B['neck'], B['head']
    steel, trim, team = mat('metal', STEEL), mat('gold', TRIM), mat('team')
    # ---- body: hump, barrel, rump, a shaggy belly ----
    fur('barrel', g, bm, (0, 0.04, cz), scale=(1.05, L / (2 * g) * 0.92, 0.95), seed=1)
    fur('hump', g * 1.02, bm, (0, -L * 0.24, cz + g * 0.28), scale=(1.12, 1.05, 1.0), seed=2)
    fur('rump', g * 0.96, bm, (0, L * 0.3, cz + 0.01), scale=(1.05, 1.0, 0.95), seed=3)
    for i in range(4):
        fur(f'belly{i}', g * 0.42, bm, (((i % 2) - 0.5) * g * 0.5, -L * 0.25 + i * L * 0.16, cz - g * 0.72), scale=(1.1, 1.2, 0.8), seed=10 + i, color=FUR_D, rough=0.12)
    # ---- neck and head: low and forward, mouth open in a roar ----
    fur('neck', g * 0.8, nk, (0, -L * 0.5, cz + g * 0.0), scale=(1.0, 1.3, 0.95), seed=4)
    fur('ruff', g * 0.7, nk, (0, -L * 0.45, cz - g * 0.25), scale=(1.25, 1.0, 0.9), seed=7, color=FUR_D, rough=0.18)
    hy, hz = -L * 0.72, cz - g * 0.05
    g0 = g
    gh = g * 1.25  # head scale
    # Skull, heavy jowls, a long snout: a grizzly's profile, held low.
    fur('skull', gh * 0.5, hd, (0, hy + gh * 0.12, hz + gh * 0.16), scale=(1.15, 1.1, 0.92), seed=5)
    for sx in (-1, 1):
        fur(f'jowl{sx}', gh * 0.27, hd, (sx * gh * 0.27, hy - gh * 0.12, hz - gh * 0.02), scale=(0.9, 1.1, 0.95), seed=6 + (sx > 0), color=FUR_D)
    lathe('snout', [(gh * 0.24, 0.0), (gh * 0.22, gh * 0.2), (gh * 0.17, gh * 0.42), (gh * 0.12, gh * 0.58), (0.0, gh * 0.62)], mat('matte', FUR_L), hd, at=(0, hy - gh * 0.22, hz + gh * 0.06), rot=(math.pi / 2 + 0.1, 0, 0), scale=(1.0, 1.0, 0.72), segs=16, sub=1)
    box('snoutBridge', (gh * 0.2, gh * 0.5, gh * 0.08), mat('matte', FUR), hd, at=(0, hy - gh * 0.45, hz + gh * 0.17), rot=(0.18, 0, 0), bevel=0.02, sub=1)
    sphere('nose', gh * 0.1, mat('matte', '#1c1412'), hd, at=(0, hy - gh * 0.84, hz + gh * 0.04), scale=(1.4, 0.9, 0.85), sub=1)
    # The mouth, open in a roar: gums, a dark throat, fangs above and below.
    sphere('throat', gh * 0.2, mat('matte', '#4a1612'), hd, at=(0, hy - gh * 0.42, hz - gh * 0.12), scale=(0.75, 1.5, 0.55), sub=1)
    box('gumUp', (gh * 0.3, gh * 0.5, gh * 0.04), mat('matte', '#9a3a32'), hd, at=(0, hy - gh * 0.55, hz - gh * 0.05), rot=(0.1, 0, 0), bevel=0.012, sub=1)
    jaw = pivot('jaw', hd, (0, hy - gh * 0.12, hz - gh * 0.12))
    jaw.rotation_euler = (-0.55, 0, 0)  # open: the roar of the painting
    B.p['jaw'] = jaw
    lathe('lowerJaw', [(gh * 0.19, 0.0), (gh * 0.17, gh * 0.25), (gh * 0.12, gh * 0.45), (0.0, gh * 0.5)], mat('matte', FUR_L), jaw, at=(0, hy - gh * 0.15, hz - gh * 0.2), rot=(math.pi / 2, 0, 0), scale=(1.0, 1.0, 0.55), segs=14, sub=1)
    box('tongue', (gh * 0.22, gh * 0.4, gh * 0.04), mat('matte', '#c0504a'), jaw, at=(0, hy - gh * 0.42, hz - gh * 0.15), bevel=0.012, sub=1)
    for sx in (-1, 1):
        lathe(f'fangUp{sx}', [(gh * 0.035, 0.0), (0.0, gh * 0.15)], mat('matte', '#f4ecd8'), hd, at=(sx * gh * 0.12, hy - gh * 0.72, hz - gh * 0.05), rot=(math.pi, 0, 0), segs=6)
        lathe(f'fangDn{sx}', [(gh * 0.03, 0.0), (0.0, gh * 0.12)], mat('matte', '#f4ecd8'), jaw, at=(sx * gh * 0.1, hy - gh * 0.58, hz - gh * 0.15), segs=6)
        for i in range(3):
            lathe(f'tooth{sx}{i}', [(gh * 0.016, 0.0), (0.0, gh * 0.05)], mat('matte', '#efe6d0'), hd, at=(sx * gh * (0.13 - i * 0.01), hy - gh * (0.6 - i * 0.1), hz - gh * 0.05), rot=(math.pi, 0, 0), segs=5)
        # Small round ears, deep-set dark eyes with a glint, a heavy brow.
        fur(f'ear{sx}', gh * 0.13, hd, (sx * gh * 0.38, hy + gh * 0.2, hz + gh * 0.48), scale=(1.0, 0.6, 0.95), seed=20 + (sx > 0))
        sphere(f'earIn{sx}', gh * 0.07, mat('matte', '#3a2418'), hd, at=(sx * gh * 0.38, hy + gh * 0.14, hz + gh * 0.48), scale=(1, 0.5, 1))
        sphere(f'eye{sx}', gh * 0.05, mat('matte', '#140c08'), hd, at=(sx * gh * 0.2, hy - gh * 0.3, hz + gh * 0.26))
        sphere(f'glint{sx}', gh * 0.018, mat('matte', '#f8e8c8'), hd, at=(sx * gh * 0.19, hy - gh * 0.34, hz + gh * 0.28))
        box(f'brow{sx}', (gh * 0.2, gh * 0.1, gh * 0.06), mat('matte', FUR_D), hd, at=(sx * gh * 0.2, hy - gh * 0.27, hz + gh * 0.33), rot=(0.3, 0, -sx * 0.35), bevel=0.02, sub=1)
    g = g0
    # ---- legs: thick and shaggy, big paws with long claws ----
    for k in ('FL', 'FR', 'HL', 'HR'):
        up, lo = B[f'leg.{k}'], B[f'lower.{k}']
        x = (1 if k in ('FL', 'HL') else -1) * g * 0.6
        y = (-1 if k[0] == 'F' else 1) * L * 0.34
        hind = k[0] == 'H'
        fur(f'thigh.{k}', g * (0.5 if hind else 0.46), up, (x, y + (0.03 if hind else 0), leg * 0.85), scale=(0.8, 1.0, 1.35), seed=30 + len(k) + ord(k[1]))
        fur(f'shank.{k}', g * 0.34, lo, (x, y - 0.01, leg * 0.3), scale=(0.9, 1.0, 1.4), seed=40 + ord(k[1]), color=FUR_D)
        lump(f'paw.{k}', g * 0.28, mat('matte', FUR_D), lo, at=(x, y - 0.035, 0.045), scale=(1.1, 1.35, 0.55), seed=50 + ord(k[1]), rough=0.08)
        for i in range(4):
            cx = x + (i - 1.5) * g * 0.13
            curve_tube(f'claw.{k}{i}', [(cx, y - g * 0.3, 0.05), (cx, y - g * 0.42, 0.035), (cx, y - g * 0.47, 0.005)], 0.011, mat('matte', '#efe4cc'), lo, taper=[1.0, 0.7, 0.2])
        if not hind:
            # Steel greaves with gold bands on the forelegs.
            lathe(f'greave.{k}', [(g * 0.36, 0.0), (g * 0.38, leg * 0.22), (g * 0.35, leg * 0.42)], steel, lo, at=(x, y - 0.005, leg * 0.12), scale=(1.0, 1.05, 1.0), segs=16, sub=1)
            for zz in (leg * 0.12, leg * 0.54):
                torus(f'greaveBand.{k}{zz:.2f}', g * 0.37, 0.011, trim, lo, at=(x, y - 0.005, zz), scale=(1, 1.05, 1), segs=18, rsegs=4)
            lathe(f'cowter.{k}', [(0.0, 0.0), (g * 0.26, 0.0), (g * 0.27, g * 0.12), (0.0, g * 0.2)], steel, up, at=(x, y - g * 0.18, leg * 0.95), rot=(-math.pi / 2 + 0.3, 0, 0), segs=14, sub=1)
    # ---- armor: shoulder pauldrons, back lames, a chest plate, the brow plate ----
    for sx in (-1, 1):
        po = (sx * g * 0.7, -L * 0.25, cz + g * 0.72)
        rot = (0, sx * 0.7, 0)
        lathe(f'pauldron{sx}', [(0.0, g * 0.36), (g * 0.3, g * 0.31), (g * 0.5, g * 0.18), (g * 0.6, 0.0), (g * 0.58, -g * 0.03), (0.0, -g * 0.03)], steel, bm, at=po, rot=rot, scale=(1.0, 1.3, 1.0), segs=24, sub=1)
        torus(f'pauldronTrim{sx}', g * 0.6, 0.017, trim, bm, at=po, rot=rot, scale=(1.0, 1.3, 1.0), segs=26, rsegs=4)
        torus(f'pauldronRing{sx}', g * 0.36, 0.01, trim, bm, at=(po[0] + sx * g * 0.12, po[1], po[2] + g * 0.2), rot=rot, scale=(1.0, 1.3, 1.0), segs=20, rsegs=4)
        for i in range(2):
            lathe(f'pauldronLame{sx}{i}', [(g * (0.6 + i * 0.07), -g * 0.02), (g * (0.62 + i * 0.07), -g * 0.11)], steel, bm, at=(po[0] + sx * g * 0.04 * (i + 1), po[1], po[2] - g * (0.06 + i * 0.09)), rot=rot, scale=(1.0, 1.3, 1.0), segs=24, sub=1)
        for i in range(6):
            a = 2 * math.pi * i / 6
            sphere(f'rivet{sx}{i}', 0.013, mat('gold', BRASS), bm, at=(po[0] + sx * g * 0.12 + math.cos(a) * g * 0.26 * math.cos(0.7), po[1] + math.sin(a) * g * 0.34, po[2] + g * 0.22 + math.cos(a) * g * 0.05))
    # Back lames: overlapping steel bands arched over the barrel, gold-edged.
    for i in range(6):
        y = -L * 0.1 + i * L * 0.085
        r = g * (1.13 - 0.015 * i)
        P = pivot(f'lameP{i}', bm, (0, y, cz))
        lathe(f'lame{i}', [(r, -0.05), (r + 0.012, 0.0), (r, 0.05)], steel, P, at=(0, y, cz), rot=(math.pi / 2, 0, -math.pi * 0.0), segs=24, sub=1, angle=math.pi * 0.72)
        lathe(f'lameTrim{i}', [(r + 0.016, -0.05), (r + 0.016, -0.04)], trim, P, at=(0, y, cz), rot=(math.pi / 2, 0, 0), segs=24, angle=math.pi * 0.72)
        P.rotation_euler = (0, -math.pi * 0.14, 0)
        # (The pivot only holds the arch; it is not animated.)
    # Chest plate (peytral) below the throat.
    lathe('peytral', [(g * 0.75, 0.0), (g * 0.82, g * 0.35), (g * 0.68, g * 0.7)], steel, bm, at=(0, -L * 0.36, cz - g * 0.55), rot=(math.pi / 2 - 0.35, 0, 0), segs=20, sub=1, angle=math.pi * 0.9, )
    # Brow plate over the skull and down the muzzle, gold-rimmed, a crest stud.
    box('browPlate', (gh * 0.42, gh * 0.5, gh * 0.05), steel, hd, at=(0, hy + gh * 0.0, hz + gh * 0.55), rot=(-0.35, 0, 0), bevel=0.02, sub=1)
    box('browRim', (gh * 0.46, gh * 0.035, gh * 0.06), trim, hd, at=(0, hy - gh * 0.24, hz + gh * 0.46), rot=(-0.35, 0, 0), bevel=0.008)
    sphere('browStud', gh * 0.06, trim, hd, at=(0, hy + gh * 0.08, hz + gh * 0.6), sub=1)
    # ---- blue drapes: one per flank and a bib on the chest, crowns and gold fringe ----
    for sx in (-1, 1):
        sheet(f'drape{sx}', L * 0.34, g * 1.05, team, bm, at=(sx * g * 1.1, L * 0.03, cz + g * 0.35), rot=(0, 0, sx * math.pi / 2), bend=0.015, flare=0.08, cols=6, rows=6, thick=0.012, sub=0)
        box(f'drapeHem{sx}', (0.014, L * 0.35, 0.03), trim, bm, at=(sx * g * 1.13, L * 0.03, cz - g * 0.68), bevel=0.004)
        extrude(f'drapeCrown{sx}', crown_outline(0.12, 0.085), 0.012, trim, bm, at=(sx * g * 1.15, L * 0.03, cz - g * 0.25), rot=(0, 0, sx * math.pi / 2), bevel=0.003)
        for i in range(6):
            tube(f'fringe{sx}{i}', 0.006, 0.006, 0.04, trim, bm, at=(sx * g * 1.13, L * 0.03 - L * 0.15 + i * L * 0.06, cz - g * 0.82), segs=4)
    sheet('bib', g * 0.85, g * 0.8, team, nk, at=(0, -L * 0.52, cz - g * 0.1), rot=(-0.2, 0, 0), bend=0.02, flare=0.15, cols=6, rows=6, thick=0.012, sub=0)
    extrude('bibCrown', crown_outline(0.09, 0.065), 0.012, trim, nk, at=(0, -L * 0.56, cz - g * 0.55), bevel=0.003)
    # ---- the saddle: leather, a high cantle, brass, a saddlebag ----
    sd = B['saddle']
    sz = cz + g * 1.02
    box('saddleSeat', (g * 0.9, g * 1.05, 0.06), mat('matte', LEATHER_D), sd, at=(0, 0.02, sz), bevel=0.025, sub=1)
    box('saddleCantle', (g * 0.8, 0.05, 0.12), mat('matte', LEATHER_D), sd, at=(0, 0.02 + g * 0.5, sz + 0.05), rot=(-0.25, 0, 0), bevel=0.02, sub=1)
    box('saddlePommel', (g * 0.5, 0.05, 0.08), mat('matte', LEATHER_D), sd, at=(0, 0.02 - g * 0.5, sz + 0.03), rot=(0.25, 0, 0), bevel=0.02, sub=1)
    torus('saddleTrim', g * 0.5, 0.008, mat('gold', BRASS), sd, at=(0, 0.02, sz + 0.03), scale=(1, 1.15, 1), segs=20, rsegs=4)
    box('saddlebag', (0.06, 0.12, 0.1), mat('matte', LEATHER), sd, at=(g * 1.0, 0.1, sz - 0.08), bevel=0.02, sub=1)
    fur('tail', g * 0.16, B['tail'], (0, L * 0.5, cz + g * 0.2), seed=60)
    return B


def animate_bear(B):
    """The beast's gait and rear-up swipe, plus the jaw snapping wide when it strikes."""
    B.animate(gait='trot', attack='rear')
    jaw = B.p['jaw']
    open_ = tuple(jaw.rotation_euler)
    def roar():
        for f, k in ((1, 0.0), (12, 1.0), (19, 1.0), (21, 0.4), (30, 0.0)):
            key(jaw, f, rot=(open_[0] - 0.25 * k, 0, 0))
    clip('attack', [jaw], 30, roar)


def warbear():
    B = war_bear()
    animate_bear(B)
    return B

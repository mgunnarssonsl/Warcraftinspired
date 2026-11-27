"""The Shapeshifter's panther form (sheet 16): a sleek black woodland panther, heavy in the
shoulder and haunch, a round head with amber eyes and whiskers, thick legs and big paws,
a long tail curling at the tip; glowing green vines swirl over its coat and leafy
vines grow over its shoulders and back."""
import math
from blib import mat, sphere, box, lathe, tube, torus, lump, curve_tube
from common import leaf
import beasts as BS
import wild as WD

COAT = '#3a3843'
COAT_L = '#4c4a56'
GLOW = '#7dff5a'
VINE = '#6a4a28'
AMBER = '#ffb02a'


def sleek(name, r, parent, at, scale=(1, 1, 1), seed=1, color=COAT):
    """A smooth, muscular mass (a short coat: barely any noise)."""
    return lump(name, r, mat('matte', color), parent, at=at, scale=scale, seed=seed, rough=0.04, segs=22, rings=16, sub=1)


def swirl(name, parent, c, r, side, turns=1.4, phase=0.0, width=0.008):
    """A glowing spiral drawn on the flank at centre c (on the x = side surface)."""
    pts = []
    for i in range(14):
        t = i / 13
        a = phase + t * turns * 2 * math.pi
        rr = r * (1 - 0.7 * t)
        pts.append((c[0], c[1] + math.cos(a) * rr * 1.7 + (t - 0.5) * r * 0.8, c[2] + math.sin(a) * rr * 0.8))
    curve_tube(name, pts, width, mat('glow', GLOW), parent, taper=[0.4] + [1.0] * 12 + [0.3])


def panther():
    L, leg, g = 0.86, 0.32, 0.15
    B = BS.Beast(length=L, leg=leg, girth=g)
    cz = B.cz
    bm, nk, hd, tl = B['barrel'], B['neck'], B['head'], B['tail']
    # Body: deep shoulders, a slim waist, strong haunches.
    sleek('shoulders', g * 1.05, bm, (0, -L * 0.26, cz + g * 0.12), scale=(0.95, 1.1, 1.12), seed=1)
    sleek('waist', g * 0.78, bm, (0, L * 0.02, cz + g * 0.08), scale=(0.88, 1.9, 0.85), seed=2)
    sleek('haunch', g * 0.95, bm, (0, L * 0.3, cz + g * 0.12), scale=(0.95, 1.1, 1.0), seed=3)
    sleek('belly', g * 0.5, bm, (0, -L * 0.05, cz - g * 0.55), scale=(0.8, 2.2, 0.5), seed=4, color=COAT_L)
    # Neck and a round head, held level and forward.
    curve_tube('neck', [(0, -L * 0.33, cz + g * 0.35), (0, -L * 0.48, cz + g * 0.72), (0, -L * 0.6, cz + g * 0.95)], g * 0.55, mat('matte', COAT), nk, taper=[1.15, 1.0, 0.85])
    hy, hz = -L * 0.66, cz + g * 1.0
    sleek('skull', g * 0.55, hd, (0, hy, hz + g * 0.05), scale=(1.05, 1.0, 0.92), seed=5)
    for sx in (-1, 1):
        sleek(f'cheek{sx}', g * 0.28, hd, (sx * g * 0.27, hy - g * 0.25, hz - g * 0.12), scale=(1.0, 1.0, 0.9), seed=6 + (sx > 0))
    sleek('muzzle', g * 0.3, hd, (0, hy - g * 0.45, hz - g * 0.15), scale=(1.1, 0.9, 0.75), seed=8, color=COAT_L)
    sphere('nose', g * 0.07, mat('matte', '#141016'), hd, at=(0, hy - g * 0.7, hz - g * 0.08), scale=(1.3, 0.8, 0.7))
    box('mouth', (g * 0.22, g * 0.04, g * 0.03), mat('matte', '#141016'), hd, at=(0, hy - g * 0.66, hz - g * 0.3), bevel=0.005)
    for sx in (-1, 1):
        lathe(f'ear{sx}', [(g * 0.15, 0.0), (g * 0.1, g * 0.14), (0.0, g * 0.22)], mat('matte', COAT), hd, at=(sx * g * 0.3, hy + g * 0.12, hz + g * 0.42), rot=(-0.2, sx * 0.35, 0), scale=(1.0, 0.55, 1.0), segs=10, sub=1)
        sphere(f'eye{sx}', g * 0.085, mat('glow', AMBER), hd, at=(sx * g * 0.22, hy - g * 0.43, hz + g * 0.15), scale=(1.2, 0.6, 0.75))
        sphere(f'pupil{sx}', g * 0.035, mat('matte', '#0a0806'), hd, at=(sx * g * 0.22, hy - g * 0.47, hz + g * 0.15), scale=(0.5, 0.5, 1.4))
        box(f'brow{sx}', (g * 0.22, g * 0.1, g * 0.05), mat('matte', COAT), hd, at=(sx * g * 0.22, hy - g * 0.42, hz + g * 0.26), rot=(0.25, 0, -sx * 0.3), bevel=0.012, sub=1)
        for i in range(3):
            box(f'whisker{sx}{i}', (g * 0.55, 0.003, 0.003), mat('matte', '#d8d0c0'), hd, at=(sx * g * 0.4, hy - g * 0.6, hz - g * (0.15 + i * 0.05)), rot=(0, sx * (0.1 - i * 0.12), sx * 0.25))
        # Glowing vines over the brow, like the warrior's face markings.
        curve_tube(f'browVine{sx}', [(sx * g * 0.06, hy - g * 0.4, hz + g * 0.35), (sx * g * 0.25, hy - g * 0.2, hz + g * 0.45), (sx * g * 0.35, hy + g * 0.05, hz + g * 0.3)], 0.006, mat('glow', GLOW), hd, taper=[0.4, 1.0, 0.4])
    # Legs: muscled upper legs, thick forearms, big paws with pale claws.
    for k in ('FL', 'FR', 'HL', 'HR'):
        up, lo = B[f'leg.{k}'], B[f'lower.{k}']
        x = (1 if k in ('FL', 'HL') else -1) * g * 0.6
        y = (-1 if k[0] == 'F' else 1) * L * 0.34
        hind = k[0] == 'H'
        sleek(f'upper.{k}', g * (0.55 if hind else 0.48), up, (x, y + (0.0 if hind else 0.01), leg * 0.85), scale=(0.65, 1.1 if hind else 0.95, 1.4), seed=20 + ord(k[1]))
        if hind:
            curve_tube(f'shank.{k}', [(x, y, leg * 0.55), (x, y + 0.05, leg * 0.3), (x, y + 0.03, leg * 0.15), (x, y, 0.04)], g * 0.22, mat('matte', COAT), lo, taper=[1.2, 1.0, 0.85, 0.8])
        else:
            curve_tube(f'forearm.{k}', [(x, y, leg * 0.6), (x, y - 0.005, leg * 0.3), (x, y - 0.01, 0.04)], g * 0.24, mat('matte', COAT), lo, taper=[1.2, 1.0, 0.85])
        lump(f'paw.{k}', g * 0.26, mat('matte', COAT), lo, at=(x, y - 0.025, 0.035), scale=(1.0, 1.3, 0.55), seed=30 + ord(k[1]), rough=0.06)
        for i in range(4):
            lathe(f'claw.{k}{i}', [(g * 0.022, 0.0), (0.0, g * 0.08)], mat('matte', '#e8e0cc'), lo, at=(x + (i - 1.5) * g * 0.1, y - g * 0.32, 0.02), rot=(math.pi / 2 + 0.5, 0, 0), segs=5)
        # A glowing vine down each leg.
        curve_tube(f'legVine.{k}', [(x * 1.08, y, leg * 0.95), (x * 1.12, y - 0.02, leg * 0.6), (x * 1.06, y + 0.01, leg * 0.3)], 0.006, mat('glow', GLOW), up if hind else up, taper=[0.4, 1.0, 0.4])
    # The long tail, low and curling up at the tip.
    curve_tube('tail', [(0, L * 0.45, cz + g * 0.35), (0, L * 0.65, cz + g * 0.05), (0, L * 0.85, cz - g * 0.55), (0, L * 1.02, cz - g * 0.75), (0, L * 1.12, cz - g * 0.45), (0, L * 1.1, cz - g * 0.15)], g * 0.17, mat('matte', COAT), tl, taper=[1.2, 1.0, 0.9, 0.85, 0.8, 0.6])
    # Glowing swirls over the shoulders, flanks and haunches; leafy vines over the back.
    for sx in (-1, 1):
        s = sx * g * 1.0
        swirl(f'swirlShoulder{sx}', bm, (s, -L * 0.26, cz + g * 0.15), g * 0.5, sx, turns=0.9, phase=0.3)
        swirl(f'swirlFlank{sx}', bm, (sx * g * 0.8, L * 0.02, cz + g * 0.05), g * 0.38, sx, turns=0.8, phase=2.0)
        swirl(f'swirlHaunch{sx}', bm, (sx * g * 0.95, L * 0.3, cz + g * 0.15), g * 0.45, sx, turns=0.9, phase=4.0)
        curve_tube(f'vineStem{sx}', [(sx * g * 0.2, -L * 0.45, cz + g * 1.0), (sx * g * 0.7, -L * 0.3, cz + g * 0.9), (sx * g * 0.85, -L * 0.15, cz + g * 0.55), (sx * g * 0.5, L * 0.05, cz + g * 0.85), (sx * g * 0.3, L * 0.25, cz + g * 0.95)], 0.009, mat('matte', VINE), bm)
    for i in range(14):
        t = i / 13
        y = -L * 0.42 + t * L * 0.62
        sx = 1 if i % 2 else -1
        leaf(f'backLeaf{i}', bm, (sx * g * (0.25 + 0.2 * (i % 3) / 2), y, cz + g * (1.05 - 0.15 * t)), 0.06 + 0.02 * (1 - t), 0.13 + 0.04 * (1 - t), WD.LEAVES[i % 3], rot=(-1.25, 0, sx * (0.5 + 0.2 * (i % 3))))
    torus('collar', g * 0.6, 0.01, mat('team_dark'), nk, at=(0, -L * 0.5, cz + g * 0.72), rot=(1.15, 0, 0), segs=18, rsegs=4)
    B.animate(gait='bound', attack='bite')
    return B

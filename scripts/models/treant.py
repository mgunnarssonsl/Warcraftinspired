"""The Rootcrusher (sheet 03): a hulking walking tree. A twisted trunk hunched forward with a
stern face grown into the bark (glowing amber eyes under a heavy brow, a beaked nose), a
broad flat canopy of leaves with vines hanging from it, bone-pale horns on the shoulders,
long branch arms ending in huge blocky root fists that hang to the ground, root legs, moss,
and an ember glow in a hollow at the foot of the trunk."""
import math
from blib import mat, sphere, box, lathe, tube, extrude, torus, sheet, pivot, lump, curve_tube
from figure import Figure, HIP, KNEE, ANKLE, SHOULDER, ELBOW_DROP, WRIST_DROP, NECK, HEAD
from common import hand_at, arm_x, leaf, leaf_ring
import wild as WD

BARK = '#8a5a32'
BARK_D = '#5e3c22'
BARK_L = '#b07a46'
HORN = '#efe2c2'
AMBER = '#ffb02a'
MOSS = '#7aa83a'


def rootcrusher():
    F = Figure(bulk=1.9)
    b = F.bulk
    bark, bark_d, bark_l, moss = mat('matte', BARK), mat('matte', BARK_D), mat('matte', BARK_L), mat('matte', MOSS)
    hips, spine, ch, h = F['hips'], F['spine'], F['chest'], F['head']
    # Root legs, splaying into toes of root.
    for s, sx in (('R', -1), ('L', 1)):
        x = 0.085 * b * sx
        th, sh, ft = F[f'thigh.{s}'], F[f'shin.{s}'], F[f'foot.{s}']
        lump(f'rootThigh.{s}', 0.1, bark, th, at=(x, 0, (HIP + KNEE) / 2), scale=(1.0, 1.0, 1.6), seed=1 + (sx > 0), rough=0.12)
        curve_tube(f'rootShin.{s}', [(x, 0, KNEE + 0.02), (x + sx * 0.01, -0.01, (KNEE + ANKLE) / 2), (x + sx * 0.02, 0, ANKLE)], 0.08, bark_d, sh, taper=[0.9, 1.0, 1.25])
        for i in range(4):
            a = -0.9 + i * 0.6
            curve_tube(f'rootToe{i}.{s}', [(x, 0, 0.08), (x + math.sin(a) * 0.08, -math.cos(a) * 0.1, 0.04), (x + math.sin(a) * 0.16, -math.cos(a) * 0.2, 0.005)], 0.035, bark_d, ft, taper=[1.0, 0.75, 0.35])
    # The trunk: wide, twisted, hunched; bark ridges spiral up it.
    lathe('trunk', [(0.17, 0.0), (0.2, 0.08), (0.18, 0.2), (0.21, 0.32), (0.25, 0.44)], bark, spine, at=(0, 0, HIP - 0.06), scale=(1.15, 0.9, 1), segs=16, sub=1)
    lathe('upperTrunk', [(0.25, 0.0), (0.28, 0.1), (0.27, 0.2), (0.2, 0.3), (0.0, 0.34)], bark, ch, at=(0, 0, 0.82), scale=(1.15, 0.92, 1), segs=16, sub=1)
    for i in range(8):
        a = i * 2 * math.pi / 8
        pts = [(math.cos(a + t * 0.9) * (0.2 + 0.06 * t) * 1.15, math.sin(a + t * 0.9) * (0.2 + 0.06 * t) * 0.9, HIP - 0.04 + t * 0.6) for t in (0.0, 0.33, 0.66, 1.0)]
        curve_tube(f'ridge{i}', pts, 0.022, bark_d if i % 2 else bark_l, spine, taper=[0.6, 1.0, 1.0, 0.7])
    # The ember hollow at the foot of the trunk.
    lathe('hollow', [(0.0, 0.0), (0.07, 0.0), (0.06, 0.08), (0.0, 0.12)], mat('matte', '#2a1a0e'), hips, at=(0, -0.18, HIP - 0.06), scale=(1, 0.5, 1), segs=12, sub=1)
    lump('ember', 0.05, mat('glow', '#ff9a2a'), hips, at=(0, -0.19, HIP - 0.03), scale=(1, 0.6, 1.2), seed=5, rough=0.2)
    # The face, grown into the upper trunk: heavy brow, glowing eyes, beaked nose, a scowl.
    fz = SHOULDER + 0.05
    for sx in (-1, 1):
        sphere(f'socket{sx}', 0.05, mat('matte', '#2a1a0e'), ch, at=(sx * 0.08, -0.235, fz), scale=(1.2, 0.5, 0.75))
        sphere(f'eye{sx}', 0.024, mat('glow', AMBER), ch, at=(sx * 0.08, -0.255, fz), scale=(1.3, 0.6, 0.7))
        box(f'brow{sx}', (0.14, 0.08, 0.055), bark_l, ch, at=(sx * 0.075, -0.255, fz + 0.04), rot=(0.2, 0, -sx * 0.45), bevel=0.02, sub=1)
        curve_tube(f'cheekRidge{sx}', [(sx * 0.15, -0.21, fz + 0.02), (sx * 0.12, -0.25, fz - 0.06), (sx * 0.05, -0.26, fz - 0.12)], 0.022, bark_l, ch, taper=[0.6, 1.0, 0.6])
    lathe('nose', [(0.04, 0.0), (0.03, 0.06), (0.0, 0.12)], bark_l, ch, at=(0, -0.255, fz - 0.01), rot=(math.pi / 2 + 0.6, 0, 0), scale=(1.0, 0.7, 1.0), segs=8, sub=1)
    box('mouth', (0.12, 0.03, 0.025), mat('matte', '#1e140c'), ch, at=(0, -0.25, fz - 0.11), rot=(0, 0, 0), bevel=0.01)
    # A broad, flat canopy: layered leaf clumps spreading wide, vines hanging from the rim.
    cz = SHOULDER + 0.32
    for i in range(10):
        a = 2 * math.pi * i / 10
        r = 0.36 if i % 2 else 0.3
        lump(f'canopy{i}', 0.16, mat('matte', WD.LEAVES[i % 3]), ch, at=(math.cos(a) * r * 1.3, math.sin(a) * r + 0.04, cz + (0.02 if i % 2 else -0.03)), scale=(1.3, 1.2, 0.65), seed=30 + i, rough=0.35)
    for i in range(5):
        a = 2 * math.pi * i / 5 + 0.3
        lump(f'canopyTop{i}', 0.16, mat('matte', WD.LEAVES[(i + 1) % 3]), ch, at=(math.cos(a) * 0.16, math.sin(a) * 0.14 + 0.04, cz + 0.1), scale=(1.3, 1.2, 0.7), seed=45 + i, rough=0.35)
    lump('canopyCrown', 0.18, mat('matte', WD.LEAF_L), ch, at=(0, 0.04, cz + 0.18), scale=(1.3, 1.2, 0.6), seed=50, rough=0.18)
    for i in range(14):
        a = 2 * math.pi * i / 14
        leaf(f'rimLeaf{i}', ch, (math.cos(a) * 0.55, math.sin(a) * 0.44 + 0.04, cz - 0.02), 0.09, 0.16, WD.LEAVES[i % 3], rot=(1.2, 0, a - math.pi / 2))
    for i in range(6):
        a = 2 * math.pi * i / 6 + 0.25
        x, y = math.cos(a) * 0.46, math.sin(a) * 0.36 + 0.04
        curve_tube(f'hangVine{i}', [(x, y, cz - 0.05), (x * 1.02, y * 1.02, cz - 0.15), (x * 0.98, y, cz - 0.27 - (i % 3) * 0.05)], 0.01, mat('matte', '#5a8a2a'), ch, taper=[1.0, 0.8, 0.5])
        leaf(f'vineLeaf{i}', ch, (x * 0.98, y, cz - 0.3 - (i % 3) * 0.05), 0.04, 0.07, WD.LEAF, rot=(0.3, 0, a))
    for i in range(12):
        a = 2 * math.pi * i / 12 + 0.2
        r = 0.18 + 0.14 * (i % 2)
        leaf(f'topLeaf{i}', ch, (math.cos(a) * r * 1.3, math.sin(a) * r + 0.04, cz + 0.17 - 0.05 * (i % 2)), 0.09, 0.15, WD.LEAVES[(i + 2) % 3], rot=(0.5, 0, a - math.pi / 2))
    # Branches poking out of the canopy.
    for sx in (-1, 1):
        curve_tube(f'branch{sx}', [(sx * 0.12, 0.0, cz - 0.12), (sx * 0.3, 0.0, cz + 0.02), (sx * 0.48, -0.04, cz + 0.06)], 0.035, bark, ch, taper=[1.0, 0.7, 0.35])
    # Shoulders with moss and pale horns; long branch arms; huge blocky root fists.
    for s in 'RL':
        sx = -1 if s == 'R' else 1
        x = arm_x(F, s) * 1.15
        ua, fa, hd = F[f'upperarm.{s}'], F[f'forearm.{s}'], F[f'hand.{s}']
        lump(f'shoulder.{s}', 0.14, bark, ua, at=(x, 0, SHOULDER + 0.01), scale=(1.1, 1.0, 0.9), seed=60 + (sx > 0), rough=0.12)
        lump(f'shoulderMoss.{s}', 0.11, moss, ua, at=(x, 0.01, SHOULDER + 0.09), scale=(1.3, 1.1, 0.4), seed=62 + (sx > 0), rough=0.3)
        for i, (dy, ln) in enumerate(((-0.04, 0.24), (0.06, 0.19))):
            lathe(f'horn.{s}{i}', [(0.035, 0.0), (0.022, ln * 0.5), (0.0, ln)], mat('matte', HORN), ua, at=(x + sx * 0.04, dy, SHOULDER + 0.08), rot=(0.2 * (1 if dy > 0 else -1), sx * 0.45, 0), segs=8, sub=1)
        curve_tube(f'branchArm.{s}', [(x, 0, SHOULDER - 0.04), (x * 1.04, -0.01, SHOULDER - ELBOW_DROP * 0.5), (x * 1.06, 0, SHOULDER - ELBOW_DROP)], 0.075, bark, ua, taper=[1.0, 0.85, 0.8])
        lump(f'elbow.{s}', 0.075, bark_d, fa, at=(x * 1.06, 0, SHOULDER - ELBOW_DROP), seed=64 + (sx > 0), rough=0.15)
        hx, hy, hz = hand_at(F, s)
        hx *= 1.15
        curve_tube(f'branchFore.{s}', [(x * 1.06, 0, SHOULDER - ELBOW_DROP), (hx, hy, hz + 0.02)], 0.07, bark_d, fa, taper=[0.85, 1.1])
        # The fist: a big root block with knuckle knots, bound with moss, and bone spikes.
        fz = hz - 0.12
        box(f'fist.{s}', (0.26, 0.28, 0.3), bark_l, hd, at=(hx, hy - 0.01, fz), rot=(0, 0, sx * 0.1), bevel=0.04, sub=1)
        for k in range(3):
            box(f'knuckle.{s}{k}', (0.06, 0.07, 0.09), bark, hd, at=(hx + (k - 1) * 0.065, hy - 0.11, fz - 0.06), bevel=0.02, sub=1)
        for k in range(2):
            curve_tube(f'fistRoot.{s}{k}', [(hx - 0.1, hy - 0.05 + k * 0.1, fz + 0.12), (hx, hy - 0.06 + k * 0.1, fz + 0.14), (hx + 0.1, hy - 0.05 + k * 0.1, fz + 0.12)], 0.018, bark_d, hd)
        lump(f'fistMoss.{s}', 0.08, moss, hd, at=(hx, hy + 0.02, fz + 0.12), scale=(1.4, 1.2, 0.4), seed=66 + (sx > 0), rough=0.3)
        for k in range(2):
            lathe(f'fistSpike.{s}{k}', [(0.04, 0.0), (0.0, 0.17)], mat('matte', HORN), hd, at=(hx + sx * 0.08, hy - 0.04 + k * 0.08, fz + 0.1), rot=(0, sx * 0.5, 0), segs=6)
    # Team: a woven band of vines around the waist with a team sash knot.
    torus('band', 0.21 * 1.1, 0.025, mat('team'), spine, at=(0, 0, 0.5), scale=(1.1, 0.9, 1), segs=20, rsegs=5)
    leaf_ring('bandLeaves', spine, (0, 0, 0.5), 0.24, 8, 0.06, 0.12, WD.LEAVES, tilt=2.4)
    F.animate(attack='slash')
    return F
